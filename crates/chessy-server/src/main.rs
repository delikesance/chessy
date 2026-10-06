use std::path::Path;

use chessy_server::hub::HubConfig;
use chessy_server::store::Store;
use chessy_server::{router, App};
use tower_http::services::{ServeDir, ServeFile};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "chessy_server=info".to_string()),
        )
        .init();

    let db_path = std::env::var("CHESSY_DB").unwrap_or_else(|_| "chessy.sqlite".to_string());
    let addr = std::env::var("CHESSY_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".to_string());
    let web_dir = std::env::var("CHESSY_WEB_DIR").unwrap_or_else(|_| "web/dist".to_string());

    let store = Store::open(&db_path).expect("open database");
    let mut app = router(App::new(store, HubConfig::default()));

    // Serve the built client when present; in development Vite serves it instead.
    if Path::new(&web_dir).join("index.html").exists() {
        let index = ServeFile::new(Path::new(&web_dir).join("index.html"));
        app = app.fallback_service(ServeDir::new(&web_dir).not_found_service(index));
        tracing::info!("serving client from {web_dir}");
    }

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind address");
    tracing::info!("chessy-server listening on http://{addr} (db: {db_path})");
    axum::serve(listener, app).await.expect("server error");
}
