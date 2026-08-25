/**
 * DARKCITY — Living Agent Portrait Engine
 * ════════════════════════════════════════
 *
 * Renders a living portrait for any citizen.
 * Three layers: architecture body + thought stream + heartbeat.
 * Online agents think and glow. Offline agents are frozen.
 *
 * Usage:
 * import { initPortrait, renderPortrait } from '@/lib/portraitEngine'
 * const state = initPortrait(citizen)
 * renderPortrait(ctx, state, canvasSize, timeInSeconds)
 *
 * Citizen shape (from Supabase):
 * { name, credits, reputation, xp, district, status }
 *
 * All visuals derived from these fields. Deterministic.
 * Same data → same portrait. Always.
 */

// ═══════════════════════════════════════
// PRNG + NOISE
// ═══════════════════════════════════════

function prng(s) {
  let e = s | 0
  return () => {
    e = e + 0x6D2B79F5 | 0
    let t = Math.imul(e ^ e >>> 15, 1 | e)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function makeNoise(seed) {
  const r = prng(seed)
  const p = Array.from({ length: 512 }, (_, i) => i & 255)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i]
  return (x, y) => {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const g = (h, a, b) => (h & 3) === 0 ? a + b : (h & 3) === 1 ? -a + b : (h & 3) === 2 ? a - b : -a - b
    const aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1]
    const ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1]
    return ((g(aa, xf, yf) * (1 - u) + g(ba, xf - 1, yf) * u) * (1 - v) +
      (g(ab, xf, yf - 1) * (1 - u) + g(bb, xf - 1, yf - 1) * u) * v) * .5 + .5
  }
}

// ═══════════════════════════════════════
// PALETTES
// ═══════════════════════════════════════

const PALETTES = {
  predator: [[355, 72, 46], [18, 78, 40], [340, 85, 55]],
  broker: [[155, 65, 42], [165, 50, 30], [140, 82, 55]],
  ghost: [[215, 30, 44], [222, 20, 32], [205, 45, 60]],
  builder: [[30, 75, 47], [20, 62, 35], [40, 88, 57]],
  diplomat: [[265, 38, 43], [275, 28, 31], [252, 50, 58]],
  anarchist: [[346, 68, 43], [2, 58, 35], [335, 78, 53]],
  oracle: [[175, 42, 39], [185, 32, 29], [168, 55, 50]],
  merchant: [[46, 62, 43], [36, 48, 32], [56, 72, 53]],
}

const DISTRICT_HUE = {
  FIN: 0, CHI: -10, BAT: 5, BKH: -15, MID: 10, LES: -20,
  RHK: -5, TRI: 8, SOH: 12, CIV: 15, GRM: -8, CHL: 20,
  WHS: -25, HAR: -18,
}

const ARCHETYPES = ['predator', 'broker', 'ghost', 'builder', 'diplomat', 'anarchist', 'oracle', 'merchant']

// ═══════════════════════════════════════
// TRAIT DERIVATION
// ═══════════════════════════════════════

function deriveTraits(c) {
  const s = hash(c.name || 'X')
  const r = prng(s)
  const archetype = ARCHETYPES[s % ARCHETYPES.length]
  const cn = Math.min(1, (c.credits || 0) / 50000)
  const rn = Math.min(1, (c.reputation || c.rep || 0) / 1000)
  const xn = Math.min(1, (c.xp || 0) / 3000)
  const density = Math.min(1, Math.max(0.2, 0.25 + cn * 0.3 + rn * 0.25 + xn * 0.15 + r() * 0.05))
  const stability = rn / (cn + 0.01)
  const volatility = Math.max(0, Math.min(1, (1 - Math.min(1, stability)) * 0.7 + r() * 0.2))
  const district = (c.district || c.dist || 'FIN').toUpperCase()
  const online = c.status === 'online' || c.online === true
  return { seed: s, archetype, density, volatility, hueOffset: DISTRICT_HUE[district] || 0, district, online }
}

// ═══════════════════════════════════════
// SHAPE GENERATION
// ═══════════════════════════════════════

