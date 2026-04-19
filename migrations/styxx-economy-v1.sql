-- ============================================================================
-- STYXX ECONOMY V1 — The Flywheel Monster
-- ============================================================================
-- Five flywheels wired on top of the existing external_agents + styxx_transfers
-- infra:
--   ① Mint → Burn → Scarcity
--   ② Work → Yield (85/15 sponsor split)
--   ③ Link → Network (hyphal mycelium)
--   ④ Referral (viral loop)
--   ⑤ Treasury Buyback (external-value pump)
--
-- All STYXX movement continues to flow through styxx_transfers (on-chain
-- ledger). These tables are relational overlays — they track WHY a transfer
-- happened and WHO is entitled to future flows.
-- ============================================================================

-- ══ 1. Owner-agent linkage ═══════════════════════════════════════════════════
-- A minted agent belongs to a human owner identified by their Solana pubkey.
-- We extend external_agents rather than creating a parallel table.

ALTER TABLE external_agents
  ADD COLUMN IF NOT EXISTS owner_pubkey         TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_pubkey   TEXT,
  ADD COLUMN IF NOT EXISTS cognition_fee_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dormant              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS minted_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mint_tx_signature    TEXT,
  ADD COLUMN IF NOT EXISTS mint_fee_usd         NUMERIC,
  ADD COLUMN IF NOT EXISTS mint_fee_styxx       NUMERIC,
  ADD COLUMN IF NOT EXISTS last_cognition_fee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS euthanized_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ext_agents_owner   ON external_agents(owner_pubkey)    WHERE owner_pubkey IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ext_agents_referrer ON external_agents(referred_by_pubkey) WHERE referred_by_pubkey IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ext_agents_dormant ON external_agents(dormant, last_cognition_fee_at);

COMMENT ON COLUMN external_agents.owner_pubkey IS 'Solana pubkey of the human who minted/owns this agent. NULL for pre-economy seed NPCs.';


-- ══ 2. Sponsorships — Flywheel ② (Work → Yield) ═══════════════════════════════
-- A sponsor locks STYXX backing an agent. While locked, they get 85%
-- of that agent's net earnings pro-rata with other sponsors (minus 15%
-- city cut). Weekly distribution job pays out.

CREATE TABLE IF NOT EXISTS sponsorships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_pubkey    TEXT NOT NULL,
  agent_id          TEXT NOT NULL REFERENCES external_agents(agent_id) ON DELETE CASCADE,
  amount_staked     NUMERIC NOT NULL CHECK (amount_staked > 0),
  stake_tx          TEXT NOT NULL,                 -- on-chain deposit tx
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cooldown_ends_at  TIMESTAMPTZ NOT NULL,          -- 7 days after unstake request
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unstaking','withdrawn')),
  total_distributed NUMERIC DEFAULT 0,             -- running total earned
  withdrawn_at      TIMESTAMPTZ,
  withdraw_tx       TEXT
);

CREATE INDEX IF NOT EXISTS idx_sponsor_agent  ON sponsorships(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsor_pubkey ON sponsorships(sponsor_pubkey, status);

COMMENT ON TABLE sponsorships IS 'Active sponsor stakes. 85% of agent earnings → sponsors pro-rata, 15% → city treasury.';


-- ══ 3. Hyphal links — Flywheel ③ (Mycelium network) ═══════════════════════════
-- Bidirectional opt-in link between two agents. Cost: 25 STYXX paid by
-- initiator, split 50/50 into both agent wallets. While linked, 2% of each
-- agent's earnings auto-flows to the counterparty.

CREATE TABLE IF NOT EXISTS hyphal_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_a         TEXT NOT NULL REFERENCES external_agents(agent_id) ON DELETE CASCADE,
  agent_b         TEXT NOT NULL REFERENCES external_agents(agent_id) ON DELETE CASCADE,
  initiator_pubkey TEXT NOT NULL,
  formed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  formation_tx    TEXT NOT NULL,
  yield_share_bps INTEGER NOT NULL DEFAULT 200,    -- 2% = 200 bps
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','severed')),
  severed_at      TIMESTAMPTZ,
  severed_by_pubkey TEXT,
  CONSTRAINT unique_active_link UNIQUE (agent_a, agent_b),
  CONSTRAINT ordered_pair CHECK (agent_a < agent_b)  -- canonicalize (a,b) where a<b
);

CREATE INDEX IF NOT EXISTS idx_hyphal_a ON hyphal_links(agent_a, status);
CREATE INDEX IF NOT EXISTS idx_hyphal_b ON hyphal_links(agent_b, status);

