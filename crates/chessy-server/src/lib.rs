pub mod analysis;
pub mod api;
pub mod api_games;
pub mod api_live;
pub mod app;
pub mod bot;
pub mod elo;
pub mod games_store;
pub mod hub;
pub mod limits;
pub mod protocol;
pub mod replay;
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
        .nest("/api", api::routes().merge(api_games::routes()))
        .with_state(app)
}
