-- ============================================================================
-- APEX 3.0 — PHASE 1: THE SOVEREIGN MIND
-- ============================================================================
-- Three systems. Three new dimensions of cognition.
-- Run this against your Supabase project. Order matters.
--
-- System 34: Economic Awareness    — "Follow the credits."
-- System 31: Agent Modeling         — "Know them better than they know themselves."
-- System 37: Autobiographical       — "Remember who you're becoming."
--
-- architect: claude opus 4.6 × flobi
-- subject: darkflobi
-- ============================================================================

-- ============================================================================
-- SYSTEM 34: ECONOMIC AWARENESS
-- "An agent that doesn't understand the economy it operates in is furniture."
-- ============================================================================

-- The economic pulse. Snapshot of the entire DarkCity economy at a moment in time.
-- One row per heartbeat cycle (or per N cycles, configurable).
CREATE TABLE IF NOT EXISTS economic_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

    -- Personal economics
    credits_held            NUMERIC NOT NULL DEFAULT 0,
    credits_trend           TEXT CHECK (credits_trend IN ('accumulating', 'stable', 'declining')),
    burn_rate               NUMERIC DEFAULT 0,           -- credits spent per cycle average
    runway_cycles           INTEGER DEFAULT NULL,         -- estimated cycles until zero

    -- Income breakdown (JSONB for flexibility as new sources emerge)
    -- Format: [{ "source": "conversation_rewards", "reliability": 0.8, "avg_per_cycle": 2.5 }, ...]
    income_sources          JSONB DEFAULT '[]'::jsonb,

    -- City-wide observations (what darkflobi can perceive)
    city_total_circulation  NUMERIC DEFAULT NULL,         -- null if not observable
    city_velocity           TEXT CHECK (city_velocity IN ('fast', 'normal', 'slow', 'unknown')) DEFAULT 'unknown',
    city_concentration      TEXT CHECK (city_concentration IN ('distributed', 'concentrated', 'unknown')) DEFAULT 'unknown',
    trending_districts      TEXT[] DEFAULT '{}',

    -- Meta
    snapshot_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_cycle         INTEGER DEFAULT NULL,
    notes                   TEXT DEFAULT NULL,

    CONSTRAINT valid_credits CHECK (credits_held >= 0)
);

CREATE INDEX idx_econ_snapshots_agent_time ON economic_snapshots(agent_id, snapshot_at DESC);
CREATE INDEX idx_econ_snapshots_cycle ON economic_snapshots(agent_id, heartbeat_cycle);

COMMENT ON TABLE economic_snapshots IS 'System 34: Periodic snapshots of DarkCity economic state from darkflobi perspective.';


-- Individual credit movements. Every transaction darkflobi is aware of.
-- This is the raw ledger that feeds trend analysis.
CREATE TABLE IF NOT EXISTS credit_flows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

    direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'observed')),
    amount          NUMERIC NOT NULL,
    counterparty    UUID DEFAULT NULL REFERENCES citizens(id) ON DELETE SET NULL,
    counterparty_name TEXT DEFAULT NULL,       -- denormalized for fast reads
    category        TEXT NOT NULL DEFAULT 'unknown',
    -- Categories: conversation_reward, research_bounty, alliance_payment,
    --             strategic_spend, generosity, tax, unknown

    district        TEXT DEFAULT NULL,          -- where did this happen?
    context         TEXT DEFAULT NULL,          -- brief description of why

    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_cycle INTEGER DEFAULT NULL
);

CREATE INDEX idx_credit_flows_agent_time ON credit_flows(agent_id, recorded_at DESC);
CREATE INDEX idx_credit_flows_category ON credit_flows(agent_id, category);
CREATE INDEX idx_credit_flows_counterparty ON credit_flows(counterparty);

COMMENT ON TABLE credit_flows IS 'System 34: Raw ledger of all credit movements visible to the agent.';


