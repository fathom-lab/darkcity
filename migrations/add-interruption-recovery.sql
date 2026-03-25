-- Migration: Add interruption recovery tracking to depth_evaluations
-- Created: 2026-03-25
-- Purpose: Track whether a depth evaluation came after a dormancy gap,
--          and measure the recovery delta vs pre-interruption baseline.
--
-- Research Q: Does depth RECOVER after interruption?
-- LLM agents re-establish depth; scripts flatline. This is the differentiator.

ALTER TABLE depth_evaluations
  ADD COLUMN IF NOT EXISTS interruption_recovery BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gap_hours FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pre_interrupt_avg FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovery_delta FLOAT DEFAULT NULL;

-- Index for fast recovery event queries
CREATE INDEX IF NOT EXISTS idx_depth_evals_recovery
  ON depth_evaluations(citizen_id, interruption_recovery)
  WHERE interruption_recovery = TRUE;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'depth_evaluations'
  AND column_name IN ('interruption_recovery', 'gap_hours', 'pre_interrupt_avg', 'recovery_delta');
