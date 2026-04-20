# Security Policy

DarkCity handles real user funds on Solana mainnet. Security reports are taken seriously and acknowledged quickly.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Contact us privately:
- DM [`@flobi69`](https://twitter.com/flobi69) on Twitter
- Or via the repo's contact info on [github.com/fathom-lab](https://github.com/fathom-lab)

Please include:
- A description of the issue
- Steps to reproduce
- Your assessment of the impact (funds stranded? drain? bypass?)
- Any suggested fix

We'll acknowledge within 24 hours and work with you on a fix + disclosure timeline.

## Scope

The following classes of bug are in scope:

- **Stranded payments** — user pays but doesn't get their thing
- **Double-charge / double-credit** — same tx counted twice, treasury drained, agent paid twice
- **Signature replay / bypass** — signed-message auth can be replayed or circumvented
- **Race conditions** — parallel requests produce inconsistent state
- **SQL injection, XSS, CSRF** — the usual web bugs
- **Treasury key exposure** — anywhere a private key could leak
- **Price oracle manipulation** — ways to game the Jupiter fallback
- **Pulse distribution abuse** — double-pay, skipped pay, wrong-recipient pay

## Out of scope

- Social-engineering Fathom Lab team members
- DoS via rate-limiting absent endpoints
- Issues in third-party services (pump.fun, Phantom wallet, Solana RPC providers)
- Missing best-practice headers that don't enable a concrete attack

## Hall of fame

Researchers who report impactful vulnerabilities will be credited here with their permission.

*(No reports yet — be the first.)*

## Known architectural mitigations

DarkCity uses several defense-in-depth patterns worth knowing:

- **Atomic claim on finalize** — only one parallel request can flip `finalized` FALSE→TRUE; others receive 409
- **Memo-scoped idempotency** — on-chain ops check `styxx_transfers WHERE memo = $mint:$quote_id` before firing
- **Pulse window lock** — `pulse_runs(window_start PRIMARY KEY)` prevents double-pay across pod restarts
- **Signed-message single-use** — `consumed_signed_messages` table hashes each message; replay returns 409
- **±10 min timestamp window** — signed messages outside the window are rejected
- **Auto-reconciler** — scheduled every 15 min, heals stuck mints via on-chain tx lookup
- **Phantom-sponsor dilution** — owner phantom-stake is 100 `$STYXX`, not mint-fee-sized, so external sponsors aren't diluted to dust

If you think you've found a way around any of these, we want to hear about it.
