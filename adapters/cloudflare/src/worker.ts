// Starreach on Cloudflare (D-21): the app layer's routes served by a Worker, with each game
// and its viewer sockets in one Durable Object. MCP needs sign-in through auth/ (D-41). The page is served as static assets
// (wrangler.jsonc), which are tried before this Worker runs.

import { handleHttp, handleMcp, liveViewId, type McpDeps } from "@starreach/app";

import instructions from "../../../public/instructions.txt";
import { isMetadataPath, MCP_PATH, protectedResourceMetadata, signIn } from "./auth.ts";
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

function deps(env: Env, origin: string, player: string | null): McpDeps {
  return {
    core,
    store: new DurableObjectStore(env.GAMES),
    viewers: new DurableObjectViewers(env.GAMES),
    viewOrigin: origin,
    instructions: instructions.trim(),
    player,
  };
}

/** `/mcp`: the MCP server for a signed-in player, or the 401 that starts sign-in. */
async function signedInMcp(request: Request, env: Env, origin: string): Promise<Response> {
  const signedIn = await signIn(request, origin, env, Math.floor(Date.now() / 1000));
  if (!signedIn.ok) {
    return signedIn.response;
  }
  return handleMcp(request, deps(env, origin, signedIn.player));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const view = upgradeViewId(request, url.pathname);
    if (view !== undefined) {
      return env.GAMES.getByName(view).fetch(request);
    }
    if (isMetadataPath(url.pathname)) {
      return protectedResourceMetadata(env);
    }
    if (url.pathname === MCP_PATH) {
      return signedInMcp(request, env, url.origin);
    }
    return handleHttp(request, deps(env, url.origin, null));
  },
} satisfies ExportedHandler<Env>;
