import { chromium } from "playwright";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { conversation, append } from "../fixtures.js";

export async function fixture({
  incognito = true,
  composer = "legacy",
  slowResource = false,
} = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "chatport-extension-"));
  const key = path.join(directory, "key.pem");
  const cert = path.join(directory, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-subj",
      "/CN=chatgpt.com",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
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
    Object.assign(data, {
      title: titles[i],
      create_time: 1789862400,
      update_time: 1791676800 - i * 86400,
      archived: i === titles.length - 1,
      gizmo_id: i === 0 || i === 2 ? "g-p-research" : null,
    });
    source.set(data.conversation_id, data);
  }
  let mode = "success";
  let sent = 0;
  let sessions = 0;
  let targetSignedIn = true;
  let shareVisits = 0;
  const readyStates = [];
  const secure = https.createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (request, response) => {
      if (request.headers.host !== "chatgpt.com") {
        response.writeHead(404);
        response.end();
        return;
      }
      const url = new URL(request.url, "https://chatgpt.com");
      let role = request.headers.cookie?.match(
        /chatport_fixture=(source|target)/,
      )?.[1];
      if (!role) {
        role = ++sessions === 1 ? "source" : "target";
        response.setHeader(
          "Set-Cookie",
          `chatport_fixture=${role}; Secure; Path=/; SameSite=Lax`,
        );
      }
      let text = "";
      for await (const chunk of request) text += chunk;
      const body = text ? JSON.parse(text) : {};
      const json = (data, status = 200) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(data));
      };
      const html = (value) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(value);
      };
      if (url.pathname === "/slow-image") {
        response.writeHead(200, { "content-type": "image/png" });
        response.write(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        // Intentionally unfinished: the editor is usable while the load event waits.
        return;
      }
      if (url.pathname === "/unexpected-root-message") {
        sent++;
        return json({});
      }
      if (url.pathname.startsWith("/share/") && mode === "redirect-home") {
        response.writeHead(302, { location: "/" });
        response.end();
        return;
      }
      if (url.pathname === "/" && mode === "redirect-home")
        return html(
          '<form><div contenteditable="true" role="textbox"></div><button type="submit">Send</button></form><script>document.querySelector("form").onsubmit=(event)=>{event.preventDefault();fetch("/unexpected-root-message",{method:"POST"});};</script>',
        );
      if (url.pathname === "/api/auth/session")
        return json(
          role === "target" && !targetSignedIn
            ? {}
            : {
                user: {
                  id: `${role}-account`,
                  email:
                    role === "source"
                      ? "source@example.test"
                      : "destination@example.test",
                },
                accessToken: "synthetic-test-token",
              },
        );
      if (url.pathname === "/backend-api/conversations") {
        const entries = [
          ...(role === "source" ? source : target).values(),
        ].filter(
          (item) =>
            Boolean(item.archived) ===
            (url.searchParams.get("is_archived") === "true"),
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        return json({
          items: entries.slice(offset, offset + 100).map((item) => ({
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
        return json({
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
        return json({
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
        return json(item || {}, item ? 200 : 404);
      }
      if (url.pathname === "/backend-api/share/create") {
        const id = `share-${body.conversation_id}`;
        shares.set(id, structuredClone(source.get(body.conversation_id)));
        return json({ share_id: id });
      }
      if (url.pathname.startsWith("/backend-api/share/")) return json({});
      if (
        url.pathname === "/backend-api/conversation" &&
        request.method === "POST"
      ) {
        if (role !== "target")
          return json({ error: "Wrong account received the chat" }, 403);
        sent++;
        readyStates.push(body.readyState);
        const data = structuredClone(
          body.targetId ? target.get(body.targetId) : shares.get(body.shareId),
        );
        Object.assign(data, {
          conversation_id: body.targetId || `target-${sent}`,
          create_time: Date.now() / 1000,
          update_time: Date.now() / 1000,
          archived: false,
        });
        append(data, body.message);
        append(data, "OK", "assistant");
        if (mode === "changed-history")
          data.mapping["message-1"].message.content.parts = ["Changed text"];
        target.set(data.conversation_id, data);
        return json({ id: data.conversation_id });
      }
      if (
        url.pathname.startsWith("/share/") ||
        url.pathname.startsWith("/c/")
      ) {
        const shareId = url.pathname.split("/").at(-1);
        const targetId = url.pathname.startsWith("/c/") ? shareId : null;
        if (!targetId) shareVisits++;
        const editor =
          composer === "current"
            ? '<form><div contenteditable="true" role="textbox" aria-label="询问 ChatGPT"></div><button type="button" aria-label="添加文件等内容">Add file</button><button type="submit" aria-label="发送">Send</button></form>'
            : '<div id="prompt-textarea" contenteditable="true" role="textbox"></div><button data-testid="send-button" aria-label="Send prompt">Send</button>';
        const otherForm =
          '<form id="unrelated"><div contenteditable="true" role="textbox" aria-label="Hidden search" style="display:none"></div><button type="submit">Search</button></form>';
        return html(`<!doctype html><html><body><p>Synthetic shared conversation</p>${slowResource ? '<img src="/slow-image" alt="" width="1" height="1">' : ""}${otherForm}${editor}<script>
        const box = document.querySelector('[aria-label="询问 ChatGPT"], #prompt-textarea');
        const submit = async (event) => {event.preventDefault(); const response=await fetch('/backend-api/conversation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shareId:${JSON.stringify(shareId)},targetId:${JSON.stringify(targetId)},message:box.innerText,readyState:document.readyState})}); const data=await response.json(); history.replaceState({},'', '/c/'+data.id);};
        if(box.closest('form')) box.closest('form').onsubmit=submit;
        else document.querySelector('[data-testid="send-button"]').onclick=submit;
        document.querySelector('#unrelated').onsubmit=(event)=>{event.preventDefault();document.body.dataset.wrongSubmit='true';};
        ${mode === "wait-to-send" ? 'const send = box.closest("form").querySelector("button[type=submit]"); send.disabled = true; setTimeout(()=>{send.disabled=false;},3500);' : ""}
        </script></body></html>`);
      }
      return html(
        "<!doctype html><html><body>Synthetic personal account</body></html>",
      );
    },
  );
  // The test-only proxy covers both real normal and incognito browser contexts.
  // No requests go to real ChatGPT; the TLS key is generated in the temporary directory.
  const proxy = http.createServer((_, response) => {
    response.writeHead(404);
    response.end();
  });
  const sockets = new Set();
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  proxy.on("connect", (request, socket, head) => {
    if (request.url !== "chatgpt.com:443") {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) socket.unshift(head);
    secure.emit("connection", socket);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const extension = path.resolve("dist");
  let context;
  try {
    context = await chromium.launchPersistentContext(
      path.join(directory, "browser"),
      {
        channel: "chromium",
        headless: true,
        locale: "en-US",
        viewport: { width: 1440, height: 1050 },
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          `--proxy-server=http://127.0.0.1:${proxy.address().port}`,
          "--ignore-certificate-errors",
          "--disable-quic",
        ],
      },
    );
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = worker.url().split("/")[2];
    const page = await context.newPage();
    if (incognito) {
      await page.goto(`chrome://extensions/?id=${id}`);
      await page.locator("#devMode").click();
      const reloaded = context.waitForEvent("serviceworker");
      await page.locator("#allow-incognito cr-toggle").click();
      await reloaded;
    }
    const url = `chrome-extension://${id}/public/index.html`;
    await page.goto(url);
    return {
      context,
      page,
      url,
      source,
      target,
      shares,
      worker,
      get sent() {
        return sent;
      },
      get shareVisits() {
        return shareVisits;
      },
      readyStates,
      setMode(value) {
        mode = value;
      },
      setTargetSignedIn(value) {
        targetSignedIn = value;
      },
      async jobs() {
        return page.evaluate(
          async () =>
            (await chrome.storage.local.get("progress")).progress?.jobs || [],
        );
      },
      async close() {
        await context.close();
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => proxy.close(resolve));
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (context) await context.close();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => proxy.close(resolve));
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
