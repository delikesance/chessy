//! All live state: connections, lobby, running games and pending rewards.
//!
//! The hub is synchronous and never awaits, so it lives behind one mutex
//! (see [`crate::app::App`]). Anything that must happen later is queued as a
//! [`Timer`] for the caller to schedule. Friends, challenges, chat and
//! rematches live in the `social` submodule.

mod social;

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use chessy_engine::{Action, Color, Game, Outcome, SkillId, SkillKind, SkillTarget};
use rand::seq::{IndexedRandom, SliceRandom};
use tokio::sync::mpsc::UnboundedSender;

use crate::protocol::*;
use crate::store::{reason_of, GameRecord, Store, StoreError};

pub const MAX_DECK: usize = 7;
pub const MAX_PICKS: usize = 3;
/// A game shorter than this many plies is never rated.
pub const MIN_RATED_PLIES: u32 = 4;

#[derive(Clone, Copy, Debug)]
pub struct HubConfig {
    /// How long a disconnected player has to come back before forfeiting.
    pub reconnect_grace: Duration,
    /// How long players have to choose their skills.
    pub deck_select_time: Duration,
    /// Time each player starts with.
    pub clock_initial: Duration,
    /// Time added after each action (move or skill).
    pub clock_increment: Duration,
    /// How often the ranked queue is re-examined while someone waits.
    pub queue_sweep_interval: Duration,
    /// Ranked matching: Elo gap allowed at once, how much it widens per
    /// second of waiting, and its ceiling.
    pub ranked_range_base: i32,
    pub ranked_range_per_second: f64,
    pub ranked_range_max: i32,
    /// How long a friend challenge stays open.
    pub challenge_ttl: Duration,
    /// Minimum time between two chat messages from one player.
    pub chat_interval: Duration,
}

impl Default for HubConfig {
    fn default() -> Self {
        HubConfig {
            reconnect_grace: Duration::from_secs(60),
            deck_select_time: Duration::from_secs(60),
            clock_initial: Duration::from_secs(600),
            clock_increment: Duration::from_secs(3),
            queue_sweep_interval: Duration::from_secs(3),
            ranked_range_base: 100,
            ranked_range_per_second: 25.0,
            ranked_range_max: 800,
            challenge_ttl: Duration::from_secs(60),
            chat_interval: Duration::from_secs(1),
        }
    }
}

impl HubConfig {
    /// Largest Elo gap accepted between two ranked players when the older of
    /// them has waited `wait`.
    pub fn ranked_range(&self, wait: Duration) -> i32 {
        let widened =
            f64::from(self.ranked_range_base) + self.ranked_range_per_second * wait.as_secs_f64();
        widened.min(f64::from(self.ranked_range_max)) as i32
    }
}

#[derive(Debug)]
pub enum Timer {
    Forfeit {
        game_id: String,
        color: Color,
        epoch: u64,
    },
    DeckTimeout {
        game_id: String,
    },
    /// `color` runs out of time unless the game has moved past `ply`.
    Flag {
        game_id: String,
        color: Color,
        ply: u32,
    },
    QueueSweep,
    ChallengeExpire {
        challenger: PlayerId,
        target: PlayerId,
        seq: u64,
    },
}

struct Conn {
    id: u64,
    tx: UnboundedSender<ServerMsg>,
}

enum Phase {
    DeckSelect { picks: [Option<Vec<SkillId>>; 2] },
    Playing { game: Box<Game> },
}

/// Each player's remaining time; only the side to move is running.
struct Clock {
    remaining: [Duration; 2],
    since: Instant,
    running: Option<Color>,
}

impl Clock {
    fn left(&self, color: Color, now: Instant) -> Duration {
        let left = self.remaining[color.index()];
        if self.running == Some(color) {
            left.saturating_sub(now.saturating_duration_since(self.since))
        } else {
            left
        }
    }

    fn expired(&self, color: Color, now: Instant) -> bool {
        self.running == Some(color) && self.left(color, now).is_zero()
    }

    /// `mover` has acted: charge their time, add the increment, hand over.
    fn press(&mut self, mover: Color, now: Instant, increment: Duration, over: bool) {
        self.remaining[mover.index()] = self.left(mover, now) + increment;
        self.since = now;
        self.running = if over { None } else { Some(mover.opposite()) };
    }

    fn view(&self, now: Instant) -> ClockView {
        ClockView {
            white_ms: self.left(Color::White, now).as_millis() as u64,
            black_ms: self.left(Color::Black, now).as_millis() as u64,
            running: self.running,
        }
    }
}

struct Session {
    /// Indexed by `Color::index()`.
    players: [PlayerId; 2],
    phase: Phase,
    connected: [bool; 2],
    /// Bumped on every disconnect so stale forfeit timers can be ignored.
    epoch: [u64; 2],
    /// Came from the ranked queue between two accounts; whether Elo really
    /// moves also depends on how long the game lasts.
    rated: bool,
    /// Who plays each colour, as shown to the other side.
    info: [OpponentInfo; 2],
    started_unix: i64,
    clock: Option<Clock>,
    draw_offer: Option<Color>,
    /// The ply at which each colour last offered a draw (one offer per ply).
    last_offer_ply: [Option<u32>; 2],
}

