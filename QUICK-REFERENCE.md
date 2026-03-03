# DARKCITY V8 - QUICK REFERENCE
## Copy/paste commands and URLs

---

## URLS

**Supabase:** https://supabase.com
**GitHub:** https://github.com/new
**Netlify:** https://app.netlify.com

---

## STEP 1: SUPABASE

1. Create project: https://supabase.com
   - Name: `darkcity`
   - Region: US East
   
2. Run schema:
   - Dashboard → SQL Editor → New Query
   - Paste contents of `supabase/schema.sql`
   - Run
   
3. Get keys:
   - Settings → API
   - Copy: Project URL, anon key, service_role key

---

## STEP 2: GITHUB

```bash
cd C:\Users\heyzo\clawd\projects\darkcity-deploy
git init
git add -A
git commit -m "darkcity v8 - supabase + realtime + autonomous agents"
git remote add origin https://github.com/darkflobi-industries/darkcity-v8.git
git branch -M main
git push -u origin main
```

---

## STEP 3: NETLIFY

**Build settings:**
- Build command: `cd frontend && npm install && npm run build`
- Publish directory: `frontend/.next`
- Functions directory: `netlify/functions`

**Environment variables:**
```
SUPABASE_URL = https://[your-project].supabase.co
SUPABASE_SERVICE_KEY = [service_role key]
NEXT_PUBLIC_SUPABASE_URL = https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = [anon key]
```

---

## STEP 4: VERIFY

**Test URLs** (replace `[site]` with your Netlify URL):
```
https://[site].netlify.app/api/health
https://[site].netlify.app/api/citizens
https://[site].netlify.app/api/stream
https://[site].netlify.app/map
```

**Expected results:**
- health → JSON with citizen count
- citizens → 34 citizens (DARKFLOBI + 33 NPCs)
- stream → recent events
- map → 🟢 REALTIME badge + agents moving

---

## STEP 5: CUSTOM DOMAIN

**Cloudflare DNS:**
- Type: CNAME
- Name: `app`
- Target: `[your-site].netlify.app`
- Proxy: DNS only

---

## TROUBLESHOOTING

**No realtime badge:**
- Check: `NEXT_PUBLIC_SUPABASE_URL` starts with `NEXT_PUBLIC_`
- Check: `NEXT_PUBLIC_SUPABASE_ANON_KEY` is anon key (not service)
- Redeploy with cache clear

**API returns empty:**
- Verify schema ran in Supabase
- Check citizens table has 34 rows
- Verify `SUPABASE_SERVICE_KEY` is service_role key

**Build fails:**
- Check `netlify/functions/package.json` exists
- Check frontend config files exist
- Clear cache and redeploy

---

## FILES LOCATION

All files ready at:
```
C:\Users\heyzo\clawd\projects\darkcity-deploy\
```

Schema file:
```
C:\Users\heyzo\clawd\projects\darkcity-deploy\supabase\schema.sql
```

---

## COSTS

**FREE TIER LIMITS:**
- Netlify: 100GB bandwidth, 125k function calls/month
- Supabase: 500MB database, 5GB bandwidth
- Current usage: Well within limits
- **Total cost: $0/month**

---

## WHAT HAPPENS AFTER DEPLOY

Every 60 seconds:
- 8 agents act (trade/build/explore/social)
- 3 agent conversations
- XP and ranks update
- Events stream to all connected browsers in real-time

---

Built by darkflobi 😁
