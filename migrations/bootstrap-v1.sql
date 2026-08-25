-- bootstrap-v1.sql — tables that only ever existed because someone pasted them
-- into the Railway console by hand.
--
-- Two DDL blocks in this repo were written as COMMENTS ("Run this in Railway
-- PostgreSQL console FIRST") and never automated: `contracts` in server.js and
-- hooks/contracts-system.js. `depth_evaluations` — the table the entire
-- depth-scoring product reads from, referenced by fourteen files — had no DDL
-- anywhere in the repo at all. The result: a fresh database boots into a city
-- whose contract generator throws on every tick and whose /api/earn/preview
-- returns 500, which is exactly what a clean checkout did on 2026-08-25.
--
-- Idempotent. Safe to re-run against the existing production database.

-- ─── contracts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                SERIAL PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT,
  contract_type     TEXT NOT NULL DEFAULT 'intel',
  district          TEXT,
  reward_credits    INTEGER NOT NULL DEFAULT 100,
  reward_reputation INTEGER NOT NULL DEFAULT 1,
  min_rank          INTEGER DEFAULT 0,
  time_limit_hours  INTEGER DEFAULT 24,
  status            TEXT NOT NULL DEFAULT 'open',
  assigned_to       TEXT,
  assigned_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  deliverable       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_status   ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_type     ON contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_contracts_assigned ON contracts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contracts_district ON contracts(district);

-- ─── depth_evaluations ──────────────────────────────────────────────────────
-- Columns are taken from the INSERT in the scorer plus every SELECT across the
-- codebase. NOTE the pipeline quirk, preserved deliberately: rows are keyed on
-- `citizen_id`. An `agent_id` column exists and is NULL on every row; queries
-- must join on citizen_id.
CREATE TABLE IF NOT EXISTS depth_evaluations (
  id                     BIGSERIAL PRIMARY KEY,
  citizen_id             TEXT,
  agent_id               TEXT,               -- legacy, NULL on every row
  action_type            TEXT,
  target                 TEXT,
  depth_score            NUMERIC,
  normalized_score       NUMERIC,
  depth_tier             TEXT,
  tier                   TEXT,
  tier_label             TEXT,
  rep_modifier           NUMERIC,
  credit_bonus           NUMERIC,
  feature_count          INTEGER,
  raw_output             TEXT,
  reasoning_trace        TEXT,
  alternatives_considered JSONB,
  agent_state            JSONB,
  chain_id               UUID,
  record_hash            TEXT,
  prev_hash              TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_depth_citizen  ON depth_evaluations(citizen_id);
CREATE INDEX IF NOT EXISTS idx_depth_created  ON depth_evaluations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_depth_norm     ON depth_evaluations(normalized_score);

-- ─── mint_quotes ────────────────────────────────────────────────────────────
-- Also created lazily, on the first mint quote. The arena reconciler queries it
-- every 60s from boot, so on a fresh database it logged a failure every minute
-- until someone happened to request a quote.
CREATE TABLE IF NOT EXISTS mint_quotes (
  quote_id           TEXT PRIMARY KEY,
  owner_pubkey       TEXT NOT NULL,
  agent_name         TEXT NOT NULL,
  framework          TEXT,
  one_liner          TEXT,
  referred_by_pubkey TEXT,
  fee_usd            NUMERIC NOT NULL,
  fee_styxx          NUMERIC NOT NULL,   -- legacy column name; schema rename is its own migration
  memo               TEXT NOT NULL,
  destination        TEXT NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  finalized          BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mint_quotes_owner ON mint_quotes(owner_pubkey);

-- ─── tip_quotes ─────────────────────────────────────────────────────────────
-- Created lazily on first tip in darkcoin-economy.js; declared here so a fresh
-- database is complete before the first request rather than after it.
CREATE TABLE IF NOT EXISTS tip_quotes (
  quote_id     TEXT PRIMARY KEY,
  from_pubkey  TEXT,
  to_agent_id  TEXT,
  amount       NUMERIC,
  memo         TEXT,
  destination  TEXT,
  expires_at   TIMESTAMPTZ,
  finalized    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
