# ChatPort

**Select, migrate, and verify your ChatGPT conversations.**

[简体中文](README.zh-CN.md) · [Getting started](#getting-started) · [How verification works](#how-verification-works)

ChatPort moves selected conversations between your own **personal ChatGPT accounts**, using shared links and browser continuation. Pick the chats you want, preview them, and get a receipt when their original text has been checked in the destination account.

![ChatPort migration workspace with synthetic demonstration data](docs/screenshots/desktop.png)

_The screenshot uses synthetic accounts and conversations. This is an unofficial tool, not an OpenAI product._

## Why ChatPort?

- **Pick precisely:** title search, dates, project and status filters, individual checkboxes and select-all for the current filter. Selections survive filtering and page reloads.
- **Preview before moving:** read the active conversation branch before selecting it.
- **Sign in normally:** separate browser profiles for the two accounts. No API key, pasted cookies or copied bearer tokens.
- **Check the result:** a new chat ID and a visible composer are not enough. The saved destination history and the original message sequence must match.
- **Resume carefully:** verified copies are skipped. Uncertain attempts are checked without automatically resending.
- **Stay local:** the interface, profiles and progress live on your computer. ChatPort has no hosted backend, analytics or third-party conversation storage.
- **English and 简体中文:** switch languages in the interface.

## Getting started

Requires **Node.js 22+** and **Google Chrome**, on Windows, macOS or Linux with a desktop session.

```sh
git clone https://github.com/stors789/chatgpt-migrator.git
cd chatgpt-migrator
npm ci
npm start
```

Open **http://127.0.0.1:4873**.

1. Open the source and destination browser windows. Sign in to a different personal ChatGPT account in each. Choose the **Personal** workspace in both windows.
2. Click **Check accounts**, then **Load conversations**. The catalog includes regular, archived and accessible project chats.
3. Search, filter, preview and select your conversations. Project chats arrive as ordinary destination chats; project organization is not recreated.
4. Review the message and delay. Confirm that selected conversations may be shared, then start the migration.
5. Inspect the status or open a receipt. For an uncertain result, **Check again without resending**. If you found the copy manually, paste its `https://chatgpt.com/c/...` URL into the receipt and check it.
6. Download the receipts. After checking the destination copies, you can revoke the source share links in ChatGPT **Settings → Data controls → Shared links**. ChatPort does not delete source chats or automatically revoke links.

Keep the terminal open while using ChatPort. Press **Ctrl+C** to pause after the current operation and close the tool's browser windows. Reopen it with `npm start`; use the same accounts to see their saved receipts.

### Use bundled Chromium instead

The browser choice is explicit; there is no silent browser substitution.

```sh
npm run browser:install
CHATPORT_BROWSER=chromium npm start
```

PowerShell:

```powershell
$env:CHATPORT_BROWSER = "chromium"
npm start
```

### Local configuration

| Variable            | Default       | Purpose                           |
| ------------------- | ------------- | --------------------------------- |
| `CHATPORT_PORT`     | `4873`        | Local interface port              |
| `CHATPORT_DATA_DIR` | `~/.chatport` | Profiles and atomic JSON receipts |
| `CHATPORT_BROWSER`  | `chrome`      | `chrome` or installed `chromium`  |

Browser profiles contain authenticated sessions. Keep the data directory private. Progress records contain chat titles, share URLs and receipt markers, but no original message transcript or copied authentication tokens. The server binds only to `127.0.0.1` and rejects foreign origins and unexpected Host headers.

Only one process can use a data directory at a time. After a forced crash, a stale `run.lock` may remain. Stop and confirm that no ChatPort process is running before removing that file. Do not remove it while another run is active.

## How verification works

Before sharing, ChatPort fingerprints the **visible user and assistant text on the active branch**. It then continues the shared chat and adds the chosen message with a unique `[ChatPort:…]` receipt marker.

A conversation is marked **Verified** only when:

1. A destination conversation ID exists and differs from the source ID.
2. That ID appears in the destination account's saved, unarchived history.
3. Reading it back returns the same ID and an editable conversation.
4. Exactly one user message contains the complete receipt message.
5. Every original visible text message before that marker has the same role, order, content and count as the source snapshot.

A missing marker, incomplete history, wrong account, read-only share, rate limit or uncertain browser outcome prevents success. A few bounded checks allow for persistence delay. They do **not** resend messages. The source and destination account identities are checked again during the run.

The receipt attests to the active **text** history. It does not guarantee that images, uploads, generated files, tool results or historical alternative branches remain accessible. Media-bearing messages are flagged for manual review.

### Status meanings

| Status                                | Meaning                              | Next step                                  |
| ------------------------------------- | ------------------------------------ | ------------------------------------------ |
| Queued                                | Selected, no receiving attempt yet   | Start or resume                            |
| Creating share / Receiving / Checking | Current operation                    | Wait, or request a pause                   |
| Verified                              | Saved copy and original text checked | Open the destination copy                  |
| Stopped                               | Failed before receiving started      | Resolve the error, then resume             |
| Needs checking                        | Receiving may have created a copy    | Recheck the receipt; do not blindly resend |

If no receipt marker can be found, leave the result uncertain and inspect the destination browser. A copy created before the marker was sent will not pass automatically; its missing marker must be resolved before it can be certified. This avoids turning a browser glitch into duplicate chats.

## Limits and troubleshooting

- **Unofficial web integration.** ChatGPT's session, catalog and share APIs may change. This is not a documented account import API.
- **Personal accounts only.** Business, Enterprise and Edu cross-workspace transfer is outside scope. Account settings, memories, subscriptions, custom GPTs and project files are not moved.
- **Shared content is accessible to link holders.** Review the selected conversations before creating links. Link revocation does not delete copies already saved by a recipient. See [OpenAI's sharing documentation](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt).
- **Login or captcha:** handle it yourself in the visible browser window. ChatPort does not solve challenges or use stealth plugins. If the fresh profile cannot sign in, stop; do not disable browser protections.
- **Rate limiting:** pause and wait, then raise the per-conversation delay. Do not run parallel migrations.
- **Catalog errors:** no partial catalog is silently presented as complete. A changed response format stops loading with an error.
- **Changed history:** inspect both chats. A copy with altered or missing text remains uncertain even if it has a new URL.

OpenAI's [export-and-upload workaround](https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts) provides a reference file in a new chat; ChatPort uses shared-conversation continuation to create individual copies instead.

## Development

```sh
npm ci
npm run check
npm test
npm run browser:install
npm run test:e2e
```

Unit tests cover active-branch fingerprints, exact prefix matching, false positives, account changes, interruption, recovery and concurrency. Browser tests exercise the real UI, share/continue automation, API verification, failed verification, receipt recovery, responsive layout and the local HTTP boundary using **synthetic network fixtures**. They do not log into real ChatGPT accounts. Live account compatibility requires a separate manual smoke test; passing fixtures is not a guarantee against future ChatGPT changes.

To report a problem, include the step and error message. Do not upload browser profiles, cookies, tokens, real transcripts or an unredacted receipts file.

## Acknowledgements and license

The workflow was inspired by [jasong-03/chatgpt-conversation-migrate](https://github.com/jasong-03/chatgpt-conversation-migrate). That repository has no declared license; **no source code from it was copied**. ChatPort is an independent implementation using [Playwright](https://playwright.dev/) and Node.js platform libraries.

ChatPort is [MIT licensed](LICENSE). The bundled DM Sans font is licensed under the [SIL Open Font License](public/fonts/OFL.txt). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
