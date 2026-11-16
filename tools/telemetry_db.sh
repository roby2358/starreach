#!/usr/bin/env bash
# The Cloudflare adapter's telemetry database (D-53), for `just cf-d1-local`,
# `just cf-d1-production` and `just cf-deploy`: the D1 database bound as TELEMETRY gets the
# tables of the schema file, and nothing is deployed before production's database exists.
#
# A script file, run as `bash tools/telemetry_db.sh …`, for the reason tools/server.sh gives:
# a shebang recipe fails where just's temporary directory is mounted noexec.
#
# Usage:
#   telemetry_db.sh local <wrangler config> <schema file>
#   telemetry_db.sh production <wrangler config> <schema file>
#   telemetry_db.sh deploy-check <wrangler config> [wrangler deploy args]
set -euo pipefail

# The database's name on the Cloudflare account, as wrangler.jsonc has it
DATABASE=starreach-telemetry
# What wrangler.jsonc's production environment holds until the database exists
ID_PLACEHOLDER=PUT-THE-DATABASE-ID-HERE

# Applies the schema to the local database `wrangler dev` uses: files under .wrangler/ beside
# the config, made on first use. Touches nothing on the Cloudflare account.
local_database() {
  local config=$1 schema=$2
  npx wrangler d1 execute "$DATABASE" --local --config "$config" --file "$schema"
}

# Two steps, told apart by whether the config still holds the placeholder id:
# create the production database, then (run again, the id filled in) apply the schema to it.
production_database() {
  local config=$1 schema=$2
  if grep -q "$ID_PLACEHOLDER" "$config"; then
    echo "creating the production D1 database '$DATABASE'"
    npx wrangler d1 create "$DATABASE" --config "$config" --no-update-config
    echo
    echo "next: in $config, in env.production, replace $ID_PLACEHOLDER with the database_id printed above,"
    echo "then run this recipe again to give the database its tables: just cf-d1-production"
    return
  fi
  echo "applying $schema to the production D1 database '$DATABASE'"
  npx wrangler d1 execute "$DATABASE" --remote --env production --config "$config" --file "$schema"
  echo "the production telemetry database has its tables; deploy with: just cf-deploy"
}

# Refuses a deploy while the config still holds the placeholder id: the Worker would have no
# telemetry database. A --dry-run uploads nothing, so it passes.
deploy_check() {
  local config=$1
  shift
  if ! grep -q "$ID_PLACEHOLDER" "$config"; then
    return
  fi
  for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
      return
    fi
  done
  echo "not deploying: $config still holds $ID_PLACEHOLDER, so production has no telemetry database." >&2
  echo "create it first: just cf-d1-production (see the starreach-recipes skill, \"Deploying\")" >&2
  exit 1
}

command=$1
shift
case "$command" in
  local) local_database "$@" ;;
  production) production_database "$@" ;;
  deploy-check) deploy_check "$@" ;;
  *) echo "unknown command: $command" >&2; exit 2 ;;
esac
