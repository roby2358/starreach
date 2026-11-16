// R-51 (Cloudflare adapter): the Worker gives no telemetry out. It answers /telemetry as it
// answers any path it doesn't know.

import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";

import { BASE, callTool, createGame } from "../helpers/worker.ts";

async function answer(path: string): Promise<{ status: number; body: string }> {
  const response = await exports.default.fetch(`${BASE}${path}`);
  return { status: response.status, body: await response.text() };
}

test("GET /telemetry is answered like an unknown path, after a game was played", async () => {
  const { gameId } = await createGame();
  await callTool("long_range_scan", { game_id: gameId });

  const telemetry = await answer("/telemetry");

  expect(telemetry.status).toBe(404);
  expect(telemetry).toEqual(await answer("/no-such-path"));
});
