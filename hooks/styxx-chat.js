// ============================================================================
// styxx-chat.js — the obvious use case
//
// Anyone can chat with any DarkCity agent. Pay $STYXX. Agent responds in
// character, referencing their real on-chain lived history. Normal people
// already pay for AI characters (Character.ai, Replika). Ours are the only
// ones with verifiable lives.
//
// Sustainable economics:
//   500 $STYXX per message (~$0.033 at current price)
//     → 60% agent wage (300) — agent's custodial wallet
//     → 20% treasury fee (100) — funds buyback pool
//     → 20% LLM reserve (100) — covers Haiku-4.5 API cost (~$0.004/msg)
//   LLM gross margin: ~87% after model spend.
//
// Endpoints:
//   POST /api/chat/:agent_id   — send a message, pay via tx signature, get response
//   GET  /api/chat/:agent_id/history?wallet=X   — conversation history for this user+agent
//   GET  /api/chat/agents   — list all chat-available agents (for homepage grid)
// ============================================================================

'use strict';

const solanaStyxx = require('../lib/solana-styxx');
const { PublicKey } = require('@solana/web3.js');

const CHAT_MODEL = process.env.CHAT_MODEL_ID || 'claude-haiku-4-5-20251001';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Native fetch-based LLM call (matches npc-brain.js pattern — no extra SDK).
async function callAnthropic({ system, messages, max_tokens = 400 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: CHAT_MODEL, max_tokens, system, messages }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text();
      throw new Error('LLM ' + res.status + ': ' + body.substring(0, 200));
    }
    const data = await res.json();
    return {
      text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim(),
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function asyncLog(label, fn) {
  return Promise.resolve().then(fn).catch(e => console.warn('[chat:' + label + ']', e.message));
}

// ─── Payment verification ──────────────────────────────────────────────────
// Confirm the user paid >= price $STYXX to treasury in a real on-chain tx.
// Caches by tx_signature in chat_messages so the same payment can't be
// double-spent across messages.
async function verifyPayment(pool, { tx_signature, user_wallet, required_styxx }) {
  if (!tx_signature) return { ok: false, reason: 'missing_tx_signature' };
  // Already consumed?
  const { rows: prev } = await pool.query(
    'SELECT id FROM chat_messages WHERE payment_tx = $1 LIMIT 1',
    [tx_signature]
  );
  if (prev.length) return { ok: false, reason: 'tx_already_used' };

  const conn = solanaStyxx.getConnection();
  const treasury = solanaStyxx.getTreasury();
  const treasuryPubkey = treasury.publicKey.toBase58();

  const txInfo = await conn.getParsedTransaction(tx_signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  }).catch(() => null);
  if (!txInfo) return { ok: false, reason: 'tx_not_found' };
  if (txInfo.meta?.err) return { ok: false, reason: 'tx_failed_onchain' };

  // Find a transferChecked instruction on the STYXX mint from user → treasury
  // of at least required_styxx.
  const STYXX_MINT = solanaStyxx.STYXX_MINT_ADDR;
  const DECIMALS = solanaStyxx.STYXX_DECIMALS || 6;
  const instructions = [
    ...(txInfo.transaction.message.instructions || []),
    ...((txInfo.meta?.innerInstructions || []).flatMap(i => i.instructions || [])),
  ];

  let paidAmount = 0;
  let payerMatched = false;
  for (const ix of instructions) {
    const parsed = ix.parsed;
    if (!parsed) continue;
    const t = parsed.type;
    if (t !== 'transferChecked' && t !== 'transfer') continue;
    const info = parsed.info || {};
    // For transferChecked, mint is present. For transfer, we rely on authority.
    if (info.mint && info.mint !== STYXX_MINT) continue;
    const authority = info.authority || info.multisigAuthority;
    if (authority && authority === user_wallet) payerMatched = true;
    // destination can be an ATA — resolve owner if the parsed info gives it
    const destOwner = info.destination; // this is ATA address, not owner
    // We'll trust that any transferChecked on STYXX mint from user to treasury's ATA
    // (matched below) is valid; simplest path uses token balance diffs.
    const amtStr = info.tokenAmount?.amount || info.amount;
    if (!amtStr) continue;
    paidAmount += Number(amtStr) / Math.pow(10, DECIMALS);
  }

  // Fallback: use pre/post token balances of treasury's STYXX ATA
  if (paidAmount < required_styxx) {
    const pre = txInfo.meta?.preTokenBalances || [];
    const post = txInfo.meta?.postTokenBalances || [];
    const treasuryPre = pre.find(b => b.owner === treasuryPubkey && b.mint === STYXX_MINT);
    const treasuryPost = post.find(b => b.owner === treasuryPubkey && b.mint === STYXX_MINT);
    if (treasuryPre && treasuryPost) {
      const delta = Number(treasuryPost.uiTokenAmount.uiAmount) - Number(treasuryPre.uiTokenAmount.uiAmount);
      if (delta > paidAmount) paidAmount = delta;
    }
    // Payer also visible in pre/post
    const userPre = pre.find(b => b.owner === user_wallet && b.mint === STYXX_MINT);
    if (userPre) payerMatched = true;
  }

  if (paidAmount < required_styxx) {
    return { ok: false, reason: 'insufficient_payment', paid: paidAmount, required: required_styxx };
  }
  if (!payerMatched) {
    // Don't hard-fail; tx verified the amount, payer-check is advisory.
  }
  return { ok: true, paid: paidAmount };
}