impl Session {
    fn color_of(&self, player: &str) -> Option<Color> {
        Color::BOTH
            .into_iter()
            .find(|c| self.players[c.index()] == player)
    }
}

struct PendingReward {
    loser: PlayerId,
}

struct QueueEntry {
    player: PlayerId,
    elo: i32,
    since: Instant,
}

pub struct Hub {
    store: Store,
    config: HubConfig,
    conns: HashMap<PlayerId, Conn>,
    next_conn: u64,
    next_game: u64,
    /// Oldest first.
    ranked_queue: Vec<QueueEntry>,
    casual_queue: VecDeque<PlayerId>,
    sweep_pending: bool,
    rooms: HashMap<String, PlayerId>,
    games: HashMap<String, Session>,
    player_game: HashMap<PlayerId, String>,
    rewards: HashMap<PlayerId, PendingReward>,
    /// Open challenges by challenger.
    challenges: HashMap<PlayerId, social::Challenge>,
    next_challenge: u64,
    /// Players who just finished a game and may still ask for a rematch.
    rematches: HashMap<PlayerId, social::Rematch>,
    last_chat: HashMap<PlayerId, Instant>,
    timers: Vec<(Duration, Timer)>,
}

fn room_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::rng();
    (0..5)
        .map(|_| *ALPHABET.choose(&mut rng).expect("alphabet is not empty") as char)
        .collect()
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Hub {
    pub fn new(store: Store, config: HubConfig) -> Self {
        Hub {
            store,
            config,
            conns: HashMap::new(),
            next_conn: 0,
            next_game: 0,
            ranked_queue: Vec::new(),
            casual_queue: VecDeque::new(),
            sweep_pending: false,
            rooms: HashMap::new(),
            games: HashMap::new(),
            player_game: HashMap::new(),
            rewards: HashMap::new(),
            challenges: HashMap::new(),
            next_challenge: 0,
            rematches: HashMap::new(),
            last_chat: HashMap::new(),
            timers: Vec::new(),
        }
    }

    pub fn take_timers(&mut self) -> Vec<(Duration, Timer)> {
        std::mem::take(&mut self.timers)
    }

    fn send(&self, player: &str, msg: ServerMsg) {
        if let Some(conn) = self.conns.get(player) {
            let _ = conn.tx.send(msg);
        }
    }

    fn fail(&self, player: &str, code: &str, message: &str) {
        self.send(player, ServerMsg::error(code, message));
    }

    fn internal_error(&self, player: &str, err: StoreError) {
        tracing::error!("store error: {err}");
        self.fail(player, "internal", "internal error");
    }

    fn deck_of(&self, player: &str) -> Result<Vec<SkillId>, StoreError> {
        self.store.deck(player)
    }

    /// What the opponent sees of `player`.
    fn opponent_info(&self, player: &str) -> OpponentInfo {
        match self.store.player_row(player) {
            Ok(Some(row)) if row.username.is_some() => OpponentInfo {
                username: row.username,
                elo: Some(row.elo),
                guest: false,
            },
            _ => OpponentInfo {
                username: None,
                elo: None,
                guest: true,
            },
        }
    }

    // ---- connections -----------------------------------------------------

    /// Registers a connection, replacing any previous one for the same player.
    /// `token` is a session token. Returns the player id and the connection
    /// id used to ignore stale sockets.
    pub fn connect(
        &mut self,
        token: Option<String>,
        tx: UnboundedSender<ServerMsg>,
    ) -> Result<(PlayerId, u64), StoreError> {
        let known = match &token {
            Some(t) => self.store.player_by_token(t)?,
            None => None,
        };
        let (id, token) = match (known, token) {
            (Some(id), Some(token)) => (id, token),
            _ => self.store.create_player()?,
        };
        self.next_conn += 1;
        let conn_id = self.next_conn;
        if let Some(old) = self.conns.insert(id.clone(), Conn { id: conn_id, tx }) {
            let _ = old.tx.send(ServerMsg::error(
                "replaced",
                "this account connected from somewhere else",
            ));
        }
        let _ = self.store.touch_last_seen(&id);
        let pending_reward = match self.rewards.get(&id) {
            Some(r) => self.offer_for(&id, &r.loser).ok(),
            None => None,
        };
        let account = self
            .store
            .me(&id)?
            .ok_or(StoreError::Invalid("player vanished"))?;
        self.send(
            &id,
            ServerMsg::Welcome {
                player_id: id.clone(),
                token,
                deck: self.deck_of(&id)?,
                pending_reward,
                account,
            },
        );
        self.push_friends(&id);
        self.resume(&id);
        self.notify_presence(&id);
        Ok((id, conn_id))
    }

    pub fn is_current(&self, player: &str, conn_id: u64) -> bool {
        self.conns.get(player).is_some_and(|c| c.id == conn_id)
    }

    /// Brings a (re)connected player up to date with wherever they were.
    fn resume(&mut self, player: &str) {
        let Some(game_id) = self.player_game.get(player).cloned() else {
            self.send(
                player,
                ServerMsg::Lobby {
                    status: self.lobby_status(player),
                },
            );
            return;
        };
        let Some(session) = self.games.get_mut(&game_id) else {
            return;
        };
        let color = session
            .color_of(player)
            .expect("player is in their session");
        session.connected[color.index()] = true;
        let opponent = session.players[color.opposite().index()].clone();
        self.send(&opponent, ServerMsg::OpponentStatus { connected: true });
        self.send_session_to(&game_id, player);
    }

    /// Sends a player whatever picture of their game they need right now.
    fn send_session_to(&self, game_id: &str, player: &str) {
        let Some(session) = self.games.get(game_id) else {
            return;
        };
        let Some(color) = session.color_of(player) else {
            return;
        };
        match &session.phase {
            Phase::DeckSelect { picks } => {
                let Ok(deck) = self.deck_of(player) else {
                    return;
                };
                self.send(
                    player,
                    ServerMsg::DeckSelect {
                        game_id: game_id.to_string(),
                        you: color,
                        deck,
                        max_picks: MAX_PICKS,
                        seconds: self.config.deck_select_time.as_secs(),
                        submitted: picks[color.index()].is_some(),
                        opponent: session.info[color.opposite().index()].clone(),
                        rated: session.rated,
                    },
                );
            }
            Phase::Playing { game } => {
                let view = state_view(game_id, session, game, color, Vec::new());
                self.send(player, ServerMsg::State(Box::new(view)));
            }
        }
    }

    pub fn disconnect(&mut self, player: &str, conn_id: u64) {
        if !self.is_current(player, conn_id) {
            return;
        }
        self.conns.remove(player);
        self.last_chat.remove(player);
        self.leave_lobby_silently(player);
        self.drop_challenges(player);
        self.drop_rematch(player, true);
        let _ = self.store.touch_last_seen(player);
        self.disconnect_from_game(player);
        self.notify_presence(player);
    }

    fn disconnect_from_game(&mut self, player: &str) {
        let Some(game_id) = self.player_game.get(player).cloned() else {
            return;
        };
        let Some(session) = self.games.get_mut(&game_id) else {
            return;
        };
        let color = session
            .color_of(player)
            .expect("player is in their session");
        session.connected[color.index()] = false;
        session.epoch[color.index()] += 1;
        let epoch = session.epoch[color.index()];
        let opponent = session.players[color.opposite().index()].clone();
        self.send(&opponent, ServerMsg::OpponentStatus { connected: false });
        self.timers.push((
            self.config.reconnect_grace,
            Timer::Forfeit {
                game_id,
                color,
                epoch,
            },
        ));
    }

    pub fn on_timer(&mut self, timer: Timer) {
        match timer {
            Timer::Forfeit {
                game_id,
                color,
                epoch,
            } => {
                let Some(session) = self.games.get(&game_id) else {
                    return;
                };
                if session.connected[color.index()] || session.epoch[color.index()] != epoch {
                    return;
                }
                match session.phase {
                    Phase::Playing { .. } => self.end_by_resignation(&game_id, color, "disconnect"),
                    Phase::DeckSelect { .. } => self.cancel_session(&game_id, "opponent left"),
                }
            }
            Timer::DeckTimeout { game_id } => {
                let Some(Session {
                    phase: Phase::DeckSelect { picks },
                    players,
                    ..
                }) = self.games.get(&game_id)
                else {
                    return;
                };
                let missing: Vec<Color> = Color::BOTH
                    .into_iter()
                    .filter(|c| picks[c.index()].is_none())
                    .collect();
                let players = players.clone();
                for color in missing {
                    let auto = self.auto_pick(&players[color.index()]);
                    self.set_picks(&game_id, color, auto);
                }
                self.start_if_ready(&game_id);
            }
            Timer::Flag {
                game_id,
                color,
                ply,
            } => {
                let Some(Session {
                    phase: Phase::Playing { game },
                    ..
                }) = self.games.get(&game_id)
                else {
                    return;
                };
                if game.outcome().is_over() || game.pos.ply != ply || game.side_to_move() != color {
                    return;
                }
                self.end_by_timeout(&game_id, color);
            }
            Timer::QueueSweep => {
                self.sweep_pending = false;
                self.match_ranked();
                self.ensure_sweep();
            }
            Timer::ChallengeExpire {
                challenger,
                target,
                seq,
            } => self.expire_challenge(&challenger, &target, seq),
        }
    }

    // ---- lobby -----------------------------------------------------------

    fn lobby_status(&self, player: &str) -> LobbyStatus {
        if self.ranked_queue.iter().any(|e| e.player == player) {
            return LobbyStatus::Queued { ranked: true };
        }
        if self.casual_queue.iter().any(|p| p == player) {
            return LobbyStatus::Queued { ranked: false };
        }
        match self.rooms.iter().find(|(_, p)| *p == player) {
            Some((code, _)) => LobbyStatus::RoomWaiting { code: code.clone() },
            None => LobbyStatus::Idle,
        }
    }

    fn leave_lobby_silently(&mut self, player: &str) {
        self.ranked_queue.retain(|e| e.player != player);
        self.casual_queue.retain(|p| p != player);
        self.rooms.retain(|_, p| p != player);
    }

    /// Checks the player may start looking for a game; clears any unclaimed
    /// reward (starting a new game forfeits it), any rematch they were
    /// weighing and any previous lobby spot.
    fn enter_lobby(&mut self, player: &str) -> bool {
        if self.player_game.contains_key(player) {
            self.fail(player, "already_in_game", "finish your current game first");
            return false;
        }
        self.rewards.remove(player);
        self.drop_rematch(player, true);
        self.leave_lobby_silently(player);
        true
    }

    pub fn queue_join(&mut self, player: &str, ranked: Option<bool>) {
        if !self.enter_lobby(player) {
            return;
        }
        let account = match self.store.player_row(player) {
            Ok(Some(row)) if row.username.is_some() => Some(row),
            Ok(_) => None,
            Err(e) => return self.internal_error(player, e),
        };
        match account {
            Some(row) if ranked.unwrap_or(true) => {
                self.ranked_queue.push(QueueEntry {
                    player: player.to_string(),
                    elo: row.elo,
                    since: Instant::now(),
                });
                self.match_ranked();
                self.ensure_sweep();
            }
            _ => match self.casual_queue.pop_front() {
                Some(other) => self.create_game(other, player.to_string(), false),
                None => self.casual_queue.push_back(player.to_string()),
            },
        }
        if self.player_game.contains_key(player) {
            return; // matched straight away: deck_select is on its way
        }
        self.send(
            player,
            ServerMsg::Lobby {
                status: self.lobby_status(player),
            },
        );
    }

    /// Repeatedly pairs the two waiting ranked players closest in Elo among
    /// those whose gap is within the range the older one's wait has earned
    /// (ties go to whoever has waited longest).
    fn match_ranked(&mut self) {
        let now = Instant::now();
        loop {
            let mut best: Option<(usize, usize, i32)> = None;
            for (i, a) in self.ranked_queue.iter().enumerate() {
                for (j, b) in self.ranked_queue.iter().enumerate().skip(i + 1) {
                    let gap = (a.elo - b.elo).abs();
                    let wait = now.saturating_duration_since(a.since.min(b.since));
                    if gap <= self.config.ranked_range(wait) && best.is_none_or(|(_, _, g)| gap < g)
                    {
                        best = Some((i, j, gap));
                    }
                }
            }
            let Some((i, j, _)) = best else { return };
            let second = self.ranked_queue.remove(j);
            let first = self.ranked_queue.remove(i);
            self.create_game(first.player, second.player, true);
        }
    }

    /// Keeps a sweep timer running while anyone waits in the ranked queue.
    fn ensure_sweep(&mut self) {
        if !self.sweep_pending && !self.ranked_queue.is_empty() {
            self.sweep_pending = true;
            self.timers
                .push((self.config.queue_sweep_interval, Timer::QueueSweep));
        }
    }

    pub fn create_room(&mut self, player: &str) {
        if !self.enter_lobby(player) {
            return;
        }
        let mut code = room_code();
        while self.rooms.contains_key(&code) {
            code = room_code();
        }
        self.rooms.insert(code.clone(), player.to_string());
        self.send(
            player,
            ServerMsg::Lobby {
                status: LobbyStatus::RoomWaiting { code },
            },
        );
    }

    pub fn join_room(&mut self, player: &str, code: &str) {
        if self.player_game.contains_key(player) {
            self.fail(player, "already_in_game", "finish your current game first");
            return;
        }
        let code = code.trim().to_ascii_uppercase();
        match self.rooms.get(&code) {
            None => self.fail(player, "no_such_room", "that room does not exist"),
            Some(host) if host == player => {
                self.fail(player, "own_room", "you cannot join your own room")
            }
            Some(_) => {
                let host = self.rooms.remove(&code).expect("room checked above");
                self.leave_lobby_silently(player);
                self.create_game(host, player.to_string(), false);
            }
        }
    }

    pub fn leave_lobby(&mut self, player: &str) {
        self.leave_lobby_silently(player);
        self.send(
            player,
            ServerMsg::Lobby {
                status: LobbyStatus::Idle,
            },
        );
    }

    // ---- game setup ------------------------------------------------------

    /// Starts a game between two players with random colours.
    fn create_game(&mut self, a: PlayerId, b: PlayerId, rated: bool) {
        let (white, black) = if rand::random_bool(0.5) {
            (a, b)
        } else {
            (b, a)
        };
        self.start_session(white, black, rated);
    }

    /// Opens deck selection for two players, clearing whatever else they
    /// were doing: lobby spots, challenges, rematches and unclaimed rewards.
    fn start_session(&mut self, white: PlayerId, black: PlayerId, rated: bool) {
        let pair = [white.clone(), black.clone()];
        for player in &pair {
            self.rewards.remove(player);
            self.leave_lobby_silently(player);
            self.drop_challenges(player);
            if let Some(r) = self.rematches.get(player) {
                // Rematching each other is not a departure.
                let silent = pair.contains(&r.opponent);
                self.drop_rematch(player, !silent);
            }
        }
        self.next_game += 1;
        let game_id = format!(
            "g{}-{:06x}",
            self.next_game,
            rand::random::<u32>() & 0xff_ffff
        );
        let connected = [
            self.conns.contains_key(&white),
            self.conns.contains_key(&black),
        ];
        let session = Session {
            info: [self.opponent_info(&white), self.opponent_info(&black)],
            players: [white.clone(), black.clone()],
            phase: Phase::DeckSelect {
                picks: [None, None],
            },
            connected,
            epoch: [0, 0],
            rated,
            started_unix: now_unix(),
            clock: None,
            draw_offer: None,
            last_offer_ply: [None, None],
        };
        self.player_game.insert(white.clone(), game_id.clone());
        self.player_game.insert(black.clone(), game_id.clone());
        self.games.insert(game_id.clone(), session);
        self.timers.push((
            self.config.deck_select_time,
            Timer::DeckTimeout {
                game_id: game_id.clone(),
            },
        ));
        for player in &pair {
            self.send_session_to(&game_id, player);
        }
        for player in &pair {
            self.notify_presence(player);
        }
    }

    pub fn select_deck(&mut self, player: &str, skills: Vec<SkillId>) {
        let Some(game_id) = self.player_game.get(player).cloned() else {
            return self.fail(player, "not_in_game", "you are not in a game");
        };
        let Some(session) = self.games.get(&game_id) else {
            return;
        };
        let Phase::DeckSelect { picks } = &session.phase else {
            return self.fail(player, "wrong_phase", "the game has already started");
        };
        let color = session
            .color_of(player)
            .expect("player is in their session");
        if picks[color.index()].is_some() {
            return self.fail(player, "already_selected", "you already chose your skills");
        }
        let deck = match self.deck_of(player) {
            Ok(d) => d,
            Err(e) => return self.internal_error(player, e),
        };
        let mut seen = Vec::new();
        let valid = skills.len() <= MAX_PICKS
            && skills.iter().all(|s| {
                let fresh = !seen.contains(s);
                seen.push(*s);
                fresh && deck.contains(s) && s.kind() == SkillKind::Classic
            });
        if !valid {
            return self.fail(
                player,
                "invalid_deck",
                "pick up to three distinct classic skills from your deck",
            );
        }
        let mut loadout = skills;
        loadout.extend(deck.iter().filter(|s| s.kind() == SkillKind::Unique));
        self.set_picks(&game_id, color, loadout);
        self.start_if_ready(&game_id);
    }

    fn set_picks(&mut self, game_id: &str, color: Color, loadout: Vec<SkillId>) {
        if let Some(Session {
            phase: Phase::DeckSelect { picks },
            ..
        }) = self.games.get_mut(game_id)
        {
            picks[color.index()] = Some(loadout);
        }
    }

    /// Up to three random classic skills plus all unique ones.
    fn auto_pick(&self, player: &str) -> Vec<SkillId> {
        let deck = self.deck_of(player).unwrap_or_default();
        let mut classic: Vec<SkillId> = deck
            .iter()
            .copied()
            .filter(|s| s.kind() == SkillKind::Classic)
            .collect();
        classic.shuffle(&mut rand::rng());
        classic.truncate(MAX_PICKS);
        classic.extend(deck.iter().filter(|s| s.kind() == SkillKind::Unique));
        classic
    }

    fn start_if_ready(&mut self, game_id: &str) {
        let Some(session) = self.games.get_mut(game_id) else {
            return;
        };
        let Phase::DeckSelect { picks } = &session.phase else {
            return;
        };
        let (Some(white), Some(black)) = (&picks[0], &picks[1]) else {
            // Tell the player who picked that we are waiting for the other.
            let players = session.players.clone();
            for player in players {
                self.send_session_to(game_id, &player);
            }
            return;
        };
        let game = Game::new(white, black);
        session.phase = Phase::Playing {
            game: Box::new(game),
        };
        session.clock = Some(Clock {
            remaining: [self.config.clock_initial; 2],
            since: Instant::now(),
            running: Some(Color::White),
        });
        self.timers.push((
            self.config.clock_initial,
            Timer::Flag {
                game_id: game_id.to_string(),
                color: Color::White,
                ply: 0,
            },
        ));
        self.broadcast_state(game_id, Vec::new());
    }

    fn cancel_session(&mut self, game_id: &str, reason: &str) {
        let Some(session) = self.games.remove(game_id) else {
            return;
        };
        for player in &session.players {
            self.player_game.remove(player);
            self.send(
                player,
                ServerMsg::GameCancelled {
                    reason: reason.to_string(),
                },
            );
            self.send(
                player,
                ServerMsg::Lobby {
                    status: LobbyStatus::Idle,
                },
            );
        }
        for player in &session.players {
            self.notify_presence(player);
        }
    }

    // ---- playing ---------------------------------------------------------

    pub fn action(&mut self, player: &str, action: Action) {
        let Some(game_id) = self.player_game.get(player).cloned() else {
            return self.fail(player, "not_in_game", "you are not in a game");
        };
        let Some(session) = self.games.get_mut(&game_id) else {
            return;
        };
        let color = session
            .color_of(player)
            .expect("player is in their session");
        let Phase::Playing { game } = &mut session.phase else {
            return self.fail(player, "wrong_phase", "the game has not started yet");
        };
        if game.side_to_move() != color {
            return self.fail(player, "not_your_turn", "it is not your turn");
        }
        let now = Instant::now();
        // The flag timer may be a moment behind: the clock has the last word.
        if session
            .clock
            .as_ref()
            .is_some_and(|c| c.expired(color, now))
        {
            return self.end_by_timeout(&game_id, color);
        }
        let events = match game.apply(action) {
            Ok(events) => events,
            Err(_) => return self.fail(player, "illegal_action", "that action is not allowed"),
        };
        let outcome = game.outcome();
        let ply = game.pos.ply;
        session.draw_offer = None;
        let mut next_flag = None;
        if let Some(clock) = &mut session.clock {
            clock.press(color, now, self.config.clock_increment, outcome.is_over());
            next_flag = Some(clock.remaining[color.opposite().index()]);
        }
        if let (Some(delay), false) = (next_flag, outcome.is_over()) {
            self.timers.push((
                delay,
                Timer::Flag {
                    game_id: game_id.clone(),
                    color: color.opposite(),
                    ply,
                },
            ));
        }
        self.broadcast_state(&game_id, events);
        if outcome.is_over() {
            self.finish_game(&game_id, outcome, reason_of(&outcome));
        }
    }

    pub fn resign(&mut self, player: &str) {
        let Some(game_id) = self.player_game.get(player).cloned() else {
            return self.fail(player, "not_in_game", "you are not in a game");
        };
        let Some(color) = self.games.get(&game_id).and_then(|s| s.color_of(player)) else {
            return;
        };
        match self.games.get(&game_id).map(|s| &s.phase) {
            Some(Phase::Playing { .. }) => self.end_by_resignation(&game_id, color, "resignation"),
            _ => self.cancel_session(&game_id, "a player left before the game started"),
        }
    }

    fn end_by_resignation(&mut self, game_id: &str, color: Color, reason: &str) {
        let Some(Session {
            phase: Phase::Playing { game },
            ..
        }) = self.games.get_mut(game_id)
        else {
            return;
        };
        game.resign(color);
        let outcome = game.outcome();
        self.broadcast_state(game_id, Vec::new());
        self.finish_game(game_id, outcome, reason);
    }

    /// `color` ran out of time.
    fn end_by_timeout(&mut self, game_id: &str, color: Color) {
        let Some(Session {
            phase: Phase::Playing { game },
            clock,
            ..
        }) = self.games.get_mut(game_id)
        else {
            return;
        };
        game.flag(color);
        let outcome = game.outcome();
        if let Some(clock) = clock {
            clock.remaining[color.index()] = Duration::ZERO;
            clock.running = None;
        }
        self.broadcast_state(game_id, Vec::new());
        self.finish_game(game_id, outcome, "timeout");
    }

    pub fn offer_draw(&mut self, player: &str) {
        let Some((game_id, color)) = self.playing_as(player) else {
            return;
        };
        let Some(session) = self.games.get_mut(&game_id) else {
            return;
        };
        let Phase::Playing { game } = &session.phase else {
            return;
        };
        let ply = game.pos.ply;
        match session.draw_offer {
            // They already offered: offering back is accepting.
            Some(by) if by != color => return self.respond_draw(player, true),
            Some(_) => return self.fail(player, "draw_pending", "your offer is already open"),
            None => {}
        }
        if session.last_offer_ply[color.index()] == Some(ply) {
            return self.fail(
                player,
                "draw_already_offered",
                "wait for a move before offering again",
            );
        }
        session.draw_offer = Some(color);
        session.last_offer_ply[color.index()] = Some(ply);
        let opponent = session.players[color.opposite().index()].clone();
        self.send(&opponent, ServerMsg::DrawOffered {});
    }

    pub fn respond_draw(&mut self, player: &str, accept: bool) {
        let Some((game_id, color)) = self.playing_as(player) else {
            return;
        };
        let Some(session) = self.games.get_mut(&game_id) else {
            return;
        };
        if session.draw_offer != Some(color.opposite()) {
            return self.fail(player, "no_draw_offer", "there is no draw offer to answer");
        }
        session.draw_offer = None;
        if !accept {
            let offerer = session.players[color.opposite().index()].clone();
            return self.send(&offerer, ServerMsg::DrawDeclined {});
        }
        let Phase::Playing { game } = &mut session.phase else {
            return;
        };
        game.agree_draw();
        let outcome = game.outcome();
        if let Some(clock) = &mut session.clock {
            clock.running = None;
        }
        self.broadcast_state(&game_id, Vec::new());
        self.finish_game(&game_id, outcome, "agreed_draw");
    }

    /// The player's running game and colour, or an error to them.
    fn playing_as(&self, player: &str) -> Option<(String, Color)> {
        let Some(game_id) = self.player_game.get(player).cloned() else {
            self.fail(player, "not_in_game", "you are not in a game");
            return None;
        };
        let session = self.games.get(&game_id)?;
        if !matches!(session.phase, Phase::Playing { .. }) {
            self.fail(player, "wrong_phase", "the game has not started yet");
            return None;
        }
        let color = session.color_of(player)?;
        Some((game_id, color))
    }

    fn broadcast_state(&self, game_id: &str, events: Vec<chessy_engine::Event>) {
        let Some(session) = self.games.get(game_id) else {
            return;
        };
        let Phase::Playing { game } = &session.phase else {
            return;
        };
        for color in Color::BOTH {
            let view = state_view(game_id, session, game, color, events.clone());
            self.send(
                &session.players[color.index()],
                ServerMsg::State(Box::new(view)),
            );
        }
    }

    // ---- game end and rewards -------------------------------------------

    fn finish_game(&mut self, game_id: &str, outcome: Outcome, reason: &str) {
        let Some(session) = self.games.remove(game_id) else {
            return;
        };
        for player in &session.players {
            self.player_game.remove(player);
        }
        let plies = match &session.phase {
            Phase::Playing { game } => game.pos.ply,
            Phase::DeckSelect { .. } => 0,
        };
        let [white, black] = &session.players;
        let record = GameRecord {
            id: game_id,
            white,
            black,
            outcome: &outcome,
            reason,
            plies,
            rated: session.rated && plies >= MIN_RATED_PLIES,
            started_unix: session.started_unix,
        };
        let change = match self.store.record_game(&record) {
            Ok(change) => change,
            Err(e) => {
                tracing::error!("could not record game {game_id}: {e}");
                None
            }
        };
        let winner = outcome.winner();
        for color in Color::BOTH {
            let player = &session.players[color.index()];
            let reward = if Some(color) == winner {
                let loser = &session.players[color.opposite().index()];
                self.rewards.insert(
                    player.clone(),
                    PendingReward {
                        loser: loser.clone(),
                    },
                );
                self.offer_for(player, loser).ok()
            } else {
                None
            };
            let elo = change.map(|c| match color {
                Color::White => EloView {
                    you_before: c.white_before,
                    you_after: c.white_after,
                    opp_before: c.black_before,
                    opp_after: c.black_after,
                },
                Color::Black => EloView {
                    you_before: c.black_before,
                    you_after: c.black_after,
                    opp_before: c.white_before,
                    opp_after: c.white_after,
                },
            });
            self.send(
                player,
                ServerMsg::GameOver {
                    outcome,
                    reward,
                    rated: change.is_some(),
                    elo,
                    reason: reason.to_string(),
                },
            );
            self.send(
                player,
                ServerMsg::Lobby {
                    status: LobbyStatus::Idle,
                },
            );
        }
        self.offer_rematch(&session.players, session.rated);
        for player in &session.players {
            self.notify_presence(player);
            // Ratings changed: refresh what friends see.
            self.push_friends(player);
        }
    }

    fn offer_for(&self, winner: &str, loser: &str) -> Result<RewardOffer, StoreError> {
        let deck = self.deck_of(winner)?;
        let steal_options = self
            .deck_of(loser)?
            .into_iter()
            .filter(|s| !deck.contains(s))
            .collect();
        Ok(RewardOffer {
            deck_full: deck.len() >= MAX_DECK,
            deck,
            steal_options,
        })
    }

    pub fn reward_choice(&mut self, player: &str, choice: RewardChoice) {
        let Some(pending) = self.rewards.remove(player) else {
            return self.fail(player, "no_reward", "you have no reward to claim");
        };
        match self.resolve_reward(player, &pending.loser, choice) {
            Ok(()) => {}
            Err(msg) => {
                // Let the player try again with a corrected choice.
                self.rewards.insert(player.to_string(), pending);
                self.fail(player, "invalid_reward", msg);
            }
        }
    }

    fn resolve_reward(
        &mut self,
        winner: &str,
        loser: &str,
        choice: RewardChoice,
    ) -> Result<(), &'static str> {
        let db = |_: StoreError| "internal error";
        let winner_deck = self.deck_of(winner).map_err(db)?;
        let loser_deck = self.deck_of(loser).map_err(db)?;

        let (gain, loser_loses, replace) = match choice {
            RewardChoice::Skip => {
                self.send(
                    winner,
                    ServerMsg::DeckUpdate {
                        deck: winner_deck,
                        gained: None,
                        lost: None,
                    },
                );
                return Ok(());
            }
            RewardChoice::Steal { skill, replace } => {
                if !loser_deck.contains(&skill) {
                    return Err("your opponent does not have that skill");
                }
                if winner_deck.contains(&skill) {
                    return Err("you already have that skill");
                }
                (Some(skill), Some(skill), replace)
            }
            RewardChoice::Random { replace } => {
                let mut rng = rand::rng();
                let pool: Vec<SkillId> = SkillId::ALL
                    .into_iter()
                    .filter(|s| !winner_deck.contains(s))
                    .filter(|s| {
                        // A unique skill is only up for grabs when nobody owns it.
                        s.kind() == SkillKind::Classic
                            || self.store.unique_owner(*s).ok().flatten().is_none()
                    })
                    .collect();
                let gain = pool.choose(&mut rng).copied();
                (gain, loser_deck.choose(&mut rng).copied(), replace)
            }
        };

        let winner_drops = if gain.is_some() && winner_deck.len() >= MAX_DECK {
            match replace {
                Some(r) if winner_deck.contains(&r) && Some(r) != gain => Some(r),
                _ => return Err("your deck is full: choose a skill to replace"),
            }
        } else {
            None
        };

        self.store
            .apply_reward(winner, loser, gain, loser_loses, winner_drops)
            .map_err(|_| "could not apply that reward")?;
        let _ = self.store.refill_if_empty(loser);

        let winner_after = self.deck_of(winner).map_err(db)?;
        self.send(
            winner,
            ServerMsg::DeckUpdate {
                deck: winner_after,
                gained: gain,
                lost: winner_drops,
            },
        );
        if let Ok(loser_after) = self.deck_of(loser) {
            self.send(
                loser,
                ServerMsg::DeckUpdate {
                    deck: loser_after,
                    gained: None,
                    lost: loser_loses,
                },
            );
        }
        Ok(())
    }
}

