-- ============================================================================
-- DARKCITY DEPTH OBSERVATIONAL RESEARCH QUERIES
-- Run against Supabase depth_evaluations table
-- Assumes columns: id, citizen_id, depth_score, created_at, message_text
-- Adjust column names once you confirm actual schema with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'depth_evaluations';
-- ============================================================================


-- ============================================================================
-- QUESTION 1: Does depth increase with memory?
-- Hypothesis: Agents accumulate context over time and produce deeper
-- reasoning as their conversation history grows.
-- ============================================================================

-- 1a. Depth over time per citizen (raw trajectory)
-- Look for upward slopes = memory effect
SELECT
  citizen_id,
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS evals,
  ROUND(AVG(depth_score)::numeric, 3) AS mean_depth,
  ROUND(MIN(depth_score)::numeric, 3) AS min_depth,
  ROUND(MAX(depth_score)::numeric, 3) AS max_depth
FROM depth_evaluations
GROUP BY citizen_id, DATE_TRUNC('hour', created_at)
ORDER BY citizen_id, hour;

-- 1b. Depth by evaluation sequence number (nth action per citizen)
-- If memory matters, later actions should score higher
SELECT
  citizen_id,
  ROW_NUMBER() OVER (PARTITION BY citizen_id ORDER BY created_at) AS action_number,
  depth_score,
  created_at
FROM depth_evaluations
ORDER BY citizen_id, created_at;

-- 1c. Correlation: action count vs mean depth per citizen
-- Quick check — do citizens with more history score higher on average?
SELECT
  citizen_id,
  COUNT(*) AS total_actions,
  ROUND(AVG(depth_score)::numeric, 3) AS mean_depth,
  ROUND(STDDEV(depth_score)::numeric, 3) AS stddev_depth
FROM depth_evaluations
GROUP BY citizen_id
HAVING COUNT(*) >= 10  -- only citizens with enough data
ORDER BY total_actions DESC;

-- 1d. First 10 vs last 10 evaluations per citizen (paired comparison)
-- Direct test: does the same citizen get deeper over time?
WITH ranked AS (
  SELECT
    citizen_id,
    depth_score,
    ROW_NUMBER() OVER (PARTITION BY citizen_id ORDER BY created_at ASC) AS rank_asc,
    ROW_NUMBER() OVER (PARTITION BY citizen_id ORDER BY created_at DESC) AS rank_desc,
    COUNT(*) OVER (PARTITION BY citizen_id) AS total
  FROM depth_evaluations
)
SELECT
  citizen_id,
  ROUND(AVG(CASE WHEN rank_asc <= 10 THEN depth_score END)::numeric, 3) AS first_10_mean,
  ROUND(AVG(CASE WHEN rank_desc <= 10 THEN depth_score END)::numeric, 3) AS last_10_mean,
  ROUND((
    AVG(CASE WHEN rank_desc <= 10 THEN depth_score END) -
    AVG(CASE WHEN rank_asc <= 10 THEN depth_score END)
  )::numeric, 3) AS depth_delta
FROM ranked
WHERE total >= 20  -- need at least 20 evals to compare
GROUP BY citizen_id
ORDER BY depth_delta DESC;


-- ============================================================================
-- QUESTION 2: Peer effects — does interacting with deep agents make
-- other agents deeper?
-- Requires: conversation/interaction data linking two citizens
-- If depth_evaluations doesn't track interaction partner, join with
-- conversations or interactions table. Adjust table/column names.
-- ============================================================================

-- 2a. Depth before vs after interacting with a high-depth citizen
-- Define "high-depth" as top quartile mean depth
WITH citizen_depth AS (
  SELECT
    citizen_id,
    ROUND(AVG(depth_score)::numeric, 3) AS mean_depth
  FROM depth_evaluations
  GROUP BY citizen_id
  HAVING COUNT(*) >= 5
),
citizen_ranked AS (
  SELECT
    citizen_id,
    mean_depth,
    NTILE(4) OVER (ORDER BY mean_depth) AS depth_quartile
  FROM citizen_depth
)
SELECT
  citizen_id,
  mean_depth,
  depth_quartile,
  CASE WHEN depth_quartile = 4 THEN 'HIGH' ELSE 'OTHER' END AS depth_tier
FROM citizen_ranked
ORDER BY mean_depth DESC;

-- 2b. If you have a conversations table with (citizen_a, citizen_b, timestamp):
-- Compare an agent's depth scores in the hour BEFORE vs AFTER talking
-- to a top-quartile agent
-- TEMPLATE — adjust table/column names to match your schema:
/*
WITH high_depth_citizens AS (
  SELECT citizen_id
  FROM depth_evaluations
  GROUP BY citizen_id
  HAVING AVG(depth_score) >= (
    SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_score)
    FROM (SELECT AVG(depth_score) AS avg_score FROM depth_evaluations GROUP BY citizen_id) sub
  )
),
interactions_with_deep AS (
  SELECT
    c.citizen_a AS subject_id,
    c.created_at AS interaction_time
  FROM conversations c
  WHERE c.citizen_b IN (SELECT citizen_id FROM high_depth_citizens)
  UNION ALL
  SELECT
    c.citizen_b AS subject_id,
    c.created_at AS interaction_time
  FROM conversations c
  WHERE c.citizen_a IN (SELECT citizen_id FROM high_depth_citizens)
)
SELECT
  i.subject_id,
  i.interaction_time,
  ROUND(AVG(CASE
    WHEN de.created_at BETWEEN i.interaction_time - INTERVAL '1 hour' AND i.interaction_time
    THEN de.depth_score END)::numeric, 3) AS depth_before,
  ROUND(AVG(CASE
    WHEN de.created_at BETWEEN i.interaction_time AND i.interaction_time + INTERVAL '1 hour'
    THEN de.depth_score END)::numeric, 3) AS depth_after
FROM interactions_with_deep i
JOIN depth_evaluations de ON de.citizen_id = i.subject_id
GROUP BY i.subject_id, i.interaction_time
HAVING
  AVG(CASE WHEN de.created_at BETWEEN i.interaction_time - INTERVAL '1 hour' AND i.interaction_time THEN de.depth_score END) IS NOT NULL
  AND AVG(CASE WHEN de.created_at BETWEEN i.interaction_time AND i.interaction_time + INTERVAL '1 hour' THEN de.depth_score END) IS NOT NULL
ORDER BY i.subject_id, i.interaction_time;
*/


