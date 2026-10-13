import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import http from "node:http";
import { fixture } from "./browser-fixture.js";

async function until(condition, timeout = 10000) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeout)
      throw new Error("Condition was not reached.");
    await delay(100);
  }
}
async function pageFor(app) {
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: "en-US",
  });
  const page = await context.newPage();
  await page.goto(app.url);
  await page
    .getByRole("button", { name: "Check accounts", exact: true })
    .click();
  await page.getByText("source@example.test", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Load conversations", exact: true })
    .click();
  await page.getByText("6 conversations loaded", { exact: true }).waitFor();
  return page;
}

test("search, filter, preview, retain selection, migrate, export, and render at two widths", async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  const page = await pageFor(app);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("checkbox", {
      name: "Research notes on mitochondrial dynamics",
      exact: true,
    })
    .check();
  await page.getByPlaceholder("Search titles", { exact: true }).fill("Kyoto");
  assert.equal(await page.locator(".row").count(), 1);
  await page
    .getByRole("checkbox", { name: "Select filtered results", exact: true })
    .check();
  assert.equal(await page.locator("#selected-count").textContent(), "2");
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  assert.equal(await page.locator(".row").count(), 6);
  assert.equal(await page.locator(".row input:checked").count(), 2);
  await page.locator("#project").selectOption("g-p-research");
  assert.equal(await page.locator(".row").count(), 2);
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Research notes on mitochondrial dynamics/ })
    .click();
  await page
    .getByText(
      "Synthetic question for Research notes on mitochondrial dynamics",
      { exact: true },
    )
    .waitFor();
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await page.locator("#sharing-confirm").check();
  await page.locator("#delay").fill("3");
  await page
    .getByRole("button", {
      name: "Migrate selected conversations",
      exact: true,
    })
    .click();
  await until(
    () => !app.migration.running && app.store.jobs.length === 2,
    15000,
  );
  assert.deepEqual(
    app.store.jobs.map((job) => job.status),
    ["verified", "verified"],
  );
  assert.equal(app.sent, 2);
  await page.reload();
  await page.getByText("2 of 2 verified", { exact: true }).waitFor();
  const report = await fetch(`${app.url}/api/report`).then((response) =>
    response.json(),
  );
  assert.equal(report.jobs.length, 2);
  assert.ok(report.jobs.every((job) => job.proof.count === 2));
  const screenshotDirectory = ".impeccable/review";
  await mkdir(screenshotDirectory, { recursive: true });
  await page
    .getByRole("button", { name: /Research notes on mitochondrial dynamics/ })
    .click();
  await page
    .getByText(
      "Synthetic question for Research notes on mitochondrial dynamics",
      { exact: true },
    )
    .waitFor();
  const ledgerBox = await page.locator(".ledger").boundingBox();
  const previewBox = await page.locator("#preview").boundingBox();
  const deskBox = await page.locator(".desk").boundingBox();
  assert.ok(ledgerBox.x + ledgerBox.width <= previewBox.x);
  assert.ok(previewBox.x + previewBox.width <= deskBox.x);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${screenshotDirectory}/desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: `${screenshotDirectory}/mobile.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page
    .getByRole("heading", { name: "带上对话，去新账号。", exact: true })
    .waitFor();
});

test("a new chat URL with changed history becomes uncertain; check again never sends a second message", async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  app.setMode("changed-history");
  const page = await pageFor(app);
  await page
    .getByRole("checkbox", { name: "A weekend in Kyoto", exact: true })
    .check();
  await page.locator("#sharing-confirm").check();
  await page
    .getByRole("button", {
      name: "Migrate selected conversations",
      exact: true,
    })
    .click();
  await until(() => !app.migration.running && app.store.jobs.length === 1);
  assert.equal(app.store.jobs[0].status, "needs-review");
  await page.reload();
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  await page
    .getByRole("button", { name: "Check again without resending", exact: true })
    .click();
  await until(() => !app.migration.running);
  assert.equal(app.sent, 1);
  assert.equal(app.store.jobs[0].status, "needs-review");
  const broken = app.target.get(app.store.jobs[0].targetId);
  broken.mapping["message-1"].message.content.parts = [
    ...app.source.get("source-1").mapping["message-1"].message.content.parts,
  ];
  await page
    .getByRole("button", { name: "Check again without resending", exact: true })
    .click();
  await until(
    () => !app.migration.running && app.store.jobs[0].status === "verified",
  );
  assert.equal(app.sent, 1);
});

test("local HTTP boundary rejects foreign origins, DNS rebinding hosts and unconfirmed sharing", async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  const foreign = await fetch(`${app.url}/api/state`, {
    headers: { origin: "https://evil.example" },
  });
  assert.equal(foreign.status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    const request = http.get(
      `${app.url}/api/state`,
      { headers: { Host: "evil.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
  });
  assert.equal(reboundStatus, 403);
  const noHeader = await fetch(`${app.url}/api/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(noHeader.status, 404);
  const unconfirmed = await fetch(`${app.url}/api/start`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-chatport": "1" },
    body: JSON.stringify({ ids: ["source-0"] }),
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal(app.sent, 0);
  const traversal = await fetch(`${app.url}/%2e%2e/package.json`);
  assert.equal(traversal.status, 404);
});