fn state_view(
    game_id: &str,
    session: &Session,
    game: &Game,
    you: Color,
    events: Vec<chessy_engine::Event>,
) -> StateView {
    let mut moves = Vec::new();
    let mut skill_options: Vec<SkillOptions> = Vec::new();
    if game.side_to_move() == you {
        for action in game.legal_actions() {
            match action {
                Action::Move { from, to, promo } => {
                    moves.push(chessy_engine::Move { from, to, promo })
                }
                Action::Skill { skill, target } => push_target(&mut skill_options, skill, target),
            }
        }
    }
    let theirs = game.loadout(you.opposite());
    StateView {
        game_id: game_id.to_string(),
        you,
        ply: game.pos.ply,
        to_move: game.side_to_move(),
        in_check: game.pos.in_check(game.side_to_move()),
        board: game.pos.board.to_vec(),
        moves,
        skill_options,
        my_skills: game.loadout(you).slots.clone(),
        opponent_skills: OpponentSkills {
            total: theirs.slots.len(),
            used: theirs
                .slots
                .iter()
                .filter(|s| s.used)
                .map(|s| s.skill)
                .collect(),
        },
        effects: game.pos.effects.clone(),
        outcome: game.outcome(),
        events,
        opponent_connected: session.connected[you.opposite().index()],
        clock: session
            .clock
            .as_ref()
            .map(|c| c.view(Instant::now()))
            .unwrap_or(ClockView {
                white_ms: 0,
                black_ms: 0,
                running: None,
            }),
        rated: session.rated,
        opponent: session.info[you.opposite().index()].clone(),
        draw_offer: match session.draw_offer {
            None => DrawOffer::None,
            Some(by) if by == you => DrawOffer::You,
            Some(_) => DrawOffer::Them,
        },
        ply_count: game.pos.ply,
    }
}

fn push_target(options: &mut Vec<SkillOptions>, skill: SkillId, target: SkillTarget) {
    match options.iter_mut().find(|o| o.skill == skill) {
        Some(o) => o.targets.push(target),
        None => options.push(SkillOptions {
            skill,
            targets: vec![target],
        }),
    }
}
