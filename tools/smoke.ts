// Smoke test against a running Starreach server, local or deployed: /health answers, the home
// page is 200 HTML, new_game over MCP returns a game_id and viewer_url, the viewer_url's path is
// 200 HTML on this server, a command succeeds, and a viewer socket gets a frame
// on connecting and another after the command. Exits non-zero with a message on any failure.
// Creates one game on the server and leaves it there.
//
//   node tools/smoke.ts http://localhost:8787
//   node tools/smoke.ts https://starreach.yuwakisa.com

const USAGE = "usage: smoke.ts <base url>, e.g. http://localhost:8787 or https://starreach.yuwakisa.com";
const WAIT_MS = 10_000;

class SmokeFailure extends Error {}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new SmokeFailure(message);
  }
}

function pass(message: string): void {
  console.log(`ok    ${message}`);
}

function within<T>(promise: Promise<T>, what: string): Promise<T> {
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(() => reject(new SmokeFailure(`timed out after ${WAIT_MS} ms waiting for ${what}`)), WAIT_MS).unref(),
  );
  return Promise.race([promise, timeout]);
}

/** A viewer socket whose frames are awaited in arrival order. A close fails every wait. */
class Viewer {
  private readonly frames: Record<string, any>[] = [];
  private readonly waiting: { resolve: (frame: Record<string, any>) => void; reject: (error: Error) => void }[] = [];
  private closed: SmokeFailure | undefined = undefined;
  readonly socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => this.receive(JSON.parse(String(event.data))));
    this.socket.addEventListener("close", (event) => this.close(event.code));
  }

  nextFrame(what: string): Promise<Record<string, any>> {
    const ready = this.frames.shift();
    if (ready !== undefined) {
      return Promise.resolve(ready);
    }
    if (this.closed !== undefined) {
      return Promise.reject(this.closed);
    }
    return within(new Promise((resolve, reject) => this.waiting.push({ resolve, reject })), what);
  }

  private receive(frame: Record<string, any>): void {
    const waiter = this.waiting.shift();
    if (waiter === undefined) {
      this.frames.push(frame);
      return;
    }
    waiter.resolve(frame);
  }

  private close(code: number): void {
    this.closed = new SmokeFailure(`viewer socket closed (code ${code}) at ${this.socket.url}`);
    this.waiting.splice(0).forEach((waiter) => waiter.reject(this.closed!));
  }
}

class Mcp {
  private readonly endpoint: string;
  private nextId = 1;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async request(method: string, params: Record<string, unknown>): Promise<Record<string, any>> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
    });
    check(response.ok, `MCP ${method}: HTTP ${response.status} ${await response.clone().text()}`);
    const body = (await response.json()) as Record<string, any>;
    check(body.error === undefined, `MCP ${method}: ${JSON.stringify(body.error)}`);
    return body.result;
  }

  /** The tool's CommandResult, which Starreach sends as JSON text. */
  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
    const result = await this.request("tools/call", { name, arguments: args });
    check(result.isError !== true, `${name}: tool error ${JSON.stringify(result.content)}`);
    return JSON.parse(result.content[0].text);
  }
}

async function checkHealth(base: string): Promise<void> {
  const response = await fetch(`${base}/health`);
  check(response.status === 200, `/health: HTTP ${response.status}, expected 200`);
  pass("/health is 200");
}

async function checkPage(base: string, path: string): Promise<void> {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const type = response.headers.get("content-type") ?? "";
  check(response.status === 200, `${path}: HTTP ${response.status}, expected 200`);
  check(type.includes("text/html"), `${path}: content-type ${type}, expected HTML`);
  pass(`${path} is 200 HTML`);
}

async function startGame(mcp: Mcp): Promise<{ gameId: string; viewId: string; viewerPath: string }> {
  await mcp.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "starreach-smoke", version: "0.1.0" },
  });
  pass("MCP initialize");
  const result = await mcp.callTool("new_game", {});
  const gameId = result.report?.game_id;
  const viewerUrl = result.report?.viewer_url;
  check(typeof gameId === "string" && gameId !== "", `new_game: no game_id in ${JSON.stringify(result.report)}`);
  check(typeof viewerUrl === "string", `new_game: no viewer_url in ${JSON.stringify(result.report)}`);
  const link = new URL(viewerUrl);
  const viewId = link.searchParams.get("view");
  check(viewId !== null && viewId !== "", `new_game: viewer_url ${viewerUrl} has no ?view=`);
  pass(`new_game: viewer_url ${viewerUrl}`);
  return { gameId, viewId, viewerPath: link.pathname };
}

function liveUrl(base: string, viewId: string): string {
  const url = new URL(`/live/${viewId}`, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

async function checkFrame(viewer: Viewer, what: string): Promise<Record<string, any>> {
  const frame = await viewer.nextFrame(what);
  check(frame.type === "view", `${what}: frame type ${frame.type}, expected view`);
  pass(`viewer got ${what}`);
  return frame;
}

async function smoke(base: string): Promise<void> {
  await checkHealth(base);
  await checkPage(base, "/");
  const mcp = new Mcp(`${base}/mcp`);
  const { gameId, viewId, viewerPath } = await startGame(mcp);
  await checkPage(base, viewerPath);
  const viewer = new Viewer(liveUrl(base, viewId));
  try {
    const first = await checkFrame(viewer, "a frame on connecting");
    const scan = await mcp.callTool("long_range_scan", { game_id: gameId });
    check(scan.ok === true, `long_range_scan: ${scan.error}`);
    pass("long_range_scan succeeded");
    const second = await checkFrame(viewer, "a frame after the command");
    check(second.view.ship.energy !== first.view.ship.energy, "the frame after long_range_scan shows unchanged ship energy");
  } finally {
    viewer.socket.close();
  }
}

const base = process.argv[2];
if (base === undefined || !URL.canParse(base)) {
  console.error(USAGE);
  process.exit(2);
}

try {
  await smoke(new URL(base).origin);
  console.log(`smoke passed against ${base}`);
} catch (error) {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  const message = error instanceof SmokeFailure ? error.message : `${String(error)}${cause}`;
  console.error(`smoke FAILED against ${base}: ${message}`);
  process.exit(1);
}
