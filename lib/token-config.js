// ============================================================================
// token-config.js — the single source of truth for the city's native token.
//
// darkcoin is DarkCity's own token (it was the original design: the February
// schema already speaks darkcoin_balance). The mint address comes ONLY from
// env: until darkcoin is minted there is no address, and defaulting to any
// other token's mint would wire the city to someone else's money. With no
// mint set, TOKEN_LIVE is false and every on-chain path must stay dark.
// ============================================================================
'use strict';

const TOKEN_NAME = process.env.TOKEN_NAME || 'darkcoin';
const TOKEN_TICKER = process.env.TOKEN_TICKER || '$DARKCOIN';
const TOKEN_MINT_ADDR = (process.env.TOKEN_MINT_ADDR || '').trim();
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '6', 10);
const TOKEN_PUMP_URL = TOKEN_MINT_ADDR ? `https://pump.fun/coin/${TOKEN_MINT_ADDR}` : '';
const TOKEN_SOLSCAN_URL = TOKEN_MINT_ADDR ? `https://solscan.io/token/${TOKEN_MINT_ADDR}` : '';
const TOKEN_LIVE = TOKEN_MINT_ADDR.length > 0;
// 'spl' (classic SPL Token — what pump.fun mints) or 'token2022'
// (extensions program — what the retired styxx-era mint used).
const TOKEN_PROGRAM = (process.env.TOKEN_PROGRAM || 'spl').toLowerCase();

module.exports = {
  TOKEN_NAME, TOKEN_TICKER, TOKEN_MINT_ADDR, TOKEN_DECIMALS,
  TOKEN_PUMP_URL, TOKEN_SOLSCAN_URL, TOKEN_LIVE, TOKEN_PROGRAM,
};
