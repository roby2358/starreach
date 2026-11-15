// Sign-in for MCP (D-41, D-20): `/mcp` serves only a player signed in with auth/.
//
// Starreach is an OAuth resource server only: it never runs a sign-in flow (yuwakisacloud's rule).
// An MCP client that calls `/mcp` without a token gets 401 with a pointer to the protected
// resource metadata (RFC 9728), which names auth/ as the authorization server. The client signs
// the player in there ("Sign in with Bluesky" on auth/'s page) and comes back with a bearer token,
// which this verifies offline with the vendored auth-client. auth/'s keys are fetched through the
// AUTH_SERVICE binding, not a public fetch to auth.yuwakisa.com: a Worker-to-Worker fetch within
// the zone returned an edge 522 in production for jsonsolver.

import { verifyAccessToken } from "../vendor/auth-client/index.ts";

export const MCP_PATH = "/mcp";
export const METADATA_PATH = "/.well-known/oauth-protected-resource";

/** The scope a token must carry to play. auth/ grants it only to clients allowed it. */
export const PLAY_SCOPE = "starreach:play";
const CLOCK_SKEW_S = 60;

export type SignIn = { ok: true; player: string } | { ok: false; response: Response };

/** RFC 9728 metadata for `/mcp`, served at the root and at the path-inserted URL. */
export function isMetadataPath(path: string): boolean {
  return path === METADATA_PATH || path === `${METADATA_PATH}${MCP_PATH}`;
}

export function protectedResourceMetadata(origin: string, env: Env): Response {
  const body = {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [env.AUTH_ISSUER],
    scopes_supported: [PLAY_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Starreach",
  };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}

/** The signed-in player, or the 401 that sends an MCP client to sign in. */
export async function signIn(request: Request, origin: string, env: Env, nowSeconds: number): Promise<SignIn> {
  const token = bearerToken(request);
  if (token === undefined) {
    return refuse(origin, "invalid_request", "Sign in to play");
  }
  const result = await verifyAccessToken(token, {
    expected_issuer: env.AUTH_ISSUER,
    expected_audience: env.STARREACH_CLIENT_ID,
    fetcher: (input, init) => env.AUTH_SERVICE.fetch(input, init),
    now_s: nowSeconds,
    clock_skew_s: CLOCK_SKEW_S,
  });
  if (!result.valid) {
    return refuse(origin, "invalid_token", result.reason);
  }
  if (!result.claims.scope.split(" ").includes(PLAY_SCOPE)) {
    return refuse(origin, "insufficient_scope", `The token lacks ${PLAY_SCOPE}`);
  }
  return { ok: true, player: result.claims.sub };
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }
  const token = header.slice("bearer ".length).trim();
  return token === "" ? undefined : token;
}

function refuse(origin: string, error: string, description: string): SignIn {
  const challenge = [
    `Bearer resource_metadata="${origin}${METADATA_PATH}${MCP_PATH}"`,
    `scope="${PLAY_SCOPE}"`,
    `error="${error}"`,
    `error_description="${description}"`,
  ].join(", ");
  const status = error === "insufficient_scope" ? 403 : 401;
  return {
    ok: false,
    response: Response.json({ error, error_description: description }, { status, headers: { "WWW-Authenticate": challenge } }),
  };
}
