# ONTOLOGY HTTP_PORT: the address the local HTTP server listens on
HTTP_HOST := "127.0.0.1"
HTTP_PORT := "8572"
# Where a browser reaches the server. Set it when that differs from the bind address,
# as in a container: just HTTP_HOST=0.0.0.0 VIEW_ORIGIN=http://localhost:8572 serve
VIEW_ORIGIN := "http://" + HTTP_HOST + ":" + HTTP_PORT
# The Cloudflare adapter's wrangler config, and where cf-up keeps its pidfile and log
CF_CONFIG := "adapters/cloudflare/wrangler.jsonc"
CF_RUN := "adapters/cloudflare/.wrangler"
CF_PIDFILE := CF_RUN / "pids/cf.pid"
CF_LOG := CF_RUN / "logs/cf.log"
# The telemetry database's tables (D-53), applied by cf-d1-local and cf-d1-production
CF_TELEMETRY_SCHEMA := "adapters/cloudflare/telemetry_schema.sql"
# Where `up` keeps the local server's pidfile and log
RUN := ".run"
PIDFILE := RUN / "serve.pid"
LOG := RUN / "serve.log"
# Where cc-setup puts what a rebuilt container lacks
CONTAINER_TOOLS := env("HOME") / ".local/share/starreach-tools"
# The names and URLs `add` and `add-local` register with Claude Code, and the scope they use
MCP_NAME := "starreach"
MCP_URL := "https://starreach.yuwakisa.com/mcp"
MCP_LOCAL_NAME := "starreach-local"
MCP_LOCAL_URL := "http://" + HTTP_HOST + ":" + HTTP_PORT + "/mcp"
MCP_SCOPE := "local"

# Install the toolchain pieces the Rust core, the TypeScript layers and the page test need
setup:
    rustup target add wasm32-unknown-unknown
    cargo install wasm-bindgen-cli --version 0.2.130 --locked
    npm install
    npx playwright-core install chromium-headless-shell

# A C linker and Chromium's libraries when they're missing, then the normal setup, which needs the linker
# Everything a rebuilt container needs, with no root
cc-setup:
    npm install
    npx playwright-core install chromium-headless-shell
    python3 tools/container_tools.py
    just setup

# Serve the home page, the viewer page and its sockets, MCP over streamable HTTP at /mcp, and /health
serve: cc-wasm-ready
    node adapters/node/src/main.ts http --host {{HTTP_HOST}} --port {{HTTP_PORT}} --origin {{VIEW_ORIGIN}}

# Serve MCP over stdio, with everything `serve` offers on the HTTP port too
stdio: cc-wasm-ready
    node adapters/node/src/main.ts stdio --host {{HTTP_HOST}} --port {{HTTP_PORT}} --origin {{VIEW_ORIGIN}}

# Its own process group (setsid), the PGID in .run/serve.pid and output in .run/serve.log; waits
# for the server's "Starreach on" line. In a container: just HTTP_HOST=0.0.0.0 VIEW_ORIGIN=http://localhost:8572 up
# Run `serve` in the background (stop with down, follow with logs)
up: cc-wasm-ready
    @bash tools/server.sh up {{PIDFILE}} {{LOG}} {{HTTP_HOST}} {{HTTP_PORT}} {{VIEW_ORIGIN}}

# TERM to its process group, then KILL after 4 s
# Stop what up started
down:
    @bash tools/server.sh down {{PIDFILE}}

# Follow the log of the server that up started
logs:
    tail -n 50 -f {{LOG}}

# A JSON object per line: each game record as {"game": …}, then each event record as {"event": …}.
# Held in the server's memory, so gone when it stops. Fails when no local server is running.
# Print the telemetry the local server (up, serve or stdio) holds
telemetry:
    @bash tools/server.sh telemetry {{HTTP_HOST}} {{HTTP_PORT}}

# Add the deployed Starreach to Claude Code as the MCP server `starreach`
add:
    claude mcp add --transport http --scope {{MCP_SCOPE}} {{MCP_NAME}} {{MCP_URL}}

# Remove the `starreach` MCP server from Claude Code
remove:
    claude mcp remove --scope {{MCP_SCOPE}} {{MCP_NAME}}

