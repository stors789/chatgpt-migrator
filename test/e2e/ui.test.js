import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
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
  const page = app.page;
  await page.locator('[data-open="source"]').click();
  await page.locator('[data-open="target"]').click();
  await until(
    async () =>
      await page.evaluate(async () => {
        const { accountTabs = {} } =
          await chrome.storage.session.get("accountTabs");
        const tabs = await Promise.all(
          Object.values(accountTabs).map((id) => chrome.tabs.get(id)),
        );
        return (
          tabs.length === 2 && tabs.every((tab) => tab.status === "complete")
        );
      }),
  );
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
    async () =>
      (await app.jobs()).filter((job) => job.status === "verified").length ===
      2,
    20000,
  );
  assert.deepEqual(
    (await app.jobs()).map((job) => job.status),
    ["verified", "verified"],
  );
  assert.equal(app.sent, 2);
  await page.reload();
  await page.getByText("2 of 2 verified", { exact: true }).waitFor();
  const downloaded = page.waitForEvent("download");
  await page.locator("#export").click();
  const report = JSON.parse(
    await readFile(await (await downloaded).path(), "utf8"),
  );
  assert.equal(report.jobs.length, 2);
  assert.ok(report.jobs.every((job) => job.proof.count === 2));
  await page.locator("#load-catalog").click();
  await page.getByText("6 conversations loaded", { exact: true }).waitFor();
  const screenshotDirectory = ".impeccable/review";
  await mkdir(screenshotDirectory, { recursive: true });
  await page
    .getByRole("button", { name: "Receipt", exact: true })
    .first()
    .click();
  const destinationId = (await app.jobs())[0].targetId;
  await page
    .getByRole("button", { name: "Destination copy", exact: true })
    .click();
  await until(async () =>
    page.evaluate(
      async (id) =>
        (await chrome.tabs.query({ url: `https://chatgpt.com/c/${id}` }))
          .length === 1,
      destinationId,
    ),
  );
  const navigationProof = await page.evaluate(async (id) => {
    const [copy] = await chrome.tabs.query({
      url: `https://chatgpt.com/c/${id}`,
    });
    const { accountTabs } = await chrome.storage.session.get("accountTabs");
    const target = await chrome.tabs.get(accountTabs.target);
    const [{ result: account }] = await chrome.scripting.executeScript({
      target: { tabId: copy.id },
      func: async () =>
        (await (await fetch("/api/auth/session")).json()).user.id,
    });
    return {
      incognito: copy.incognito,
      sameWindow: copy.windowId === target.windowId,
      account,
      url: copy.url,
    };
  }, destinationId);
  assert.deepEqual(navigationProof, {
    incognito: true,
    sameWindow: true,
    account: "target-account",
    url: `https://chatgpt.com/c/${destinationId}`,
  });
  await writeFile(
    `${screenshotDirectory}/destination-proof.json`,
    JSON.stringify(navigationProof, null, 2),
  );
  await page.screenshot({
    path: `${screenshotDirectory}/receipt-desktop.png`,
    fullPage: true,
  });
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
  await until(
    async () => (await app.jobs())[0]?.status === "needs-review",
    20000,
  );
  assert.equal((await app.jobs())[0].status, "needs-review");
  await page.reload();
  await page.locator("#load-catalog").click();
  await page.getByText("6 conversations loaded", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  await page
    .getByRole("button", { name: "Check again without resending", exact: true })
    .click();
  await until(
    async () =>
      !(await page.locator("#preview-content [data-recheck]").isDisabled()),
    20000,
  );
  assert.equal(app.sent, 1);
  assert.equal((await app.jobs())[0].status, "needs-review");
  const broken = app.target.get((await app.jobs())[0].targetId);
  broken.mapping["message-1"].message.content.parts = [
    ...app.source.get("source-1").mapping["message-1"].message.content.parts,
  ];
  await page
    .getByRole("button", { name: "Check again without resending", exact: true })
    .click();
  await until(async () => (await app.jobs())[0]?.status === "verified", 20000);
  assert.equal(app.sent, 1);
});

test("incognito access is required and the settings action opens Chrome's permission page", async (t) => {
  const app = await fixture({ incognito: false });
  t.after(() => app.close());
  const page = app.page;
  await page.locator('[data-open="target"]').click();
  await page.getByText(/Enable Allow in incognito/).waitFor();
  assert.equal(
    await page.locator("#target-email").innerText(),
    "Not connected",
  );
  assert.equal(app.sent, 0);
  const opened = app.context.waitForEvent("page");
  await page.locator("#extension-settings").click();
  const settings = await opened;
  await settings.waitForURL(/chrome:\/\/extensions/);
});

test("expired destination authentication clears connected identity and prevents migration", async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  const page = await pageFor(app);
  const tabs = await page.evaluate(async () => {
    const { accountTabs } = await chrome.storage.session.get("accountTabs");
    return Promise.all([
      chrome.tabs.get(accountTabs.source),
      chrome.tabs.get(accountTabs.target),
    ]);
  });
  assert.deepEqual(
    tabs.map((tab) => tab.incognito),
    [false, true],
  );
  app.setTargetSignedIn(false);
  await page.locator("#check-accounts").click();
  await page
    .getByText(/Open both account windows and finish signing in/)
    .waitFor();
  assert.equal(
    await page.locator("#target-email").innerText(),
    "Not connected",
  );
  assert.equal(await page.locator("#start").isDisabled(), true);
  assert.equal(app.sent, 0);
});

test("a second workspace cannot start a competing migration", async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  await pageFor(app);
  const duplicate = await app.context.newPage();
  await duplicate.goto(app.url);
  await duplicate
    .getByText(/ChatPort is already open in another tab/)
    .waitFor();
  assert.equal(await duplicate.locator("#check-accounts").isDisabled(), true);
  assert.equal(await duplicate.locator("#start").isDisabled(), true);
  assert.equal(app.sent, 0);
});

test("unchanged progress polling preserves row controls and project options", async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  const page = await pageFor(app);
  const stable = await page.evaluate(async () => {
    const checkbox = document.querySelector('[data-select="source-0"]');
    const project = document.querySelector(
      '#project option[value="g-p-research"]',
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return (
      checkbox.isConnected &&
      project.isConnected &&
      checkbox === document.querySelector('[data-select="source-0"]') &&
      project ===
        document.querySelector('#project option[value="g-p-research"]')
    );
  });
  assert.equal(stable, true);
  await page
    .getByRole("checkbox", {
      name: "Research notes on mitochondrial dynamics",
      exact: true,
    })
    .check();
  assert.equal(await page.locator("#selected-count").innerText(), "1");
});
