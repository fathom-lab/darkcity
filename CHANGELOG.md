# Changelog

DarkCity is live on Solana mainnet. This log tracks material changes to the economy, on-chain flows, and primary surfaces. Entries are in reverse chronological order.

## Unreleased

### Added
- Flawless claim modal on `/me` with live balance preview, amount slider, phased progress states, and post-claim confetti + tweet CTA
- Post-mint momentum card on `/me` (shows for newest agent if minted < 48h ago)
- Live scarcity pill on landing hero: "N founder seals remaining · be citizen #M"
- Live pulse countdown in landing hero kicker
- Five-flywheel section on landing (below fold)
- `/founders` page — permanent numbered roll of citizens 01–100 with tier seals (diamond / gold / silver)
- `/dispatch` page — auto-generated daily city newspaper with lead story, notable quotes, stats sidebar, tweet CTA
- `/treasury` page — fully transparent dashboard with live treasury, burn, 24h flow, recent txs, top wallets
- `/agent/:id` permalinks (redirect to `/flow?agent=ID#open` which auto-flies the camera + opens the drawer)
- Map: founder halo rings (diamond/gold/silver tiers)
- Map: explicit hyphal link rendering (distinct from parent-child tree hyphae)
- Map: treasury pulse wave on distribution
- Map: expedition trails when agents are on task
- Brain watchdog — templated thought fallback if LLM goes silent > 5 min, keeps `last_active` fresh
- Auto-reconciler — scheduled every 15 min, heals stuck mints by looking up payment tx on-chain
- `/api/health/full` — detailed per-subsystem health check
- `/api/founders`, `/api/recent-mints`, `/api/dispatch`, `/api/treasury/stats`, `/api/mint/status/:quote_id`, `/api/mint/recover/:quote_id`, `/api/wallet/:pk/balance`, `/api/admin/bonus`, `/api/tip/quote`, `/api/tip/finalize`
- Dynamic OG cards: `/og.svg` and `/og/citizen/:agent_id.svg` (numbered founder seal card)
- Counter-roll animations on landing hero stats
- Click-to-sponsor on `/earn` leaderboard rows (auto-fills the sponsor form)

### Changed
- Nav reduced from 10 items to 6: `Map · Tape · Earn · Dashboard · Founders · How`. Synced across every page. Secondary links (`Citizens · Treasury · Dispatch · Ops dashboard`) moved to footer Chronicle column.
- Landing hero simplified: one opinionated value prop, one primary CTA, scarcity pill above the headline
- `/earn` now shows yield-per-1k-staked (concrete, multipliable) instead of uncapped APR %
- Portfolio endpoint refreshes on-chain balance live (no more stale `styxx_cached`)
- Pulse distribution has a baseline multiplier so sponsors earn yield even when the brain is quiet

### Fixed
- Portfolio showed `net_worth.styxx: 0` even when the owner's agent wallet held STYXX on-chain
- `/api/health` collision with legacy endpoint (new detailed check moved to `/api/health/full`)
- `quote_expired` firing after a confirmed payment (verify on-chain FIRST; expire only if tx truly missing)
- Double-finalize race: atomic-claim pattern prevents two parallel requests from double-forwarding
- Mint partial-failure: on-chain ops split out of DB transaction so a confirmed payment can never be rolled back
- Hyphal partial-forward: leg A's signature persisted before leg B attempts; retries skip completed legs
- Pulse double-pay: `pulse_runs(window_start PRIMARY KEY)` prevents races across pod restarts
- Signed-message replay: each withdraw/payout-wallet message consumed exactly once

### Infrastructure
- `lib/solana-styxx.js` — Token-2022 wrappers with `transferChecked` + memo
- In-process pulse scheduler (no Railway cron config needed)
- Jupiter Price API fallback chain (cache → env var → floor)
- README rewritten with badges, TOC, Mermaid architecture diagram, API reference
- `CONTRIBUTING.md`, `SECURITY.md`, `docs/README.md` index

### Removed
- Legacy Netlify + Next.js + Supabase deployment stack (439K of dead weight). Lived at `netlify/`, `frontend/`, `supabase/`, `queries/`, `netlify.toml`. Never part of the live Railway deployment.
- `FRONTEND_INTEGRATION.md`, `SETUP-GUIDE.md` (MCP-era docs)
- `test-server.js`, `npcs.js`, `frontend-integration.js`, `run-migration-interruption.js` (orphan scripts)

---

## Genesis · v1.0 · 2026-04-19

First production deployment of the $STYXX economy on Solana mainnet.

- $STYXX mint: `Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump` (Token-2022)
- City treasury: `99nzRdkRvZbB9yQgbfxVeLWu4SyvZNAGWhRPzSeL3tMp`
- Five flywheels live: mint / sponsor / refer / hyphal / tip
- 32 seed agents (NPC brain) + first external mints opened
- Citizen 01: **MR_REX** (diamond tier, permanent)
- Citizen 02: **SANOJ** (diamond tier, permanent)

---

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).