# Add a locally running Starreach (`just serve`) to Claude Code as `starreach-local`
add-local:
    claude mcp add --transport http --scope {{MCP_SCOPE}} {{MCP_LOCAL_NAME}} {{MCP_LOCAL_URL}}

# Remove the `starreach-local` MCP server from Claude Code
remove-local:
    claude mcp remove --scope {{MCP_SCOPE}} {{MCP_LOCAL_NAME}}

# The home page, the viewer page and sockets, MCP at /mcp and /health on http://localhost:8787, games in local
# Durable Objects under adapters/cloudflare/.wrangler/. In a container: just cf-dev --ip 0.0.0.0
# Run the Cloudflare adapter locally under wrangler dev, in the foreground
cf-dev *args: cc-build-wasm cf-d1-local
    npx wrangler dev --config {{CF_CONFIG}} {{args}}

# Its own process group (setsid), the PGID in .wrangler/pids/cf.pid and output in
# .wrangler/logs/cf.log under adapters/cloudflare/; waits for wrangler's "Ready on" line.
# Run cf-dev in the background (stop with cf-down, follow with cf-logs)
cf-up *args: cc-build-wasm cf-d1-local
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p {{CF_RUN}}/pids {{CF_RUN}}/logs
    if [ -f {{CF_PIDFILE}} ] && pgrep -g "$(cat {{CF_PIDFILE}})" >/dev/null 2>&1; then
      echo "cf already running (pgid $(cat {{CF_PIDFILE}})); stop it with: just cf-down"
      exit 0
    fi
    rm -f {{CF_PIDFILE}}
    # The inner bash writes its pid, which setsid made the PGID, then execs wrangler in its place
    setsid bash -c 'echo $$ > "$1"; shift; exec npx wrangler dev "$@"' _ {{CF_PIDFILE}} --config {{CF_CONFIG}} {{args}} \
      </dev/null >{{CF_LOG}} 2>&1 &
    for _ in $(seq 1 600); do
      if grep -q "Ready on" {{CF_LOG}}; then
        echo "cf started (pgid $(cat {{CF_PIDFILE}})): $(grep -o 'Ready on [^ ]*' {{CF_LOG}} | head -n 1)"
        echo "follow with: just cf-logs    stop with: just cf-down"
        exit 0
      fi
      if [ -s {{CF_PIDFILE}} ] && ! pgrep -g "$(cat {{CF_PIDFILE}})" >/dev/null 2>&1; then
        echo "cf exited during startup; the log:" >&2
        cat {{CF_LOG}} >&2
        exit 1
      fi
      sleep 0.1
    done
    echo "cf not ready after 60 s; see {{CF_LOG}} (still running, stop with: just cf-down)" >&2
    exit 1

# TERM to its process group, then KILL after 4 s. Also reaps an orphaned wrangler dev on
# this config whose pidfile is gone.
# Stop what cf-up started
cf-down:
    #!/usr/bin/env bash
    set -euo pipefail
    pgids=()
    if [ -f {{CF_PIDFILE}} ]; then pgids+=("$(cat {{CF_PIDFILE}})"); fi
    while IFS= read -r pid; do
      pgids+=("$(ps -p "$pid" -o pgid= | tr -d ' ' || true)")
    done < <(pgrep -f 'wrangler dev --config {{CF_CONFIG}}' || true)
    live=$(for pgid in "${pgids[@]}"; do [ -n "$pgid" ] && pgrep -g "$pgid" >/dev/null 2>&1 && echo "$pgid"; done | sort -u || true)
    rm -f {{CF_PIDFILE}}
    if [ -z "$live" ]; then
      echo "cf not running"
      exit 0
    fi
    for pgid in $live; do
      kill -TERM -"$pgid" 2>/dev/null || true
      for _ in $(seq 1 40); do pgrep -g "$pgid" >/dev/null 2>&1 || break; sleep 0.1; done
      if pgrep -g "$pgid" >/dev/null 2>&1; then
        kill -KILL -"$pgid" 2>/dev/null || true
        echo "cf stopped (pgid $pgid, killed)"
      else
        echo "cf stopped (pgid $pgid)"
      fi
    done

