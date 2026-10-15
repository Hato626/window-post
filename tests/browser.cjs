const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const E = require("../src/engine.js");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "artifacts");
const port = 4318;
const server = spawn(process.execPath, ["server.cjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});
let browser;
const passed = [];
function pass(name) {
  passed.push(name);
  console.log("PASS " + name);
}
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch("http://127.0.0.1:" + port)).ok) break;
    } catch {}
    await delay(100);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:" + port);
  assert.equal(await page.title(), "窗口邮局 · Window Post");
  const runBox = await page.locator("#run").boundingBox();
  assert.ok(runBox.y + runBox.height < 768, "run button visible on laptop");
  assert.equal(await page.locator("[data-letter]").count(), 1);
  pass("1366x768 launch and visible controls");
  async function coord(label, n) {
    await page.getByLabel("窗口" + label, { exact: true }).fill(String(n));
    await page.getByLabel("窗口" + label, { exact: true }).press("Tab");
  }
  await page.locator("[data-toggle]").click();
  await coord("列", 4);
  await coord("行", 3);
  await coord("高", 1);
  const bar = await page.locator(".window-bar").boundingBox(),
    board = await page.locator("#board").boundingBox();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + 9);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + board.width / 8, bar.y + 9);
  await page.mouse.up();
  assert.equal(
    await page.getByLabel("窗口列", { exact: true }).inputValue(),
    "5",
  );
  await page.locator("#undo").click();
  assert.equal(
    await page.getByLabel("窗口列", { exact: true }).inputValue(),
    "4",
  );
  await page.locator("#redo").click();
  assert.equal(
    await page.getByLabel("窗口列", { exact: true }).inputValue(),
    "5",
  );
  const handle = await page.locator(".resize").boundingBox();
  await page.mouse.move(handle.x + 9, handle.y + 9);
  await page.mouse.down();
  await page.mouse.move(handle.x + 9 + board.width / 8, handle.y + 9);
  await page.mouse.up();
  assert.equal(
    await page.getByLabel("窗口宽", { exact: true }).inputValue(),
    "3",
  );
  await page.locator("#undo").click();
  pass("real pointer drag, resize, undo and redo");
  await page.locator("#run").click();
  await delay(420);
  await page.locator("#run").click();
  assert.match(await page.locator("#stage-state").innerText(), /暂停/);
  const before = await page.locator("#timeline").innerText();
  await page.locator("#step").click();
  assert.notEqual(await page.locator("#timeline").innerText(), before);
  await page.selectOption("#speed", "140");
  await page.locator("#run").click();
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("全部订单完成"),
  );
  pass("play, pause, single step and manual solve");
  await page.reload();
  assert.match(await page.locator("#progress").innerText(), /1 \/ 24/);
  assert.equal(
    await page.getByLabel("窗口列", { exact: true }).inputValue(),
    "5",
  );
  pass("reload restores layout and progress");
  await page.locator("#open-levels").click();
  await page.locator('[data-level="level-15"]').click();
  await page.locator("#solution").click();
  for (
    let i = 0;
    i < 50 &&
    !(await page.locator("#status").innerText()).includes("全部订单完成");
    i++
  )
    await page.locator("#step").click();
  assert.match(await page.locator("#status").innerText(), /全部订单完成/);
  await page.screenshot({
    path: path.join(artifacts, "opposite-routes-1366.png"),
    fullPage: true,
  });
  pass("opposite-direction route and reference solution through UI");
  await page.setViewportSize({ width: 1024, height: 768 });
  const smallRun = await page.locator("#run").boundingBox();
  assert.ok(smallRun.y + smallRun.height < 768);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: path.join(artifacts, "laptop-1024.png"),
    fullPage: true,
  });
  pass("1024x768 no horizontal overflow and controls visible");
  await page.locator("#open-levels").click();
  await page.locator('[data-level="level-01"]').click();
  await page.locator("#solution").click();
  await page.locator("#new-editor").click();
  await page.locator("#edit-title").fill("浏览器验收路线");
  await page.locator("#edit-type").selectOption("rotate");
  await page.locator("#edit-add-tool").click();
  assert.equal(await page.locator(".tool").count(), 2);
  await page.locator("#edit-delete-tool").click();
  assert.equal(await page.locator(".tool").count(), 1);
  await page.locator("#edit-route-reset").click();
  const eb = await page.locator("#board").boundingBox();
  for (let x = 0; x < 4; x++)
    await page.mouse.click(
      eb.x + ((x + 0.5) * eb.width) / 8,
      eb.y + (3.5 * eb.height) / 6,
    );
  await page.locator("#edit-route").click();
  await coord("列", 2);
  await coord("行", 4);
  await coord("宽", 2);
  await coord("高", 1);
  await page.locator("#edit-save").click();
  assert.equal(await page.locator("#title").innerText(), "浏览器验收路线");
  await page.locator("#solution").click();
  for (
    let i = 0;
    i < 20 &&
    !(await page.locator("#status").innerText()).includes("全部订单完成");
    i++
  )
    await page.locator("#step").click();
  assert.match(await page.locator("#status").innerText(), /全部订单完成/);
  pass(
    "editor tool management, drawn route, target generation and playable saved level",
  );
  const levelDownload = page.waitForEvent("download");
  await page.locator("#export-level").click();
  const downloaded = await levelDownload;
  const levelPath = path.join(artifacts, "exported-level.json");
  await downloaded.saveAs(levelPath);
  const exported = E.decodeLevel(fs.readFileSync(levelPath, "utf8"));
  assert.ok(E.simulate(exported, exported.solution).solved);
  await page.locator("#import-level").click();
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("导入失败"),
  );
  assert.equal(await page.locator("#title").innerText(), "浏览器验收路线");
  await page.locator("#import-level").click();
  await page.locator("#file-input").setInputFiles(levelPath);
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("已导入关卡"),
  );
  pass("real file export/import and invalid-file rejection");
  const saveDownload = page.waitForEvent("download");
  await page.locator("#export-save").click();
  const savePath = path.join(artifacts, "exported-save.json");
  await (await saveDownload).saveAs(savePath);
  await page.locator("#import-save").click();
  await page.locator("#file-input").setInputFiles(savePath);
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("存档已导入"),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  pass("save bundle round trip and zero browser errors");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.locator("#open-levels").click();
  await page.screenshot({
    path: path.join(artifacts, "level-map.png"),
    fullPage: true,
  });
  await page.locator('[data-close="level-dialog"]').click();
  await page.locator("#open-levels").click();
  await page.locator('[data-level="level-24"]').click();
  await page.locator("#solution").click();
  await page.locator("#step").click();
  await page.screenshot({
    path: path.join(artifacts, "final-shift.png"),
    fullPage: true,
  });
  // Launch the actual double-click artifact too, without the development server.
  const filePage = await context.newPage();
  await filePage.goto(
    require("node:url").pathToFileURL(path.join(root, "index.html")).href,
  );
  assert.equal(await filePage.locator(".letter").count(), 1);
  await filePage.locator("#solution").click();
  assert.equal(await filePage.locator(".work-window").count(), 1);
  await filePage.close();
  pass("file:// offline double-click launch");
  fs.writeFileSync(
    path.join(artifacts, "browser-results.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        browser: await browser.version(),
        passed,
        errors,
      },
      null,
      2,
    ),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.kill();
  });
