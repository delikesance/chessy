.PHONY: dev-server dev-web build serve test check

# Development: run these two in separate terminals, then open http://localhost:5173
dev-server:
	cargo run -p chessy-server

dev-web:
	npm run dev --prefix web

# Production-style: build the client, then let the server serve it on :3000
build:
	npm ci --prefix web && npm run build --prefix web

serve: build
	cargo run --release -p chessy-server

test:
	cargo test --workspace
	npm test --prefix web

# Everything CI should run
check:
	cargo fmt --all --check
	cargo clippy --workspace --all-targets -- -D warnings
	cargo test --workspace
	npm run build --prefix web
	npm test --prefix web
