# Changelog

## 0.2.3 — 2026-10-14

Fix receiving that waited for the whole Chrome tab to finish loading even when the shared conversation's editor was usable. Inject the editor check immediately after navigation commits and let editor readiness control receiving. Conversation catalog loading is unchanged.

- Persist the receiving tab and whether a send may have happened. A confirmed pre-send failure can be retried; an uncertain send still requires checking.
- Recognize the released loading/composer errors as pre-send failures on upgrade. Retry from the receipt or include them in a new selected batch without replacing the original marker.
- Look for an existing saved marker before retrying, reuse an open receiving tab, and allow a supplied private-copy URL after checking its complete original text.
- Show selected counts for runnable, uncertain and verified records, plus a visible batch-stop notice and receipt recovery guidance.
- Preserve different editor drafts; continue a draft only when it exactly matches this receipt's original marker.
- Stop before sending if a shared link redirects to another page, or if the receiving page/editor/draft changes while waiting for Send.

Validation: 52 unit tests and 12 actual-extension synthetic browser workflows, including a permanently loading image, recovery of old failures, the original tab/marker, continuing an existing private copy, shared-link redirects and preserving drafts before and during the send wait. Real two-account compatibility still depends on the user's ChatGPT session.

## 0.2.2 — 2026-10-13

Fix receiving on the current ChatGPT interface, whose editable message box has no `prompt-textarea` ID and whose send control is a form submit button. Inspect only visible editable boxes and submit inside the chosen editor's form. Keep the existing editor support, verification rules and uncertain-attempt records. Conversation catalog loading is unchanged.

Validation: read the live ChatGPT editor attributes and briefly filled/cleared a synthetic draft without sending. 39 unit tests and 7 actual-extension synthetic browser workflows pass, including a no-ID editor, localized submit button and unrelated form. A real two-account receiving test still requires the user's account interaction.

## 0.2.1 — 2026-10-13

Keep unchanged conversation rows and project options in place during progress polling. This preserves checkbox interaction and open project choices; the previous unconditional replacement interrupted selection on the Linux CI browser while its window was inactive.

Validation: 39 unit tests and 6 actual-extension synthetic Chromium workflows, including a regression that holds row and option nodes across polling cycles.

## 0.2.0 — 2026-10-13

Chrome extension release, prompted by Google's rejection of sign-in in automation-controlled browsers.

- Use ordinary Chrome sessions: regular source window and incognito destination window, with manual authentication.
- Remove the runtime Node server and Playwright browser launcher. Release users load the unpacked extension directly.
- Keep conversation selection, previews, strict SHA-256 text verification, persisted receipts, pause and uncertain-result recovery.
- Save progress in trusted-context chrome.storage.local; use session storage for bound tab IDs and Web Locks for a single workspace runner.
- Provide localized incognito-permission and sign-in recovery actions.
- Open destination receipts in the checked destination incognito session.
- Package only extension source and public assets; publish a stable extension identity and authored toolbar icons.

Validation: 39 unit tests and 5 actual-extension Chromium workflows using synthetic HTTPS fixtures. Normal/incognito session isolation, exact receipts, false positives, no resend on recheck, receipt navigation, permission refusal, expired authentication and competing workspace prevention are covered. Real Google authentication and real two-account migration remain untested.

The previous v0.1.0 code remains available under its Git tag. v0.2 does not import the old local profile directory or JSON file.

## 0.1.0 — 2026-10-13

Initial public release.

- Local web interface in English and Simplified Chinese.
- Separate browser profiles and direct sign-in for source and destination accounts.
- Search, date, named project and status filters; selection across filters and page reloads.
- Adjacent conversation preview and migration receipt panels.
- Sequential shared-link migration with an adjustable delay and pause after the current copy.
- Strict checks of destination history membership, a distinct chat ID, the complete original visible text sequence and the saved receipt message.
- Atomic progress records, restart recovery and rechecking uncertain copies without automatic resending.
- Synthetic-data screenshots, MIT license, third-party notices and automated GitHub tests.

Validation: 33 unit tests and 3 browser workflows pass locally. Browser tests use synthetic ChatGPT network fixtures; real-account compatibility has not yet been smoke-tested. Images, attachments, project settings and non-active historical branches are outside automatic text verification.
