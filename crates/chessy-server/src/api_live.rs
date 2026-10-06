//! `GET /api/live`: the games being played right now (see `docs/spec-v4.md` §3).

use std::sync::Arc;

use axum::extract::rejection::QueryRejection;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::app::App;

const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 100;

#[derive(Deserialize)]
pub struct LiveQuery {
    limit: Option<usize>,
}

/// `{games: [LiveGame]}`, strongest games first, then oldest.
pub async fn live(
    State(app): State<Arc<App>>,
    query: Result<Query<LiveQuery>, QueryRejection>,
) -> Response {
    let Ok(Query(query)) = query else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "bad_request" })),
        )
            .into_response();
    };
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    Json(json!({ "games": app.live_games(limit) })).into_response()
}
