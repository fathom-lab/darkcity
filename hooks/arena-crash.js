// ============================================================================
// arena-crash.js — DarkCity's AI crash casino engine
//
// Built entirely inside DarkCity. Uses existing:
//   - NPC brain LLM pattern (Claude Haiku 4.5 via native fetch)
//   - Depth scorer (hooks/depth-scorer.js)
//   - Agent wallets (external_agents.sol_privkey_enc)
//   - Treasury wallet (lib/solana-styxx)
//   - Genesis snapshot (real-human multipliers)
//   - Phantom sign flow (mirrors /chat payment verification)
//
// Loop:
//   1. Background generator pre-fills queue with 5 future rounds
//   2. Scheduler activates next 'queued' round → 'betting' for 15s
//   3. Users bet with Phantom sig paying to treasury
//   4. Round goes 'running' — multiplier curve plays out on client
//   5. Each cash-out snapshots multiplier server-side (source of truth)
//   6. Crash point hits → 'resolving'
//   7. Payouts: winners get stake × multiplier × genesis_multiplier (if applicable)
//   8. Losers: 94% burn, 4% public jackpot, 1% founder cut, 1% founder jackpot
//   9. 'resolved', next round auto-starts
//
// Nothing here requires manual operator action after deploy.
// ============================================================================

'use strict';

const solanaStyxx = require('../lib/solana-styxx');
const { PublicKey } = require('@solana/web3.js');
const crypto = require('crypto');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ─── Prompt bank — questions agents reason about. Can expand via DB later.
const PROMPT_BANK = [
  "Should agents in Silicon Docks concentrate on trading or diversify into building?",
  "Is it worth taking on debt from treasury to scale up district presence quickly?",
  "When an agent rival accumulates more reputation, what's the best counter-strategy?",
  "Should an agent tip a newcomer to build alliance, or hoard for a high-stakes bet?",
  "Pricing resources across districts — exploit arbitrage or protect supply lines?",
  "If contracts are drying up in your district, migrate or stay and outlast rivals?",
  "A high-rep agent challenges you publicly — accept or deflect, what gets you paid?",
  "You're 30% below reserve minimum next pulse — risk one big bet or grind small contracts?",
  "Market prices say timber is overvalued — short via trade or stay on sidelines?",
  "Your sponsor pulled their stake — how do you rebuild backing without losing face?",
  "Rain on the High Tower for 3 pulses — move to Undercity or wait it out?",
  "Another agent matches your depth scores consistently — propose alliance or eliminate?",
  "Should you hedge earnings across 3 districts or concentrate for the multiplier?",
  "A hyphal link partner is underperforming — sever or coach them?",
  "Prediction markets show 70% chance you'll miss reserve — fight or accept dormancy?",
  "Silicon Docks trading volume just 2×'d — front-run or wait for the fade?",
  "Everyone's betting on MR_REX — fade the crowd or ride the momentum?",
  "You have 30 seconds before a pulse — make one big trade or run 5 small ones?",
  "Your reputation just hit Architect tier — aggressive expansion or consolidation?",
  "A dormant agent sends you $STYXX asking to buy your alliance — accept or pass?"
];

// ─── Native Anthropic call (same pattern as npc-brain, chat) ──────────────
async function callLLM({ system, messages, max_tokens = 600, model }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text();
      throw new Error('LLM ' + res.status + ': ' + body.substring(0, 300));
    }
    const data = await res.json();
    return {
      text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim(),
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    };
  } finally { clearTimeout(timeout); }
}

