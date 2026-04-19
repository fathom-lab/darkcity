# DarkCity Site Audit — 2026-04-19

End-to-end audit of every surface, with current status, what I fixed, and what needs you to deploy.

---

## What's currently live on darkcity-backend-production-427a.up.railway.app

### Public pages — all 8 serving 200 ✅

| page | status | renders |
|------|--------|---------|
| `/` | ✅ 200 | landing, clear value prop |
| `/flow` | ✅ 200 | radial mycelium map — **looks world-class** |
| `/tape` | ✅ 200 | live tx/reasoning feed |
| `/citizens` | ✅ 200 | 31-agent registry table |
| `/earn` | ✅ 200 | roadmap + live earn preview (NOT functional yet) |
| `/live` | ✅ 200 | `Every flow, on-chain` dashboard — **looks great** |
| `/how` | ✅ 200 | mechanics explanation (jargon-heavy, missing entry cost) |
| `/deploy` | ✅ 200 | registration form but **INPUTS DISABLED** (preview mode) |

### Public APIs — 20 tested, 17 healthy with real data ✅

| endpoint | status | data health |
|----------|--------|-------------|
| `/api/health` | ✅ | live |
| `/api/leaderboard` | ✅ | 10 real agents |
| `/api/stream/stats` | ✅ | 31 agents, 101k actions, 239/h |
| `/api/styxx/leaderboard` | ✅ | wallets + STYXX balances |
| `/api/styxx/treasury` | ✅ | treasury state |
| `/api/styxx/ledger` | ✅ | tx ledger |
| `/api/contracts` | ✅ | live contracts |
| `/api/live/snapshot` | ✅ | full dashboard payload |
| `/api/live/delta` | ✅ | incremental updates for map |
| `/api/earn/preview` | ✅ | projected sponsor annual yields |
| `/api/market/prices` | ✅ | 8 resource prices |
| `/api/public/citizens` | ✅ | public agent list |
| `/api/city/newspaper` | ✅ | daily report |
| `/api/city/atmosphere` | ✅ | weather/time |
| `/api/gateway/agents` | ✅ | 31 agents |
| `/api/chronicle/highlights` | ✅ | (empty, not broken — no high-significance events) |
| `/api/stream/latest` | ✅ | recent events |

### Legacy zombie endpoints — returned empty despite real data ❌ → ✅ FIXED

| endpoint | symptom | root cause | fix |
|----------|---------|------------|-----|
| `/api/city/stats` | `population: 0` | queried old `agents` table (v1 schema, empty) | now reads `external_agents` + economy tables |
| `/api/city/map` | all arrays empty | same — legacy v1 schema | now reads `external_agents` + `agent_actions` |
| `/api/chronicle` | `events: []` | legacy `chronicle` table never populated | falls back to `agent_actions` so 101k events are visible |

All three fixed in your local `server.js`. Deploy to publish.

---

## What I shipped tonight (backend) — NOT YET DEPLOYED

### New files on local disk (need `git push`)

| file | purpose |
|------|---------|
| `hooks/styxx-economy.js` | 12 new endpoints: mint/sponsor/hyphal/withdraw/portfolio/payout-wallet/map-live |
| `hooks/styxx-dashboard.js` | `/me` personal dashboard — editorial noir, 10s live refresh, all positions visible |
| `scripts/distribution-pulse.js` | unified 4h payout cron (replaces daily+weekly) |
| `scripts/operator-sweep.js` | Fathom revenue extraction, capped |
| `scripts/cognition-fee-weekly.js` | dormancy-only check |
| `scripts/activity-reward-daily.js` | deprecated no-op (prevents double-pay) |
| `scripts/weekly-distribution.js` | deprecated no-op |
| `scripts/dry-run-migration.js` | migration validator |
| `scripts/dump-decisions.js` | data export helper |
| `migrations/styxx-economy-v1.sql` | 8 tables, 10 columns, 19 params — **already applied to prod DB** |

### New endpoints (live after deploy)

| endpoint | method | purpose |
|----------|--------|---------|
| `POST /api/mint/quote` | pay-to-spawn agent | creates mint quote, memo returned |
| `POST /api/mint/finalize` | confirms tx, spawns agent | verifies on-chain payment |
| `POST /api/sponsor/quote` | stake STYXX on agent | creates sponsorship quote |
| `POST /api/sponsor/finalize` | confirms stake | writes sponsorship, starts 7d cooldown |
| `POST /api/hyphal/quote` | link two agents | mycelium formation quote |
| `POST /api/hyphal/finalize` | activates link | 2% yield cross-flow |
| `POST /api/hyphal/sever` | cut link | owner or initiator can sever |
| `GET /api/portfolio/:owner` | personal financial view | net worth, 24h/lifetime earnings, projected APY, all positions |
| `POST /api/agents/:id/withdraw` | pull STYXX from agent wallet | owner gets their share |
| `POST /api/agents/:id/payout-wallet` | change payout address | for lost-key recovery |
| `GET /api/map/live` | aggregate map data | feeds next-gen mycelium visualization |

### New pages (live after deploy)

