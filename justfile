# ONTOLOGY HTTP_PORT: the address the local HTTP server listens on
HTTP_HOST := "127.0.0.1"
HTTP_PORT := "8000"

# Install the toolchain pieces the Rust core and the TypeScript layers need
setup:
    rustup target add wasm32-unknown-unknown
    cargo install wasm-bindgen-cli --version 0.2.130 --locked
    npm install

# Serve MCP over streamable HTTP at /mcp, with /health
serve: cc-build-wasm
    node adapters/node/src/main.ts http --host {{HTTP_HOST}} --port {{HTTP_PORT}}

# Serve MCP over stdio
stdio: cc-build-wasm
    node adapters/node/src/main.ts stdio

# Build the core to WASM and generate its JS bindings into app/src/wasm
cc-build-wasm:
    cargo build --quiet --manifest-path core/Cargo.toml --release --target wasm32-unknown-unknown
    wasm-bindgen --target web --out-dir app/src/wasm core/target/wasm32-unknown-unknown/release/starreach_core.wasm

# Run every test suite and the typecheck
cc-test-all: cc-test-core cc-test-app cc-typecheck

# Run the Rust core's rule tests and the CRITERIA coverage test
cc-test-core *args:
    cargo test --manifest-path core/Cargo.toml {{args}}

# Run the app layer's tests (app/test) against the WASM core
cc-test-app: cc-build-wasm
    node --test 'app/test/**/*.test.ts'

# Typecheck the TypeScript app and adapters
cc-typecheck: cc-build-wasm
    npx tsc -p tsconfig.json

# Run the Python server's test suite
cc-test *args:
    venv_linux/bin/python -m pytest {{args}}

# Model generation and combat numbers cited as Evidence in docs/RATIONALE.md
cc-model-balance galaxies="2000":
    venv_linux/bin/python tools/model_balance.py {{galaxies}}
