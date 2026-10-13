import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/application.js";
import { ChatGPT } from "../src/chatgpt.js";
import { Store } from "../src/store.js";
import { FakeChatGPT, MemoryStorage } from "./fixtures.js";

async function setup() {
  const store = new Store(new MemoryStorage());
  await store.load();
  const chatgpt = new FakeChatGPT();
  chatgpt.catalog = async () => [
    { id: "source-chat", title: "Synthetic conversation" },
  ];
  const application = createApplication(store, chatgpt, {
    verificationDelays: [0],
  });
  await application.request("accounts");
  await application.request("catalog");
  return { application, chatgpt, store };
}

test("public sharing requires explicit confirmation before any migration side effect", async () => {
  const { application, chatgpt, store } = await setup();
  await assert.rejects(
    application.request("start", { ids: ["source-chat"] }),
    /Confirm/,
  );
  assert.equal(chatgpt.claims, 0);
  assert.deepEqual(store.jobs, []);
});

test("a failed account check clears old identities and a changed source clears its catalog", async () => {
  const { application, chatgpt } = await setup();
  chatgpt.identity = async () => {
    throw new Error("Authentication expired");
  };
  await assert.rejects(application.request("accounts"), /expired/);
  const state = application.snapshot();
  assert.deepEqual(state.accounts, { source: null, target: null });
  assert.deepEqual(state.catalog, []);
  assert.equal(state.catalogLoaded, false);
});

test("mutating account bindings is rejected while a migration is running", async () => {
  const { application } = await setup();
  let finish;
  application.migration.chatgpt.claim = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await application.request("start", {
    ids: ["source-chat"],
    confirmSharing: true,
  });
  await assert.rejects(
    application.request("open", { role: "target" }),
    /current operation/,
  );
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
  finish();
  await application.migration.task;
});

test("a destination bound to a regular tab is rejected before injecting any script", async () => {
  const storage = new MemoryStorage();
  await storage.set({ accountTabs: { target: 41 } });
  const chatgpt = new ChatGPT({
    storage: { session: storage },
    tabs: {
      get: async () => ({
        id: 41,
        incognito: false,
        url: "https://chatgpt.com/",
      }),
    },
  });
  await assert.rejects(chatgpt.identity("target"), {
    code: "SIGN_IN_REQUIRED",
  });
});

test("Google login and other non-ChatGPT pages are never injected into", async () => {
  const storage = new MemoryStorage();
  await storage.set({ accountTabs: { source: 42 } });
  const chatgpt = new ChatGPT({
    storage: { session: storage },
    tabs: {
      get: async () => ({
        id: 42,
        incognito: false,
        url: "https://accounts.google.com/",
      }),
    },
  });
  await assert.rejects(chatgpt.identity("source"), {
    code: "SIGN_IN_REQUIRED",
  });
});

test("receipt navigation rejects a switched destination account before opening the copy", async () => {
  const { application, chatgpt, store } = await setup();
  await application.request("start", {
    ids: ["source-chat"],
    confirmSharing: true,
  });
  await application.migration.task;
  let opened = false;
  chatgpt.openDestination = async () => {
    opened = true;
  };
  chatgpt.target.id = "different-account";
  await assert.rejects(
    application.request("destination", { id: store.jobs[0].id }),
    { code: "SIGN_IN_REQUIRED" },
  );
  assert.equal(opened, false);
});

test("receipt recovery rejects another displayed account pair and a shared URL before receiving", async () => {
  const { application, chatgpt, store } = await setup();
  await application.request("start", {
    ids: ["source-chat"],
    confirmSharing: true,
  });
  await application.migration.task;
  const job = store.jobs[0];
  job.status = "failed";
  job.sendAttempted = false;
  await assert.rejects(
    application.request("retry", { id: job.id, url: job.shareUrl }),
    /not a shared link/,
  );
  chatgpt.target.id = "another-account";
  await application.request("accounts");
  await assert.rejects(
    application.request("retry", { id: job.id }),
    /original account pair/,
  );
  assert.equal(chatgpt.claims, 1);
});
