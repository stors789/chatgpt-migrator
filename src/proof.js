import { createHash } from "node:crypto";

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// The active branch, not every alternative response in the mapping.
export function messagesOf(conversation) {
  const mapping = conversation?.mapping;
  let nodeId = conversation?.current_node;
  if (!mapping || !nodeId)
    throw new Error("Conversation data is missing its active branch.");
  const visited = new Set();
  const messages = [];
  while (nodeId) {
    if (visited.has(nodeId) || !mapping[nodeId])
      throw new Error("Invalid conversation branch.");
    visited.add(nodeId);
    const node = mapping[nodeId];
    const message = node.message;
    if (
      message &&
      ["user", "assistant"].includes(message.author?.role) &&
      !message.metadata?.is_visually_hidden_from_conversation &&
      message.channel !== "analysis" &&
      (!message.recipient || message.recipient === "all")
    ) {
      const content = message.content || {};
      const parts = Array.isArray(content.parts)
        ? content.parts
        : [content.text ?? ""];
      messages.push({
        role: message.author.role,
        text: parts
          .filter((part) => typeof part === "string")
          .join("\n")
          .replace(/\r\n/g, "\n"),
        media:
          parts.some((part) => typeof part !== "string") ||
          Boolean(message.metadata?.attachments?.length),
      });
    }
    nodeId = node.parent;
  }
  return messages.reverse();
}

const textHistory = (messages) =>
  messages.map(({ role, text }) => ({ role, text }));

export function snapshotOf(conversation) {
  const messages = messagesOf(conversation);
  if (!messages.length)
    throw new Error("This conversation has no visible messages.");
  return {
    digest: digest(textHistory(messages)),
    count: messages.length,
    hasMedia: messages.some((m) => m.media),
  };
}

export function verifyCopy({
  snapshot,
  sourceId,
  targetId,
  target,
  inHistory,
  marker,
}) {
  const fail = (reason) => ({ verified: false, reason });
  if (!targetId || targetId === sourceId)
    return fail("A distinct destination conversation ID is required.");
  if ((target.conversation_id || target.id) !== targetId)
    return fail("Destination data does not match the saved conversation ID.");
  if (!inHistory)
    return fail(
      "The destination conversation is not in the target account history.",
    );
  if (target.is_read_only)
    return fail("The destination conversation is read-only.");
  const messages = messagesOf(target);
  const matches = messages
    .map((m, i) => (m.role === "user" && m.text === marker ? i : -1))
    .filter((i) => i >= 0);
  if (matches.length !== 1)
    return fail("The saved migration marker is missing or duplicated.");
  const prefix = messages.slice(0, matches[0]);
  if (
    prefix.length !== snapshot.count ||
    digest(textHistory(prefix)) !== snapshot.digest
  ) {
    return fail(
      "The original text messages are incomplete, changed, or in a different order.",
    );
  }
  return {
    verified: true,
    count: prefix.length,
    digest: snapshot.digest,
    checkedAt: new Date().toISOString(),
    hasMedia: snapshot.hasMedia,
  };
}

export function conversationIdFromUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== "https://chatgpt.com") return null;
  return url.pathname.match(/(?:^|\/)c\/([a-zA-Z0-9-]+)\/?$/)?.[1] || null;
}
