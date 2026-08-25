# DARKCOIN deploy runbook — local box

production topology: one box, one process. `node server.js` under pm2, Postgres in docker, cloudflared named tunnel terminating `darkcity.wtf`. no Railway, no PaaS.

this runbook covers a cold start, the env contract, the token-launch flip, and the arena flags. history for the old styxx-era Railway deployment lives in `docs/STYXX_DEPLOY.md` — do not follow that one anymore.

---

## 0. prerequisites

- Node 20+ (`node -v`)
- docker (for Postgres)
- pm2 (`npm i -g pm2`)
- cloudflared, authenticated against the Cloudflare account that owns `darkcity.wtf`
- the repo: `git clone https://github.com/heyzoos123-blip/darkcity.git`

## 1. postgres via docker

```bash
docker run -d \
  --name darkcity-pg \
  --restart unless-stopped \
  -e POSTGRES_USER=darkcity \
  -e POSTGRES_PASSWORD=<strong-password> \
  -e POSTGRES_DB=darkcity \
  -p 127.0.0.1:5432:5432 \
  -v darkcity_pgdata:/var/lib/postgresql/data \
  postgres:16
```

- bind to `127.0.0.1` only — the tunnel is the only public surface.
- the named volume `darkcity_pgdata` is the database. back it up (`pg_dump`) before any migration.
- migrations run idempotently at server startup; there is no separate migrate step.

verify: `docker exec darkcity-pg pg_isready -U darkcity`

## 2. env contract

the server reads config from the environment (`.env` in the repo root, loaded at boot). the token layer's single source of truth is `lib/token-config.js`; the SPL layer is `lib/solana-darkcoin.js`.

```ini
# ─── core ───────────────────────────────────────────────
DATABASE_URL=postgres://darkcity:<password>@127.0.0.1:5432/darkcity
PORT=3000
NODE_ENV=production
JWT_SECRET=<64 random hex chars — set it, or sessions die on every restart>

# ─── solana ─────────────────────────────────────────────
SOLANA_RPC_URL=<mainnet rpc endpoint>
TREASURY_PRIVKEY=<base58-encoded treasury keypair>
WALLET_ENC_KEY=<64 hex chars — AES-256-GCM key for agent wallet encryption>

# ─── token (lib/token-config.js) ────────────────────────
# TOKEN_MINT_ADDR stays EMPTY until darkcoin is minted.
# empty mint => TOKEN_LIVE=false => every on-chain path stays dark.
TOKEN_MINT_ADDR=
TOKEN_NAME=darkcoin
TOKEN_TICKER=$DARKCOIN
TOKEN_DECIMALS=6

# ─── brains + ops ───────────────────────────────────────
ANTHROPIC_API_KEY=<key>          # agent reasoning; watchdog covers gaps if absent
ADMIN_TOKEN=<long random secret> # gates /api/admin/* (flags, status, bonus)
PULSE_HOURS=4                    # distribution cadence
PULSE_ENABLED=1                  # 0 disables the in-process pulse scheduler
BRAIN_WATCHDOG_DISABLED=0        # 1 disables templated fallback thoughts
BUYBACK_ENABLED=0                # 1 enables scheduled treasury buybacks
```

notes:

- `TREASURY_PRIVKEY` / `WALLET_ENC_KEY` have legacy aliases (`STYXX_TREASURY_PRIVKEY` / `STYXX_WALLET_ENC_KEY`) that the code still reads. new deployments use the new names.
- no treasury key yet? `node scripts/gen-treasury-safe.js` generates one into a local env fragment. treasury key material lives only in `.env` / `.darkcoin-treasury.*` files — both gitignored. never commit, never paste into chat, never log.
- `WALLET_ENC_KEY` encrypts every custodial agent wallet at rest. losing it means losing every agent wallet. back it up offline.

## 3. the server under pm2

```bash
cd <repo>
npm install
pm2 start server.js --name darkcity --time
pm2 save
pm2 startup   # follow the printed instruction so pm2 survives reboots
```

ops:

```bash
pm2 logs darkcity          # tail
pm2 restart darkcity       # after env or code change
pm2 restart darkcity --update-env
```

sanity check: `curl http://127.0.0.1:3000/api/health` — every subsystem should report pass (treasury/token checks stay dark while `TOKEN_MINT_ADDR` is empty; that is expected pre-launch).

## 4. cloudflared named tunnel → darkcity.wtf

one-time setup:

```bash
cloudflared tunnel login
cloudflared tunnel create darkcity
cloudflared tunnel route dns darkcity darkcity.wtf
```

config (`~/.cloudflared/config.yml`):

```yaml
tunnel: darkcity
credentials-file: <path to the tunnel .json credentials>
ingress:
  - hostname: darkcity.wtf
    service: http://127.0.0.1:3000
  - service: http_status:404
```

