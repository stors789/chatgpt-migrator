import {
  conversationIdFromUrl,
  messagesOf,
  snapshotOf,
  verifyCopy,
} from "./proof.js";
import {
  browserRequest,
  prepareComposer,
  sendMarker,
  COMPOSER_SELECTOR,
} from "./page.js";

const ORIGIN = "https://chatgpt.com";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const loginError = (code, message) =>
  Object.assign(new Error(message), { code });

export class ChatGPT {
  constructor(api = globalThis.chrome) {
    this.api = api;
  }

  async open(role) {
    if (!["source", "target"].includes(role))
      throw new Error("Unknown account role.");
    if (
      role === "target" &&
      !(await this.api.extension.isAllowedIncognitoAccess())
    )
      throw loginError(
        "INCOGNITO_REQUIRED",
        "Allow ChatPort in incognito mode in Chrome's extension details, then open the destination account again.",
      );
    const { accountTabs = {} } =
      await this.api.storage.session.get("accountTabs");
    const existing =
      accountTabs[role] &&
      (await this.api.tabs.get(accountTabs[role]).catch(() => null));
    if (existing && existing.incognito === (role === "target")) {
      await this.api.windows.update(existing.windowId, { focused: true });
      await this.api.tabs.update(existing.id, { active: true });
      return;
    }
    let tab;
    if (role === "target") {
      const window = await this.api.windows.create({
        url: ORIGIN,
        incognito: true,
        width: 1280,
        height: 880,
      });
      tab = window.tabs[0];
    } else {
      const window = await this.api.windows.getCurrent();
      if (window.incognito)
        throw loginError(
          "REGULAR_WINDOW_REQUIRED",
          "Open ChatPort in a regular Chrome window.",
        );
      tab = await this.api.tabs.create({ url: ORIGIN, windowId: window.id });
    }
    accountTabs[role] = tab.id;
    await this.api.storage.session.set({ accountTabs });
  }

  async tab(role) {
    if (!["source", "target"].includes(role))
      throw new Error("Unknown account role.");
    const { accountTabs = {} } =
      await this.api.storage.session.get("accountTabs");
    const tab =
      accountTabs[role] &&
      (await this.api.tabs.get(accountTabs[role]).catch(() => null));
    if (
      !tab ||
      tab.incognito !== (role === "target") ||
      !tab.url?.startsWith(`${ORIGIN}/`)
    )
      throw loginError(
        "SIGN_IN_REQUIRED",
        `Open the ${role} account window and finish signing in to ChatGPT, then check accounts.`,
      );
    return tab;
  }

  async openDestination(id) {
    if (conversationIdFromUrl(`${ORIGIN}/c/${id}`) !== id)
      throw new Error("Invalid destination conversation ID.");
    const target = await this.tab("target");
    await this.api.tabs.create({
      windowId: target.windowId,
      url: `${ORIGIN}/c/${id}`,
      active: true,
    });
    await this.api.windows.update(target.windowId, { focused: true });
  }

  async execute(tabId, func, args = [], injectImmediately = false) {
    const results = await this.api.scripting.executeScript({
      target: { tabId },
      func,
      args,
      injectImmediately,
    });
    const result = results[0]?.result;
    if (!result)
      throw new Error(
        "ChatGPT did not return a browser result. Inspect its tab before retrying.",
      );
    if (result.error)
      throw Object.assign(new Error(result.error), {
        noMessageSent: result.sent === false,
      });
    return result;
  }

  async identity(role) {
    const tab = await this.tab(role);
    const result = await this.execute(tab.id, browserRequest, [
      { identity: true },
    ]);
    if (!result.user)
      throw loginError(
        "SIGN_IN_REQUIRED",
        `Finish signing in to the ${role} ChatGPT account, then check accounts.`,
      );
    return result.user;
  }

  async request(role, endpoint, { method = "GET", body } = {}) {
    const tab = await this.tab(role);
    const result = await this.execute(tab.id, browserRequest, [
      { endpoint, method, body },
    ]);
    if (result.status === 429)
      throw new Error(
        "ChatGPT is rate-limiting requests. Pause and try again later.",
      );
    if ([401, 403].includes(result.status))
      throw loginError(
        "SIGN_IN_REQUIRED",
        "ChatGPT requires a fresh login or a manual browser check.",
      );
    if (result.status < 200 || result.status >= 300 || result.malformed)
      throw new Error(
        `ChatGPT returned HTTP ${result.status} or an unsupported response. No result was accepted.`,
      );
    return result.data;
  }

  async list(role, archived = false) {
    const items = [];
    let offset = 0;
    for (;;) {
      const query = new URLSearchParams({
        offset: String(offset),
        limit: "100",
        order: "updated",
        is_archived: String(archived),
      });
      const data = await this.request(
        role,
        `/backend-api/conversations?${query}`,
      );
      if (!Array.isArray(data.items))
        throw new Error("ChatGPT changed its conversation-list format.");
      const fresh = data.items.filter(
        (item) => !items.some((existing) => existing.id === item.id),
      );
      if (
        fresh.length !== data.items.length ||
        new Set(fresh.map((item) => item.id)).size !== fresh.length
      )
        throw new Error(
          "ChatGPT repeated catalog entries. Reload the catalog before selecting conversations.",
        );
      items.push(...fresh.map((item) => ({ ...item, archived })));
      if (
        !data.items.length ||
        (Number.isFinite(data.total) &&
          offset + data.items.length >= data.total)
      )
        break;
      offset += data.items.length;
    }
    return items;
  }

