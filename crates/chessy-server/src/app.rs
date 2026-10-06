//! Shares the [`Hub`] across connections and runs its timers.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::mpsc::UnboundedSender;

use crate::hub::{Hub, HubConfig, Timer};
use crate::protocol::{ClientMsg, PlayerId, ServerMsg};
use crate::store::{Store, StoreError};

pub struct App {
    hub: Mutex<Hub>,
    store: Store,
}

impl App {
    pub fn new(store: Store, config: HubConfig) -> Arc<Self> {
        Arc::new(App {
            hub: Mutex::new(Hub::new(store.clone(), config)),
            store,
        })
    }

    /// The database, for the REST API.
    pub fn store(&self) -> &Store {
        &self.store
    }

    /// A player's account changed outside the WebSocket (e.g. a guest
    /// registered); refreshes what a connected client sees.
    pub fn account_changed(self: &Arc<Self>, player: &str) {
        self.run(|hub| hub.push_friends(player));
    }

    /// Runs `f` on the hub, then schedules any timers it asked for.
    fn run<R>(self: &Arc<Self>, f: impl FnOnce(&mut Hub) -> R) -> R {
        let (result, timers) = {
            let mut hub = self.hub.lock().unwrap_or_else(|e| e.into_inner());
            let result = f(&mut hub);
            (result, hub.take_timers())
        };
        self.schedule(timers);
        result
    }

    fn schedule(self: &Arc<Self>, timers: Vec<(Duration, Timer)>) {
        for (delay, timer) in timers {
            let app = Arc::clone(self);
            tokio::spawn(async move {
                tokio::time::sleep(delay).await;
                app.fire(timer);
            });
        }
    }

    // Not routed through the generic `run`: spawning from a generic function
    // that the spawned task calls again would recurse at the type level.
    fn fire(self: &Arc<Self>, timer: Timer) {
        let timers = {
            let mut hub = self.hub.lock().unwrap_or_else(|e| e.into_inner());
            hub.on_timer(timer);
            hub.take_timers()
        };
        self.schedule(timers);
    }

    pub fn connect(
        self: &Arc<Self>,
        token: Option<String>,
        tx: UnboundedSender<ServerMsg>,
    ) -> Result<(PlayerId, u64), StoreError> {
        self.run(|hub| hub.connect(token, tx))
    }

    pub fn disconnect(self: &Arc<Self>, player: &str, conn_id: u64) {
        self.run(|hub| hub.disconnect(player, conn_id));
    }

    /// Handles one message from an established connection. Messages from a
    /// connection that has since been replaced are ignored.
    pub fn handle(self: &Arc<Self>, player: &str, conn_id: u64, msg: ClientMsg) {
        self.run(|hub| {
            if !hub.is_current(player, conn_id) {
                return;
            }
            match msg {
                ClientMsg::Hello { .. } => {}
                ClientMsg::QueueJoin { ranked } => hub.queue_join(player, ranked),
                ClientMsg::CreateRoom => hub.create_room(player),
                ClientMsg::JoinRoom { code } => hub.join_room(player, &code),
                ClientMsg::LeaveLobby => hub.leave_lobby(player),
                ClientMsg::SelectDeck { skills } => hub.select_deck(player, skills),
                ClientMsg::Action { action } => hub.action(player, action),
                ClientMsg::Resign => hub.resign(player),
                ClientMsg::RewardChoice { choice } => hub.reward_choice(player, choice),
                ClientMsg::OfferDraw => hub.offer_draw(player),
                ClientMsg::RespondDraw { accept } => hub.respond_draw(player, accept),
                ClientMsg::Chat { text } => hub.chat(player, &text),
                ClientMsg::RematchRequest => hub.rematch_request(player),
                ClientMsg::RematchRespond { accept } => hub.rematch_respond(player, accept),
                ClientMsg::FriendRequest { username } => hub.friend_request(player, &username),
                ClientMsg::FriendRespond { username, accept } => {
                    hub.friend_respond(player, &username, accept)
                }
                ClientMsg::FriendRemove { username } => hub.friend_remove(player, &username),
                ClientMsg::FriendsList => hub.friends_list(player),
                ClientMsg::UserSearch { query } => hub.user_search(player, &query),
                ClientMsg::Challenge { username } => hub.challenge(player, &username),
                ClientMsg::ChallengeRespond { username, accept } => {
                    hub.challenge_respond(player, &username, accept)
                }
                ClientMsg::ChallengeCancel => hub.challenge_cancel(player),
            }
        });
    }
}
