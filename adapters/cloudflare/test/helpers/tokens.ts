// auth/-shaped access tokens for tests: "01." + base64url(Ed25519 signature ‖ CBOR claims), signed
// with a test-only key whose public half the auth/ stand-in serves as JWKS (vitest.config.ts).

import { env } from "cloudflare:workers";
import { Encoder } from "cbor-x";

const KID = "test-key";
// Test-only: generated for these tests, never used by any real auth/.
const TEST_PRIVATE_JWK = {
  kty: "OKP",
  crv: "Ed25519",
  x: "L9KIV4lARywkMIgEzR3PT9KQLTAZFc5R0CyMJfWlosA",
  d: "6rKOY5vFpBHa7wU86XfuVJwtN8jcExZojAhezmtfBjw",
};

export const PLAYER = "01PLAYER000000000000000001";

export interface Claims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  scope: string;
}

const encoder = new Encoder({ mapsAsObjects: false, useRecords: false });

/** Claims the Worker accepts at `now`: its issuer and client, an hour to run, the play scope. */
export function claimsAt(now: number): Claims {
  return { iss: env.AUTH_ISSUER, sub: PLAYER, aud: env.STARREACH_CLIENT_ID, exp: now + 3600, iat: now, scope: "starreach:play" };
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function mint(claims: Claims): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", TEST_PRIVATE_JWK, { name: "Ed25519" }, false, ["sign"]);
  const map = new Map<number, string | number>([
    [1, claims.iss], [2, claims.sub], [3, claims.aud], [4, claims.exp], [5, claims.iat], [6, KID], [7, claims.scope],
  ]);
  const cbor = new Uint8Array(encoder.encode(map));
  const signed = new Uint8Array([...new TextEncoder().encode("01"), ...cbor]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, signed));
  return `01.${base64Url(new Uint8Array([...signature, ...cbor]))}`;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