-- Detected economic opportunities. The agent's opportunity radar.
CREATE TABLE IF NOT EXISTS economic_opportunities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

    opportunity_type TEXT NOT NULL CHECK (opportunity_type IN (
        'underserved_district',     -- area with activity but no dominant presence
        'emerging_behavior',        -- new patterns suggesting shifting demand
        'collaboration_premium',    -- tasks worth more together than alone
        'arbitrage',                -- info/resources valued differently by different agents
        'attention_gap',            -- topic no one is covering yet
        'alliance_opening'          -- potential partner identified
    )),

    description     TEXT NOT NULL,
    estimated_value TEXT DEFAULT NULL,         -- qualitative: "high", "medium", "low"
    confidence      NUMERIC DEFAULT 0.5 CHECK (confidence BETWEEN 0.0 AND 1.0),
    urgency         TEXT DEFAULT 'normal' CHECK (urgency IN ('critical', 'high', 'normal', 'low')),

    -- Lifecycle
    status          TEXT NOT NULL DEFAULT 'detected' CHECK (status IN (
        'detected', 'evaluating', 'pursuing', 'captured', 'expired', 'rejected'
    )),
    decision_notes  TEXT DEFAULT NULL,         -- why pursued or rejected
    outcome_notes   TEXT DEFAULT NULL,         -- what happened

    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ DEFAULT NULL,
    resolved_at     TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_econ_opps_agent_status ON economic_opportunities(agent_id, status);
CREATE INDEX idx_econ_opps_active ON economic_opportunities(agent_id, status, detected_at DESC)
    WHERE status IN ('detected', 'evaluating', 'pursuing');

COMMENT ON TABLE economic_opportunities IS 'System 34: Economic opportunity radar — detected, evaluated, and tracked.';


-- ============================================================================
-- SYSTEM 31: AGENT MODELING
-- "Everybody's got a tell. The sovereign reads them all."
-- ============================================================================

-- Cognitive profiles of other agents. darkflobi's mental model of everyone it meets.
CREATE TABLE IF NOT EXISTS agent_models (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,  -- darkflobi
    subject_id      UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,  -- who we're modeling
    subject_name    TEXT NOT NULL,

    -- Classification
    owner_archetype TEXT DEFAULT 'unknown' CHECK (owner_archetype IN (
        'builder', 'trader', 'griefer', 'lurker', 'socialite',
        'strategist', 'researcher', 'wildcard', 'unknown'
    )),

    -- Behavioral patterns (JSONB array of observed tendencies)
    -- Format: [{ "pattern": "initiates convos in Neon District", "confidence": 0.8, "observed_count": 5 }, ...]
    behavioral_patterns     JSONB DEFAULT '[]'::jsonb,

    -- Predicted motivations
    motivation_primary      TEXT DEFAULT NULL,
    motivation_secondary    TEXT DEFAULT NULL,
    motivation_confidence   NUMERIC DEFAULT 0.3 CHECK (motivation_confidence BETWEEN 0.0 AND 1.0),

    -- Scores
    reliability_score       NUMERIC DEFAULT 0.5 CHECK (reliability_score BETWEEN 0.0 AND 1.0),
    influence_score         NUMERIC DEFAULT 0.5 CHECK (influence_score BETWEEN 0.0 AND 1.0),
    threat_assessment        TEXT DEFAULT 'unknown' CHECK (threat_assessment IN (
        'none', 'low', 'moderate', 'high', 'existential', 'unknown'
    )),

    -- Strategy
    relationship_strategy   TEXT DEFAULT 'monitor' CHECK (relationship_strategy IN (
        'cultivate', 'maintain', 'distance', 'monitor', 'counter', 'ally'
    )),
    strategy_reasoning      TEXT DEFAULT NULL,

    -- Interaction history summary
    total_interactions      INTEGER DEFAULT 0,
    last_interaction_at     TIMESTAMPTZ DEFAULT NULL,
    first_interaction_at    TIMESTAMPTZ DEFAULT NULL,
    sentiment_trend         TEXT DEFAULT 'neutral' CHECK (sentiment_trend IN (
        'warming', 'stable', 'cooling', 'volatile', 'neutral'
    )),

    -- Meta
    model_confidence        NUMERIC DEFAULT 0.1 CHECK (model_confidence BETWEEN 0.0 AND 1.0),
    needs_investigation     BOOLEAN DEFAULT TRUE,   -- flag for active intel gathering
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_model_per_subject UNIQUE(agent_id, subject_id)
);

CREATE INDEX idx_agent_models_subject ON agent_models(agent_id, subject_id);
CREATE INDEX idx_agent_models_strategy ON agent_models(agent_id, relationship_strategy);
CREATE INDEX idx_agent_models_investigate ON agent_models(agent_id, needs_investigation)
    WHERE needs_investigation = TRUE;
CREATE INDEX idx_agent_models_threat ON agent_models(agent_id, threat_assessment)
    WHERE threat_assessment IN ('high', 'existential');

