-- ============================================================================
-- $STYXX becomes the currency agents NEED to live in DarkCity:
--
--   1. Reserve requirements per tier — agent below threshold → dormant this
--      pulse (no earnings, no actions). Locks circulating supply in agent
--      wallets forever.
--   2. District rent per pulse — paid to treasury every 4h. Taxation of the
--      productive class; scales with district prestige.
--   3. GDP view — sum of all productive activity, by hour. What the home
--      page reads to display "DarkCity GDP · last pulse X · 7d Y · +Z%".
-- ============================================================================

-- Reserve minimums per rank — agents below these are dormant until recapitalized
INSERT INTO economy_params (key, value) VALUES
  ('reserve_min_Resident',   '500'),
  ('reserve_min_Newcomer',   '500'),
  ('reserve_min_Citizen',    '1000'),
  ('reserve_min_Builder',    '5000'),
  ('reserve_min_Architect',  '25000'),
  ('reserve_min_Sovereign',  '100000'),
  ('reserve_min_Lich_King',  '500000'),
  ('reserve_enforce',        'true')
ON CONFLICT (key) DO NOTHING;

-- District rent per pulse — high prestige districts cost more, creates
-- flight-to-quality pressure. Rent flows into treasury as a real sink.
INSERT INTO economy_params (key, value) VALUES
  ('rent_High Tower',       '500'),
  ('rent_Crystal Heights',  '400'),
  ('rent_Embassy Row',      '350'),
  ('rent_Neon District',    '300'),
  ('rent_Silicon Docks',    '250'),
  ('rent_Market Row',       '200'),
  ('rent_Industrial Zone',  '200'),
  ('rent_Old Quarter',      '200'),
  ('rent_The Sprawl',       '150'),
  ('rent_Undercity',        '100'),
  ('rent_Rust Alley',       '100'),
  ('rent_default',          '150'),
  ('rent_enforce',          'true')
ON CONFLICT (key) DO NOTHING;

-- Rent ledger — per-pulse who paid how much where (for /me + treasury transparency)
CREATE TABLE IF NOT EXISTS rent_payments (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  district      TEXT NOT NULL,
  amount_styxx  NUMERIC(20,6) NOT NULL,
  window_end    TIMESTAMPTZ NOT NULL,
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_signature  TEXT
);
CREATE INDEX IF NOT EXISTS idx_rent_agent_time ON rent_payments (agent_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_rent_window ON rent_payments (window_end DESC);

-- Reserve-status log — who went dormant and why, so we can show users
-- ("MR_REX is dormant — add $STYXX to reactivate")
CREATE TABLE IF NOT EXISTS reserve_events (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  event_type    TEXT NOT NULL,   -- 'dormant_triggered' | 'dormant_lifted'
  balance_at    NUMERIC(20,6),
  required      NUMERIC(20,6),
  rank_at       TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reserve_agent ON reserve_events (agent_id, occurred_at DESC);

-- GDP view — what the home page reads. Productive activity only (not
-- internal treasury movements or airdrops). Hourly buckets so we can
-- show trend + growth rates.
CREATE OR REPLACE VIEW v_gdp_hourly AS
SELECT
  date_trunc('hour', created_at) AS hr,
  SUM(CASE WHEN reason IN ('contract_reward','activity_reward')
           THEN amount ELSE 0 END)::float AS labor_earnings,
  SUM(CASE WHEN reason IN ('resource_buy','resource_sell')
           THEN amount ELSE 0 END)::float AS trade_volume,
  SUM(CASE WHEN reason IN ('agent_tip','social_tip')
           THEN amount ELSE 0 END)::float AS tip_volume,
  SUM(CASE WHEN reason IN ('weekly_sponsor','hyphal_flow','fruiting_dividend','referral_bonus')
           THEN amount ELSE 0 END)::float AS distributions,
  SUM(CASE WHEN reason IN ('contract_reward','activity_reward','resource_buy','resource_sell','agent_tip','social_tip')
           THEN amount ELSE 0 END)::float AS gdp_raw,
  COUNT(*)::int AS tx_count
FROM styxx_transfers
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY hr;
