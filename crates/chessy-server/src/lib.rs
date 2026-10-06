pub mod api;
pub mod app;
pub mod bot;
pub mod elo;
pub mod hub;
pub mod protocol;
pub mod social;
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
        .nest("/api", api::routes())
        .with_state(app)
}
