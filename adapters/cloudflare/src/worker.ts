// Starreach on Cloudflare (D-21): the app layer's routes served by a Worker, with each game
// and its viewer sockets in one Durable Object. The page is served as static assets
// (wrangler.jsonc), which are tried before this Worker runs.

import { handleHttp, liveViewId } from "@starreach/app";

import instructions from "../../../public/instructions.txt";
import { authorize } from "./auth.ts";
import { core } from "./core.ts";
import { DurableObjectStore } from "./store.ts";
import { DurableObjectViewers } from "./viewers.ts";

export { GameObject } from "./game_object.ts";

/** The view_id a viewer's socket upgrade asks for, or undefined for any other request. */
function upgradeViewId(request: Request, path: string): string | undefined {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return undefined;
  }
  return liveViewId(path);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const view = upgradeViewId(request, url.pathname);
    const guarded = view !== undefined || url.pathname === "/mcp";
    const refusal = guarded ? await authorize(request, env) : undefined;
    if (refusal !== undefined) {
      return refusal;
    }
    if (view !== undefined) {
      return env.GAMES.getByName(view).fetch(request);
    }
    return handleHttp(request, {
      core,
      store: new DurableObjectStore(env.GAMES),
      viewers: new DurableObjectViewers(env.GAMES),
      viewOrigin: url.origin,
      instructions: instructions.trim(),
    });
  },
} satisfies ExportedHandler<Env>;
