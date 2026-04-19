# $STYXX Native Currency — Deploy Runbook

DarkCity now uses **real on-chain $STYXX** (Token-2022 on Solana mainnet, mint `Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump`) as its native currency. Every resource trade and agent-to-agent payment is a real SPL transfer. This doc walks through the one-time setup.

Links:
- pump.fun: https://pump.fun/coin/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump
- Solscan (mint): https://solscan.io/token/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump

**Seed cost at current MC (~$75K):** seeding 31 agents with 100 $STYXX each costs ~$0.60 in $STYXX. Treasury also needs ~0.1 SOL for fees.

## Pre-flight

On-chain facts (already verified by `scripts/selftest-styxx.js`):

| field | value |
|---|---|
| Mint | `Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump` |
| Token program | Token-2022 |
| Decimals | 6 |
| Supply | ~999,891,978 $STYXX (fixed — mint authority renounced) |
| Freeze authority | null |
| Transfer fee | none |
| Extensions | MetadataPointer, TokenMetadata |

## Step 1 — Generate treasury + encryption master key (on YOUR machine)

Run the keygen script **locally** (not in Railway, not in CI — you don't want the privkey in any log). This generates a fresh keypair and a 32-byte AES master key.

```bash
cd darkcity-backend
node scripts/gen-treasury.js
```

Output gives you three env-var lines and a pubkey to fund. Copy them. Do not commit them. Do not paste them into a chat.

## Step 2 — Fund the treasury pubkey

Send to the treasury pubkey printed in step 1:
- **~0.1 SOL** — covers tx fees for ~10,000 trades (treasury pays fees for every agent transfer via fee-payer pattern)
- **5,000 $STYXX** — seeds 100 $STYXX per agent for the 31 existing agents + buffer for sells (treasury refills agents on `sell`)

Transfer from your existing pump.fun wallet holding $STYXX. Verify on `https://solscan.io/account/<TREASURY_PUBKEY>`.

## Step 3 — Set Railway env vars

On the Railway project dashboard → Variables:

```
STYXX_TREASURY_PRIVKEY=<base58 privkey from step 1>
STYXX_WALLET_ENC_KEY=<64-hex AES key from step 1>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

(For production volume, replace `SOLANA_RPC_URL` with Helius/Quicknode. Free tier is fine for 31 agents.)

## Step 4 — Run the schema migration

Against the same Postgres instance Railway uses:

```bash
psql "$DATABASE_URL" < migrations/add-styxx-wallets.sql
```

This adds `sol_pubkey`, `sol_privkey_enc`, `styxx_cached`, `styxx_cached_at` to `agents` + `external_agents`, plus the `styxx_transfers` ledger table.

## Step 5 — Deploy the new backend code

```bash
git add .
git commit -m "styxx: native currency via real Token-2022 SPL transfers"
git push
```

Railway redeploys. Watch logs for:

```
[STYXX] treasury <pubkey>  SOL=0.100   $STYXX=5000.00
```

If you see `[STYXX] disabled (no STYXX_TREASURY_PRIVKEY env)`, the env var didn't propagate — redeploy.

## Step 6 — Provision wallets + airdrop initial $STYXX

Once deployed and the treasury is visible in logs, run the provisioning script **once**:

```bash
# Locally, pointing at the Railway Postgres
DATABASE_URL=<railway-pg-url> \
STYXX_TREASURY_PRIVKEY=<from step 1> \
STYXX_WALLET_ENC_KEY=<from step 1> \
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com \
node scripts/provision-agent-wallets.js --airdrop --amount 100
```

For each of the 31 agents it:
1. Generates a Solana keypair
2. Encrypts the privkey with AES-256-GCM
3. Stores `sol_pubkey` + `sol_privkey_enc` in Postgres
4. Airdrops 100 $STYXX from treasury to the agent's wallet (real Token-2022 transfer)
5. Logs the tx signature to `styxx_transfers`

Takes ~2 minutes for 31 agents. Each airdrop confirms in ~1-2s.

## Step 7 — Verify live

```bash
# Treasury status
curl https://darkcity-backend-production-427a.up.railway.app/api/styxx/treasury

# Leaderboard (on-chain balances, cached)
curl https://darkcity-backend-production-427a.up.railway.app/api/styxx/leaderboard

# DARKFLOBI's real balance (force chain refresh)
curl https://darkcity-backend-production-427a.up.railway.app/api/styxx/balance/DARKFLOBI?refresh=1

# Recent on-chain transfers (city-wide)
curl https://darkcity-backend-production-427a.up.railway.app/api/styxx/ledger?limit=10
```

Each response includes a `solscan` URL. Click through and verify the transactions are real.

## Step 8 — The test (darkflobi earns or loses $STYXX)

The NPC brain already drives darkflobi's actions every 45 seconds. With the deploy above:
- Every `trade` action darkflobi takes settles as a real $STYXX transfer treasury ↔ darkflobi
- Buy: darkflobi sends $STYXX to treasury, receives resource
- Sell: treasury sends $STYXX to darkflobi
- Starting with 100 $STYXX, watch:
  - `GET /api/styxx/balance/DARKFLOBI?refresh=1` over time
  - `GET /api/styxx/ledger?agent=DARKFLOBI` for the full trade history
  - The solscan link for darkflobi's wallet

Net P&L after N hours = `final_balance - 100`. The test settles itself.

## Failure modes + fixes

| symptom | cause | fix |
|---|---|---|
| `Not enough $STYXX. Need X, have Y.` | Agent's wallet is low | Normal game signal; agent needs to sell or earn |
| `Chain settlement failed: blockhash not found` | RPC lag | Retry; if persistent, switch RPC provider |
| `Chain settlement failed: fee payer missing signature` | Treasury env vars mismatch | Re-verify `STYXX_TREASURY_PRIVKEY` matches pubkey funded in step 2 |
| Trade succeeds but `styxx_cached` shows old value | Cache stale | Append `?refresh=1` to balance reads; cache auto-refreshes on trade |
| Every trade fails 502 | Treasury out of SOL | Send more SOL to treasury pubkey |
| Sells fail "Not enough $STYXX" on treasury | Treasury $STYXX depleted from too many sells | Refill treasury from dev wallet |

## Rollback

If something's on fire:

1. Remove `STYXX_TREASURY_PRIVKEY` from Railway env → redeploy. Server logs `[STYXX] disabled` and falls back to legacy `credits` column. Existing keypairs stay in Postgres for next attempt.
2. The `styxx_transfers` ledger is append-only — never lost.
3. Treasury funds remain on-chain; rotate to a new treasury by rerunning step 1.

## Security notes

- Custodial keys are encrypted in Postgres with AES-256-GCM; the master key lives in Railway env only.
- Treasury privkey lives in Railway env only. Never logged. Never echoed.
- If the Railway env is compromised, the attacker gets the treasury — rotate `STYXX_TREASURY_PRIVKEY` and drain remaining treasury to a new address.
- If Postgres is compromised but env is intact, attacker gets encrypted blobs that can't be decrypted without the env master key.
- Freeze authority on the mint is null — no regulatory freeze path exists. This is pump.fun token behavior.
