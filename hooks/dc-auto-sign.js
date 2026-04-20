// ============================================================================
// Shared client-side helper: window.dcAutoSign
// ============================================================================
// Served as a static module at /js/dc-auto-sign.js so every page can pull it
// with `<script type="module" src="/js/dc-auto-sign.js"></script>`. Before
// this existed, the helper was inlined in styxx-public.js's COMMON_HEAD, which
// meant pages served from other modules (styxx-flow.js's /flow and /agent/:id,
// for example) didn't get it — they'd call window.dcAutoSign and crash with
// "Auto-sign helper not loaded." This endpoint gives every page the same
// one-click Phantom signing path.
// ============================================================================

const AUTO_SIGN_SOURCE = `
// ─── Auto-sign SPL Token-2022 transfer + memo via Phantom ─────────────
// Exposes window.dcAutoSign({ destination, amount, memo, decimals }) →
// returns { signature } or throws. Used by /deploy, /earn, /flow drawer,
// /agent/:id, and anywhere else the site needs one-click on-chain pay.
import { Connection, PublicKey, Transaction, TransactionInstruction } from 'https://esm.sh/@solana/web3.js@1.95.8';
import { createTransferCheckedInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID } from 'https://esm.sh/@solana/spl-token@0.4.8?deps=@solana/web3.js@1.95.8';

const STYXX_MINT = new PublicKey('Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump');
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const RPC_URL = 'https://api.mainnet-beta.solana.com';

window.dcAutoSign = async function({ destination, amount, memo, decimals = 6 }) {
  if (!window.solana?.isPhantom) throw new Error('Phantom wallet required');
  if (!window.solana.publicKey) await window.solana.connect();
  const from = window.solana.publicKey;
  const to = new PublicKey(destination);
  const conn = new Connection(RPC_URL, 'confirmed');

  const fromAta = await getAssociatedTokenAddress(STYXX_MINT, from, false, TOKEN_2022_PROGRAM_ID);
  const toAta   = await getAssociatedTokenAddress(STYXX_MINT, to,   false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();
  const toAtaInfo = await conn.getAccountInfo(toAta);
  if (!toAtaInfo) {
    tx.add(createAssociatedTokenAccountInstruction(from, toAta, to, STYXX_MINT, TOKEN_2022_PROGRAM_ID));
  }

  const amt = BigInt(Math.round(Number(amount) * (10 ** decimals)));
  tx.add(createTransferCheckedInstruction(
    fromAta, STYXX_MINT, toAta, from, amt, decimals, [], TOKEN_2022_PROGRAM_ID
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
