// The adapter's tests run inside workerd, with the bindings wrangler.jsonc declares.
// Durable Object WebSockets aren't supported with per-file storage isolation, so the files
// share one worker and its storage; each test makes its own game.

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: { include: ["test/**/*.test.ts"], maxWorkers: 1, isolate: false },
});
