import { Decoder } from "cbor-x";
import { getJwks, type Fetcher } from "./jwks-cache.js";
import type {
  AccessTokenClaims,
  VerifyFailureReason,
  VerifyResult,
} from "./types.js";

export interface VerifyOptions {
  readonly expected_issuer: string;
  readonly expected_audience: string;
  readonly fetcher: Fetcher;
  readonly now_s: number;
  readonly clock_skew_s: number;
}

const ACCESS_TOKEN_VERSION = "01";
const SIG_LEN = 64;
const CBOR_KEY_ISS = 1;
const CBOR_KEY_SUB = 2;
const CBOR_KEY_AUD = 3;
const CBOR_KEY_EXP = 4;
const CBOR_KEY_IAT = 5;
const CBOR_KEY_KID = 6;
const CBOR_KEY_SCOPE = 7;

const decoder = new Decoder({ mapsAsObjects: false });

export async function verifyAccessToken(
  token: string,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return fail("malformed_token");
  const version = token.slice(0, dotIdx);
  const body_b64 = token.slice(dotIdx + 1);
  if (version !== ACCESS_TOKEN_VERSION) return fail("unknown_version");
  if (body_b64.length === 0) return fail("malformed_token");

  let body: Uint8Array;
  try {
    body = decodeBase64Url(body_b64);
  } catch {
    return fail("invalid_base64url");
  }
  if (body.length <= SIG_LEN) return fail("invalid_signature_length");

  const signature = body.subarray(0, SIG_LEN);
  const cbor = body.subarray(SIG_LEN);

  let claimsMap: Map<unknown, unknown>;
  try {
    const decoded = decoder.decode(cbor) as unknown;
    if (!(decoded instanceof Map)) return fail("invalid_cbor");
    claimsMap = decoded as Map<unknown, unknown>;
  } catch {
    return fail("invalid_cbor");
  }

  const claims = extractClaims(claimsMap);
  if (claims === null) return fail("missing_claim");

  let jwks: Map<string, CryptoKey>;
  try {
    jwks = await getJwks(opts.expected_issuer, opts.fetcher);
  } catch {
    return fail("unknown_kid");
  }
  const publicKey = jwks.get(claims.kid);
  if (publicKey === undefined) return fail("unknown_kid");

  // Literal ASCII "01" (0x30 0x31), NOT hex 0x01. The version is signed.
  const versionBytes = new TextEncoder().encode(version);
  const signedMessage = new Uint8Array(versionBytes.length + cbor.length);
  signedMessage.set(versionBytes, 0);
  signedMessage.set(cbor, versionBytes.length);

  const sigOk = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    signature,
    signedMessage,
  );
  if (!sigOk) return fail("bad_signature");

  if (claims.iss !== opts.expected_issuer) return fail("wrong_issuer");
  if (claims.aud !== opts.expected_audience) return fail("wrong_audience");
  if (opts.now_s + opts.clock_skew_s < claims.iat) return fail("not_yet_valid");
  if (opts.now_s >= claims.exp + opts.clock_skew_s) return fail("expired");

  return { valid: true, claims };
}

function fail(reason: VerifyFailureReason): VerifyResult {
  return { valid: false, reason };
}

function extractClaims(map: Map<unknown, unknown>): AccessTokenClaims | null {
  const iss = map.get(CBOR_KEY_ISS);
  const sub = map.get(CBOR_KEY_SUB);
  const aud = map.get(CBOR_KEY_AUD);
  const exp = map.get(CBOR_KEY_EXP);
  const iat = map.get(CBOR_KEY_IAT);
  const kid = map.get(CBOR_KEY_KID);
  const scope = map.get(CBOR_KEY_SCOPE);

  if (
    typeof iss !== "string" ||
    typeof sub !== "string" ||
    typeof aud !== "string" ||
    typeof kid !== "string" ||
    typeof scope !== "string"
  ) {
    return null;
  }
  const expNum = toUint(exp);
  const iatNum = toUint(iat);
  if (expNum === null || iatNum === null) return null;

  return {
    iss,
    sub,
    aud,
    exp: expNum,
    iat: iatNum,
    kid,
    scope,
  };
}

function toUint(v: unknown): number | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
  if (typeof v === "bigint" && v >= 0n && v <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(v);
  }
  return null;
}

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function decodeBase64Url(s: string): Uint8Array {
  if (!BASE64URL_RE.test(s)) {
    throw new Error("invalid base64url");
  }
  const swapped = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = swapped.length % 4 === 0 ? "" : "=".repeat(4 - (swapped.length % 4));
  const binary = atob(swapped + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
