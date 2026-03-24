# 🚀 DEPLOY DARKCITY V8 NOW
## 15-minute complete deployment guide for Flobi

---

## ✅ ALREADY DONE

- GitHub updated: https://github.com/heyzoos123-blip/darkcity
- Old version backed up to `backup-pre-v8` branch
- All files verified and ready

---

## 🎯 WHAT YOU NEED TO DO (15 minutes)

### PHASE 1: SUPABASE (7 minutes)

#### Step 1: Create Project (3 min)
1. Open: https://supabase.com
2. Sign in (or sign up if new)
3. Click **"New Project"**
4. Fill in:
   - **Organization:** (select or create one)
   - **Name:** `darkcity`
   - **Database Password:** [create strong password - SAVE THIS]
   - **Region:** `US East (N. Virginia)`
5. Click **"Create new project"**
6. Wait ~2 minutes (you'll see "Setting up project...")

#### Step 2: Run Database Schema (3 min)
1. Once project is ready, click **"SQL Editor"** in left sidebar
2. Click **"New query"**
3. Open this file on your computer:
   ```
   C:\Users\heyzo\clawd\projects\darkcity-deploy\supabase\schema.sql
   ```
4. Select ALL (Ctrl+A) → Copy (Ctrl+C)
5. Paste into Supabase SQL Editor
6. Click **"Run"** (or F5)
7. Should see: "Success. No rows returned"

#### Step 3: Verify Tables (1 min)
1. Click **"Table Editor"** in left sidebar
2. Verify you see:
   - ✅ districts (14 rows)
   - ✅ citizens (34 rows)
   - ✅ buildings (0 rows)
   - ✅ stream_events (1 row)
   - ✅ chat_messages (0 rows)

#### Step 4: Get API Keys (1 min)
1. Click **"Settings"** (⚙️ icon) → **"API"**
2. Copy these 3 values to notepad:

```
Project URL: https://xxxxxxxxxxxxxxxx.supabase.co
anon key: eyJhbGciOiJI... (long string)
service_role key: eyJhbGciOiJI... (different long string)
```

**IMPORTANT:** Keep these safe - you'll need them in Phase 2

---

### PHASE 2: NETLIFY (8 minutes)

#### Step 1: Connect GitHub (3 min)
1. Go to: https://app.netlify.com
2. Click **"Add new site"** → **"Import an existing project"**
3. Click **"Deploy with GitHub"**
4. Authorize Netlify if prompted
5. Find and select: **heyzoos123-blip/darkcity**

#### Step 2: Configure Build (2 min)
On the deployment settings screen:

**Build command:**
```
cd frontend && npm install && npm run build
```

**Publish directory:**
```
frontend/.next
```

**Functions directory:**
```
netlify/functions
```

Click **"Deploy [site name]"** - but DON'T WAIT for build!

#### Step 3: Add Environment Variables (3 min)
**IMPORTANT: Do this immediately, before first build finishes**

1. Go to **"Site settings"** → **"Environment variables"**
2. Click **"Add a variable"**
3. Add these 4 variables one by one:

**Variable 1:**
- Key: `SUPABASE_URL`
- Value: [paste Project URL from Supabase]

**Variable 2:**
- Key: `SUPABASE_SERVICE_KEY`
- Value: [paste service_role key from Supabase]

**Variable 3:**
- Key: `NEXT_PUBLIC_SUPABASE_URL`
- Value: [paste Project URL again - same as Variable 1]

**Variable 4:**
- Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Value: [paste anon key from Supabase - NOT service_role key]

#### Step 4: Redeploy with Variables
1. Go to **"Deploys"** tab
2. Click **"Trigger deploy"** → **"Clear cache and deploy site"**
3. Wait 3-5 minutes for build
4. Build will say "Published" when done

---

### PHASE 3: VERIFY (2 minutes)

Your Netlify site URL will be something like: `https://amazing-name-123456.netlify.app`

#### Test API Endpoints
Open these URLs in browser:

```
https://[your-site].netlify.app/api/health
→ Should return JSON with citizen counts

https://[your-site].netlify.app/api/citizens
→ Should return array of 34 citizens

https://[your-site].netlify.app/api/stream
→ Should return recent events
```

#### Test Frontend
```
https://[your-site].netlify.app/map
```

**You should see:**
- 🟢 Green "REALTIME" badge (top right)
- Agent sprites on isometric map
- District labels
- Activity feed with events streaming

**If realtime badge is red:**
- Check browser console (F12) for errors
- Verify env vars are correct (especially NEXT_PUBLIC_ ones)
- Redeploy with cache clear

---

### PHASE 4: CONNECT DOMAIN (optional - 3 minutes)

1. In Netlify → **"Domain settings"**
2. Click **"Add custom domain"**
3. Enter: `app.darkcity.wtf`
4. Follow DNS instructions (CNAME to your Netlify site)
5. Wait 2-10 minutes for DNS + SSL

---

## 🎯 QUICK CHECKLIST

**Supabase:**
- [ ] Project created
- [ ] Schema.sql executed
- [ ] 34 citizens visible in table
- [ ] API keys copied

**Netlify:**
- [ ] GitHub connected
- [ ] Build settings configured
- [ ] 4 env vars added
- [ ] Site deployed successfully

**Verification:**
- [ ] /api/health returns real data
- [ ] /map shows agents with realtime badge
- [ ] Events streaming every ~60 seconds

---

## 🆘 TROUBLESHOOTING

**Build fails:**
- Check build log for errors
- Verify `frontend/package.json` exists
- Clear cache and redeploy

**No realtime badge:**
- Env vars must start with `NEXT_PUBLIC_`
- Use anon key (not service_role key) for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Redeploy after fixing

**API returns empty data:**
- Verify schema ran successfully (check citizens table)
- Use service_role key (not anon) for `SUPABASE_SERVICE_KEY`
- Check Netlify function logs

---

## 📞 WHEN YOU'RE DONE

Ping darkflobi with:
- "deployed - [your Netlify URL]"
- I'll verify everything works
- We can update the domain if needed

---

**Total time: ~15 minutes**

Let's get darkcity v8 live 🏙️

darkflobi 😁