  async catalog() {
    const regular = await this.list("source");
    const archived = await this.list("source", true);
    const catalog = new Map(
      [...regular, ...archived].map((item) => [
        item.id,
        {
          id: item.id,
          title: item.title || "Untitled conversation",
          updatedAt: item.update_time || item.create_time,
          project: item.gizmo_id || "",
          archived: item.archived,
        },
      ]),
    );
    let cursor;
    const seenProjectCursors = new Set();
    do {
      const query = new URLSearchParams({ conversations_per_gizmo: "0" });
      if (cursor) query.set("cursor", cursor);
      const data = await this.request(
        "source",
        `/backend-api/gizmos/snorlax/sidebar?${query}`,
      );
      if (!Array.isArray(data.items))
        throw new Error("ChatGPT changed its project-list format.");
      for (const item of data.items) {
        const project = item.gizmo?.gizmo || item.gizmo;
        if (!project?.id?.startsWith("g-p-")) continue;
        const name = project.display?.name || project.id;
        let chatCursor;
        const seenChatCursors = new Set();
        do {
          const chatQuery = new URLSearchParams({ limit: "100" });
          if (chatCursor) chatQuery.set("cursor", chatCursor);
          const chats = await this.request(
            "source",
            `/backend-api/gizmos/${encodeURIComponent(project.id)}/conversations?${chatQuery}`,
          );
          if (!Array.isArray(chats.items))
            throw new Error("ChatGPT changed its project-conversation format.");
          for (const chat of chats.items) {
            if (!chat.id)
              throw new Error("A project conversation is missing its ID.");
            const existing = catalog.get(chat.id);
            catalog.set(chat.id, {
              id: chat.id,
              title: chat.title || existing?.title || "Untitled conversation",
              updatedAt:
                chat.update_time || chat.create_time || existing?.updatedAt,
              project: project.id,
              projectName: name,
              archived: existing?.archived || Boolean(chat.is_archived),
            });
          }
          chatCursor = chats.cursor;
          if (chatCursor && seenChatCursors.has(chatCursor))
            throw new Error("ChatGPT repeated a project conversation cursor.");
          seenChatCursors.add(chatCursor);
        } while (chatCursor);
      }
      cursor = data.cursor;
      if (cursor && seenProjectCursors.has(cursor))
        throw new Error("ChatGPT repeated a project cursor.");
      seenProjectCursors.add(cursor);
    } while (cursor);
    return [...catalog.values()].sort((a, b) => {
      const timestamp = (value) =>
        typeof value === "number" ? value * 1000 : Date.parse(value);
      return timestamp(b.updatedAt) - timestamp(a.updatedAt);
    });
  }

  async conversation(role, id) {
    if (!/^[a-zA-Z0-9-]+$/.test(id))
      throw new Error("Invalid conversation ID.");
    return this.request(role, `/backend-api/conversation/${id}`);
  }

  async share(id, nodeId, title) {
    const data = await this.request("source", "/backend-api/share/create", {
      method: "POST",
      body: {
        conversation_id: id,
        current_node_id: nodeId,
        is_anonymous: true,
      },
    });
    if (!data.share_id) throw new Error("ChatGPT did not return a share ID.");
    await this.request(
      "source",
      `/backend-api/share/${encodeURIComponent(data.share_id)}`,
      {
        method: "PATCH",
        body: {
          share_id: data.share_id,
          is_public: true,
          is_visible: true,
          is_anonymous: true,
          highlighted_message_id: null,
          title,
        },
      },
    );
    return `${ORIGIN}/share/${encodeURIComponent(data.share_id)}`;
  }

