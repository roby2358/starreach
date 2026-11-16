// The one-way hash the app layer names things by: a view_id (D-32), a telemetry game key and a
// player hash (D-51).

/** The hex SHA-256 of a text. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