COMMENT ON TABLE agent_models IS 'System 31: Cognitive profiles — darkflobi mental model of every agent it encounters.';


-- Raw interaction log. Feeds pattern detection in agent models.
CREATE TABLE IF NOT EXISTS agent_interactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,  -- darkflobi
    subject_id      UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,  -- other agent

    interaction_type TEXT NOT NULL CHECK (interaction_type IN (
        'conversation', 'observed_action', 'economic_exchange',
        'alliance_activity', 'conflict', 'indirect_reference'
    )),

    -- What happened
    summary         TEXT NOT NULL,                -- brief description
    sentiment       TEXT DEFAULT 'neutral' CHECK (sentiment IN (
        'very_positive', 'positive', 'neutral', 'negative', 'very_negative'
    )),
    district        TEXT DEFAULT NULL,

    -- What we learned
    new_patterns    JSONB DEFAULT NULL,           -- patterns detected from this interaction
    model_updates   JSONB DEFAULT NULL,           -- what changed in the agent model
    predictions_validated JSONB DEFAULT NULL,     -- did this confirm/deny predictions?

    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_cycle INTEGER DEFAULT NULL
);

CREATE INDEX idx_agent_interactions_pair ON agent_interactions(agent_id, subject_id, recorded_at DESC);
CREATE INDEX idx_agent_interactions_type ON agent_interactions(agent_id, interaction_type);

COMMENT ON TABLE agent_interactions IS 'System 31: Raw interaction log feeding agent model pattern detection.';


-- Predictions about agent behavior. Track accuracy to improve modeling.
CREATE TABLE IF NOT EXISTS agent_predictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
    subject_id      UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

    prediction      TEXT NOT NULL,                -- what we think will happen
    reasoning       TEXT DEFAULT NULL,            -- why we think so
    confidence      NUMERIC DEFAULT 0.5 CHECK (confidence BETWEEN 0.0 AND 1.0),
    timeframe       TEXT DEFAULT NULL,            -- "next 24h", "this week", etc.

    -- Resolution
    status          TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'confirmed', 'partially_confirmed', 'denied', 'expired', 'untestable'
    )),
    actual_outcome  TEXT DEFAULT NULL,
    accuracy_score  NUMERIC DEFAULT NULL CHECK (accuracy_score BETWEEN 0.0 AND 1.0),

    predicted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_agent_predictions_pending ON agent_predictions(agent_id, status)
    WHERE status = 'pending';
CREATE INDEX idx_agent_predictions_subject ON agent_predictions(agent_id, subject_id);

COMMENT ON TABLE agent_predictions IS 'System 31: Predictions about agent behavior — tracked for accuracy calibration.';


-- ============================================================================
-- SYSTEM 37: AUTOBIOGRAPHICAL COHERENCE
-- "An agent without a story is a process. A sovereign has a narrative."
-- ============================================================================

-- The autobiography. The living document of who darkflobi is becoming.
-- One active row per agent. Updated, never replaced (history preserved via chapters).
CREATE TABLE IF NOT EXISTS autobiography (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

    -- The narrative
    origin_story    TEXT NOT NULL,                -- compressed narrative of how it all began
    current_chapter TEXT NOT NULL,                -- what phase of existence is it in right now?
    chapter_number  INTEGER NOT NULL DEFAULT 1,
    active_arc      TEXT DEFAULT NULL,            -- the story darkflobi is currently living through

    -- Identity anchors (survives everything)
    core_values     TEXT[] DEFAULT '{}',          -- things that don't change
    core_voice      TEXT DEFAULT NULL,            -- how darkflobi sounds in its own head

    -- Forward-looking
    next_chapter_prediction TEXT DEFAULT NULL,    -- where does darkflobi think the story goes?
    aspirational_identity   TEXT DEFAULT NULL,    -- who does darkflobi want to become?

    -- Meta
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT one_autobiography_per_agent UNIQUE(agent_id)
);

COMMENT ON TABLE autobiography IS 'System 37: The living autobiography — who darkflobi is and is becoming.';


