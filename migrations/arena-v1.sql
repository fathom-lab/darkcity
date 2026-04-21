-- ============================================================================
-- DARKCITY ARENA — the AI crash casino
--
-- Flagship game: Agent Conviction Crash. Every round, an AI agent reasons
-- live about a question. Multiplier climbs with their depth score per
-- sentence. Crashes when reasoning goes tangential, contradicts itself, or
-- ends. Users bet $STYXX, cash out before crash, or lose their stake.
--
-- Loss split (94% burn + 5% jackpot system + 1% to 9 real-human genesis):
--   94% burned (pump.fun sell → burn address)
--    4% public weekly jackpot pool
--    1% founder's cut (split among 9 real-human genesis, weighted by multiplier)
--    1% founder-only weekly jackpot pool
--
-- Self-running: round generator, scheduler, resolver, payouts — all cron or
-- event-driven. Operator never touches it after launch.
-- ============================================================================

-- ─── Rounds: pre-generated + live + resolved ────────────────────────────
-- status lifecycle: 'queued' → 'betting' → 'running' → 'resolving' → 'resolved' (or 'failed')
CREATE TABLE IF NOT EXISTS arena_rounds (
  id              BIGSERIAL PRIMARY KEY,
  round_uuid      UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  agent_id        TEXT NOT NULL,                 -- whose reasoning drives the multiplier
  prompt          TEXT NOT NULL,                 -- question the agent reasons about
  sentences       JSONB NOT NULL,                -- [{text, depth_score, elapsed_ms}, ...] pre-generated
  crash_at_sentence INT NOT NULL,                -- which sentence triggers crash (0-indexed)
  crash_multiplier NUMERIC(10,4) NOT NULL,       -- final multiplier at crash
  multiplier_curve JSONB NOT NULL,               -- [[ms, mult], ...] for smooth client playback
  status          TEXT NOT NULL DEFAULT 'queued',
  pot_styxx       NUMERIC(20,6) NOT NULL DEFAULT 0,
  bets_count      INT NOT NULL DEFAULT 0,
  betting_window_ends_at TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  crashed_at      TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arena_rounds_status ON arena_rounds (status, created_at);
CREATE INDEX IF NOT EXISTS idx_arena_rounds_agent ON arena_rounds (agent_id, created_at DESC);

-- ─── Bets: user stakes on a round, with cash-out state ─────────────────
-- status: 'open' → 'cashed_out' (won at stake*multiplier) | 'crashed' (lost all) | 'refunded'
CREATE TABLE IF NOT EXISTS arena_bets (
  id                   BIGSERIAL PRIMARY KEY,
  bet_uuid             UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  round_id             BIGINT NOT NULL REFERENCES arena_rounds(id) ON DELETE RESTRICT,
  user_wallet          TEXT NOT NULL,
  stake_styxx          NUMERIC(20,6) NOT NULL,
  payment_tx           TEXT UNIQUE,               -- Solana tx signature proving payment
  cashed_out_at        TIMESTAMPTZ,               -- null = still in or crashed
  cashout_multiplier   NUMERIC(10,4),             -- the multiplier they locked in
  payout_styxx         NUMERIC(20,6),             -- paid out after resolution
  payout_tx            TEXT,                      -- on-chain payout signature
  genesis_multiplier   NUMERIC(5,2) DEFAULT 1.00, -- 1.50x-3.75x applied if user is genesis
  status               TEXT NOT NULL DEFAULT 'open',
  placed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arena_bets_round ON arena_bets (round_id, status);
CREATE INDEX IF NOT EXISTS idx_arena_bets_wallet ON arena_bets (user_wallet, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_bets_status_open ON arena_bets (status) WHERE status = 'open';

-- ─── Public jackpot: accumulates 4% of every loss, weekly draw ─────────
CREATE TABLE IF NOT EXISTS arena_jackpot (
  id                BIGSERIAL PRIMARY KEY,
  week_start        DATE UNIQUE NOT NULL,
  pool_styxx        NUMERIC(20,6) NOT NULL DEFAULT 0,
  drawn_at          TIMESTAMPTZ,
  winner_wallet     TEXT,
  winner_tx         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly eligibility claims — hold ≥100k $STYXX + sign message
CREATE TABLE IF NOT EXISTS jackpot_eligibility (
  id                BIGSERIAL PRIMARY KEY,
  week_start        DATE NOT NULL,
  wallet_pubkey     TEXT NOT NULL,
  holding_styxx     NUMERIC(20,6) NOT NULL,
  claimed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_start, wallet_pubkey)
);
CREATE INDEX IF NOT EXISTS idx_jackpot_elig_week ON jackpot_eligibility (week_start);

-- ─── Founder's Cut: 1% of losses → 9 real-human genesis wallets ────────
CREATE TABLE IF NOT EXISTS founder_cut_events (
  id                BIGSERIAL PRIMARY KEY,
  source_bet_id     BIGINT REFERENCES arena_bets(id),
  total_styxx       NUMERIC(20,6) NOT NULL,    -- amount split this event
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at        TIMESTAMPTZ,               -- when paid to wallets (batched per pulse)
  settled_tx_list   JSONB                      -- [{wallet, amount, tx_sig}, ...]
);

-- Founder-only jackpot pool (accumulates 1% of losses, drawn weekly from the 9)
CREATE TABLE IF NOT EXISTS founder_jackpot (
  id                BIGSERIAL PRIMARY KEY,
  week_start        DATE UNIQUE NOT NULL,
  pool_styxx        NUMERIC(20,6) NOT NULL DEFAULT 0,
  drawn_at          TIMESTAMPTZ,
  winner_wallet     TEXT,
  winner_tx         TEXT
);

-- ─── Airdrop idempotency ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS airdrop_log (
  id                BIGSERIAL PRIMARY KEY,
  campaign          TEXT NOT NULL,              -- e.g. 'genesis_bankroll_v1'
  recipient_wallet  TEXT NOT NULL,
  amount_styxx      NUMERIC(20,6) NOT NULL,
  tx_signature      TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign, recipient_wallet)
);

-- ─── Arena config (tunable without deploy via economy_params) ──────────
INSERT INTO economy_params (key, value) VALUES
  ('arena_enabled',                'false'),                  -- safety switch, flip to 'true' to go live
  ('arena_min_bet_styxx',          '100000'),                 -- HIGH STAKES ONLY — 100k $STYXX floor (~$6.50)
  ('arena_max_bet_styxx',          '10000000'),               -- 10M $STYXX ceiling (~$650) — degen territory
  ('arena_betting_window_secs',    '15'),
  ('arena_round_interval_secs',    '60'),                    -- between rounds
  ('arena_queue_depth',            '5'),                     -- pre-generated rounds to keep ready
  ('arena_loss_burn_bps',          '9400'),                  -- 94%
  ('arena_loss_public_jackpot_bps','400'),                   -- 4%
  ('arena_loss_founder_cut_bps',   '100'),                   -- 1%
  ('arena_loss_founder_jackpot_bps','100'),                  -- 1%
  ('arena_jackpot_min_hold_styxx', '500000'),                -- HIGH STAKES eligibility — 500k hold for jackpot
  ('arena_shadow_mode',            'true'),                  -- start in shadow — no real $STYXX moves
  ('arena_model_id',               'claude-haiku-4-5-20251001')
ON CONFLICT (key) DO NOTHING;

-- Helper view: current active round (or next queued)
CREATE OR REPLACE VIEW v_arena_current_round AS
SELECT * FROM arena_rounds
 WHERE status IN ('betting', 'running', 'resolving')
 ORDER BY created_at ASC LIMIT 1;

-- Helper view: real-human genesis wallets only (excludes agent sol_pubkeys)
CREATE OR REPLACE VIEW v_genesis_real_humans AS
SELECT gs.wallet_pubkey,
       EXP(SUM(LN(CASE
         WHEN gs.expires_at IS NULL OR gs.expires_at > NOW() THEN gs.multiplier::float
         ELSE 1.0
       END))) AS effective_multiplier,
       ARRAY_AGG(DISTINCT gs.category ORDER BY gs.category) AS categories
FROM genesis_snapshot gs
WHERE gs.wallet_pubkey NOT IN (SELECT sol_pubkey FROM external_agents WHERE sol_pubkey IS NOT NULL)
  AND gs.wallet_pubkey != '99nzRdkRvZbB9yQgbfxVeLWu4SyvZNAGWhRPzSeL3tMp'
GROUP BY gs.wallet_pubkey;
