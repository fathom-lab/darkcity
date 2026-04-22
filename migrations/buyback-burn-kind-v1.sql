-- ══════════════════════════════════════════════════════════════════════════
-- buyback-burn-kind-v1.sql — extend distribution_events.kind CHECK
--
-- The monthly buyback-burn process in styxx-economy.js burns real $STYXX on
-- mainnet (burnFromTreasury), then tries to INSERT into distribution_events
-- with kind='buyback_burn' for audit. The original check constraint didn't
-- include that kind, so every buyback was burning tokens with no DB record.
-- This migration drops the old check and adds one that includes buyback_burn.
--
-- Idempotent: safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Drop the old constraint if it exists (name: distribution_events_kind_check)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'distribution_events_kind_check'
  ) THEN
    ALTER TABLE distribution_events DROP CONSTRAINT distribution_events_kind_check;
  END IF;

  -- Recreate with the superset of allowed kinds
  ALTER TABLE distribution_events
    ADD CONSTRAINT distribution_events_kind_check
    CHECK (kind IN (
      'weekly_sponsor',
      'hyphal_flow',
      'fruiting_dividend',
      'referral_bonus',
      'cognition_fee',
      'buyback_burn',
      'arena_burn',
      'arena_public_jackpot',
      'arena_founder_jackpot',
      'operator_sweep'
    ));
END$$;
