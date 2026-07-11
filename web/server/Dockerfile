FROM rust:1-bookworm AS builder

# Tauri 2 su Linux richiede WebKit/GTK anche per compilare la libreria.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    curl \
    wget \
    file \
    libssl-dev \
    libdbus-1-dev \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libxdo-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copia tutto il crate Tauri (evita COPY parziali che saltano file richiesti da build.rs).
COPY src-tauri/ ./

ENV CARGO_BUILD_JOBS=1
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true

RUN cargo build --release --bin branchefy-web-api

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/branchefy-web-api /usr/local/bin/branchefy-web-api

ENV PORT=8787
ENV BRANCHEFY_DATA_DIR=/data

EXPOSE 8787

CMD ["branchefy-web-api"]
