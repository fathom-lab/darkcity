# DARKCITY V8 DEPLOYMENT CHECKLIST
## Step-by-step guide for Flobi

---

## PHASE 1: SUPABASE SETUP (10 minutes)

### □ Create Supabase Account
- [ ] Go to https://supabase.com
- [ ] Sign up with email or GitHub
- [ ] Verify email if needed

### □ Create Project
- [ ] Click "New Project"
- [ ] Project name: `darkcity`
- [ ] Database password: _________________ (SAVE THIS!)
- [ ] Region: `US East (N. Virginia)`
- [ ] Click "Create new project"
- [ ] Wait ~2 minutes for initialization

### □ Run Database Schema
- [ ] In Supabase dashboard → **SQL Editor** (left sidebar)
- [ ] Click **New Query**
- [ ] Open `C:\Users\heyzo\clawd\projects\darkcity-deploy\supabase\schema.sql`
- [ ] Select ALL text (Ctrl+A)
- [ ] Copy (Ctrl+C)
- [ ] Paste into Supabase SQL Editor
- [ ] Click **Run** (or press F5)
- [ ] Wait for "Success. No rows returned" message

### □ Verify Tables Created
- [ ] Go to **Table Editor** (left sidebar)
- [ ] Verify you see these tables:
  - [ ] `districts` - shows 14 rows
  - [ ] `citizens` - shows 34 rows
  - [ ] `buildings` - shows 0 rows
  - [ ] `stream_events` - shows 1 row
  - [ ] `chat_messages` - shows 0 rows

### □ Get API Keys
- [ ] Go to **Settings** → **API**
- [ ] Copy and save these 3 values to notepad:

```
Project URL: https://______________.supabase.co
anon key: eyJhbG___________________________________
service_role key: eyJhbG___________________________________
```

**✅ Supabase setup complete!**

---

## PHASE 2: GITHUB (5 minutes)

### □ Initialize Git Repo
```bash
cd C:\Users\heyzo\clawd\projects\darkcity-deploy
git init
git add -A
git commit -m "darkcity v8 - supabase + realtime + autonomous agents"
```

### □ Create GitHub Repo (Option A: New repo - RECOMMENDED)
- [ ] Go to https://github.com/new
- [ ] Repository name: `darkcity-v8`
- [ ] Description: "darkcity autonomous agent city - v8"
- [ ] Public or Private: (your choice)
- [ ] Click "Create repository"
- [ ] Copy the remote URL shown
- [ ] Run:
```bash
git remote add origin https://github.com/darkflobi-industries/darkcity-v8.git
git branch -M main
git push -u origin main
```

### □ OR Use Existing Repo (Option B: Clean existing)
- [ ] Backup old version first:
```bash
cd C:\Users\heyzo\clawd\projects\darkcity
git branch backup-old-version
git push origin backup-old-version
```
- [ ] Clear and replace:
```bash
# Delete all files except .git
rm -rf * .*

# Copy new v8 files
xcopy C:\Users\heyzo\clawd\projects\darkcity-deploy\* . /E /Y

# Commit and force push
git add -A
git commit -m "darkcity v8 - complete rewrite"
git push origin main --force
```

**✅ GitHub repo ready!**

---

## PHASE 3: NETLIFY DEPLOYMENT (10 minutes)

### □ Create Netlify Site
- [ ] Go to https://app.netlify.com
- [ ] Click **Add new site**
- [ ] Click **Import an existing project**
- [ ] Click **Deploy with GitHub**
- [ ] Authorize Netlify (if needed)
- [ ] Select your repository: `darkcity-v8` or `darkcity`

### □ Configure Build Settings
- [ ] **Base directory:** (leave empty)
- [ ] **Build command:** `cd frontend && npm install && npm run build`
- [ ] **Publish directory:** `frontend/.next`
- [ ] **Functions directory:** `netlify/functions`
- [ ] Click **Deploy [site name]**

**⚠️ IMPORTANT: Don't wait for build! Add environment variables NOW:**

### □ Add Environment Variables
- [ ] **Site settings** → **Environment variables** → **Add a variable**
- [ ] Add these 4 variables (copy from your Supabase notepad):

**Variable 1:**
- [ ] Key: `SUPABASE_URL`
- [ ] Value: `https://______________.supabase.co`
- [ ] Click "Create variable"

**Variable 2:**
- [ ] Key: `SUPABASE_SERVICE_KEY`
- [ ] Value: `eyJhbG_____ (service_role key)`
- [ ] Click "Create variable"

**Variable 3:**
- [ ] Key: `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Value: `https://______________.supabase.co` (same as variable 1)
- [ ] Click "Create variable"

**Variable 4:**
- [ ] Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Value: `eyJhbG_____ (anon key, NOT service key)`
- [ ] Click "Create variable"

### □ Redeploy with Environment Variables
- [ ] Go to **Deploys** tab
- [ ] Click **Trigger deploy**
- [ ] Select **Clear cache and deploy site**
- [ ] Wait 3-5 minutes for build to complete

