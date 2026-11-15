# Vendored auth-client

Copied verbatim from yuwakisacloud `jsonsolver/auth-client/src/` at commit
`2b4a3b378dae63a3317a806fd74e6a61f20833ea` (2026-10-06), the last commit touching that directory.

It verifies auth/'s access tokens offline (`verifyAccessToken`: Ed25519 over a CBOR claims map,
JWKS cached for 5 minutes, pins issuer, audience and time). Don't edit it here: if auth/ changes
its token format, re-copy from the source and update the commit above. Before each deploy, check
that the source directory hasn't changed since that commit.
