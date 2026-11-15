import type { Jwk, JwksDoc } from "./types.js";

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface CacheEntry {
  readonly fetched_at_ms: number;
  readonly keys: Map<string, CryptoKey>;
}

const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

export function _resetJwksCacheForTests(): void {
  cache.clear();
}

export async function getJwks(
  issuer: string,
  fetcher: Fetcher,
  now_ms: number = Date.now(),
): Promise<Map<string, CryptoKey>> {
  const existing = cache.get(issuer);
  if (existing !== undefined && now_ms - existing.fetched_at_ms < TTL_MS) {
    return existing.keys;
  }

  try {
    const url = `${issuer}/.well-known/jwks.json`;
    const res = await fetcher(url);
    if (!res.ok) {
      throw new Error(`jwks fetch failed: ${res.status}`);
    }
    const doc = (await res.json()) as JwksDoc;
    const keys = await importJwks(doc);
    const entry: CacheEntry = { fetched_at_ms: now_ms, keys };
    cache.set(issuer, entry);
    return keys;
  } catch (err) {
    if (existing !== undefined) {
      console.warn(
        `jwks-cache: upstream fetch failed for ${issuer}, serving stale (${(err as Error).message})`,
      );
      return existing.keys;
    }
    throw err;
  }
}

async function importJwks(doc: JwksDoc): Promise<Map<string, CryptoKey>> {
  const out = new Map<string, CryptoKey>();
  for (const jwk of doc.keys) {
    if (
      jwk.kty !== "OKP" ||
      jwk.crv !== "Ed25519" ||
      jwk.alg !== "EdDSA" ||
      jwk.use !== "sig"
    ) {
      continue;
    }
    const key = await importEd25519Jwk(jwk);
    out.set(jwk.kid, key);
  }
  return out;
}

async function importEd25519Jwk(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      crv: jwk.crv,
      alg: jwk.alg,
      use: jwk.use,
      x: jwk.x,
      key_ops: ["verify"],
      ext: true,
    },
    { name: "Ed25519" },
    false,
    ["verify"],
  );
}
