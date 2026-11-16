// Shared setup for app tests: the real WASM core, an in-memory store, and an MCP client
// connected in process.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer, loadCore, MemoryPlayerStore, MemoryStore, viewId, type CommandResult, type GoalState, type McpDeps, type Viewers } from "../../src/index.ts";

const WASM = new URL("../../src/wasm/starreach_core_bg.wasm", import.meta.url);
const core = loadCore(new WebAssembly.Module(readFileSync(fileURLToPath(WASM))));

/** The real time every test game starts at: midnight on Unix day 20773, stardate 102.0773.00.0. */
export const START_UNIX_SECONDS = 20_773 * 86_400;

/** Keeps every frame published, as [gameId, frame] pairs. */
export class RecordingViewers implements Viewers {
  readonly published: [string, string][] = [];

  async publish(gameId: string, frame: string): Promise<void> {
    this.published.push([gameId, frame]);
  }
}

export function testDeps(): McpDeps & { viewers: RecordingViewers } {
  return {
    core,
    store: new MemoryStore(),
    players: new MemoryPlayerStore(),
    random: () => 0,
    viewers: new RecordingViewers(),
    viewOrigin: "http://viewer.test",
    unixSeconds: () => START_UNIX_SECONDS,
    instructions: "Test instructions",
    player: null,
  };
}

/** The goals a Result's state shows. */
export function goalsOf(result: CommandResult): GoalState[] {
  return result.state!.goals as GoalState[];
}

/** Stores a game one of whose goals is `amount` on `counter`, and returns its game_id. A game's
 *  goals follow from its seed, so this takes the first seed from 0 that sets that goal. */
export async function storeGameWithGoal(deps: McpDeps, counter: string, amount: number): Promise<string> {
  for (let seed = 0; seed < 10_000; seed++) {
    const game = deps.core.newGame(seed, START_UNIX_SECONDS);
    const goals = goalsOf(deps.core.apply(game, { type: "state" })!.result);
    if (goals.some((goal) => goal.counter === counter && goal.amount === amount)) {
      const gameId = `game-with-goal-${seed}`;
      await deps.store.put(await viewId(gameId), game);
      return gameId;
    }
  }
  throw new Error(`No seed below 10000 sets a goal of ${amount} on ${counter}`);
}

export async function connectClient(deps: McpDeps): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(deps).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

/** Calls a tool and parses its Result. */
export async function call(client: Client, name: string, args: Record<string, unknown>): Promise<CommandResult> {
  const response = await client.callTool({ name, arguments: args });
  const [content] = response.content as { type: string; text: string }[];
  return JSON.parse(content.text);
}