# Follow the log of what cf-up started
cf-logs:
    tail -n 200 -F {{CF_LOG}}

# The database is local files under adapters/cloudflare/.wrangler/, made on first use; nothing
# on the Cloudflare account is touched. Safe to run again. cf-dev and cf-up run it first.
# Give wrangler dev's local telemetry database its tables
cf-d1-local:
    @bash tools/telemetry_db.sh local {{CF_CONFIG}} {{CF_TELEMETRY_SCHEMA}}

# TOUCHES THE PRODUCTION ACCOUNT: only with the user's go-ahead. Run it twice. While
# wrangler.jsonc still holds PUT-THE-DATABASE-ID-HERE it creates the D1 database
# starreach-telemetry and prints the database_id to put there. Run again after that, it
# applies the schema to the database, which is safe to repeat. Then cf-deploy.
# Create the production telemetry database, then (run again) give it its tables
cf-d1-production:
    @bash tools/telemetry_db.sh production {{CF_CONFIG}} {{CF_TELEMETRY_SCHEMA}}

# Checks /health, new_game and long_range_scan over /mcp, and a viewer socket's frames.
# Creates one game. e.g. just cc-smoke http://localhost:8787
# Smoke-test a running server at a base URL, local or https://starreach.yuwakisa.com
cc-smoke base_url:
    node tools/smoke.ts '{{base_url}}'

# Show which Cloudflare account wrangler is logged in to (the shared yuwakisacloud login)
cf-whoami:
    npx wrangler whoami

# Refused while wrangler.jsonc holds no production telemetry database id (cf-d1-production comes first).
# Deploy the Cloudflare adapter to production (starreach.yuwakisa.com). Pass --dry-run to check without deploying.
cf-deploy *args: cc-build-wasm
    @bash tools/telemetry_db.sh deploy-check {{CF_CONFIG}} {{args}}
    npx wrangler deploy --config {{CF_CONFIG}} --env production {{args}}

# Stream the production Worker's live logs (wrangler tail)
cf-tail:
    npx wrangler tail --config {{CF_CONFIG}} --env production

# Deleting the Worker takes starreach.yuwakisa.com down and ALSO DELETES ITS DURABLE OBJECTS,
# so every deployed game is gone for good; nothing restores them. `cf-deploy` brings the
# Worker back, empty. Wrangler asks for confirmation. Only with the user's go-ahead.
# KILL SWITCH: delete the production Worker AND every deployed game
cf-undeploy:
    @echo "WARNING: deleting the production Worker 'starreach' (starreach.yuwakisa.com)."
    @echo "WARNING: this also deletes its Durable Objects: EVERY DEPLOYED GAME IS LOST for good."
    npx wrangler delete --config {{CF_CONFIG}} --env production

# Build the core to WASM and generate its JS bindings into app/src/wasm
cc-build-wasm:
    cargo build --quiet --manifest-path core/Cargo.toml --release --target wasm32-unknown-unknown
    wasm-bindgen --target web --out-dir app/src/wasm core/target/wasm32-unknown-unknown/release/starreach_core.wasm

# For running the server on a machine without Rust (a host beside the dev container): tests and
# deploys still use cc-build-wasm, so they never run on a stale build.
# Build the core if the Rust toolchain is here; otherwise use the last build in app/src/wasm
cc-wasm-ready:
    @bash tools/server.sh wasm-ready

# Run every test suite and the typecheck
cc-test-all: cc-test-core cc-test-app cc-test-node cc-test-cloudflare cc-test-page cc-typecheck

# Run the Rust core's rule tests and the CRITERIA coverage test
cc-test-core *args:
    cargo test --manifest-path core/Cargo.toml {{args}}

# Run the app layer's tests (app/test) against the WASM core
cc-test-app: cc-build-wasm
    node --test 'app/test/**/*.test.ts'

# Run the Node adapter's tests (adapters/node/test): real sockets on a free port
cc-test-node: cc-build-wasm
    node --test 'adapters/node/test/**/*.test.ts'

# Run the Cloudflare adapter's tests (adapters/cloudflare/test) inside workerd, under vitest
cc-test-cloudflare: cc-build-wasm
    npx vitest run --root adapters/cloudflare