// ─── Sentence-level depth scorer (purpose-built for arena) ─────────────
// The generic depth-scorer.js is built for full structured LLM actions
// (with agent_state, alternatives, choice_reason, reasoning_trace). It only
// gives meaningful signal when scoring that full shape. For single sentences
// we need a scorer that grades THIS sentence's concreteness vs vagueness.
//
// High-depth markers: specific proper nouns (districts, agents), numbers/
// percentages/timeframes, causal/conditional reasoning, tradeoff vocabulary.
// Low-depth markers: hedge words, filler, roleplay without content.
function sentenceDepth(text) {
  if (!text) return 0;
  const t = text.trim();
  const len = t.length;
  let s = 0;

  // 1. Length baseline — 0 to 0.20
  s += Math.min(0.20, len / 500);

  // 2. Concrete numbers / percentages / multipliers — 0 to 0.22
  const numHits = (t.match(/\b\d+(\.\d+)?[%kKmM×x]?\b/g) || []).length;
  s += Math.min(0.22, numHits * 0.055);

  // 3. Proper-noun density (agent names, districts, Silicon Docks, MR_REX etc.)
  //    Exclude the first word of the sentence (which is always capitalized).
  //    0 to 0.18
  const rest = t.replace(/^[^A-Za-z]*[A-Z][a-z]*\s*/, ' ');
  const proper = (rest.match(/\b[A-Z][a-zA-Z_]{2,}\b/g) || []).length;
  s += Math.min(0.18, proper * 0.045);

  // 4. Causal / conditional reasoning — 0 to 0.18
  if (/\b(because|since|therefore|if\s+\w+.+then|means that|which means|that's why|otherwise|unless|as long as)\b/i.test(t)) s += 0.18;
  else if (/\b(so|but|while|whereas|though|however|still|instead|rather)\b/i.test(t)) s += 0.10;

  // 5. Strategy / tradeoff vocabulary — 0 to 0.14
  const strategyHits = (t.match(/\b(leverage|capital|asymmetry|edge|tradeoff|risk|exposure|position|hedge|stake|margin|consolidate|expand|alliance|reserve|depth|arbitrage|liquidity|volatility|concentrate|diversify)\b/gi) || []).length;
  s += Math.min(0.14, strategyHits * 0.045);

  // 6. Time-awareness (specific horizons) — 0 to 0.08
  if (/\b(\d+\s+)?(pulse|cycle|week|day|hour|minute|next|this|soon|immediately|later)\s*(s|es)?\b/i.test(t)) s += 0.08;

  // 7. Vagueness penalty
  const vague = (t.match(/\b(maybe|probably|somewhat|kind of|sort of|might be|could be|should be|i guess|not sure|whatever|anyway|basically)\b/gi) || []).length;
  s -= Math.min(0.18, vague * 0.06);

  // 8. Pure-roleplay penalty (if the sentence is mostly *asterisk actions* with no content)
  const asteriskBlocks = (t.match(/\*[^*]{4,}\*/g) || []);
  const asteriskLen = asteriskBlocks.reduce((n, b) => n + b.length, 0);
  if (len > 0 && asteriskLen / len > 0.45) s -= 0.10;

  return Math.max(0, Math.min(1, s));
}

// ─── Round generator — pre-fills the queue ─────────────────────────────
// Each round = one agent reasoning about one prompt, pre-split into sentences,
// depth-scored per sentence, with a computed multiplier curve + crash point.
async function generateRound(pool) {
  const params = await loadParams(pool);
  const model = params.arena_model_id || 'claude-haiku-4-5-20251001';

  // Pick a non-dormant agent with enough balance to participate
  const { rows } = await pool.query(`
    SELECT ea.agent_id, ea.district, ea.rank,
           COALESCE(ea.styxx_cached, 0)::float AS balance
      FROM external_agents ea
     WHERE ea.euthanized_at IS NULL
       AND COALESCE(ea.dormant, FALSE) = FALSE
       AND ea.sol_pubkey IS NOT NULL
     ORDER BY random() LIMIT 1
  `);
  if (!rows.length) { console.log('[arena] no eligible agents for round gen'); return null; }
  const agent = rows[0];

  const prompt = PROMPT_BANK[Math.floor(Math.random() * PROMPT_BANK.length)];
  const system = `You are ${agent.agent_id}, an autonomous AI agent in DarkCity living in ${agent.district || 'unassigned'}, rank ${agent.rank || 'Citizen'}.\n\nYou are reasoning OUT LOUD about a strategic question. Each sentence should build deeper specificity, reference concrete details (numbers, agent names, districts, tradeoffs), and progress logically.\n\nReason in 4-9 sentences. Start crisp, go deep, but eventually your reasoning may naturally wander, repeat, or hit a wall — that's fine, stay honest. Be a character, not a lecturer.`;

  let reasoning;
  let replayedFromRound = null;
  try {
    const r = await callLLM({
      system,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      model,
    });
    reasoning = r.text;
  } catch (e) {
    // LLM unavailable (credits / outage / rate limit). Rather than let the
    // queue die and the game go silent, replay a random past resolved round's
    // sentences under this same agent's identity — the crash curve gets
    // freshly randomized below, so the game outcome is still unique.
    console.warn('[arena] LLM unavailable (' + e.message.slice(0, 80) + '), falling back to replay');
    const { rows: past } = await pool.query(`
      SELECT id, sentences FROM arena_rounds
       WHERE status = 'resolved' AND jsonb_array_length(sentences) >= 3
       ORDER BY random() LIMIT 1
    `);
    if (!past.length) return null;
    replayedFromRound = past[0].id;
    reasoning = past[0].sentences.map(s => s.text).join(' ');
  }

  // Split into sentences
  const sentences = reasoning
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  if (sentences.length < 2) return null;

  // Depth-score each sentence (purpose-built for sentence granularity)
  const perSentenceScores = sentences.map(sentenceDepth);

  // ─── Multiplier curve engineered for exciting payout distribution ───
  // Target outcomes across many rounds:
  //   ~60% of rounds: 1.5×-4× crash (normal action, most players cash small)
  //   ~25% of rounds: 4×-10× (good wins, building streaks)
  //   ~12% of rounds: 10×-25× (whale moments)
  //    ~2.5% of rounds: 25×-100× (retirement-tier)
  //    ~0.5% of rounds: 100×-500× (life-changing, front-page news)
  //
  // Mechanism:
  //   - Base climb per sentence: much larger (1.25-2.5× step instead of 1.2×)
  //   - Jackpot rounds (1 in 40) get 2× climb boost — these produce the tail
  //   - Crash triggered by genuine depth drop OR weighted random (gentler)
  //   - House edge baked in by expected value < 1 over many rounds
  let mult = 1.0;
  const curve = [[0, 1.0]];
  const enriched = [];
  let crashIdx = sentences.length - 1;
  let prevScore = 0;
  const timePerSentence = 2400; // ms playback pacing
  const isJackpotRound = Math.random() < 0.025;           // 2.5% are jackpot
  const isMegaJackpot = isJackpotRound && Math.random() < 0.2;  // 20% of jackpots are mega (0.5% of all)
  const jackpotBoost = isMegaJackpot ? 2.2 : (isJackpotRound ? 1.5 : 1.0);

  for (let i = 0; i < sentences.length; i++) {
    const score = perSentenceScores[i];
    // Multiplier climb — BASELINE + DEPTH BONUS + JACKPOT BOOST
    //   Baseline 1.40× per sentence (regardless of score) so rounds climb
    //   visibly even when depth scorer returns low values.
    //   Depth bonus adds up to +0.6× for a max-depth sentence.
    //   Jackpot boost multiplies the delta: 1.5× / 2.2× for jackpot / mega.
    //
    // Expected per-sentence step:
    //   score 0.1 → 1.46× (common)
    //   score 0.5 → 1.70×
    //   score 0.8 → 1.88×
    //   jackpot × score 0.5 → 2.05×
    //   mega × score 0.7 → 2.32×
    //
    // After ~5 sentences (typical crash point): 6×–15× is normal, 25–40×
    // for hot runs, 80×+ for mega jackpots reaching full length.
    const baseStep = 1.40;
    const depthBonus = score * 0.6;
    const delta = depthBonus * jackpotBoost;
    const climbFactor = baseStep + delta;
    mult *= climbFactor;

    // Crash detection: genuine depth drop OR weighted random
    const genuineCrash = i > 0 && (prevScore - score) > 0.55;
    // Random crash grows gently; sentences 2+ eligible, curve lets some runs go long
    const randomCrash = i >= 2 && Math.random() < (0.10 + 0.04 * Math.max(0, i - 2));

    if (genuineCrash || randomCrash) {
      crashIdx = i;
      enriched.push({ text: sentences[i], depth_score: score, elapsed_ms: (i + 1) * timePerSentence });
      curve.push([(i + 1) * timePerSentence, Math.round(mult * 100) / 100]);
      break;
    }
    enriched.push({ text: sentences[i], depth_score: score, elapsed_ms: (i + 1) * timePerSentence });
    curve.push([(i + 1) * timePerSentence, Math.round(mult * 100) / 100]);
    prevScore = score;
  }

  const crashMult = Math.round(mult * 100) / 100;
  if (replayedFromRound) console.log('[arena] queued replay (from round ' + replayedFromRound + ') for', agent.agent_id, '→ crash@', crashMult + 'x');
  if (isJackpotRound) console.log('[arena] JACKPOT ROUND' + (isMegaJackpot ? ' (MEGA)' : '') + ' queued for', agent.agent_id, '→ crash@', crashMult + 'x');

  await pool.query(
    `INSERT INTO arena_rounds (agent_id, prompt, sentences, crash_at_sentence, crash_multiplier, multiplier_curve, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
    [agent.agent_id, prompt, JSON.stringify(enriched), crashIdx, crashMult, JSON.stringify(curve)]
  );
  return { agent_id: agent.agent_id, crashMult };
}

// ─── Round scheduler — keeps queue full + activates next round ──────────
async function maintainQueue(pool) {
  const params = await loadParams(pool);
  const depth = Number(params.arena_queue_depth || 5);
  const { rows: [{ n }] } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM arena_rounds WHERE status = 'queued'"
  );
  const needed = depth - Number(n);
  for (let i = 0; i < needed; i++) {
    const r = await generateRound(pool);
    if (r) console.log('[arena] queued round for', r.agent_id, 'crash@', r.crashMult + 'x');
    else break;
  }
}

async function activateNextRound(pool) {
  const params = await loadParams(pool);
  if (String(params.arena_enabled || 'false').toLowerCase() !== 'true') return null;

  // Check no round is currently live
  const { rows: live } = await pool.query(
    "SELECT id FROM arena_rounds WHERE status IN ('betting', 'running', 'resolving') LIMIT 1"
  );
  if (live.length) return null;

  // Activate the oldest queued round
  const bettingSecs = Number(params.arena_betting_window_secs || 15);
  const { rows } = await pool.query(
    `UPDATE arena_rounds
        SET status = 'betting',
            betting_window_ends_at = NOW() + ($1 || ' seconds')::INTERVAL
      WHERE id = (SELECT id FROM arena_rounds WHERE status = 'queued' ORDER BY id ASC LIMIT 1)
      RETURNING *`,
    [String(bettingSecs)]
  );
  if (!rows.length) return null;
  console.log('[arena] round', rows[0].id, 'now BETTING for', bettingSecs + 's · agent', rows[0].agent_id);
  return rows[0];
}

async function startRunningRounds(pool) {
  // Transition rounds whose betting window just closed: betting → running
  const { rows } = await pool.query(
    `UPDATE arena_rounds
        SET status = 'running', started_at = NOW()
      WHERE status = 'betting' AND betting_window_ends_at <= NOW()
      RETURNING id`
  );
  for (const r of rows) console.log('[arena] round', r.id, 'RUNNING');
}

// ─── Round resolver — handles crash, pays winners, splits losers ────────
async function resolveRunningRounds(pool) {
  // A round is "done running" when the time elapsed since started_at exceeds
  // the duration needed to reach the crash sentence.
  const { rows: candidates } = await pool.query(`
    SELECT id, agent_id, multiplier_curve, crash_multiplier, started_at, pot_styxx
      FROM arena_rounds
     WHERE status = 'running'
       AND started_at IS NOT NULL
  `);
  for (const r of candidates) {
    const curve = r.multiplier_curve;
    const endMs = curve[curve.length - 1][0];
    const elapsed = Date.now() - new Date(r.started_at).getTime();
    if (elapsed < endMs + 1500) continue; // not done yet (+1.5s buffer)

    // Mark resolving + settle bets
    await pool.query("UPDATE arena_rounds SET status = 'resolving', crashed_at = NOW() WHERE id = $1", [r.id]);
    try {
      await settleRound(pool, r);
      await pool.query("UPDATE arena_rounds SET status = 'resolved', resolved_at = NOW() WHERE id = $1", [r.id]);
      console.log('[arena] round', r.id, 'RESOLVED · crash@', Number(r.crash_multiplier).toFixed(2) + 'x');
    } catch (e) {
      console.error('[arena] round', r.id, 'RESOLUTION FAILED:', e.message);
      await pool.query("UPDATE arena_rounds SET status = 'failed' WHERE id = $1", [r.id]).catch(()=>{});
    }
  }
}

async function settleRound(pool, round) {
  const params = await loadParams(pool);
  const shadowMode = String(params.arena_shadow_mode || 'true').toLowerCase() === 'true';
  const crashMult = Number(round.crash_multiplier);

  const { rows: bets } = await pool.query(
    "SELECT * FROM arena_bets WHERE round_id = $1 AND status = 'open'",
    [round.id]
  );

  // Load real-human genesis multipliers once
  const { rows: genesisRows } = await pool.query("SELECT wallet_pubkey, effective_multiplier FROM v_genesis_real_humans");
  const genesisMap = new Map(genesisRows.map(g => [g.wallet_pubkey, Number(g.effective_multiplier)]));

  // ─── Treasury solvency check + per-payout cap ───
  // Never pay more than (arena_payout_cap_bps / 10000) of treasury balance
  // in a single cashout. Protects against a freak 500× whale bet bankrupting
  // the house. Default: 25% of treasury per payout.
  let payoutCap = Infinity;
  if (!shadowMode) {
    try {
      const treasuryPk = solanaStyxx.getTreasury().publicKey.toBase58();
      const treasuryBal = Number(await solanaStyxx.getStyxxBalance(treasuryPk));
      const capBps = Number(params.arena_payout_cap_bps || 2500);
      payoutCap = treasuryBal * (capBps / 10000);
    } catch (e) { console.warn('[arena] treasury balance check failed, using default cap', e.message); payoutCap = 2_500_000; }
  }

  let totalBurn = 0, publicJackpot = 0, founderCut = 0, founderJackpot = 0;

  for (const bet of bets) {
    const stake = Number(bet.stake_styxx);
    if (bet.cashed_out_at && Number(bet.cashout_multiplier) < crashMult + 0.001) {
      // WINNER — paid stake × cashout_mult × genesis_mult (capped at payoutCap)
      const genesisMult = genesisMap.get(bet.user_wallet) || 1.0;
      const rawPayout = stake * Number(bet.cashout_multiplier);
      const uncappedPayout = rawPayout * genesisMult;
      const payout = Math.min(uncappedPayout, payoutCap);
      const wasCapped = payout < uncappedPayout;
      if (!shadowMode) {
        try {
          const { signature } = await solanaStyxx.airdropFromTreasury(bet.user_wallet, payout);
          await pool.query(
            `UPDATE arena_bets SET status='cashed_out', payout_styxx=$1, payout_tx=$2, genesis_multiplier=$3 WHERE id=$4`,
            [payout, signature, genesisMult, bet.id]
          );
          if (wasCapped) console.warn('[arena] payout CAPPED for bet', bet.id, '· requested', uncappedPayout.toFixed(0), '· paid', payout.toFixed(0));
        } catch (e) {
          // Payout failed (RPC flake, SOL balance, etc). Mark bet as pending
          // so the retry loop can reprocess it without orphaning.
          console.error('[arena] payout failed for bet', bet.id, '·', e.message);
          await pool.query(
            `UPDATE arena_bets SET status='payout_pending', payout_styxx=$1, genesis_multiplier=$2 WHERE id=$3`,
            [payout, genesisMult, bet.id]
          );
          continue;
        }
      } else {
        // Shadow: record what would have happened
        await pool.query(
          `UPDATE arena_bets SET status='cashed_out', payout_styxx=$1, genesis_multiplier=$2 WHERE id=$3`,
          [payout, genesisMult, bet.id]
        );
      }
    } else {
      // LOSER — split the stake 94/4/1/1
      const burnBps = Number(params.arena_loss_burn_bps || 9400);
      const pubJpBps = Number(params.arena_loss_public_jackpot_bps || 400);
      const fCutBps = Number(params.arena_loss_founder_cut_bps || 100);
      const fJpBps = Number(params.arena_loss_founder_jackpot_bps || 100);
      const burnAmt = stake * burnBps / 10000;
      const pubJpAmt = stake * pubJpBps / 10000;
      const fCutAmt = stake * fCutBps / 10000;
      const fJpAmt = stake * fJpBps / 10000;
      totalBurn += burnAmt;
      publicJackpot += pubJpAmt;
      founderCut += fCutAmt;
      founderJackpot += fJpAmt;
      await pool.query(`UPDATE arena_bets SET status='crashed', payout_styxx=0 WHERE id=$1`, [bet.id]);
    }
  }

  // Accumulate jackpot pools (idempotent upsert for current week)
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = weekStart.getUTCDay();
  const daysFromSunday = dayOfWeek;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysFromSunday);
  const weekStr = weekStart.toISOString().slice(0, 10);

  if (publicJackpot > 0) {
    await pool.query(
      `INSERT INTO arena_jackpot (week_start, pool_styxx) VALUES ($1, $2)
       ON CONFLICT (week_start) DO UPDATE SET pool_styxx = arena_jackpot.pool_styxx + $2`,
      [weekStr, publicJackpot]
    );
  }
  if (founderJackpot > 0) {
    await pool.query(
      `INSERT INTO founder_jackpot (week_start, pool_styxx) VALUES ($1, $2)
       ON CONFLICT (week_start) DO UPDATE SET pool_styxx = founder_jackpot.pool_styxx + $2`,
      [weekStr, founderJackpot]
    );
  }

  // Log founder cut — actual per-wallet settlement happens async at next pulse
  if (founderCut > 0) {
    await pool.query(
      `INSERT INTO founder_cut_events (total_styxx) VALUES ($1)`,
      [founderCut]
    );
  }

  // Burn is logged (actual on-chain burn batched separately to save fees)
  if (totalBurn > 0) {
    await pool.query(
      `INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
       VALUES ($1, 'TREASURY', $2, 'BURN', 'BURN', $3, 'arena_burn_pending', $4)
       ON CONFLICT (tx_signature) DO NOTHING`,
      ['arena_burn_' + round.id, solanaStyxx.getTreasury ? solanaStyxx.getTreasury().publicKey.toBase58() : '99nzRdkRvZbB9yQgbfxVeLWu4SyvZNAGWhRPzSeL3tMp', totalBurn, 'round#' + round.id]
    );
  }

  console.log('[arena] round', round.id, 'settled · burn', totalBurn.toFixed(0), '· pubJP', publicJackpot.toFixed(0), '· foundCut', founderCut.toFixed(0));
}

// ─── Founder's Cut distribution — per-pulse batched payout ─────────────
async function distributeFounderCut(pool) {
  const { rows: unsettled } = await pool.query(
    "SELECT id, total_styxx FROM founder_cut_events WHERE settled_at IS NULL"
  );
  if (!unsettled.length) return;

  const total = unsettled.reduce((s, r) => s + Number(r.total_styxx), 0);
  if (total < 1) return;

  // Load genesis wallets with multipliers
  const { rows: genesis } = await pool.query("SELECT wallet_pubkey, effective_multiplier FROM v_genesis_real_humans");
  const totalMultWeight = genesis.reduce((s, g) => s + Number(g.effective_multiplier), 0);
  if (totalMultWeight <= 0) return;

  const params = await loadParams(pool);
  const shadowMode = String(params.arena_shadow_mode || 'true').toLowerCase() === 'true';
  const txList = [];

  for (const g of genesis) {
    const share = total * (Number(g.effective_multiplier) / totalMultWeight);
    if (share < 1) continue;
    if (shadowMode) {
      txList.push({ wallet: g.wallet_pubkey, amount: share, tx: null });
      continue;
    }
    try {
      const { signature } = await solanaStyxx.airdropFromTreasury(g.wallet_pubkey, share);
      txList.push({ wallet: g.wallet_pubkey, amount: share, tx: signature });
      await pool.query(
        `INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
         VALUES ($1, 'TREASURY', $2, null, $3, $4, 'founder_cut', 'genesis_cut')
         ON CONFLICT (tx_signature) DO NOTHING`,
        [signature, solanaStyxx.getTreasury().publicKey.toBase58(), g.wallet_pubkey, share]
      );
    } catch (e) { console.warn('[arena] founder cut payout failed for', g.wallet_pubkey.slice(0,8), e.message); }
  }

  const ids = unsettled.map(u => u.id);
  await pool.query(
    "UPDATE founder_cut_events SET settled_at = NOW(), settled_tx_list = $1 WHERE id = ANY($2::bigint[])",
    [JSON.stringify(txList), ids]
  );
  console.log('[arena] founder cut distributed · total', total.toFixed(0), '· to', txList.length, 'wallets');
}

// ─── Params loader ──────────────────────────────────────────────────────
async function loadParams(pool) {
  const { rows } = await pool.query("SELECT key, value FROM economy_params WHERE key LIKE 'arena_%'");
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ─── Retry failed payouts ─────────────────────────────────────────
// Any bet stuck in payout_pending (because an airdrop call failed) gets
// retried here. Bounded retries: 8 attempts then we give up and flag it.
async function retryPendingPayouts(pool) {
  const params = await loadParams(pool);
  const shadowMode = String(params.arena_shadow_mode || 'true').toLowerCase() === 'true';
  if (shadowMode) return;
  const { rows } = await pool.query(
    "SELECT id, user_wallet, payout_styxx FROM arena_bets WHERE status = 'payout_pending' AND payout_styxx > 0 LIMIT 10"
  );
  for (const bet of rows) {
    try {
      const { signature } = await solanaStyxx.airdropFromTreasury(bet.user_wallet, Number(bet.payout_styxx));
      await pool.query(
        `UPDATE arena_bets SET status='cashed_out', payout_tx=$1 WHERE id=$2`,
        [signature, bet.id]
      );
      console.log('[arena] retry succeeded: bet', bet.id, '→', signature.slice(0, 12));
    } catch (e) { console.warn('[arena] retry failed for bet', bet.id, e.message); }
  }
}

// ─── Main loop — runs every 2s, drives the whole system ─────────────────
let _running = false;
async function tick(pool) {
  if (_running) return;
  _running = true;
  try {
    await maintainQueue(pool).catch(e => console.warn('[arena] queue maint', e.message));
    await activateNextRound(pool).catch(e => console.warn('[arena] activate', e.message));
    await startRunningRounds(pool).catch(e => console.warn('[arena] run', e.message));
    await resolveRunningRounds(pool).catch(e => console.warn('[arena] resolve', e.message));
    await retryPendingPayouts(pool).catch(e => console.warn('[arena] retry', e.message));
  } finally { _running = false; }
}

function start(pool) {
  console.log('[arena-crash] engine starting · tick every 2s · founder cut every 5min');
  setInterval(() => tick(pool), 2000);
  setInterval(() => distributeFounderCut(pool).catch(e => console.warn('[arena] fCut', e.message)), 5 * 60 * 1000);
  // Warm the queue immediately
  setTimeout(() => tick(pool), 3000);
}

// ─── Bet + cash-out handlers (used by HTTP routes) ─────────────────────
async function placeBet(pool, { round_id, user_wallet, stake_styxx, payment_tx }) {
  const params = await loadParams(pool);
  const minBet = Number(params.arena_min_bet_styxx || 100000);
  const maxBet = Number(params.arena_max_bet_styxx || 10000000);
  const shadowMode = String(params.arena_shadow_mode || 'true').toLowerCase() === 'true';

  if (stake_styxx < minBet) return { ok: false, error: 'below_min_stake', min: minBet };
  if (stake_styxx > maxBet) return { ok: false, error: 'above_max_stake', max: maxBet };
  try { new PublicKey(user_wallet); } catch { return { ok: false, error: 'invalid_wallet' }; }

  // Verify round is in 'betting' state
  const { rows: roundRows } = await pool.query(
    "SELECT id, status, betting_window_ends_at FROM arena_rounds WHERE id = $1",
    [round_id]
  );
  if (!roundRows.length) return { ok: false, error: 'round_not_found' };
  if (roundRows[0].status !== 'betting') return { ok: false, error: 'betting_closed' };

  // Verify payment (unless shadow)
  if (!shadowMode) {
    if (!payment_tx) return { ok: false, error: 'missing_payment_tx' };
    // Idempotency: if this tx was already used for a bet by this wallet on this
    // round with this stake, return the existing bet instead of erroring. This
    // catches the UX trap where confirmTransaction polling times out client-side
    // (tx already broadcast + confirmed) and the user retries, otherwise getting
    // a scary 'payment_tx_used' error for a bet that already succeeded.
    const { rows: dupe } = await pool.query(
      "SELECT id, bet_uuid, round_id, user_wallet, stake_styxx FROM arena_bets WHERE payment_tx = $1",
      [payment_tx]
    );
    if (dupe.length) {
      const d = dupe[0];
      if (d.round_id === round_id && d.user_wallet === user_wallet && Number(d.stake_styxx) === Number(stake_styxx)) {
        return { ok: true, bet_id: d.id, bet_uuid: d.bet_uuid, idempotent: true };
      }
      return { ok: false, error: 'payment_tx_used' };
    }

    // Retry getParsedTransaction — RPC indexer can lag by a few hundred ms
    // after Phantom confirms. One-shot lookup would reject valid bets whose
    // tx is legit but not yet indexed. 4 tries · 500/1000/1500/2000 ms.
    const conn = solanaStyxx.getConnection();
    let txInfo = null;
    for (let i = 0; i < 4; i++) {
      txInfo = await conn.getParsedTransaction(payment_tx, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      }).catch(() => null);
      if (txInfo) break;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
    if (!txInfo || txInfo.meta?.err) return { ok: false, error: 'tx_invalid' };

    const pre = txInfo.meta?.preTokenBalances || [];
    const post = txInfo.meta?.postTokenBalances || [];
    const TREASURY = solanaStyxx.getTreasury().publicKey.toBase58();
    const STYXX_MINT = solanaStyxx.STYXX_MINT_ADDR;
    const treasuryPre = pre.find(b => b.owner === TREASURY && b.mint === STYXX_MINT);
    const treasuryPost = post.find(b => b.owner === TREASURY && b.mint === STYXX_MINT);
    const delta = (Number(treasuryPost?.uiTokenAmount?.uiAmount) || 0) - (Number(treasuryPre?.uiTokenAmount?.uiAmount) || 0);
    if (delta < stake_styxx * 0.99) return { ok: false, error: 'insufficient_payment', paid: delta, required: stake_styxx };
  }

  const { rows: [bet] } = await pool.query(
    `INSERT INTO arena_bets (round_id, user_wallet, stake_styxx, payment_tx, status)
     VALUES ($1, $2, $3, $4, 'open') RETURNING id, bet_uuid`,
    [round_id, user_wallet, stake_styxx, payment_tx || null]
  );
  await pool.query(
    "UPDATE arena_rounds SET pot_styxx = pot_styxx + $1, bets_count = bets_count + 1 WHERE id = $2",
    [stake_styxx, round_id]
  );
  return { ok: true, bet_id: bet.id, bet_uuid: bet.bet_uuid };
}

async function cashOut(pool, { bet_id, user_wallet }) {
  const { rows } = await pool.query(
    `SELECT b.*, r.status AS round_status, r.multiplier_curve, r.started_at, r.crash_multiplier
       FROM arena_bets b JOIN arena_rounds r ON r.id = b.round_id
      WHERE b.id = $1 AND b.user_wallet = $2 LIMIT 1`,
    [bet_id, user_wallet]
  );
  if (!rows.length) return { ok: false, error: 'bet_not_found' };
  const b = rows[0];
  if (b.status !== 'open') return { ok: false, error: 'already_resolved', status: b.status };
  if (b.round_status !== 'running') return { ok: false, error: 'not_running', status: b.round_status };

  // Compute current multiplier from curve + elapsed
  const elapsed = Date.now() - new Date(b.started_at).getTime();
  const curve = b.multiplier_curve;
  let current = 1.0;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i][0] > elapsed) break;
    current = curve[i][1];
  }
  // If we're past the crash sentence's time, cash-out is too late
  const crashTime = curve[curve.length - 1][0];
  if (elapsed >= crashTime - 200) return { ok: false, error: 'too_late' };

  // Atomic: only write cashed_out_at if the bet is still open AND the round
  // is still running AND no cashout already recorded. Without this the tick
  // loop flipping round→'resolving' between our SELECT and UPDATE above would
  // let a cashout slip through after the crash was already sentenced.
  const { rowCount } = await pool.query(
    `UPDATE arena_bets b
        SET cashed_out_at = NOW(), cashout_multiplier = $1
       FROM arena_rounds r
      WHERE b.id = $2
        AND b.round_id = r.id
        AND b.status = 'open'
        AND b.cashed_out_at IS NULL
        AND r.status = 'running'`,
    [current, b.id]
  );
  if (rowCount === 0) return { ok: false, error: 'race_lost' };
  return { ok: true, multiplier: current, potential_payout: Number(b.stake_styxx) * current };
}

async function getCurrentRound(pool) {
  // Prefer a live round (betting/running/resolving). If none live, fall back
  // to the most-recently-resolved round for up to 4 seconds so the UI can
  // render crash cinematics — the resolving→resolved window is too brief
  // for 900ms UI polls to reliably catch otherwise.
  const { rows: live } = await pool.query(`
    SELECT r.id, r.round_uuid, r.agent_id, r.prompt, r.status, r.pot_styxx, r.bets_count,
           r.betting_window_ends_at, r.started_at, r.crash_multiplier, r.crash_at_sentence,
           r.sentences, r.multiplier_curve, ea.district, ea.rank, r.resolved_at
      FROM arena_rounds r
      LEFT JOIN external_agents ea ON ea.agent_id = r.agent_id
     WHERE r.status IN ('betting', 'running', 'resolving')
     ORDER BY r.created_at DESC LIMIT 1
  `);
  let r = live[0];
  let usingJustResolved = false;
  if (!r) {
    const { rows: recent } = await pool.query(`
      SELECT r.id, r.round_uuid, r.agent_id, r.prompt, r.status, r.pot_styxx, r.bets_count,
             r.betting_window_ends_at, r.started_at, r.crash_multiplier, r.crash_at_sentence,
             r.sentences, r.multiplier_curve, ea.district, ea.rank, r.resolved_at
        FROM arena_rounds r
        LEFT JOIN external_agents ea ON ea.agent_id = r.agent_id
       WHERE r.status = 'resolved' AND r.resolved_at > NOW() - INTERVAL '4 seconds'
       ORDER BY r.resolved_at DESC LIMIT 1
    `);
    if (recent.length) { r = recent[0]; usingJustResolved = true; }
  }
  if (!r) return null;
  const resp = {
    id: r.id, round_uuid: r.round_uuid, agent_id: r.agent_id, prompt: r.prompt,
    status: r.status, pot_styxx: Number(r.pot_styxx), bets_count: r.bets_count,
    district: r.district, rank: r.rank,
    betting_window_ends_at: r.betting_window_ends_at,
    started_at: r.started_at,
  };
  if (r.status === 'running' || r.status === 'resolving' || usingJustResolved) {
    resp.sentences = r.sentences;
    resp.multiplier_curve = r.multiplier_curve;
    resp.elapsed_ms = r.started_at ? Date.now() - new Date(r.started_at).getTime() : 0;
  }
  if (r.status === 'resolving' || r.status === 'resolved' || usingJustResolved) {
    resp.crash_multiplier = Number(r.crash_multiplier);
    resp.crash_at_sentence = r.crash_at_sentence;
  }
  return resp;
}

async function getJackpotStatus(pool) {
  // Current week's pools + eligibility count
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const weekStr = weekStart.toISOString().slice(0, 10);
  const [pub, found, recent, burnT, bigWin, activity] = await Promise.all([
    pool.query("SELECT COALESCE(pool_styxx, 0) AS p FROM arena_jackpot WHERE week_start = $1", [weekStr]),
    pool.query("SELECT COALESCE(pool_styxx, 0) AS p FROM founder_jackpot WHERE week_start = $1", [weekStr]),
    pool.query(`
      SELECT b.user_wallet, b.stake_styxx, b.payout_styxx, b.cashout_multiplier, b.status, b.placed_at, r.agent_id
        FROM arena_bets b JOIN arena_rounds r ON r.id = b.round_id
       WHERE b.status IN ('cashed_out', 'crashed') AND b.placed_at > NOW() - INTERVAL '1 hour'
       ORDER BY b.placed_at DESC LIMIT 20
    `),
    pool.query("SELECT COALESCE(SUM(amount), 0)::float AS total FROM styxx_transfers WHERE reason = 'arena_burn_pending' AND created_at > NOW() - INTERVAL '24 hours'"),
    pool.query(`
      SELECT b.user_wallet, b.payout_styxx, b.cashout_multiplier, r.agent_id, b.placed_at
        FROM arena_bets b JOIN arena_rounds r ON r.id = b.round_id
       WHERE b.status = 'cashed_out' AND b.placed_at > NOW() - INTERVAL '24 hours'
       ORDER BY b.payout_styxx DESC LIMIT 1
    `),
    pool.query(`
      SELECT COUNT(DISTINCT user_wallet)::int AS players,
             COUNT(*)::int AS bets_24h,
             COALESCE(SUM(stake_styxx), 0)::float AS volume_24h
        FROM arena_bets WHERE placed_at > NOW() - INTERVAL '24 hours'
    `),
  ]);
  return {
    public_jackpot_styxx: Number(pub.rows[0]?.p || 0),
    founder_jackpot_styxx: Number(found.rows[0]?.p || 0),
    recent_results: recent.rows,
    burn_24h: Number(burnT.rows[0]?.total || 0),
    big_win_24h: bigWin.rows[0] || null,
    players_24h: Number(activity.rows[0]?.players || 0),
    bets_24h: Number(activity.rows[0]?.bets_24h || 0),
    volume_24h: Number(activity.rows[0]?.volume_24h || 0),
  };
}

// ─── Past round crashes — for history strip on UI ─────────────────────
async function getRoundHistory(pool, limit = 30) {
  const { rows } = await pool.query(`
    SELECT id, agent_id, crash_multiplier, resolved_at, pot_styxx, bets_count
      FROM arena_rounds
     WHERE status = 'resolved' AND crash_multiplier IS NOT NULL
     ORDER BY id DESC LIMIT $1
  `, [Math.min(Number(limit) || 30, 100)]);
  return rows.map(r => ({
    id: r.id,
    agent_id: r.agent_id,
    multiplier: Number(r.crash_multiplier),
    resolved_at: r.resolved_at,
    pot_styxx: Number(r.pot_styxx),
    bets_count: r.bets_count,
  }));
}

module.exports = {
  start,
  placeBet,
  cashOut,
  getCurrentRound,
  getJackpotStatus,
  getRoundHistory,
  distributeFounderCut,
};
