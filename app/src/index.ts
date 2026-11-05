// The platform-neutral app layer (D-21). Adapters supply the WASM module, a GameStore,
// the instructions text, and a way to serve stdio or HTTP.

export { loadCore, type Command, type CommandResult, type Core, type GameJson } from "./core.ts";
export { MemoryStore, type GameStore } from "./store.ts";
export { newGame, runCommand, type Games } from "./games.ts";
export { createMcpServer, type McpDeps } from "./mcp.ts";
export { handleHttp } from "./http.ts";
