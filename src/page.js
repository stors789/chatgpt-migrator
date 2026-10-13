// These functions run only in the bound ChatGPT tab's isolated script world.
// Authentication tokens stay inside that tab; only identity or response data returns.
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

export async function prepareComposer() {
  const deadline = Date.now() + 30000;
  let continued = false;
  for (;;) {
    const composer = document.querySelector("#prompt-textarea");
    if (composer && composer.getClientRects().length)
      return { url: location.href };
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

export async function sendMarker(marker) {
  const composer = document.querySelector("#prompt-textarea");
  if (!composer || !composer.isContentEditable)
    return { error: "ChatGPT's message editor changed. No message was sent." };
  if (composer.innerText.trim())
    return {
      error:
        "The destination editor already contains text. Inspect it before continuing.",
    };
  composer.focus();
  if (
    !document.execCommand("insertText", false, marker) ||
    composer.innerText.replace(/\r\n/g, "\n").trimEnd() !== marker.trimEnd()
  )
    return {
      error:
        "The receipt message could not be entered exactly. No message was sent.",
    };
  const deadline = Date.now() + 10000;
  for (;;) {
    const send = document.querySelector(
      '[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]',
    );
    if (send && !send.disabled && send.getClientRects().length) {
      send.click();
      return { sent: true };
    }
    if (Date.now() > deadline)
      return {
        error:
          "ChatGPT's send button is unavailable. Inspect the destination tab before resending.",
      };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
