// The second stdio client on a port (D-21): one process holds the games, so a stdio process that
// finds the port taken forwards its MCP messages there. The Claude desktop app launches a stdio
// server for its chat and another for Cowork and Code sessions, and both use the same arguments.

import { createInterface } from "node:readline";

/** Whether a Starreach server answers at `base`. Anything else on the port is not ours to use. */
export async function starreachAnswers(base: string): Promise<boolean> {
  const response = await fetch(`${base}/health`).catch(() => undefined);
  if (response === undefined || !response.ok) {
    return false;
  }
  const body: unknown = await response.json().catch(() => undefined);
  return (body as { status?: unknown } | undefined)?.status === "ok";
}

/** A notification gets 202 with no body, and only a request's reply goes back to the client. */
async function forward(line: string, mcpUrl: string): Promise<void> {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: line,
  });
  const reply = await response.text();
  if (reply !== "") {
    process.stdout.write(`${reply}\n`);
  }
}

/** Ends the process when the holder is gone: its games went with it, and the client has to see that. */
export function bridgeStdio(base: string): void {
  createInterface({ input: process.stdin }).on("line", (line) => {
    forward(line, `${base}/mcp`).catch((error: Error) => {
      console.error(`The Starreach server at ${base} stopped answering: ${error.message}`);
      process.exit(1);
    });
  });
}
