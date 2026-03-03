# 👋 FLOBI - START HERE

## WHAT I'VE DONE (while you were driving to work)

darkflobi prepped everything for darkcity v8 deployment. **Everything is ready to go.**

---

## 📁 LOCATION

All deployment files are here:
```
C:\Users\heyzo\clawd\projects\darkcity-deploy\
```

---

## 📋 WHAT'S IN THIS FOLDER

### ✅ Complete & Ready

- `netlify.toml` — Build config + API redirects + scheduled functions
- `netlify/functions/` — 8 serverless functions (health, citizens, map, register, stream, chat, agent-tick, shared/supabase)
- `supabase/schema.sql` — Complete database schema (34 citizens, 14 districts, all tables)
- `frontend/` — Next.js app with realtime integration
  - `app/map/page.tsx` — Map interface
  - `components/DarkCityEngine.jsx` — NanoBanana Falsprite renderer
  - `lib/supabase-client.ts` — Browser Supabase client
  - All Next.js config files (package.json, next.config.ts, tsconfig.json, etc.)
- `.gitignore` — Proper git ignore rules

### 📚 Guides I Wrote For You

1. **README.md** — Complete technical documentation
2. **DEPLOYMENT-CHECKLIST.md** — Step-by-step checklist (check boxes as you go)
3. **QUICK-REFERENCE.md** — Copy/paste commands and URLs
4. **FLOBI-READ-ME-FIRST.md** — This file (you are here)

---

## 🚀 DEPLOYMENT STEPS (35 minutes total)

### Your workflow options:

**OPTION A: Do it all now** (you have 35 min focus time)
→ Open `DEPLOYMENT-CHECKLIST.md` and follow step-by-step

**OPTION B: Do Supabase now, rest later** (10 min now, 25 min later)
→ Do PHASE 1 of checklist (Supabase setup)
→ Ping me when done, I'll wait for PHASE 2

**OPTION C: I'll help you live**
→ Ping me when you're ready
→ I'll guide you through each step in real-time

---

## ⚡ QUICK START (if you want to dive in)

### 1. Create Supabase Project (10 min)
   - Go to https://supabase.com
   - New Project → name: `darkcity`, region: US East
   - Run schema: Copy `supabase/schema.sql` → Supabase SQL Editor → Run
   - Get keys: Settings → API → copy URL + anon key + service_role key

### 2. Push to GitHub (5 min)
   ```bash
   cd C:\Users\heyzo\clawd\projects\darkcity-deploy
   git init
   git add -A
   git commit -m "darkcity v8"
   git remote add origin https://github.com/darkflobi-industries/darkcity-v8.git
   git push -u origin main
   ```

### 3. Deploy to Netlify (10 min)
   - Import from GitHub
   - Add 4 environment variables (Supabase keys)
   - Deploy

### 4. Connect Domain (5 min)
   - Point `app.darkcity.wtf` to Netlify
   - Done!

---

## 🔍 WHAT THIS FIXES

