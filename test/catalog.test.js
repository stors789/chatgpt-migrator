import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatGPT } from "../src/chatgpt.js";

test("catalog pagination includes the page beyond 100, archived chats and named project chats", async () => {
  const api = new ChatGPT("/unused-test-directory");
  const regular = Array.from({ length: 101 }, (_, i) => ({
    id: `chat-${i}`,
    title: `Chat ${i}`,
    update_time: i + 1,
  }));
  api.request = async (_, endpoint) => {
    const url = new URL(endpoint, "https://chatgpt.com");
    if (url.pathname === "/backend-api/conversations") {
      const data =
        url.searchParams.get("is_archived") === "true"
          ? [{ id: "archived-chat", title: "Archived", update_time: 102 }]
          : regular;
      const offset = Number(url.searchParams.get("offset"));
      return { items: data.slice(offset, offset + 100), total: data.length };
    }
    if (url.pathname.endsWith("/sidebar"))
      return {
        items: [
          { gizmo: { id: "g-p-test", display: { name: "Named project" } } },
        ],
      };
    if (url.pathname.includes("/g-p-test/"))
      return {
        items: [
          { id: "project-chat", title: "Inside project", update_time: 103 },
        ],
      };
    throw new Error("Unexpected endpoint");
  };
  const catalog = await api.catalog();
  assert.equal(catalog.length, 103);
  assert.ok(catalog.some((item) => item.id === "chat-100"));
  assert.equal(
    catalog.find((item) => item.id === "archived-chat").archived,
    true,
  );
  assert.equal(
    catalog.find((item) => item.id === "project-chat").projectName,
    "Named project",
  );
});
test("repeated catalog pages are rejected even when the repeated page would satisfy total", async () => {
  const api = new ChatGPT("/unused-test-directory");
  api.request = async () => ({ items: [{ id: "repeated" }], total: 2 });
  await assert.rejects(api.list("source"), /repeated catalog entries/);
});
test("repeated project cursors fail instead of silently truncating", async () => {
  const api = new ChatGPT("/unused-test-directory");
  api.request = async (_, endpoint) =>
    endpoint.includes("/conversations?")
      ? { items: [], total: 0 }
      : { items: [], cursor: "repeated-cursor" };
  await assert.rejects(api.catalog(), /repeated a project cursor/);
});
