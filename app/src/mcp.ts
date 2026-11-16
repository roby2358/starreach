// The MCP surface (ONTOLOGY "MCP tools"): new_game, one tool per core command, and the
// instructions, sent as the server's instructions and as a prompt. Every tool returns the core Result as JSON text.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CommandResult } from "./core.ts";
import { newGame, runCommand, type Games } from "./games.ts";

export interface McpDeps extends Games {
  /** The decorum and rendering instructions for the LLM (public/instructions.txt). */
  instructions: string;
  /** The signed-in player's auth/ `sub`, or null on an endpoint without sign-in. */
  player: string | null;
}

const GAME_ID = { game_id: z.string().describe("The game_id that new_game returned") };
const COORDINATES = {
  y: z.number().int().describe("Row, 0..9"),
  x: z.number().int().describe("Column, 0..9"),
};

/** How to read an action's `report.time`, said on every tool that takes time. */
const TIME_NOTE = "report.time is how long it took, in stardates (a stardate is a day) written d.dd.d: 0.00.2 is 0.002 stardates, about 4 minutes";

/** One row per core command: the tool name is the command type. */
const COMMAND_TOOLS = [
  { type: "state", args: {}, description: "The current game state: ship, sector map, stardate, enemies (range, bearing, clear shot). A stardate is a day, written ddd.dddd.dd.d: 102.0773.36.5 is stardate 1020773.365" },
  { type: "galaxy_map", args: {}, description: "The 10x10 galaxy map: E|B|S (enemies|starbases|stars) per visible sector, ..... when hidden" },
  { type: "galaxy_warp", args: COORDINATES, description: `Warp the ship to sector (y, x). The next sector is about a day away, far longer than a battle, and costs real energy (thousands; report.energy_cost says how much); farther sectors take and cost only a little more, so one long jump beats several hops. The ship arrives with its shields recharged to full, at 1 energy per 10 shield points on top of the warp (told in events), as far as its energy allows; the hull is not repaired. Enemies in the current sector get a turn first; enemies in the new sector may fire on arrival (30% each). ${TIME_NOTE}` },
  { type: "subwarp", args: COORDINATES, description: `Move the ship within the sector toward cell (y, x), stopping before obstacles; at most 3 cells while enemies are present. ${TIME_NOTE}` },
  { type: "dock", args: {}, description: `Dock with an adjacent starbase in a cleared sector: restores hull, shields, energy and quantorpedoes. ${TIME_NOTE}` },
  { type: "long_range_scan", args: {}, description: `Reveal E|B|S for the 3x3 block of sectors around the ship. Takes a full turn of time, so enemies present act after it. ${TIME_NOTE}` },
  { type: "blast", args: COORDINATES, description: `Fire a blaston beam toward cell (y, x); it hits the first enemy on the line, up to range 9. It kills 90% of the time up to range 4, falling to 10% at 9; a miss still costs its energy and time (report.destroyed). ${TIME_NOTE}` },
  { type: "torpedo", args: COORDINATES, description: `Fire a quantorpedo toward cell (y, x); it hits the first enemy on the line, at any range. ${TIME_NOTE}` },
] as const;

function whoami(player: string | null) {
  return player === null ? { signed_in: false } : { signed_in: true, player };
}

function asToolResult(result: CommandResult) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: "Starreach", version: "0.1.0" }, { instructions: deps.instructions });

  server.registerPrompt(
    "instructions",
    { description: "How to play the crew: decorum and how to render the sector, scan and map" },
    () => ({ messages: [{ role: "user", content: { type: "text", text: deps.instructions } }] }),
  );

  server.registerTool(
    "new_game",
    { description: "Start a new game; pass report.game_id to every other tool. report.viewer_url is the live viewer's link" },
    async () => asToolResult(await newGame(deps)),
  );

  server.registerTool(
    "whoami",
    { description: "Who the ship's computer is serving: the signed-in player's id, or signed_in false when this connection has no sign-in" },
    async () => ({ content: [{ type: "text" as const, text: JSON.stringify(whoami(deps.player)) }] }),
  );

  for (const tool of COMMAND_TOOLS) {
    server.registerTool(
      tool.type,
      { description: tool.description, inputSchema: { ...GAME_ID, ...tool.args } },
      async ({ game_id, ...args }: { game_id: string; [arg: string]: unknown }) =>
        asToolResult(await runCommand(deps, game_id, { type: tool.type, ...args })),
    );
  }

  return server;
}
