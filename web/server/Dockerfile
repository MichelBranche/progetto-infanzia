FROM rust:1.85-bookworm AS builder

WORKDIR /build
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./
COPY src-tauri/build.rs ./build.rs
COPY src-tauri/src ./src
COPY src-tauri/icons ./icons
COPY src-tauri/capabilities ./capabilities
COPY src-tauri/tauri.conf.json ./tauri.conf.json

RUN cargo build --release --bin branchefy-web-api

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/branchefy-web-api /usr/local/bin/branchefy-web-api

ENV PORT=8787
ENV BRANCHEFY_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 8787

CMD ["branchefy-web-api"]
