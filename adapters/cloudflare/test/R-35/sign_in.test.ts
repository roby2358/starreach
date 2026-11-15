// R-35: /mcp needs an auth/ access token. Without one, the 401 points an MCP client at the
// protected resource metadata, which names auth/; with a valid token the player is its sub.

import { env, exports } from "cloudflare:workers";
import { expect, test } from "vitest";

import { signIn } from "../../src/auth.ts";
import { claimsAt, mint, PLAYER } from "../helpers/tokens.ts";
import { BASE, callTool } from "../helpers/worker.ts";

const NOW = 1_800_000_000;

function withToken(token: string): Request {
  return new Request(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
}

async function refusal(claims: ReturnType<typeof claimsAt>): Promise<Response> {
  const result = await signIn(withToken(await mint(claims)), BASE, env, NOW);
  expect(result.ok).toBe(false);
  return (result as { ok: false; response: Response }).response;
}

test("without a token, /mcp answers 401 pointing at the protected resource metadata", async () => {
  const response = await exports.default.fetch(`${BASE}/mcp`, { method: "POST", body: "{}" });
  expect(response.status).toBe(401);
  const challenge = response.headers.get("www-authenticate")!;
  expect(challenge).toContain(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`);
  expect(challenge).toContain(`scope="starreach:play"`);
  await response.text();
});

test("the metadata names the MCP resource and auth/, at the root and path-inserted URLs", async () => {
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    const metadata = (await (await exports.default.fetch(`${BASE}${path}`)).json()) as Record<string, unknown>;
    expect(metadata.resource).toBe(env.STARREACH_RESOURCE);
    expect(metadata.authorization_servers).toEqual([env.AUTH_ISSUER]);
    expect(metadata.scopes_supported).toEqual(["starreach:play"]);
  }
});

test("a valid token signs in its sub", async () => {
  const token = await mint(claimsAt(NOW));
  expect(await signIn(withToken(token), BASE, env, NOW)).toEqual({ ok: true, player: PLAYER });
});

test("a token whose audience is Starreach's resource URL signs in too", async () => {
  const token = await mint({ ...claimsAt(NOW), aud: env.STARREACH_RESOURCE });
  expect(await signIn(withToken(token), BASE, env, NOW)).toEqual({ ok: true, player: PLAYER });
});

test("a token for another client, from another issuer, or expired is refused with 401", async () => {
  const cases = [
    { ...claimsAt(NOW), aud: "someone-else" },
    { ...claimsAt(NOW), aud: "https://another.example/mcp" },
    { ...claimsAt(NOW), aud: `${env.STARREACH_RESOURCE}/` },
    { ...claimsAt(NOW), iss: "https://elsewhere.test" },
    { ...claimsAt(NOW - 7200), exp: NOW - 3600 },
  ];
  for (const claims of cases) {
    const response = await refusal(claims);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(`error="invalid_token"`);
  }
});

test("a token without the play scope is refused with 403", async () => {
  expect((await refusal({ ...claimsAt(NOW), scope: "" })).status).toBe(403);
});

test("whoami over /mcp reports the signed-in player", async () => {
  expect(await callTool("whoami", {})).toEqual({ signed_in: true, player: PLAYER });
});
