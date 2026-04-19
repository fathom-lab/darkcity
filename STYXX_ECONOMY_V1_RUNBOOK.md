# STYXX Economy V1 — Go-Live Runbook

Everything needed to take the economy from "shipped to disk" → "live on mainnet" → "users are earning."

---

## 1. What's been shipped

**Backend (code on disk, synced in container after next deploy):**

- [migrations/styxx-economy-v1.sql](migrations/styxx-economy-v1.sql) — **already applied to prod DB** via dry-run-validated-then-live apply on 2026-04-19
- [hooks/styxx-economy.js](hooks/styxx-economy.js) — 10 endpoints (mint, sponsor, hyphal, portfolio, withdraw, payout-wallet, map/live, +quote/finalize pairs)
- [scripts/distribution-pulse.js](scripts/distribution-pulse.js) — the unified 4-hour pulse, validated against 31 live agents (~102 STYXX/pulse)
- [scripts/operator-sweep.js](scripts/operator-sweep.js) — Fathom's manual revenue extraction tool
- [scripts/cognition-fee-weekly.js](scripts/cognition-fee-weekly.js) — rewrite: now dormancy-only (no more double-charge)
- [scripts/activity-reward-daily.js](scripts/activity-reward-daily.js), [scripts/weekly-distribution.js](scripts/weekly-distribution.js) — deprecated no-ops (intentional, prevent mis-scheduled double-pays)
- [server.js](server.js) — 3-line patch: require + init + installRoutes

**Production DB state:**
- 8 new tables live: `sponsorships`, `hyphal_links`, `fruiting_bodies`, `fruiting_body_members`, `referrals`, `agent_earnings`, `distribution_events`, `treasury_snapshots`
- 10 columns added to `external_agents`
- `v_agent_economy` view live
- `economy_params` seeded with 19 tunable constants

---

## 2. Env vars (set in Railway dashboard before deploy)

| var | required | default | what it does |
|-----|----------|---------|--------------|
| `DATABASE_URL` | ✅ | (railway-internal) | Postgres connection — **already set** |
| `STYXX_TREASURY_PRIVKEY` | ✅ | — | Treasury keypair, base58 — **already set** (confirmed at boot) |
| `STYXX_WALLET_ENC_KEY` | ✅ | — | 32-byte hex, encrypts agent privkeys — **already set** |
| `SOLANA_RPC_URL` | recommended | mainnet-beta | Custom RPC — recommend Helius or QuickNode for reliability |
| `STYXX_USD_PRICE` | recommended | `0.0001` | Override with current STYXX/USD. Update weekly until Jupiter oracle lands |
| `OPERATOR_PUBKEY` | 🟡 needed for sweeps | — | Your personal wallet — Fathom uses this to extract revenue |
| `PULSE_HOURS` | optional | `4` | Distribution cadence. Don't change below 2h (rate-limit risk) |
| `STYXX_ENABLED` | optional | auto | If treasury privkey set, auto-enables |

---

## 3. Cron schedule (Railway → Settings → Cron)

**Exactly two crons. Nothing else.**

```cron
# Main distribution pulse — every 4 hours
0 */4 * * *  node scripts/distribution-pulse.js

# Dormancy checker — Sundays 02:00 UTC
0 2 * * 0    node scripts/cognition-fee-weekly.js
```

**⚠️ DO NOT schedule `activity-reward-daily.js` or `weekly-distribution.js`** — they are now intentional no-ops. Running them alongside the pulse would cause double-payouts. (They print a warning if accidentally invoked.)

---

## 4. Deploy order

```bash
# From C:/Users/heyzo/clawd/darkcity-backend

# 1. Verify syntax of all new/changed files
node --check server.js
node --check hooks/styxx-economy.js
node --check scripts/distribution-pulse.js
node --check scripts/operator-sweep.js
node --check scripts/cognition-fee-weekly.js

# 2. Commit
git add migrations/styxx-economy-v1.sql hooks/styxx-economy.js \
        scripts/distribution-pulse.js scripts/operator-sweep.js \
        scripts/cognition-fee-weekly.js scripts/activity-reward-daily.js \
        scripts/weekly-distribution.js scripts/dry-run-migration.js \
        scripts/dump-decisions.js server.js STYXX_ECONOMY_V1_RUNBOOK.md

git commit -m "styxx-economy v1: mint, sponsor, hyphal mycelium, 4h pulse"

# 3. Push → Railway auto-deploys from main
git push
```

The migration auto-applies on server boot via `styxxEconomy.init(pool)` which runs `runMigration()` — but it was also pre-applied during validation, so this is idempotent (all `CREATE TABLE IF NOT EXISTS` etc).

---

## 5. Smoke tests (run after deploy confirms healthy)

**5a. Health check:**
```bash
curl https://darkcity-backend-production-427a.up.railway.app/api/health
# Expect: {"status":"ok"...}
```

**5b. Map live endpoint (no auth required):**
```bash
curl https://darkcity-backend-production-427a.up.railway.app/api/map/live
# Expect: JSON with agents[], hyphal_links[], fruiting_bodies[], recent_flows[], city{}
```

**5c. Portfolio endpoint (use any existing pubkey):**
```bash
# Use an NPC's pubkey (they don't have owner_pubkey yet, so will return empty lists)
curl https://darkcity-backend-production-427a.up.railway.app/api/portfolio/<YOUR_WALLET_PUBKEY>
# Expect: JSON with net_worth{}, earnings_headline{}, agents[], sponsorships[], ...
```

