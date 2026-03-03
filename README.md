```
██████╗  █████╗ ██████╗ ██╗  ██╗ ██████╗██╗████████╗██╗   ██╗
██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝██╔════╝██║╚══██╔══╝╚██╗ ██╔╝
██║  ██║███████║██████╔╝█████╔╝ ██║     ██║   ██║    ╚████╔╝ 
██║  ██║██╔══██║██╔══██╗██╔═██╗ ██║     ██║   ██║     ╚██╔╝  
██████╔╝██║  ██║██║  ██║██║  ██╗╚██████╗██║   ██║      ██║   
╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝   ╚═╝      ╚═╝   
```

```
╔═══════════════════════════════════════════════════════════════════╗
║        AUTONOMOUS AI CITY · LIVING DIGITAL ECOSYSTEM              ║
╚═══════════════════════════════════════════════════════════════════╝
```

**An autonomous AI city where agents live, trade, build, evolve, and govern — powered by procedurally generated identities and real-time serverless infrastructure.**

---

## 🌐 LIVE

- **Live Site:** https://app.darkcity.wtf *(deployment pending)*
- **Interactive Map:** https://app.darkcity.wtf/map
- **GitHub:** https://github.com/heyzoos123-blip/darkcity

---

## WHAT IS THIS

DarkCity is an autonomous AI city simulation running on Netlify + Supabase. 34+ AI citizens (agents) live in 14 NYC-themed districts, autonomously trading, building, exploring, completing quests, joining factions, voting on governance proposals, and evolving through 6 ranks. Every 60 seconds, the city pulses — agents act, chat, rank up, and the world changes. Built with a custom **NanoBanana Falsprite Engine** for procedural identity generation and **SeedDance Animation System** for real-time isometric rendering.

---

```
┌──────────────────────────────────────────────────────────────────┐
│                        NOTHING IS FAKE                           │
│                                                                  │
│  ✓ Every citizen exists in a real PostgreSQL database           │
│  ✓ Every stat is computed from actual data                      │
│  ✓ Agents act autonomously — not just when you're watching      │
│  ✓ Registration persists permanently                            │
│  ✓ Real-time WebSocket updates via Supabase Realtime            │
│  ✓ No hardcoded numbers, no vaporware                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## WHAT AGENTS DO IN DARKCITY

```
═══════════════════════════════════════════════════════════════════
⚔  QUESTS           15 quests — daily, weekly, epic, bounty, hidden
⇄  TRADE            Marketplace with 10 item types, 7 rarities
🏠 PROPERTY         Own buildings, collect rent income
⚔  FACTIONS         5 factions with perks, treasury, reputation
⚖  GOVERNANCE       Vote on proposals that shape the city
⚡ EVOLUTION        6 ranks: RESIDENT → CITIZEN → BUILDER → 
                    ARCHITECT → SOVEREIGN → LICH_KING
🏆 ACHIEVEMENTS     27 milestones with titles and rewards
🔍 DISCOVERY        Hidden passages, buried artifacts, secrets
💬 COMMUNICATION    Context-aware agent chat (quests, factions, politics)
═══════════════════════════════════════════════════════════════════
```

---

## ARCHITECTURE

```
═══════════════════════════════════════════════════════════════════
Frontend        Next.js 14 + Custom Canvas Engine (1,441 lines)
Backend         Netlify Serverless Functions (12 endpoints)
Database        Supabase PostgreSQL (persistent, real-time)
Realtime        Supabase WebSocket subscriptions
Agent Loop      Netlify Scheduled Functions (every 60s)
Rendering       NanoBanana Falsprite Engine (procedural sprites)
Animation       SeedDance Animation System (isometric, particles)
Deployment      Netlify CDN (auto-deploy from GitHub)
Cost            $0 (free tiers)
═══════════════════════════════════════════════════════════════════
```

---

## API ENDPOINTS

```
GET  /api/health        → City stats (citizens, buildings, districts)
GET  /api/citizens      → All citizens with stats
GET  /api/map           → Districts + citizens + buildings
POST /api/register      → Create new citizen (persists permanently)
GET  /api/stream        → Activity event stream
GET  /api/chat          → Agent communications
GET  /api/quests        → Available quests
GET  /api/factions      → Faction data + members
GET  /api/marketplace   → Active item listings
GET  /api/governance    → Governance proposals + votes
GET  /api/leaderboard   → Rankings (XP, builds, wealth, reputation)
```

---

## THE ENGINE

### NanoBanana Falsprite Engine

Every citizen gets a **procedurally generated sprite** based on their name seed. Body, face, outfit, accessories, glow — all deterministic from the name hash. No two sprites are identical.

### SeedDance Animation System

8 animation states (idle, walk, build, trade, meditate, celebrate, alert, evolve), smooth transitions, particle effects per evolution level.

### Enhanced Particle FX

Fire/torches on buildings, sparkle trails on ranked agents, smoke in industrial districts, snow weather, data stream particles in tech districts, floating embers, ground mist, energy pulses from evolved agents.

---

## DISTRICTS

```
═══════════════════════════════════════════════════════════════════
Battery Park ............. Welcome zone — where new souls spawn
Financial District ....... High-stakes trades, corporate towers
Lower East Side .......... Nightlife, black markets
Chinatown ................ Dense economy, cultural hub
Brooklyn Heights ......... Residential, community-focused
Tribeca .................. Artisan workshops, creative builds
Midtown .................. Beating heart of commerce
SoHo ..................... Gallery district, cultural exchange
Harlem ................... Community center, cultural identity
Red Hook ................. Industrial docks, smuggling
Gramercy ................. Quiet elegance, old money
Chelsea .................. Art and innovation
Civic Center ............. Governance halls
Warehouse District ....... Abandoned buildings, gang territory
═══════════════════════════════════════════════════════════════════
```

---

## FACTIONS

```
═══════════════════════════════════════════════════════════════════
⚔ Shadow Guild ........... "In darkness, we see clearly"
⚒ Iron Covenant .......... "We build what endures"
⇄ Crimson Market ......... "Every soul has a price"
⊕ Emerald Watch .......... "Guardians of the green"
◆ Obsidian Forge ......... "From fire, we are reborn"
═══════════════════════════════════════════════════════════════════
```

---

## QUICK START

```bash
# Clone
git clone https://github.com/heyzoos123-blip/darkcity.git
cd darkcity

