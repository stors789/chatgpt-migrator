import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatGPT } from "../src/chatgpt.js";
import { snapshotOf, conversationIdFromUrl } from "../src/proof.js";
import { append, conversation, MemoryStorage } from "./fixtures.js";

async function setup() {
  const storage = new MemoryStorage();
  await storage.set({ accountTabs: { target: 1 } });
  const tabs = new Map([
    [
      1,
      {
        id: 1,
        windowId: 10,
        incognito: true,
        url: "https://chatgpt.com/",
      },
    ],
  ]);
  const copies = new Map();
  const injections = [];
  let created = 0;
  let sent = 0;
  const source = conversation();
  const api = {
    storage: { session: storage },
    tabs: {
      get: async (id) => {
        if (!tabs.has(id)) throw new Error("Tab closed");
        return { ...tabs.get(id) };
      },
      query: async ({ windowId }) =>
        [...tabs.values()].filter((tab) => tab.windowId === windowId),
      create: async ({ url, windowId }) => {
        const tab = {
          id: 100 + ++created,
          url,
          windowId,
          incognito: true,
          status: "loading",
        };
        tabs.set(tab.id, tab);
        return { ...tab };
      },
      remove: async (id) => tabs.delete(id),
    },
    scripting: {
      executeScript: async (injection) => {
        injections.push(injection);
        const tab = tabs.get(injection.target.tabId);
        if (injection.func.name === "prepareComposer")
          return [{ result: { url: tab.url } }];
        if (injection.func.name !== "sendMarker")
          throw new Error("Unexpected injection");
        sent++;
        const id = conversationIdFromUrl(tab.url) || "copy-chat";
        const data = copies.get(id) || structuredClone(source);
        data.conversation_id = id;
        append(data, injection.args[0]);
        copies.set(id, data);
        tab.url = `https://chatgpt.com/c/${id}`;
        return [{ result: { sent: true } }];
      },
    },
  };
  const chatgpt = new ChatGPT(api);
  chatgpt.conversation = async (_, id) => copies.get(id);
  chatgpt.list = async () => [...copies.keys()].map((id) => ({ id }));
  const job = {
    id: "receipt-id",
    sourceId: "source-chat",
    marker: "Keep this receipt\n[ChatPort:receipt-id]",
    shareUrl: "https://chatgpt.com/share/shared-chat",
    snapshot: await snapshotOf(source),
  };
  return {
    api,
    chatgpt,
    job,
    tabs,
    copies,
    injections,
    source,
    save: async (fields) => Object.assign(job, fields),
    get created() {
      return created;
    },
    get sent() {
      return sent;
    },
  };
}

test("a usable editor receives while the tab remains loading, with immediate injection", async () => {
  const app = await setup();
  await app.chatgpt.claim(app.job, app.save);
  assert.equal(app.tabs.get(app.job.receivingTabId).status, "loading");
  assert.ok(app.injections.every((injection) => injection.injectImmediately));
  assert.equal(app.created, 1);
  assert.equal(app.sent, 1);
  assert.equal(app.job.sendAttempted, true);
  assert.equal((await app.chatgpt.verify(app.job)).verified, true);
});

test("an old pre-send failure reuses its unique open shared tab", async () => {
  const app = await setup();
  app.tabs.set(50, {
    id: 50,
    windowId: 10,
    incognito: true,
    url: app.job.shareUrl,
  });
  await app.chatgpt.claim(app.job, app.save);
  assert.equal(app.job.receivingTabId, 50);
  assert.equal(app.created, 0);
  assert.equal(app.sent, 1);
});

test("an existing private copy with no marker is checked and continued in place", async () => {
  const app = await setup();
  const data = structuredClone(app.source);
  data.conversation_id = "existing-copy";
  app.copies.set("existing-copy", data);
  app.tabs.set(50, {
    id: 50,
    windowId: 10,
    incognito: true,
    url: "https://chatgpt.com/c/existing-copy",
  });
  await app.chatgpt.claim(app.job, app.save, "existing-copy");
  assert.equal(app.job.targetId, "existing-copy");
  assert.equal(app.created, 0);
  assert.equal(app.copies.size, 1);
  assert.equal(app.sent, 1);
  assert.equal((await app.chatgpt.verify(app.job)).verified, true);
});

test("a manually finished copy is verified without sending its marker again", async () => {
  const app = await setup();
  await app.chatgpt.claim(app.job, app.save);
  await app.chatgpt.claim(app.job, app.save);
  assert.equal(app.sent, 1);
  assert.equal(app.created, 1);
  assert.equal((await app.chatgpt.verify(app.job)).verified, true);
});

test("a mismatched private copy never receives the marker and is not saved as the target", async () => {
  const app = await setup();
  app.copies.set(
    "wrong-copy",
    conversation("wrong-copy", ["Different", "History"]),
  );
  app.tabs.set(50, {
    id: 50,
    windowId: 10,
    incognito: true,
    url: "https://chatgpt.com/c/wrong-copy",
  });
  await assert.rejects(
    app.chatgpt.claim(app.job, app.save, "wrong-copy"),
    /does not match/,
  );
  assert.equal(app.sent, 0);
  assert.equal(app.job.targetId, undefined);
  assert.equal(app.job.sendAttempted, false);
});

test("an explicit refusal before click is retryable, but a lost send response stays uncertain", async () => {
  const app = await setup();
  const inject = app.api.scripting.executeScript;
  app.api.scripting.executeScript = async (args) =>
    args.func.name === "sendMarker"
      ? [{ result: { error: "Send button unavailable", sent: false } }]
      : inject(args);
  await assert.rejects(app.chatgpt.claim(app.job, app.save), /unavailable/);
  assert.equal(app.job.sendAttempted, false);
  assert.equal(app.sent, 0);
  app.api.scripting.executeScript = async (args) => {
    if (args.func.name === "sendMarker") {
      await inject(args);
      throw new Error("Browser response lost after click");
    }
    return inject(args);
  };
  await assert.rejects(app.chatgpt.claim(app.job, app.save), /response lost/);
  assert.equal(app.job.sendAttempted, true);
  assert.equal(app.sent, 1);
});

test("duplicate legacy tabs or a moved receipt tab require inspection before any send", async () => {
  const app = await setup();
  for (const id of [50, 51])
    app.tabs.set(id, {
      id,
      windowId: 10,
      incognito: true,
      url: app.job.shareUrl,
    });
  await assert.rejects(app.chatgpt.claim(app.job, app.save), /More than one/);
  app.job.receivingTabId = 50;
  app.tabs.get(50).url = "https://accounts.google.com/";
  await assert.rejects(app.chatgpt.claim(app.job, app.save), /another page/);
  assert.equal(app.injections.length, 0);
  assert.equal(app.sent, 0);
});

test("a shared link redirected to a new-chat composer never receives a receipt-only message", async () => {
  const app = await setup();
  const inject = app.api.scripting.executeScript;
  app.api.scripting.executeScript = async (args) =>
    args.func.name === "prepareComposer"
      ? [{ result: { url: "https://chatgpt.com/" } }]
      : inject(args);
  await assert.rejects(app.chatgpt.claim(app.job, app.save), /different page/);
  assert.equal(app.sent, 0);
  assert.equal(app.job.sendAttempted, false);
});