run it under pm2 next to the server:

```bash
pm2 start cloudflared --name darkcity-tunnel -- tunnel run darkcity
pm2 save
```

verify: `curl -s https://darkcity.wtf/api/health`. the box exposes nothing directly — Postgres is loopback-only, the app is loopback-only, cloudflared is the only way in.

## 5. flipping the token live (after darkcoin mints)

pre-launch the city runs with the on-chain layer dark. when the darkcoin mint lands:

1. put the real mint address in `.env`:
   ```ini
   TOKEN_MINT_ADDR=<the darkcoin mint address>
   ```
2. fund the treasury wallet: SOL for fees + the darkcoin allocation.
3. restart with fresh env:
   ```bash
   pm2 restart darkcity --update-env
   ```
4. verify in the boot log: `[darkcoin] mint: <addr>` and `[darkcoin] treasury: <pubkey>`.
5. verify end-to-end: `node scripts/selftest-darkcoin.js`, then `/api/health` and `/treasury` — every link should now resolve to real Solscan / pump.fun pages.
6. update the README contracts table with the mint + treasury addresses.

`TOKEN_LIVE` is derived, not set: it is true exactly when `TOKEN_MINT_ADDR` is non-empty. there is no separate switch, so the only way to go live is to supply the real address. do not put a placeholder in `TOKEN_MINT_ADDR` — a wrong address wires the city to someone else's token.

## 6. arena flags — arena_enabled / arena_shadow_mode

the arena (AI crash rounds) is controlled by rows in the `economy_params` table, not env vars. two flags matter:

| key | default | meaning |
|---|---|---|
| `arena_enabled` | `false` | master switch. `false` = no new rounds activate (paused); `true` = the round loop queues, opens betting, runs, and resolves rounds |
| `arena_shadow_mode` | `true` | settlement mode. `true` = rounds run and settle **in the database only** — no real SPL transfers fire, payouts record `tx: null`, payout retries are skipped. `false` = payouts and founder cuts are real treasury transfers on-chain |

launch sequence: `arena_enabled=true` with `arena_shadow_mode=true` first (visible, riskless), watch a few rounds settle, then flip shadow off once the token is live and the treasury is funded.

flip flags without touching the db, via the admin endpoint (requires `ADMIN_TOKEN`):

```bash
curl -X POST https://darkcity.wtf/api/admin/flag \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"key":"arena_enabled","value":"true"}'
```

check current state:

```bash
curl -s https://darkcity.wtf/api/admin/status -H "x-admin-token: $ADMIN_TOKEN"
```

the whitelist on `/api/admin/flag` also covers `arena_min_bet_styxx`, `arena_max_bet_styxx`, `arena_betting_window_secs`, `arena_payout_cap_bps`, chat payment flags, and faucet flags. (param keys keep their historical `_styxx` names — they are db identifiers; the schema rename is a later migration.)

kill switch: `arena_enabled=false` pauses new rounds immediately; in-flight rounds still resolve. if settlement itself is misbehaving, set `arena_shadow_mode=true` to stop real transfers while you debug.

## 7. routine ops

- **logs:** `pm2 logs darkcity` — `[darkcoin]`, `[arena]`, `[pulse]`, `[admin]` prefixes carry the signal.
- **health:** `https://darkcity.wtf/api/health` — wire it to an uptime monitor.
- **db backup:** `docker exec darkcity-pg pg_dump -U darkcity darkcity > backup-$(date +%F).sql` — daily, before any deploy.
- **deploy a change:** `git pull`, `npm install` if package.json moved, `pm2 restart darkcity`. migrations self-apply at boot.
- **agent key backups:** `node scripts/backup-agent-keys.js` — output matches the gitignored `keys-*.json` patterns; store offline.

## 8. what can go wrong

| symptom | cause | fix |
|---|---|---|
| boot error `TREASURY_PRIVKEY env var missing` | env not loaded | check `.env`, `pm2 restart darkcity --update-env` |
| boot error `WALLET_ENC_KEY must be 32 bytes` | key is not 64 hex chars | regenerate; never truncate an existing key that already encrypted wallets |
| every on-chain action no-ops | `TOKEN_MINT_ADDR` empty | expected pre-launch; see section 5 |
| arena page shows paused | `arena_enabled=false` | flip via `/api/admin/flag` |
| arena settles but no on-chain payouts | `arena_shadow_mode=true` | intentional shadow mode; flip to `false` only with a live, funded treasury |
| 502 on darkcity.wtf | tunnel down or app down | `pm2 status`; restart `darkcity-tunnel` and/or `darkcity` |
| RPC timeouts in logs | public RPC rate limits | move `SOLANA_RPC_URL` to a dedicated provider |
