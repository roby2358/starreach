// The auth seam (Q-15, D-20). The Worker calls it before /mcp and before a viewer's socket
// upgrade. It allows every request for now.
//
// When auth lands, this verifies the yuwakisacloud access token with auth-client's
// `verifyAccessToken`. The check must reach auth/'s JWKS through a service binding to the
// `auth` Worker, not a public fetch to auth.yuwakisa.com: a Worker-to-Worker fetch within the
// zone returned an edge 522 in production for jsonsolver.

/** The response that refuses the request, or undefined to let it through. */
export async function authorize(request: Request, env: Env): Promise<Response | undefined> {
  return undefined;
}
