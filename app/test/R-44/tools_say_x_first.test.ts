// R-44 (app layer): the MCP tools take and describe a coordinate x first (column, then row),
// and the instructions the LLM is given say the same.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { call, connectClient, testDeps } from "../helpers/deps.ts";

const COORDINATE_TOOLS = ["galaxy_warp", "subwarp", "blast", "torpedo"];
/** A pair written y first, or the order put into words that way. */
const Y_FIRST = /\(\s*y\s*,\s*x\s*\)|\[\s*y\s*,\s*x\s*\]|row,? then column|row first|vertical, horizontal/i;
const INSTRUCTIONS = new URL("../../../public/instructions.txt", import.meta.url);

test("every coordinate tool declares x before y, and says (x, y)", async () => {
  const client = await connectClient(testDeps());
  const { tools } = await client.listTools();
  for (const name of COORDINATE_TOOLS) {
    const tool = tools.find((candidate) => candidate.name === name)!;
    const args = Object.keys(tool.inputSchema.properties!);
    assert.ok(args.includes("x") && args.includes("y"), `${name} takes x and y`);
    assert.ok(args.indexOf("x") < args.indexOf("y"), `${name} declares ${args.join(", ")}`);
    assert.match(tool.description!, /\(x, y\)/, `${name} describes its cell as (x, y)`);
    assert.match(JSON.stringify(tool.inputSchema.properties!.x), /Column/);
    assert.match(JSON.stringify(tool.inputSchema.properties!.y), /Row/);
  }
});

test("no tool describes a pair y first", async () => {
  const client = await connectClient(testDeps());
  const { tools } = await client.listTools();
  for (const tool of tools) {
    assert.doesNotMatch(`${tool.description} ${JSON.stringify(tool.inputSchema)}`, Y_FIRST, tool.name);
  }
});

test("the instructions give coordinates as (x, y) and never y first", () => {
  const instructions = readFileSync(INSTRUCTIONS, "utf8");
  assert.match(instructions, /\(x, y\)/);
  assert.doesNotMatch(instructions, Y_FIRST);
});

test("a tool's x is the column and its y the row of the map it returns", async () => {
  const client = await connectClient(testDeps());
  const started = await call(client, "new_game", {});
  const gameId = started.report!.game_id as string;
  const [shipX, shipY] = started.state!.ship_xy as [number, number];
  assert.equal((started.state!.map as string[])[shipY][shipX], "S");

  const warped = await call(client, "galaxy_warp", { game_id: gameId, x: 6, y: 4 });
  assert.deepEqual(warped.report!.sector_xy, [6, 4]);
  assert.deepEqual(warped.state!.sector_xy, [6, 4]);
  const galaxy = await call(client, "galaxy_map", { game_id: gameId });
  const rows = (galaxy.report!.map as string[]).map((row) => row.split(" "));
  assert.notEqual(rows[4][6], ".....", "the sector warped to is charted in row 4, column 6");
  assert.equal(rows[6][4], ".....", "row 6, column 4 is still uncharted");
});
