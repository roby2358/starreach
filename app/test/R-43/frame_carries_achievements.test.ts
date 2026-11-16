// R-43 (app layer): a view frame carries the achievements of the player who started the game,
// both the frame published after a command and the one a viewer gets on connecting, as rows and
// never with the player's id.

import assert from "node:assert/strict";
import { test } from "node:test";

import { achievements, currentFrame, LOCAL_PLAYER, newGame, runCommand, viewId } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";

const ALICE = "player-alice-0001";
const BOB = "player-bob-0002";

async function startGame(deps: ReturnType<typeof testDeps>): Promise<{ gameId: string; view: string }> {
  const gameId = (await newGame(deps)).report!.game_id as string;
  return { gameId, view: await viewId(gameId) };
}

function scansRow(frame: string) {
  return JSON.parse(frame).achievements.find((row: { key: string }) => row.key === "scans");
}

test("new_game stores the player who started the game beside it", async () => {
  const deps = testDeps();
  const signedIn = await startGame({ ...deps, player: ALICE });
  const local = await startGame(deps);

  assert.equal((await deps.store.get(signedIn.view))!.player, ALICE);
  assert.equal((await deps.store.get(local.view))!.player, LOCAL_PLAYER);
});

test("the frame a viewer gets on connecting carries the starting player's achievements, with no command run", async () => {
  const deps = { ...testDeps(), player: ALICE };
  await deps.players.add(ALICE, { enemies_destroyed: 137, scans: 2 });
  const { view } = await startGame(deps);

  const frame = JSON.parse((await currentFrame(deps, view))!);

  assert.deepEqual(frame.achievements, await achievements(deps, ALICE));
  assert.deepEqual(frame.achievements[0], { key: "enemies_destroyed", label: "enemies destroyed", total: 137, reached: 100, next: 200 });
  assert.deepEqual(deps.viewers.published, []);
});

test("the frame published after a command carries them too, with what that command counted", async () => {
  const deps = { ...testDeps(), player: ALICE };
  await deps.players.add(ALICE, { scans: 4 });
  const { gameId } = await startGame(deps);

  await runCommand(deps, gameId, { type: "long_range_scan" });

  const [[, frame]] = deps.viewers.published;
  assert.deepEqual(JSON.parse(frame).achievements, await achievements(deps, ALICE));
  assert.deepEqual(scansRow(frame), { key: "scans", label: "long range scans", total: 5, reached: 5, next: 10 });
});

test("with no sign-in the achievements are the local player's", async () => {
  const deps = testDeps();
  await deps.players.add(LOCAL_PLAYER, { scans: 1 });
  const { gameId, view } = await startGame(deps);

  assert.deepEqual(scansRow((await currentFrame(deps, view))!), { key: "scans", label: "long range scans", total: 1, reached: 1, next: 2 });
  await runCommand(deps, gameId, { type: "long_range_scan" });
  assert.deepEqual(scansRow(deps.viewers.published[0][1]), { key: "scans", label: "long range scans", total: 2, reached: 2, next: 5 });
});

test("another player's command leaves the frame with the achievements of the player who started the game", async () => {
  const deps = testDeps();
  await deps.players.add(ALICE, { scans: 2 });
  const { gameId, view } = await startGame({ ...deps, player: ALICE });

  const scan = await runCommand({ ...deps, player: BOB }, gameId, { type: "long_range_scan" });

  assert.equal(scan.ok, true);
  assert.deepEqual(await deps.players.totals(BOB), { scans: 1 });
  assert.equal((await deps.store.get(view))!.player, ALICE);
  const alices = { key: "scans", label: "long range scans", total: 2, reached: 2, next: 5 };
  assert.deepEqual(scansRow(deps.viewers.published[0][1]), alices);
  assert.deepEqual(scansRow((await currentFrame(deps, view))!), alices);
});

test("a frame holds the view and the achievement rows, and never the player's id", async () => {
  const deps = { ...testDeps(), player: ALICE };
  const { gameId, view } = await startGame(deps);
  await runCommand(deps, gameId, { type: "long_range_scan" });

  for (const frame of [deps.viewers.published[0][1], (await currentFrame(deps, view))!]) {
    assert.deepEqual(Object.keys(JSON.parse(frame)).sort(), ["achievements", "type", "view"]);
    assert.ok(!frame.includes(ALICE), "the frame names the player");
    assert.ok(!frame.includes(gameId), "the frame names the game_id");
  }
});