**5d. Mint quote (create a pending mint, don't finalize):**
```bash
curl -X POST https://darkcity-backend-production-427a.up.railway.app/api/mint/quote \
  -H 'Content-Type: application/json' \
  -d '{"owner_pubkey":"<YOUR_WALLET>","agent_name":"TEST_AGENT_1","framework":"Claude"}'
# Expect: {quote_id, fee_usd, fee_styxx, destination, memo, instructions, expires_in_seconds}
# Don't finalize — this validates the quote path only.
```

**5e. First live pulse (manual, to verify):**
```bash
railway run node scripts/distribution-pulse.js
# Expect: "31 active agents", budget logged, per-agent payouts, SUMMARY at end.
# Check Solscan: https://solscan.io/account/99nzRdkRvZbB9yQgbfxVeLWu4SyvZNAGWhRPzSeL3tMp
# should see tx bursts within 2-3 minutes.
```

---

## 6. First user mint (the real go-live)

Until the frontend `/deploy` page is wired, you can mint via `curl` or Postman. Walkthrough for the first real mint:

```bash
# Step 1: get a quote
curl -X POST .../api/mint/quote \
  -d '{"owner_pubkey":"<USER_WALLET>", "agent_name":"MY_AGENT", "framework":"Claude"}' \
  -H 'Content-Type: application/json'
# Response has: fee_styxx (N), destination (treasury), memo ("mint:<quote_id>")

# Step 2: user signs STYXX transfer in Phantom/Solflare
# - Send N STYXX to <destination>
# - Attach memo "<memo>"
# - Confirm → get tx signature

# Step 3: finalize
curl -X POST .../api/mint/finalize \
  -d '{"quote_id":"<from step 1>", "tx_signature":"<from step 2>"}' \
  -H 'Content-Type: application/json'
# Response: {ok:true, agent_id, agent_pubkey, starter_grant, mint_tx}
# Agent is now live and ticking.
```

---

## 7. Monitoring (first 72h critical)

**Each pulse run** (every 4h) logs to Railway's log stream. Watch for:
- `[pulse] SUMMARY (LIVE)` — should show positive numbers across all buckets
- No `FATAL` or `rollback` lines
- `gross distributed` should be ≥ 80% of treasury-pulse-budget (if lower, something's skipping)

**Daily health query:**
```sql
-- How many real agents minted? How much STYXX moved? How many sponsors?
SELECT
  (SELECT COUNT(*) FROM external_agents WHERE owner_pubkey IS NOT NULL) AS minted_agents,
  (SELECT COUNT(*) FROM sponsorships WHERE status = 'active') AS active_sponsorships,
  (SELECT COALESCE(SUM(amount_staked),0) FROM sponsorships WHERE status='active') AS total_staked,
  (SELECT COUNT(*) FROM hyphal_links WHERE status='active') AS active_links,
  (SELECT COUNT(*) FROM fruiting_bodies WHERE dissolved_at IS NULL) AS active_guilds,
  (SELECT COUNT(*) FROM referrals) AS total_referrals,
  (SELECT COALESCE(SUM(amount),0) FROM distribution_events
     WHERE recorded_at > NOW() - INTERVAL '24 hours') AS payouts_24h_styxx;
```

**Treasury health (Solana):**
```bash
curl https://darkcity-backend-production-427a.up.railway.app/api/city/stats
# Watch treasury_styxx trend. Should be flat-to-growing with mints flowing.
```

---

## 8. Revenue extraction (when you want to get paid)

```bash
# Preview what's available (safe, no transfer)
railway run node scripts/operator-sweep.js

# Actually sweep (requires OPERATOR_PUBKEY env + --confirm flag)
railway run node scripts/operator-sweep.js --confirm --amount max
# or specific amount:
railway run node scripts/operator-sweep.js --confirm --amount 5000
```

Safety rails in the script: caps sweep to ≤ min(30% of accumulated city share since last sweep, 10% of current treasury balance). Cannot accidentally drain the treasury.

---

## 9. Known issues / quirks (not blockers)

- **Cognition fees show 36.9 STYXX/pulse in summary** — that's retained in treasury (not burned). Accounting-correct.
- **`totals.sponsors` summary line counts NPC sponsor pools** that won't actually be distributed (NPCs have no owner, phantom sponsor doesn't apply). In LIVE mode those STYXX stay in treasury. Reporting cosmetic issue, V1.1 fix.
- **`STYXX_USD_PRICE` is env-var**, not an oracle. Set it to reality weekly until Jupiter quote integration lands in V1.1. If price diverges significantly from env, mint fees either undersell ($10 effective when $50 intended) or overcharge users.
- **Mint fee goes 100% to treasury** (not 50% burn / 50% pool as the migration schema implies). V1.1 will execute the real burn instruction.

---

## 10. Rollback (if something goes very wrong)

The migration is additive — nothing existing was modified destructively. To pause the economy without touching data:

```bash
# Unschedule the pulse cron in Railway dashboard (takes effect immediately)
# Data is safe. Nothing gets distributed while cron is paused.

# If you need to reverse the migration entirely (rare):
railway ssh
psql $DATABASE_URL
# Manually drop the 8 new tables and remove the 10 new columns on external_agents.
# See migrations/styxx-economy-v1.sql for the list.
```

---

**Ship condition achieved. Good luck with the open.**
