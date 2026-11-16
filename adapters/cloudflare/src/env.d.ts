// The Worker's bindings (wrangler.jsonc) and the non-JavaScript modules wrangler bundles.

declare namespace Cloudflare {
  /** Types `exports` from "cloudflare:workers" by the Worker's own exports. */
  interface GlobalProps {
    mainModule: typeof import("./worker.ts");
  }

  interface Env {
    /** One Durable Object per view_id. */
    GAMES: DurableObjectNamespace<import("./game_object.ts").GameObject>;
    /** One Durable Object per player id (the auth/ `sub`), holding the player's lifetime totals. */
    PLAYERS: DurableObjectNamespace<import("./player_object.ts").PlayerObject>;
    /** The telemetry database: the tables of telemetry_schema.sql. */
    TELEMETRY: D1Database;
    /** The auth/ Worker, for its JWKS (a service binding, never a public same-zone fetch). */
    AUTH_SERVICE: Fetcher;
    /** auth/'s issuer, the `iss` every access token must carry. */
    AUTH_ISSUER: string;
    /** The MCP endpoint's canonical URL: the `resource` clients name, and a token audience auth/ writes for it. */
    STARREACH_RESOURCE: string;
    /** Starreach's client_id in auth/: the token audience when a client names no resource. */
    STARREACH_CLIENT_ID: string;
  }
}

interface Env extends Cloudflare.Env {}

declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

declare module "*.sql" {
  const text: string;
  export default text;
}

declare module "*.txt" {
  const text: string;
  export default text;
}
