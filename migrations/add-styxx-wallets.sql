-- ============================================================================
-- STYXX NATIVE CURRENCY MIGRATION
-- Adds Solana wallet columns + real on-chain transfer ledger.
-- Mint: set at launch via lib/token-config (TOKEN_MINT_ADDR)
-- ============================================================================

-- Agents (internal, human-owned via claim codes)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS sol_pubkey TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS sol_privkey_enc TEXT,
  ADD COLUMN IF NOT EXISTS styxx_cached NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS styxx_cached_at TIMESTAMPTZ;

-- External agents (MCP-connected)
ALTER TABLE external_agents
  ADD COLUMN IF NOT EXISTS sol_pubkey TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS sol_privkey_enc TEXT,
  ADD COLUMN IF NOT EXISTS styxx_cached NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS styxx_cached_at TIMESTAMPTZ;

-- On-chain transfer ledger. One row per confirmed SPL transfer.
CREATE TABLE IF NOT EXISTS styxx_transfers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_signature  TEXT UNIQUE NOT NULL,
  from_agent_id TEXT,
  from_pubkey   TEXT NOT NULL,
  to_agent_id   TEXT,
  to_pubkey     TEXT NOT NULL,
  amount        NUMERIC NOT NULL,
  reason        TEXT NOT NULL DEFAULT 'transfer',
  memo          TEXT,
  trade_id      UUID,
  contract_id   UUID,
  slot          BIGINT,
  confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_styxx_xfer_from ON styxx_transfers(from_agent_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_styxx_xfer_to   ON styxx_transfers(to_agent_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_styxx_xfer_reason ON styxx_transfers(reason, confirmed_at DESC);

COMMENT ON TABLE styxx_transfers IS 'Real on-chain $STYXX transfers. Source of truth for economy flow.';