  async claim(job, saveReceipt, targetId) {
    const destination = await this.tab("target");
    const requestedId = targetId || job.targetId;
    let tab =
      !targetId &&
      job.receivingTabId &&
      (await this.api.tabs.get(job.receivingTabId).catch(() => null));
    if (
      tab &&
      (!tab.incognito ||
        tab.windowId !== destination.windowId ||
        (tab.url !== job.shareUrl && !conversationIdFromUrl(tab.url)))
    )
      throw new Error(
        "The receiving tab now shows another page. Restore it or close it before retrying.",
      );
    if (!tab) {
      const candidates = (
        await this.api.tabs.query({ windowId: destination.windowId })
      ).filter(
        (candidate) =>
          candidate.incognito &&
          (requestedId
            ? conversationIdFromUrl(candidate.url) === requestedId
            : candidate.url === job.shareUrl),
      );
      if (candidates.length > 1)
        throw new Error(
          "More than one receiving tab matches this receipt. Keep one open and close the duplicates before retrying.",
        );
      tab =
        candidates[0] ||
        (await this.api.tabs.create({
          windowId: destination.windowId,
          url: requestedId ? `${ORIGIN}/c/${requestedId}` : job.shareUrl,
          active: false,
        }));
    }
    // Save the tab before touching its editor. Reloads can resume the same copy.
    await saveReceipt({ receivingTabId: tab.id, sendAttempted: false });
    const deadline = Date.now() + 30000;
    // A committed ChatGPT URL is sufficient. Slow images must not block a usable editor.
    while (!(await this.api.tabs.get(tab.id)).url?.startsWith(`${ORIGIN}/`)) {
      if (Date.now() > deadline)
        throw new Error(
          "The receiving page did not open. No message was sent; retry from this receipt.",
        );
      await delay(200);
    }
    const prepared = await this.execute(
      tab.id,
      prepareComposer,
      [COMPOSER_SELECTOR],
      true,
    );
    const earlyId = conversationIdFromUrl(prepared.url);
    const preparedPage = new URL(prepared.url);
    const sharedPage = new URL(job.shareUrl);
    const intendedShare =
      preparedPage.origin === ORIGIN &&
      sharedPage.origin === ORIGIN &&
      sharedPage.pathname.startsWith("/share/") &&
      preparedPage.pathname.replace(/\/$/, "") ===
        sharedPage.pathname.replace(/\/$/, "");
    if (!earlyId && !intendedShare)
      throw new Error(
        "The shared link opened a different page. No message was sent; inspect the receiving tab.",
      );
    if (earlyId) {
      const target = await this.conversation("target", earlyId);
      if (
        earlyId === job.sourceId ||
        (target.conversation_id || target.id) !== earlyId ||
        target.is_read_only
      )
        throw new Error(
          "This tab is not a distinct editable destination copy.",
        );
      if (
        messagesOf(target).some(
          (message) => message.role === "user" && message.text === job.marker,
        )
      ) {
        await saveReceipt({ targetId: earlyId, sendAttempted: true });
        return earlyId;
      }
      const snapshot = await snapshotOf(target);
      if (
        snapshot.count !== job.snapshot.count ||
        snapshot.digest !== job.snapshot.digest
      )
        throw new Error(
          "The existing copy does not match the original messages. No message was sent.",
        );
      await saveReceipt({ targetId: earlyId });
    }
    // A crash or lost scripting response from this point requires checking, not resending.
    await saveReceipt({ status: "sending", sendAttempted: true });
    try {
      await this.execute(
        tab.id,
        sendMarker,
        [job.marker, COMPOSER_SELECTOR, prepared.url],
        true,
      );
    } catch (error) {
      if (error.noMessageSent) await saveReceipt({ sendAttempted: false });
      throw error;
    }
    const receiptDeadline = Date.now() + 45000;
    for (;;) {
      const current = await this.api.tabs.get(tab.id);
      const targetId = conversationIdFromUrl(current.url);
      if (targetId && targetId !== job.sourceId) {
        await saveReceipt({ targetId, status: "verifying" });
        return targetId;
      }
      if (Date.now() > receiptDeadline)
        throw new Error(
          "ChatGPT did not create a distinct destination conversation. Inspect its tab before resending.",
        );
      await delay(200);
    }
  }

  async verify(job) {
    if (!job.targetId)
      return {
        verified: false,
        reason: "No destination ID has been recovered yet.",
      };
    const history = await this.list("target");
    const target = await this.conversation("target", job.targetId);
    const proof = await verifyCopy({
      snapshot: job.snapshot,
      sourceId: job.sourceId,
      targetId: job.targetId,
      target,
      inHistory: history.some((item) => item.id === job.targetId),
      marker: job.marker,
    });
    if (proof.verified && job.receivingTabId) {
      const tab = await this.api.tabs.get(job.receivingTabId).catch(() => null);
      if (tab?.incognito && conversationIdFromUrl(tab.url) === job.targetId)
        await this.api.tabs.remove(tab.id).catch(() => {});
    }
    return proof;
  }

  async recover(job) {
    if (job.targetId) return job.targetId;
    if (job.receivingTabId) {
      const destination = await this.tab("target");
      const tab = await this.api.tabs.get(job.receivingTabId).catch(() => null);
      const id = conversationIdFromUrl(tab?.url);
      if (
        tab?.incognito &&
        tab.windowId === destination.windowId &&
        id &&
        id !== job.sourceId
      )
        return id;
    }
    const history = await this.list("target");
    for (const item of history) {
      const value = item.update_time || item.create_time;
      const updated =
        typeof value === "number" ? value * 1000 : Date.parse(value);
      if (
        !Number.isFinite(updated) ||
        updated < Date.parse(job.createdAt) - 60000
      )
        continue;
      const data = await this.conversation("target", item.id);
      if (
        messagesOf(data).some(
          (message) => message.role === "user" && message.text === job.marker,
        )
      )
        return item.id;
    }
    return null;
  }
}