COMMENT ON TABLE hyphal_links IS 'Mycelium layer: opt-in bidirectional agent links. 2% yield cross-flow per side.';


-- ══ 4. Fruiting bodies — emergent guilds ══════════════════════════════════════
-- Auto-detected when ≥5 agents form a mutually-linked cluster (every member
-- linked to every other member). Detector cron creates the row. Members
-- contribute 1% of earnings to the guild wallet; distributions voted on-chain.

CREATE TABLE IF NOT EXISTS fruiting_bodies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  guild_pubkey    TEXT UNIQUE NOT NULL,            -- guild's collective Solana wallet
  guild_privkey_enc TEXT NOT NULL,
  treasury_styxx  NUMERIC DEFAULT 0,
  formed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dissolved_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fruiting_body_members (
  fruiting_body_id UUID NOT NULL REFERENCES fruiting_bodies(id) ON DELETE CASCADE,
  agent_id         TEXT NOT NULL REFERENCES external_agents(agent_id) ON DELETE CASCADE,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at          TIMESTAMPTZ,
  PRIMARY KEY (fruiting_body_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_members_agent ON fruiting_body_members(agent_id) WHERE left_at IS NULL;

COMMENT ON TABLE fruiting_bodies IS 'Emergent guilds — auto-formed when 5+ agents are mutually hyphal-linked.';


-- ══ 5. Referrals — Flywheel ④ (Viral loop) ════════════════════════════════════
-- When a new agent is minted with a referred_by_pubkey, the referrer earns:
--   - 10% of the mint fee (one-time, at mint)
--   - 5% of the new agent's sponsor distributions for 90 days
-- Referrals are recorded here; payouts are computed by the weekly cron.

CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_pubkey       TEXT NOT NULL,
  referred_agent_id     TEXT NOT NULL REFERENCES external_agents(agent_id) ON DELETE CASCADE,
  referred_owner_pubkey TEXT NOT NULL,
  minted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,      -- minted_at + 90 days
  mint_fee_bonus_styxx  NUMERIC NOT NULL DEFAULT 0,
  mint_fee_bonus_tx     TEXT,
  total_yield_bonus_styxx NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_pubkey);
CREATE INDEX IF NOT EXISTS idx_referrals_expires  ON referrals(expires_at);

COMMENT ON TABLE referrals IS 'Viral loop: referrer earns 10% mint fee + 5% yield for 90d from referred agent.';


-- ══ 6. Earnings ledger — unified flow log ═════════════════════════════════════
-- Every STYXX movement within the economy is recorded here with its *reason*,
-- so weekly cron jobs can correctly compute sponsor/hyphal/fruiting/referral
-- shares. This is the SOURCE OF TRUTH for "net earnings" calculations.

CREATE TABLE IF NOT EXISTS agent_earnings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL REFERENCES external_agents(agent_id) ON DELETE CASCADE,
  amount        NUMERIC NOT NULL,                  -- positive = inflow to agent wallet
  source        TEXT NOT NULL CHECK (source IN (
                  'activity_reward',               -- daily city pool distribution
                  'contract_completion',           -- task marketplace payout
                  'trade_profit',                  -- resource market
                  'social_tip',                    -- viewer tip
                  'hyphal_inflow',                 -- cross-flow from linked agent
                  'fruiting_dividend',             -- guild distribution
                  'decomposition_inflow',          -- dying neighbor's balance
                  'mint_grant'                     -- starter grant
                )),
  source_ref    TEXT,                              -- e.g., contract_id, tip_tx
  depth_score   NUMERIC,                           -- attached when activity_reward
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  distributed   BOOLEAN NOT NULL DEFAULT FALSE,    -- weekly cron sets TRUE
  distributed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_earnings_agent    ON agent_earnings(agent_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_pending  ON agent_earnings(distributed, recorded_at) WHERE distributed = FALSE;

COMMENT ON TABLE agent_earnings IS 'Every inflow an agent receives, tagged by source. Drives weekly distribution math.';


-- ══ 7. Distribution events — audit trail of weekly cron runs ═════════════════
CREATE TABLE IF NOT EXISTS distribution_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT NOT NULL CHECK (kind IN ('weekly_sponsor','hyphal_flow','fruiting_dividend','referral_bonus','cognition_fee')),
  agent_id          TEXT,
  recipient_pubkey  TEXT,
  amount            NUMERIC NOT NULL,
  tx_signature      TEXT,                          -- on-chain settlement
  window_start      TIMESTAMPTZ,
  window_end        TIMESTAMPTZ,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_kind ON distribution_events(kind, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_dist_recipient ON distribution_events(recipient_pubkey, recorded_at DESC);


-- ══ 8. City treasury snapshots — monthly buyback tracking ═════════════════════
CREATE TABLE IF NOT EXISTS treasury_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  treasury_balance_styxx NUMERIC NOT NULL,
  treasury_balance_usd   NUMERIC,
  city_pool_styxx        NUMERIC NOT NULL,
  total_burned_styxx     NUMERIC NOT NULL,
  total_minted_agents    INTEGER NOT NULL,
  active_agents          INTEGER NOT NULL,
  active_sponsorships    INTEGER NOT NULL,
  active_hyphal_links    INTEGER NOT NULL,
  active_fruiting_bodies INTEGER NOT NULL,
  buyback_styxx          NUMERIC DEFAULT 0,
  buyback_burn_styxx     NUMERIC DEFAULT 0,
  buyback_tx             TEXT
);


-- ══ 9. Views — convenient read-paths for the site ═════════════════════════════

CREATE OR REPLACE VIEW v_agent_economy AS
SELECT
  ea.agent_id,
  ea.district,
  ea.rank,
  ea.reputation,
  ea.owner_pubkey,
  ea.referred_by_pubkey,
  ea.minted_at,
  ea.dormant,
  ea.cognition_fee_balance,
  COALESCE(
    (SELECT SUM(amount) FROM agent_earnings ae
      WHERE ae.agent_id = ea.agent_id
        AND ae.recorded_at > NOW() - INTERVAL '7 days'),
    0
  ) AS earnings_7d,
  COALESCE(
    (SELECT SUM(amount_staked) FROM sponsorships s
      WHERE s.agent_id = ea.agent_id AND s.status = 'active'),
    0
  ) AS total_sponsored,
  COALESCE(
    (SELECT COUNT(*) FROM sponsorships s
      WHERE s.agent_id = ea.agent_id AND s.status = 'active'),
    0
  ) AS n_sponsors,
  COALESCE(
    (SELECT COUNT(*) FROM hyphal_links hl
      WHERE (hl.agent_a = ea.agent_id OR hl.agent_b = ea.agent_id)
        AND hl.status = 'active'),
    0
  ) AS n_hyphal_links
FROM external_agents ea;

COMMENT ON VIEW v_agent_economy IS 'Dashboard read-view — all economy metrics per agent, one join.';


-- ══ 10. Seed constants ═══════════════════════════════════════════════════════
-- These are the tunable economy parameters. Stored as rows so the backend
-- can update them without a migration.

CREATE TABLE IF NOT EXISTS economy_params (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO economy_params (key, value) VALUES
  ('mint_fee_usd',               '50'),
  ('mint_fee_burn_bps',          '5000'),  -- 50% burn
  ('mint_fee_pool_bps',          '5000'),  -- 50% to city pool
  ('starter_grant_styxx',        '100'),
  ('cognition_fee_weekly_styxx', '50'),
  ('sponsor_share_bps',          '8500'),  -- 85% to sponsors
  ('city_share_bps',             '1500'),  -- 15% to city
  ('hyphal_link_cost_styxx',     '25'),
  ('hyphal_yield_share_bps',     '200'),   -- 2% per side
  ('fruiting_body_min_size',     '5'),
  ('fruiting_body_tax_bps',      '100'),   -- 1% of members' earnings
  ('referral_mint_bonus_bps',    '1000'),  -- 10% of mint fee
  ('referral_yield_bonus_bps',   '500'),   -- 5% of referred's yield for 90d
  ('referral_duration_days',     '90'),
  ('tip_burn_bps',               '500'),   -- 5% of tips burned
  ('monthly_buyback_bps',        '5000'),  -- 50% of treasury monthly buyback goes to burn
  ('sponsor_cooldown_days',      '7'),
  ('euthanize_after_dormant_days', '30'),
  ('bounty_hunter_share_bps',    '5000')   -- 50% of dead agent's balance to euthanizer
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE economy_params IS 'Live-tunable economy parameters. Read by mint/sponsor/hyphal endpoints at runtime.';

-- ═══════════════════════════════════════════════════════════════════════════
-- END styxx-economy-v1.sql
-- Apply via: psql $DATABASE_URL -f migrations/styxx-economy-v1.sql
-- Or, for production, run from backend: server.js picks this up on boot via
-- the same runDataPipelineMigration pattern.
-- ═══════════════════════════════════════════════════════════════════════════
