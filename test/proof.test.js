import { test } from "node:test";
import assert from "node:assert/strict";
import {
  messagesOf,
  snapshotOf,
  verifyCopy,
  conversationIdFromUrl,
} from "../src/proof.js";
import { conversation, append } from "./fixtures.js";

const marker = "Receipt\n[ChatPort:synthetic-123]";
async function proof(overrides = {}) {
  const source = conversation();
  const target = append(conversation("target-chat"), marker);
  append(target, "OK", "assistant");
  return verifyCopy({
    snapshot: await snapshotOf(source),
    sourceId: "source-chat",
    targetId: "target-chat",
    target,
    inHistory: true,
    marker,
    ...overrides,
  });
}
test("a distinct persisted copy with the complete prefix and marker verifies", async () =>
  assert.equal((await proof()).verified, true));
test("a composer or new URL alone never proves success", async () =>
  assert.equal((await proof({ inHistory: false })).verified, false));
test("the original conversation cannot be accepted as a new copy", async () =>
  assert.equal((await proof({ targetId: "source-chat" })).verified, false));
test("a wrong conversation ID is rejected", async () =>
  assert.equal((await proof({ targetId: "different-chat" })).verified, false));
test("a read-only shared view is rejected", async () => {
  const target = append(conversation("target-chat"), marker);
  target.is_read_only = true;
  assert.equal((await proof({ target })).verified, false);
});
test("missing receipt marker is rejected", async () =>
  assert.equal(
    (await proof({ target: conversation("target-chat") })).verified,
    false,
  ));
test("duplicate receipt markers are rejected", async () => {
  const target = append(append(conversation("target-chat"), marker), marker);
  assert.equal((await proof({ target })).verified, false);
});
test("missing original messages are rejected", async () =>
  assert.equal(
    (
      await proof({
        target: append(conversation("target-chat", ["A question"]), marker),
      })
    ).verified,
    false,
  ));
test("changed original text is rejected", async () =>
  assert.equal(
    (
      await proof({
        target: append(
          conversation("target-chat", ["A question", "A different answer"]),
          marker,
        ),
      })
    ).verified,
    false,
  ));
test("reordered original messages are rejected", async () =>
  assert.equal(
    (
      await proof({
        target: append(
          conversation("target-chat", ["An answer", "A question"]),
          marker,
        ),
      })
    ).verified,
    false,
  ));
test("an identical receipt-looking assistant answer does not count as the user marker", async () =>
  assert.equal(
    (
      await proof({
        target: append(conversation("target-chat"), marker, "assistant"),
      })
    ).verified,
    false,
  ));
test("only the active branch is verified, not discarded alternative answers", async () => {
  const source = conversation();
  source.mapping.alternative = {
    parent: "message-0",
    message: {
      author: { role: "assistant" },
      content: { parts: ["Unused answer"] },
    },
  };
  const snapshot = await snapshotOf(source);
  assert.equal(snapshot.count, 2);
  assert.equal(snapshot.digest, (await snapshotOf(conversation())).digest);
});
test("hidden messages and analysis are excluded from visible history", async () => {
  const source = conversation();
  append(source, "Hidden answer", "assistant");
  source.mapping[source.current_node].message.metadata = {
    is_visually_hidden_from_conversation: true,
  };
  append(source, "Analysis", "assistant");
  source.mapping[source.current_node].message.channel = "analysis";
  assert.equal((await snapshotOf(source)).count, 2);
});
test("cycles, missing mappings and empty histories fail closed", async () => {
  const source = conversation();
  source.mapping.root.parent = source.current_node;
  assert.throws(() => messagesOf(source));
  assert.throws(() => messagesOf({}));
  await assert.rejects(snapshotOf(conversation("empty", [])));
});
test("media-bearing messages produce an explicit review flag", async () => {
  const source = conversation();
  source.mapping["message-0"].message.content.parts.push({
    asset_pointer: "synthetic-image",
  });
  assert.equal((await snapshotOf(source)).hasMedia, true);
});
test("receipt links accept only a real chat URL on chatgpt.com", () => {
  assert.equal(
    conversationIdFromUrl("https://chatgpt.com/c/new-chat"),
    "new-chat",
  );
  assert.equal(
    conversationIdFromUrl("https://chatgpt.com/g/g-p-project/c/new-chat"),
    "new-chat",
  );
  for (const value of [
    "https://chatgpt.com/share/id",
    "https://evil.example/c/id",
    "javascript:alert(1)",
    "http://chatgpt.com/c/id",
  ])
    assert.equal(conversationIdFromUrl(value), null);
});
