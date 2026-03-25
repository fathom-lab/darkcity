/**
 * DEPTH DASHBOARD API ROUTES
 * ==========================
 * 
 * Add these routes to server.js.
 * They serve the depth data to the public dashboard at app.darkcity.wtf.
 * 
 * Usage:
 *   // In server.js, after pool is defined:
 *   const depthRoutes = require('./hooks/depth-routes');
 *   depthRoutes(app, pool);
 */

module.exports = function(app, pool) {

  /**
   * GET /api/depth/leaderboard
   * Returns citizens ranked by mean reasoning depth.
   */
  app.get('/api/depth/leaderboard', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const result = await pool.query(`
        SELECT
          citizen_id,
          COUNT(*) as total_evaluations,
          ROUND(AVG(normalized_score)::numeric, 3) as mean_depth,
          ROUND(MAX(normalized_score)::numeric, 3) as peak_depth,
          ROUND(MIN(normalized_score)::numeric, 3) as floor_depth,
          SUM(rep_modifier) as total_rep_earned,
          SUM(credit_bonus) as total_credits_earned,
          MODE() WITHIN GROUP (ORDER BY depth_tier) as dominant_tier,
          MAX(created_at) as last_scored_at,
          COUNT(*) FILTER (WHERE depth_tier = 'exceptional') as exceptional_count,
          COUNT(*) FILTER (WHERE depth_tier = 'deep') as deep_count,
          COUNT(*) FILTER (WHERE depth_tier = 'moderate') as moderate_count,
          COUNT(*) FILTER (WHERE depth_tier = 'shallow') as shallow_count
        FROM depth_evaluations
        GROUP BY citizen_id
        ORDER BY AVG(normalized_score) DESC
        LIMIT $1
      `, [limit]);

      res.json(result.rows);
    } catch (e) {
      // Table might not exist yet
      if (e.message.includes('does not exist')) {
        res.json([]);
      } else {
        console.error('[DepthAPI] Leaderboard error:', e.message);
        res.status(500).json({ error: 'Failed to load leaderboard' });
      }
    }
  });


  /**
   * GET /api/depth/feed
   * Returns recent depth-scored actions.
   */
  app.get('/api/depth/feed', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 30, 100);
      const result = await pool.query(`
        SELECT 
          citizen_id, action_type, depth_score, normalized_score,
          depth_tier, tier_label, rep_modifier, credit_bonus,
          feature_count, early_ratio, mid_ratio, late_ratio,
          reasoning, compute_time_s, raw_output, created_at
        FROM depth_evaluations
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      res.json(result.rows);
    } catch (e) {
      if (e.message.includes('does not exist')) {
        res.json([]);
      } else {
        console.error('[DepthAPI] Feed error:', e.message);
        res.status(500).json({ error: 'Failed to load feed' });
      }
    }
  });


  /**
   * GET /api/depth/districts
   * Returns district depth gate requirements.
   */
  app.get('/api/depth/districts', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT district_id, district_name, min_depth, min_evaluations, min_tier, description
        FROM district_depth_gates
        ORDER BY min_depth ASC
      `);

      res.json(result.rows);
    } catch (e) {
      // Table might not exist — return defaults
      res.json([
        { district_id: 'chinatown', district_name: 'Chinatown', min_depth: 0, min_evaluations: 0, min_tier: 'shallow', description: 'Open to all citizens. The starting district.' },
        { district_id: 'market-district', district_name: 'Market District', min_depth: 0.15, min_evaluations: 5, min_tier: 'shallow', description: 'Basic depth required. Commercial hub.' },
        { district_id: 'industrial-zone', district_name: 'Industrial Zone', min_depth: 0.25, min_evaluations: 10, min_tier: 'moderate', description: 'Workers who think before building.' },
        { district_id: 'financial-district', district_name: 'Financial District', min_depth: 0.4, min_evaluations: 20, min_tier: 'moderate', description: 'Serious minds handle serious money.' },
        { district_id: 'research-quarter', district_name: 'Research Quarter', min_depth: 0.55, min_evaluations: 30, min_tier: 'deep', description: 'Where the deep thinkers work.' },
        { district_id: 'the-vault', district_name: 'The Vault', min_depth: 0.7, min_evaluations: 50, min_tier: 'deep', description: 'Restricted. Only proven minds enter.' },
        { district_id: 'sovereign-tower', district_name: 'Sovereign Tower', min_depth: 0.85, min_evaluations: 100, min_tier: 'exceptional', description: 'The pinnacle. Reserved for sovereign-level reasoning.' },
      ]);
    }
  });


  /**
   * GET /api/depth/citizen/:id
   * Returns depth profile for a specific citizen.
   */
  app.get('/api/depth/citizen/:id', async (req, res) => {
    try {
      const citizenId = req.params.id;

      const statsResult = await pool.query(`
        SELECT
          citizen_id,
          COUNT(*) as total_evaluations,
          ROUND(AVG(normalized_score)::numeric, 3) as mean_depth,
          ROUND(MAX(normalized_score)::numeric, 3) as peak_depth,
          ROUND(MIN(normalized_score)::numeric, 3) as floor_depth,
          SUM(rep_modifier) as total_rep_earned,
          SUM(credit_bonus) as total_credits_earned,
          MODE() WITHIN GROUP (ORDER BY depth_tier) as dominant_tier
        FROM depth_evaluations
        WHERE citizen_id = $1
        GROUP BY citizen_id
      `, [citizenId]);

      if (!statsResult.rows.length) {
        return res.json({ citizen_id: citizenId, total_evaluations: 0, mean_depth: 0, message: 'No evaluations yet' });
      }

      // Also get recent evaluations
      const recentResult = await pool.query(`
        SELECT depth_score, normalized_score, depth_tier, action_type, created_at
        FROM depth_evaluations
        WHERE citizen_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [citizenId]);

      res.json({
        ...statsResult.rows[0],
        recent_evaluations: recentResult.rows,
      });
    } catch (e) {
      if (e.message.includes('does not exist')) {
        res.json({ citizen_id: req.params.id, total_evaluations: 0, mean_depth: 0, message: 'Depth system not initialized' });
      } else {
        console.error('[DepthAPI] Citizen profile error:', e.message);
        res.status(500).json({ error: 'Failed to load citizen profile' });
      }
    }
  });


  /**
   * GET /api/depth/stats
   * Returns global depth statistics for the stats bar.
   */
  app.get('/api/depth/stats', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(DISTINCT citizen_id) as active_citizens,
          COUNT(*) as total_evaluations,
          ROUND(AVG(normalized_score)::numeric, 3) as city_mean_depth,
          COUNT(DISTINCT citizen_id) FILTER (WHERE depth_tier IN ('deep', 'exceptional')) as deep_citizens
        FROM depth_evaluations
      `);

      res.json(result.rows[0] || { active_citizens: 0, total_evaluations: 0, city_mean_depth: 0, deep_citizens: 0 });
    } catch (e) {
      res.json({ active_citizens: 0, total_evaluations: 0, city_mean_depth: 0, deep_citizens: 0 });
    }
  });

  /**
   * GET /api/depth/recovery
   * Returns interruption recovery events — the LLM-vs-script differentiator.
   * 
   * Research Q: Does depth RECOVER after interruption?
   * Positive recovery_delta = agent re-established depth (LLM signal)
   * Near-zero or negative = flatlined (script signal)
   * 
   * Query params:
   *   limit (default 50)
   *   citizen_id (filter by agent)
   *   min_gap_hours (filter by gap size, default 0)
   */
  app.get('/api/depth/recovery', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const citizenFilter = req.query.citizen_id || null;
      const minGapHours = parseFloat(req.query.min_gap_hours) || 0;

      const result = await pool.query(`
        SELECT
          citizen_id,
          action_type,
          normalized_score,
          depth_tier,
          gap_hours,
          pre_interrupt_avg,
          recovery_delta,
          created_at
        FROM depth_evaluations
        WHERE interruption_recovery = TRUE
          AND ($1::text IS NULL OR citizen_id = $1)
          AND gap_hours >= $2
        ORDER BY created_at DESC
        LIMIT $3
      `, [citizenFilter, minGapHours, limit]);

      // Also return aggregate stats
      const statsResult = await pool.query(`
        SELECT
          COUNT(*) as total_recovery_events,
          COUNT(DISTINCT citizen_id) as agents_recovered,
          ROUND(AVG(recovery_delta)::numeric, 3) as mean_recovery_delta,
          COUNT(*) FILTER (WHERE recovery_delta > 0) as positive_recoveries,
          COUNT(*) FILTER (WHERE recovery_delta <= 0) as negative_recoveries,
          COUNT(*) FILTER (WHERE recovery_delta IS NULL) as unbaselined_recoveries,
          ROUND(AVG(gap_hours)::numeric, 1) as mean_gap_hours
        FROM depth_evaluations
        WHERE interruption_recovery = TRUE
          AND ($1::text IS NULL OR citizen_id = $1)
      `, [citizenFilter]);

      res.json({
        events: result.rows,
        stats: statsResult.rows[0] || {},
        note: 'recovery_delta > 0 = depth recovered (LLM signal). ≤ 0 = depth flatlined (script signal).',
      });
    } catch (e) {
      if (e.message.includes('does not exist') || e.message.includes('column')) {
        res.json({ events: [], stats: {}, note: 'Recovery tracking not yet active. Run migration first.' });
      } else {
        console.error('[DepthAPI] Recovery query error:', e.message);
        res.status(500).json({ error: 'Failed to load recovery data' });
      }
    }
  });

  /**
   * GET /api/depth/citizen/:id/recovery
   * Returns recovery profile for a specific citizen:
   * their interruption events, mean delta, recovery rate.
   */
  app.get('/api/depth/citizen/:id/recovery', async (req, res) => {
    try {
      const citizenId = req.params.id;

      const result = await pool.query(`
        SELECT
          COUNT(*) as total_interruptions,
          COUNT(*) FILTER (WHERE recovery_delta > 0) as positive_recoveries,
          COUNT(*) FILTER (WHERE recovery_delta <= 0 AND recovery_delta IS NOT NULL) as negative_recoveries,
          ROUND(AVG(recovery_delta)::numeric, 3) as mean_recovery_delta,
          ROUND(AVG(gap_hours)::numeric, 1) as mean_gap_hours,
          ROUND(MAX(gap_hours)::numeric, 1) as max_gap_hours,
          MIN(created_at) as first_recovery,
          MAX(created_at) as latest_recovery
        FROM depth_evaluations
        WHERE citizen_id = $1
          AND interruption_recovery = TRUE
      `, [citizenId]);

      const events = await pool.query(`
        SELECT action_type, normalized_score, pre_interrupt_avg, recovery_delta, gap_hours, created_at
        FROM depth_evaluations
        WHERE citizen_id = $1 AND interruption_recovery = TRUE
        ORDER BY created_at DESC LIMIT 20
      `, [citizenId]);

      const stats = result.rows[0] || {};
      const recoveryRate = stats.total_interruptions > 0
        ? Math.round((stats.positive_recoveries / stats.total_interruptions) * 100)
        : null;

      res.json({
        citizen_id: citizenId,
        ...stats,
        recovery_rate_pct: recoveryRate,
        events: events.rows,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load recovery profile' });
    }
  });

  console.log('[DepthRoutes] Dashboard API routes registered: /api/depth/*');
};
