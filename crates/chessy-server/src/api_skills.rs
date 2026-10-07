//! `GET /api/skills/forged?ids=1,2,3`: the definitions of forged skills, for
//! clients that meet a `forged_<id>` they know nothing about yet.

use std::sync::Arc;

use axum::extract::rejection::QueryRejection;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::app::App;

/// Ids answered in one request.
const MAX_IDS: usize = 64;

#[derive(Deserialize)]
pub struct ForgedQuery {
    /// Comma-separated numbers (the `n` of `forged_n`).
    ids: Option<String>,
}

fn bad_request() -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": "bad_request" })),
    )
        .into_response()
}

/// `{skills: [SkillDefView]}`; ids that are not forged skills are left out.
pub async fn forged(
    State(app): State<Arc<App>>,
    query: Result<Query<ForgedQuery>, QueryRejection>,
) -> Response {
    let Ok(Query(query)) = query else {
        return bad_request();
    };
    let mut ids: Vec<u32> = Vec::new();
    for part in query.ids.as_deref().unwrap_or("").split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        match part.parse() {
            Ok(id) => ids.push(id),
            Err(_) => return bad_request(),
        }
    }
    if ids.len() > MAX_IDS {
        return bad_request();
    }
    match app.store().forged_views(&ids) {
        Ok(skills) => Json(json!({ "skills": skills })).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "internal" })),
        )
            .into_response(),
    }
}