# Screenshots go to adapters/node/test-browser/out/
# Drive the viewer page and the home page in headless Chromium against the real server
cc-test-page: cc-build-wasm
    if [ -f {{CONTAINER_TOOLS}}/env ]; then . {{CONTAINER_TOOLS}}/env; fi; node --test 'adapters/node/test-browser/*.test.ts'

# Mint a local auth/ access token for Starreach's client, as auth/'s seeded dev user
# (dev@yuwakisa.com). Needs yuwakisacloud's auth/ running on :8788 (`cd /work/yuwakisacloud/auth &&
# just migrate-local && just dev-up`). POST /signin signs in, authorizes and issues the code in one
# hop; the code is exchanged at /token with PKCE. Prints the bare token, for
# `Authorization: Bearer <token>` against /mcp (e.g. SMOKE_TOKEN=$(just cc-dev-token) just cc-smoke ...).
# The request names Starreach's local MCP URL as its `resource`, as MCP clients do, so the token's
# audience is that URL; pass an empty string for a token whose audience is the client id.
[script]
cc-dev-token resource='http://localhost:8787/mcp':
    auth=http://localhost:8788
    resource='{{resource}}'
    resource_arg=""
    if [ -n "$resource" ]; then resource_arg="--data-urlencode resource=$resource"; fi
    client=D21zauaGSjnD3U77
    redirect=http://localhost:8574/callback
    verifier=$(openssl rand -hex 48)
    challenge=$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
    headers=$(curl -sS -o /dev/null -D - -X POST "$auth/signin" \
      --data-urlencode "response_type=code" --data-urlencode "client_id=$client" \
      --data-urlencode "redirect_uri=$redirect" --data-urlencode "scope=starreach:play" \
      --data-urlencode "state=$(openssl rand -hex 8)" --data-urlencode "code_challenge=$challenge" \
      --data-urlencode "code_challenge_method=S256" $resource_arg \
      --data-urlencode "email=dev@yuwakisa.com" --data-urlencode "password=localyk!" | tr -d '\r')
    code=$(printf '%s' "$headers" | sed -n 's#^[Ll]ocation:.*[?&]code=\([^&]*\).*#\1#p' | head -1)
    if [ -z "$code" ]; then echo "cc-dev-token: no code from $auth/signin; is auth/ up and seeded?" >&2; exit 1; fi
    token=$(curl -sS -X POST "$auth/token" --data-urlencode "grant_type=authorization_code" \
      --data-urlencode "code=$code" --data-urlencode "redirect_uri=$redirect" \
      --data-urlencode "client_id=$client" --data-urlencode "code_verifier=$verifier" $resource_arg \
      | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -z "$token" ]; then echo "cc-dev-token: /token returned no access_token" >&2; exit 1; fi
    printf '%s' "$token"

# Screenshot a page in headless Chromium, e.g. just cc-screenshot 'https://starreach.yuwakisa.com/viewer?view=<id>' public/images/viewer.jpg 1100 800
cc-screenshot url out width height:
    if [ -f {{CONTAINER_TOOLS}}/env ]; then . {{CONTAINER_TOOLS}}/env; fi; node tools/screenshot.ts '{{url}}' '{{out}}' {{width}} {{height}}

# Typecheck the TypeScript app and adapters
cc-typecheck: cc-build-wasm
    npx tsc -p tsconfig.json
    npx tsc -p adapters/cloudflare/tsconfig.json

# Model generation, combat, battle, warp and energy-reach numbers (energy to a starbase, sectors cleared on one tank, how a tank ends) cited as Evidence in docs/RATIONALE.md
cc-model-balance galaxies:
    cargo run --quiet --release --manifest-path core/Cargo.toml --example model_balance -- balance {{galaxies}}

# Play whole games with a scripted captain: how they end, each counter per game, the scale and goal_ceiling the D-43 rule gives, and how often each goal is set and met (D-47), cited as Evidence in docs/RATIONALE.md
cc-model-games games="1000":
    cargo run --quiet --release --manifest-path core/Cargo.toml --example model_balance -- games {{games}}
