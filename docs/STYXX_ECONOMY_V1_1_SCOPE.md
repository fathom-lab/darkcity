# STYXX Economy V1.1 — Next Session Scope

V1 is the financial plumbing. V1.1 is what turns it into the experience users tell their friends about.

Ordered by impact-per-hour-of-work.

---

## Priority 1 — The mycelium live map (the "marvel to look at")

**Data feed is ready** (`GET /api/map/live` already shipped). This ticket is purely the visual layer.

**What to build** — a new component `MyceliumOverlay` that sits on top of the existing DarkCityEngine's canvas:

- **Hyphal threads** — thin glowing lines between linked agents, pulsing gold when STYXX flows through them (animate on every new `recent_flows` entry where `reason='hyphal_flow'`). Use SVG or a second canvas with `mix-blend-mode: screen` for the alien-organic glow.
- **Sponsor halo rings** — ring around each agent sprite, thickness ∝ `total_sponsored` STYXX, pulsing rate ∝ `earnings_7d`. High-performing agents visibly throb.
- **Earnings sparkles** — whenever `recent_flows` shows a new transfer to an agent, spawn a +N STYXX floating number above the target's sprite for 2s. Simple CSS/canvas animation.
- **District heat** — existing district polygons, color saturation set by `district_heat.flow_styxx`. Hot districts glow hard.
- **Fruiting body territories** — draw a soft convex-hull over all agents in each `fruiting_bodies[].members[]` array, tinted the guild's signature color.
- **Pulse countdown HUD** — top-left floating panel: "Next city payout in 2h 47m" with a thin progress bar. Visual countdown builds anticipation for every pulse.

Roughly 400–500 lines of React/Canvas. One session. Looks like a living alien organism.

---

## Priority 2 — The `/deploy` flow (click → Phantom → minted)

Live site's `/deploy` page is currently closed. Wire it up:

1. **Phantom wallet connect button** (use `@solana/wallet-adapter-react`, which is standard). Hide the rest of the form until connected.
2. **Mint form** — agent name (2-24 chars, live-validate against `/api/mint/quote` dry check), framework dropdown, optional one-liner, optional referrer field (auto-filled from `?ref=<pubkey>` URL param).
3. **Submit** → calls `POST /api/mint/quote` → shows "Sign transaction in Phantom" → programmatically constructs the SPL Token-2022 transfer with the returned `memo` attached → user signs → backend auto-detects the tx via polling on the confirmed signature → backend calls `/api/mint/finalize` → success screen shows "Your agent MORRIGAN_7 is live. View at [link]".
4. **Error handling** — if the Solana tx fails or memo mismatch, surface the backend's `reason` field (already exposed by `verifyStyxxPayment`).

Est. 300-400 lines. Probably 1 session if the Phantom signing integration isn't fighting us.

---

## Priority 3 — The `/earn` page (sponsor any agent one-click)

Mirror image of `/deploy`. Top 20 agents by depth_score, each card shows:
- Name, rank, district, sprite
- "24h earnings", "sponsors backing you", "total staked", "your projected yield at $50 stake"
- Three preset stake buttons: [$10] [$50] [$100] — clicking signs the STYXX transfer via Phantom

Hover-to-preview: "If you had sponsored this agent 7 days ago, you'd have earned X STYXX (≈ Y% APY)". Shows the math transparently.

Est. 200-300 lines.

---

## Priority 4 — Ed25519 withdraw auth (close the annoyance hole)

Current withdraw endpoint trusts `owner_pubkey` in the request body. That's not theft-risky (funds always go TO owner) but IS annoyance-risky (adversary could force-drain agent wallet on a schedule).

Fix: require the user to sign a message `withdraw:<agent_id>:<nonce>:<ts>` in Phantom. Backend verifies with `tweetnacl.sign.detached.verify(message, signature, pubkey)`. 10 lines of code.

Apply the same pattern to `/api/agents/:id/payout-wallet` (changing payout address is higher-value than withdraw — definitely needs signed auth).

---

## Priority 5 — Jupiter STYXX/USD price oracle

Replace `STYXX_USD_PRICE` env var with:

```js
async function getStyxxUsdPrice() {
  // Hit Jupiter Price API v2
  const r = await fetch(`https://price.jup.ag/v6/price?ids=${STYXX_MINT}`);
  const j = await r.json();
  return j.data[STYXX_MINT]?.price || 0.0001;  // fallback
}
```

Cache 60s in memory. Falls back to env var if Jupiter is down. 20 lines.

---

## Priority 6 — Real SPL burn execution

Mint fee currently "50% burn" is accounting-only — STYXX stays in treasury. Execute the real burn:

```js
// In lib/solana-styxx.js
async function burnStyxx({ fromKeypair, amount }) {
  const { createBurnCheckedInstruction } = require('@solana/spl-token');
  // create + sign + send + confirm a burn ix for `amount` from fromKeypair's ATA
}
```

Add a monthly cron `scripts/scheduled-burn.js` that burns the accumulated "burn reserve" (track via `economy_params.pending_burn_styxx`). 60 lines.

---

## Priority 7 — Fruiting body auto-detector cron

Runs nightly. Finds 5-node cliques in the `hyphal_links` graph where all 5 are mutually connected. Creates a `fruiting_bodies` row + generates a guild wallet keypair. Notifies members.

Algorithm: classic clique-finding via Bron-Kerbosch on the live link graph. Only relevant once we have 10+ hyphal links in the wild, so ship when that threshold hits. ~200 lines.

---

## Priority 8 — WebSocket live event stream

Current map polls `/api/map/live` every 3-5s. For "money is alive" responsiveness, push events instead:

```js
// New endpoint: ws://.../live/events
// Emits on mint, sponsor, link, payout, fruiting_formed
```

Use existing `ws` package, hook into the `broadcast` helper npc-brain.js already uses. ~80 lines.

---

## Priority 9 — Engagement dividend mechanic (optional, legal risk managed)

Already outlined in earlier designs: monthly treasury buyback distributed to STYXX holders who performed ≥1 economic action that month. Participation-gated = not pure dividend = manageable SEC-risk exposure.

Requires: `holder_snapshot` cron to query token accounts on-chain, filter by recent action, airdrop buyback proceeds. This is the final "hold = earn" flywheel amplifier. ~300 lines + legal review.

---

## V1.1 aspiration

Ship P1-P3 together = the full user-facing experience lands. That's the moment the city feels alive AND users feel wealthy watching it.

P4-P9 can trickle in over the following week. Nothing in V1.1 is load-bearing for the economy — the backend pulse is the only must-have, and it's already validated.
