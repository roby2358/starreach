// The HTTP routes (ONTOLOGY "HTTP"), as one fetch handler any platform can serve.
// MCP runs stateless: each request gets a fresh server, and games live in the store.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer, type McpDeps } from "./mcp.ts";

export async function handleHttp(request: Request, deps: McpDeps): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") {
    return Response.json({ status: "ok" });
  }
  if (path === "/mcp") {
    return handleMcp(request, deps);
  }
  return new Response("Not found", { status: 404 });
}

async function handleMcp(request: Request, deps: McpDeps): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createMcpServer(deps);
  await server.connect(transport);
  return transport.handleRequest(request);
}
