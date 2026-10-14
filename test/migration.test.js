import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import { Migration } from "../src/migration.js";
import { FakeChatGPT, MemoryStorage } from "./fixtures.js";

const catalog = [{ id: "source-chat", title: "Synthetic conversation" }];
async function setup(t) {
  const storage = new MemoryStorage();
  const store = new Store(storage);
  await store.load();
  const api = new FakeChatGPT();
  const runner = new Migration(store, api, { verificationDelays: [0] });
  return { store, api, runner, storage };
}
test("successful migration persists only receipts and skips verified copies on resume", async (t) => {
  const { runner, store, api, storage } = await setup(t);
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "verified");
  const saved = JSON.stringify((await storage.get("progress")).progress);
  assert.ok(!saved.includes("An answer"));
  assert.ok(!saved.includes("accessToken"));
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(api.claims, 1);
});
test("a send with no persisted copy stays uncertain and is never automatically resent", async (t) => {
  const { runner, store, api } = await setup(t);
  api.claim = async (job, save) => {
    api.claims++;
    await save({ sendAttempted: true });
    throw new Error("Browser closed after send");
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  assert.equal(store.jobs[0].status, "needs-review");
  await assert.rejects(runner.start(["source-chat"], catalog), {
    code: "REVIEW_REQUIRED",
  });
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
  const { storage } = await setup(t);
  await storage.set({
    progress: {
      version: 1,
      jobs: [
        { status: "sending" },
        { status: "verifying" },
        { status: "opening" },
        { status: "sharing" },
      ],
    },
  });
  const restored = new Store(storage);
  await restored.load();
  assert.deepEqual(
    restored.jobs.map((job) => job.status),
    ["needs-review", "needs-review", "needs-review", "pending"],
  );
});
test("malformed state is not silently overwritten", async (t) => {
  const { storage } = await setup(t);
  await storage.set({ progress: "invalid" });
  await assert.rejects(new Store(storage).load());
  assert.equal((await storage.get("progress")).progress, "invalid");
});

test("old loading and composer failures remain recoverable after upgrading", async (t) => {
  const { storage } = await setup(t);
  const errors = [
    "The shared conversation did not finish loading.",
    "The shared chat has no editable composer. Inspect the destination tab.",
    "The destination editor already contains text. Inspect it before continuing.",
    "The receipt message could not be entered exactly. No message was sent.",
    "The previous run stopped during receipt. Check the destination before sending again.",
  ];
  await storage.set({
    progress: {
      version: 1,
      jobs: errors.map((error) => ({ status: "needs-review", error })),
    },
  });
  const restored = new Store(storage);
  await restored.load();
  assert.deepEqual(
    restored.jobs.map((job) => job.sendAttempted),
    [false, false, false, false, undefined],
  );
});

test("a known pre-send receipt can be retried without replacing its ID or marker", async (t) => {
  const { runner, api, store } = await setup(t);
  const claim = api.claim.bind(api);
  api.claim = async () => {
    throw new Error("Editor unavailable before sending");
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  const job = store.jobs[0];
  const marker = job.marker;
  const id = job.id;
  assert.equal(job.status, "failed");
  api.claim = claim;
  await runner.retry(id);
  assert.equal(job.status, "verified");
  assert.equal(job.marker, marker);
  assert.equal(job.id, id);
  assert.equal(store.jobs.length, 1);
});

test("retry refuses a potentially sent receipt and a changed account before side effects", async (t) => {
  const { runner, api, store } = await setup(t);
  api.claim = async (job, save) => {
    await save({ sendAttempted: true });
    throw new Error("Send response lost");
  };
  await runner.start(["source-chat"], catalog);
  await runner.task;
  const job = store.jobs[0];
  await assert.rejects(runner.retry(job.id), /already have sent/);
  job.sendAttempted = false;
  api.target.id = "changed-target";
  await assert.rejects(runner.retry(job.id), /account changed/);
  assert.equal(api.claims, 0);
  assert.equal(runner.running, false);
});

test("a formerly unsent failure completed manually is found before retry sends anything", async (t) => {
  const { runner, api, store } = await setup(t);
  await runner.start(["source-chat"], catalog);
  await runner.task;
  const job = store.jobs[0];
  job.status = "needs-review";
  job.sendAttempted = false;
  job.targetId = null;
  await runner.retry(job.id);
  assert.equal(job.status, "verified");
  assert.equal(api.claims, 1);
  assert.equal(api.copies.size, 1);
});
