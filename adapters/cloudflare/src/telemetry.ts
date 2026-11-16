// The app's Telemetry on Cloudflare (D-51). The Worker has nowhere to keep telemetry yet, and an
// isolate's memory is neither lasting nor readable, so every record is dropped.

import type { Telemetry } from "@starreach/app";

export class NoTelemetry implements Telemetry {
  async gameStarted(): Promise<void> {}

  async gameEnded(): Promise<void> {}

  async commandRun(): Promise<void> {}
}
