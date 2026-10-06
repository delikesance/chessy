//! End-to-end over real WebSockets against a server bound to an ephemeral port.

use chessy_server::hub::HubConfig;
use chessy_server::store::Store;
use chessy_server::{router, App};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn spawn_server() -> String {
    spawn_server_with_store().await.0
}

async fn spawn_server_with_store() -> (String, Store) {
    let store = Store::open(":memory:").unwrap();
    let app = App::new(store.clone(), HubConfig::default());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router(app)).await.unwrap() });
    (format!("ws://{addr}/ws"), store)
}

async fn send(ws: &mut Socket, v: Value) {
    ws.send(Message::Text(v.to_string().into())).await.unwrap();
}

/// Reads until a message of the given type shows up.
async fn expect(ws: &mut Socket, ty: &str) -> Value {
    let wait = async {
        loop {
            let Message::Text(t) = ws.next().await.expect("socket open").unwrap() else {
                continue;
            };
            let v: Value = serde_json::from_str(&t).unwrap();
            if v["type"] == ty {
                return v;
            }
        }
    };
    tokio::time::timeout(std::time::Duration::from_secs(5), wait)
        .await
        .unwrap_or_else(|_| panic!("timed out waiting for `{ty}`"))
}

#[tokio::test]
async fn hello_is_required_first_and_garbage_is_rejected() {
    let url = spawn_server().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    send(&mut ws, json!({"type": "queue_join"})).await;
    assert_eq!(expect(&mut ws, "error").await["code"], "hello_first");
    ws.send(Message::Text("{not json".into())).await.unwrap();
    assert_eq!(expect(&mut ws, "error").await["code"], "bad_message");
    send(&mut ws, json!({"type": "hello"})).await;
    let welcome = expect(&mut ws, "welcome").await;
    assert_eq!(welcome["deck"].as_array().unwrap().len(), 3);
    assert!(welcome["token"].as_str().unwrap().len() >= 16);
}

#[tokio::test]
async fn two_sockets_play_a_game_and_one_resigns() {
    let url = spawn_server().await;
    let (mut a, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let (mut b, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    send(&mut a, json!({"type": "hello"})).await;
    send(&mut b, json!({"type": "hello"})).await;
    expect(&mut a, "welcome").await;
    expect(&mut b, "welcome").await;

    send(&mut a, json!({"type": "queue_join"})).await;
    send(&mut b, json!({"type": "queue_join"})).await;
    let da = expect(&mut a, "deck_select").await;
    let db = expect(&mut b, "deck_select").await;
    assert_ne!(da["you"], db["you"]);

    send(&mut a, json!({"type": "select_deck", "skills": []})).await;
    send(&mut b, json!({"type": "select_deck", "skills": []})).await;
    let sa = expect(&mut a, "state").await;
    let sb = expect(&mut b, "state").await;
    let (white, black) = if sa["you"] == "white" {
        (&mut a, &mut b)
    } else {
        (&mut b, &mut a)
    };
    let _ = sb;

    // e2-e4 is squares 12 -> 28.
    send(
        white,
        json!({"type": "action", "action": {"type": "move", "from": 12, "to": 28}}),
    )
    .await;
    let after = expect(black, "state").await;
    assert_eq!(after["board"][28]["kind"], "pawn");
    assert_eq!(after["moves"].as_array().unwrap().len(), 20);
    assert_eq!(after["events"][0]["type"], "moved");

    send(black, json!({"type": "resign"})).await;
    let over = expect(white, "game_over").await;
    assert_eq!(
        over["outcome"],
        json!({"type": "resignation", "winner": "white"})
    );
    assert!(over["reward"].is_object());
}

#[tokio::test]
async fn accounts_use_session_tokens_and_guests_are_kept_out_of_social_features() {
    let (url, store) = spawn_server_with_store().await;
    let (_, token) = store.register("Wanda", "unused-hash", None).unwrap();

    let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    send(&mut ws, json!({"type": "hello", "token": token})).await;
    let welcome = expect(&mut ws, "welcome").await;
    assert_eq!(welcome["token"], token.as_str());
    assert_eq!(welcome["account"]["username"], "Wanda");
    assert_eq!(welcome["account"]["guest"], false);
    let friends = expect(&mut ws, "friends").await;
    assert_eq!(friends["friends"], json!([]));
    send(&mut ws, json!({"type": "user_search", "query": "wa"})).await;
    let found = expect(&mut ws, "user_results").await;
    assert_eq!(found["users"][0]["relation"], "self");
    send(&mut ws, json!({"type": "queue_join"})).await;
    let lobby = expect(&mut ws, "lobby").await;
    assert_eq!(lobby["status"], json!({"type": "queued", "ranked": true}));

    let (mut guest, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    send(&mut guest, json!({"type": "hello"})).await;
    let welcome = expect(&mut guest, "welcome").await;
    assert_eq!(welcome["account"]["guest"], true);
    send(
        &mut guest,
        json!({"type": "friend_request", "username": "Wanda"}),
    )
    .await;
    assert_eq!(
        expect(&mut guest, "error").await["code"],
        "account_required"
    );
    send(&mut guest, json!({"type": "queue_join", "ranked": true})).await;
    let lobby = expect(&mut guest, "lobby").await;
    assert_eq!(lobby["status"]["ranked"], false);
}
