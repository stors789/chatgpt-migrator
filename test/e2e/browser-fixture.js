import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChatGPT } from "../../src/chatgpt.js";
import { Store } from "../../src/store.js";
import { createApplication } from "../../src/server.js";
import { conversation, append } from "../fixtures.js";

export async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "chatport-browser-"));
  const store = new Store(directory);
  await store.load();
  const browser = await chromium.launch({ headless: true });
  const chatgpt = new ChatGPT(directory);
  const source = new Map();
  const target = new Map();
  const shares = new Map();
  const titles = [
    "Research notes on mitochondrial dynamics",
    "A weekend in Kyoto",
    "Planning the next release",
    "Language learning practice",
    "A recipe worth keeping",
    "Archived reading notes",
  ];
  for (let i = 0; i < titles.length; i++) {
    const data = conversation(`source-${i}`, [
      `Synthetic question for ${titles[i]}`,
      `Synthetic answer for ${titles[i]}`,
    ]);
    data.title = titles[i];
    data.create_time = 1789862400;
    data.update_time = 1791676800 - i * 86400;
    data.archived = i === titles.length - 1;
    data.gizmo_id = i === 0 || i === 2 ? "g-p-research" : null;
    source.set(data.conversation_id, data);
  }
  let mode = "success";
  let sent = 0;
  for (const role of ["source", "target"]) {
    const context = await browser.newContext({ locale: "en-US" });
    await context.route("https://chatgpt.com/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const fulfill = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (url.pathname === "/api/auth/session")
        return fulfill({
          user: {
            id: `${role}-account`,
            email:
              role === "source"
                ? "source@example.test"
                : "destination@example.test",
          },
          accessToken: "synthetic-test-token",
        });
      if (url.pathname === "/backend-api/conversations") {
        const entries = [
          ...(role === "source" ? source : target).values(),
        ].filter(
          (item) =>
            Boolean(item.archived) ===
            (url.searchParams.get("is_archived") === "true"),
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        const limit = Number(url.searchParams.get("limit") || 100);
        return fulfill({
          items: entries
            .slice(offset, offset + limit)
            .map((item) => ({
              id: item.conversation_id,
              title: item.title,
              create_time: item.create_time,
              update_time: item.update_time,
              gizmo_id: item.gizmo_id,
            })),
          total: entries.length,
        });
      }
      if (url.pathname === "/backend-api/gizmos/snorlax/sidebar")
        return fulfill({
          items: [
            {
              gizmo: {
                id: "g-p-research",
                display: { name: "Research & writing" },
              },
            },
          ],
        });
      if (url.pathname === "/backend-api/gizmos/g-p-research/conversations")
        return fulfill({
          items: [...source.values()]
            .filter((item) => item.gizmo_id)
            .map((item) => ({
              id: item.conversation_id,
              title: item.title,
              update_time: item.update_time,
            })),
        });
      if (url.pathname.startsWith("/backend-api/conversation/")) {
        const item = (role === "source" ? source : target).get(
          url.pathname.split("/").at(-1),
        );
        return fulfill(item || {}, item ? 200 : 404);
      }
      if (url.pathname === "/backend-api/share/create") {
        const body = request.postDataJSON();
        const id = `share-${body.conversation_id}`;
        shares.set(id, structuredClone(source.get(body.conversation_id)));
        return fulfill({ share_id: id });
      }
      if (url.pathname.startsWith("/backend-api/share/")) return fulfill({});
      if (
        url.pathname === "/backend-api/conversation" &&
        request.method() === "POST"
      ) {
        const { shareId, message } = request.postDataJSON();
        const data = structuredClone(shares.get(shareId));
        data.conversation_id = `target-${++sent}`;
        data.create_time = Date.now() / 1000;
        data.update_time = data.create_time;
        data.archived = false;
        append(data, message);
        append(data, "OK", "assistant");
        if (mode === "success") target.set(data.conversation_id, data);
        else {
          const broken = structuredClone(data);
          broken.mapping["message-1"].message.content.parts = ["Changed text"];
          target.set(data.conversation_id, broken);
        }
        return fulfill({ id: data.conversation_id });
      }
      if (url.pathname.startsWith("/share/")) {
        const shareId = url.pathname.split("/").at(-1);
        const html = `<!doctype html><html><body><p>This is a synthetic shared conversation for automated tests.</p><div id="prompt-textarea" contenteditable="true" role="textbox"></div><button data-testid="send-button" aria-label="Send prompt">Send</button><script>document.querySelector('button').onclick=async()=>{const response=await fetch('/backend-api/conversation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shareId:${JSON.stringify(shareId)},message:document.querySelector('#prompt-textarea').innerText})});const data=await response.json();history.replaceState({},'', '/c/'+data.id);};</script></body></html>`;
        return route.fulfill({ contentType: "text/html", body: html });
      }
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body>Synthetic personal account</body></html>",
      });
    });
    const page = await context.newPage();
    await page.goto("https://chatgpt.com");
    chatgpt.sessions[role] = { context, api: page };
  }
  const application = createApplication(store, chatgpt, {
    verificationDelays: [0],
  });
  await new Promise((resolve) =>
    application.server.listen(0, "127.0.0.1", resolve),
  );
  const url = `http://127.0.0.1:${application.server.address().port}`;
  return {
    ...application,
    url,
    browser,
    store,
    source,
    target,
    get sent() {
      return sent;
    },
    setMode(value) {
      mode = value;
    },
    async close() {
      await browser.close();
      await new Promise((resolve) => application.server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    },
  };
}
