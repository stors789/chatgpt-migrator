# Changelog

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
