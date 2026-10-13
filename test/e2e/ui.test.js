import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fixture } from "./browser-fixture.js";
import { snapshotOf } from "../../src/proof.js";

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

// DOM attributes observed on the live ChatGPT composer; no real chat data is used.
test("current ChatGPT editor without prompt-textarea ID submits only its own form and verifies the saved copy", async (t) => {
  const app = await fixture({ composer: "current" });
  t.after(() => app.close());
  const page = await pageFor(app);
  await page
    .getByRole("checkbox", { name: "A weekend in Kyoto", exact: true })
    .check();
  await page.locator("#sharing-confirm").check();
  await page.locator("#start").click();
  await until(async () => (await app.jobs())[0]?.status === "verified", 20000);
  assert.equal(app.sent, 1);
  const copy = app.target.values().next().value;
  const markers = Object.values(copy.mapping).filter(
    (node) =>
      node.message?.author.role === "user" &&
      node.message.content.parts[0].includes("[ChatPort:"),
  );
  assert.equal(markers.length, 1);
  assert.equal((await app.jobs())[0].proof.count, 2);
});

test("a stalled image does not block receiving when the editor is already usable", async (t) => {
  const app = await fixture({ composer: "current", slowResource: true });
  t.after(() => app.close());
  const page = await pageFor(app);
  await page
    .getByRole("checkbox", { name: "A weekend in Kyoto", exact: true })
    .check();
  await page.locator("#sharing-confirm").check();
  await page.locator("#start").click();
  await until(async () => (await app.jobs())[0]?.status === "verified", 20000);
  assert.equal(app.sent, 1);
  assert.ok(
    app.readyStates[0] !== "complete",
    "the load event must still be waiting at send time",
  );
});

async function stoppedJob(app, error, fields = {}) {
  const source = app.source.get("source-1");
  const id = "existing-receipt";
  const job = {
    id,
    sourceId: "source-1",
    title: source.title,
    sourceAccount: "source-account",
    targetAccount: "target-account",
    status: "needs-review",
    createdAt: new Date().toISOString(),
    error,
    marker: `Keep my original receipt\n[ChatPort:${id}]`,
    shareUrl: "https://chatgpt.com/share/share-source-1",
    snapshot: await snapshotOf(source),
    ...fields,
  };
  app.shares.set("share-source-1", structuredClone(source));
  return job;
}

async function openReceiving(page, url) {
  const tab = await page.evaluate(async (url) => {
    const { accountTabs } = await chrome.storage.session.get("accountTabs");
    const destination = await chrome.tabs.get(accountTabs.target);
    return chrome.tabs.create({
      windowId: destination.windowId,
      url,
      active: false,
    });
  }, url);
  await until(() =>
    page.evaluate(
      async (id) => (await chrome.tabs.get(id)).status === "complete",
      tab.id,
    ),
  );
  return tab.id;
}

async function restoreJobs(page, jobs) {
  await page.evaluate(
    (jobs) => chrome.storage.local.set({ progress: { version: 1, jobs } }),
    jobs,
  );
  await page.reload();
  await page.locator("#load-catalog").click();
  await page.getByText("6 conversations loaded", { exact: true }).waitFor();
}

test("an old loading failure resumes its open tab and queued jobs remain available with explicit counts", async (t) => {
  const app = await fixture({ composer: "current" });
  t.after(() => app.close());
  const page = await pageFor(app);
  const job = await stoppedJob(
    app,
    "The shared conversation did not finish loading.",
  );
  await openReceiving(page, job.shareUrl);
  const queued = {
    id: "queued-receipt",
    sourceId: "source-2",
    title: app.source.get("source-2").title,
    sourceAccount: job.sourceAccount,
    targetAccount: job.targetAccount,
    status: "pending",
    createdAt: job.createdAt,
    marker: "Continue queued receipt\n[ChatPort:queued-receipt]",
  };
  await restoreJobs(page, [job, queued]);
  await page.getByRole("checkbox", { name: job.title, exact: true }).check();
  await page.getByRole("checkbox", { name: queued.title, exact: true }).check();
  assert.equal(
    await page.locator("#selection-description").innerText(),
    "2 selected conversations will be received.",
  );
  await page.locator(`[data-receipt="${job.id}"]`).click();
  await page
    .getByRole("button", { name: "Retry this conversation", exact: true })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/recovery-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "中文", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: ".impeccable/review/recovery-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "重试这条对话", exact: true }).click();
  await until(async () => (await app.jobs())[0]?.status === "verified", 20000);
  assert.equal((await app.jobs())[0].marker, job.marker);
  assert.equal((await app.jobs())[1].status, "pending");
  assert.equal(app.sent, 1);
  assert.equal(
    app.shareVisits,
    1,
    "retry must reuse the original receiving tab",
  );
  await page.locator("#sharing-confirm").check();
  await page.locator("#delay").fill("3");
  await page.locator("#start").click();
  await until(
    async () => (await app.jobs()).every((job) => job.status === "verified"),
    20000,
  );
  assert.equal(app.sent, 2);
  assert.equal((await app.jobs()).length, 2);
});

