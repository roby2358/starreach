// `just telemetry` runs `bash tools/server.sh telemetry <host> <port>`: it prints what the local
// server's /telemetry gives, and fails with a message that says what to do when no server is there.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { newGame, runCommand } from "@starreach/app";

import { startServer, stopServer, TEST_CLIENT } from "../helpers/server.ts";

const SCRIPT = fileURLToPath(new URL("../../../../tools/server.sh", import.meta.url));

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

function runTelemetry(port: number): Promise<Ran> {
  return new Promise((resolve) => {
    execFile("bash", [SCRIPT, "telemetry", "127.0.0.1", String(port)], (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : (error.code as number), stdout, stderr });
    });
  });
}

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address() as { port: number };
  probe.close();
  await once(probe, "close");
  return port;
}

test("it prints the running server's records, a JSON object per line", async () => {
  const running = await startServer();
  try {
    const created = await newGame(running.deps, TEST_CLIENT);
    await runCommand(running.deps, created.report!.game_id as string, { type: "long_range_scan" });

    const ran = await runTelemetry(running.port);

    assert.equal(ran.code, 0, ran.stderr);
    const lines = ran.stdout.split("\n").slice(0, -1).map((line) => JSON.parse(line));
    assert.deepEqual(lines, [
      ...running.deps.telemetry.games().map((game) => ({ game })),
      ...running.deps.telemetry.events().map((event) => ({ event })),
    ]);
    assert.equal(lines.length, 2);
  } finally {
    await stopServer(running);
  }
});

test("with no server on the port it fails and says to start one", async () => {
  const ran = await runTelemetry(await freePort());

  assert.equal(ran.code, 1);
  assert.equal(ran.stdout, "");
  assert.match(ran.stderr, /no local server is running at http:\/\/127\.0\.0\.1:\d+; start one with: just up/);
});
