import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";
import { Migration } from "../src/migration.js";
import { FakeChatGPT } from "./fixtures.js";

const catalog = [{ id: "source-chat", title: "Synthetic conversation" }];
async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "chatport-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(directory);
  await store.load();
  const api = new FakeChatGPT();
  const runner = new Migration(store, api, { verificationDelays: [0] });
  return { store, api, runner, directory };
}
test("successful migration persists only receipts and skips verified copies on resume", async (t) => {
  const { runner, store, api, directory } = await setup(t);
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "verified");
  const saved = await readFile(path.join(directory, "progress.json"), "utf8");
  assert.ok(!saved.includes("An answer"));
  assert.ok(!saved.includes("accessToken"));
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(api.claims, 1);
});
test("a send with no persisted copy stays uncertain and is never automatically resent", async (t) => {
  const { runner, store, api } = await setup(t);
  api.claim = async () => {
    api.claims++;
    throw new Error("Browser closed after send");
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "needs-review");
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(api.claims, 1);
});
test("verification failure never becomes a green success", async (t) => {
  const { runner, store, api } = await setup(t);
  api.verify = async () => ({ verified: false, reason: "Missing messages" });
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "needs-review");
  assert.equal(store.jobs[0].error, "Missing messages");
});
test("an uncertain persisted copy can be recovered without sending again", async (t) => {
  const { runner, store, api } = await setup(t);
  const claim = api.claim.bind(api);
  api.claim = async (job, save) => {
    await claim(job, save);
    throw new Error("Interrupted");
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  store.jobs[0].targetId = null;
  await runner.recheck(store.jobs[0].id);
  assert.equal(store.jobs[0].status, "verified");
  assert.equal(api.claims, 1);
});
test("concurrent starts are rejected before any side effect", async (t) => {
  const { runner } = await setup(t);
  const first = runner.start(["source-chat"], catalog);
  await assert.rejects(
    runner.start(["source-chat"], catalog),
    /already running/,
  );
  await first;
  await runner.task;
});
test("the same source and destination account is rejected", async (t) => {
  const { runner, api } = await setup(t);
  api.target.id = api.source.id;
  await assert.rejects(
    runner.start(["source-chat"], catalog),
    /different accounts/,
  );
  assert.equal(api.claims, 0);
});
test("accounts different from those shown in the UI are rejected before sharing", async (t) => {
  const { runner, api } = await setup(t);
  await assert.rejects(
    runner.start(
      ["source-chat"],
      catalog,
      {},
      {
        source: { id: api.source.id },
        target: { id: "previously-displayed-target" },
      },
    ),
    /connected accounts changed/,
  );
  assert.equal(api.claims, 0);
});
test("pause finishes the current copy and leaves the next selected conversation queued", async (t) => {
  const { runner, api, store } = await setup(t);
  const originalClaim = api.claim.bind(api);
  api.claim = async (job, save) => {
    await originalClaim(job, save);
    runner.pause();
  };
  await runner.start(
    ["source-chat", "other-chat"],
    [...catalog, { id: "other-chat", title: "Second synthetic chat" }],
  );
  await runner.task;
  assert.equal(api.claims, 1);
  assert.deepEqual(
    store.jobs.map((job) => job.status),
    ["verified", "pending"],
  );
});
test("an account switch before sharing stops the run", async (t) => {
  const { runner, api, store } = await setup(t);
  let checks = 0;
  api.identity = async (role) => {
    if (role === "source" && ++checks > 1) return { id: "changed-account" };
    return api[role];
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(api.claims, 0);
  assert.equal(store.jobs[0].status, "failed");
});
test("an account switch after receipt prevents verification", async (t) => {
  const { runner, api, store } = await setup(t);
  const claim = api.claim.bind(api);
  api.claim = async (job, save) => {
    await claim(job, save);
    api.target.id = "changed-target";
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "needs-review");
});
test("invalid selections and delay settings do not create a run", async (t) => {
  const { runner } = await setup(t);
  await assert.rejects(runner.start([], catalog));
  await assert.rejects(runner.start(["unknown"], catalog));
  await assert.rejects(runner.start(["source-chat", "source-chat"], catalog));
  await assert.rejects(
    runner.start(["source-chat"], catalog, { delaySeconds: 0 }),
  );
});
test("a pre-send failure may be retried safely", async (t) => {
  const { runner, api, store } = await setup(t);
  api.share = async () => {
    throw new Error("HTTP 429");
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "failed");
  assert.equal(api.claims, 0);
  api.share = async () => "https://chatgpt.com/share/synthetic-share";
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "verified");
});
test("after a crash, receipt phases become uncertain and sharing phases remain retryable", async (t) => {
  const { directory } = await setup(t);
  await writeFile(
    path.join(directory, "progress.json"),
    JSON.stringify({
      version: 1,
      jobs: [
        { status: "sending" },
        { status: "verifying" },
        { status: "opening" },
        { status: "sharing" },
      ],
    }),
  );
  const restored = new Store(directory);
  await restored.load();
  assert.deepEqual(
    restored.jobs.map((job) => job.status),
    ["needs-review", "needs-review", "needs-review", "pending"],
  );
});
test("malformed state is not silently overwritten", async (t) => {
  const { directory } = await setup(t);
  await writeFile(path.join(directory, "progress.json"), "{invalid");
  await assert.rejects(new Store(directory).load());
});
