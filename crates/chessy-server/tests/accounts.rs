//! REST: registration, login, sessions, leaderboard and profiles, plus the
//! database migration from the pre-account schema.

mod common;

use axum::http::StatusCode;
use chessy_server::hub::HubConfig;
use chessy_server::store::Store;
use chessy_server::App;
use common::*;
use serde_json::json;

fn api() -> (Api, std::sync::Arc<App>, Store) {
    let (app, store) = new_app(HubConfig::default());
    (Api::new(&app), app, store)
}

#[tokio::test]
async fn registering_creates_an_account_and_a_session() {
    let (api, app, _) = api();
    let (status, v) = api
        .post(
            "/api/auth/register",
            json!({"username": "Alice_1", "password": "correct horse"}),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{v}");
    let me = &v["player"];
    assert_eq!(me["username"], "Alice_1");
    assert_eq!(me["guest"], false);
    assert_eq!(me["elo"], 1200);
    assert_eq!(me["rank"], 1);
    assert_eq!(me["games"], 0);
    let token = v["token"].as_str().unwrap();

    let (status, same) = api.get("/api/me", Some(token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(&same, me);

    // The session token is what the WebSocket `hello` takes.
    let c = Client::connect(&app, Some(token.to_string()));
    assert_eq!(c.welcome["player_id"], me["player_id"]);
    assert_eq!(c.welcome["account"]["username"], "Alice_1");
    assert_eq!(c.welcome["deck"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn registration_is_validated() {
    let (api, _, _) = api();
    for name in [
        "ab",
        "has space",
        "wayyyyyyyyyyyyyy_too_long",
        "caf\u{e9}_",
        "",
    ] {
        let (status, v) = api
            .post(
                "/api/auth/register",
                json!({"username": name, "password": "correct horse"}),
            )
            .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{name}");
        assert_eq!(v["error"], "invalid_username");
    }
    for pass in ["short", "1234567", &"x".repeat(129)] {
        let (status, v) = api
            .post(
                "/api/auth/register",
                json!({"username": "bob", "password": pass}),
            )
            .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(v["error"], "weak_password");
    }
    let (status, v) = api
        .post("/api/auth/register", json!({"username": "bob"}))
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(v["error"], "bad_request");
    // Boundaries are fine.
    api.register("abc").await;
    let (status, _) = api
        .post(
            "/api/auth/register",
            json!({"username": "sixteen_chars_ok", "password": "x".repeat(128)}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn usernames_are_unique_ignoring_case() {
    let (api, _, _) = api();
    api.register("Alice").await;
    let (status, v) = api
        .post(
            "/api/auth/register",
            json!({"username": "aLiCe", "password": "another pass"}),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(v["error"], "username_taken");
}

#[tokio::test]
async fn oversized_bodies_are_refused() {
    let (api, _, _) = api();
    let (status, v) = api
        .post(
            "/api/auth/register",
            json!({"username": "bob", "password": "x".repeat(10_000)}),
        )
        .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(v["error"], "payload_too_large");
}

#[tokio::test]
async fn a_guest_is_promoted_keeping_id_and_deck() {
    let (api, app, store) = api();
    let guest = Client::connect(&app, None);
    assert_eq!(guest.welcome["account"]["guest"], true);
    assert!(guest.welcome["account"]["rank"].is_null());
    let deck = store.deck(&guest.id).unwrap();

    let (status, v) = api
        .post(
            "/api/auth/register",
            json!({"username": "promoted", "password": "correct horse", "guest_token": guest.token}),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["player"]["player_id"], guest.id.as_str());
    assert_eq!(v["player"]["guest"], false);
    assert_eq!(store.deck(&guest.id).unwrap(), deck);
    // The old session keeps working and now belongs to the account.
    assert_eq!(
        store.player_by_token(&guest.token).unwrap().as_deref(),
        Some(guest.id.as_str())
    );

    // A guest token is spent once: reusing it does not take over the account.
    let (status, v2) = api
        .post(
            "/api/auth/register",
            json!({"username": "second_try", "password": "correct horse", "guest_token": guest.token}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_ne!(v2["player"]["player_id"], v["player"]["player_id"]);

    // An unknown guest token just makes a fresh account.
    let (status, v3) = api
        .post(
            "/api/auth/register",
            json!({"username": "third_try", "password": "correct horse", "guest_token": "nope"}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v3["player"]["guest"], false);
}

#[tokio::test]
async fn a_failed_registration_leaves_the_guest_alone() {
    let (api, app, _) = api();
    api.register("taken").await;
    let guest = Client::connect(&app, None);
    let (status, _) = api
        .post(
            "/api/auth/register",
            json!({"username": "TAKEN", "password": "correct horse", "guest_token": guest.token}),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (_, me) = api.get("/api/me", Some(&guest.token)).await;
    assert_eq!(me["guest"], true);
}

#[tokio::test]
async fn login_logout_and_bad_credentials() {
    let (api, _, _) = api();
    let first = api.register("Carol").await;

    let (status, v) = api
        .post(
            "/api/auth/login",
            json!({"username": "carol", "password": "correct horse"}),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{v}");
    let second = v["token"].as_str().unwrap().to_string();
    assert_ne!(second, first, "a login opens a new session");
    assert_eq!(v["player"]["username"], "Carol");

    let wrong_password = api
        .post(
            "/api/auth/login",
            json!({"username": "Carol", "password": "wrong password"}),
        )
        .await;
    let unknown_user = api
        .post(
            "/api/auth/login",
            json!({"username": "nobody", "password": "correct horse"}),
        )
        .await;
    assert_eq!(wrong_password.0, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong_password, unknown_user, "same answer either way");
    assert_eq!(wrong_password.1["error"], "bad_credentials");

    let (status, _) = api
        .call("POST", "/api/auth/logout", Some(&second), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        api.get("/api/me", Some(&second)).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        api.get("/api/me", Some(&first)).await.0,
        StatusCode::OK,
        "other sessions survive"
    );
    assert_eq!(api.get("/api/me", None).await.0, StatusCode::UNAUTHORIZED);
    let (status, v) = api
        .call("POST", "/api/auth/logout", Some("bogus"), None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(v["error"], "unauthorized");
}

#[tokio::test]
async fn passwords_are_stored_as_argon2id() {
    let db = TempDb::new();
    let store = Store::open(db.path_str()).unwrap();
    let app = App::new(store, HubConfig::default());
    Api::new(&app).register("hashed").await;
    let hash: String = db
        .raw()
        .query_row(
            "SELECT password_hash FROM players WHERE username = 'hashed'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(hash.starts_with("$argon2id$"), "{hash}");
    assert!(!hash.contains("correct horse"));
}

#[tokio::test]
async fn leaderboard_ranks_accounts_only() {
    let db = TempDb::new();
    let store = Store::open(db.path_str()).unwrap();
    let app = App::new(store.clone(), HubConfig::default());
    let api = Api::new(&app);
    let _guest = Client::connect(&app, None);
    let mut ids = Vec::new();
    for (name, elo, wins) in [
        ("zed", 1300, 5),
        ("amy", 1300, 5),
        ("bob", 1300, 9),
        ("cat", 1500, 0),
        ("dan", 1100, 1),
    ] {
        let (id, _) = store.register(name, "x", None).unwrap();
        db.raw()
            .execute(
                "UPDATE players SET elo = ?2, wins = ?3, games = ?3 WHERE id = ?1",
                rusqlite::params![id, elo, wins],
            )
            .unwrap();
        ids.push(id);
    }
    let (status, v) = api.get("/api/leaderboard", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["total"], 5, "the guest does not count");
    let names: Vec<_> = v["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["username"].as_str().unwrap())
        .collect();
    // elo desc, then wins desc, then username.
    assert_eq!(names, ["cat", "bob", "amy", "zed", "dan"]);
    assert_eq!(v["entries"][0]["rank"], 1);
    assert_eq!(v["entries"][4]["rank"], 5);
    assert_eq!(v["entries"][1]["wins"], 9);

    let (_, page) = api.get("/api/leaderboard?limit=2&offset=2", None).await;
    assert_eq!(page["total"], 5);
    assert_eq!(page["entries"].as_array().unwrap().len(), 2);
    assert_eq!(page["entries"][0]["username"], "amy");
    assert_eq!(page["entries"][0]["rank"], 3);

    let (_, huge) = api.get("/api/leaderboard?limit=1000", None).await;
    assert_eq!(huge["entries"].as_array().unwrap().len(), 5);
    assert_eq!(
        api.get("/api/leaderboard?limit=abc", None).await.0,
        StatusCode::BAD_REQUEST
    );

    // `me` agrees with the board.
    let (_, token) = (0, store.create_session(&ids[0]).unwrap());
    let (_, me) = api.get("/api/me", Some(&token)).await;
    assert_eq!(me["username"], "zed");
    assert_eq!(me["rank"], 4);
}

#[tokio::test]
async fn profiles_are_public_and_case_insensitive() {
    let (api, _, _) = api();
    api.register("Dora").await;
    let (status, v) = api.get("/api/players/dORA", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["username"], "Dora");
    assert_eq!(v["elo"], 1200);
    assert_eq!(v["peak_elo"], 1200);
    assert_eq!(v["rank"], 1);
    assert_eq!(v["streak"], 0);
    assert_eq!(v["recent"], json!([]));
    let history = v["history"].as_array().unwrap();
    assert_eq!(history.len(), 1, "starts with the initial 1200");
    assert_eq!(history[0]["elo"], 1200);
    assert!(history[0]["at"].as_str().unwrap().ends_with('Z'));
    assert!(v["created_at"].as_str().unwrap().contains('T'));

    let (status, v) = api.get("/api/players/ghost", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(v["error"], "not_found");
    assert_eq!(
        api.get("/api/players/bad%20name", None).await.0,
        StatusCode::NOT_FOUND
    );
}

/// The schema before accounts existed: tokens live on `players`.
const LEGACY_SCHEMA: &str = "
    CREATE TABLE players (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE player_skills (player_id TEXT NOT NULL REFERENCES players(id),
        skill TEXT NOT NULL, PRIMARY KEY (player_id, skill));
    CREATE TABLE unique_skill_owner (skill TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id));
    CREATE TABLE games (id TEXT PRIMARY KEY, white TEXT NOT NULL REFERENCES players(id),
        black TEXT NOT NULL REFERENCES players(id), outcome TEXT NOT NULL,
        finished_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO players (id, token) VALUES ('aaaaaaaa', 'old-token-a'), ('bbbbbbbb', 'old-token-b');
    INSERT INTO player_skills VALUES ('aaaaaaaa', 'teleportation'), ('aaaaaaaa', 'freeze');
    INSERT INTO unique_skill_owner VALUES ('remover', 'bbbbbbbb');
    INSERT INTO games (id, white, black, outcome)
        VALUES ('g1-000001', 'aaaaaaaa', 'bbbbbbbb', '{\"type\":\"stalemate\"}');
";

#[tokio::test]
async fn an_old_database_is_migrated_in_place() {
    let db = TempDb::new();
    db.raw().execute_batch(LEGACY_SCHEMA).unwrap();

    for _ in 0..2 {
        // The second open proves migrations are idempotent.
        let store = Store::open(db.path_str()).unwrap();
        assert_eq!(
            store.player_by_token("old-token-a").unwrap().as_deref(),
            Some("aaaaaaaa"),
            "old tokens became sessions"
        );
        assert_eq!(store.deck("aaaaaaaa").unwrap().len(), 2);
        assert_eq!(
            store
                .unique_owner(chessy_engine::SkillId::Remover)
                .unwrap()
                .as_deref(),
            Some("bbbbbbbb")
        );
        let me = store.me("aaaaaaaa").unwrap().unwrap();
        assert!(me.guest);
        assert_eq!(me.elo, 1200);
    }
    let raw = db.raw();
    let version: i64 = raw
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert!(version >= 2);
    let games: i64 = raw
        .query_row("SELECT COUNT(*) FROM games", [], |r| r.get(0))
        .unwrap();
    assert_eq!(games, 1, "old games survive");
    let violations: i64 = raw
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(violations, 0);

    // The migrated database still works: new guests and accounts.
    let store = Store::open(db.path_str()).unwrap();
    let (guest, _) = store.create_player().unwrap();
    let (_, token) = store.register("legacy_user", "hash", None).unwrap();
    assert!(store.player_by_token(&token).unwrap().is_some());
    assert!(store.me(&guest).unwrap().unwrap().guest);
}
