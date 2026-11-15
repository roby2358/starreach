export interface AccessTokenClaims {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly kid: string;
  readonly scope: string;
}

export interface Jwk {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly alg: "EdDSA";
  readonly use: "sig";
  readonly kid: string;
  readonly x: string;
}

export interface JwksDoc {
  readonly keys: ReadonlyArray<Jwk>;
}

export interface DiscoveryDoc {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly userinfo_endpoint: string;
  readonly jwks_uri: string;
  readonly response_types_supported: ReadonlyArray<string>;
  readonly grant_types_supported: ReadonlyArray<string>;
  readonly code_challenge_methods_supported: ReadonlyArray<string>;
  readonly subject_types_supported: ReadonlyArray<string>;
  readonly id_token_signing_alg_values_supported: ReadonlyArray<string>;
  readonly scopes_supported: ReadonlyArray<string>;
  readonly token_endpoint_auth_methods_supported: ReadonlyArray<string>;
}

export type VerifyResult =
  | { valid: true; claims: AccessTokenClaims }
  | { valid: false; reason: VerifyFailureReason };

export type VerifyFailureReason =
  | "malformed_token"
  | "unknown_version"
  | "invalid_base64url"
  | "invalid_signature_length"
  | "invalid_cbor"
  | "missing_claim"
  | "unknown_kid"
  | "bad_signature"
  | "expired"
  | "not_yet_valid"
  | "wrong_issuer"
  | "wrong_audience";
