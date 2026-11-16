// Runs before each test file: the telemetry database gets its tables, as `just cf-d1-local`
// gives them to `wrangler dev`'s. The files share one database, and the schema is safe to apply again.

import { beforeAll } from "vitest";

import { applySchema } from "./telemetry_db.ts";

beforeAll(applySchema);
