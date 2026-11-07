// The page's files are served at the paths index.html links, and nothing else in public/ is.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startServer, stopServer, type Running } from "../helpers/server.ts";

let running: Running;
before(async () => {
  running = await startServer();
});
after(() => stopServer(running));

test("the page and the files it links are served with their types", async () => {
  const page = await fetch(`${running.base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type")!, /text\/html/);
  const html = await page.text();
  for (const [link, type] of [["css/styles.css", /text\/css/], ["js/script.js", /text\/javascript/]] as const) {
    assert.ok(html.includes(link), `index.html links ${link}`);
    const asset = await fetch(`${running.base}/${link}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type")!, type);
  }
});

test("paths outside the page are not served", async () => {
  for (const path of ["/instructions.txt", "/../package.json", "/live/not-a-socket"]) {
    assert.equal((await fetch(`${running.base}${path}`)).status, 404, path);
  }
});

test("the app layer's routes share the port", async () => {
  assert.deepEqual(await (await fetch(`${running.base}/health`)).json(), { status: "ok" });
});
