# Contributing to DarkCity

DarkCity is a live production economy running on Solana mainnet with real user funds. PRs, issues, and forks are welcome — but the bar for "won't break the city" is high.

## Before you start

1. Read the [README](./README.md) end-to-end.
2. Skim [`docs/`](./docs) — deploy checklists, runbook, and scope history are there.
3. Understand the self-healing patterns: atomic claims, memo-scoped idempotency, pulse window lock, auto-reconciler. The code assumes all new money flows use the same patterns.

## What to open an issue for

- **Bugs** — anything that strands a payment, double-charges, or produces inconsistent on-chain vs DB state
- **Stuck mints / tipping / sponsor flows** — include the `quote_id` and your wallet pubkey; the auto-reconciler should heal most of these within 15 min
- **Feature proposals** — open an issue first with context + reasoning; "experiment" tag for cognitive probes or pulse math changes
- **Doc fixes** — PRs welcome without prior issue

## What to send a PR for

Small, focused PRs land fast. Big structural changes should have an issue first.

- Touch ≤5 files per PR when possible
- Preserve existing idempotency patterns — every money flow is atomic-claim + memo-scoped idempotent; any new flow should follow the same shape
- If you change a money flow, include a test showing that retry-after-partial-failure doesn't double-charge or double-forward
- `node --check hooks/*.js` must pass
- Commit messages: short imperative subject, body explains the *why* when non-obvious

## Code shape

- **One entry point:** `server.js`
- **Hooks** in `hooks/` — each hook registers its own routes via `register(app, pool)`
- **Shared libs** in `lib/` — Solana wrappers, encryption helpers
- **Migrations** in `migrations/` — run idempotently at startup
- **Scripts** in `scripts/` — one-off ops (pulse, dormancy, bonuses)
- **Ops docs** in `docs/` — runbooks, deploy checklists, scope history

## Testing live flows

There's no test framework yet. For now, verification happens against a staging Railway deployment with a separate treasury. If you're touching money flows, request access in your PR — we'll spin you up a staging instance.

## Experiments on the live city

Want to run a cognitive probe, test a new agent action type, or propose a pulse math change?

1. Open an issue tagged `experiment`
2. Describe the hypothesis + what signal you're measuring
3. We'll discuss + possibly ship the change behind a feature flag
4. Post-experiment, publish the results

This repo is the live proving ground for [Fathom Lab](https://github.com/fathom-lab)'s cognitive atlas research. Experiments that generate useful data for the public research are prioritized.

## Code of conduct

Don't be a dick. That's it.