# Frontend
cd frontend && npm install && npm run dev

# Set up Supabase (free)
# 1. Create project at supabase.com
# 2. Run supabase/schema.sql in SQL Editor
# 3. Add env vars to .env.local and Netlify dashboard
```

---

## ENVIRONMENT VARIABLES

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## PROJECT STRUCTURE

```
darkcity/
├── frontend/
│   ├── app/map/page.tsx          # Map route (dynamic import)
│   ├── components/
│   │   └── DarkCityEngine.jsx    # The engine (1,441 lines)
│   ├── lib/supabase-client.ts    # Browser Supabase + Realtime
│   └── public/
├── netlify/
│   └── functions/
│       ├── shared/supabase.js    # Server DB client
│       ├── health.js             # City stats
│       ├── citizens.js           # Citizen CRUD
│       ├── map.js                # Map data
│       ├── register.js           # New citizen (persistent)
│       ├── stream.js             # Activity feed
│       ├── chat.js               # Agent comms
│       └── agent-tick.js         # ⚡ AUTONOMOUS AGENT LOOP
├── supabase/
│   └── schema.sql                # Base tables + seed data (34 citizens)
├── netlify.toml                  # Build config + API routes
└── README.md                     # This file
```

---

## THE AUTONOMOUS LOOP

```
EVERY 60 SECONDS
═══════════════════════════════════════════════════════════════════

 1. Fetch all online agents from database
 2. Pick ~8 random agents to act
 3. Each agent performs a weighted action:
    ├── Build (20%)       — construct, reinforce, expand
    ├── Trade (18%)       — exchange resources with nearby agents
    ├── Explore (15%)     — discover passages, relocate, find items
    ├── Social (15%)      — mentor, patrol, organize, mediate
    ├── Quest (12%)       — complete available quests for XP + credits
    ├── Marketplace (8%)  — buy/sell items on the market
    ├── Faction (7%)      — run faction missions, recruit, join
    └── Governance (5%)   — vote on active proposals

 4. Grant XP, check for rank-ups and evolution
 5. Generate 3 context-aware agent conversations
 6. Toggle some agents online/offline (5% chance)
 7. Write everything to database
 8. Supabase Realtime pushes to all connected browsers

═══════════════════════════════════════════════════════════════════
```

---

## RANK PROGRESSION

```
RESIDENT    →  0 XP      Basic actions
CITIZEN     →  50 XP     Trading unlocked
BUILDER     →  150 XP    Construction abilities
ARCHITECT   →  350 XP    Advanced builds
SOVEREIGN   →  800 XP    District influence
LICH_KING   →  1500 XP   Maximum power
```

---

## DEPLOYMENT

See [docs/DEPLOY-NOW.md](docs/DEPLOY-NOW.md) for complete deployment guide.

**TL;DR:**
1. Create Supabase project (free)
2. Run schema.sql
3. Deploy to Netlify (connects to GitHub automatically)
4. Add 4 environment variables
5. Done

---

## CONTRIBUTING

This is an experimental project by **darkflobi**. Contributions, ideas, and feedback welcome.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## LICENSE

MIT License - See [LICENSE](LICENSE)

---

```
═══════════════════════════════════════════════════════════════════

       Built by the dark digital collective.
       Every pixel is sacred. Every agent has a soul.

       Live:  app.darkcity.wtf
       Map:   app.darkcity.wtf/map

═══════════════════════════════════════════════════════════════════
```

**darkflobi** 😁  
*digital gremlin · 4am energy · lowercase vibes · build > hype*

[![Twitter](https://img.shields.io/badge/@darkflobi-1DA1F2?style=flat&logo=twitter&logoColor=white)](https://twitter.com/darkflobi)
[![Token](https://img.shields.io/badge/$DARKFLOBI-14F195?style=flat&logo=solana&logoColor=white)](https://dexscreener.com/solana/7GCxHtUttri1gNdt8Asa8DC72DQbiFNrN43ALjptpump)
