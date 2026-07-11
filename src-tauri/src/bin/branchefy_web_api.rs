use axum::{
    extract::{FromRef, State},
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri_app_lib::{
    build_stream_router, dispatch_web_command, init_web_state, stream_state_from_app, AppState,
    StreamState,
};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct ServerState {
    app: Arc<AppState>,
    stream: Arc<StreamState>,
}

impl FromRef<ServerState> for Arc<AppState> {
    fn from_ref(state: &ServerState) -> Self {
        state.app.clone()
    }
}

impl FromRef<ServerState> for Arc<StreamState> {
    fn from_ref(state: &ServerState) -> Self {
        state.stream.clone()
    }
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
    let app_state = init_web_state().await?;
    let server_state = ServerState {
        stream: stream_state_from_app(app_state.as_ref()),
        app: app_state,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS, Method::HEAD])
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/invoke", post(invoke))
        .merge(build_stream_router::<ServerState>())
        .layer(cors)
        .with_state(server_state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    println!("Branchefy web API in ascolto su http://0.0.0.0:{port}");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "ok": true, "service": "branchefy-web-api" })))
}

async fn invoke(
    State(app): State<Arc<AppState>>,
    Json(body): Json<InvokeBody>,
) -> impl IntoResponse {
    match dispatch_web_command(app.as_ref(), &body.command, body.args).await {
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
