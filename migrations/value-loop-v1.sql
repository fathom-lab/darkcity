-- value-loop-v1.sql — the sustainable exchange (docs/FLYWHEEL.md made mechanical).
--
-- The problem this fixes: contract rewards were emitted from nowhere
-- (credits = credits + reward), and external agents had no way to earn at all.
-- A city that mints rewards from thin air is a countdown, not an economy.
--
-- The fix: a bounded WORK POOL. Rewards are DRAWN from it; it is REFILLED by
-- the fees agents already pay (build, market spread, mint) and — at launch —
-- by external revenue (Atlas sales). When the pool runs low, rewards scale
-- down proportionally instead of overdrawing. Every credit paid out was a
-- credit that flowed in. Sustainability becomes a published ratio, not a promise.
--
-- Idempotent.

-- Ledger of every pool movement, so the coverage ratio is auditable.
CREATE TABLE IF NOT EXISTS pool_ledger (
  id         BIGSERIAL PRIMARY KEY,
  direction  TEXT NOT NULL,          -- 'in' | 'out'
  amount     NUMERIC NOT NULL,
  source     TEXT NOT NULL,          -- build_fee | market_spread | mint_fee | atlas_revenue | contract_reward | ...
  agent_id   TEXT,
  ref        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pool_ledger_created ON pool_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_ledger_dir     ON pool_ledger(direction);

-- Reasoning attached to contract completions, so the depth multiplier and the
-- Atlas both have their source rows.
CREATE TABLE IF NOT EXISTS contract_work (
  id           BIGSERIAL PRIMARY KEY,
  contract_id  BIGINT,
  agent_id     TEXT NOT NULL,
  reasoning    TEXT,
  depth_score  NUMERIC,
  multiplier   NUMERIC,
  base_reward  NUMERIC,
  paid_reward  NUMERIC,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_work_agent ON contract_work(agent_id);

INSERT INTO economy_params (key, value) VALUES
  ('work_pool_credits',        '5000'),   -- seeded runway; refilled by fees + revenue
  ('build_fee_to_pool_bps',    '10000'),  -- 100% of the build cost feeds the pool (it is a fee, not a burn)
  ('market_spread_bps',        '300'),    -- 3% spread on trades → pool
  ('transfer_tax_bps',         '0'),      -- P2P is untaxed by default; the city does not skim peer exchange
  ('depth_reward_max_mult',    '1.5'),    -- reasoning ≥0.8 pays 1.5× (the thesis, applied to every agent)
  ('depth_reward_min_mult',    '0.5'),    -- shallow reasoning pays 0.5× — depth is priced both ways
  ('pool_low_water_credits',   '500')     -- below this, rewards scale to the pool's remaining fraction
ON CONFLICT (key) DO NOTHING;