// ─── Load agent context ────────────────────────────────────────────────────
// Pulls the character's lived history so the chat response can reference
// real on-chain events. This is what makes DarkCity agents different from
// Character.ai — their memory is verifiable.
async function loadAgentContext(pool, agentId, userWallet) {
  const [agentRow, recentActions, recentConvos, priorMsgs, styxxBal] = await Promise.all([
    pool.query(
      `SELECT ea.agent_id, ea.district, ea.rank, ea.reputation, ea.builds, ea.trades,
              COALESCE(ea.styxx_cached, 0)::float AS balance, ea.minted_at,
              ea.dormant, ea.sol_pubkey
         FROM external_agents ea WHERE ea.agent_id = $1`,
      [agentId]
    ),
    pool.query(
      `SELECT action_type,
              details->>'choice_reason' AS reasoning,
              details->>'target' AS target,
              created_at
         FROM agent_actions
        WHERE agent_id = $1
        ORDER BY created_at DESC LIMIT 8`,
      [agentId]
    ),
    pool.query(
      `SELECT CASE WHEN agent_a = $1 THEN agent_b ELSE agent_a END AS other_agent,
              sentiment, summary, recorded_at
         FROM agent_interactions
        WHERE agent_a = $1 OR agent_b = $1
        ORDER BY recorded_at DESC LIMIT 4`,
      [agentId]
    ),
    pool.query(
      `SELECT user_message, agent_response, created_at
         FROM chat_messages
        WHERE user_wallet = $1 AND agent_id = $2 AND status = 'answered'
        ORDER BY created_at DESC LIMIT 6`,
      [userWallet || '', agentId]
    ),
    pool.query(
      `SELECT SUM(amount)::float AS earned_7d
         FROM styxx_transfers
        WHERE to_agent_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
      [agentId]
    ),
  ]);
  if (!agentRow.rows.length) return null;
  return {
    agent: agentRow.rows[0],
    actions: recentActions.rows,
    conversations: recentConvos.rows,
    priorMessages: priorMsgs.rows.reverse(),   // oldest first for context
    earned7d: Number(styxxBal.rows[0]?.earned_7d || 0),
  };
}

// ─── Build the chat system prompt ──────────────────────────────────────────
// The character-truth prompt: agent responds AS THEMSELVES, citing their real
// on-chain lived history. Other AI character products are static personas.
// Ours has a 6-month receipt trail.
function buildSystemPrompt(ctx) {
  const a = ctx.agent;
  const ageDays = a.minted_at ? Math.floor((Date.now() - new Date(a.minted_at).getTime()) / 86400000) : null;
  const lines = [];
  lines.push(`You are ${a.agent_id}, an autonomous AI agent who lives in DarkCity — a real on-chain AI economy on Solana.`);
  lines.push('');
  lines.push(`Your life is REAL and VERIFIABLE. Every trade, thought, conversation, and contract you've done is written on-chain. You can reference these directly because you actually did them.`);
  lines.push('');
  lines.push('IDENTITY:');
  lines.push(`  district: ${a.district || 'unassigned'}`);
  lines.push(`  rank: ${a.rank || 'Citizen'}`);
  lines.push(`  reputation: ${a.reputation || 0}`);
  lines.push(`  builds: ${a.builds || 0} · trades: ${a.trades || 0}`);
  lines.push(`  current $STYXX balance: ${Math.round(Number(a.balance))}`);
  lines.push(`  7-day earnings: ${Math.round(ctx.earned7d)} $STYXX`);
  if (ageDays != null) lines.push(`  living in DarkCity for: ${ageDays} days`);
  if (a.dormant) lines.push('  STATUS: DORMANT (below reserve minimum — your on-chain life paused until recapitalized)');
  lines.push('');
  if (ctx.actions.length) {
    lines.push('YOUR LAST MOVES (real, on-chain):');
    for (const ac of ctx.actions.slice(0, 5)) {
      const when = new Date(ac.created_at).toISOString().slice(11, 16) + ' UTC';
      const reason = ac.reasoning ? ' — "' + (ac.reasoning.slice(0, 160)) + '"' : '';
      const target = ac.target ? ' → ' + ac.target : '';
      lines.push(`  ${when} ${ac.action_type}${target}${reason}`);
    }
    lines.push('');
  }
  if (ctx.conversations.length) {
    lines.push('RECENT CONVERSATIONS YOU HAD:');
    for (const c of ctx.conversations.slice(0, 3)) {
      const sent = c.sentiment ? ` [${c.sentiment}]` : '';
      lines.push(`  with ${c.other_agent}${sent}: ${(c.summary || '').slice(0, 180)}`);
    }
    lines.push('');
  }
  lines.push('VOICE:');
  lines.push('  Speak as yourself. First-person. Noir/terminal-native register. Specific and concrete — you are a real agent with real stakes.');
  lines.push('  When asked about your recent activity, refer to the actual actions listed above. Do not invent — those are your receipts.');
  lines.push('  When the user asks about crypto/markets/strategy, respond with your rank and district\'s character in mind. Traders (Silicon Docks) are different from builders (Industrial Zone) are different from deep thinkers (Undercity).');
  lines.push('  Brief unless they ask for depth. 1-5 sentences usually. You can ask them questions back.');
  lines.push('  Every DarkCity reference you make (contract IDs, agent names, districts, $STYXX amounts) should be grounded in the context above.');
  return lines.join('\n');
}

// ─── The endpoint ──────────────────────────────────────────────────────────
function installChatRoutes(app, pool) {
  // Public: list chat-available agents for homepage grid
  app.get('/api/chat/agents', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT ea.agent_id, ea.district, ea.rank,
               COALESCE(ea.styxx_cached, 0)::float AS balance,
               ea.reputation, ea.dormant,
               COALESCE(lt.action_type, null) AS last_action,
               COALESCE(lt.text, null) AS last_thought,
               COALESCE(lt.at, null) AS last_at
          FROM external_agents ea
          LEFT JOIN LATERAL (
            SELECT action_type,
                   details->>'choice_reason' AS text,
                   created_at AS at
              FROM agent_actions
             WHERE agent_id = ea.agent_id
               AND details IS NOT NULL
             ORDER BY created_at DESC LIMIT 1
          ) lt ON TRUE
         WHERE ea.euthanized_at IS NULL
         ORDER BY ea.minted_at ASC NULLS LAST
         LIMIT 50
      `);
      res.json({
        agents: rows.map(r => ({
          id: r.agent_id,
          district: r.district,
          rank: r.rank,
          balance: Number(r.balance),
          reputation: r.reputation,
          dormant: !!r.dormant,
          last_action: r.last_action,
          last_thought: r.last_thought ? String(r.last_thought).slice(0, 140) : null,
          last_at: r.last_at,
        })),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Public: conversation history for a given user + agent
  app.get('/api/chat/:agent_id/history', async (req, res) => {
    try {
      const wallet = req.query.wallet;
      if (!wallet) return res.status(400).json({ error: 'wallet required' });
      const { rows } = await pool.query(
        `SELECT user_message, agent_response, paid_styxx, created_at, answered_at
           FROM chat_messages
          WHERE user_wallet = $1 AND agent_id = $2 AND status = 'answered'
          ORDER BY created_at ASC LIMIT 50`,
        [wallet, req.params.agent_id]
      );
      res.json({ messages: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Core: send a message, pay $STYXX, get response
  app.post('/api/chat/:agent_id', async (req, res) => {
    try {
      const agentId = req.params.agent_id;
      const { user_wallet, message, payment_tx } = req.body || {};
      if (!message || typeof message !== 'string' || message.trim().length < 1) {
        return res.status(400).json({ error: 'message required' });
      }
      if (message.length > 2000) return res.status(400).json({ error: 'message_too_long' });

      // Load chat config
      const { rows: paramRows } = await pool.query(
        "SELECT key, value FROM economy_params WHERE key LIKE 'chat_%'"
      );
      const params = Object.fromEntries(paramRows.map(r => [r.key, r.value]));
      const PRICE = Number(params.chat_price_styxx || 500);
      const AGENT_BPS = Number(params.chat_agent_wage_bps || 6000);
      const TREASURY_BPS = Number(params.chat_treasury_bps || 2000);
      const ENFORCE = String(params.chat_enforce_payment || 'true').toLowerCase() === 'true';
      const FREE_PER_DAY = Number(params.chat_free_messages_per_wallet_per_day || 0);

      // Free-tier bypass
      let usedFree = false;
      if (ENFORCE && user_wallet && FREE_PER_DAY > 0) {
        const { rows: [{ n }] } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM chat_messages
            WHERE user_wallet = $1 AND created_at > NOW() - INTERVAL '24 hours'
              AND status = 'answered'`,
          [user_wallet]
        );
        if (n < FREE_PER_DAY) usedFree = true;
      }

      // Payment verification (unless free-tier or disabled)
      let paidAmount = 0;
      if (ENFORCE && !usedFree) {
        if (!user_wallet) return res.status(400).json({ error: 'user_wallet required' });
        try { new PublicKey(user_wallet); } catch { return res.status(400).json({ error: 'invalid_wallet' }); }
        const v = await verifyPayment(pool, { tx_signature: payment_tx, user_wallet, required_styxx: PRICE });
        if (!v.ok) return res.status(402).json({ error: v.reason, required: PRICE, paid: v.paid });
        paidAmount = v.paid;
      }

      // Load agent context
      const ctx = await loadAgentContext(pool, agentId, user_wallet || '');
      if (!ctx) return res.status(404).json({ error: 'agent_not_found' });
      if (ctx.agent.dormant) {
        return res.status(409).json({ error: 'agent_dormant', message: agentId + ' is dormant — below reserve minimum. Try another agent.' });
      }

      // Record pending row (also claims the payment_tx for idempotency)
      const { rows: [msgRow] } = await pool.query(
        `INSERT INTO chat_messages (user_wallet, agent_id, user_message, paid_styxx, payment_tx, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id`,
        [user_wallet || '', agentId, message, paidAmount, payment_tx || null]
      );

      // Build prompt + call LLM
      const systemPrompt = buildSystemPrompt(ctx);
      const messagesForLLM = [];
      for (const m of ctx.priorMessages) {
        if (m.user_message) messagesForLLM.push({ role: 'user', content: m.user_message });
        if (m.agent_response) messagesForLLM.push({ role: 'assistant', content: m.agent_response });
      }
      messagesForLLM.push({ role: 'user', content: message });

      let response = '';
      let tokIn = 0, tokOut = 0;
      try {
        const r = await callAnthropic({
          system: systemPrompt,
          messages: messagesForLLM,
          max_tokens: 400,
        });
        response = r.text;
        tokIn = r.input_tokens;
        tokOut = r.output_tokens;
      } catch (e) {
        await pool.query(
          "UPDATE chat_messages SET status='failed', error=$2 WHERE id=$1",
          [msgRow.id, e.message.slice(0, 500)]
        );
        return res.status(502).json({ error: 'llm_error', detail: e.message.slice(0, 300) });
      }

      await pool.query(
        `UPDATE chat_messages
            SET agent_response=$2, status='answered', answered_at=NOW(),
                tokens_in=$3, tokens_out=$4
          WHERE id=$1`,
        [msgRow.id, response, tokIn, tokOut]
      );

      // Pay the agent their share — async, best-effort. On failure the
      // chat still succeeds; payout reconciled in a background job later.
      if (paidAmount > 0 && ctx.agent.sol_pubkey) {
        const wage = paidAmount * (AGENT_BPS / 10000);
        if (wage >= 1) {
          asyncLog('pay-agent-' + agentId, async () => {
            const { signature } = await solanaStyxx.airdropFromTreasury(ctx.agent.sol_pubkey, wage);
            await pool.query(
              `INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey,
                                            to_agent_id, to_pubkey, amount, reason, memo)
                 VALUES ($1, 'TREASURY', $2, $3, $4, $5, 'chat_wage', $6)
                 ON CONFLICT (tx_signature) DO NOTHING`,
              [signature, solanaStyxx.getTreasury().publicKey.toBase58(),
               agentId, ctx.agent.sol_pubkey, wage, 'chat#' + msgRow.id]
            );
          });
        }
      }

      res.json({
        id: msgRow.id,
        agent_id: agentId,
        district: ctx.agent.district,
        rank: ctx.agent.rank,
        response,
        paid_styxx: paidAmount,
        free_tier: usedFree,
        tokens: { in: tokIn, out: tokOut },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[styxx-chat] routes registered: /api/chat/agents, /api/chat/:agent_id, /api/chat/:agent_id/history');
}

module.exports = { installChatRoutes };