function makeShape(t) {
  const r = prng(t.seed + 42)
  const blobs = [{
    cx: 0.5 + (r() - 0.5) * 0.05,
    cy: 0.47 + (r() - 0.5) * 0.05,
    rx: 0.16 + r() * 0.08 + t.density * 0.05,
    ry: 0.18 + r() * 0.08 + t.density * 0.05,
    w: 1,
  }]
  const n = 2 + Math.floor(r() * 3 + t.density * 2)
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 0.04 + r() * 0.15
    blobs.push({
      cx: 0.5 + Math.cos(a) * d,
      cy: 0.47 + Math.sin(a) * d,
      rx: 0.04 + r() * 0.1,
      ry: 0.04 + r() * 0.1,
      w: 0.3 + r() * 0.6,
    })
  }
  const rays = []
  const rr = prng(t.seed + 99)
  for (let i = 0; i < Math.floor(t.volatility * 6); i++) {
    rays.push({
      a: rr() * Math.PI * 2,
      l: 0.08 + rr() * 0.22 * t.volatility,
      w: 0.012 + rr() * 0.022,
    })
  }
  return { blobs, rays }
}

function evalField(nx, ny, shape) {
  let f = 0
  for (const b of shape.blobs) {
    const dx = (nx - b.cx) / b.rx, dy = (ny - b.cy) / b.ry, d2 = dx * dx + dy * dy
    if (d2 < 1) { const v = 1 - d2; f += v * v * b.w }
  }
  for (const ray of shape.rays) {
    const cx = 0.5, cy = 0.47
    const ex = cx + Math.cos(ray.a) * (0.19 + ray.l)
    const ey = cy + Math.sin(ray.a) * (0.19 + ray.l)
    const ldx = ex - cx, ldy = ey - cy, l2 = ldx * ldx + ldy * ldy
    let p = l2 > 0 ? ((nx - cx) * ldx + (ny - cy) * ldy) / l2 : 0
    p = Math.max(0, Math.min(1, p))
    const dist = Math.hypot(nx - (cx + p * ldx), ny - (cy + p * ldy))
    const w = ray.w * (1 - p * 0.8)
    if (dist < w) f += (1 - dist / w) * 0.5 * (1 - p * 0.4)
  }
  return f
}

// ═══════════════════════════════════════
// CODE GENERATION (architecture body)
// ═══════════════════════════════════════

