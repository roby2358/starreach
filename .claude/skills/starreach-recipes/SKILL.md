---
name: starreach-recipes
description: Project-local just recipes for Starreach (build WASM, serve locally, run Rust/app/Python tests, model balance numbers). Use before running tests or regenerating RATIONALE evidence in this repo.
---

# Starreach recipes

Invoke these recipes; don't call the scripts directly.

| Recipe | What it does |
|---|---|
| `just setup` | Installs the wasm32 target, wasm-bindgen CLI 0.2.130 and the npm workspaces |
| `just serve` | Builds the WASM core and serves MCP at `/mcp` and `/health` over HTTP on `HTTP_HOST:HTTP_PORT` (127.0.0.1:8000, set at the top of the justfile) |
| `just stdio` | Builds the WASM core and serves MCP over stdio |
| `just cc-build-wasm` | Builds the core to WASM and generates bindings into `app/src/wasm/` (gitignored) |
| `just cc-test-all` | Runs `cc-test-core`, `cc-test-app` and `cc-typecheck` |
| `just cc-test-core [cargo test args]` | Runs the Rust core's rule tests (`core/tests/R-n/`) and the CRITERIA coverage test (e.g. `just cc-test-core --test rules r_9`) |
| `just cc-test-app` | Runs the app tests (`app/test/**/*.test.ts`, Node's test runner) against the WASM core |
| `just cc-typecheck` | Runs `tsc --noEmit` over `app/` and `adapters/node/` |
| `just cc-test [pytest args]` | Runs the old Python server's pytest suite in `test/` with `venv_linux` |
| `just cc-model-balance [galaxies]` | Prints the modeled generation and combat numbers cited as Evidence in `docs/RATIONALE.md` (default 2000 galaxies) |

The TypeScript runs directly under Node 26 (type stripping), so it has no build step. Imports
use `.ts` extensions.

A new core rule test goes in `core/tests/R-n/<what_it_checks>.rs` and gets a `#[path]` module
line in `core/tests/rules.rs`. An app rule test goes in `app/test/R-n/<what>.test.ts`. Either
way, its CRITERIA row becomes `automated`. The coverage test fails if any of these is missing.

Setup: `python3 -m venv venv_linux && venv_linux/bin/pip install -r requirements-dev.txt`.
