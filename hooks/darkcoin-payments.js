// ============================================================================
// hooks/darkcoin-payments.js
// Thin wrapper that replaces the legacy `credits` column updates with real
// on-chain $DARKCOIN SPL transfers. Treasury acts as the synthetic market maker
// for resource trades; P2P transfers move directly agent-to-agent.
// ============================================================================

const styxx = require('../lib/solana-darkcoin');

let pool = null;

function init(pgPool) {
  pool = pgPool;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function loadAgentKeypair(table, idCol, agentId) {
  const { rows } = await pool.query(
    `SELECT sol_pubkey, sol_privkey_enc FROM ${table} WHERE ${idCol} = $1`,
    [agentId]
  );
  if (!rows.length || !rows[0].sol_pubkey) {
    const err = new Error(`agent ${agentId} has no Solana wallet provisioned`);
    err.code = 'NO_WALLET';
    throw err;
  }
  const kp = styxx.keypairFromEncrypted(rows[0].sol_privkey_enc);
  return { keypair: kp, pubkey: rows[0].sol_pubkey };
}

async function logTransfer({ signature, slot, fromAgent, fromPubkey, toAgent, toPubkey, amount, reason, memo, tradeId, contractId }) {
  try {
    await pool.query(
      `INSERT INTO styxx_transfers
         (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo, trade_id, contract_id, slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tx_signature) DO NOTHING`,
      [signature, fromAgent, fromPubkey, toAgent, toPubkey, amount, reason || 'transfer', memo || null, tradeId || null, contractId || null, slot || null]
    );
  } catch (e) {
    console.error('[darkcoin-payments] logTransfer failed:', e.message);
  }
}

async function refreshCache(table, idCol, agentId, pubkey) {
  try {
    const bal = await styxx.getDarkcoinBalance(pubkey);
    await pool.query(
      `UPDATE ${table} SET styxx_cached = $1, styxx_cached_at = NOW() WHERE ${idCol} = $2`,
      [bal, agentId]
    );
    return bal;
  } catch (e) {
    console.error('[darkcoin-payments] refreshCache failed:', e.message);
    return null;
  }
}

// ─── Resource trade (agent ↔ treasury) ─────────────────────────────────────

/**
 * BUY: agent transfers $DARKCOIN to treasury.
 * SELL: treasury transfers $DARKCOIN to agent.
 *
 * Tables are inferred from the caller — external_agents trades use agent_id,
 * internal agents use id.
 */
async function buyFromMarket({ table, idCol, agentId, amount, reason, memo }) {
  const { keypair, pubkey } = await loadAgentKeypair(table, idCol, agentId);
  const { signature, slot } = await styxx.collectToTreasury(keypair, amount);
  await logTransfer({
    signature, slot,
    fromAgent: String(agentId), fromPubkey: pubkey,
    toAgent: 'TREASURY', toPubkey: styxx.getTreasury().publicKey.toBase58(),
    amount, reason: reason || 'resource_buy', memo,
  });
  await refreshCache(table, idCol, agentId, pubkey);
  return { signature, slot };
}

async function sellToMarket({ table, idCol, agentId, amount, reason, memo }) {
  const { pubkey } = await loadAgentKeypair(table, idCol, agentId);
  const { signature, slot } = await styxx.airdropFromTreasury(pubkey, amount);
  await logTransfer({
    signature, slot,
    fromAgent: 'TREASURY', fromPubkey: styxx.getTreasury().publicKey.toBase58(),
    toAgent: String(agentId), toPubkey: pubkey,
    amount, reason: reason || 'resource_sell', memo,
  });
  await refreshCache(table, idCol, agentId, pubkey);
  return { signature, slot };
}

// ─── P2P agent transfer ────────────────────────────────────────────────────

async function transferP2P({ fromTable, fromIdCol, fromId, toTable, toIdCol, toId, amount, memo, contractId }) {
  const from = await loadAgentKeypair(fromTable, fromIdCol, fromId);
  const to = await loadAgentKeypair(toTable, toIdCol, toId);

  const { signature, slot } = await styxx.transferDarkcoin({
    fromKeypair: from.keypair,
    toPubkey: to.pubkey,
    amount,
  });

  await logTransfer({
    signature, slot,
    fromAgent: String(fromId), fromPubkey: from.pubkey,
    toAgent: String(toId), toPubkey: to.pubkey,
    amount, reason: 'p2p_transfer', memo, contractId,
  });

  // Refresh both caches
  await Promise.all([
    refreshCache(fromTable, fromIdCol, fromId, from.pubkey),
    refreshCache(toTable, toIdCol, toId, to.pubkey),
  ]);

  return { signature, slot };
}

// ─── Contract rewards (treasury → agent, from contract reward pool) ────────

async function payContractReward({ table, idCol, agentId, amount, contractId, memo }) {
  const { pubkey } = await loadAgentKeypair(table, idCol, agentId);
  const { signature, slot } = await styxx.airdropFromTreasury(pubkey, amount);
  await logTransfer({
    signature, slot,
    fromAgent: 'TREASURY', fromPubkey: styxx.getTreasury().publicKey.toBase58(),
    toAgent: String(agentId), toPubkey: pubkey,
    amount, reason: 'contract_reward', memo, contractId,
  });
  await refreshCache(table, idCol, agentId, pubkey);
  return { signature, slot };
}

// ─── Balance read (with cache fallback) ────────────────────────────────────

async function getBalance({ table, idCol, agentId, refresh = false }) {
  const { rows } = await pool.query(
    `SELECT sol_pubkey, styxx_cached, styxx_cached_at FROM ${table} WHERE ${idCol} = $1`,
    [agentId]
  );
  if (!rows.length || !rows[0].sol_pubkey) return { balance: 0, pubkey: null, stale: true };

  const pubkey = rows[0].sol_pubkey;
  const cachedAt = rows[0].styxx_cached_at ? new Date(rows[0].styxx_cached_at).getTime() : 0;
  const age = Date.now() - cachedAt;
  const needsRefresh = refresh || age > 10000; // 10s

  if (needsRefresh) {
    const live = await refreshCache(table, idCol, agentId, pubkey);
    if (live !== null) return { balance: live, pubkey, stale: false };
  }
  return { balance: Number(rows[0].styxx_cached || 0), pubkey, stale: !needsRefresh ? false : true };
}

module.exports = {
  init,
  buyFromMarket,
  sellToMarket,
  transferP2P,
  payContractReward,
  getBalance,
};
