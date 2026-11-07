# ONTOLOGY HTTP_PORT: the address the local HTTP server listens on
HTTP_HOST := "127.0.0.1"
HTTP_PORT := "8572"
# Where a browser reaches the server. Set it when that differs from the bind address,
# as in a container: just HTTP_HOST=0.0.0.0 VIEW_ORIGIN=http://localhost:8572 serve
VIEW_ORIGIN := "http://" + HTTP_HOST + ":" + HTTP_PORT
# Where cc-setup puts what a rebuilt container lacks
CONTAINER_TOOLS := env("HOME") / ".local/share/starreach-tools"

# Install the toolchain pieces the Rust core, the TypeScript layers and the page test need
setup:
    rustup target add wasm32-unknown-unknown
    cargo install wasm-bindgen-cli --version 0.2.130 --locked
    npm install
    npx playwright-core install chromium-headless-shell

# Everything a rebuilt container needs, with no root: a C linker and Chromium's libraries
# when they're missing, then the normal setup, which needs the linker
cc-setup:
    npm install
    npx playwright-core install chromium-headless-shell
    python3 tools/container_tools.py
    just setup

# Serve the viewer page and its sockets, MCP over streamable HTTP at /mcp, and /health
serve: cc-build-wasm
    node adapters/node/src/main.ts http --host {{HTTP_HOST}} --port {{HTTP_PORT}} --origin {{VIEW_ORIGIN}}

# Serve MCP over stdio, with everything `serve` offers on the HTTP port too
stdio: cc-build-wasm
    node adapters/node/src/main.ts stdio --host {{HTTP_HOST}} --port {{HTTP_PORT}} --origin {{VIEW_ORIGIN}}

# Build the core to WASM and generate its JS bindings into app/src/wasm
cc-build-wasm:
    cargo build --quiet --manifest-path core/Cargo.toml --release --target wasm32-unknown-unknown
    wasm-bindgen --target web --out-dir app/src/wasm core/target/wasm32-unknown-unknown/release/starreach_core.wasm

# Run every test suite and the typecheck
cc-test-all: cc-test-core cc-test-app cc-test-node cc-test-page cc-typecheck

# Run the Rust core's rule tests and the CRITERIA coverage test
cc-test-core *args:
    cargo test --manifest-path core/Cargo.toml {{args}}

# Run the app layer's tests (app/test) against the WASM core
cc-test-app: cc-build-wasm
    node --test 'app/test/**/*.test.ts'

# Run the Node adapter's tests (adapters/node/test): real sockets on a free port
cc-test-node: cc-build-wasm
    node --test 'adapters/node/test/**/*.test.ts'

# Drive the viewer page in headless Chromium against the real server; screenshots go to
# adapters/node/test-browser/out/
cc-test-page: cc-build-wasm
    if [ -f {{CONTAINER_TOOLS}}/env ]; then . {{CONTAINER_TOOLS}}/env; fi; node --test 'adapters/node/test-browser/*.test.ts'

# Typecheck the TypeScript app and adapters
cc-typecheck: cc-build-wasm
    npx tsc -p tsconfig.json

# Model generation and combat numbers cited as Evidence in docs/RATIONALE.md
cc-model-balance galaxies:
    cargo run --quiet --release --manifest-path core/Cargo.toml --example model_balance -- {{galaxies}}
