// `just telemetry-report`: prints the telemetry report (ONTOLOGY "Telemetry report", D-54) as
// plain text. One report, three sources: the production D1 database through wrangler's login
// (when no source is named), the local server's /telemetry dump (`local`), or wrangler dev's
// local D1 database (`local-d1`). A number limits the report to games started in that many days.
// It reads and never writes. Needs Node only: no Rust and no built core.
//
//   node tools/telemetry_report.ts <local host> <local port> <wrangler config> [local|local-d1|production] [days]

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

import { SECONDS_PER_DAY, type Play } from "./telemetry_report/figures.ts";
import { D1_TARGETS, playFromD1, playFromDump, ReportRefusal, type D1Target, type Wrangler } from "./telemetry_report/records.ts";
import { report } from "./telemetry_report/render.ts";

const USAGE = "usage: just telemetry-report [local|local-d1|production] [days]   (production when no source is named; every day when no number is given)";

/** The source read when none is named: the designer's `just telemetry-report` is production's. */
const UNNAMED_SOURCE = "production";

/** wrangler prints every row to stdout; this is far above what the tables hold for years. */
const WRANGLER_OUTPUT_LIMIT = 1024 * 1024 * 1024;

/** What every source is given: where the local server and the wrangler config are, and the start
 *  of the period. */
interface Where {
  localBase: string;
  wranglerConfig: string;
  since: number;
}

interface Source {
  /** The source in words, for the report's heading. */
  label: (where: Where) => string;
  load: (where: Where) => Promise<Play>;
}

const runWrangler: Wrangler = (args) =>
  new Promise((resolve, reject) => {
    execFile("npx", ["wrangler", ...args], { maxBuffer: WRANGLER_OUTPUT_LIMIT }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      reject(new ReportRefusal(`wrangler failed (${args.slice(0, 3).join(" ")} …):\n${stdout}${stderr}`.trimEnd()));
    });
  });

async function localDump(base: string): Promise<string> {
  const response = await fetch(`${base}/telemetry`).catch(() => {
    throw new ReportRefusal(`no local server is running at ${base}; start one with: just up`);
  });
  if (!response.ok) {
    throw new ReportRefusal(`the server at ${base} gave no telemetry (HTTP ${response.status}); if it was started before this checkout, restart it: just down, then just up`);
  }
  return response.text();
}

function d1Source(target: D1Target, what: string): Source {
  return {
    label: ({ wranglerConfig }) => `${what} (wrangler d1 execute ${D1_TARGETS[target].join(" ")}, ${wranglerConfig})`,
    load: ({ wranglerConfig, since }) => playFromD1(runWrangler, target, { path: wranglerConfig, text: readFileSync(wranglerConfig, "utf8") }, since),
  };
}

const SOURCES: Record<string, Source> = {
  local: {
    label: ({ localBase }) => `the local server's memory (${localBase}/telemetry)`,
    load: async ({ localBase }) => playFromDump(await localDump(localBase)),
  },
  "local-d1": d1Source("local-d1", "wrangler dev's local D1 database"),
  production: d1Source("production", "the production D1 database"),
};

/** The source and the days among the recipe's own arguments, each given at most once, in either order. */
function chosen(args: string[]): { source: string; days: number | null } {
  const sources = args.filter((arg) => Object.hasOwn(SOURCES, arg));
  const days = args.filter((arg) => /^[1-9]\d*$/.test(arg));
  if (sources.length > 1 || days.length > 1 || sources.length + days.length !== args.length) {
    throw new ReportRefusal(USAGE);
  }
  return { source: sources.length === 1 ? sources[0] : UNNAMED_SOURCE, days: days.length === 1 ? Number(days[0]) : null };
}

async function main(argv: string[]): Promise<void> {
  if (argv.length < 3) {
    throw new ReportRefusal(USAGE);
  }
  const [host, port, wranglerConfig, ...rest] = argv;
  const { source, days } = chosen(rest);
  const since = days === null ? 0 : Math.floor(Date.now() / 1000) - days * SECONDS_PER_DAY;
  const where: Where = { localBase: `http://${host}:${port}`, wranglerConfig, since };
  const play = await SOURCES[source].load(where);
  const period = days === null ? "all time" : `games started in the last ${days} day${days === 1 ? "" : "s"}`;
  process.stdout.write(report(play, { source: SOURCES[source].label(where), period, since }));
}

main(process.argv.slice(2)).catch((error) => {
  if (!(error instanceof ReportRefusal)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
});
