// The MCP surface (ONTOLOGY "MCP tools"): new_game, one tool per core command, and the
// instructions prompt. Every tool returns the core Result as JSON text.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CommandResult } from "./core.ts";
import { newGame, runCommand, type Games } from "./games.ts";

export interface McpDeps extends Games {
  /** The decorum and rendering instructions for the LLM (public/instructions.txt). */
  instructions: string;
}

const GAME_ID = { game_id: z.string().describe("The game_id that new_game returned") };
const COORDINATES = {
  y: z.number().int().describe("Row, 0..9"),
  x: z.number().int().describe("Column, 0..9"),
};

/** One row per core command: the tool name is the command type. */
const COMMAND_TOOLS = [
  { type: "state", args: {}, description: "The current game state: ship, sector map, stardate" },
  { type: "galaxy_map", args: {}, description: "The 10x10 galaxy map: E|B|S (enemies|starbases|stars) per visible sector, ..... when hidden" },
  { type: "galaxy_warp", args: COORDINATES, description: "Warp the ship to sector (y, x). Enemies in the current sector get a turn first" },
  { type: "subwarp", args: COORDINATES, description: "Move the ship within the sector toward cell (y, x), stopping before obstacles" },
  { type: "dock", args: {}, description: "Dock with an adjacent starbase in a cleared sector: restores hull, shields, energy and quantorpedoes" },
  { type: "long_range_scan", args: {}, description: "Scan the 3x3 block of sectors around the ship, revealing E|B|S for each" },
  { type: "blast", args: COORDINATES, description: "Fire a blaston beam toward cell (y, x); it hits the first enemy on the line, within range" },
  { type: "torpedo", args: COORDINATES, description: "Fire a quantorpedo toward cell (y, x); it hits the first enemy on the line, at any range" },
] as const;

function asToolResult(result: CommandResult) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: "Starreach", version: "0.1.0" });

  server.registerPrompt(
    "instructions",
    { description: "How to play the crew: decorum and how to render the sector, scan and map" },
    () => ({ messages: [{ role: "user", content: { type: "text", text: deps.instructions } }] }),
  );

  server.registerTool(
    "new_game",
    { description: "Start a new game. Returns its game_id in report.game_id; pass it to every other tool" },
    async () => asToolResult(await newGame(deps)),
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
