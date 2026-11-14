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
| `just cf-dev [wrangler dev args]` | Builds the WASM core and runs the Cloudflare adapter under `wrangler dev` (wrangler 4.90.0, from npm): the viewer page and sockets, MCP at `/mcp` and `/health` on http://localhost:8787, games in local Durable Objects under `adapters/cloudflare/.wrangler/`. In a container: `just cf-dev --ip 0.0.0.0` |
| `just cf-whoami` | Shows which Cloudflare account wrangler is logged in to: the shared OAuth login also used by /work/yuwakisacloud (`just login` there to log in) |
| `just cf-deploy [--dry-run]` | Builds the WASM core and runs `wrangler deploy --env production` for the Cloudflare adapter, to the `starreach.yuwakisa.com` custom domain. `--dry-run` checks the bundle and bindings without deploying. Only deploy with the user's go-ahead |
| `just cc-build-wasm` | Builds the core to WASM and generates bindings into `app/src/wasm/` (gitignored) |
| `just cc-test-all` | Runs `cc-test-core`, `cc-test-app`, `cc-test-node`, `cc-test-cloudflare`, `cc-test-page` and `cc-typecheck` |
| `just cc-test-core [cargo test args]` | Runs the Rust core's rule tests (`core/tests/R-n/`) and the CRITERIA coverage test (e.g. `just cc-test-core --test rules r_9`) |
| `just cc-test-app` | Runs the app tests (`app/test/**/*.test.ts`, Node's test runner) against the WASM core |
| `just cc-test-node` | Runs the Node adapter's tests (`adapters/node/test/**/*.test.ts`): real sockets on a free port, and the stdio process |
| `just cc-test-cloudflare` | Runs the Cloudflare adapter's tests (`adapters/cloudflare/test/**/*.test.ts`) inside workerd, under vitest with `@cloudflare/vitest-pool-workers`: the Durable Object store, the Worker's HTTP routes and the viewer sockets (R-21, R-27). Its files share one worker and storage (`maxWorkers: 1`, `isolate: false`), so each test makes its own game |
| `just cc-test-page` | Drives the viewer page in headless Chromium against the real server (`adapters/node/test-browser/`). Screenshots go to `adapters/node/test-browser/out/` |
| `just cc-typecheck` | Runs `tsc --noEmit` over `app/` and `adapters/node/`, then over `adapters/cloudflare/` with its own `tsconfig.json` (Workers types instead of Node's) |
| `just cc-model-balance <galaxies>` | Runs `core/examples/model_balance.rs`: prints the modeled generation and combat numbers cited as Evidence in `docs/RATIONALE.md` (RATIONALE cites 2000 galaxies) |

The TypeScript runs directly under Node 26 (type stripping), so it has no build step. Imports
use `.ts` extensions. The Cloudflare adapter is the exception: wrangler bundles it, and its
tests use vitest's `expect`, not `node:assert`. Its packages are pinned to exact versions that
go together (wrangler 4.90.0, `@cloudflare/vitest-pool-workers` 0.16.3, workers-types
4.20260507.1), and npm runs with `ignore-scripts=true`. Never run `wrangler deploy` or
`wrangler login` without the user.

A new core rule test goes in `core/tests/R-n/<what_it_checks>.rs` and gets a `#[path]` module
line in `core/tests/rules.rs`. An app rule test goes in `app/test/R-n/<what>.test.ts`, and a Node adapter one in
`adapters/node/test/R-n/<what>.test.ts` (or `adapters/cloudflare/test/R-n/`). Either way, its CRITERIA row becomes `automated`. The coverage test fails if any of these is missing.
