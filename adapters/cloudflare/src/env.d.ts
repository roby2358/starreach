// The Worker's bindings (wrangler.jsonc) and the non-JavaScript modules wrangler bundles.

declare namespace Cloudflare {
  /** Types `exports` from "cloudflare:workers" by the Worker's own exports. */
  interface GlobalProps {
    mainModule: typeof import("./worker.ts");
  }

  interface Env {
    /** One Durable Object per view_id. */
    GAMES: DurableObjectNamespace<import("./game_object.ts").GameObject>;
    /** The auth/ Worker, for its JWKS (a service binding, never a public same-zone fetch). */
    AUTH_SERVICE: Fetcher;
    /** auth/'s issuer, the `iss` every access token must carry. */
    AUTH_ISSUER: string;
    /** Starreach's client_id in auth/, the `aud` every access token must carry. */
    STARREACH_CLIENT_ID: string;
  }
}

interface Env extends Cloudflare.Env {}

declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

declare module "*.txt" {
  const text: string;
  export default text;
}
