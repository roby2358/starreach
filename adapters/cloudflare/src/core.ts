// The WASM core, loaded once per isolate. The Worker and the Durable Object both use it.

import { loadCore } from "@starreach/app";

import wasm from "../../../app/src/wasm/starreach_core_bg.wasm";

export const core = loadCore(wasm);