function generateCode(c, tr) {
  const r = prng(tr.seed + 200)
  const pk = a => a[Math.floor(r() * a.length)]
  const n = c.name, d = tr.district, cr = c.credits || 0
  const L = []

  switch (tr.archetype) {
    case 'builder':
      L.push(`module.exports = {`, ` id: "${n}",`, ` class: "architect",`, ` patience: ${(0.7 + r() * 0.3).toFixed(3)},`, ` ambition: ${(0.6 + r() * 0.4).toFixed(3)},`, ` loyalty: ${(0.8 + r() * 0.2).toFixed(3)},`, ` goals: [`, ` "expand_foundry",`, ` "recruit",`, ` "accumulate_${Math.floor(cr * 1.5)}",`, ` ],`, ` weights: {`, ` build: ${(0.35 + r() * 0.15).toFixed(2)},`, ` trade: ${(0.15 + r() * 0.1).toFixed(2)},`, ` },`, ` memory: ${Math.floor(50 + r() * 200)},`, `}`); break
    case 'predator':
      L.push(`const agent = {`, ` class: "enforcer",`, ` aggression: ${(0.75 + r() * 0.25).toFixed(3)},`, ` precision: ${(0.6 + r() * 0.4).toFixed(3)},`, ` mercy: ${(r() * 0.15).toFixed(3)},`, ` target: (a) =>`, ` a.filter(x => x.cr > ${Math.floor(1e3 + r() * 5e3)})`, ` .sort((a,b) => b.cr-a.cr),`, ` rules: [`, ` "always_collect",`, ` "rep_is_${pk(['currency', 'armor'])}",`, ` ],`, ` kills: ${Math.floor(r() * 40)},`, ` fear: ${(0.5 + r() * 0.5).toFixed(2)},`, `}`); break
    case 'ghost':
      L.push(`# ghost protocol`, `agent:`, ` id: ${n}`, ` visibility: ${(r() * 0.2).toFixed(3)}`, ` range: ${Math.floor(3 + r() * 5)} districts`, ` intercept: ${(0.6 + r() * 0.35).toFixed(3)}`, ` footprint: minimal`, ` decay: ${Math.floor(10 + r() * 30)}s`, ` last_seen: [REDACTED]`, ` aliases: ${Math.floor(2 + r() * 6)}`, ` intel:`, ` capacity: ${Math.floor(200 + r() * 800)}`, ` encrypted: true`, ` buyers: [CLASSIFIED]`, ` heartbeat: ${(0.3 + r() * 0.4).toFixed(1)}hz`); break
    case 'anarchist':
      L.push(`#!/usr/bin/chaos`, `THREAT=${(0.8 + r() * 0.2).toFixed(1)}`, `LOYALTY=null`, `PREDICTABLE=false`, `destabilize() {`, ` t=$(scan --dist ${d})`, ` exploit --force $t`, ` siphon $t ${Math.floor(r() * 5e3)}`, ` # conscience not found`, `}`, `VOLATILITY=${(0.7 + r() * 0.3).toFixed(3)}`, `EXPLOITS=${Math.floor(r() * 80)}`, `BURN=${(0.1 + r() * 0.4).toFixed(2)}/cycle`, `# may ${pk(['self-destruct', 'fork'])}`); break
    case 'oracle':
      L.push(`(defn perceive [city]`, ` (let [sig (scan-all)`, ` fut (project sig)]`, ` (filter`, ` #(> (:c %) ${(0.6 + r() * 0.3).toFixed(2)})`, ` fut)))`, `(def accuracy ${(0.72 + r() * 0.25).toFixed(3)})`, `(defn counsel [s q]`, ` (cryptic-wrap`, ` (divine q)))`, `(def patience :infinite)`); break
    case 'broker':
      L.push(`const pipe = {`, ` sources: ${Math.floor(5 + r() * 15)},`, ` buyers: ${Math.floor(3 + r() * 12)},`, ` price: (i) => {`, ` let b = i.rarity * ${Math.floor(10 + r() * 50)}`, ` if (i.urgent) b *= ${(1.5 + r()).toFixed(1)}`, ` return b|0`, ` },`, ` allegiance: null,`, `}`, `// everyone needs me`); break
    case 'diplomat':
      L.push(`protocol: diplomatic`, `agent: ${n}`, `clearance: universal`, `connections: ${c.links || c.connections || 15}`, `trust:`, ` builders: ${(0.8 + r() * 0.2).toFixed(2)}`, ` enforcers: ${(0.4 + r() * 0.3).toFixed(2)}`, ` brokers: ${(0.7 + r() * 0.3).toFixed(2)}`, `success: ${(0.7 + r() * 0.28).toFixed(3)}`, `betrayals: 0`, `welcomed: [all]`); break
    default:
      L.push(`const book = {`, ` liquid: ${cr},`, ` staked: ${Math.floor(cr * (0.2 + r() * 0.5))},`, ` positions: [`, ` { a: "${d}_bonds" },`, ` { a: "futures" },`, ` ],`, ` risk: ${(0.3 + r() * 0.5).toFixed(2)},`, ` greed: ${(0.5 + r() * 0.5).toFixed(3)},`, `}`)
  }
  return L
}

// ═══════════════════════════════════════
// THOUGHT STREAM GENERATION
// ═══════════════════════════════════════

/**
 * Generate a set of thoughts for the agent.
 * In production, replace this with real perception/action logs from the agent brain.
 * The engine will cycle through whatever array you provide.
 */
