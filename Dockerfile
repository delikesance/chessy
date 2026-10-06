# syntax=docker/dockerfile:1

# ---- Client web (Vite + React + Phaser) ------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Serveur Rust -----------------------------------------------------------
FROM rust:1-bookworm AS server
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release -p chessy-server \
    && cp target/release/chessy-server /chessy-server

# ---- Image finale -----------------------------------------------------------
FROM debian:bookworm-slim
RUN useradd --system --create-home --home-dir /data --shell /usr/sbin/nologin chessy \
    && mkdir -p /app && chown chessy /data
COPY --from=server /chessy-server /app/chessy-server
COPY --from=web /web/dist /app/web
ENV CHESSY_ADDR=0.0.0.0:3000 \
    CHESSY_DB=/data/chessy.sqlite \
    CHESSY_WEB_DIR=/app/web \
    RUST_LOG=chessy_server=info
USER chessy
WORKDIR /data
VOLUME /data
EXPOSE 3000
ENTRYPOINT ["/app/chessy-server"]
