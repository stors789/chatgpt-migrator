import path from "node:path";
import { chromium } from "playwright";
import { conversationIdFromUrl, messagesOf, verifyCopy } from "./proof.js";

const ORIGIN = "https://chatgpt.com";
const roles = new Set(["source", "target"]);

export class ChatGPT {
  constructor(directory, { browser = "chrome" } = {}) {
    this.directory = directory;
    this.browser = browser;
    this.sessions = {};
  }

  async open(role) {
    if (!roles.has(role)) throw new Error("Unknown account role.");
    if (this.sessions[role]) {
      await this.sessions[role].api.bringToFront();
      return;
    }
    const context = await chromium.launchPersistentContext(
      path.join(this.directory, "profiles", role),
      {
        ...(this.browser === "chrome" ? { channel: "chrome" } : {}),
        headless: false,
        viewport: { width: 1280, height: 880 },
        locale: "en-US",
      },
    );
    const api = context.pages()[0] || (await context.newPage());
    this.sessions[role] = { context, api };
    context.on("close", () => {
      delete this.sessions[role];
    });
    await api.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  }

  page(role) {
    const api = this.sessions[role]?.api;
    if (!api || api.isClosed())
      throw new Error(`Open and sign in to the ${role} browser first.`);
    if (new URL(api.url()).origin !== ORIGIN)
      throw new Error(`Finish signing in to the ${role} browser first.`);
    return api;
  }

  async identity(role) {
    const page = this.page(role);
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
      });
      if (!response.ok) return null;
      const session = await response.json();
      if (!session.user?.id || !session.accessToken) return null;
      return {
        id: session.user.id,
        email: session.user.email || session.user.name || session.user.id,
      };
    });
    if (!result)
      throw new Error(
        `Finish signing in to the ${role} browser, then check the accounts again.`,
      );
    return result;
  }

  async request(role, endpoint, { method = "GET", body } = {}) {
    const result = await this.page(role).evaluate(
      async ({ endpoint, method, body }) => {
        const sessionResponse = await fetch("/api/auth/session", {
          credentials: "include",
        });
        const session = await sessionResponse.json();
        if (!session.accessToken) return { status: 401 };
        const response = await fetch(endpoint, {
          method,
          credentials: "include",
          headers: {
            authorization: `Bearer ${session.accessToken}`,
            "content-type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        let data;
        try {
          data = await response.json();
        } catch {
          return { status: response.status, malformed: true };
        }
        return { status: response.status, data };
      },
      { endpoint, method, body },
    );
    if (result.status === 429)
      throw new Error(
        "ChatGPT is rate-limiting requests. Pause and try again later.",
      );
    if ([401, 403].includes(result.status))
      throw new Error(
        "ChatGPT requires a fresh login or a manual browser check.",
      );
    if (result.status < 200 || result.status >= 300 || result.malformed) {
      throw new Error(
        `ChatGPT returned HTTP ${result.status} or an unsupported response. No result was accepted.`,
      );
    }
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

  async claim(job, saveTarget) {
    const context = this.sessions.target?.context;
    if (!context) throw new Error("Open the target browser first.");
    const page = await context.newPage();
    // Keep the page open on failure so a human can resolve login/captcha/loading.
    await page.goto(job.shareUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const continueButton = page.getByRole("button", {
      name: /^(continue this conversation|continue conversation|continue chat|继续此对话|继续对话)$/i,
    });
    const composer = page.locator("#prompt-textarea");
    await Promise.race([
      composer.waitFor({ state: "visible", timeout: 30000 }),
      continueButton.waitFor({ state: "visible", timeout: 30000 }),
    ]);
    if (await continueButton.isVisible()) await continueButton.click();
    await composer.waitFor({ state: "visible", timeout: 30000 });
    const earlyId = conversationIdFromUrl(page.url());
    if (earlyId && earlyId !== job.sourceId) await saveTarget(earlyId);
    await composer.fill(job.marker);
    const send = page.locator(
      '[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]',
    );
    if (await send.isVisible()) await send.click();
    else await composer.press("Enter");
    await page.waitForURL((url) => Boolean(conversationIdFromUrl(url.href)), {
      timeout: 45000,
    });
    const targetId = conversationIdFromUrl(page.url());
    if (!targetId || targetId === job.sourceId)
      throw new Error(
        "ChatGPT did not create a distinct destination conversation.",
      );
    await saveTarget(targetId);
    // A new URL is only a candidate. The runner verifies server persistence next.
    await page.close();
    return targetId;
  }

  async verify(job) {
    if (!job.targetId)
      return {
        verified: false,
        reason: "No destination ID has been recovered yet.",
      };
    const history = await this.list("target");
    const target = await this.conversation("target", job.targetId);
    return verifyCopy({
      snapshot: job.snapshot,
      sourceId: job.sourceId,
      targetId: job.targetId,
      target,
      inHistory: history.some((item) => item.id === job.targetId),
      marker: job.marker,
    });
  }

  async recover(job) {
    if (job.targetId) return job.targetId;
    const history = await this.list("target");
    // Search conversations created since this attempt, including differently titled copies.
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

  async close() {
    await Promise.all(
      Object.values(this.sessions).map(({ context }) => context.close()),
    );
  }
}