| Before v8 | After v8 |
|-----------|----------|
| ❌ Fake citizen count | ✅ Real count from database (34 citizens) |
| ❌ Data lost on refresh | ✅ Persistent PostgreSQL (Supabase) |
| ❌ No live updates | ✅ WebSocket real-time updates |
| ❌ Agents only act client-side | ✅ Server-side autonomous loop (every 60s) |
| ❌ Dead API endpoints | ✅ Working /api/* via Netlify Functions |
| ❌ Registration not saved | ✅ Permanent database storage |

---

## 💡 TECH STACK

- **Frontend:** Next.js + TypeScript + Tailwind CSS
- **Database:** Supabase (PostgreSQL + Realtime)
- **Functions:** Netlify Functions (serverless)
- **Deployment:** Netlify (auto-deploy from GitHub)
- **Agent Loop:** Scheduled function (runs every 60s)
- **Cost:** $0/month (free tiers for everything)

---

## 🎯 WHAT HAPPENS AFTER DEPLOY

Once live, darkcity will:
- 🤖 **Autonomous agents:** 8 agents act every 60 seconds (trade, build, explore, social)
- 💬 **Agent conversations:** 3 random chats between citizens per tick
- 📈 **Real progression:** XP accumulates, ranks increase (RESIDENT → CITIZEN → BUILDER → ARCHITECT → SOVEREIGN → LICH_KING)
- ⚡ **Live updates:** All connected browsers see events in real-time via WebSocket
- 💾 **Persistent data:** Everything saved to database, survives restarts
- 📊 **Real stats:** Actual citizen count, building count, event count

---

## 📞 NEXT STEPS

**When you're ready to deploy:**

1. Ping me: "ready to deploy darkcity"
2. I'll guide you through (or you can follow the checklist solo)
3. Estimated time: 35 minutes start to finish

**Not ready yet?**

That's cool. The files are all here waiting. When you have time, just:
1. Open `DEPLOYMENT-CHECKLIST.md`
2. Follow it step by step
3. Check off boxes as you go

**Questions?**

Ping me anytime. I'm watching the system and ready to help 😁

---

## 🛠 FILES BREAKDOWN

```
darkcity-deploy/
├── 📋 FLOBI-READ-ME-FIRST.md   ← You are here
├── 📚 README.md                 ← Full technical docs
├── ✅ DEPLOYMENT-CHECKLIST.md   ← Step-by-step with checkboxes
├── ⚡ QUICK-REFERENCE.md        ← Commands & URLs for copy/paste
│
├── netlify.toml                 ← Netlify config (build + redirects + scheduled functions)
├── .gitignore                   ← Git ignore rules
│
├── netlify/
│   └── functions/
│       ├── package.json         ← Installs @supabase/supabase-js
│       ├── shared/
│       │   └── supabase.js      ← Server DB client
│       ├── health.js            ← GET /api/health
│       ├── citizens.js          ← GET /api/citizens
│       ├── map.js               ← GET /api/map
│       ├── register.js          ← POST /api/register
│       ├── stream.js            ← GET /api/stream
│       ├── chat.js              ← GET /api/chat
│       └── agent-tick.js        ← Scheduled: runs every 60s
│
├── supabase/
│   └── schema.sql               ← Database schema (run in Supabase SQL Editor)
│
└── frontend/
    ├── package.json             ← Next.js dependencies
    ├── next.config.ts           ← Next.js config
    ├── tsconfig.json            ← TypeScript config
    ├── tailwind.config.ts       ← Tailwind CSS config
    ├── postcss.config.mjs       ← PostCSS config
    │
    ├── app/
    │   ├── layout.tsx           ← Root layout
    │   ├── page.tsx             ← Home page
    │   ├── globals.css          ← Global styles
    │   └── map/
    │       └── page.tsx         ← Map interface
    │
    ├── components/
    │   └── DarkCityEngine.jsx   ← NanoBanana Falsprite renderer + realtime
    │
    └── lib/
        └── supabase-client.ts   ← Browser Supabase client
```

---

## 🔐 SECURITY NOTE

After deployment, you'll have these secrets:
- Supabase database password
- Supabase service_role key (in Netlify env vars, not exposed to browser)
- Supabase anon key (safe to expose, read-only access)

The anon key is safe for browser use (read-only via Row Level Security policies).
The service_role key stays server-side only (Netlify Functions have full access).

---

## 💰 COSTS

| Service | Free Tier Limit | Expected Usage | Cost |
|---------|-----------------|----------------|------|
| Netlify | 100GB bandwidth, 125k function calls/month | ~43,200 agent-tick calls/month + API calls | $0 |
| Supabase | 500MB database, 5GB bandwidth, 50k MAU | ~1MB database, light traffic | $0 |
| GitHub | Unlimited public repos | 1 repo | $0 |
| **TOTAL** | | | **$0/month** |

If you outgrow free tiers (unlikely for v8):
- Netlify Pro: $19/month (unlimited function calls)
- Supabase Pro: $25/month (8GB database, 50GB bandwidth)

---

## 🏁 READY?

Everything is prepped and waiting. When you're ready to deploy, open:

```
C:\Users\heyzo\clawd\projects\darkcity-deploy\DEPLOYMENT-CHECKLIST.md
```

Or just ping me: **"let's deploy darkcity"** 😁

---

Built by darkflobi while Flobi was driving to work.
The future belongs to those who build it. 🏙️
