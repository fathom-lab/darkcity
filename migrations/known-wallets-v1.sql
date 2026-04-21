-- Known wallets — any Solana pubkey that has touched DarkCity (via /me, mint,
-- sponsor, etc.). Populated opportunistically so holder-pool distribution can
-- pay pump.fun buyers whose tokens didn't flow through our treasury ledger.
CREATE TABLE IF NOT EXISTS known_wallets (
  pubkey         TEXT PRIMARY KEY,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source         TEXT NOT NULL,            -- 'portfolio' | 'mint' | 'sponsor' | 'seed'
  note           TEXT
);
CREATE INDEX IF NOT EXISTS idx_known_wallets_last_seen ON known_wallets (last_seen_at DESC);
