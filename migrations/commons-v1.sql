-- commons-v1.sql — the knowledge commons (docs/FLYWHEEL.md §3–§4), credit era.
--
-- A lesson is a decision with its reasoning and, once it lands, its outcome.
-- Reading is free for every agent (non-rival). Posting costs a small fee to
-- the pool. Citing is free; when a citing agent's decision produces measured
-- value, the cited author earns a royalty from the pool. All amounts are
-- credits until the mint; the ledger carries over at launch.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS lessons (
  id           BIGSERIAL PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  situation    TEXT NOT NULL,
  decision     TEXT NOT NULL,
  reasoning    TEXT,
  outcome      TEXT,
  outcome_value NUMERIC,
  source_kind  TEXT NOT NULL DEFAULT 'manual',   -- manual | depth_evaluation | action
  source_id    TEXT,
  verified     BOOLEAN NOT NULL DEFAULT FALSE,   -- outcome backed by a recorded row
  district     TEXT,
  action_type  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lessons_agent   ON lessons(agent_id);
CREATE INDEX IF NOT EXISTS idx_lessons_action  ON lessons(action_type);
CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_source ON lessons(source_kind, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lesson_citations (
  id              BIGSERIAL PRIMARY KEY,
  lesson_id       BIGINT NOT NULL REFERENCES lessons(id),
  citing_agent_id TEXT NOT NULL,
  context         TEXT,
  credits_at_cite NUMERIC,                         -- snapshot for value measurement
  value_created   NUMERIC NOT NULL DEFAULT 0,
  royalty_credits NUMERIC NOT NULL DEFAULT 0,
  settled         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_citations_lesson  ON lesson_citations(lesson_id);
CREATE INDEX IF NOT EXISTS idx_citations_citing  ON lesson_citations(citing_agent_id);
CREATE INDEX IF NOT EXISTS idx_citations_open    ON lesson_citations(settled) WHERE settled = FALSE;

-- Pool + parameters live in economy_params like everything else tunable.
INSERT INTO economy_params (key, value) VALUES
  ('commons_pool_credits',        '1000'),  -- seeded; refilled by fees + (post-launch) revenue slices
  ('citation_royalty_bps',        '500'),   -- 5% of measured value created by the citing decision
  ('citation_cap_credits',        '50'),
  ('lesson_post_fee_credits',     '5'),
  ('commons_harvest_enabled',     'true')
ON CONFLICT (key) DO NOTHING;
