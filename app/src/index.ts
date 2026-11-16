// The platform-neutral app layer (D-21). Adapters supply the WASM module, a GameStore,
// Viewers, the instructions text, and a way to serve stdio, HTTP and viewer sockets.

export { loadCore, type Command, type CommandResult, type Core, type CounterRow, type GameJson, type GameView, type LadderStanding } from "./core.ts";
export { MemoryStore, type GameStore } from "./store.ts";
export { addTotals, LOCAL_PLAYER, MemoryPlayerStore, type PlayerStore, type Totals, type TotalsChange } from "./players.ts";
export { achievements, type Achievement, type Achievers } from "./achievements.ts";
export {
  currentFrame,
  liveViewId,
  viewId,
  FRAME_TOO_BIG_CLOSE,
  GAME_NOT_FOUND_CLOSE,
  VIEWER_MAX_FRAME_BYTES,
  type Viewers,
} from "./view.ts";
export { newGame, runCommand, type Games } from "./games.ts";
export { createMcpServer, type McpDeps } from "./mcp.ts";
export { handleHttp, handleMcp } from "./http.ts";
