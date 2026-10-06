pub mod app;
pub mod hub;
pub mod protocol;
pub mod store;
pub mod ws;

use std::sync::Arc;

use axum::routing::get;
use axum::Router;

pub use app::App;

/// The HTTP router: a WebSocket endpoint at `/ws` and a health check.
pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/ws", get(ws::ws_handler))
        .route("/healthz", get(|| async { "ok" }))
        .with_state(app)
}
