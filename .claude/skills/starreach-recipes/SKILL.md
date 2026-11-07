---
name: starreach-recipes
description: Project-local just recipes for Starreach (build WASM, serve locally, run Rust/app tests, model balance numbers). Use before running tests or regenerating RATIONALE evidence in this repo.
---

# Starreach recipes

Invoke these recipes; don't call the scripts directly.

| Recipe | What it does |
|---|---|
| `just setup` | Installs the wasm32 target, wasm-bindgen CLI 0.2.130, the npm workspaces and headless Chromium |
| `just cc-setup` | After a container rebuild: runs `tools/container_tools.py`, which fetches a C linker (Zig, wired in through `~/.cargo/config.toml`) and Chromium's system libraries into `~/.local/share/starreach-tools` when they're missing, then `just setup`. No root needed |
| `just serve` | Builds the WASM core and serves the viewer page and sockets, MCP at `/mcp` and `/health` on `HTTP_HOST:HTTP_PORT` (127.0.0.1:8572, set at the top of the justfile). Browsers get `VIEW_ORIGIN`; override both in a container: `just HTTP_HOST=0.0.0.0 VIEW_ORIGIN=http://localhost:8572 serve` |
| `just stdio` | The same as `serve`, plus MCP over stdio. It exits when stdin closes |
| `just cc-build-wasm` | Builds the core to WASM and generates bindings into `app/src/wasm/` (gitignored) |
| `just cc-test-all` | Runs `cc-test-core`, `cc-test-app`, `cc-test-node`, `cc-test-page` and `cc-typecheck` |
| `just cc-test-core [cargo test args]` | Runs the Rust core's rule tests (`core/tests/R-n/`) and the CRITERIA coverage test (e.g. `just cc-test-core --test rules r_9`) |
| `just cc-test-app` | Runs the app tests (`app/test/**/*.test.ts`, Node's test runner) against the WASM core |
| `just cc-test-node` | Runs the Node adapter's tests (`adapters/node/test/**/*.test.ts`): real sockets on a free port, and the stdio process |
| `just cc-test-page` | Drives the viewer page in headless Chromium against the real server (`adapters/node/test-browser/`). Screenshots go to `adapters/node/test-browser/out/` |
| `just cc-typecheck` | Runs `tsc --noEmit` over `app/` and `adapters/node/` |
| `just cc-model-balance <galaxies>` | Runs `core/examples/model_balance.rs`: prints the modeled generation and combat numbers cited as Evidence in `docs/RATIONALE.md` (RATIONALE cites 2000 galaxies) |

The TypeScript runs directly under Node 26 (type stripping), so it has no build step. Imports
use `.ts` extensions.

A new core rule test goes in `core/tests/R-n/<what_it_checks>.rs` and gets a `#[path]` module
line in `core/tests/rules.rs`. An app rule test goes in `app/test/R-n/<what>.test.ts`, and a Node adapter one in
`adapters/node/test/R-n/<what>.test.ts`. Either way, its CRITERIA row becomes `automated`. The coverage test fails if any of these is missing.
