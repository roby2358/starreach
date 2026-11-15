// The adapter's tests run inside workerd, with the bindings wrangler.jsonc declares.
// Durable Object WebSockets aren't supported with per-file storage isolation, so the files
// share one worker and its storage; each test makes its own game.

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// A stand-in for auth/ behind AUTH_SERVICE: it serves the public half of the test-only key in
// test/helpers/tokens.ts as auth/'s JWKS, so tests can sign in with tokens they mint.
const TEST_JWKS = { keys: [{ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig", kid: "test-key", x: "L9KIV4lARywkMIgEzR3PT9KQLTAZFc5R0CyMJfWlosA" }] };
const AUTH_STUB = `export default { fetch() { return Response.json(${JSON.stringify(TEST_JWKS)}); } };`;

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { workers: [{ name: "auth", modules: true, script: AUTH_STUB }] },
    }),
  ],
  test: { include: ["test/**/*.test.ts"], maxWorkers: 1, isolate: false },
});
