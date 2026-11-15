// The page's files are served at the paths the pages link, and nothing else in public/ is.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startServer, stopServer, type Running } from "../helpers/server.ts";

let running: Running;
before(async () => {
  running = await startServer();
});
after(() => stopServer(running));

test("the page and the files it links are served with their types", async () => {
  const page = await fetch(`${running.base}/viewer`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type")!, /text\/html/);
  const html = await page.text();
  for (const [link, type] of [["css/styles.css", /text\/css/], ["js/script.js", /text\/javascript/]] as const) {
    assert.ok(html.includes(link), `viewer.html links ${link}`);
    const asset = await fetch(`${running.base}/${link}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type")!, type);
  }
  const font = await fetch(`${running.base}/fonts/oxanium.woff2`);
  assert.equal(font.status, 200);
  assert.match(font.headers.get("content-type")!, /font\/woff2/);
  assert.equal(new TextDecoder().decode((await font.arrayBuffer()).slice(0, 4)), "wOF2", "the font arrives intact");
});

test("the home page is at / with its key content, and the viewer is at /viewer", async () => {
  for (const path of ["/"]) {
    const html = await (await fetch(`${running.base}${path}`)).text();
    assert.ok(html.includes("https://starreach.yuwakisa.com/mcp"), `${path} has the MCP URL`);
    assert.match(html, /What can you do\?/);
    assert.ok(html.includes("css/home.css"));
  }
  const shot = await fetch(`${running.base}/images/viewer.jpg`);
  assert.equal(shot.status, 200);
  assert.match(shot.headers.get("content-type")!, /image\/jpeg/);
  const home = await fetch(`${running.base}/css/home.css`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type")!, /text\/css/);
  for (const path of ["/viewer"]) {
    const viewer = await fetch(`${running.base}${path}`);
    assert.equal(viewer.status, 200);
    assert.match(viewer.headers.get("content-type")!, /text\/html/);
    assert.ok((await viewer.text()).includes("js/script.js"), `${path} is the viewer`);
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