test("recovery continues a supplied private copy, preserves a different draft, then sends the original marker once", async (t) => {
  const app = await fixture({ composer: "current" });
  t.after(() => app.close());
  const page = await pageFor(app);
  const job = await stoppedJob(
    app,
    "The shared chat has no editable composer. Inspect the destination tab.",
  );
  const data = structuredClone(app.source.get(job.sourceId));
  data.conversation_id = "existing-private-copy";
  app.target.set(data.conversation_id, data);
  const url = `https://chatgpt.com/c/${data.conversation_id}`;
  const tabId = await openReceiving(page, url);
  const draft = async (text) =>
    page.evaluate(
      async ({ tabId, text }) =>
        chrome.scripting.executeScript({
          target: { tabId },
          func: (text) => {
            document.querySelector(
              'form [role="textbox"][contenteditable="true"]:not([style])',
            ).innerText = text;
          },
          args: [text],
        }),
      { tabId, text },
    );
  await draft("An existing draft that must stay intact");
  await restoreJobs(page, [job]);
  await page.locator(`[data-receipt="${job.id}"]`).click();
  await page.locator("#destination-url").fill(url);
  await page
    .getByRole("button", { name: "Retry this conversation", exact: true })
    .click();
  await until(async () => (await app.jobs())[0].status === "failed");
  await until(
    async () => !(await page.locator("#destination-url").isDisabled()),
  );
  assert.equal(app.sent, 0);
  const [{ result: preserved }] = await page.evaluate(
    async (tabId) =>
      chrome.scripting.executeScript({
        target: { tabId },
        func: () =>
          document.querySelector('[aria-label="询问 ChatGPT"]').innerText,
      }),
    tabId,
  );
  assert.equal(preserved, "An existing draft that must stay intact");
  await draft(job.marker);
  await page
    .getByRole("button", { name: "Retry this conversation", exact: true })
    .click();
  await until(async () => (await app.jobs())[0].status === "verified", 20000);
  assert.equal((await app.jobs())[0].targetId, data.conversation_id);
  assert.equal(app.target.size, 1);
  assert.equal(app.sent, 1);
  assert.equal(app.shareVisits, 0);
});

test("a shared-link redirect to a root-page editor stops before any message is sent", async (t) => {
  const app = await fixture({ composer: "current" });
  t.after(() => app.close());
  const page = await pageFor(app);
  app.setMode("redirect-home");
  await page
    .getByRole("checkbox", { name: "A weekend in Kyoto", exact: true })
    .check();
  await page.locator("#sharing-confirm").check();
  await page.locator("#start").click();
  await until(async () => (await app.jobs())[0]?.status === "failed");
  assert.equal(app.sent, 0);
  assert.equal((await app.jobs())[0].sendAttempted, false);
  assert.match((await app.jobs())[0].error, /different page/);
  await page
    .locator("#notice")
    .getByText(/This batch stopped/)
    .waitFor();
});

test("editing a receipt draft while the send button is disabled stops without overwriting or sending it", async (t) => {
  const app = await fixture({ composer: "current" });
  t.after(() => app.close());
  const page = await pageFor(app);
  app.setMode("wait-to-send");
  await page
    .getByRole("checkbox", { name: "A weekend in Kyoto", exact: true })
    .check();
  await page.locator("#sharing-confirm").check();
  await page.locator("#start").click();
  await until(async () => {
    const job = (await app.jobs())[0];
    if (job?.status !== "sending") return false;
    return page.evaluate(
      async ({ tabId, marker }) => {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          injectImmediately: true,
          func: (marker) =>
            document.querySelector('[aria-label="询问 ChatGPT"]').innerText ===
            marker,
          args: [marker],
        });
        return result;
      },
      { tabId: job.receivingTabId, marker: job.marker },
    );
  });
  const tabId = (await app.jobs())[0].receivingTabId;
  await page.evaluate(
    async (tabId) =>
      chrome.scripting.executeScript({
        target: { tabId },
        injectImmediately: true,
        func: () => {
          document.querySelector('[aria-label="询问 ChatGPT"]').innerText =
            "A draft edited while waiting";
        },
      }),
    tabId,
  );
  await until(async () => (await app.jobs())[0]?.status === "failed");
  const [{ result: draft }] = await page.evaluate(
    async (tabId) =>
      chrome.scripting.executeScript({
        target: { tabId },
        func: () =>
          document.querySelector('[aria-label="询问 ChatGPT"]').innerText,
      }),
    tabId,
  );
  assert.equal(draft, "A draft edited while waiting");
  assert.equal(app.sent, 0);
  assert.equal((await app.jobs())[0].sendAttempted, false);
});
