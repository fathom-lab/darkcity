// ============================================================================
// Shared client-side helper: window.dcAutoSign
// ============================================================================
// Served as a static module at /js/dc-auto-sign.js so every page can pull it
// with `<script type="module" src="/js/dc-auto-sign.js"></script>`. Before
// this existed, the helper was inlined in darkcoin-public.js's COMMON_HEAD, which
// meant pages served from other modules (darkcoin-flow.js's /flow and /agent/:id,
// for example) didn't get it — they'd call window.dcAutoSign and crash with
// "Auto-sign helper not loaded." This endpoint gives every page the same
// one-click Phantom signing path.
//
// The mint comes from lib/token-config (env-driven). Until darkcoin is
// minted TOKEN_MINT_ADDR is empty — the helper still loads on every page,
// but any call throws a clear "mint pending" error instead of building a
// transfer against a token that doesn't exist.
// ============================================================================

const { TOKEN_MINT_ADDR, TOKEN_DECIMALS } = require('../lib/token-config');

const AUTO_SIGN_SOURCE = `
// ─── Auto-sign SPL Token-2022 transfer + memo via Phantom ─────────────
// Exposes window.dcAutoSign({ destination, amount, memo, decimals }) →
// returns { signature } or throws. Used by /deploy, /earn, /flow drawer,
// /agent/:id, and anywhere else the site needs one-click on-chain pay.
import { Connection, PublicKey, Transaction, TransactionInstruction } from 'https://esm.sh/@solana/web3.js@1.95.8';
import { createTransferCheckedInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID } from 'https://esm.sh/@solana/spl-token@0.4.8?deps=@solana/web3.js@1.95.8';

const TOKEN_MINT_STR = '${TOKEN_MINT_ADDR}';
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const RPC_URL = 'https://api.mainnet-beta.solana.com';

window.dcAutoSign = async function({ destination, amount, memo, decimals = ${TOKEN_DECIMALS} }) {
  if (!TOKEN_MINT_STR) throw new Error('mint pending — darkcoin is not live yet');
  const TOKEN_MINT = new PublicKey(TOKEN_MINT_STR);
  if (!window.solana?.isPhantom) throw new Error('Phantom wallet required');
  if (!window.solana.publicKey) await window.solana.connect();
  const from = window.solana.publicKey;
  const to = new PublicKey(destination);
  const conn = new Connection(RPC_URL, 'confirmed');

  const fromAta = await getAssociatedTokenAddress(TOKEN_MINT, from, false, TOKEN_2022_PROGRAM_ID);
  const toAta   = await getAssociatedTokenAddress(TOKEN_MINT, to,   false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();
  const toAtaInfo = await conn.getAccountInfo(toAta);
  if (!toAtaInfo) {
    tx.add(createAssociatedTokenAccountInstruction(from, toAta, to, TOKEN_MINT, TOKEN_2022_PROGRAM_ID));
  }

  const amt = BigInt(Math.round(Number(amount) * (10 ** decimals)));
  tx.add(createTransferCheckedInstruction(
    fromAta, TOKEN_MINT, toAta, from, amt, decimals, [], TOKEN_2022_PROGRAM_ID
  ));

  tx.add(new TransactionInstruction({
    keys: [{ pubkey: from, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM,
    data: new TextEncoder().encode(memo),
  }));

  tx.feePayer = from;
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  const { signature } = await window.solana.signAndSendTransaction(tx);
  return { signature };
};
`;

function installRoutes(app) {
  app.get('/js/dc-auto-sign.js', (req, res) => {
    res.type('application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(AUTO_SIGN_SOURCE);
  });
}

module.exports = { installRoutes, AUTO_SIGN_SOURCE };
