#!/usr/bin/env node
import http from "node:http";
import { readFile, mkdir, open, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ChatGPT } from "./chatgpt.js";
import { Migration } from "./migration.js";
import { Store } from "./store.js";
import { conversationIdFromUrl, messagesOf } from "./proof.js";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/i18n.js": ["i18n.js", "text/javascript; charset=utf-8"],
  "/fonts/dm-sans.woff2": ["fonts/dm-sans.woff2", "font/woff2"],
};

async function bodyOf(request) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new Error("JSON is required.");
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text) > 256 * 1024)
      throw new Error("Request is too large.");
  }
  return JSON.parse(text || "{}");
}

export function createApplication(store, chatgpt, options = {}) {
  const migration = new Migration(store, chatgpt, options);
  let catalog = [];
  let catalogLoaded = false;
  let accounts = { source: null, target: null };
  let loading = false;
  const snapshot = () => ({
    accounts,
    catalog,
    catalogLoaded,
    jobs: store.jobs.filter(
      (job) =>
        job.sourceAccount === accounts.source?.id &&
        job.targetAccount === accounts.target?.id,
    ),
    running: migration.running,
    loading,
    paused: migration.pauseRequested,
    current: migration.current,
    error: migration.error || null,
  });
  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    const host = `127.0.0.1:${server.address()?.port}`;
    const origin = `http://${host}`;
    const json = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (
      request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      json(403, {
        error: "Only this local ChatPort page can access the application.",
      });
      return;
    }
    try {
      const url = new URL(request.url, origin);
      if (request.method === "GET" && staticFiles[url.pathname]) {
        const [filename, type] = staticFiles[url.pathname];
        const data = await readFile(path.join(publicDirectory, filename));
        response.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        );
        response.writeHead(200, { "Content-Type": type });
        response.end(data);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        json(200, snapshot());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/report") {
        // Reports contain receipts and share URLs, never tokens or browser cookies.
        response.setHeader(
          "Content-Disposition",
          'attachment; filename="chatport-receipts.json"',
        );
        json(200, {
          version: 1,
          exportedAt: new Date().toISOString(),
          jobs: snapshot().jobs,
        });
        return;
      }
      if (request.method !== "POST" || request.headers["x-chatport"] !== "1") {
        json(404, { error: "Unknown route." });
        return;
      }
      const body = await bodyOf(request);
      if (url.pathname === "/api/pause") {
        migration.pause();
        json(200, snapshot());
        return;
      }
      if (migration.running || loading)
        throw new Error("Wait for the current operation to finish.");
      loading = true;
      try {
        switch (url.pathname) {
          case "/api/open":
            if (!["source", "target"].includes(body.role))
              throw new Error("Unknown account role.");
            await chatgpt.open(body.role);
            break;
          case "/api/accounts": {
            const previousSource = accounts.source?.id;
            // A failed check must clear stale connected identities.
            accounts = { source: null, target: null };
            const errors = [];
            for (const role of ["source", "target"]) {
              try {
                accounts[role] = await chatgpt.identity(role);
              } catch (error) {
                errors.push(error.message);
              }
            }
            if (previousSource !== accounts.source?.id) {
              catalog = [];
              catalogLoaded = false;
            }
            if (
              accounts.source &&
              accounts.target &&
              accounts.source.id === accounts.target.id
            )
              throw new Error(
                "The source and destination must be different accounts.",
              );
            if (errors.length) throw new Error(errors.join(" "));
            break;
          }
          case "/api/catalog": {
            const source = await chatgpt.identity("source");
            if (source.id !== accounts.source?.id) {
              catalog = [];
              catalogLoaded = false;
              accounts.source = source;
            }
            catalog = await chatgpt.catalog();
            catalogLoaded = true;
            break;
          }
          case "/api/preview": {
            const source = await chatgpt.identity("source");
            if (
              source.id !== accounts.source?.id ||
              !catalog.some((item) => item.id === body.id)
            )
              throw new Error(
                "Reload the source account catalog before previewing.",
              );
            const data = await chatgpt.conversation("source", body.id);
            json(200, { title: data.title, messages: messagesOf(data) });
            return;
          }
          case "/api/start":
            if (body.confirmSharing !== true)
              throw new Error(
                "Confirm that the selected conversations may be shared first.",
              );
            await migration.start(body.ids, catalog, body.options, accounts);
            break;
          case "/api/recheck": {
            const targetId = body.url
              ? conversationIdFromUrl(body.url)
              : undefined;
            if (body.url && !targetId)
              throw new Error(
                "Enter a ChatGPT conversation URL, not a shared link.",
              );
            await migration.recheck(body.id, targetId);
            break;
          }
          default:
            json(404, { error: "Unknown route." });
            return;
        }
      } finally {
        loading = false;
      }
      json(200, snapshot());
    } catch (error) {
      json(400, { error: error.message });
    }
  });
  return { server, migration, snapshot };
}

export async function startServer() {
  if (process.argv.includes("--help")) {
    console.log(
      "ChatPort\n\nUsage: npm start\nCHATPORT_PORT=4873\nCHATPORT_DATA_DIR=~/.chatport\nCHATPORT_BROWSER=chrome (or chromium after npm run browser:install)",
    );
    return;
  }
  const directory = path.resolve(
    process.env.CHATPORT_DATA_DIR || path.join(homedir(), ".chatport"),
  );
  const browser = process.env.CHATPORT_BROWSER || "chrome";
  if (!["chrome", "chromium"].includes(browser))
    throw new Error("CHATPORT_BROWSER must be chrome or chromium.");
  const port = Number(process.env.CHATPORT_PORT || 4873);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid CHATPORT_PORT.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, "run.lock");
  try {
    const handle = await open(lock, "wx", 0o600);
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        `Another run holds ${lock}. If it crashed, confirm no ChatPort process is running before removing this file.`,
      );
    throw error;
  }
  const store = new Store(directory);
  const chatgpt = new ChatGPT(directory, { browser });
  let application;
  const cleanup = async () => {
    try {
      await chatgpt.close();
    } finally {
      await unlink(lock).catch(() => {});
    }
  };
  try {
    await store.load();
    application = createApplication(store, chatgpt);
    await new Promise((resolve, reject) => {
      application.server.once("error", reject);
      application.server.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
  console.log(
    `ChatPort is ready: http://127.0.0.1:${port}\nLocal data: ${directory}\nOpen the page in your browser. Press Ctrl+C to stop.`,
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    application.migration.pause();
    try {
      await application.migration.task;
    } catch (error) {
      console.error(`ChatPort stopped: ${error.message}`);
    } finally {
      try {
        await cleanup();
      } finally {
        application.server.close();
      }
    }
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  startServer().catch((error) => {
    console.error(`ChatPort: ${error.message}`);
    process.exitCode = 1;
  });
}
