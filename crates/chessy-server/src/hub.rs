//! All live state: connections, lobby, running games and pending rewards.
//!
//! The hub is synchronous and never awaits, so it lives behind one mutex
//! (see [`crate::app::App`]). Anything that must happen later is queued as a
//! [`Timer`] for the caller to schedule.

use std::collections::{HashMap, VecDeque};
use std::time::Duration;

use chessy_engine::{Action, Color, Game, Outcome, SkillId, SkillKind, SkillTarget};
use rand::seq::{IndexedRandom, SliceRandom};
use tokio::sync::mpsc::UnboundedSender;

use crate::protocol::*;
use crate::store::{Store, StoreError};

pub const MAX_DECK: usize = 7;
pub const MAX_PICKS: usize = 3;

#[derive(Clone, Copy, Debug)]
pub struct HubConfig {
    /// How long a disconnected player has to come back before forfeiting.
    pub reconnect_grace: Duration,
    /// How long players have to choose their skills.
    pub deck_select_time: Duration,
}

impl Default for HubConfig {
    fn default() -> Self {
        HubConfig {
            reconnect_grace: Duration::from_secs(60),
            deck_select_time: Duration::from_secs(60),
        }
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
}

struct Conn {
    id: u64,
    tx: UnboundedSender<ServerMsg>,
}

enum Phase {
    DeckSelect { picks: [Option<Vec<SkillId>>; 2] },
    Playing { game: Box<Game> },
}

struct Session {
    /// Indexed by `Color::index()`.
    players: [PlayerId; 2],
    phase: Phase,
    connected: [bool; 2],
    /// Bumped on every disconnect so stale forfeit timers can be ignored.
    epoch: [u64; 2],
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

pub struct Hub {
    store: Store,
    config: HubConfig,
    conns: HashMap<PlayerId, Conn>,
    next_conn: u64,
    next_game: u64,
    queue: VecDeque<PlayerId>,
    rooms: HashMap<String, PlayerId>,
    games: HashMap<String, Session>,
    player_game: HashMap<PlayerId, String>,
    rewards: HashMap<PlayerId, PendingReward>,
    timers: Vec<(Duration, Timer)>,
}

fn room_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::rng();
    (0..5)
        .map(|_| *ALPHABET.choose(&mut rng).expect("alphabet is not empty") as char)
        .collect()
}

impl Hub {
    pub fn new(store: Store, config: HubConfig) -> Self {
        Hub {
            store,
            config,
            conns: HashMap::new(),
            next_conn: 0,
            next_game: 0,
            queue: VecDeque::new(),
            rooms: HashMap::new(),
            games: HashMap::new(),
            player_game: HashMap::new(),
            rewards: HashMap::new(),
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

    // ---- connections -----------------------------------------------------

    /// Registers a connection, replacing any previous one for the same player.
    /// Returns the player id and the connection id used to ignore stale sockets.
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
        let pending_reward = match self.rewards.get(&id) {
            Some(r) => self.offer_for(&id, &r.loser).ok(),
            None => None,
        };
        self.send(
            &id,
            ServerMsg::Welcome {
                player_id: id.clone(),
                token,
                deck: self.deck_of(&id)?,
                pending_reward,
            },
        );
        self.resume(&id);
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
        self.leave_lobby_silently(player);
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
                    Phase::Playing { .. } => self.end_by_resignation(&game_id, color),
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
        }
    }

    // ---- lobby -----------------------------------------------------------

    fn lobby_status(&self, player: &str) -> LobbyStatus {
        if self.queue.iter().any(|p| p == player) {
            return LobbyStatus::Queued;
        }
        match self.rooms.iter().find(|(_, p)| *p == player) {
            Some((code, _)) => LobbyStatus::RoomWaiting { code: code.clone() },
            None => LobbyStatus::Idle,
        }
    }

    fn leave_lobby_silently(&mut self, player: &str) {
        self.queue.retain(|p| p != player);
        self.rooms.retain(|_, p| p != player);
    }

    /// Checks the player may start looking for a game; clears any unclaimed
    /// reward (starting a new game forfeits it) and any previous lobby spot.
    fn enter_lobby(&mut self, player: &str) -> bool {
        if self.player_game.contains_key(player) {
            self.fail(player, "already_in_game", "finish your current game first");
            return false;
        }
        self.rewards.remove(player);
        self.leave_lobby_silently(player);
        true
    }

    pub fn queue_join(&mut self, player: &str) {
        if !self.enter_lobby(player) {
            return;
        }
        match self.queue.pop_front() {
            Some(other) => self.create_game(other, player.to_string()),
            None => {
                self.queue.push_back(player.to_string());
                self.send(
                    player,
                    ServerMsg::Lobby {
                        status: LobbyStatus::Queued,
                    },
                );
            }
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
                self.rewards.remove(player);
                self.leave_lobby_silently(player);
                self.create_game(host, player.to_string());
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

    fn create_game(&mut self, a: PlayerId, b: PlayerId) {
        self.next_game += 1;
        let game_id = format!(
            "g{}-{:06x}",
            self.next_game,
            rand::random::<u32>() & 0xff_ffff
        );
        let (white, black) = if rand::random_bool(0.5) {
            (a, b)
        } else {
            (b, a)
        };
        let connected = [
            self.conns.contains_key(&white),
            self.conns.contains_key(&black),
        ];
        let session = Session {
            players: [white.clone(), black.clone()],
            phase: Phase::DeckSelect {
                picks: [None, None],
            },
            connected,
            epoch: [0, 0],
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
        for player in [white, black] {
            self.send_session_to(&game_id, &player);
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
        let events = match game.apply(action) {
            Ok(events) => events,
            Err(_) => return self.fail(player, "illegal_action", "that action is not allowed"),
        };
        let outcome = game.outcome();
        self.broadcast_state(&game_id, events);
        if outcome.is_over() {
            self.finish_game(&game_id, outcome);
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
            Some(Phase::Playing { .. }) => self.end_by_resignation(&game_id, color),
            _ => self.cancel_session(&game_id, "a player left before the game started"),
        }
    }

    fn end_by_resignation(&mut self, game_id: &str, color: Color) {
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
        self.finish_game(game_id, outcome);
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

    fn finish_game(&mut self, game_id: &str, outcome: Outcome) {
        let Some(session) = self.games.remove(game_id) else {
            return;
        };
        for player in &session.players {
            self.player_game.remove(player);
        }
        let [white, black] = &session.players;
        if let Err(e) = self.store.record_game(game_id, white, black, &outcome) {
            tracing::error!("could not record game {game_id}: {e}");
        }
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
            self.send(player, ServerMsg::GameOver { outcome, reward });
            self.send(
                player,
                ServerMsg::Lobby {
                    status: LobbyStatus::Idle,
                },
            );
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
