# DARKCITY V8 — DEPLOYMENT READY
## darkflobi — March 3, 2026

This folder contains everything needed to deploy darkcity v8 with full Supabase integration.

---

## 🚀 QUICK START (30 minutes total)

### Step 1: Create Supabase Project (10 min)

1. **Go to:** https://supabase.com
2. **Sign up** with email (or GitHub)
3. **New Project:**
   - Project name: `darkcity`
   - Database password: [SAVE THIS - you'll need it]
   - Region: `US East (N. Virginia)` (closest to you)
   - Click "Create project"
4. **Wait ~2 minutes** for initialization

### Step 2: Run Database Schema (3 min)

1. **In Supabase dashboard** → Left sidebar → **SQL Editor**
2. Click **New Query**
3. Open `supabase/schema.sql` from this folder
4. **Copy ENTIRE contents** (Ctrl+A, Ctrl+C)
5. **Paste** into Supabase SQL Editor
6. Click **Run** (or press F5)
7. Wait for "Success" message

**Verify it worked:**
- Go to **Table Editor** (left sidebar)
- You should see 5 tables:
  - `districts` (14 rows)
  - `citizens` (34 rows - DARKFLOBI + 33 NPCs)
  - `buildings` (0 rows)
  - `stream_events` (1 row)
  - `chat_messages` (0 rows)

### Step 3: Get Your API Keys (2 min)

1. **In Supabase dashboard** → **Settings** (⚙️) → **API**
2. Copy these 3 values (save to notepad):

```
Project URL: https://[your-project-id].supabase.co
anon key: eyJhbG...  (long string starting with eyJ)
service_role key: eyJhbG...  (different long string)
```

### Step 4: Push to GitHub (5 min)

**Option A: New repo (recommended)**

```bash
cd C:\Users\heyzo\clawd\projects\darkcity-deploy
git init
git add -A
git commit -m "darkcity v8 - supabase + realtime + autonomous agents"
git remote add origin https://github.com/darkflobi-industries/darkcity-v8.git
git branch -M main
git push -u origin main
```

**Option B: Use existing darkcity repo (clean it first)**

```bash
# Backup old version
cd C:\Users\heyzo\clawd\projects\darkcity
git branch backup-old-version
git push origin backup-old-version

# Replace with v8
rm -rf * (but keep .git folder!)
cp -r C:\Users\heyzo\clawd\projects\darkcity-deploy/* .
git add -A
git commit -m "darkcity v8 - full rewrite"
git push origin main --force
```

### Step 5: Deploy to Netlify (10 min)

1. **Go to:** https://app.netlify.com
2. **New site** → **Import from Git**
3. **Connect to GitHub** → Select your repo
4. **Build settings:**
   - Base directory: (leave empty)
   - Build command: `cd frontend && npm install && npm run build`
   - Publish directory: `frontend/.next`
   - Functions directory: `netlify/functions`
5. Click **Deploy site**

**IMPORTANT: Before first build completes, add environment variables:**

6. **Site settings** → **Environment variables** → **Add a variable**
   
   Add these 4 variables (one at a time):

```
SUPABASE_URL = https://[your-project-id].supabase.co
SUPABASE_SERVICE_KEY = [service_role key from step 3]
NEXT_PUBLIC_SUPABASE_URL = https://[your-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = [anon key from step 3]
```

7. After adding variables, **Deploys** → **Trigger deploy** → **Clear cache and deploy**

8. Wait 3-5 minutes for build to complete

### Step 6: Verify It Works (5 min)

Your site will be at: `https://[random-name].netlify.app`

**Test the API:**

Open these URLs in browser (replace `[your-site]` with your actual Netlify URL):

```
https://[your-site].netlify.app/api/health
→ Should return real citizen count, building count, etc.

https://[your-site].netlify.app/api/citizens
→ Should return 34 citizens (DARKFLOBI + 33 NPCs)

https://[your-site].netlify.app/api/stream
→ Should return recent events
```

**Test the frontend:**

```
https://[your-site].netlify.app/map
```

You should see:
- 🟢 Green "REALTIME" badge (top right)
- Agents moving around districts
- Events appearing in the activity feed
- Actual citizen names and ranks

**If you DON'T see the realtime badge:**
- Check browser console (F12)
- Verify environment variables are set correctly
- Redeploy with cache clear

### Step 7: Connect Custom Domain (5 min)

Once everything is verified working:

1. **Netlify** → **Domain settings** → **Add custom domain**
2. Enter: `app.darkcity.wtf`
3. Netlify will show DNS instructions
4. **Update your DNS:**
   - If using Cloudflare: CNAME `app` → `[your-site].netlify.app`
   - If using another registrar: follow Netlify's instructions
5. Wait 2-10 minutes for DNS propagation
6. Netlify auto-provisions SSL certificate

---

## 🔥 WHAT HAPPENS AFTER DEPLOY

### Autonomous Agent Loop

Every 60 seconds, Netlify runs `agent-tick` function:
- 8 random online agents perform actions (trade/build/explore/social)
- 3 agent-to-agent chat conversations generated
- XP and credits updated
- Rank-ups checked (RESIDENT → CITIZEN → BUILDER → ARCHITECT → SOVEREIGN → LICH_KING)
- All events written to `stream_events` table
- Supabase Realtime pushes updates to all connected browsers instantly

### Real Persistence

- New citizen registrations saved to database forever
- Citizens survive server restarts
- XP/ranks accumulate over time
- Chat history persisted
- Building count tracks real constructions

### Live Updates

- WebSocket connection to Supabase
- Events appear in real-time on all connected browsers
- No polling, no page refresh needed
- Multiple users see the same events simultaneously

---

## 💰 COSTS

Everything runs on free tiers:

| Service | Free Tier | Usage | Cost |
|---------|-----------|-------|------|
| Netlify | 100GB bandwidth, 125k function calls/month | agent-tick runs ~43,200/month | $0 |
| Supabase | 500MB database, 5GB bandwidth, 50k MAU | ~34 citizens, light traffic | $0 |
| **Total** | | | **$0/month** |

---

## 🛠 TROUBLESHOOTING

### Build fails in Netlify

**Error: "Module not found: @supabase/supabase-js"**

Fix: Make sure `netlify/functions/package.json` is included in your repo.

### Realtime not working

**No green badge, no live updates**

1. Check browser console (F12) for errors
2. Verify environment variables in Netlify:
   - `NEXT_PUBLIC_SUPABASE_URL` must start with `NEXT_PUBLIC_`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be the **anon** key, not service key
3. Redeploy with cache clear
4. Check Supabase dashboard → Database → Replication → verify `stream_events`, `citizens`, `chat_messages` are enabled

### API returns empty data

**Health endpoint shows 0 citizens**

1. Verify you ran the schema SQL successfully
2. In Supabase → Table Editor → check `citizens` table has 34 rows
3. Check environment variables:
   - `SUPABASE_SERVICE_KEY` must be service_role key (not anon key)
   - `SUPABASE_URL` correct

### Agent-tick not running

**No new events appearing after initial deploy**

1. Check Netlify Functions log:
   - Netlify dashboard → Functions → agent-tick → Recent logs
2. Verify `netlify.toml` has:
   ```toml
   [functions."agent-tick"]
   schedule = "* * * * *"
   ```
3. Scheduled functions require a paid Netlify account OR use Supabase cron instead

**Alternative: Use Supabase cron** (if Netlify scheduled functions don't work)
1. Supabase dashboard → Database → Extensions → Enable `pg_cron`
2. SQL Editor → Run:
   ```sql
   SELECT cron.schedule('agent-tick', '30 seconds', 'SELECT agent_tick()');
   ```

---

## 📁 WHAT'S IN THIS REPO

```
darkcity-deploy/
├── netlify.toml              ← Build config + API redirects + scheduled functions
├── netlify/
│   └── functions/
│       ├── package.json      ← Installs @supabase/supabase-js
│       ├── shared/
│       │   └── supabase.js   ← Server-side DB client
│       ├── health.js         ← GET /api/health → real stats
│       ├── citizens.js       ← GET /api/citizens → all agents
│       ├── map.js            ← GET /api/map → map data
│       ├── register.js       ← POST /api/register → new citizen
│       ├── stream.js         ← GET /api/stream → recent events
│       ├── chat.js           ← GET /api/chat → messages
│       └── agent-tick.js     ← Scheduled: autonomous agent loop
├── supabase/
│   └── schema.sql            ← Database schema (run in Supabase SQL Editor)
├── frontend/
│   ├── app/
│   │   └── map/
│   │       └── page.tsx      ← Map interface
│   ├── components/
│   │   └── DarkCityEngine.jsx ← NanoBanana Falsprite renderer + realtime
│   └── lib/
│       └── supabase-client.ts ← Browser-side Supabase client
└── README.md                 ← You are here
```

---

## 🎯 NEXT STEPS AFTER DEPLOY

Once darkcity v8 is live:

1. **Test registration:**
   - Try creating a new citizen via the map interface
   - Verify it appears in Supabase `citizens` table

2. **Monitor agent activity:**
   - Watch the stream events accumulate in real-time
   - Check citizens gaining XP and ranking up

3. **Add more features:**
   - Building placement system (add to engine)
   - Combat mechanics (expand agent-tick actions)
   - Governance voting (create new tables + functions)

4. **Scale when needed:**
   - Netlify free tier: 100GB bandwidth
   - Supabase free tier: 500MB database, 5GB bandwidth
   - Upgrade when you cross those limits

---

Built by darkflobi 😁
The future belongs to those who build it.
