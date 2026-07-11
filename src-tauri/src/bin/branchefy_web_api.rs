use axum::{
    extract::State,
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri_app_lib::{dispatch_web_command, init_web_state, AppState};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct ApiState {
    app: Arc<AppState>,
}

#[derive(Deserialize)]
struct InvokeBody {
    command: String,
    #[serde(default)]
    args: Value,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787u16);
    let state = init_web_state().await?;
    let api_state = ApiState { app: state };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/invoke", post(invoke))
        .layer(cors)
        .with_state(api_state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    println!("Branchefy web API in ascolto su http://0.0.0.0:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "ok": true, "service": "branchefy-web-api" })))
}

async fn invoke(
    State(state): State<ApiState>,
    Json(body): Json<InvokeBody>,
) -> impl IntoResponse {
    match dispatch_web_command(state.app.as_ref(), &body.command, body.args).await {
        Ok(data) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "data": data })),
        ),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": error })),
        ),
    }
}
