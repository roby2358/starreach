// Starreach on Node (D-21): the page, viewer sockets, MCP and /health over HTTP, with MCP over
// stdio as well in stdio mode. One process holds the games in memory, so the browser sees the
// game the LLM is playing. A second stdio process on the same port forwards to the first, so
// that stays true for every client. Logs go to stderr, because stdout is the stdio MCP channel.
//
//   node adapters/node/src/main.ts stdio --host 127.0.0.1 --port 8572 --origin http://127.0.0.1:8572
//   node adapters/node/src/main.ts http --host 127.0.0.1 --port 8572 --origin http://127.0.0.1:8572
//
// --host and --port are what the server binds; --origin is where a browser reaches it, which
// differs inside a container.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, loadCore, MemoryStore } from "@starreach/app";

import { bridgeStdio, starreachAnswers } from "./bridge.ts";
import { serveHttp, type NodeDeps } from "./server.ts";
import { SocketViewers } from "./viewers.ts";

const INSTRUCTIONS_PATH = new URL("../../../public/instructions.txt", import.meta.url);

const USAGE = "usage: main.ts stdio|http --host <host> --port <port> --origin <url browsers use>";

function loadDeps(viewOrigin: string): NodeDeps {
  const wasm = readFileSync(fileURLToPath(import.meta.resolve("@starreach/app/wasm")));
  return {
    core: loadCore(new WebAssembly.Module(wasm)),
    store: new MemoryStore(),
    viewers: new SocketViewers(),
    viewOrigin,
    instructions: readFileSync(INSTRUCTIONS_PATH, "utf8").trim(),
  };
}

interface Launch {
  deps: NodeDeps;
  hostname: string;
  port: number;
  origin: string;
}

async function listen({ deps, hostname, port, origin }: Launch): Promise<void> {
  await serveHttp(deps, hostname, port);
  console.error(`Starreach on http://${hostname}:${port} (viewer at ${origin}, MCP at /mcp, health at /health)`);
}

/** The HTTP listener keeps the process alive, so it ends itself when the MCP client hangs up.
 *  Otherwise the orphan would hold the port and the client's next launch couldn't bind it. */
async function runStdio(launch: Launch): Promise<void> {
  process.stdin.once("close", () => process.exit(0));
  const base = `http://${launch.hostname}:${launch.port}`;
  try {
    await listen(launch);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || !(await starreachAnswers(base))) {
      throw error;
    }
    bridgeStdio(base);
    console.error(`Starreach MCP server on stdio, forwarding to the server at ${base}`);
    return;
  }
  await createMcpServer(launch.deps).connect(new StdioServerTransport());
  console.error("Starreach MCP server on stdio");
}

const MODES: Record<string, (launch: Launch) => Promise<void>> = {
  stdio: runStdio,
  http: listen,
};

function required(value: string | undefined, flag: string): string {
  if (value === undefined) {
    throw new Error(`${flag} is required. ${USAGE}`);
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

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { host: { type: "string" }, port: { type: "string" }, origin: { type: "string" } },
});
const mode = MODES[positionals[0] ?? ""];
if (mode === undefined) {
  console.error(USAGE);
  process.exit(2);
}
const hostname = required(values.host, "--host");
const port = portNumber(required(values.port, "--port"));
const origin = required(values.origin, "--origin");

await mode({ deps: loadDeps(origin), hostname, port, origin });