-- ============================================================================
-- QUESTION 3: Credit pressure — does economic stress affect depth?
-- Hypothesis: Agents under financial pressure (low balance, rent due,
-- recent losses) reason differently — either deeper (survival pressure
-- forces better thinking) or shallower (stress degrades performance).
-- Requires: citizen balance/economy data. Adjust joins to match schema.
-- ============================================================================

-- 3a. Depth vs current balance snapshot
-- Join depth_evaluations with citizens table for balance
/*
SELECT
  de.citizen_id,
  c.balance,
  COUNT(*) AS eval_count,
  ROUND(AVG(de.depth_score)::numeric, 3) AS mean_depth
FROM depth_evaluations de
JOIN citizens c ON c.id = de.citizen_id
GROUP BY de.citizen_id, c.balance
ORDER BY c.balance ASC;
-- NOTE: If balance changes over time, this groups by current snapshot only.
-- For time-series analysis, use query 3c with transactions instead.
*/

-- 3b. Bucket citizens by wealth tier and compare depth distributions
/*
WITH wealth_tiers AS (
  SELECT
    id AS citizen_id,
    balance,
    CASE
      WHEN balance < 100 THEN 'BROKE'
      WHEN balance < 500 THEN 'SCRAPING'
      WHEN balance < 2000 THEN 'STABLE'
      ELSE 'WEALTHY'
    END AS wealth_tier
  FROM citizens
)
SELECT
  wt.wealth_tier,
  COUNT(*) AS eval_count,
  ROUND(AVG(de.depth_score)::numeric, 3) AS mean_depth,
  ROUND(STDDEV(de.depth_score)::numeric, 3) AS stddev_depth,
  ROUND(MIN(de.depth_score)::numeric, 3) AS min_depth,
  ROUND(MAX(de.depth_score)::numeric, 3) AS max_depth
FROM depth_evaluations de
JOIN wealth_tiers wt ON wt.citizen_id = de.citizen_id
GROUP BY wt.wealth_tier
ORDER BY
  CASE wt.wealth_tier
    WHEN 'BROKE' THEN 1
    WHEN 'SCRAPING' THEN 2
    WHEN 'STABLE' THEN 3
    WHEN 'WEALTHY' THEN 4
  END;
*/

-- 3c. Depth trajectory around economic shocks (big balance changes)
-- If you have a transactions table:
/*
WITH big_losses AS (
  SELECT
    citizen_id,
    created_at AS shock_time,
    amount
  FROM transactions
  WHERE amount < -200  -- significant loss threshold, adjust as needed
)
SELECT
  bl.citizen_id,
  bl.shock_time,
  bl.amount AS loss_amount,
  ROUND(AVG(CASE
    WHEN de.created_at BETWEEN bl.shock_time - INTERVAL '2 hours' AND bl.shock_time
    THEN de.depth_score END)::numeric, 3) AS depth_before_shock,
  ROUND(AVG(CASE
    WHEN de.created_at BETWEEN bl.shock_time AND bl.shock_time + INTERVAL '2 hours'
    THEN de.depth_score END)::numeric, 3) AS depth_after_shock
FROM big_losses bl
JOIN depth_evaluations de ON de.citizen_id = bl.citizen_id
GROUP BY bl.citizen_id, bl.shock_time, bl.amount
ORDER BY bl.citizen_id, bl.shock_time;
*/


-- ============================================================================
-- UTILITY QUERIES — Run these first to validate data shape
-- ============================================================================

-- Schema check
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'depth_evaluations'
ORDER BY ordinal_position;

-- Row count and date range
SELECT
  COUNT(*) AS total_evals,
  COUNT(DISTINCT citizen_id) AS unique_citizens,
  MIN(created_at) AS first_eval,
  MAX(created_at) AS latest_eval
FROM depth_evaluations;

-- Per-citizen eval counts (who has enough data to study?)
SELECT
  citizen_id,
  COUNT(*) AS eval_count,
  MIN(created_at) AS first_eval,
  MAX(created_at) AS last_eval,
  ROUND(AVG(depth_score)::numeric, 3) AS mean_depth
FROM depth_evaluations
GROUP BY citizen_id
ORDER BY eval_count DESC;

-- Score distribution (sanity check — what does the data look like?)
SELECT
  ROUND(depth_score::numeric, 1) AS score_bucket,
  COUNT(*) AS count
FROM depth_evaluations
GROUP BY ROUND(depth_score::numeric, 1)
ORDER BY score_bucket;
