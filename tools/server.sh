#!/usr/bin/env bash
# The local server in the background, for `just up`, `just down` and `just cc-wasm-ready`.
#
# A script file, run as `bash tools/server.sh …`, rather than shebang recipes in the justfile:
# just runs a shebang recipe by executing a temporary file, which fails with "Permission denied"
# where the temporary directory is mounted noexec (seen under WSL).
#
# Usage:
#   server.sh wasm-ready
#   server.sh up <pidfile> <log> <host> <port> <origin>
#   server.sh down <pidfile>
set -euo pipefail

WASM=app/src/wasm/starreach_core_bg.wasm

# Builds the core where the Rust toolchain is installed; elsewhere uses the last build.
wasm_ready() {
  if command -v cargo >/dev/null 2>&1 && command -v wasm-bindgen >/dev/null 2>&1; then
    just cc-build-wasm
    return
  fi
  if [ -f "$WASM" ]; then
    echo "no Rust toolchain here: serving the last build of the core ($(date -r "$WASM" '+%Y-%m-%d %H:%M'))"
    return
  fi
  echo "no Rust toolchain here and no built core in app/src/wasm: run 'just cc-build-wasm' where Rust is installed (see 'just setup')" >&2
  exit 1
}

running() {
  local pidfile=$1
  [ -s "$pidfile" ] && pgrep -g "$(cat "$pidfile")" >/dev/null 2>&1
}

# Starts the server in its own process group, its PGID in the pidfile, and waits for its
# "Starreach on" line.
up() {
  local pidfile=$1 log=$2 host=$3 port=$4 origin=$5
  mkdir -p "$(dirname "$pidfile")" "$(dirname "$log")"
  if running "$pidfile"; then
    echo "server already running (pgid $(cat "$pidfile")); stop it with: just down"
    return
  fi
  rm -f "$pidfile"
  # The inner bash writes its pid, which setsid made the PGID, then execs node in its place
  setsid bash -c 'echo $$ > "$1"; shift; exec node "$@"' _ "$pidfile" \
    adapters/node/src/main.ts http --host "$host" --port "$port" --origin "$origin" \
    </dev/null >"$log" 2>&1 &
  for _ in $(seq 1 100); do
    if grep -q "Starreach on" "$log"; then
      echo "server started (pgid $(cat "$pidfile")): $(grep -m 1 'Starreach on' "$log")"
      echo "follow with: just logs    stop with: just down"
      return
    fi
    if [ -s "$pidfile" ] && ! running "$pidfile"; then
      echo "server exited during startup; the log:" >&2
      cat "$log" >&2
      exit 1
    fi
    sleep 0.1
  done
  echo "server not ready after 10 s; see $log (still running, stop with: just down)" >&2
  exit 1
}

# TERM to the process group, then KILL after 4 s.
down() {
  local pidfile=$1
  if ! running "$pidfile"; then
    rm -f "$pidfile"
    echo "server not running"
    return
  fi
  local pgid
  pgid=$(cat "$pidfile")
  rm -f "$pidfile"
  kill -TERM -- "-$pgid" 2>/dev/null || true
  for _ in $(seq 1 40); do
    if ! pgrep -g "$pgid" >/dev/null 2>&1; then
      echo "server stopped (pgid $pgid)"
      return
    fi
    sleep 0.1
  done
  kill -KILL -- "-$pgid" 2>/dev/null || true
  echo "server killed (pgid $pgid)"
}

command=$1
shift
case "$command" in
  wasm-ready) wasm_ready ;;
  up) up "$@" ;;
  down) down "$@" ;;
  *) echo "unknown command: $command" >&2; exit 2 ;;
esac
