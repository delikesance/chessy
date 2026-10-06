//! One task per WebSocket: parses client messages and forwards server messages.

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;

use crate::app::App;
use crate::protocol::{ClientMsg, ServerMsg};

const MAX_MESSAGE_BYTES: usize = 16 * 1024;

pub async fn ws_handler(ws: WebSocketUpgrade, State(app): State<Arc<App>>) -> Response {
    ws.max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| connection(socket, app))
}

async fn connection(socket: WebSocket, app: Arc<App>) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMsg>();
    let mut identity: Option<(String, u64)> = None;

    loop {
        tokio::select! {
            outgoing = rx.recv() => {
                // The hub dropped our sender: this connection was replaced.
                let Some(msg) = outgoing else { break };
                let text = serde_json::to_string(&msg).expect("server messages serialize");
                if sink.send(Message::Text(text.into())).await.is_err() {
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