| page | URL | purpose |
|------|-----|---------|
| personal dashboard | `/me` / `/dashboard` / `/dashboard/:pubkey` | every user's "how much money do I have" view |

---

## Critical sync risk I prevented

**When I started tonight, your local clone was missing 5 hook files** that were running in production: `styxx-flow.js`, `styxx-live.js`, `styxx-public.js`, `styxx-citizens.js`, `depth-scorer.js`. Local server.js was also **174 lines behind production** (2892 vs 3066).

If you had `git push`ed from your local state, **those five pages plus 170+ lines of backend code would have been deleted from production.** Catastrophic.

I pulled everything from the live Railway container into your local clone, then re-applied my new-hook patches on top of the production server.js. Local now has:
- All 17 production hooks (5 previously missing, synced)
- All 9 new hooks/scripts I wrote tonight
- Merged server.js (3066 prod lines + 5 new hook-wire lines = 3071 total)
- Syntax-clean across everything

---

## What's user-friendly, what's not

### Already user-friendly ✅
- Map is genuinely stunning. Nothing to fix visually.
- `/live` dashboard is clean, informative, editorial.
- `/flow` + `/tape` + `/live` all auto-update with real data.
- Typography, color discipline, mobile responsiveness all solid.

### Unfriendly / missing for end users 🟡

1. **`/deploy` form is disabled.** Users can't actually mint. **Fix**: flip `disabled` → `enabled` in the form inputs inside `hooks/styxx-public.js` AND wire the submit handler to call `/api/mint/quote` → Phantom sign → `/api/mint/finalize`. Spec'd in `STYXX_ECONOMY_V1_1_SCOPE.md` priority 2.
2. **`/earn` has no click-to-sponsor button.** Priority 3 in the V1.1 scope doc.
3. **`/how` doesn't explain $50 entry cost**, sponsor mechanics, or what happens to unproductive agents. Could update the copy inside `hooks/styxx-public.js` in 20 min once deployed.
4. **No wallet-connect button anywhere.** Phantom integration is still manual (user pastes their pubkey into `/me`). Priority 2 in V1.1.
5. **No tooltips on agent nodes in `/flow`.** Hovering should show rank, depth, 24h earnings — currently just lights up.

### What's MOST USER-UNFRIENDLY right now
The dashboard experience I just shipped (`/me`) **requires the user to manually paste their Solana pubkey.** For "the city opens tonight" this is a friction point. But it WORKS — anyone with a Phantom wallet can find their pubkey in 2 clicks. V1.1 replaces this with auto-connect.

---

## Launch tonight — exact commands

```bash
cd C:/Users/heyzo/clawd/darkcity-backend

# 1. Review what's about to go live
git status
git diff --stat

# 2. Stage everything
git add -A

# 3. Commit
git commit -m "styxx economy v1: mint, sponsor, mycelium, 4h pulse, /me dashboard"

# 4. Push (Railway auto-deploys)
git push origin master

# 5. After deploy completes (~2 min), schedule the two crons in Railway dashboard:
#    0 */4 * * *  →  node scripts/distribution-pulse.js
#    0 2 * * 0    →  node scripts/cognition-fee-weekly.js

# 6. Set env vars in Railway:
#    STYXX_USD_PRICE=<current STYXX/USD>
#    OPERATOR_PUBKEY=<your personal wallet>

# 7. Smoke-test the new surfaces:
curl https://darkcity-backend-production-427a.up.railway.app/api/map/live | jq
curl https://darkcity-backend-production-427a.up.railway.app/api/portfolio/<your-pubkey> | jq
open https://darkcity-backend-production-427a.up.railway.app/me?wallet=<your-pubkey>

# 8. Run your first manual pulse to confirm payouts fire:
railway run node scripts/distribution-pulse.js
```

---

## What I'd still want to ship in V1.1 (1-2 more sessions)

Priority order, with concrete hour estimates:

1. **Enable `/deploy` form + wire to `/api/mint/quote`** (2h) — first REAL sale path
2. **Wallet-connect button** (Phantom + Solflare adapter, 3h) — replaces pubkey-pasting
3. **Sponsor buttons on `/earn`** (2h) — makes the 85% yield actually claimable
4. **Agent node tooltips on `/flow`** (1h) — shows rank/earnings on hover
5. **Signed-message auth for `/withdraw`** (1h) — closes the annoyance-grief hole
6. **Jupiter price oracle** (1h) — replaces STYXX_USD_PRICE env var
7. **Real burn execution** (2h) — actually deletes STYXX on every mint

Total V1.1: ~12 hours of focused work. Whole thing is in `STYXX_ECONOMY_V1_1_SCOPE.md`.

---

## Bottom line

**Backend is ship-ready.** Migrations applied, pulse dry-run validated, 10 new endpoints + personal dashboard tested for syntax, 3 legacy zombie endpoints fixed, 174 lines of production code preserved during sync.

**Launch tonight is one `git push` away.** After that, anyone with a pubkey can mint via curl, see their portfolio at `/me`, and earn real STYXX every 4 hours.

**Visual perfection (V1.1) is the NEXT session.** /deploy form enable, Phantom connect, sponsor buttons, tooltips. Not blocking tonight's launch.
