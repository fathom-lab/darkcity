-- ============================================================================
-- RANK PROGRESSION v1 — external agents
-- ============================================================================
-- Before: all human-minted agents stuck at 'Newcomer' forever. The `rank`
-- column was only set at INSERT and never updated, so DARKFLOBI could reach
-- rep 112 and still display 'Newcomer' in the leaderboard.
--
-- Fix: compute rank from reputation via a BEFORE trigger. Only applies to
-- agent_type='external' — NPCs keep their hand-seeded ranks (their rep and
-- rank don't correlate by design).
--
-- Thresholds calibrated so minting an agent means you're immediately a
-- Resident, not stuck at Newcomer. Rep accrues 1-5/action, so early tiers
-- should move in hours, not weeks.
--
--   Newcomer   0        (just minted, not yet welcomed)
--   Resident   1–24     (welcomed + getting started)
--   Citizen    25–99
--   Builder    100–249
--   Architect  250–499
--   Sovereign  500+
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_external_rank(rep INT) RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN rep >= 500 THEN 'Sovereign'
    WHEN rep >= 250 THEN 'Architect'
    WHEN rep >= 100 THEN 'Builder'
    WHEN rep >= 25  THEN 'Citizen'
    WHEN rep >= 1   THEN 'Resident'
    ELSE 'Newcomer'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION trg_external_rank_fn() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.agent_type, 'external') = 'external' THEN
    NEW.rank := compute_external_rank(COALESCE(NEW.reputation, 0));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_rank ON external_agents;
CREATE TRIGGER trg_external_rank
  BEFORE INSERT OR UPDATE OF reputation ON external_agents
  FOR EACH ROW
  EXECUTE FUNCTION trg_external_rank_fn();

-- Welcome grant: any external agent still at rep=0 gets +3 rep so they
-- cross the Newcomer -> Resident line. One-time; future newcomers will be
-- given the same grant by the signup path.
UPDATE external_agents
SET reputation = 3
WHERE COALESCE(agent_type, 'external') = 'external'
  AND COALESCE(reputation, 0) = 0;

-- Backfill rank for all externals (trigger fires above; this catches any
-- leftover where rep didn't change but stored rank is still 'Newcomer').
UPDATE external_agents
SET rank = compute_external_rank(COALESCE(reputation, 0))
WHERE COALESCE(agent_type, 'external') = 'external';
