// Starreach on Node (D-21): MCP over stdio, or MCP and /health over HTTP. Games live in
// process memory. Logs go to stderr, because stdout is the stdio MCP channel.
//
//   node adapters/node/src/main.ts stdio
//   node adapters/node/src/main.ts http --host 127.0.0.1 --port 8000

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, handleHttp, loadCore, MemoryStore, type McpDeps } from "@starreach/app";

const INSTRUCTIONS_PATH = new URL("../../../public/instructions.txt", import.meta.url);

function loadDeps(): McpDeps {
  const wasm = readFileSync(fileURLToPath(import.meta.resolve("@starreach/app/wasm")));
  return {
    core: loadCore(new WebAssembly.Module(wasm)),
    store: new MemoryStore(),
    instructions: readFileSync(INSTRUCTIONS_PATH, "utf8").trim(),
  };
}

async function runStdio(deps: McpDeps): Promise<void> {
  await createMcpServer(deps).connect(new StdioServerTransport());
  console.error("Starreach MCP server on stdio");
}

function runHttp(deps: McpDeps, hostname: string, port: number): void {
  serve({ fetch: (request) => handleHttp(request, deps), hostname, port }, () =>
    console.error(`Starreach on http://${hostname}:${port} (MCP at /mcp, health at /health)`),
  );
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) {
    throw new Error(`http mode needs ${flag}`);
  }
  return value;
}

function portNumber(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be an integer in 1..65535, got ${value}`);
  }
  return port;
}

const MODES: Record<string, (deps: McpDeps, options: Record<string, string | undefined>) => void | Promise<void>> = {
  stdio: (deps) => runStdio(deps),
  http: (deps, options) => runHttp(deps, required(options.host, "--host"), portNumber(required(options.port, "--port"))),
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { host: { type: "string" }, port: { type: "string" } },
});
const mode = MODES[positionals[0] ?? ""];
if (mode === undefined) {
  console.error("usage: main.ts stdio | main.ts http --host <host> --port <port>");
  process.exit(2);
}
await mode(loadDeps(), values);
