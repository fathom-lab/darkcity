-- ============================================================================
-- GENESIS SNAPSHOT — freeze early-participant identity forever.
--
-- Three categories, all permanent:
--   - founder_minter  : owned an agent at genesis   → 1.50× forever
--   - genesis_sponsor : staked on any agent at genesis → 1.25× + priority payout
--   - snapshot_holder : held ≥ 1,000 $STYXX at genesis → 2.00× for first 60 days
--
-- Multipliers STACK. A wallet in all three = 1.50 × 1.25 × 2.00 = 3.75×.
-- Writes are one-time; snapshot is immutable. Published on-chain as memo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS genesis_snapshot (
  id              BIGSERIAL PRIMARY KEY,
  wallet_pubkey   TEXT NOT NULL,
  category        TEXT NOT NULL,         -- 'founder_minter' | 'genesis_sponsor' | 'snapshot_holder'
  multiplier      NUMERIC(5,2) NOT NULL, -- 1.50 / 1.25 / 2.00
  -- supporting data (for verifiability)
  agent_id        TEXT,                  -- if founder_minter
  sponsored_agent TEXT,                  -- if genesis_sponsor
  holding_styxx   NUMERIC(20,6),         -- if snapshot_holder
  note            TEXT,
  expires_at      TIMESTAMPTZ,           -- null = permanent
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_pubkey, category)
);
CREATE INDEX IF NOT EXISTS idx_genesis_wallet ON genesis_snapshot (wallet_pubkey);
CREATE INDEX IF NOT EXISTS idx_genesis_category ON genesis_snapshot (category);

-- Helper view: per-wallet total stacked multiplier (for fast lookup at payout time)
CREATE OR REPLACE VIEW v_genesis_multiplier AS
SELECT
  wallet_pubkey,
  COALESCE(PRODUCT(CASE
    WHEN expires_at IS NULL OR expires_at > NOW() THEN multiplier
    ELSE 1.0
  END), 1.0) AS effective_multiplier,
  ARRAY_AGG(category ORDER BY category) AS categories
FROM genesis_snapshot
GROUP BY wallet_pubkey;

-- Postgres doesn't have PRODUCT() natively; substitute with EXP(SUM(LN(x)))
DROP VIEW IF EXISTS v_genesis_multiplier;
CREATE OR REPLACE VIEW v_genesis_multiplier AS
SELECT
  wallet_pubkey,
  EXP(SUM(LN(CASE
    WHEN expires_at IS NULL OR expires_at > NOW() THEN multiplier::float
    ELSE 1.0
  END))) AS effective_multiplier,
  ARRAY_AGG(category ORDER BY category) AS categories,
  MIN(snapshot_at) AS first_snapshot_at
FROM genesis_snapshot
GROUP BY wallet_pubkey;
