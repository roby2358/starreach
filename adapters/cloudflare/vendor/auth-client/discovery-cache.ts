import type { DiscoveryDoc } from "./types.js";
import type { Fetcher } from "./jwks-cache.js";

interface CacheEntry {
  readonly fetched_at_ms: number;
  readonly doc: DiscoveryDoc;
}

const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

export function _resetDiscoveryCacheForTests(): void {
  cache.clear();
}

export async function getDiscovery(
  issuer: string,
  fetcher: Fetcher,
  now_ms: number = Date.now(),
): Promise<DiscoveryDoc> {
  const existing = cache.get(issuer);
  if (existing !== undefined && now_ms - existing.fetched_at_ms < TTL_MS) {
    return existing.doc;
  }

  try {
    const url = `${issuer}/.well-known/openid-configuration`;
    const res = await fetcher(url);
    if (!res.ok) {
      throw new Error(`discovery fetch failed: ${res.status}`);
    }
    const doc = (await res.json()) as DiscoveryDoc;
    cache.set(issuer, { fetched_at_ms: now_ms, doc });
    return doc;
  } catch (err) {
    if (existing !== undefined) {
      console.warn(
        `discovery-cache: upstream fetch failed for ${issuer}, serving stale (${(err as Error).message})`,
      );
      return existing.doc;
    }
    throw err;
  }
}
