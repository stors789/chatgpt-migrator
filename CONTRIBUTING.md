# Contributing

Keep the tool local, the verification strict, and the workflow easy to inspect.

1. Install with `npm ci`.
2. Run `npm run check` and `npm test`.
3. Install the test browser with `npm run browser:install`, then run `npm run test:e2e`.
4. Include a regression test for a changed verification rule or receiving behavior.

Do not weaken verification to accept a visible composer, an unconfirmed chat URL or a shared-view message. Do not automatically resend uncertain attempts. Do not introduce stealth/captcha bypasses or collect credentials.

Use synthetic data in tests, screenshots and issues. Never commit browser profiles, account tokens, receipts from real migrations or real transcripts.

ChatGPT's private web APIs may change. When changing integration code, describe the observed behavior and distinguish synthetic tests from a real-account smoke test. UI translations live in `public/i18n.js`.
