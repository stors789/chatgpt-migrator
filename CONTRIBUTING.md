# Contributing

Keep the tool local, the verification strict, and the workflow easy to inspect.

1. Install development dependencies with `npm ci` and build the extension with `npm run build`.
2. Run `npm run check` and `npm test`.
3. Install the test browser with `npm run browser:install`, then run `npm run test:e2e`.
4. Include a regression test for a changed verification rule or receiving behavior.

Do not weaken verification to accept a visible composer, an unconfirmed chat URL or a shared-view message. Do not automatically resend uncertain attempts. Do not introduce stealth/captcha bypasses or collect credentials.

Use synthetic data in tests, screenshots and issues. Never commit browser profiles, account tokens, receipts from real migrations or real transcripts.

ChatGPT's private web APIs may change. When changing integration code, describe the observed behavior and distinguish synthetic tests from a real-account smoke test. UI translations live in `public/i18n.js`. The workspace owns the runner while its tab is open; Web Locks prevent competing workspace instances. Receipts persist in chrome.storage.local and account bindings in chrome.storage.session. Keep Node.js imports out of runtime code.
