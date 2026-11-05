// Shared setup for app tests: the real WASM core, an in-memory store, and an MCP client
// connected in process.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer, loadCore, MemoryStore, type CommandResult, type McpDeps } from "../../src/index.ts";

const WASM = new URL("../../src/wasm/starreach_core_bg.wasm", import.meta.url);
const core = loadCore(new WebAssembly.Module(readFileSync(fileURLToPath(WASM))));

export function testDeps(): McpDeps {
  return { core, store: new MemoryStore(), instructions: "Test instructions" };
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