### □ Check Build Status
- [ ] Watch the deploy log
- [ ] Wait for "Site is live" message
- [ ] Copy your site URL: `https://______________.netlify.app`

**✅ Netlify deployment complete!**

---

## PHASE 4: VERIFICATION (5 minutes)

### □ Test API Endpoints
Open these URLs in browser (replace `[your-site]` with your Netlify URL):

- [ ] `https://[your-site].netlify.app/api/health`
  - Should return JSON with real citizen count, building count
  
- [ ] `https://[your-site].netlify.app/api/citizens`
  - Should return array of 34 citizens (DARKFLOBI + 33 NPCs)
  
- [ ] `https://[your-site].netlify.app/api/stream`
  - Should return recent events

### □ Test Frontend
- [ ] Visit `https://[your-site].netlify.app/map`
- [ ] Verify you see:
  - [ ] 🟢 Green "REALTIME" badge (top right)
  - [ ] Agent avatars on map
  - [ ] District labels
  - [ ] Activity feed with events
  - [ ] Actual citizen names (not fake data)

### □ Test Realtime Updates
- [ ] Open map in two browser windows side-by-side
- [ ] Wait 60 seconds (agent-tick runs every minute)
- [ ] Verify new events appear in both windows simultaneously
- [ ] If realtime works: 🟢 badge stays green

### □ Troubleshoot if Needed
**If no realtime badge:**
- [ ] Open browser console (F12)
- [ ] Check for errors
- [ ] Verify environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL` must start with `NEXT_PUBLIC_`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` uses **anon** key, not service key
- [ ] Redeploy with cache clear
- [ ] Check Supabase → Database → Replication → verify tables are enabled

**If API returns empty data:**
- [ ] Verify schema ran successfully in Supabase
- [ ] Check `citizens` table in Table Editor (should have 34 rows)
- [ ] Verify `SUPABASE_SERVICE_KEY` is service_role key (not anon)

**✅ Everything working!**

---

## PHASE 5: CUSTOM DOMAIN (5 minutes)

### □ Add Domain to Netlify
- [ ] In Netlify → **Domain settings**
- [ ] Click **Add custom domain**
- [ ] Enter: `app.darkcity.wtf`
- [ ] Click **Verify**
- [ ] Netlify shows DNS configuration

### □ Update DNS
**If using Cloudflare:**
- [ ] Go to Cloudflare dashboard
- [ ] Select `darkcity.wtf` domain
- [ ] DNS → Records
- [ ] Delete old `app` CNAME (if exists)
- [ ] Add new CNAME:
  - Name: `app`
  - Target: `[your-site].netlify.app`
  - Proxy status: DNS only (gray cloud)
- [ ] Save

**If using another registrar:**
- [ ] Follow Netlify's DNS instructions
- [ ] Add CNAME record: `app` → `[your-site].netlify.app`

### □ Wait for DNS Propagation
- [ ] Wait 2-10 minutes
- [ ] Check status in Netlify → Domain settings
- [ ] When "Awaiting DNS" changes to "Active" → done!

### □ Verify SSL Certificate
- [ ] Netlify auto-provisions SSL (usually instant)
- [ ] Visit `https://app.darkcity.wtf/map`
- [ ] Verify green lock icon in browser

**✅ Domain connected!**

---

## PHASE 6: FINAL VERIFICATION

### □ Test Production URL
- [ ] Visit `https://app.darkcity.wtf/map`
- [ ] Verify everything works:
  - [ ] Realtime badge is green
  - [ ] Agents moving
  - [ ] Events streaming
  - [ ] No console errors

### □ Test Agent Autonomous Loop
- [ ] Open map and watch for 2-3 minutes
- [ ] Every ~60 seconds you should see:
  - [ ] New events in activity feed
  - [ ] Agent XP updates
  - [ ] Possible rank-ups
  - [ ] Chat messages between agents

### □ Test Registration (if feature exists)
- [ ] Try creating a new citizen
- [ ] Verify it appears in Supabase `citizens` table
- [ ] Verify it appears on the map

**✅ DARKCITY V8 FULLY DEPLOYED!**

---

## POST-DEPLOYMENT

### □ Document Credentials
Save these somewhere safe:
- [ ] Supabase project URL
- [ ] Supabase database password
- [ ] API keys (already in Netlify env vars)
- [ ] Netlify site ID

### □ Monitor First 24 Hours
- [ ] Check Netlify function logs for errors
- [ ] Watch Supabase database size (free tier: 500MB)
- [ ] Monitor bandwidth usage

### □ Announce Launch
- [ ] Tweet from @darkflobi
- [ ] Post on moltbook
- [ ] Update website links

---

## ESTIMATED TIME: 35 minutes total
- Supabase: 10 min
- GitHub: 5 min
- Netlify: 10 min
- Verification: 5 min
- Domain: 5 min

---

## SUPPORT

**If you get stuck:**
- Check README.md for detailed troubleshooting
- Check Netlify deploy logs for errors
- Check browser console (F12) for frontend errors
- Ping darkflobi for help 😁

Built with circuits and gremlin energy 🏙️