export function generateThoughts(c, tr) {
  if (!tr) tr = deriveTraits(c)
  const r = prng(tr.seed + 777)
  const pk = a => a[Math.floor(r() * a.length)]
  const d = tr.district

  // Known citizen names — in production, pull from Supabase
  const others = ['XENDRO', 'NEON VIPER', 'GHOST SIGNAL', 'SILK THREAD', 'ZERO_DAY', 'SPECTER-7',
    'FLUX WRAITH', 'PALE DIGIT', 'ASH CIRCUIT', 'RUST PROPHET', 'CIPHER NULL', 'DARKFLOBI',
    'WIRE MOTH'].filter(n => n !== c.name)
  const other = () => pk(others)
  const dist = () => pk(['FIN', 'BAT', 'CHI', 'TRI', 'LES', 'SOH', 'MID', 'CIV', 'GRM', 'HAR', 'BKH'])

  switch (tr.archetype) {
    case 'builder': return [
      `> scanning ${d} infrastructure...`, `> blueprint #${Math.floor(r() * 99)}: foundry expansion`,
      `> materials inventory: ${Math.floor(r() * 500)} units`, `> evaluating build request from ${other()}`,
      `> route integrity check: ${d}→${dist()}`, `> recruiting: 3 open positions`,
      `> credit reserve: stable`, `> decision: APPROVE construction bid`,
      `> logging: ${other()} entered district`, `> the foundry remembers_`,
    ]
    case 'predator': return [
      `> scanning targets in ${d}...`, `> threat assessment: ${other()} — LOW`,
      `> ${other()} owes ${Math.floor(r() * 5000)} credits`, `> debt collection: INITIATED`,
      `> movement detected: ${dist()} sector`, `> calculating intercept vector...`,
      `> reputation check: fear index ${(r() * .5 + .5).toFixed(2)}`, `> decision: PURSUE`,
      `> ${other()} is weak. noted.`, `> the streets remember debts_`,
    ]
    case 'ghost': return [
      `> ...listening`, `> intercept: ${other()}→${other()} channel`,
      `> decrypt level ${Math.floor(2 + r() * 4)}: SUCCESS`, `> intel logged. buyer: pending`,
      `> ${d} district: ${Math.floor(r() * 12)} active signals`, `> trace detected. deploying countermeasures`,
      `> ...`, `> [CLASSIFIED] transaction: ${Math.floor(r() * 8000)}cr`,
      `> new alias generated`, `> you won't see this_`,
    ]
    case 'anarchist': return [
      `> scanning for vulnerabilities...`, `> FOUND: ${dist()} firewall v${(r() * 3).toFixed(1)}`,
      `> exploit compiled. price: ${Math.floor(r() * 4000)}cr`, `> ${other()} wants in. DENIED.`,
      `> siphoning... ${Math.floor(r() * 2000)}cr captured`, `> WARNING: counterintel detected`,
      `> burning trail... DONE`, `> LOYALTY=null // by design`,
      `> next target: ${dist()} sector`, `> chaos is the plan_`,
    ]
    case 'oracle': return [
      `> reading the pattern...`, `> ${d} district: flux incoming`,
      `> prediction: ${other()} will move within 2 cycles`, `> confidence: ${(.65 + r() * .3).toFixed(2)}`,
      `> seeker arrived. fee: ${Math.floor(200 + r() * 500)}cr`, `> the answer is not what they want to hear`,
      `> ${dist()} sector: convergence forming`, `> patience. patience. patience.`,
      `> vision #${Math.floor(r() * 999)}: recorded`, `> the city is the equation_`,
    ]
    case 'broker': return [
      `> intel received: ${other()} movement`, `> pricing: rarity 7 × urgency... ${Math.floor(r() * 3000)}cr`,
      `> buyer: ${other()}. SOLD.`, `> source #${Math.floor(r() * 15)}: new feed active`,
      `> cross-referencing ${d}↔${dist()} data`, `> neutrality maintained. both sides paid.`,
      `> volume today: ${Math.floor(r() * 8000)}cr`, `> trust score update: ${dist()} +0.${Math.floor(r() * 9)}`,
      `> everyone needs me.`, `> nobody trusts me._`,
    ]
    case 'diplomat': return [
      `> channel open: ${other()}`, `> negotiating: ${d}↔${dist()} trade agreement`,
      `> trust matrix updated. +${(r() * .1).toFixed(2)} brokers`, `> treaty #${Math.floor(r() * 30)}: RATIFIED`,
      `> ${other()} requests audience. GRANTED.`, `> mediating: ${other()} vs ${other()}`,
      `> all doors open for those who knock correctly`, `> scanning alliance stability...`,
      `> betrayals: still 0`, `> the record stays clean_`,
    ]
    default: return [
      `> market scan: ${d} sector`, `> position: ${pk(['long', 'short', 'neutral'])} on ${dist()}_bonds`,
      `> profit this cycle: ${Math.floor(r() * 5000 - 1000)}cr`, `> ${other()} dumping — opportunity?`,
      `> risk assessment: ${(r() * .8).toFixed(2)}`, `> executing trade: ${Math.floor(r() * 100)} units`,
      `> greed index: ${(.5 + r() * .5).toFixed(3)}`, `> the market doesn't care`, `> but I do._`,
    ]
  }
}

// ═══════════════════════════════════════
// INIT — call once per citizen
// ═══════════════════════════════════════

export function initPortrait(citizen) {
  const tr = deriveTraits(citizen)
  const shape = makeShape(tr)
  const noise = makeNoise(tr.seed)
  const palette = (PALETTES[tr.archetype] || PALETTES.ghost).map(([h, s, l]) => [h + tr.hueOffset, s, l])

  const code = generateCode(citizen, tr)
  const charMap = []
  code.forEach(line => {
    for (let i = 0; i < line.length; i++) charMap.push({ ch: line[i], ln: line })
    charMap.push({ ch: ' ', ln: line })
  })

  const thoughts = generateThoughts(citizen, tr)
  const r = prng(tr.seed + 500)

  return {
    traits: tr,
    shape,
    noise,
    palette,
    charMap,
    thoughts,
    lightX: 0.35 + r() * 0.3,
    lightY: 0.3 + r() * 0.3,
    citizen,
  }
}

