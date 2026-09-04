use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use codex_backgroundremover_godot::{AppState, Config, build_router};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            EnvFilter::new("codex_backgroundremover_godot=info,tower_http=info")
        }))
        .init();

    let config = Config::discover()?;
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), config.port);
    let state = AppState::new(config).await?;
    let app = build_router(state);

    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "background remover listening");
    axum::serve(listener, app).await?;
    Ok(())
}
