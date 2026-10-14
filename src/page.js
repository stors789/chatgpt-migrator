// These functions run only in the bound ChatGPT tab's isolated script world.
// Authentication tokens stay inside that tab; only identity or response data returns.
export const COMPOSER_SELECTOR =
  '#prompt-textarea, form [contenteditable="true"][role="textbox"]';

export async function browserRequest({
  identity,
  endpoint,
  method = "GET",
  body,
}) {
  try {
    const sessionResponse = await fetch("/api/auth/session", {
      credentials: "include",
      signal: AbortSignal.timeout(30000),
    });
    if (!sessionResponse.ok)
      return { status: sessionResponse.status, user: null };
    const session = await sessionResponse.json();
    if (!session.user?.id || !session.accessToken)
      return { status: 401, user: null };
    if (identity)
      return {
        user: {
          id: session.user.id,
          email: session.user.email || session.user.name || session.user.id,
        },
      };
    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      signal: AbortSignal.timeout(30000),
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
      return { status: response.status, data: await response.json() };
    } catch {
      return { status: response.status, malformed: true };
    }
  } catch (error) {
    return { error: error.message };
  }
}

export async function prepareComposer(selector) {
  const deadline = Date.now() + 30000;
  let continued = false;
  for (;;) {
    const editors = [...document.querySelectorAll(selector)].filter(
      (editor) => editor.isContentEditable && editor.getClientRects().length,
    );
    if (editors.length > 1)
      return {
        error:
          "ChatGPT has multiple editable message boxes. Inspect the destination tab before sending.",
      };
    if (editors.length === 1) return { url: location.href };
    const button = [...document.querySelectorAll("button")].find((button) =>
      /^(continue this conversation|continue conversation|continue chat|继续此对话|继续对话)$/i.test(
        button.innerText.trim(),
      ),
    );
    if (button && !button.disabled && !continued) {
      button.click();
      continued = true;
    }
    if (Date.now() > deadline)
      return {
        error:
          "The shared chat has no editable composer. Inspect the destination tab.",
      };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function sendMarker(marker, selector, expectedUrl) {
  if (expectedUrl && location.href !== expectedUrl)
    return {
      error: "The destination page changed. No message was sent.",
      sent: false,
    };
  const editors = [...document.querySelectorAll(selector)].filter(
    (editor) => editor.isContentEditable && editor.getClientRects().length,
  );
  if (editors.length !== 1)
    return {
      error: "ChatGPT's message editor changed. No message was sent.",
      sent: false,
    };
  const composer = editors[0];
  // ProseMirror stores logical lines as paragraphs. innerText adds visual
  // paragraph spacing, which is not part of the message submitted by the editor.
  const nodeText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeName === "BR")
      return node.classList.contains("ProseMirror-trailingBreak") ||
        (node.parentElement.matches("p, div") &&
          node.parentElement.childNodes.length === 1)
        ? ""
        : "\n";
    const children = [...node.childNodes];
    const isBlock = (child) => ["P", "DIV"].includes(child?.nodeName);
    return children
      .map(
        (child, index) =>
          (index && (isBlock(child) || isBlock(children[index - 1]))
            ? "\n"
            : "") + nodeText(child),
      )
      .join("");
  };
  const readText = () => nodeText(composer).replace(/\r\n/g, "\n").trimEnd();
  const text = readText();
  if (text.trim() && text !== marker.trimEnd())
    return {
      error:
        "The destination editor already contains text. Inspect it before continuing.",
      sent: false,
    };
  composer.focus();
  if (
    (!text.trim() && !document.execCommand("insertText", false, marker)) ||
    readText() !== marker.trimEnd()
  )
    return {
      error:
        "The receipt message could not be entered exactly. No message was sent.",
      sent: false,
    };
  const deadline = Date.now() + 10000;
  for (;;) {
    const currentEditors = [...document.querySelectorAll(selector)].filter(
      (editor) => editor.isContentEditable && editor.getClientRects().length,
    );
    if (
      (expectedUrl && location.href !== expectedUrl) ||
      currentEditors.length !== 1 ||
      currentEditors[0] !== composer ||
      readText() !== marker.trimEnd()
    )
      return {
        error:
          "The receiving page or receipt draft changed. No message was sent.",
        sent: false,
      };
    const form = composer.closest("form");
    const legacySend =
      '[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]';
    const send = (form || document).querySelector(
      form ? `button[type="submit"], ${legacySend}` : legacySend,
    );
    if (send && !send.disabled && send.getClientRects().length) {
      send.click();
      return { sent: true };
    }
    if (Date.now() > deadline)
      return {
        error:
          "ChatGPT's send button is unavailable. Inspect the destination tab before resending.",
        sent: false,
      };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
