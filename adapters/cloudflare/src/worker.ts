// Starreach on Cloudflare (D-21): the app layer's routes served by a Worker, with each game
// in its own Durable Object. Viewer sockets and the page aren't served yet, so publishing a
// frame does nothing.

import { handleHttp, loadCore, type Viewers } from "@starreach/app";

import instructions from "../../../public/instructions.txt";
import wasm from "../../../app/src/wasm/starreach_core_bg.wasm";
import { authorize } from "./auth.ts";
import { DurableObjectStore } from "./store.ts";

export { GameObject } from "./game_object.ts";

const core = loadCore(wasm);

const noViewers: Viewers = {
  async publish(): Promise<void> {},
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const refusal = url.pathname === "/mcp" ? await authorize(request, env) : undefined;
    if (refusal !== undefined) {
      return refusal;
    }
    return handleHttp(request, {
      core,
      store: new DurableObjectStore(env.GAMES),
      viewers: noViewers,
      viewOrigin: url.origin,
      instructions: instructions.trim(),
    });
  },
} satisfies ExportedHandler<Env>;
