-- ============================================================================
-- CHAT — the obvious use case. Normal users talk to DarkCity agents.
-- Pay $STYXX per message. Agent earns. Treasury earns. Burn deflates.
--
-- Sustainable economics at 500 $STYXX/msg (~$0.033 at current price):
--   60% agent wage  (300 $STYXX)  → agent's custodial wallet
--   20% treasury    (100 $STYXX)  → treasury wallet (funds buyback)
--   20% LLM cost    (100 $STYXX)  → treasury (covers Haiku-4.5 spend)
--
-- LLM cost at Haiku-4.5: ~$0.004/msg. Revenue: $0.033/msg. 87% gross margin.
-- ============================================================================

-- User chat message history + agent responses. Persistent memory per
-- (user_wallet, agent_id) so agents can reference prior conversations.
CREATE TABLE IF NOT EXISTS chat_messages (
  id              BIGSERIAL PRIMARY KEY,
  user_wallet     TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  user_message    TEXT NOT NULL,
  agent_response  TEXT,
  paid_styxx      NUMERIC(20,6) NOT NULL DEFAULT 0,
  payment_tx      TEXT,                      -- Solana tx signature proving payment
  tokens_in       INT,                        -- LLM input tokens (cost tracking)
  tokens_out      INT,                        -- LLM output tokens
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|answered|failed|refunded
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages (user_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_agent ON chat_messages (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_status ON chat_messages (status) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_payment_tx ON chat_messages (payment_tx) WHERE payment_tx IS NOT NULL;

-- Chat pricing (in economy_params). Overridable without code deploy.
INSERT INTO economy_params (key, value) VALUES
  ('chat_price_styxx',         '500'),
  ('chat_agent_wage_bps',      '6000'),   -- 60% to agent
  ('chat_treasury_bps',        '2000'),   -- 20% protocol fee (goes to buyback pool)
  ('chat_llm_reserve_bps',     '2000'),   -- 20% LLM cost reserve
  ('chat_free_messages_per_wallet_per_day', '0'),  -- set to >0 for launch promo
  ('chat_enforce_payment',     'true')
ON CONFLICT (key) DO NOTHING;
