export function conversation(
  id = "source-chat",
  entries = ["A question", "An answer"],
) {
  const mapping = { root: { id: "root", parent: null, message: null } };
  let parent = "root";
  for (const [index, entry] of entries.entries()) {
    const key = `message-${index}`;
    const value =
      typeof entry === "string"
        ? { text: entry, role: index % 2 ? "assistant" : "user" }
        : entry;
    mapping[key] = {
      id: key,
      parent,
      message: {
        author: { role: value.role },
        content: { content_type: "text", parts: [value.text] },
      },
    };
    parent = key;
  }
  return {
    conversation_id: id,
    title: "Synthetic conversation",
    current_node: parent,
    mapping,
  };
}

export function append(data, text, role = "user") {
  const key = `append-${Object.keys(data.mapping).length}`;
  data.mapping[key] = {
    id: key,
    parent: data.current_node,
    message: {
      author: { role },
      content: { content_type: "text", parts: [text] },
    },
  };
  data.current_node = key;
  return data;
}

export class FakeChatGPT {
  source = { id: "source-account", email: "source@example.test" };
  target = { id: "target-account", email: "destination@example.test" };
  claims = 0;
  copies = new Map();
  constructor() {
    this.sourceConversation = conversation();
  }
  async identity(role) {
    return { ...this[role] };
  }
  async conversation(role, id) {
    return role === "source" ? this.sourceConversation : this.copies.get(id);
  }
  async share() {
    return "https://chatgpt.com/share/synthetic-share";
  }
  async claim(job, saveTarget) {
    this.claims++;
    const data = append(structuredClone(this.sourceConversation), job.marker);
    data.conversation_id = `copy-${this.claims}`;
    this.copies.set(data.conversation_id, data);
    await saveTarget(data.conversation_id);
  }
  async verify(job) {
    const { verifyCopy } = await import("../src/proof.js");
    return verifyCopy({
      snapshot: job.snapshot,
      sourceId: job.sourceId,
      targetId: job.targetId,
      target: this.copies.get(job.targetId),
      inHistory: this.copies.has(job.targetId),
      marker: job.marker,
    });
  }
  async recover() {
    return this.copies.keys().next().value;
  }
}