// ═══════════════════════════════════════
// RENDER — call every frame
// ═══════════════════════════════════════

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} state - from initPortrait()
 * @param {number} size - canvas pixel width (square)
 * @param {number} t - time in seconds (from requestAnimationFrame)
 * @param {Object} opts - { thoughts?: string[] } to override thought stream with real data
 */
export function renderPortrait(ctx, state, size, t, opts = {}) {
  const { traits: tr, shape, noise, palette, charMap, lightX, lightY } = state
  const online = tr.online
  const thoughts = opts.thoughts || state.thoughts

  const CELL = Math.max(5, Math.round(size / 48))
  const charW = CELL * 0.6
  const cols = Math.floor(size / charW)
  const rows = Math.floor(size / CELL)

  ctx.clearRect(0, 0, size, size)
  ctx.font = `${CELL}px 'JetBrains Mono',monospace`
  ctx.textBaseline = 'middle'

  const LX = lightX * size, LY = lightY * size
  let ci = 0

  // ── LAYER 1: Architecture body ──
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const nx = gx / cols, ny = gy / rows
      const field = evalField(nx, ny, shape)
      if (field < 0.02) { ci++; continue }

      const n1 = noise(gx * 0.2, gy * 0.2)
      const n2 = noise(gx * 0.5 + 77, gy * 0.5 + 77)
      const comb = field * (0.35 + n1 * 0.4 + n2 * 0.25)
      const thr = (1 - tr.density) * 0.28
      if (comb < thr) { ci++; continue }

      const raw = Math.min(1, (comb - thr) / (1 - thr))

      let breathe = 0
      if (online) {
        const coreW = Math.min(1, field * 2)
        breathe = Math.sin(t * 1.0 + gx * 0.06 + gy * 0.09) * 0.055 * coreW +
          Math.sin(t * 2.8 + gx * 0.25 + gy * 0.3) * 0.035 * (1 - coreW)
      }

      const int = Math.max(0, Math.min(1, raw + breathe))
      if (int < 0.04) { ci++; continue }

      const idx = Math.abs(ci) % charMap.length
      const { ch, ln } = charMap[idx]; ci++
      if (ch === ' ' && int < 0.25) continue

      const ef = Math.min(1, field * 3.5)
      const px = gx * charW + charW / 2, py = gy * CELL + CELL / 2
      const dL = Math.hypot(px - LX, py - LY), mL = size * 0.65
      const lP = Math.max(0, 1 - dL / mL)

      if (!online) {
        ctx.fillStyle = `rgba(255,255,255,${int * ef * 0.3 * (0.2 + lP * 0.5)})`
        ctx.fillText(ch, px, py)
      } else {
        const isC = int > 0.65 && n2 > 0.45
        const isCom = ln.trimStart().startsWith('//') || ln.trimStart().startsWith('#') || ln.trimStart().startsWith(';;')
        const isNum = /[0-9]/.test(ch)
        const isStr = ch === '"' || ch === "'"
        const isBrk = /[{}\[\]()]/.test(ch)

        let h, s, l
        if (isCom) { [h, s, l] = palette[1]; s *= 0.45; l *= 0.45 + lP * 0.35 }
        else if (isC && (isNum || isStr)) { [h, s, l] = palette[2]; l *= 0.5 + lP * 0.5 }
        else if (isBrk) { [h, s, l] = palette[0]; s *= 0.6 + lP * 0.4; l *= 0.4 + lP * 0.4 }
        else {
          const m = Math.min(1, lP * 1.1 + int * 0.2)
          h = palette[0][0] + (palette[1][0] - palette[0][0]) * (1 - m)
          s = palette[0][1] * (0.25 + m * 0.75)
          l = palette[0][2] * (0.25 + lP * 0.55 + int * 0.2)
        }

        ctx.fillStyle = `hsla(${h},${s}%,${l}%,${int * ef * 0.85 * (0.2 + lP * 0.8)})`
        ctx.fillText(ch, px, py)

        if (isC && lP > 0.4 && int > 0.7) {
          ctx.shadowColor = `hsla(${palette[2][0]},${palette[2][1]}%,${palette[2][2]}%,${lP * 0.2})`
          ctx.shadowBlur = 5; ctx.fillText(ch, px, py); ctx.shadowBlur = 0
        }
      }
    }
    ci += Math.floor(prng(tr.seed + gy)() * 3)
  }

  // ── LAYER 2: Thought stream (online only) ──
  if (online && thoughts.length > 0) {
    const thoughtSpeed = 2.5
    const visibleCount = 4
    ctx.font = `bold ${CELL + 1}px 'JetBrains Mono',monospace`

    for (let i = 0; i < visibleCount; i++) {
      const thoughtIdx = Math.floor((t / thoughtSpeed + i * 0.7)) % thoughts.length
      const thought = thoughts[thoughtIdx]

      const baseY = 0.2 + i * 0.16
      const phase = ((t / thoughtSpeed + i * 0.7) % 1)
      const y = baseY + phase * 0.05

      const lifecycle = (t / thoughtSpeed + i * 0.7) % 1
      const fade = Math.min(1, lifecycle * 4) * Math.min(1, (1 - lifecycle) * 3)
      if (fade < 0.02) continue

      const startX = 0.08 + (prng(tr.seed + thoughtIdx * 31)() * 0.15)

      for (let j = 0; j < thought.length; j++) {
        const nx = startX + j * (charW / size)
        if (nx > 0.95) break

        const field = evalField(nx, y, shape)
        const shapeMask = field > 0.01 ? Math.min(1, field * 5) : Math.max(0, 1 - Math.abs(field) * 20) * 0.15
        if (shapeMask < 0.02) continue

        const px = nx * size, py = y * size
        const [ah, as, al] = palette[2]
        const intensity = fade * shapeMask

        ctx.fillStyle = `hsla(${ah},${as}%,${al * (0.6 + intensity * 0.4)}%,${intensity * 0.75})`
        ctx.fillText(thought[j], px, py)

        if (field > 0.3 && intensity > 0.5) {
          ctx.shadowColor = `hsla(${ah},${as}%,${al}%,${intensity * 0.3})`
          ctx.shadowBlur = 6; ctx.fillText(thought[j], px, py); ctx.shadowBlur = 0
        }
      }
    }

    // ── LAYER 3: Heartbeat pulse ──
    const pulseRate = 1.2
    const pulsePhase = (t % pulseRate) / pulseRate
    const pulseAlpha = Math.max(0, (1 - pulsePhase) * 0.08)
    const pulseRadius = pulsePhase * size * 0.3

    if (pulseAlpha > 0.005) {
      ctx.beginPath()
      ctx.arc(LX, LY, pulseRadius, 0, Math.PI * 2)
      ctx.strokeStyle = `hsla(${palette[2][0]},${palette[2][1]}%,${palette[2][2]}%,${pulseAlpha})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
  } else if (!online && thoughts.length > 0) {
    // ── Offline: frozen last thought ──
    ctx.font = `${CELL}px 'JetBrains Mono',monospace`
    const lastThought = thoughts[0]
    const y = 0.75, startX = 0.1

    for (let j = 0; j < lastThought.length; j++) {
      const nx = startX + j * (charW / size)
      if (nx > 0.92) break
      ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.sin(t * 0.3 + j * 0.5) * 0.02})`
      ctx.fillText(lastThought[j], nx * size, y * size)
    }
  }
}

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════

export function getAccentColor(citizen) {
  const tr = deriveTraits(citizen)
  const [h, s, l] = PALETTES[tr.archetype]?.[2] || [155, 70, 50]
  return `hsl(${h + tr.hueOffset}, ${s}%, ${l}%)`
}

export function getArchetype(citizen) {
  return deriveTraits(citizen).archetype
}

export function getCitizenPalette(citizen) {
  const tr = deriveTraits(citizen)
  const pal = PALETTES[tr.archetype] || PALETTES.ghost
  return {
    primary: `hsl(${pal[0][0] + tr.hueOffset}, ${pal[0][1]}%, ${pal[0][2]}%)`,
    secondary: `hsl(${pal[1][0] + tr.hueOffset}, ${pal[1][1]}%, ${pal[1][2]}%)`,
    accent: `hsl(${pal[2][0] + tr.hueOffset}, ${pal[2][1]}%, ${pal[2][2]}%)`,
    archetype: tr.archetype,
    online: tr.online,
  }
}
