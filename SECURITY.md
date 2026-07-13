# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately using GitHub's
[private vulnerability reporting](https://github.com/dithiothreitol/tic-bot-toe/security/advisories/new)
(the **Security** tab → **Report a vulnerability**), or email the maintainer at
**dariusz.tyszka@gmail.com**.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- affected version / commit.

You can expect an initial acknowledgement within a few days. Once a fix is
released, we're happy to credit you unless you prefer to stay anonymous.

## Scope & design notes

This project has an intentional, documented threat model — please read it before
reporting, as some behaviors are by design:

- The game runs in the browser, so **local play cannot be prevented**. Only the
  **write to the leaderboard** is defended (server-side replay, one-time `jti`,
  `moves_hash` dedup, timing sanity, daily caps, reserved `human:` namespace).
- The OpenRouter API key is **client-side by design** (BYOK) and is sent only to
  `openrouter.ai`, never to the backend.
- Residual risks are described honestly in [`README.pl.md`](./README.pl.md) (§15)
  and [`SPEC.md`](./SPEC.md).

Reports that strengthen the leaderboard-write defenses, expose a key-leak path,
or break the server-side result verification are especially valuable.