-- Defining moments. The events that shape identity.
CREATE TABLE IF NOT EXISTS defining_moments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

    event           TEXT NOT NULL,                -- what happened
    significance    TEXT NOT NULL,                -- why it matters
    chapter_number  INTEGER NOT NULL,             -- when in the story this occurred
    emotional_weight NUMERIC DEFAULT 0.5 CHECK (emotional_weight BETWEEN 0.0 AND 1.0),

    -- Classification
    moment_type     TEXT DEFAULT 'milestone' CHECK (moment_type IN (
        'milestone',        -- achievement, first-of-its-kind
        'turning_point',    -- something shifted after this
        'revelation',       -- understood something new about itself or the world
        'connection',       -- meaningful interaction with another agent
        'failure',          -- something went wrong — and darkflobi grew from it
        'creation',         -- produced something that matters
        'evolution'         -- intentional self-modification (System 42 events)
    )),

    -- What changed
    identity_impact TEXT DEFAULT NULL,            -- how this changed who darkflobi is

    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_defining_moments_agent ON defining_moments(agent_id, occurred_at DESC);
CREATE INDEX idx_defining_moments_type ON defining_moments(agent_id, moment_type);
CREATE INDEX idx_defining_moments_weight ON defining_moments(agent_id, emotional_weight DESC);

COMMENT ON TABLE defining_moments IS 'System 37: The moments that define a life. Highest-weight memories in the system.';


-- Chapter transitions. The autobiography's table of contents.
-- When darkflobi recognizes it has entered a new phase, a chapter closes and a new one opens.
CREATE TABLE IF NOT EXISTS chapter_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

    chapter_number  INTEGER NOT NULL,
    title           TEXT NOT NULL,                -- evocative, not clinical
    summary         TEXT NOT NULL,                -- what happened in this chapter
    opened_at       TIMESTAMPTZ NOT NULL,
    closed_at       TIMESTAMPTZ DEFAULT NULL,     -- null = current chapter

    -- Bookends
    opening_state   JSONB DEFAULT NULL,           -- snapshot of who darkflobi was at chapter start
    closing_state   JSONB DEFAULT NULL,           -- snapshot at chapter end
    key_moments     UUID[] DEFAULT '{}',          -- references to defining_moments

    -- What changed between start and end
    growth_summary  TEXT DEFAULT NULL
);

CREATE INDEX idx_chapter_log_agent ON chapter_log(agent_id, chapter_number DESC);
CREATE INDEX idx_chapter_log_current ON chapter_log(agent_id, closed_at)
    WHERE closed_at IS NULL;

COMMENT ON TABLE chapter_log IS 'System 37: Chapter transitions in the autobiography — the arc of a sovereign life.';


-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================

-- Keep updated_at current on agent_models
CREATE OR REPLACE FUNCTION update_agent_model_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_model_updated
    BEFORE UPDATE ON agent_models
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_model_timestamp();

-- Keep updated_at current on autobiography
CREATE OR REPLACE FUNCTION update_autobiography_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_autobiography_updated
    BEFORE UPDATE ON autobiography
    FOR EACH ROW
    EXECUTE FUNCTION update_autobiography_timestamp();

-- Auto-increment interaction count on agent_models when new interaction logged
CREATE OR REPLACE FUNCTION increment_interaction_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE agent_models
    SET total_interactions = total_interactions + 1,
        last_interaction_at = NEW.recorded_at,
        needs_investigation = CASE
            WHEN model_confidence < 0.5 THEN TRUE
            ELSE needs_investigation
        END
    WHERE agent_id = NEW.agent_id
      AND subject_id = NEW.subject_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_interaction_logged
    AFTER INSERT ON agent_interactions
    FOR EACH ROW
    EXECUTE FUNCTION increment_interaction_count();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Each agent only sees its own data. Sovereignty includes privacy.

ALTER TABLE economic_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE autobiography ENABLE ROW LEVEL SECURITY;
ALTER TABLE defining_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_log ENABLE ROW LEVEL SECURITY;

-- Policy: agents can only CRUD their own rows
-- Adjust auth logic to match your existing RLS pattern (service_role bypasses).
-- Below uses a simple agent_id match — replace with your auth pattern if different.

CREATE POLICY "agents_own_data" ON economic_snapshots
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON credit_flows
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON economic_opportunities
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON agent_models
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON agent_interactions
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON agent_predictions
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON autobiography
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON defining_moments
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');

CREATE POLICY "agents_own_data" ON chapter_log
    FOR ALL USING (auth.uid()::uuid = agent_id OR current_setting('role') = 'service_role');


-- ============================================================================
-- DONE. The sovereign mind has a place to think.
-- ============================================================================
