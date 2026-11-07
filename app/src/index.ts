// The platform-neutral app layer (D-21). Adapters supply the WASM module, a GameStore,
// Viewers, the instructions text, and a way to serve stdio, HTTP and viewer sockets.

export { loadCore, type Command, type CommandResult, type Core, type GameJson, type GameView } from "./core.ts";
export { MemoryStore, type GameStore } from "./store.ts";
export { currentFrame, liveGameId, GAME_NOT_FOUND_CLOSE, type Viewers } from "./view.ts";
export { newGame, runCommand, type Games } from "./games.ts";
export { createMcpServer, type McpDeps } from "./mcp.ts";
export { handleHttp } from "./http.ts";
