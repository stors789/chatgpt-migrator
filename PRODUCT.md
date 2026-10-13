# ChatPort

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the user: a local Node.js application, plain HTML/CSS/JavaScript and Playwright. No hosted backend or OpenAI API key.

## Users

People moving selected ChatGPT conversations between their own personal accounts.

## Product Purpose

Make selecting conversations easy and report success only when a new conversation is saved in the destination account and its visible text history has been checked.

## Operating Context

Runs on the user's computer. Two isolated, dedicated browser profiles hold the two account sessions. Users log in directly in the browser windows. The public repository must not contain account data, browser profiles or real conversation screenshots.

## Capabilities and Constraints

Search, date and project filters, conversation previews, selection across filters, sequential migration, persisted progress, pause, resume, and explicit verification of uncertain results. Personal accounts only. Shared links are publicly viewable by their holders. ChatGPT's web APIs are unofficial and may change. Project files, account settings and complete branch trees are outside this release. Automated tests use synthetic accounts and conversations; live account compatibility must be reported separately.

## Evidence on Hand

The user verified the shared-link continuation flow. OpenAI's shared-conversation documentation describes independent recipient copies. A public reference implementation exists without a license; no source code from it will be copied.

## Product Principles

- Selection belongs to the user.
- A visible input box is not proof of migration.
- Uncertain outcomes never trigger automatic resending.
- Accounts and conversations stay on the user's computer and ChatGPT.
- Errors explain the next action.
