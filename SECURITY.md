# Security

Do not post credentials, browser profiles, private conversations or unredacted migration receipts in public issues.

To report a vulnerability, use GitHub's private vulnerability reporting feature when enabled. Describe the affected version and a minimal reproduction using synthetic data.

ChatPort is a Manifest V3 Chrome extension with scripting and local storage permissions limited to https://chatgpt.com. There is no local HTTP server or externally callable messaging endpoint. It binds the source to a regular tab and the destination to an incognito tab and rechecks both account identities. Authentication tokens remain inside the bound ChatGPT tabs. Receipts use local, trusted-context storage; downloaded receipts can include sensitive chat titles and public share links.

Shared ChatGPT links are viewable by their holders. This is intrinsic to the migration mechanism; review selections and revoke unnecessary links through ChatGPT after verifying destination copies.
