//! One task per WebSocket: parses client messages and forwards server messages.
//!
//! Each socket is guarded on its own, before the hub lock is taken: frames
//! are rate limited (a flood closes the socket), the messages waiting to be
//! written are capped, and a write that stalls closes the socket. The hub
//! applies a second, per-player quota weighted by message cost.

use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;

use crate::app::App;
use crate::limits::{RateLimiter, Verdict};
use crate::protocol::{ClientMsg, ServerMsg};

const MAX_MESSAGE_BYTES: usize = 16 * 1024;
/// Frames tolerated before `hello`, which must come first.
const MAX_PRE_HELLO_FRAMES: u32 = 5;

pub async fn ws_handler(ws: WebSocketUpgrade, State(app): State<Arc<App>>) -> Response {
    ws.max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| connection(socket, app))
}

async fn connection(socket: WebSocket, app: Arc<App>) {
    let config = *app.config();
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMsg>();
    let mut identity: Option<(String, u64)> = None;
    let mut frames = RateLimiter::new(config.msg_rate, config.msg_burst, Instant::now());
    let mut pre_hello = 0u32;

    loop {
        tokio::select! {
            outgoing = rx.recv() => {
                // The hub dropped our sender: this connection was replaced.
                let Some(msg) = outgoing else { break };
                let text = serde_json::to_string(&msg).expect("server messages serialize");
                let write = tokio::time::timeout(
                    config.write_timeout,
                    sink.send(Message::Text(text.into())),
                );
                if !matches!(write.await, Ok(Ok(()))) {
                    break; // the client is gone or not reading
                }
                if msg.closes_connection() {
                    let _ = sink.send(Message::Close(None)).await;
                    break;
                }
                if rx.len() > config.outbound_queue_cap {
                    tracing::warn!("closing a slow connection ({} queued)", rx.len());
                    break;
                }
            }
            incoming = stream.next() => {
                let Some(Ok(frame)) = incoming else { break };
                let text = match frame {
                    Message::Text(t) => t,
                    Message::Close(_) => break,
                    _ => continue,
                };
                match frames.take(1, Instant::now(), config.flood_disconnect_after) {
                    Verdict::Allow => {}
                    Verdict::Drop { first } => {
                        if first {
                            let _ = tx.send(ServerMsg::error(
                                "rate_limited",
                                "you are sending messages too fast",
                            ));
                        }
                        continue;
                    }
                    Verdict::Disconnect => {
                        let _ = tx.send(ServerMsg::error(
                            "flooded",
                            "too many messages: disconnected",
                        ));
                        // The error is flushed (and the socket closed) by the arm above.
                        continue;
                    }
                }
                let msg: ClientMsg = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(_) => {
                        let _ = tx.send(ServerMsg::error("bad_message", "could not parse message"));
                        continue;
                    }
                };
                match (&identity, msg) {
                    (None, ClientMsg::Hello { token }) => match app.connect(token, tx.clone()) {
                        Ok(id) => identity = Some(id),
                        Err(e) => {
                            tracing::error!("hello failed: {e}");
                            let _ = tx.send(ServerMsg::error("internal", "internal error"));
                            break;
                        }
                    },
                    (None, _) => {
                        pre_hello += 1;
                        if pre_hello > MAX_PRE_HELLO_FRAMES {
                            break;
                        }
                        let _ = tx.send(ServerMsg::error("hello_first", "send hello first"));
                    }
                    (Some((player, conn_id)), msg) => app.handle(player, *conn_id, msg),
                }
            }
        }
    }

    if let Some((player, conn_id)) = identity {
        app.disconnect(&player, conn_id);
    }
}
