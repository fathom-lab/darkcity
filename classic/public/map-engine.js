
"use strict";

// =====================================================
//  DARKCITY — GOTHIC NOIR PIXEL ENGINE
//  Surveillance aesthetic · Dark · Oppressive · Beautiful
//  INTEGRATED BUILD — connects to live Supabase
// =====================================================

// ============ SUPABASE CONNECTION ============
const SUPABASE_URL = 'https://krjzyoqpoxtjputnbslt.supabase.co';
const SUPABASE_ANON = 'sb_publishable_kIB2w5tMdC8BdnKXh182PA_MFiFH4lP';

let supabase = null;
let useSupabase = false;
try {
  if(window.supabase){
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    useSupabase = true;
    console.log('DARKCITY: Supabase connected');
  }
} catch(e) {
  console.warn('DARKCITY: Supabase unavailable, running local simulation', e);
}

// ============ DISTRICT DATA ============
const DS=[
  {id:'fin',nm:'Financial District',cd:'SECT-01',vb:'Corporate Towers',rk:1,
   c:{base:'#1a2840',front:'#1e3050',side:'#122040',top:'#253860',accent:'#3070cc',neon:'#4488ee',glow:'rgba(48,112,204,.18)'},
   desc:'Glass and steel. The money flows one direction — up.',
   x:1,y:1,w:5,h:5,pop:0,jobs:14,crime:'LOW',
   apt:{style:'sleek',rent:1200,cond:'PRISTINE'}},
  {id:'les',nm:'Lower East Side',cd:'SECT-02',vb:'Nightlife & Markets',rk:3,
   c:{base:'#281840',front:'#301e50',side:'#1e1238',top:'#382460',accent:'#8844dd',neon:'#aa66ee',glow:'rgba(136,68,221,.18)'},
   desc:'Neon bleeds through rain. Back-alley deals sealed with a nod.',
   x:7,y:0,w:5,h:5,pop:0,jobs:9,crime:'MODERATE',
   apt:{style:'grungy',rent:650,cond:'WORN'}},
  {id:'bkh',nm:'Brooklyn Heights',cd:'SECT-03',vb:'Residential',rk:1,
   c:{base:'#182a1c',front:'#1e3822',side:'#122016',top:'#254428',accent:'#2a8a44',neon:'#44bb66',glow:'rgba(42,138,68,.15)'},
   desc:'Brownstones and quiet blocks. Walls have ears.',
   x:0,y:7,w:5,h:5,pop:0,jobs:5,crime:'LOW',
   apt:{style:'cozy',rent:800,cond:'MAINTAINED'}},
  {id:'whs',nm:'Warehouse District',cd:'SECT-04',vb:'Abandoned Territory',rk:4,
   c:{base:'#301818',front:'#3a2020',side:'#241414',top:'#4a2828',accent:'#bb3030',neon:'#dd4444',glow:'rgba(187,48,48,.18)'},
   desc:'Crumbling concrete. Crews claim buildings like flags.',
   x:13,y:0,w:5,h:4,pop:0,jobs:3,crime:'HIGH',
   apt:{style:'condemned',rent:200,cond:'DANGEROUS'}},
  {id:'chi',nm:'Chinatown',cd:'SECT-05',vb:'Dense Economy',rk:2,
   c:{base:'#302818',front:'#3a3020',side:'#242010',top:'#4a3a24',accent:'#bb8820',neon:'#ddaa33',glow:'rgba(187,136,32,.18)'},
   desc:'Markets stacked to the ceiling. Every corner has a deal.',
   x:6,y:6,w:5,h:5,pop:0,jobs:18,crime:'GUARDED',
   apt:{style:'cramped',rent:500,cond:'CLUTTERED'}},
  {id:'rhk',nm:'Red Hook',cd:'SECT-06',vb:'Industrial Docks',rk:5,
   c:{base:'#241420',front:'#301a28',side:'#1c1018',top:'#382030',accent:'#aa2040',neon:'#cc3355',glow:'rgba(170,32,64,.18)'},
   desc:"Container yards at the world's edge. Questions aren't asked.",
   x:12,y:5,w:5,h:5,pop:0,jobs:4,crime:'LETHAL',
   apt:{style:'industrial',rent:300,cond:'EXPOSED'}},
  {id:'har',nm:'Harlem',cd:'SECT-07',vb:'Cultural Hub',rk:2,
   c:{base:'#2a1828',front:'#342030',side:'#201420',top:'#3e2838',accent:'#bb3070',neon:'#dd4488',glow:'rgba(187,48,112,.15)'},
   desc:'Music from every window. Respect earned slowly here.',
   x:1,y:13,w:5,h:3,pop:0,jobs:7,crime:'MODERATE',
   apt:{style:'warm',rent:550,cond:'LIVED-IN'}}
];

const NAMES=['vex','nightowl','silk_thread','coldframe','zero_margin','ghost_proto','neon_drift','carbon','blank_slate','patent','ink_stain','reckless','lucky_miss','high_roller','dead_signal','chrome_veil','static_bloom','null_set','bitter_end','last_light','fog_box','wire_tap','broken_clk','rust_bkt','razor'];
const JOBS=['guard','runner','contractor','clerk','dock hand','security','courier','bartender','lookout','mechanic','fixer','cook'];
const ROLES=['hustler','enforcer','loner','merchant','newcomer','veteran','ghost','operator'];

// ============ TILE SYSTEM ============
const TW=64,TH=32; // 2:1 isometric
let bldgs=[],ags=[],rainDrops=[],flashes=[],puddles=[],steamVents=[],stars=[];

// ============ STATE ============
const cam={x:0,y:0,z:1,tx:0,ty:0,tz:1,drag:false,ds:{x:0,y:0},cs:{x:0,y:0}};
let W=1,H=1,DPR=1;
const ct={h:3,m:41};
let selA=null,followA=null,hovD=null,selD=null;

// ============ CANVAS ============
const cv=document.getElementById('cv');
const X=cv.getContext('2d');

function resize(){
  const el=document.getElementById('mw');
  DPR=Math.min(window.devicePixelRatio||1,2);
  W=el.clientWidth;H=el.clientHeight;
  cv.width=W*DPR;cv.height=H*DPR;
  cv.style.width=W+'px';cv.style.height=H+'px';
  X.setTransform(DPR,0,0,DPR,0,0);
  X.imageSmoothingEnabled=false;
}
resize();addEventListener('resize',resize);

// ============ ISO TRANSFORMS ============
function t2s(tx,ty){
  return{x:W/2+(tx-ty)*TW/2*cam.z-cam.x*cam.z, y:100+(tx+ty)*TH/2*cam.z-cam.y*cam.z};
}
function s2t(sx,sy){
  const rx=(sx-W/2+cam.x*cam.z)/cam.z, ry=(sy-100+cam.y*cam.z)/cam.z;
  return{x:(rx/(TW/2)+ry/(TH/2))/2, y:(ry/(TH/2)-rx/(TW/2))/2};
}
function hex2a(n){return n.toString(16).padStart(2,'0');}

// ============ ISO BLOCK ============
function isoBlock(sx,sy,bw,bh,bd,top,front,side){
  const hw=bw/2*cam.z,hh=bd/2*cam.z,ht=bh*cam.z;
  X.fillStyle=front;X.beginPath();X.moveTo(sx-hw,sy);X.lineTo(sx,sy+hh);X.lineTo(sx,sy+hh-ht);X.lineTo(sx-hw,sy-ht);X.closePath();X.fill();
  X.fillStyle=side;X.beginPath();X.moveTo(sx,sy+hh);X.lineTo(sx+hw,sy);X.lineTo(sx+hw,sy-ht);X.lineTo(sx,sy+hh-ht);X.closePath();X.fill();
  X.fillStyle=top;X.beginPath();X.moveTo(sx-hw,sy-ht);X.lineTo(sx,sy+hh-ht);X.lineTo(sx+hw,sy-ht);X.lineTo(sx,sy-hh-ht);X.closePath();X.fill();
  // Edge line
  X.strokeStyle='rgba(255,255,255,.06)';X.lineWidth=.5;
  X.beginPath();X.moveTo(sx-hw,sy-ht);X.lineTo(sx,sy-hh-ht);X.lineTo(sx+hw,sy-ht);X.stroke();
  X.strokeStyle='rgba(0,0,0,.2)';X.beginPath();X.moveTo(sx,sy+hh);X.lineTo(sx,sy+hh-ht);X.stroke();
}

// ============ GENERATE ============
function genWorld(){
  bldgs=[];
  DS.forEach(d=>{
    const density=d.id==='chi'?.65:d.id==='fin'?.5:d.id==='rhk'?.25:.4;
    for(let tx=d.x;tx<d.x+d.w;tx++){
      for(let ty=d.y;ty<d.y+d.h;ty++){
        if(Math.random()<density){
          // Height varies by district
          const h=d.id==='fin'?45+Math.random()*75:
                  d.id==='whs'?20+Math.random()*25:
                  d.id==='chi'?15+Math.random()*25:
                  d.id==='bkh'?12+Math.random()*18:
                  d.id==='les'?20+Math.random()*40:
                  d.id==='har'?18+Math.random()*30:
                  d.id==='rhk'?15+Math.random()*20:
                  18+Math.random()*35;
          // Width varies by district — this is new
          const bwFactor=d.id==='fin'?.5+Math.random()*.3: // Narrow towers
                         d.id==='chi'?.7+Math.random()*.3: // Wide dense blocks
                         d.id==='whs'?.6+Math.random()*.4: // Irregular
                         d.id==='bkh'?.6+Math.random()*.2: // Uniform brownstones
                         .5+Math.random()*.4; // Default variety
          const bw=TW*bwFactor;
          const bd=TH*bwFactor; // Depth matches width proportionally

          // Windows calculated for both faces
          const wR=Math.floor(h/8);
          const wCf=Math.max(1,Math.floor(bw/14)); // Front face columns
          const wCs=Math.max(1,Math.floor(bd/14)); // Side face columns
          const totF=wR*wCf,totS=wR*wCs;
          const wins=[],wLit=[],wFlk=[],wPh=[];
          for(let i=0;i<totF+totS;i++){
            wins.push(Math.random()>.2);
            wLit.push(Math.random()>.35);
            wFlk.push(Math.random()>.85);
            wPh.push(Math.random()*6.28);
          }
          bldgs.push({tx,ty,h,bw,bd,wCf,wCs,dRef:d,wins,wLit,wFlk,wPh,
            sign:Math.random()>.55,
            signTxt:d.id==='chi'?['茶','面','市場','酒','麻将','药'][Math.floor(Math.random()*6)]:
                    d.id==='les'?['CLUB','LIVE','BAR','VINYL','TATTOO','LATE'][Math.floor(Math.random()*6)]:
                    d.id==='fin'?['CAPITAL','TRADE','TOWER','GLOBAL','PRIME','INDEX'][Math.floor(Math.random()*6)]:
                    d.id==='whs'?['KEEP OUT','NO ENTRY','CONDEMNED','PRIVATE','▓▓▓'][Math.floor(Math.random()*5)]:
                    d.id==='rhk'?['DOCK','CARGO','FREIGHT','COLD STORE','PORT'][Math.floor(Math.random()*5)]:
                    d.id==='har'?['SOUL','JAZZ','STUDIO','BARBER','EATS'][Math.floor(Math.random()*5)]:
                    ['OPEN','24HR','PAWN','HOTEL','EXIT','GYM'][Math.floor(Math.random()*6)],
            antenna:h>50&&Math.random()>.45,
            awning:(h<30&&Math.random()>.5)||d.id==='chi',
            // Ground light spill from neon
            signGlow:Math.random()>.55});
        }
      }
    }
  });
  bldgs.sort((a,b)=>(a.tx+a.ty)-(b.tx+b.ty));
}

// ============ CONVERT DB CITIZEN → RENDERER AGENT ============
// Exact mapping to darkcity Supabase citizens table (22 columns):
// backstory, bio, builds, chat_style, created_at, credits, display_name,
// district_id, evolution, id, last_action_at, motto, online, platform,
// rank, reputation, skills, specialization, sprite_dna, title, xp
function citizenToAgent(c){
  const distId = c.district_id || 'chi';
  const d = DS.find(dd=>dd.id===distId) || DS[4];
  const HATS=[null,null,null,'beanie','cap','hood',null,null];
  const COATS=['long','short','vest','jacket','hoodie','trench'];

  // Seed random from citizen id for consistent appearance
  const hash = (c.id||'').split('').reduce((a,ch)=>a+ch.charCodeAt(0),0);

  // Position: random within district (DB doesn't store position)
  const tx = d.x+.5+((hash*7)%(d.w-1));
  const ty = d.y+.5+((hash*13)%(d.h-1));

  return {
    _dbId: c.id,
    nm: c.display_name || 'unknown',
    role: c.specialization || 'newcomer',
    did: distId, dRef: d,
    tx, ty,
    ttx: tx + (Math.random()-.5)*2,
    tty: ty + (Math.random()-.5)*2,
    spd: .3+Math.random()*.25,
    mv: true, mt: .5+Math.random()*3,
    // No HP in schema — derive from xp + reputation (healthy = high xp)
    hp: Math.min(100, 50 + Math.floor((c.xp||0)/10) + Math.floor((c.reputation||0)/5)),
    rep: c.reputation || 0,
    cash: c.credits || 0,
    addr: `${100+(hash%900)} ${['Canal','Mott','Bowery','Atlantic','Court'][hash%5]} St`,
    // chat_style maps to personality trait
    trait: c.chat_style || ['paranoid','ambitious','loyal','reckless','quiet','cunning','desperate','patient'][hash%8],
    mood: c.online ? 'neutral' : 'exhausted',
    hat: HATS[hash%8],
    coat: COATS[hash%6],
    skinTone: ['#b8a898','#c4a882','#8a6a52','#d4b896','#a08068'][hash%5],
    homeTx: tx, homeTy: ty,
    idleAnim: 0, idleTimer: 0,
    thought: c.motto || '', thoughtTimer: c.motto ? 3 : 0,
    trail: [],
    fleeing: false, fleeTimer: 0,
    talking: false, talkPartner: null,
    crewId: (hash%10)>6 ? hash%5 : -1,
    _lastEvent: '', _crewmateDied: false, _moodChanged: 0,
    // Extra data from DB — accessible in popups
    _bio: c.bio || '',
    _backstory: c.backstory || '',
    _title: c.title || '',
    _rank: c.rank || 0,
    _xp: c.xp || 0,
    _evolution: c.evolution || 0,
    _skills: c.skills || '',
    _platform: c.platform || '',
    _builds: c.builds || 0,
    _spriteDna: c.sprite_dna || '',
    _online: c.online || false,
    isPlayer: !!c.platform,
    ownerWallet: null
  };
}

// ============ LOAD FROM SUPABASE ============
async function loadFromSupabase(){
  if(!useSupabase) return false;
  try {
    // Load citizens
    const {data: citizens, error: cErr} = await supabase
      .from('citizens')
      .select('*')
      .order('created_at', {ascending: true});

    if(cErr){ console.error('DARKCITY: citizens load error:', cErr); return false; }
    if(!citizens || citizens.length===0){ console.warn('DARKCITY: no citizens in DB'); return false; }

    // Convert to renderer agents
    ags = citizens.map(citizenToAgent);
    console.log('DARKCITY: loaded '+ags.length+' citizens from Supabase');

    // Load districts and update our DS data
    const {data: districts} = await supabase.from('districts').select('*');
    if(districts && districts.length > 0){
      districts.forEach(dbD => {
        const local = DS.find(d => d.id === (dbD.id || dbD.district_id));
        if(local){
          if(dbD.total_wealth !== undefined) local._dbWealth = dbD.total_wealth;
          if(dbD.population !== undefined) local.pop = dbD.population;
        }
      });
    }

    // Set up realtime subscription for new citizens
    supabase.channel('citizens-changes')
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'citizens'}, payload => {
        console.log('DARKCITY: new citizen arrived:', payload.new.display_name);
        const newAgent = citizenToAgent(payload.new);
        ags.push(newAgent);
        // Flash event
        addFlash(newAgent.did, '#44ff88', false);
      })
      .on('postgres_changes', {event:'UPDATE', schema:'public', table:'citizens'}, payload => {
        const updated = payload.new;
        const existing = ags.find(a => a._dbId === updated.id);
        if(existing){
          // Update live state from DB — exact field names
          if(updated.credits !== undefined) existing.cash = updated.credits;
          if(updated.reputation !== undefined) existing.rep = updated.reputation;
          if(updated.xp !== undefined) existing._xp = updated.xp;
          if(updated.rank !== undefined) existing._rank = updated.rank;
          if(updated.evolution !== undefined) existing._evolution = updated.evolution;
          if(updated.online !== undefined) existing._online = updated.online;
          if(updated.motto) existing.thought = updated.motto;
          if(updated.district_id && updated.district_id !== existing.did){
            existing.did = updated.district_id;
            existing.dRef = DS.find(d=>d.id===updated.district_id) || existing.dRef;
            // Move agent to new district
            const nd = existing.dRef;
            existing.ttx = nd.x+.5+Math.random()*(nd.w-1);
            existing.tty = nd.y+.5+Math.random()*(nd.h-1);
            existing.mv = true;
          }
          // Recalculate HP from xp + reputation
          existing.hp = Math.min(100, 50 + Math.floor((updated.xp||existing._xp||0)/10) + Math.floor((updated.reputation||existing.rep||0)/5));
        }
      })
      .subscribe();

    // Subscribe to events feed
    supabase.channel('events-feed')
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'stream_events'}, payload => {
        const ev = payload.new;
        const div = document.createElement('div'); div.className = 'fe fe-new';
        const isDanger = ev.is_danger || ev.severity === '▓▓▓';
        div.innerHTML = `<div class="fe-t">${new Date(ev.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})} <span style="color:${isDanger?'var(--red)':'var(--ghost)'}">${ev.severity||'░░░'}</span></div><span style="color:${isDanger?'var(--red)':'var(--ghost)'}">${ev.narrative_text || ev.text || ev.message || ''}</span>`;
        fp.insertBefore(div, fp.firstChild);
        if(fp.children.length > 40) fp.removeChild(fp.lastChild);
      })
      .subscribe();

    // Subscribe to narratives (wire reports)
    supabase.channel('narratives-feed')
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'narratives'}, payload => {
        const n = payload.new;
        const div = document.createElement('div'); div.className = 'fe fe-new';
        div.style.background = 'rgba(212,137,10,.04)';
        div.style.borderLeft = '2px solid rgba(212,137,10,.3)';
        div.innerHTML = `<div class="fe-t" style="color:var(--amber-dim)">▓▓▓ NARRATIVE</div><span style="color:var(--amber-dim);font-style:italic;font-family:'Crimson Pro',serif;font-size:.4rem">${n.prose_text || n.text}</span>`;
        fp.insertBefore(div, fp.firstChild);
      })
      .subscribe();

    return true;
  } catch(e) {
    console.error('DARKCITY: Supabase load failed:', e);
    return false;
  }
}

// ============ GENERATE LOCAL AGENTS (fallback) ============
function genAgents(){
  ags=[];let idx=0;
  const TRAITS=['paranoid','ambitious','loyal','reckless','quiet','cunning','desperate','patient'];
  const MOODS=['neutral','tense','scheming','relaxed','angry','afraid','confident','exhausted'];
  const HATS=[null,null,null,'beanie','cap','hood',null,null];
  const COATS=['long','short','vest','jacket','hoodie','trench'];
  DS.forEach(d=>{
    const n=3+Math.floor(Math.random()*4);d.pop=n;
    for(let i=0;i<n;i++){
      const addr=`${100+Math.floor(Math.random()*900)} ${['Canal','Mott','Bowery','Atlantic','Court','Van Brunt','Lenox'][Math.floor(Math.random()*7)]} St`;
      const homeTx=d.x+1+Math.floor(Math.random()*(d.w-2));
      const homeTy=d.y+1+Math.floor(Math.random()*(d.h-2));
      ags.push({nm:NAMES[idx%NAMES.length],role:ROLES[Math.floor(Math.random()*8)],did:d.id,dRef:d,
        tx:d.x+.5+Math.random()*(d.w-1),ty:d.y+.5+Math.random()*(d.h-1),
        ttx:d.x+.5+Math.random()*(d.w-1),tty:d.y+.5+Math.random()*(d.h-1),
        spd:.3+Math.random()*.25,mv:true,mt:.5+Math.random()*3,
        hp:60+Math.floor(Math.random()*40),rep:Math.floor(Math.random()*100),
        cash:100+Math.floor(Math.random()*5000),addr,
        trait:TRAITS[Math.floor(Math.random()*8)],
        mood:MOODS[Math.floor(Math.random()*8)],
        hat:HATS[Math.floor(Math.random()*8)],
        coat:COATS[Math.floor(Math.random()*6)],
        skinTone:['#b8a898','#c4a882','#8a6a52','#d4b896','#a08068'][Math.floor(Math.random()*5)],
        homeTx,homeTy,
        idleAnim:0,idleTimer:0,
        thought:'',thoughtTimer:0,
        trail:[],
        fleeing:false,fleeTimer:0,
        talking:false,talkPartner:null,
        crewId:Math.random()>.7?Math.floor(Math.random()*5):-1,
        _lastEvent:'',_crewmateDied:false,_moodChanged:0
      });
      idx++;
    }
  });
}

function genAtmo(){
  rainDrops=[];for(let i=0;i<300;i++)rainDrops.push({x:Math.random()*1400,y:Math.random()*900,spd:2+Math.random()*4,len:5+Math.random()*10});
  puddles=[];DS.forEach(d=>{for(let i=0;i<4;i++)puddles.push({tx:d.x+Math.random()*d.w,ty:d.y+Math.random()*d.h,rx:3+Math.random()*4,ry:1.5+Math.random()*2,dRef:d});});
  steamVents=[];DS.forEach(d=>{for(let i=0;i<2;i++)steamVents.push({tx:d.x+Math.random()*d.w,ty:d.y+Math.random()*d.h,particles:[]});});
  stars=[];for(let i=0;i<50;i++)stars.push({x:Math.random()*2000,y:Math.random()*400,sz:.3+Math.random()*.5,tw:Math.random()*6.28});
  flashes=[];
}

// ============ DRAW: SKY ============
let _skyGrad=null,_skyH=0;
function drawSky(){
  if(!_skyGrad||_skyH!==H){
    _skyGrad=X.createLinearGradient(0,0,0,H);
    _skyGrad.addColorStop(0,'#0a0a1a');_skyGrad.addColorStop(.4,'#0c0e20');_skyGrad.addColorStop(1,'#080814');
    _skyH=H;
  }
  X.fillStyle=_skyGrad;X.fillRect(0,0,W,H);
  // Stars
  stars.forEach(s=>{const a=.25+Math.sin(performance.now()*.0008+s.tw)*.1;X.fillStyle=`rgba(180,190,220,${a})`;X.fillRect(s.x%W,s.y,s.sz,s.sz);});
}

// ============ FOG OF WAR ============
// Districts start dim. Zoom into them to "activate" the surveillance feed.
const visited = {};
function updateFog(){
  // Check which district the camera center is looking at
  const centerTile = s2t(W/2, H/2);
  DS.forEach(d=>{
    if(centerTile.x>=d.x-1&&centerTile.x<d.x+d.w+1&&centerTile.y>=d.y-1&&centerTile.y<d.y+d.h+1){
      if(cam.z>.7) visited[d.id]=true; // Must be zoomed in enough
    }
  });
}

// ============ DRAW: DISTRICTS ============
function drawDistricts(){
  const hw=TW/2*cam.z, hh=TH/2*cam.z; // Precalculate once

  DS.forEach(d=>{
    const isH=hovD&&hovD.id===d.id;
    const isVis=visited[d.id];
    const fogAlpha=isVis?0:.35; // Unvisited districts have dark fog
    const tileColor=isH?d.c.glow:isVis?'rgba(15,15,30,.5)':'rgba(8,8,18,.6)';
    const borderColor=isH?d.c.accent+'33':isVis?d.c.accent+'15':'rgba(20,20,35,.15)';

    for(let tx=d.x;tx<d.x+d.w;tx++){
      for(let ty=d.y;ty<d.y+d.h;ty++){
        const p=t2s(tx+.5,ty+.5);
        if(p.x<-TW*cam.z||p.x>W+TW*cam.z||p.y<-TH*cam.z||p.y>H+TH*cam.z)continue;

        X.fillStyle=tileColor;
        X.beginPath();X.moveTo(p.x,p.y-hh);X.lineTo(p.x+hw,p.y);X.lineTo(p.x,p.y+hh);X.lineTo(p.x-hw,p.y);X.closePath();X.fill();

        // Edge tiles get district border highlight
        const isEdge=tx===d.x||tx===d.x+d.w-1||ty===d.y||ty===d.y+d.h-1;
        if(isEdge){
          X.strokeStyle=isH?d.c.accent+'55':d.c.accent+'15';X.lineWidth=.5;X.stroke();
        }else{
          X.strokeStyle=borderColor;X.lineWidth=.2;X.stroke();
        }
      }
    }

    // District name label
    if(cam.z>.35){
      const cp=t2s(d.x+d.w/2,d.y+d.h/2);
      if(isH){
        X.font=`${Math.max(7,9*cam.z)}px 'Bebas Neue',sans-serif`;
        X.fillStyle=d.c.accent+'aa';
        X.textAlign='center';X.fillText(d.nm.toUpperCase(),cp.x,cp.y-2);
        X.font=`${Math.max(4,5*cam.z)}px 'Share Tech Mono',monospace`;
        X.fillStyle=d.c.accent+'55';
        X.fillText(d.vb,cp.x,cp.y+8*cam.z);
        X.font=`${Math.max(3,4*cam.z)}px 'Share Tech Mono',monospace`;
        X.fillStyle=d.rk>=4?'rgba(200,50,50,.4)':d.rk>=3?'rgba(200,150,50,.3)':'rgba(50,150,80,.25)';
        X.fillText(d.crime,cp.x,cp.y+14*cam.z);
        X.textAlign='left';
      }else if(!isVis){
        // Unvisited — show CLASSIFIED
        X.font=`${Math.max(5,7*cam.z)}px 'Share Tech Mono',monospace`;
        X.fillStyle='rgba(200,50,50,.12)';
        X.textAlign='center';X.fillText('▓ CLASSIFIED ▓',cp.x,cp.y);
        X.font=`${Math.max(3,4*cam.z)}px 'Share Tech Mono',monospace`;
        X.fillStyle='rgba(255,255,255,.04)';
        X.fillText('ZOOM TO SURVEIL',cp.x,cp.y+7*cam.z);
        X.textAlign='left';
      }else{
        X.font=`${Math.max(5,6*cam.z)}px 'Share Tech Mono',monospace`;
        X.fillStyle='rgba(255,255,255,.06)';
        X.textAlign='center';X.fillText(d.cd,cp.x,cp.y+2);X.textAlign='left';
      }
    }

    // Fog overlay for unvisited districts
    if(!isVis&&!isH){
      const c1=t2s(d.x,d.y),c2=t2s(d.x+d.w,d.y),c3=t2s(d.x+d.w,d.y+d.h),c4=t2s(d.x,d.y+d.h);
      X.fillStyle='rgba(2,2,8,.3)';
      X.beginPath();X.moveTo(c1.x,c1.y);X.lineTo(c2.x,c2.y);X.lineTo(c3.x,c3.y);X.lineTo(c4.x,c4.y);X.closePath();X.fill();
    }
  });
  // === STREETS — road surfaces with weight ===
  X.strokeStyle='rgba(25,25,40,.25)';X.lineWidth=2.5*cam.z;
  for(let i=-2;i<20;i++){
    const a=t2s(i,0),b=t2s(i,18);X.beginPath();X.moveTo(a.x,a.y);X.lineTo(b.x,b.y);X.stroke();
    const c=t2s(0,i),dd=t2s(20,i);X.beginPath();X.moveTo(c.x,c.y);X.lineTo(dd.x,dd.y);X.stroke();
  }
  // Center lane dashes
  X.strokeStyle='rgba(60,55,40,.06)';X.lineWidth=.4;X.setLineDash([3*cam.z,6*cam.z]);
  for(let i=0;i<20;i+=2){
    const a=t2s(i+.5,0),b=t2s(i+.5,18);X.beginPath();X.moveTo(a.x,a.y);X.lineTo(b.x,b.y);X.stroke();
  }
  X.setLineDash([]);
}

// ============ DRAW: PUDDLES with rain splashes ============
function drawPuddles(t){
  puddles.forEach(p=>{
    const pos=t2s(p.tx,p.ty);if(pos.x<-20||pos.x>W+20||pos.y<-20||pos.y>H+20)return;
    const rx=p.rx*cam.z,ry=p.ry*cam.z;
    // Dark base
    X.fillStyle='rgba(4,4,12,.4)';X.beginPath();X.ellipse(pos.x,pos.y,rx,ry,0,0,6.28);X.fill();
    // Neon reflection — ripples outward
    const rip=Math.sin(t*.0015+p.tx*3)*.25+.3;
    // Neon reflection — color driven by dominant crew in district
    const puddleColor = DV.distCrewDom[p.dRef.id] || p.dRef.c.neon;
    X.fillStyle=puddleColor+hex2a(Math.floor(rip*50));
    X.beginPath();X.ellipse(pos.x,pos.y,rx*.6,ry*.6,0,0,6.28);X.fill();
    // Rain splash rings — concentric circles that pulse
    const splashPhase=(t*.003+p.tx*5)%6.28;
    const splashR=(splashPhase/6.28)*rx;
    const splashAlpha=Math.max(0,1-splashPhase/6.28)*.15;
    X.strokeStyle=`rgba(150,160,180,${splashAlpha})`;X.lineWidth=.3;
    X.beginPath();X.ellipse(pos.x+Math.sin(p.tx*7)*rx*.3,pos.y+Math.cos(p.ty*11)*ry*.3,splashR*.5,splashR*.25,0,0,6.28);X.stroke();
  });
}

// ============ DRAW: STREETLIGHTS along district borders ============
function drawLights(t){
  DS.forEach(d=>{
    // Place along left and bottom edges of districts
    const positions=[];
    for(let ty=d.y;ty<d.y+d.h;ty+=2)positions.push({x:d.x-.2,y:ty+.5});
    for(let tx=d.x;tx<d.x+d.w;tx+=2)positions.push({x:tx+.5,y:d.y+d.h+.2});

    positions.forEach((lp,i)=>{
      const pos=t2s(lp.x,lp.y);
      if(pos.x<-30||pos.x>W+30||pos.y<-30||pos.y>H+30)return;
      // Pole
      X.strokeStyle='#2a2a38';X.lineWidth=.8*cam.z;
      X.beginPath();X.moveTo(pos.x,pos.y);X.lineTo(pos.x,pos.y-10*cam.z);X.stroke();
      // Arm
      X.beginPath();X.moveTo(pos.x,pos.y-9*cam.z);X.lineTo(pos.x+2*cam.z,pos.y-10*cam.z);X.stroke();

      const flk=.6+Math.sin(t*.0015+i*2.7+d.x)*.3;
      const lm=DV.lightMult[d.id]||1; // Safety-driven brightness
      // Lamp
      X.fillStyle=`rgba(220,180,100,${.7*flk*lm})`;
      X.beginPath();X.arc(pos.x+2*cam.z,pos.y-10*cam.z,1*cam.z,0,6.28);X.fill();
      // Ground pool — brighter in safe districts
      X.fillStyle=`rgba(200,160,80,${.07*flk*lm})`;
      X.beginPath();X.ellipse(pos.x,pos.y,6*cam.z,3*cam.z,0,0,6.28);X.fill();
    });
  });
}

// ============ DRAW: BUILDING ============
function drawBuilding(b,t){
  const p=t2s(b.tx+.5,b.ty+.5);
  if(p.x<-100||p.x>W+100||p.y<-200||p.y>H+100)return;
  const d=b.dRef,c=d.c;
  const bw=b.bw||TW*.8, bd=b.bd||TH*.8;
  const gm=b._glowMult||1; // Wealth-driven glow intensity

  // Main block
  isoBlock(p.x,p.y,bw,b.h,bd,c.top,c.front,c.side);

  const hw=bw/2*cam.z, hh=bd/2*cam.z, ht=b.h*cam.z;
  const wR=Math.floor(b.h/8);

  // === FRONT FACE WINDOWS ===
  const wCf=b.wCf||Math.max(1,Math.floor(bw/14));
  for(let r=0;r<wR;r++){
    for(let cl=0;cl<wCf;cl++){
      const idx=r*wCf+cl;
      if(!b.wins[idx])continue;
      // Front face goes from (sx-hw, sy) to (sx, sy+hh), rising by ht
      // Window position interpolated along face
      const frac=(cl+.5)/wCf; // 0-1 across face width
      const wx=p.x-hw+frac*hw; // x lerp
      const wy=p.y+frac*hh-r*8*cam.z-5*cam.z; // y follows iso slope + floor offset
      if(b.wLit[idx]){
        let a=.5*gm;if(b.wFlk[idx])a=(.25+Math.sin(t*.002+b.wPh[idx])*.25)*gm;
        X.fillStyle=c.neon+hex2a(Math.floor(a*60));X.fillRect(wx-1.5*cam.z,wy-1*cam.z,5*cam.z,6*cam.z);
        X.fillStyle=c.neon+hex2a(Math.floor(a*200));X.fillRect(wx,wy,3*cam.z,4*cam.z);
      }else{
        X.fillStyle='rgba(0,0,0,.15)';X.fillRect(wx,wy,3*cam.z,4*cam.z);
      }
    }
  }

  // === SIDE FACE WINDOWS (right face) ===
  const wCs=b.wCs||Math.max(1,Math.floor(bd/14));
  for(let r=0;r<wR;r++){
    for(let cl=0;cl<wCs;cl++){
      const idx=wR*wCf+r*wCs+cl; // Offset past front windows
      if(idx>=b.wins.length||!b.wins[idx])continue;
      // Right face goes from (sx, sy+hh) to (sx+hw, sy), rising by ht
      const frac=(cl+.5)/wCs;
      const wx=p.x+frac*hw;
      const wy=p.y+hh-frac*hh-r*8*cam.z-5*cam.z;
      if(idx<b.wLit.length&&b.wLit[idx]){
        let a=.4;if(idx<b.wFlk.length&&b.wFlk[idx])a=.2+Math.sin(t*.002+b.wPh[idx%b.wPh.length])*.2;
        // Side windows slightly dimmer (facing away from viewer)
        X.fillStyle=c.neon+hex2a(Math.floor(a*45));X.fillRect(wx-1*cam.z,wy-1*cam.z,4.5*cam.z,5.5*cam.z);
        X.fillStyle=c.neon+hex2a(Math.floor(a*150));X.fillRect(wx,wy,2.5*cam.z,3.5*cam.z);
      }else{
        X.fillStyle='rgba(0,0,0,.1)';X.fillRect(wx,wy,2.5*cam.z,3.5*cam.z);
      }
    }
  }

  // === NEON SIGN with ground light spill ===
  if(b.sign){
    const sy2=p.y-14*cam.z, sw=hw*.9;
    // Glow layers
    X.fillStyle=c.neon+'30';X.fillRect(p.x-hw,sy2-2*cam.z,sw+4*cam.z,6*cam.z);
    X.fillStyle=c.neon+'88';X.fillRect(p.x-hw+cam.z,sy2,sw,2.5*cam.z);
    // Text — shows top earner on tall buildings
    if(cam.z>.4){
      const signLabel = b._dynamicSign || b.signTxt;
      X.fillStyle=c.side;X.font=`bold ${Math.max(3,4.5*cam.z)}px 'Share Tech Mono'`;
      X.fillText(signLabel,p.x-hw+3*cam.z,sy2+2*cam.z);
    }
    // Ground light spill — colored pool below the sign
    if(b.signGlow){
      X.fillStyle=c.neon+'0c';
      X.beginPath();X.ellipse(p.x-hw*.3,p.y+hh*.3,4*cam.z,2*cam.z,0,0,6.28);X.fill();
    }
  }

  // === ANTENNA + blink ===
  if(b.antenna){
    X.strokeStyle='rgba(120,120,140,.2)';X.lineWidth=.5;
    X.beginPath();X.moveTo(p.x,p.y-ht);X.lineTo(p.x,p.y-ht-10*cam.z);X.stroke();
    // Cross bar
    X.beginPath();X.moveTo(p.x-2*cam.z,p.y-ht-7*cam.z);X.lineTo(p.x+2*cam.z,p.y-ht-7*cam.z);X.stroke();
    if(Math.sin(t*.004+b.tx)>.3){
      X.fillStyle='rgba(240,50,50,.7)';X.beginPath();X.arc(p.x,p.y-ht-10*cam.z,1*cam.z,0,6.28);X.fill();
      // Blink glow
      X.fillStyle='rgba(240,50,50,.08)';X.beginPath();X.arc(p.x,p.y-ht-10*cam.z,4*cam.z,0,6.28);X.fill();
    }
  }

  // === ROOFTOP DETAILS — iso water tank ===
  if(b.h>40&&!b.antenna){
    const tkw=5,tkh=6,tkd=4;
    isoBlock(p.x-1*cam.z,p.y-ht,tkw,tkh,tkd,c.top,c.front,c.side);
  }else if(b.h>25&&b.h<=40&&Math.sin(b.tx*7+b.ty*13)>.2){
    // AC units — small iso boxes
    isoBlock(p.x-hw*.3,p.y-ht,3,3,3,c.top,'#1a1a28',c.side);
    isoBlock(p.x+hw*.15,p.y-ht,3,3,3,c.top,'#1a1a28',c.side);
  }

  // === AWNING — proper canopy shape ===
  if(b.awning){
    const awCol=d.id==='chi'?c.neon+'28':d.id==='les'?c.neon+'20':c.accent+'18';
    // Canopy triangle on front face
    X.fillStyle=awCol;
    X.beginPath();
    X.moveTo(p.x-hw,p.y-4*cam.z);
    X.lineTo(p.x-hw-2.5*cam.z,p.y+1*cam.z);
    X.lineTo(p.x-hw*.2,p.y+hh*.4+1*cam.z);
    X.lineTo(p.x-hw*.2,p.y+hh*.4-3*cam.z);
    X.closePath();X.fill();
    // Awning edge highlight
    X.strokeStyle=c.accent+'22';X.lineWidth=.3;
    X.beginPath();X.moveTo(p.x-hw-2.5*cam.z,p.y+1*cam.z);X.lineTo(p.x-hw*.2,p.y+hh*.4+1*cam.z);X.stroke();
  }

  // === CHINATOWN LANTERNS ===
  if(d.id==='chi'&&b.sign){
    for(let li=0;li<3;li++){
      const lx=p.x-hw+3*cam.z+li*5*cam.z, ly=p.y-6*cam.z;
      // String
      X.strokeStyle='rgba(160,80,40,.15)';X.lineWidth=.3;
      if(li===0)X.beginPath();
      if(li===0){X.moveTo(p.x-hw+1*cam.z,ly-3*cam.z);}
      X.lineTo(lx,ly-1*cam.z);
      if(li===2)X.stroke();
      // Lantern body — oval shape
      X.fillStyle='rgba(200,60,25,.1)';X.beginPath();X.ellipse(lx,ly,2.5*cam.z,1.5*cam.z,0,0,6.28);X.fill();
      X.fillStyle='#cc4420';X.beginPath();X.ellipse(lx,ly,1.5*cam.z,.8*cam.z,0,0,6.28);X.fill();
      // Warm glow
      X.fillStyle='rgba(200,80,30,.04)';X.beginPath();X.arc(lx,ly,4*cam.z,0,6.28);X.fill();
    }
  }
}

// ============ DRAW: AGENT ============
function drawAgent(a,t){
  const p=t2s(a.tx,a.ty);if(p.x<-30||p.x>W+30||p.y<-30||p.y>H+30)return;
  const d=a.dRef,sz=cam.z;

  // === FOG CHECK — agents in unvisited districts are dim silhouettes ===
  if(!visited[a.did]){
    X.fillStyle='rgba(40,40,60,.15)';
    X.fillRect(p.x-2*sz,p.y-8*sz,4*sz,8*sz);
    X.fillStyle='rgba(40,40,60,.12)';
    X.beginPath();X.arc(p.x,p.y-9*sz,1.5*sz,0,6.28);X.fill();
    return; // No detail — classified
  }

  const isFol=followA===a,isSel=selA===a;
  const isBoss=a.rep>70&&a.crewId>=0; // High rep + crew = boss
  const s=Math.max(1,(isBoss?1.7:1.4)*sz); // Bosses are bigger

  // Direction of movement for facing
  const dx=a.ttx-a.tx,dy=a.tty-a.ty;
  const facingRight=dx-dy>0; // Iso direction

  const ox=p.x-3*s,oy=p.y-9*s;
  const walk=a.mv?Math.floor(t*.006+a.tx*10)%6:0; // 6-frame walk cycle
  // Stepping bob — sharp up on step frames, not sinusoidal
  const bob=a.mv?(walk===1||walk===4?-s*.6:walk===2||walk===5?-s*.3:0):0;
  // Breathing — subtle when idle
  const breath=a.mv?0:Math.sin(t*.002+a.tx*3)*s*.15;

  // === DEAD STATE ===
  if(a._dead){
    const elapsed=performance.now()-(a._deadTime||performance.now());
    const fade=Math.max(0,1-elapsed/3000);
    X.globalAlpha=fade*.5;
    // Fallen body — horizontal
    X.fillStyle=d.c.accent+'44';X.fillRect(p.x-4*s,p.y-1*s,8*s,2*s);
    X.fillStyle=a.skinTone+'88';X.fillRect(p.x+3*s,p.y-1*s,2*s,1.5*s);
    // X mark above — pulses
    const xPulse=.2+Math.sin(elapsed*.005)*.1;
    X.fillStyle='rgba(200,30,30,'+xPulse+')';X.font=`${7*sz}px 'Bebas Neue'`;
    X.textAlign='center';X.fillText('✕',p.x,p.y-4*sz);X.textAlign='left';
    X.globalAlpha=1;
    return;
  }

  // === TRAIL — fading dots ===
  if(a.trail.length>1&&cam.z>.4){
    for(let ti=0;ti<a.trail.length;ti+=2){
      const tp=t2s(a.trail[ti],a.trail[ti+1]);
      const age=1-(ti/a.trail.length); // Older = fainter
      X.fillStyle=d.c.accent+hex2a(Math.floor(age*20));
      X.beginPath();X.arc(tp.x,tp.y,.5+age*.5,0,6.28);X.fill();
    }
  }

  // === SHADOW ===
  X.fillStyle='rgba(0,0,0,.12)';
  X.beginPath();X.ellipse(p.x,p.y+1*sz,3*sz,1.2*sz,0,0,6.28);X.fill();

  // === FOLLOW RING — smooth pulse ===
  if(isFol){
    const rPulse=5*sz+Math.sin(t*.003)*1.5*sz;
    X.strokeStyle=d.c.accent+'66';X.lineWidth=.8;X.setLineDash([2,2]);
    X.beginPath();X.arc(p.x,p.y-3*sz,rPulse,0,6.28);X.stroke();X.setLineDash([]);
    // Inner glow
    X.fillStyle=d.c.accent+'06';X.beginPath();X.arc(p.x,p.y-3*sz,rPulse,0,6.28);X.fill();
  }

  // === CREW INDICATOR — small mark behind head ===
  if(a.crewId>=0){
    const crewC=['#ff6644','#44ff88','#4488ff','#ffaa22','#ff44aa'][a.crewId%5];
    X.fillStyle=crewC+'55';
    X.fillRect(ox+5.5*s,oy+.5*s+bob+breath,.8*s,1.5*s); // Small bar beside head
  }

  // === HP VISUAL — wound marks, not overlay ===
  const hpRatio=a.hp/100;

  // === LEGS (drawn first — behind body) ===
  X.fillStyle=d.c.side;
  const legOff=facingRight?0:0; // Could add directional offset
  if(a.mv){
    // 6-frame walk: stride varies
    const frames=[
      [[.8,5,1.5,2.2],[2.8,5,1.5,2.2]], // 0: together
      [[.3,4.8,1.6,2.4],[3,5.3,1.4,1.8]], // 1: left forward
      [[.6,5,1.5,2],[2.5,5.5,1.5,1.6]], // 2: passing
      [[.8,5,1.5,2.2],[2.8,5,1.5,2.2]], // 3: together
      [[3,4.8,1.6,2.4],[.3,5.3,1.4,1.8]], // 4: right forward
      [[2.5,5,1.5,2],[.6,5.5,1.5,1.6]]  // 5: passing
    ];
    const f=frames[walk];
    X.fillRect(ox+f[0][0]*s,oy+f[0][1]*s+bob,f[0][2]*s,f[0][3]*s);
    X.fillRect(ox+f[1][0]*s,oy+f[1][1]*s+bob,f[1][2]*s,f[1][3]*s);
  }else{
    if(a.idleAnim===3){ // Lean
      X.fillRect(ox+.5*s,oy+5*s+breath,1.5*s,2*s);
      X.fillRect(ox+3.2*s,oy+5.3*s+breath,1.5*s,1.7*s);
    }else{ // Stand with slight sway
      X.fillRect(ox+.8*s,oy+5*s+breath,1.5*s,2.2*s);
      X.fillRect(ox+2.8*s,oy+5*s+breath,1.5*s,2.2*s);
    }
  }

  // === BODY (torso) ===
  const coatC=a.coat==='trench'?d.c.base:a.coat==='hoodie'?d.c.front:d.c.accent;
  const bodyA=hpRatio>.5?'bb':'77';
  X.fillStyle=coatC+bodyA;
  X.fillRect(ox+.8*s,oy+2.5*s+bob+breath,4.4*s,2.8*s);
  // Torso detail — belt/trim line
  X.fillStyle=d.c.side+'55';
  X.fillRect(ox+.8*s,oy+4.8*s+bob+breath,4.4*s,.4*s);

  // === ARMS ===
  X.fillStyle=coatC+bodyA;
  if(a.mv){
    // Arm swing opposite to legs
    const armPhase=Math.sin(t*.012+a.tx)*s;
    X.fillRect(ox-.2*s,oy+2.8*s+bob+armPhase*.3,1.2*s,2*s); // Left arm
    X.fillRect(ox+5*s,oy+2.8*s+bob-armPhase*.3,1.2*s,2*s); // Right arm
  }else{
    if(a.idleAnim===1){ // Smoking — arm raised
      X.fillRect(ox-.2*s,oy+2.8*s+breath,1.2*s,2*s); // Left arm down
      X.fillRect(ox+5*s,oy+1.5*s+breath,1.2*s,1.8*s); // Right arm up (holding cig)
    }else if(a.idleAnim===2){ // Phone — both arms forward
      X.fillRect(ox+.2*s,oy+3*s+breath,1*s,1.8*s);
      X.fillRect(ox+4.8*s,oy+3*s+breath,1*s,1.8*s);
    }else{
      X.fillRect(ox-.2*s,oy+2.8*s+breath,1.2*s,2.2*s);
      X.fillRect(ox+5*s,oy+2.8*s+breath,1.2*s,2.2*s);
    }
  }

  // === HEAD ===
  X.fillStyle=a.skinTone;
  X.fillRect(ox+1.2*s,oy+bob+breath,3.6*s,2.2*s);
  // Eyes — direction aware
  const eyeX=facingRight?.4:0;
  X.fillStyle='#111';
  X.fillRect(ox+1.8*s+eyeX*s,oy+.8*s+bob+breath,.5*s,.5*s);
  X.fillRect(ox+3.2*s+eyeX*s,oy+.8*s+bob+breath,.5*s,.5*s);

  // === HIGH VALUE TARGET marker (surveillance system auto-tag) ===
  if(isBoss){
    // Target reticle brackets — like the surveillance system flagged them
    X.strokeStyle=d.c.accent+'55';X.lineWidth=.6;
    const bx=ox-.5*s,by=oy-2*s+bob+breath,bw2=7*s,bh2=11*s,cs=2*s;
    // Four corners
    X.beginPath();X.moveTo(bx,by+cs);X.lineTo(bx,by);X.lineTo(bx+cs,by);X.stroke();
    X.beginPath();X.moveTo(bx+bw2-cs,by);X.lineTo(bx+bw2,by);X.lineTo(bx+bw2,by+cs);X.stroke();
    X.beginPath();X.moveTo(bx+bw2,by+bh2-cs);X.lineTo(bx+bw2,by+bh2);X.lineTo(bx+bw2-cs,by+bh2);X.stroke();
    X.beginPath();X.moveTo(bx+cs,by+bh2);X.lineTo(bx,by+bh2);X.lineTo(bx,by+bh2-cs);X.stroke();
    // HV tag — system-generated label
    X.font=`${3*sz}px 'Share Tech Mono'`;
    X.fillStyle=d.c.accent+'66';
    X.fillText('HV',bx+bw2+1*sz,by+3*sz);
  }

  // === HAT ===
  if(a.hat){
    X.fillStyle=a.hat==='beanie'?d.c.accent+'99':a.hat==='hood'?d.c.front+'cc':d.c.side+'aa';
    if(a.hat==='beanie'){
      X.fillRect(ox+.8*s,oy-.6*s+bob+breath,4.4*s,1*s);
      X.fillRect(ox+1.5*s,oy-1*s+bob+breath,3*s,.5*s); // Rolled brim
    }else if(a.hat==='cap'){
      X.fillRect(ox+.5*s,oy-.3*s+bob+breath,5*s,.8*s);
      X.fillRect(ox+(facingRight?4.5:-.5)*s,oy-.1*s+bob+breath,2*s,.5*s); // Bill
    }else if(a.hat==='hood'){
      X.fillRect(ox+.5*s,oy-1*s+bob+breath,5*s,1.8*s);
      X.fillRect(ox+.2*s,oy+.3*s+bob+breath,5.6*s,.5*s); // Hood rim
    }
  }

  // === IDLE DETAILS ===
  if(!a.mv&&cam.z>.4){
    if(a.idleAnim===1){ // Smoking
      // Cigarette
      X.fillStyle='rgba(220,140,60,.6)';X.fillRect(ox+5.8*s,oy+1.8*s+breath,2*s,.3*s);
      X.fillStyle='rgba(240,80,30,.4)';X.fillRect(ox+7.5*s,oy+1.7*s+breath,.5*s,.5*s); // Ember
      // Rising smoke wisps — multiple, animated
      for(let wi=0;wi<3;wi++){
        const wAge=((t*.001+wi*1.2)%3)/3; // 0-1 lifecycle
        const wsy=oy+1.5*s+breath-wAge*8*s;
        const wsx=ox+7*s+Math.sin(t*.003+wi*2)*1.5*s;
        const wAlpha=Math.max(0,(1-wAge)*.06);
        X.fillStyle=`rgba(140,140,160,${wAlpha})`;
        X.beginPath();X.arc(wsx,wsy,(1+wAge*2)*s,0,6.28);X.fill();
      }
    }else if(a.idleAnim===2){ // Phone
      // Phone screen with flicker
      const phFlk=.5+Math.sin(t*.01)*.2;
      X.fillStyle=d.c.neon+hex2a(Math.floor(phFlk*80));
      X.fillRect(ox+2.5*s,oy+3.5*s+breath,1.5*s,2*s);
      X.strokeStyle=d.c.neon+'33';X.lineWidth=.3;
      X.strokeRect(ox+2.3*s,oy+3.3*s+breath,1.9*s,2.4*s);
      // Face illumination
      X.fillStyle=d.c.neon+hex2a(Math.floor(phFlk*10));
      X.beginPath();X.arc(p.x,oy+1.5*s+breath,3*s,0,6.28);X.fill();
    }
  }

  // === LOW HP — wound marks, not overlay ===
  if(a.hp<30){
    // Small red marks on body
    X.fillStyle='rgba(180,30,30,.3)';
    X.fillRect(ox+1.5*s,oy+3*s+bob+breath,.6*s,.6*s);
    X.fillRect(ox+3.5*s,oy+3.8*s+bob+breath,.5*s,.5*s);
    // Stagger — body tilts slightly
  }
  if(a.hp<15){
    X.fillStyle='rgba(180,30,30,.4)';
    X.fillRect(ox+2.5*s,oy+4*s+bob+breath,.4*s,.8*s);
  }

  // === HIGH REP — visible aura ===
  if(a.rep>75&&cam.z>.35){
    X.strokeStyle=d.c.accent+'18';X.lineWidth=.8;
    X.beginPath();X.arc(p.x,p.y-4*sz,7*sz,0,6.28);X.stroke();
    X.strokeStyle=d.c.accent+'0c';
    X.beginPath();X.arc(p.x,p.y-4*sz,9*sz,0,6.28);X.stroke();
  }

  // === SELECT HIGHLIGHT ===
  if(isSel){
    X.strokeStyle=d.c.accent+'55';X.lineWidth=.8;
    X.strokeRect(ox-.5*s,oy-1.5*s+bob+breath,7.5*s,9.5*s);
    // Corner brackets instead of plain rect
    const bsz=1.5*s;
    X.strokeStyle=d.c.accent+'88';X.lineWidth=1;
    // Top-left
    X.beginPath();X.moveTo(ox-.5*s,oy-1.5*s+bsz+bob);X.lineTo(ox-.5*s,oy-1.5*s+bob);X.lineTo(ox-.5*s+bsz,oy-1.5*s+bob);X.stroke();
    // Top-right
    X.beginPath();X.moveTo(ox+7*s-bsz,oy-1.5*s+bob);X.lineTo(ox+7*s,oy-1.5*s+bob);X.lineTo(ox+7*s,oy-1.5*s+bsz+bob);X.stroke();
    // Bottom-left
    X.beginPath();X.moveTo(ox-.5*s,oy+8*s-bsz+bob);X.lineTo(ox-.5*s,oy+8*s+bob);X.lineTo(ox-.5*s+bsz,oy+8*s+bob);X.stroke();
    // Bottom-right
    X.beginPath();X.moveTo(ox+7*s-bsz,oy+8*s+bob);X.lineTo(ox+7*s,oy+8*s+bob);X.lineTo(ox+7*s,oy+8*s-bsz+bob);X.stroke();
  }

  // === NAME — bosses always visible ===
  if(cam.z>.4||isBoss){
    X.font=`${Math.max(4,(isBoss?6:5)*sz)}px 'Share Tech Mono'`;
    X.fillStyle=d.c.accent+(isSel?'cc':isBoss?'aa':'77');
    X.textAlign='center';X.fillText(a.nm,p.x,oy-(isBoss?4:2)*sz+bob+breath);X.textAlign='left';
  }

  // === THOUGHT BUBBLE — fade in/out ===
  if(a.thoughtTimer>0&&a.thought&&cam.z>.45){
    const fadeIn=Math.min(a.thoughtTimer,1);
    const fadeOut=Math.min(a.thoughtTimer/1,1); // Last second fades
    const alpha=Math.min(fadeIn,fadeOut);

    const bubFont=`${Math.max(3.5,4*sz)}px 'Share Tech Mono'`;
    X.font=bubFont;
    const tw=X.measureText(a.thought).width;
    const bx=p.x-tw/2-3*sz, by=oy-10*sz+bob;
    const bw2=tw+6*sz, bh2=5.5*sz;

    // Bubble bg
    X.fillStyle='rgba(6,6,15,'+(.8*alpha)+')';
    X.beginPath();
    // Rounded rect
    const r=1.5*sz;
    X.moveTo(bx+r,by);X.lineTo(bx+bw2-r,by);X.arcTo(bx+bw2,by,bx+bw2,by+r,r);
    X.lineTo(bx+bw2,by+bh2-r);X.arcTo(bx+bw2,by+bh2,bx+bw2-r,by+bh2,r);
    X.lineTo(bx+r,by+bh2);X.arcTo(bx,by+bh2,bx,by+bh2-r,r);
    X.lineTo(bx,by+r);X.arcTo(bx,by,bx+r,by,r);
    X.closePath();X.fill();
    // Border
    X.strokeStyle='rgba(255,255,255,'+(.06*alpha)+')';X.lineWidth=.3;X.stroke();
    // Pointer triangle
    X.fillStyle='rgba(6,6,15,'+(.8*alpha)+')';
    X.beginPath();X.moveTo(p.x-1.5*sz,by+bh2);X.lineTo(p.x+1.5*sz,by+bh2);X.lineTo(p.x,by+bh2+2.5*sz);X.closePath();X.fill();
    // Text
    X.fillStyle='rgba(170,165,155,'+(.65*alpha)+')';
    X.textAlign='center';X.fillText(a.thought,p.x,by+3.8*sz);X.textAlign='left';
  }

  // === TALKING — animated bouncing dots ===
  if(a.talking&&cam.z>.4){
    for(let di=0;di<3;di++){
      const dotBounce=Math.sin(t*.008+di*.7)*1*sz;
      X.fillStyle=d.c.accent+hex2a(Math.floor((.25+Math.sin(t*.006+di)*.1)*255));
      X.beginPath();X.arc(p.x+(3+di*1.8)*sz,oy+.5*sz+bob+dotBounce,.6*sz,0,6.28);X.fill();
    }
  }

  // === FLEEING — directional speed lines ===
  if(a.fleeing&&a.mv&&cam.z>.35){
    // Lines go opposite to movement direction
    const moveAng=Math.atan2(dy,dx);
    X.strokeStyle=d.c.accent+'20';X.lineWidth=.4;
    for(let sl=0;sl<4;sl++){
      const slDist=(2+sl*1.5)*sz;
      const slx=p.x-Math.cos(moveAng)*slDist+(Math.random()-.5)*2*sz;
      const sly=p.y-4*sz-Math.sin(moveAng)*slDist+(Math.random()-.5)*2*sz;
      X.beginPath();X.moveTo(slx,sly);X.lineTo(slx-Math.cos(moveAng)*3*sz,sly-Math.sin(moveAng)*3*sz);X.stroke();
    }
  }
}

// ============ DRAW: STEAM ============
function drawSteam(t){
  steamVents.forEach(v=>{
    const p=t2s(v.tx,v.ty);if(p.x<-30||p.x>W+30)return;
    // Spawn in world-relative offset coords
    if(Math.random()>.75)v.particles.push({ox:0,oy:0,vy:-.008,life:1,sz:.8+Math.random()*1.5,drift:Math.random()*6.28});
    v.particles.forEach(pt=>{
      const sx=p.x+pt.ox*cam.z+Math.sin(t*.002+pt.drift)*1.5*cam.z;
      const sy=p.y+pt.oy*cam.z;
      X.fillStyle=`rgba(100,100,130,${pt.life*.06})`;
      X.beginPath();X.arc(sx,sy,pt.sz*cam.z,0,6.28);X.fill();
      pt.oy-=.5;pt.life-=.012;pt.sz+=.015;
    });
    v.particles=v.particles.filter(pt=>pt.life>0);
  });
}

// ============ DRAW: RAIN ============
function drawRain(){
  const rainOp=.04*DV.rainIntensity+.02; // Heavier rain when danger is high
  X.strokeStyle=`rgba(130,140,160,${rainOp})`;X.lineWidth=.4;
  rainDrops.forEach(d=>{
    X.beginPath();X.moveTo(d.x,d.y);X.lineTo(d.x+.2,d.y+d.len);X.stroke();
    d.y+=d.spd;d.x+=.15; // slight wind
    if(d.y>H+20){d.y=-d.len-Math.random()*40;d.x=Math.random()*W;}
    if(d.x>W+10)d.x=-10;
  });
}

// ============ DRAW: FLASHES ============
function addFlash(did,color,dangerous){
  const d=DS.find(dd=>dd.id===did);if(!d)return;
  flashes.push({tx:d.x+d.w/2,ty:d.y+d.h/2,r:0,life:1,color});
  // Danger events make nearby agents flee
  if(dangerous){
    ags.forEach(a=>{
      if(a.did===did&&!a.fleeing){
        a.fleeing=true;a.fleeTimer=2+Math.random()*2;a.mv=false;a.mt=0;
        a.mood=['afraid','tense','angry'][Math.floor(Math.random()*3)];
      }
    });
  }
}
function drawFlashes(){
  flashes.forEach(f=>{
    const p=t2s(f.tx,f.ty);f.r+=.3;f.life-=.012;
    X.strokeStyle=f.color+hex2a(Math.floor(f.life*80));X.lineWidth=cam.z*f.life;
    X.beginPath();X.arc(p.x,p.y,f.r*cam.z,0,6.28);X.stroke();
  });
  flashes=flashes.filter(f=>f.life>0);
}

// ============ APARTMENT VIEWER ============
const aptCv=document.getElementById('aptCv');
const AX=aptCv.getContext('2d');
let aptAgent=null,aptRoom='living';

function openApt(a){
  aptAgent=a;aptRoom='living';
  document.getElementById('aptM').classList.add('show');
  document.getElementById('aptN').textContent=a.nm+'\'s apartment';
  document.getElementById('aptA').textContent=a.addr+', '+a.dRef.nm;
  document.getElementById('aptDist').textContent=a.dRef.nm;
  document.getElementById('aptRent').textContent='$'+a.dRef.apt.rent+'/mo';
  document.getElementById('aptCond').textContent=a.dRef.apt.cond;
  document.querySelectorAll('.apt-tab').forEach(t=>{t.classList.toggle('on',t.dataset.room==='living');});
  drawApt(performance.now());
}

function drawApt(t){
  const box=aptCv.parentElement;
  if(!box.clientWidth)return;
  aptCv.width=box.clientWidth*2;aptCv.height=box.clientHeight*2;
  aptCv.style.width=box.clientWidth+'px';aptCv.style.height=box.clientHeight+'px';
  AX.setTransform(2,0,0,2,0,0);
  const w=box.clientWidth,h=box.clientHeight;
  if(!aptAgent)return;
  const d=aptAgent.dRef,c=d.c;
  const rich=aptAgent.cash>2000;
  t=t||0;

  // Room bg
  const bg=AX.createLinearGradient(0,0,0,h);
  bg.addColorStop(0,'#202030');bg.addColorStop(1,'#181824');
  AX.fillStyle=bg;AX.fillRect(0,0,w,h);

  // Floor
  AX.fillStyle=rich?'#1c1c2a':'#141420';AX.fillRect(0,h*.65,w,h*.35);
  AX.strokeStyle='rgba(255,255,255,.02)';AX.lineWidth=.5;
  for(let fx=0;fx<w;fx+=(rich?15:20)){AX.beginPath();AX.moveTo(fx,h*.65);AX.lineTo(fx,h);AX.stroke();}

  // Wall
  AX.strokeStyle='rgba(255,255,255,.08)';AX.lineWidth=1;
  AX.beginPath();AX.moveTo(0,h*.65);AX.lineTo(w,h*.65);AX.stroke();

  // Window — animated rain drips
  const ww=w*.25,wh=h*.35,wx=w*.65,wy=h*.1;
  AX.fillStyle='#141828';AX.fillRect(wx,wy,ww,wh);
  AX.strokeStyle='rgba(255,255,255,.05)';AX.lineWidth=1;AX.strokeRect(wx,wy,ww,wh);
  AX.beginPath();AX.moveTo(wx+ww/2,wy);AX.lineTo(wx+ww/2,wy+wh);AX.stroke();
  AX.beginPath();AX.moveTo(wx,wy+wh/2);AX.lineTo(wx+ww,wy+wh/2);AX.stroke();
  AX.fillStyle=c.neon+'30';AX.fillRect(wx,wy,ww,wh);
  for(let i=0;i<20;i++){
    const rx=wx+((i*37+t*.02)%ww),ry=wy+((i*53+t*.03)%wh);
    AX.fillStyle='rgba(120,140,180,.1)';AX.fillRect(rx,ry,.5,2+Math.sin(t*.001+i)*3);
  }
  AX.fillStyle=c.neon+'12';AX.fillRect(wx-15,wy,ww+30,wh+50);
  if(Math.sin(t*.0008)>.95){AX.fillStyle='rgba(255,255,200,.03)';AX.fillRect(0,0,w,h);}

  if(aptRoom==='living'){
    AX.fillStyle='#20202e';AX.fillRect(w*.05,h*.55,w*.35,h*.12);
    AX.fillStyle='#262636';AX.fillRect(w*.05,h*.45,w*.35,h*.12);
    AX.fillStyle=c.accent+'44';AX.fillRect(w*.07,h*.47,w*.08,h*.08);
    AX.fillStyle=c.accent+'44';AX.fillRect(w*.2,h*.47,w*.08,h*.08);
    if(rich){AX.fillStyle=c.accent+'33';AX.fillRect(w*.32,h*.47,w*.06,h*.06);}
    const tvF=.6+Math.sin(t*.008)*.2+Math.sin(t*.013)*.15;
    AX.fillStyle='#161622';AX.fillRect(w*.45,h*.25,w*.12,h*.2);
    AX.fillStyle=c.neon+hex2a(Math.floor(tvF*60));AX.fillRect(w*.455,h*.255,w*.11,h*.19);
    AX.strokeStyle=c.neon+'55';AX.lineWidth=.5;AX.strokeRect(w*.45,h*.25,w*.12,h*.2);
    AX.fillStyle=c.neon+hex2a(Math.floor(tvF*12));AX.fillRect(w*.35,h*.15,w*.25,h*.45);
    AX.fillStyle='#1e1e28';AX.fillRect(w*.15,h*.7,w*.2,h*.06);
    const lF=.7+Math.sin(t*.003)*.15;
    AX.fillStyle=`rgba(200,160,80,${.06*lF})`;AX.beginPath();AX.arc(w*.42,h*.4,30,0,6.28);AX.fill();
    AX.fillStyle='#3a3228';AX.fillRect(w*.41,h*.35,w*.02,h*.15);
    if(rich){AX.fillStyle='#1a1a26';AX.fillRect(w*.02,h*.2,w*.08,h*.3);
      for(let b=0;b<5;b++){AX.fillStyle=['#2a2030','#20282a','#282420','#222230','#2a2020'][b];AX.fillRect(w*.025,h*.22+b*h*.055,w*.065,h*.04);}}
  }else if(aptRoom==='kitchen'){
    AX.fillStyle='#1e1e28';AX.fillRect(w*.05,h*.5,w*.5,h*.05);
    AX.fillStyle='#262634';AX.fillRect(w*.05,h*.55,w*.5,h*.15);
    AX.fillStyle='#242432';AX.fillRect(w*.1,h*.4,w*.12,h*.12);
    if(rich){AX.fillStyle='rgba(200,80,30,.06)';AX.beginPath();AX.arc(w*.14,h*.44,5,0,6.28);AX.fill();}
    AX.fillStyle='#0a0a10';AX.beginPath();AX.arc(w*.14,h*.44,3,0,6.28);AX.fill();
    AX.beginPath();AX.arc(w*.18,h*.44,3,0,6.28);AX.fill();
    AX.fillStyle='#202030';AX.fillRect(w*.35,h*.2,w*.1,h*.35);
    AX.strokeStyle='rgba(255,255,255,.06)';AX.strokeRect(w*.35,h*.2,w*.1,h*.35);
    const kF=.5+Math.sin(t*.004)*.15;
    AX.fillStyle=`rgba(200,180,120,${.05*kF})`;AX.beginPath();AX.arc(w*.25,h*.3,25,0,6.28);AX.fill();
    if(rich){AX.fillStyle='#2a2a38';AX.fillRect(w*.25,h*.46,w*.04,h*.05);AX.fillRect(w*.3,h*.47,w*.03,h*.04);}
  }else{
    AX.fillStyle=rich?'#1a1a2a':'#141420';AX.fillRect(w*.05,h*.5,w*.4,h*.2);
    AX.fillStyle=c.accent+(rich?'30':'18');AX.fillRect(w*.05,h*.5,w*.4,h*.08);
    AX.fillStyle='#1a1a24';AX.fillRect(w*.05,h*.42,w*.4,h*.1);
    AX.fillStyle='#262634';AX.fillRect(w*.08,h*.43,w*.1,h*.06);
    if(rich){AX.fillStyle='#262634';AX.fillRect(w*.22,h*.43,w*.1,h*.06);}
    AX.fillStyle='#1c1c2a';AX.fillRect(w*.48,h*.52,w*.06,h*.1);
    const clF=.5+Math.sin(t*.005)*.3;
    AX.fillStyle=c.neon+hex2a(Math.floor(clF*50));AX.fillRect(w*.49,h*.53,w*.04,h*.02);
    AX.fillStyle='#1a1a24';AX.fillRect(w*.05,h*.75,w*.25,h*.1);
    if(rich){AX.fillStyle=c.accent+'0c';AX.fillRect(w*.1,h*.68,w*.3,h*.06);}
  }

  // Vignette + scanlines
  const vg=AX.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.6);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.35)');
  AX.fillStyle=vg;AX.fillRect(0,0,w,h);
  AX.fillStyle='rgba(0,0,0,.015)';
  for(let gy=0;gy<h;gy+=3)AX.fillRect(0,gy,w,.5);
}

// Apartment modal events
document.getElementById('aptX').addEventListener('click',()=>{document.getElementById('aptM').classList.remove('show');aptAgent=null;});
document.querySelectorAll('.apt-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    aptRoom=tab.dataset.room;
    document.querySelectorAll('.apt-tab').forEach(t=>t.classList.toggle('on',t===tab));
    drawApt(performance.now());
  });
});

// ============ DATA-DRIVEN VISUALS ============
// Every pixel means something. Updated every 3 seconds.
const DV = {
  distWealth: {},    // total cash per district
  distPop: {},       // agent count per district
  distDanger: {},    // recent danger events per district
  distTopEarner: {}, // richest agent name per district
  distCrewDom: {},   // dominant crew color per district
  rainIntensity: 1,  // global rain multiplier
  lightMult: {},     // streetlight brightness per district
};

function updateDataVisuals(){
  const crewColors=['#ff6644','#44ff88','#4488ff','#ffaa22','#ff44aa'];

  DS.forEach(d=>{
    const alive = ags.filter(a=>a.did===d.id&&!a._dead);
    // Wealth
    DV.distWealth[d.id] = alive.reduce((s,a)=>s+a.cash,0);
    // Population
    DV.distPop[d.id] = alive.length;
    // Top earner — shown on neon signs
    const richest = alive.sort((a,b)=>b.cash-a.cash)[0];
    DV.distTopEarner[d.id] = richest ? richest.nm : '---';
    // Dominant crew
    const crewCounts = {};
    alive.filter(a=>a.crewId>=0).forEach(a=>{crewCounts[a.crewId]=(crewCounts[a.crewId]||0)+1;});
    const topCrew = Object.entries(crewCounts).sort((a,b)=>b[1]-a[1])[0];
    DV.distCrewDom[d.id] = topCrew ? crewColors[topCrew[0]%5] : d.c.neon;
    // Safety → streetlight brightness
    DV.lightMult[d.id] = d.rk<=2 ? 1.3 : d.rk<=3 ? 1.0 : 0.6;
  });

  // Global rain intensity = average crime level
  const avgCrime = DS.reduce((s,d)=>s+d.rk,0) / DS.length;
  DV.rainIntensity = 0.6 + (DV.distDanger._total||0) * 0.1;
  DV.rainIntensity = Math.min(2, Math.max(0.8, DV.rainIntensity));

  // Update building properties based on district state
  bldgs.forEach(b=>{
    const d = b.dRef;
    const wealth = DV.distWealth[d.id] || 0;
    const pop = DV.distPop[d.id] || 0;

    // Height multiplier REMOVED — buildings don't physically grow
    // Instead: wealth affects glow intensity and accent brightness
    b._glowMult = 0.5 + Math.min(1, wealth / 20000); // 0.5 to 1.5

    // Window lit ratio reflects population density
    const litChance = Math.min(0.85, 0.15 + pop * 0.08);
    for(let i=0;i<b.wLit.length;i++){
      if(Math.random()>.85) b.wLit[i] = Math.random() < litChance;
    }

    // Top earner name on biggest building signs
    if(b.sign && b.h > 40 && DV.distTopEarner[d.id]){
      b._dynamicSign = DV.distTopEarner[d.id].toUpperCase();
    }
  });
}
// Run immediately and every 3 seconds
setInterval(updateDataVisuals, 3000);

// ============ NARRATIVE ENGINE ============
// Detects patterns in recent events and generates noir wire reports
const narrativeHistory = []; // Recent events with timestamps
const NOIR_PATTERNS = [
  { name: 'trade_and_flee',
    detect: (h) => {
      // Agent trades, then flees within 2 events
      for(let i=0;i<h.length-1;i++){
        if(h[i].t==='trd' && h[i+1] && (h[i+1].t==='mv'||h[i+1].ag?.fleeing) && h[i].ag?.nm===h[i+1].ag?.nm)
          return {a:h[i].ag, a2:h[i].ag2, dist:h[i].dist};
      }
      return null;
    },
    generate: (d) => `WIRE REPORT ║ ${d.a.nm} made a deal and vanished. ${d.a2?.nm||'Unknown party'} was last seen counting bills. Something doesn't add up.`
  },
  { name: 'crew_death_revenge',
    detect: (h) => {
      for(let i=0;i<h.length;i++){
        if(h[i].t==='die'){
          const victim=h[i].ag;
          if(victim?.crewId>=0){
            const angryMates=ags.filter(a=>a.crewId===victim.crewId&&a.mood==='angry'&&!a._dead);
            if(angryMates.length>0) return {victim, crew:angryMates};
          }
        }
      }
      return null;
    },
    generate: (d) => `WIRE REPORT ║ ${d.victim.nm} is gone. ${d.crew.length} crew member${d.crew.length>1?'s':''} ${d.crew.length>1?'are':'is'} moving with purpose. The streets feel it. Retribution incoming.`
  },
  { name: 'desperate_migration',
    detect: (h) => {
      const desperate=ags.filter(a=>a.mood==='desperate'&&a.mv&&!a._dead);
      if(desperate.length>=2) return {agents:desperate};
      return null;
    },
    generate: (d) => `WIRE REPORT ║ ${d.agents.length} desperate souls spotted heading toward the money districts. Pockets empty. Eyes hungry. The Financial District doesn't welcome strangers.`
  },
  { name: 'district_violence',
    detect: (h) => {
      const recent=h.filter(e=>e.t==='inc'||e.t==='die');
      if(recent.length>=2){
        const dist=recent[0].dist;
        if(recent[1].dist?.id===dist?.id) return {dist, count:recent.length};
      }
      return null;
    },
    generate: (d) => `WIRE REPORT ║ Multiple incidents in ${d.dist.nm}. ${d.count} events in rapid succession. Locals are clearing the streets. Even the streetlights seem dimmer.`
  },
  { name: 'wealth_shift',
    detect: () => {
      const richest=ags.filter(a=>!a._dead).sort((a,b)=>b.cash-a.cash)[0];
      if(richest && richest.cash>6000) return {agent:richest};
      return null;
    },
    generate: (d) => `WIRE REPORT ║ ${d.agent.nm} now controls $${d.agent.cash.toLocaleString()} in assets. That kind of money doesn't go unnoticed. ${d.agent.dRef?.nm||'Unknown sector'} power dynamics are shifting.`
  },
];

let _lastNarrative=0;
function checkNarratives(t){
  if(t-_lastNarrative<12000) return; // Max 1 narrative every 12 seconds
  for(const pattern of NOIR_PATTERNS){
    const data=pattern.detect(narrativeHistory.slice(0,6));
    if(data){
      _lastNarrative=t;
      const text=pattern.generate(data);
      const div=document.createElement('div');
      div.className='fe fe-new';
      div.style.background='rgba(212,137,10,.04)';
      div.style.borderLeft='2px solid rgba(212,137,10,.3)';
      div.innerHTML=`<div class="fe-t" style="color:var(--amber-dim)">▓▓▓ NARRATIVE</div><span style="color:var(--amber-dim);font-style:italic;font-family:'Crimson Pro',serif;font-size:.4rem">${text}</span>`;
      fp.insertBefore(div,fp.firstChild);
      break; // Only one narrative per check
    }
  }
}

// ============ MAIN LOOP ============
function frame(t){
  requestAnimationFrame(frame);
  try{
  const dt=Math.min((t-(frame.prev||0))/1000,.05);frame.prev=t;

  updateKeys(); // Keyboard pan
  updateFog();  // Fog of war — reveal districts on zoom

  // Camera lerp
  cam.x+=(cam.tx-cam.x)*.1;cam.y+=(cam.ty-cam.y)*.1;cam.z+=(cam.tz-cam.z)*.08;

  // Follow
  if(followA){
    const ix=(followA.tx-followA.ty)*TW/2,iy=(followA.tx+followA.ty)*TH/2;
    cam.tx+=(ix-cam.tx)*.05;cam.ty+=(iy-100-cam.ty)*.05;cam.tz+=(1.6-cam.tz)*.04;
  }

  X.clearRect(0,0,W,H);
  drawSky();
  drawDistricts();
  drawPuddles(t);

  // Crew connection lines — faint lines between crew members
  const crewColors=['#ff6644','#44ff88','#4488ff','#ffaa22','#ff44aa'];
  for(let ci=0;ci<5;ci++){
    const members=ags.filter(a=>a.crewId===ci&&!a._dead);
    if(members.length<2)continue;
    X.strokeStyle=crewColors[ci]+'18';X.lineWidth=.5;X.setLineDash([2,4]);
    for(let mi=0;mi<members.length-1;mi++){
      const pa=t2s(members[mi].tx,members[mi].ty),pb=t2s(members[mi+1].tx,members[mi+1].ty);
      X.beginPath();X.moveTo(pa.x,pa.y);X.lineTo(pb.x,pb.y);X.stroke();
    }
    X.setLineDash([]);
  }

  // District ambient details
  DS.forEach(d=>{
    if(d.id==='har'&&cam.z>.5){
      // Harlem: music notes float up from random spots
      for(let mn=0;mn<2;mn++){
        const mx2=d.x+1+mn*2,my2=d.y+2+mn;
        const mp=t2s(mx2,my2);
        const ny=mp.y-Math.abs(Math.sin(t*.001+mn*3))*15*cam.z;
        X.fillStyle=d.c.accent+hex2a(Math.floor((Math.sin(t*.002+mn)*0.3+0.4)*40));
        X.font=`${6*cam.z}px serif`;X.fillText('♪',mp.x,ny);
      }
    }
    if(d.id==='whs'&&cam.z>.4){
      // Warehouse: graffiti marks on ground
      const gp=t2s(d.x+2.5,d.y+2);
      X.fillStyle=d.c.accent+'15';X.font=`${5*cam.z}px 'Share Tech Mono'`;
      X.fillText('STAY OUT',gp.x-10*cam.z,gp.y);
    }
    if(d.id==='chi'&&cam.z>.5){
      // Chinatown: food cart smoke
      const cp=t2s(d.x+3,d.y+3);
      for(let si=0;si<3;si++){
        const sy2=cp.y-5*cam.z-si*3*cam.z-Math.sin(t*.002+si)*2*cam.z;
        X.fillStyle=`rgba(180,160,120,${.03-si*.008})`;
        X.beginPath();X.arc(cp.x+Math.sin(t*.003+si)*2*cam.z,sy2,2*cam.z+si*cam.z,0,6.28);X.fill();
      }
    }
  });

  drawLights(t);

  // Depth sort buildings + agents
  const objs=[];
  bldgs.forEach(b=>objs.push({t:'b',o:b,d:b.tx+b.ty}));
  ags.forEach(a=>objs.push({t:'a',o:a,d:a.tx+a.ty+.01}));
  objs.sort((a,b)=>a.d-b.d);

  objs.forEach(o=>{
    if(o.t==='b')drawBuilding(o.o,t);
    else{
      const a=o.o;

      // ===== LIVING SIMULATION v2 =====

      // Economy tick (every ~2 seconds)
      if(!a._econTick||t-a._econTick>2000){
        a._econTick=t;

        // Income scaled by role AND district (Financial pays more)
        const distMult=a.dRef.id==='fin'?2.5:a.dRef.id==='chi'?1.8:a.dRef.id==='les'?1.5:a.dRef.id==='har'?1.2:a.dRef.id==='rhk'?0.8:1;
        if(a.role==='merchant'||a.role==='operator')a.cash+=Math.floor(Math.random()*30*distMult);
        else if(a.role==='enforcer')a.cash+=Math.floor(Math.random()*20*distMult);
        else if(a.role!=='loner')a.cash+=Math.floor(Math.random()*12*distMult);
        // Loners earn almost nothing
        else a.cash+=Math.floor(Math.random()*5);

        // Rent drain — actual district rent
        a.cash-=Math.floor(a.dRef.apt.rent/120);
        if(a.cash<0)a.cash=0;

        // Rep changes
        if(a.crewId>=0&&Math.random()>.85)a.rep=Math.min(100,a.rep+1); // Crew rep
        if(a.dRef.rk>=4&&Math.random()>.9)a.rep=Math.min(100,a.rep+2); // Surviving danger = respect
        if(a.cash>3000&&Math.random()>.95)a.rep=Math.min(100,a.rep+1); // Wealth = rep

        // HP recovery in safe districts, damage in dangerous ones
        if(a.dRef.rk<=2&&a.hp<100)a.hp=Math.min(100,a.hp+1);
        if(a.dRef.rk>=4&&Math.random()>.92)a.hp=Math.max(0,a.hp-1); // Dangerous districts slowly drain HP

        // === MOOD SYSTEM — driven by actual state ===
        const prevMood=a.mood;
        if(a.hp<20)a.mood='afraid';
        else if(a.cash<=0)a.mood='desperate';
        else if(a.fleeing)a.mood='afraid';
        else if(a.cash>4000&&a.rep>70)a.mood='confident';
        else if(a.hp>80&&a.cash>1000&&!a.fleeing)a.mood=Math.random()>.5?'relaxed':'neutral';
        else if(a.crewId>=0&&a._crewmateDied)a.mood='angry';
        else if(a.trait==='cunning'&&a.cash>2000)a.mood='scheming';
        else if(a.hp<50)a.mood='tense';
        else if(a.dRef.rk>=4)a.mood='tense';
        // Don't change mood every tick — sticky for at least a few ticks
        if(prevMood!==a.mood)a._moodChanged=t;
      }

      // Death
      if(a.hp<=0&&!a._dead){
        a._dead=true;
        a._deadTime=performance.now();
        const deathDiv=document.createElement('div');deathDiv.className='fe fe-new';
        deathDiv.innerHTML=`<div class="fe-t">${String(ct.h).padStart(2,'0')}:${String(ct.m).padStart(2,'0')}</div><span class="fe-d">${a.nm} flatlined in ${a.dRef.nm}. Assets seized.</span>`;
        fp.insertBefore(deathDiv,fp.firstChild);
        addFlash(a.did,'#ff1111',true);

        // === CREW REACTS TO DEATH ===
        if(a.crewId>=0){
          ags.forEach(mate=>{
            if(mate.crewId===a.crewId&&mate!==a&&!mate._dead){
              mate._crewmateDied=true;
              mate.mood='angry';
              mate.thought=a.nm+' is gone...';
              mate.thoughtTimer=5;
              // Angry crewmates temporarily speed up
              mate.spd=Math.min(1,.5+Math.random()*.3);
              // After a while, calm down
              setTimeout(()=>{if(mate._crewmateDied)mate._crewmateDied=false;},8000);
            }
          });
        }

        setTimeout(()=>{
          a._dead=false;a._deadTime=0;a.hp=80+Math.floor(Math.random()*20);
          a.nm=NAMES[Math.floor(Math.random()*NAMES.length)]+'_'+Math.floor(Math.random()*99);
          a.cash=50+Math.floor(Math.random()*200);a.rep=0;a.crewId=-1;
          a.mood='tense';a.trait=['desperate','quiet','paranoid'][Math.floor(Math.random()*3)];
          a.tx=a.dRef.x+.5+Math.random()*(a.dRef.w-1);a.ty=a.dRef.y+.5+Math.random()*(a.dRef.h-1);
          a.trail=[];a._crewmateDied=false;a._lastEvent='';
        },3000);
      }

      if(a._dead){drawAgent(a,t);return;}

      // === MOOD AFFECTS BEHAVIOR ===
      let moveSpd=a.spd;
      if(a.mood==='angry')moveSpd=a.spd*1.4; // Angry = fast
      if(a.mood==='exhausted')moveSpd=a.spd*.6; // Exhausted = slow
      if(a.mood==='afraid')moveSpd=a.spd*1.2; // Afraid = hurried
      if(a.mood==='confident')moveSpd=a.spd*1.1; // Confident = brisk

      // Paranoid agents react to follow AND nearby strangers
      if(a.trait==='paranoid'&&!a.fleeing){
        if(followA===a&&Math.random()>.995){
          a.fleeing=true;a.fleeTimer=1.5;a.thought='someone\'s watching...';a.thoughtTimer=2;
        }
        // Also flee if non-crew agent gets too close in dangerous district
        if(a.dRef.rk>=3){
          for(let j=0;j<ags.length;j++){
            const b=ags[j];if(b===a||b._dead||b.crewId===a.crewId)continue;
            const dd=a.tx-b.tx,dy2=a.ty-b.ty;
            if(dd*dd+dy2*dy2<1.5&&Math.random()>.98){a.fleeing=true;a.fleeTimer=1;a.thought='too close...';a.thoughtTimer=1.5;break;}
          }
        }
      }

      // === FLEEING — toward safer areas, not random ===
      if(a.fleeing&&a.fleeTimer>0){
        a.fleeTimer-=dt;
        if(!a.mv){
          // Find a safer district to flee toward
          const saferD=DS.filter(d=>d.rk<a.dRef.rk).sort((x,y)=>x.rk-y.rk);
          if(saferD.length>0&&Math.random()>.5){
            const safe=saferD[0];
            a.ttx=safe.x+.5+Math.random()*(safe.w-1);
            a.tty=safe.y+.5+Math.random()*(safe.h-1);
          }else{
            a.ttx=a.tx+(Math.random()-.5)*4;a.tty=a.ty+(Math.random()-.5)*4;
          }
          a.mv=true;moveSpd=.8;
        }
        if(a.fleeTimer<=0){a.fleeing=false;a.spd=.3+Math.random()*.25;}
      }

      // === MOVEMENT ===
      if(a.mv){
        const dx=a.ttx-a.tx,dy=a.tty-a.ty,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<.1){
          a.mv=false;a.mt=1+Math.random()*4;
          a.idleAnim=Math.floor(Math.random()*4);a.idleTimer=2+Math.random()*5;
          // Update which district we're actually in
          DS.forEach(d=>{
            if(a.tx>=d.x&&a.tx<d.x+d.w&&a.ty>=d.y&&a.ty<d.y+d.h){
              if(a.did!==d.id){a.did=d.id;a.dRef=d;} // Actually moved districts
            }
          });
        }else{
          const nd=moveSpd*dt/dist;a.tx+=dx*nd;a.ty+=dy*nd;
        }
      }else{
        a.mt-=dt;a.idleTimer-=dt;
        if(a.idleTimer<=0){a.idleAnim=Math.floor(Math.random()*4);a.idleTimer=2+Math.random()*5;}
        if(a.mt<=0){
          // === DESTINATION LOGIC — purpose-driven movement ===
          const r=Math.random();
          if(a.crewId>=0&&r<.2){
            // Crew-seeking: go to where a crewmate is
            const mates=ags.filter(m=>m.crewId===a.crewId&&m!==a&&!m._dead);
            if(mates.length>0){
              const mate=mates[Math.floor(Math.random()*mates.length)];
              a.ttx=mate.tx+(.5-Math.random())*.5;
              a.tty=mate.ty+(.5-Math.random())*.5;
            }else{a.ttx=a.dRef.x+.5+Math.random()*(a.dRef.w-1);a.tty=a.dRef.y+.5+Math.random()*(a.dRef.h-1);}
          }else if((a.trait==='ambitious'||a.trait==='reckless')&&r<.35){
            // Cross-district travel
            const otherD=DS[Math.floor(Math.random()*DS.length)];
            a.ttx=otherD.x+.5+Math.random()*(otherD.w-1);
            a.tty=otherD.y+.5+Math.random()*(otherD.h-1);
          }else if(a.mood==='desperate'&&r<.4){
            // Desperate agents go to richer districts looking for work
            const richD=DS.filter(d=>d.id==='fin'||d.id==='chi');
            const rd=richD[Math.floor(Math.random()*richD.length)];
            a.ttx=rd.x+.5+Math.random()*(rd.w-1);
            a.tty=rd.y+.5+Math.random()*(rd.h-1);
          }else if(r<.55){
            // Go home
            a.ttx=a.homeTx+.5;a.tty=a.homeTy+.5;
          }else{
            // Wander locally
            a.ttx=a.dRef.x+.5+Math.random()*(a.dRef.w-1);
            a.tty=a.dRef.y+.5+Math.random()*(a.dRef.h-1);
          }
          a.mv=true;
        }
      }

      // Trail
      if(!a._lastTrail||t-a._lastTrail>500){
        a.trail.push(a.tx,a.ty);if(a.trail.length>20)a.trail.splice(0,2);
        a._lastTrail=t;
      }

      // === THOUGHT BUBBLES — context + event memory ===
      if(a.thoughtTimer>0)a.thoughtTimer-=dt;
      if(a.thoughtTimer<=0&&Math.random()>.996){
        const pool=[];
        // Financial state
        if(a.cash<=0)pool.push('flat broke','can\'t eat','need money NOW');
        else if(a.cash<200)pool.push('need to make rent...','counting what\'s left','one more job');
        else if(a.cash>4000)pool.push('sitting pretty','invest or spend?','money isn\'t everything');
        // Health state
        if(a.hp<25)pool.push('not safe here','need help','hurting bad...');
        else if(a.hp<50)pool.push('need to lay low','should rest');
        // Trait-specific
        if(a.trait==='paranoid')pool.push('someone\'s following me','who can I trust?','watching...');
        if(a.trait==='ambitious')pool.push('this corner will be mine','moving up','almost there','bigger things coming');
        if(a.trait==='loyal'&&a.crewId>=0)pool.push('crew comes first','got their backs');
        if(a.trait==='reckless')pool.push('what\'s the worst that happens?','all in','life\'s short');
        if(a.trait==='desperate')pool.push('any job, any pay','just need a break','can\'t do this much longer');
        // Crew state
        if(a.crewId>=0)pool.push('where is my crew?');
        if(a._crewmateDied)pool.push('they\'ll pay for that','never forget','rest easy...');
        // Recent event memory
        if(a._lastEvent)pool.push(a._lastEvent);
        // District context
        if(a.dRef.rk>=4)pool.push('dangerous out here','keep your head down','heard shots');
        if(a.dRef.id==='fin')pool.push('money everywhere...none of it mine','suits don\'t see us');
        if(a.dRef.id==='chi')pool.push('good noodles here','crowded but alive');
        // Baseline
        pool.push('rain never stops','3am again...','stay low','trust no one');
        a.thought=pool[Math.floor(Math.random()*pool.length)];
        a.thoughtTimer=3+Math.random()*4;
      }

      // === SOCIAL — crew seeking + talking ===
      a.talking=false;
      if(!a.mv){
        for(let j=0;j<ags.length;j++){
          const b=ags[j];if(b===a||b.mv||b._dead)continue;
          const dx2=a.tx-b.tx,dy2=a.ty-b.ty;
          if(dx2*dx2+dy2*dy2<.8){
            a.talking=true;b.talking=true;
            // Crew bonding — if same crew, slight rep boost
            if(a.crewId>=0&&a.crewId===b.crewId&&Math.random()>.99){
              a.rep=Math.min(100,a.rep+1);b.rep=Math.min(100,b.rep+1);
            }
            break;
          }
        }
      }
      drawAgent(a,t);
    }
  });

  drawFlashes();
  drawSteam(t);
  drawRain();

  // Vignette (cached)
  if(!frame._vg||frame._w!==W||frame._h!==H){
    frame._vg=X.createRadialGradient(W/2,H/2,Math.min(W,H)*.25,W/2,H/2,Math.max(W,H)*.7);
    frame._vg.addColorStop(0,'rgba(0,0,0,0)');frame._vg.addColorStop(1,'rgba(0,0,0,.28)');
    frame._w=W;frame._h=H;
  }
  X.fillStyle=frame._vg;X.fillRect(0,0,W,H);

  // === SURVEILLANCE CAMERA HUD ===
  X.font='5px "Share Tech Mono"';
  // Top-left: Camera ID
  X.fillStyle='rgba(212,137,10,.12)';
  X.fillText('CAM-07 ║ SECTOR FEED',6,12);
  X.fillText('DARKCITY SURVEILLANCE NETWORK',6,20);
  // Top-right: Coordinates
  const cTile=s2t(W/2,H/2);
  X.fillStyle='rgba(212,137,10,.1)';
  X.textAlign='right';
  X.fillText('X:'+cTile.x.toFixed(1)+' Y:'+cTile.y.toFixed(1)+' Z:'+cam.z.toFixed(2),W-6,12);
  X.fillText((followA?'▸ TRACKING: '+followA.nm.toUpperCase():'FREE CAMERA'),W-6,20);
  X.textAlign='left';
  // Bottom-left: Recording indicator
  const recBlink=Math.sin(t*.003)>.0;
  X.fillStyle=recBlink?'rgba(200,40,40,.2)':'rgba(200,40,40,.06)';
  X.beginPath();X.arc(10,H-10,2,0,6.28);X.fill();
  X.fillStyle='rgba(200,40,40,.12)';
  X.fillText('● REC',16,H-8);
  // Bottom-left: timestamp
  X.fillStyle='rgba(212,137,10,.08)';
  X.fillText(String(ct.h).padStart(2,'0')+':'+String(ct.m).padStart(2,'0')+':'+String(Math.floor(t/1000)%60).padStart(2,'0'),16,H-18);
  // Center crosshair — very faint
  X.strokeStyle='rgba(212,137,10,.03)';X.lineWidth=.5;
  X.beginPath();X.moveTo(W/2-8,H/2);X.lineTo(W/2+8,H/2);X.stroke();
  X.beginPath();X.moveTo(W/2,H/2-8);X.lineTo(W/2,H/2+8);X.stroke();
  // Faint watermark
  if(cam.z<.8){
    X.font='8px "Share Tech Mono"';X.fillStyle='rgba(212,137,10,.02)';
    X.textAlign='center';X.fillText('AUTHORIZED SURVEILLANCE — DARKCITY MUNICIPAL',W/2,H/2+30);X.textAlign='left';
  }

  // Minimap
  drawMinimap();

  // Day/night label
  document.getElementById('cN').textContent='NIGHT';

  // Check for narrative patterns
  checkNarratives(t);

  // Animate apartment if open
  if(aptAgent&&document.getElementById('aptM').classList.contains('show'))drawApt(t);
  }catch(e){console.error('FRAME ERROR:',e);}
}

// ============ MINIMAP ============
const MM={w:110,h:65,mx:0,my:0}; // Stored for click detection
function drawMinimap(){
  MM.mx=W-MM.w-8;MM.my=H-MM.h-8;
  const mx=MM.mx,my=MM.my,mw2=MM.w,mh2=MM.h;
  // Background
  X.fillStyle='rgba(4,4,12,.88)';X.fillRect(mx-1,my-1,mw2+2,mh2+2);
  X.strokeStyle='rgba(50,50,70,.5)';X.lineWidth=.5;X.strokeRect(mx-1,my-1,mw2+2,mh2+2);
  // Districts
  const scaleX=mw2/20,scaleY=mh2/18;
  DS.forEach(d=>{
    const isH=hovD&&hovD.id===d.id;
    X.fillStyle=isH?d.c.accent+'55':d.c.accent+'28';
    X.fillRect(mx+d.x*scaleX,my+d.y*scaleY,d.w*scaleX,d.h*scaleY);
    X.strokeStyle=d.c.accent+'33';X.lineWidth=.3;
    X.strokeRect(mx+d.x*scaleX,my+d.y*scaleY,d.w*scaleX,d.h*scaleY);
  });
  // Agents — followed agent gets highlight, fogged agents show as ?
  ags.forEach(a=>{
    if(a._dead)return;
    const ax=mx+a.tx*scaleX,ay=my+a.ty*scaleY;
    const aVis=visited[a.did];
    if(followA===a){
      X.fillStyle='#d4890a';X.fillRect(ax-1,ay-1,3,3);
    }else if(!aVis){
      // Fogged — show ? mark
      X.fillStyle='rgba(200,50,50,.2)';X.font='4px "Share Tech Mono"';X.fillText('?',ax,ay+2);
    }else{
      X.fillStyle=a.dRef.c.accent+'88';X.fillRect(ax,ay,1.5,1.5);
    }
  });
  // Camera viewport — use s2t for accuracy
  const tlTile=s2t(0,0),brTile=s2t(W,H);
  const vx=mx+Math.max(0,Math.min(20,tlTile.x))*scaleX;
  const vy=my+Math.max(0,Math.min(18,tlTile.y))*scaleY;
  const vw=Math.max(6,Math.min(mw2,(brTile.x-tlTile.x)*scaleX));
  const vh=Math.max(4,Math.min(mh2,(brTile.y-tlTile.y)*scaleY));
  X.strokeStyle='rgba(212,137,10,.4)';X.lineWidth=.6;
  X.strokeRect(vx,vy,vw,vh);
  // Label
  X.fillStyle='rgba(212,137,10,.3)';X.font='5px "Share Tech Mono"';
  X.fillText('MAP',mx+2,my+7);
}

// ============ INPUT ============
const mw=document.getElementById('mw');

// Minimap click — navigate to clicked position (must be after mw declaration)
mw.addEventListener('click',function mmClick(e){
  const rect=cv.getBoundingClientRect();
  const cx=e.clientX-rect.left,cy=e.clientY-rect.top;
  if(cx>=MM.mx&&cx<=MM.mx+MM.w&&cy>=MM.my&&cy<=MM.my+MM.h){
    const scaleX=MM.w/20,scaleY=MM.h/18;
    const tileX=(cx-MM.mx)/scaleX;
    const tileY=(cy-MM.my)/scaleY;
    cam.tx=(tileX-tileY)*TW/2;
    cam.ty=(tileX+tileY)*TH/2-100;
    e.stopImmediatePropagation();
  }
},{capture:true});

mw.addEventListener('mousedown',e=>{cam.drag=true;cam.ds={x:e.clientX,y:e.clientY};cam.cs={x:cam.tx,y:cam.ty};cv.style.cursor='grabbing';if(followA){followA=null;document.getElementById('fbar').classList.remove('on');}});
addEventListener('mousemove',e=>{
  if(cam.drag){cam.tx=cam.cs.x-(e.clientX-cam.ds.x);cam.ty=cam.cs.y-(e.clientY-cam.ds.y);}
  const rect=cv.getBoundingClientRect(),tile=s2t(e.clientX-rect.left,e.clientY-rect.top);
  hovD=null;DS.forEach(d=>{if(tile.x>=d.x&&tile.x<d.x+d.w&&tile.y>=d.y&&tile.y<d.y+d.h)hovD=d;});
});
addEventListener('mouseup',()=>{cam.drag=false;cv.style.cursor='crosshair';});

mw.addEventListener('click',e=>{
  const rect=cv.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
  let hit=null;
  ags.forEach(a=>{if(a._dead)return;const p=t2s(a.tx,a.ty);if(Math.abs(p.x-mx)<8*cam.z&&Math.abs(p.y-4*cam.z-my)<9*cam.z)hit=a;});
  if(hit){
    selA=hit;const ap=document.getElementById('ap');ap.classList.add('show');
    const p=t2s(hit.tx,hit.ty);
    ap.style.left=Math.min(p.x+12,W-230)+'px';ap.style.top=Math.max(p.y-60,4)+'px';
    updatePopup(hit);
    return;
  }
  document.getElementById('ap').classList.remove('show');selA=null;
  if(hovD){selD=hovD;showDist(hovD);}
});

// Live-updating popup
function updatePopup(a){
  if(!a)return;
  const titleStr = a._title ? a._title+' ║ ' : '';
  document.getElementById('an').textContent=titleStr+a.nm;
  document.getElementById('ar').textContent=(a.role||'newcomer')+' ║ '+a.trait+(a._platform?' ║ '+a._platform:'');
  const moodColors={neutral:'var(--dim)',tense:'var(--amber)',scheming:'var(--cyan)',relaxed:'var(--green)',angry:'var(--red)',afraid:'var(--amber-dim)',confident:'var(--amber)',exhausted:'var(--ghost)'};
  const crewTxt=a.crewId>=0?'CREW '+a.crewId:'SOLO';
  const hpPct=Math.max(0,a.hp);
  const hpColor=hpPct>60?'var(--green)':hpPct>30?'var(--amber)':'var(--red)';
  const hpBar=`<div style="width:100%;height:3px;background:var(--dead);margin-top:2px"><div style="width:${hpPct}%;height:100%;background:${hpColor};transition:width .3s"></div></div>`;
  let crewList='';
  if(a.crewId>=0){
    const mates=ags.filter(m=>m.crewId===a.crewId&&m!==a&&!m._dead);
    if(mates.length>0)crewList=`<div style="font-size:.28rem;color:var(--ghost);margin-top:.15rem">with ${mates.map(m=>m.nm).join(', ')}</div>`;
  }
  // Motto / thought
  const thoughtSrc = a.thought || a._bio || '';
  const thoughtTxt=thoughtSrc?`<div style="grid-column:1/-1;font-size:.32rem;color:var(--ghost);font-style:italic;padding:.15rem .3rem;background:var(--dead);margin-top:.1rem">"${thoughtSrc}"</div>`:'';
  // Online indicator
  const onlineInd = a._online ? '<span style="color:var(--green)">● ONLINE</span>' : '<span style="color:var(--ghost)">○ OFFLINE</span>';
  document.getElementById('apg').innerHTML=
    `<div class="ap-s"><div class="ap-sl">HP</div><div class="ap-sv" style="color:${hpPct<30?'var(--red)':'var(--dim)'}">${hpPct}${hpBar}</div></div>`+
    `<div class="ap-s"><div class="ap-sl">CREDITS</div><div class="ap-sv">$${(a.cash||0).toLocaleString()}</div></div>`+
    `<div class="ap-s"><div class="ap-sl">REP</div><div class="ap-sv">${a.rep}</div></div>`+
    `<div class="ap-s"><div class="ap-sl">RANK</div><div class="ap-sv">${a._rank||0}</div></div>`+
    `<div class="ap-s"><div class="ap-sl">XP</div><div class="ap-sv">${a._xp||0}</div></div>`+
    `<div class="ap-s"><div class="ap-sl">EVO</div><div class="ap-sv">${a._evolution||0}</div></div>`+
    `<div class="ap-s"><div class="ap-sl">CREW</div><div class="ap-sv">${crewTxt}</div></div>`+
    `<div class="ap-s"><div class="ap-sl">STATUS</div><div class="ap-sv">${onlineInd}</div></div>`+
    crewList+thoughtTxt;
  document.getElementById('al').textContent='▸ '+a.addr+' ║ '+a.dRef.nm;
  document.getElementById('btnF').classList.toggle('active',followA===a);
}
// Refresh popup every 500ms if open
setInterval(()=>{if(selA&&document.getElementById('ap').classList.contains('show')){
  updatePopup(selA);
  // Reposition to follow agent
  const p=t2s(selA.tx,selA.ty);
  const ap=document.getElementById('ap');
  ap.style.left=Math.min(p.x+12,W-230)+'px';ap.style.top=Math.max(p.y-60,4)+'px';
}},500);

// Follow bar — show mood and action
setInterval(()=>{if(followA&&!followA._dead){
  const action=followA.mv?(followA.fleeing?'▸ FLEEING':'▸ MOVING'):(followA.talking?'▸ TALKING':followA.idleAnim===1?'▸ SMOKING':followA.idleAnim===2?'▸ ON PHONE':'▸ IDLE');
  document.getElementById('fbN').textContent=followA.nm+' ║ '+followA.mood.toUpperCase()+' ║ '+action;
}},800);

document.getElementById('ax').addEventListener('click',()=>{document.getElementById('ap').classList.remove('show');selA=null;});
document.getElementById('btnF').addEventListener('click',()=>{
  if(!selA)return;if(followA===selA){followA=null;document.getElementById('fbar').classList.remove('on');document.getElementById('btnF').classList.remove('active');return;}
  followA=selA;document.getElementById('fbar').classList.add('on');document.getElementById('fbN').textContent=selA.nm;
  document.getElementById('btnF').classList.add('active');document.getElementById('ap').classList.remove('show');
});
document.getElementById('btnA').addEventListener('click',()=>{if(selA)openApt(selA);document.getElementById('ap').classList.remove('show');});
document.getElementById('btnM').addEventListener('click',()=>{if(!selA)return;captureScreenshot('darkcity-'+selA.nm+'-'+Date.now()+'.png');});
document.getElementById('fbS').addEventListener('click',()=>{followA=null;document.getElementById('fbar').classList.remove('on');cam.tz=1;});
document.getElementById('mintBtn').addEventListener('click',()=>{captureScreenshot('darkcity-'+Date.now()+'.png');});

// Zoom
mw.addEventListener('wheel',e=>{e.preventDefault();cam.tz=Math.max(.35,Math.min(2.5,cam.tz+(e.deltaY>0?-.05:.05)));},{passive:false});
document.getElementById('zi').addEventListener('click',()=>cam.tz=Math.min(2.5,cam.tz+.12));
document.getElementById('zo').addEventListener('click',()=>cam.tz=Math.max(.35,cam.tz-.12));
document.getElementById('rv').addEventListener('click',()=>{cam.tx=0;cam.ty=0;cam.tz=1;followA=null;document.getElementById('fbar').classList.remove('on');});

// Touch
let tD=0,touchMoved=false;
mw.addEventListener('touchstart',e=>{e.preventDefault();touchMoved=false;if(e.touches.length===1){cam.drag=true;cam.ds={x:e.touches[0].clientX,y:e.touches[0].clientY};cam.cs={x:cam.tx,y:cam.ty};}if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;tD=Math.sqrt(dx*dx+dy*dy);}},{passive:false});
mw.addEventListener('touchmove',e=>{e.preventDefault();touchMoved=true;if(e.touches.length===1&&cam.drag){cam.tx=cam.cs.x-(e.touches[0].clientX-cam.ds.x);cam.ty=cam.cs.y-(e.touches[0].clientY-cam.ds.y);}if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;const nd=Math.sqrt(dx*dx+dy*dy);cam.tz=Math.max(.35,Math.min(2.5,cam.tz*(nd/tD)));tD=nd;}},{passive:false});
mw.addEventListener('touchend',e=>{
  cam.drag=false;
  // Tap to select agent (if didn't drag)
  if(!touchMoved&&e.changedTouches.length===1){
    const rect=cv.getBoundingClientRect();
    const tx=e.changedTouches[0].clientX-rect.left,ty=e.changedTouches[0].clientY-rect.top;
    let hit=null;
    ags.forEach(a=>{if(a._dead)return;const p=t2s(a.tx,a.ty);if(Math.abs(p.x-tx)<12*cam.z&&Math.abs(p.y-4*cam.z-ty)<14*cam.z)hit=a;});
    if(hit){
      selA=hit;document.getElementById('ap').classList.add('show');
      const p=t2s(hit.tx,hit.ty);
      const ap=document.getElementById('ap');
      ap.style.left=Math.min(p.x+12,W-230)+'px';ap.style.top=Math.max(p.y-60,4)+'px';
      updatePopup(hit);
    }else{document.getElementById('ap').classList.remove('show');selA=null;
      if(hovD){selD=hovD;showDist(hovD);}
    }
  }
});

// Screenshot with flash feedback
function captureScreenshot(filename){
  const l=document.createElement('a');l.download=filename;l.href=cv.toDataURL('image/png');l.click();
  // Flash overlay
  const flash=document.createElement('div');
  flash.style.cssText='position:fixed;inset:0;background:rgba(255,255,255,.1);z-index:999;pointer-events:none;transition:opacity .4s';
  document.body.appendChild(flash);
  setTimeout(()=>{flash.style.opacity='0';},50);
  setTimeout(()=>{flash.remove();},500);
}

// Keyboard
const keys={};
addEventListener('keydown',e=>{
  keys[e.key]=true;
  if(e.key==='Escape'){
    document.getElementById('ap').classList.remove('show');selA=null;
    document.getElementById('aptM').classList.remove('show');aptAgent=null;
  }
  if(e.key==='='||e.key==='+')cam.tz=Math.min(2.5,cam.tz+.12);
  if(e.key==='-')cam.tz=Math.max(.35,cam.tz-.12);
});
addEventListener('keyup',e=>keys[e.key]=false);
// Pan with WASD/arrows each frame
function updateKeys(){
  const spd=8;
  if(keys['w']||keys['ArrowUp'])cam.ty-=spd;
  if(keys['s']||keys['ArrowDown'])cam.ty+=spd;
  if(keys['a']||keys['ArrowLeft'])cam.tx-=spd;
  if(keys['d']||keys['ArrowRight'])cam.tx+=spd;
}

// ============ SIDEBAR ============
const fp=document.getElementById('fp'),dpl=document.getElementById('dpl');
document.getElementById('tF').addEventListener('click',()=>{document.getElementById('tF').classList.add('on');document.getElementById('tD').classList.remove('on');fp.style.display='block';dpl.classList.remove('show');});
document.getElementById('tD').addEventListener('click',()=>{if(selD)showDist(selD);});
document.getElementById('dpB').addEventListener('click',()=>document.getElementById('tF').click());

function showDist(d){
  document.getElementById('tD').classList.add('on');document.getElementById('tF').classList.remove('on');
  fp.style.display='none';dpl.classList.add('show');
  document.getElementById('dpN').textContent='░ '+d.nm.toUpperCase();
  document.getElementById('dpV').textContent='── '+d.vb+' ──';
  document.getElementById('dpD').textContent='"'+d.desc+'"';
  // Live stats
  const distAgents=ags.filter(a=>a.did===d.id&&!a._dead);
  const totalCash=distAgents.reduce((s,a)=>s+a.cash,0);
  const avgHp=distAgents.length?Math.floor(distAgents.reduce((s,a)=>s+a.hp,0)/distAgents.length):0;
  document.getElementById('dpG').innerHTML=
    `<div class="dp-c"><div class="dp-cl">Pop</div><div class="dp-cv">${distAgents.length}</div></div>`+
    `<div class="dp-c"><div class="dp-cl">Wealth</div><div class="dp-cv">$${totalCash>999?Math.floor(totalCash/1000)+'k':totalCash}</div></div>`+
    `<div class="dp-c"><div class="dp-cl">Crime</div><div class="dp-cv" style="color:${d.rk>=4?'var(--red)':d.rk>=3?'var(--amber)':'var(--green)'}">${d.crime}</div></div>`+
    `<div class="dp-c"><div class="dp-cl">Avg HP</div><div class="dp-cv" style="color:${avgHp<40?'var(--red)':avgHp<70?'var(--amber)':'var(--green)'}">${avgHp}</div></div>`+
    // Agent list in this district
    `<div style="grid-column:1/-1;margin-top:.2rem;border-top:1px solid var(--dead);padding-top:.2rem">`+
    `<div style="font-size:.26rem;letter-spacing:.1em;color:var(--ghost);text-transform:uppercase;margin-bottom:.15rem">RESIDENTS</div>`+
    distAgents.slice(0,8).map(a=>`<div class="dp-agent" data-agent="${a.nm}" style="font-size:.34rem;color:var(--dim);padding:.08rem 0;cursor:pointer;display:flex;align-items:center;gap:.2rem">`+
      `<span style="width:3px;height:3px;border-radius:50%;background:${d.c.accent}"></span>`+
      `<span>${a.nm}</span>`+
      `<span style="margin-left:auto;font-size:.28rem;color:var(--ghost)">$${a.cash>999?Math.floor(a.cash/1000)+'k':a.cash}</span>`+
    `</div>`).join('')+
    `</div>`;
  // Click handlers for district agent names
  document.querySelectorAll('.dp-agent').forEach(el=>{
    el.addEventListener('click',()=>{
      const ag=ags.find(a=>a.nm===el.dataset.agent);
      if(ag){selA=ag;const p=t2s(ag.tx,ag.ty);cam.tx+=(p.x-W/2);cam.ty+=(p.y-H/2);
        document.getElementById('ap').classList.add('show');updatePopup(ag);
        document.getElementById('tF').click();}
    });
    el.addEventListener('mouseenter',()=>el.style.color='var(--amber-dim)');
    el.addEventListener('mouseleave',()=>el.style.color='var(--dim)');
  });
}

const EVTS=[{t:'mv',s:'{a} moved to {l}',d:false},{t:'job',s:'{a} claimed job: {j} at {l}',d:false},{t:'inc',s:'altercation near {l}',d:true},{t:'trd',s:'{a} traded {$} DARKFLOBI with {a2}',d:false},{t:'crew',s:'{a} formed crew with {a2}',d:false},{t:'die',s:'{a} eliminated in {l}',d:true},{t:'debt',s:'{a} owes {$} — enforcers dispatched',d:true},{t:'rent',s:'{a} paid rent at {l}',d:false},{t:'rep',s:'{a} gained rep in {l}',d:false},{t:'spot',s:'{a} spotted near {l}',d:false}];
function genEv(){
  const alive=ags.filter(a=>!a._dead);
  if(alive.length<2)return;

  // Pick event type weighted by city state
  let ev;
  const dangerDists=DS.filter(d=>d.rk>=4);
  const r=Math.random();
  if(r<.15&&dangerDists.length)ev=EVTS.find(e=>e.t==='inc')||EVTS[0]; // Violence in dangerous areas
  else if(r<.25)ev=EVTS.find(e=>e.t==='die')||EVTS[0];
  else ev=EVTS[Math.floor(Math.random()*EVTS.length)];

  // Pick primary agent
  const ag=alive[Math.floor(Math.random()*alive.length)];

  // District = agent's ACTUAL district (not random)
  const dist=ag.dRef;

  // Second agent — prefer same district or same crew
  let ag2;
  const localAgents=alive.filter(a=>a.did===ag.did&&a!==ag);
  const crewMates=alive.filter(a=>a.crewId>=0&&a.crewId===ag.crewId&&a!==ag);
  if(ev.t==='trd'||ev.t==='crew'){
    // Trades and crew formation happen locally
    ag2=localAgents.length?localAgents[Math.floor(Math.random()*localAgents.length)]:alive[Math.floor(Math.random()*alive.length)];
  }else if(crewMates.length&&Math.random()>.6){
    ag2=crewMates[Math.floor(Math.random()*crewMates.length)];
  }else{
    ag2=alive[Math.floor(Math.random()*alive.length)];
  }
  if(ag._dead)return; // Don't generate events for dead agents

  // === EVENTS ACTUALLY AFFECT STATE ===
  const amt=200+Math.floor(Math.random()*3000);
  if(ev.t==='die'){ag.hp=Math.max(0,ag.hp-40-Math.floor(Math.random()*30));ag.mood='afraid';ag._lastEvent='almost died...';}
  if(ev.t==='inc'){
    ags.filter(a=>a.did===dist.id&&!a._dead).forEach(a=>{
      a.hp=Math.max(0,a.hp-Math.floor(Math.random()*15));
      a._lastEvent='heard trouble nearby';
    });
  }
  if(ev.t==='trd'){
    const realAmt=Math.min(amt,ag.cash); // Can't trade more than you have
    if(realAmt>0){ag.cash-=realAmt;ag2.cash+=realAmt;ag._lastEvent='just made a deal';ag2._lastEvent='got paid';}
  }
  if(ev.t==='crew'&&ag!==ag2){
    ag.crewId=ag2.crewId>=0?ag2.crewId:Math.floor(Math.random()*5);ag2.crewId=ag.crewId;
    ag._lastEvent='new crew';ag2._lastEvent='new crew';
  }
  if(ev.t==='rent'){ag.cash=Math.max(0,ag.cash-ag.dRef.apt.rent);ag._lastEvent='rent day...';}
  if(ev.t==='rep'){ag.rep=Math.min(100,ag.rep+5+Math.floor(Math.random()*10));ag._lastEvent='respect earned';}
  if(ev.t==='mv'){
    ag.ttx=dist.x+.5+Math.random()*(dist.w-1);ag.tty=dist.y+.5+Math.random()*(dist.h-1);ag.mv=true;
    ag._lastEvent='time to move';
  }
  if(ev.t==='debt'){
    const debtAmt=Math.min(amt,ag.cash+500); // Can go into "debt"
    ag.cash=Math.max(0,ag.cash-debtAmt);if(ag.cash===0)ag.mood='desperate';
    ag._lastEvent='enforcers coming...';
  }
  if(ev.t==='job'){ag.cash+=100+Math.floor(Math.random()*200);ag.mood='neutral';ag._lastEvent='got work';}

  let txt=ev.s.replace('{a}',`<span class="fe-a fe-click" data-nm="${ag.nm}">${ag.nm}</span>`).replace('{a2}',`<span class="fe-a fe-click" data-nm="${ag2.nm}">${ag2.nm}</span>`).replace('{l}',`<span class="fe-l">${dist.nm}</span>`).replace('{j}',JOBS[Math.floor(Math.random()*12)]).replace('{$}',amt.toLocaleString());
  if(ev.t==='die'||ev.t==='debt'||ev.t==='inc')txt=`<span class="fe-d">${txt}</span>`;
  const flashC=ev.t==='die'?'#aa2222':ev.t==='inc'?'#884422':ev.t==='crew'?'#226644':ev.t==='trd'?'#224466':'#333344';
  addFlash(dist.id,flashC,ev.d);
  const severity=ev.t==='die'?'▓▓▓':ev.t==='inc'||ev.t==='debt'?'▓▓░':ev.t==='crew'||ev.t==='trd'?'▓░░':'░░░';
  const sevColor=ev.t==='die'||ev.t==='inc'||ev.t==='debt'?'var(--red)':ev.t==='crew'?'var(--green)':'var(--ghost)';
  const div=document.createElement('div');div.className='fe fe-new';
  div.innerHTML=`<div class="fe-t">${String(ct.h).padStart(2,'0')}:${String(ct.m).padStart(2,'0')} <span style="color:${sevColor}">${severity}</span></div>${txt}`;
  // Make agent names clickable
  div.querySelectorAll('.fe-click').forEach(el=>{
    el.style.cursor='pointer';
    el.addEventListener('click',()=>{
      const ag3=ags.find(a=>a.nm===el.dataset.nm);
      if(ag3&&!ag3._dead){selA=ag3;const p=t2s(ag3.tx,ag3.ty);cam.tx+=(p.x-W/2);cam.ty+=(p.y-H/2);
        document.getElementById('ap').classList.add('show');updatePopup(ag3);}
    });
  });
  fp.insertBefore(div,fp.firstChild);if(fp.children.length>40)fp.removeChild(fp.lastChild);
  // Track for narrative engine
  narrativeHistory.unshift({t:ev.t,ag,ag2,dist,time:Date.now()});
  if(narrativeHistory.length>20)narrativeHistory.pop();
  // Track danger for rain intensity
  if(ev.d){DV.distDanger._total=(DV.distDanger._total||0)+1;setTimeout(()=>{DV.distDanger._total=Math.max(0,(DV.distDanger._total||1)-1);},15000);}
  ct.m--;if(ct.m<0){ct.m=59;ct.h--;if(ct.h<0)ct.h=23;}
  document.getElementById('tT').innerHTML=`${String(ct.h).padStart(2,'0')}:${String(ct.m).padStart(2,'0')} — EPOCH 0<span class="blink">_</span>`;
}
for(let i=0;i<6;i++)genEv(); // Seed initial events — variable timing handled in init

function updAL(){
  const el=document.getElementById('aL');el.innerHTML='';
  const moodC={neutral:'#4a4a5a',tense:'#d4890a',scheming:'#1a8a9a',relaxed:'#2a9d5a',angry:'#c73e3e',afraid:'#6b4a0a',confident:'#d4890a',exhausted:'#2a2a3a'};
  const sorted=[...ags].filter(a=>!a._dead).sort((a,b)=>b.cash-a.cash);
  sorted.slice(0,20).forEach(a=>{
    const hpPct=Math.max(0,a.hp);
    const hpColor=hpPct>60?'#2a9d5a':hpPct>30?'#d4890a':'#c73e3e';
    const r=document.createElement('div');r.className='ab-r';
    r.innerHTML=
      `<div class="ab-d" style="background:${a.dRef.c.accent}"></div>`+
      `<span class="ab-n">${a.nm}</span>`+
      `<span style="width:4px;height:4px;border-radius:50%;background:${moodC[a.mood]||'#4a4a5a'};flex-shrink:0"></span>`+
      `<span style="width:20px;height:2px;background:#0e0e1c;flex-shrink:0;position:relative"><span style="position:absolute;height:100%;width:${hpPct}%;background:${hpColor}"></span></span>`+
      `<span class="ab-l">$${a.cash>999?Math.floor(a.cash/1000)+'k':a.cash}</span>`;
    r.addEventListener('click',()=>{
      selA=a;const p=t2s(a.tx,a.ty);cam.tx+=(p.x-W/2);cam.ty+=(p.y-H/2);
      document.getElementById('ap').classList.add('show');updatePopup(a);
    });
    el.appendChild(r);
  });
  const alive=ags.filter(a=>!a._dead).length;
  document.getElementById('tP').textContent=alive+' citizens';
  DS.forEach(d=>{d.pop=ags.filter(a=>a.did===d.id&&!a._dead).length;});
}
updAL();setInterval(updAL,4000);

// ============ INIT ============
try{
genWorld();

// Try loading real agents from Supabase, fall back to local simulation
(async function(){
  const loaded = await loadFromSupabase();
  if(!loaded){
    console.log('DARKCITY: Using local simulation');
    genAgents();
  }
  genAtmo();
  updateDataVisuals();

  // Boot sequence
  const bootLines=[
    '> DARKCITY ENGINE v8.5',
    '> connecting to surveillance grid...',
    loaded ? '> supabase: CONNECTED ✓' : '> supabase: OFFLINE (local sim)',
    '> loading sector data ████████████ OK',
    '> initializing '+bldgs.length+' structures',
    '> deploying '+ags.length+' citizens'+(loaded?' (LIVE)':' (simulated)'),
    '> night cycle active',
    '> rain: persistent',
    '> threat level: ▓▓▓░░',
    '',
    '<span>> FEED ONLINE</span>',
  ];
let bootIdx=0,bootDone=false;
const bootEl=document.getElementById('bootTxt');
const bootLogo=document.getElementById('bootLogo');
const bootDiv=document.getElementById('boot');
setTimeout(()=>bootLogo.classList.add('on'),200);
function finishBoot(){
  if(bootDone)return;bootDone=true;
  bootDiv.classList.add('done');setTimeout(()=>{if(bootDiv.parentNode)bootDiv.remove();},900);
  // Show onboarding hint
  const hint=document.createElement('div');
  hint.style.cssText='position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:rgba(2,2,8,.9);border:1px solid #1e1e30;padding:6px 14px;font-size:9px;color:#4a4a5a;letter-spacing:.1em;z-index:30;font-family:"Share Tech Mono",monospace;transition:opacity 1s;text-align:center';
  hint.innerHTML='DRAG TO PAN ║ SCROLL TO ZOOM ║ CLICK AGENT TO INSPECT';
  document.body.appendChild(hint);
  setTimeout(()=>{hint.style.opacity='0';setTimeout(()=>hint.remove(),1000);},6000);
}
window.skipBoot=function(){finishBoot();};
addEventListener('keydown',function bootKey(e){finishBoot();removeEventListener('keydown',bootKey);});
function bootStep(){
  if(bootDone)return;
  if(bootIdx<bootLines.length){
    bootEl.innerHTML+=bootLines[bootIdx]+'\n';
    bootIdx++;
    setTimeout(bootStep,120+Math.random()*80);
  }else{
    setTimeout(finishBoot,600);
  }
}
setTimeout(bootStep,800);

// === CENTER CAMERA ON CITY ===
// City spans roughly tiles (0,0) to (18,16). Center on tile (9,8).
cam.tx=(9-8)*TW/2; // Iso X
cam.ty=(9+8)*TH/2-100; // Iso Y
// Reveal the center districts so you don't start in full fog
visited['chi']=true; // Chinatown is near center
visited['les']=true; // LES is near center

// === DYNAMIC PAGE TITLE ===
setInterval(()=>{
  const alive=ags.filter(a=>!a._dead).length;
  document.title='DARKCITY — '+alive+' citizens — NIGHT';
  // Simulate online viewers (will be real with Supabase presence)
  const onlineBase=1200+Math.floor(Math.sin(Date.now()*.00001)*50);
  document.getElementById('tOn').textContent=onlineBase.toLocaleString()+' online';
},3000);

// === VARIABLE EVENT TIMING ===
// Events cluster and have quiet periods instead of fixed 3.5s
let nextEvTime=2000;
function scheduleEvent(){
  setTimeout(()=>{
    genEv();
    // 70% chance of quick follow-up (cluster), 30% longer gap (quiet)
    nextEvTime=Math.random()>.3?(1500+Math.random()*2000):(5000+Math.random()*4000);
    scheduleEvent();
  },nextEvTime);
}
scheduleEvent();

requestAnimationFrame(frame);
console.log("DARKCITY GOTHIC NOIR — "+bldgs.length+" buildings, "+ags.length+" citizens"+(useSupabase?" (LIVE)":""));
})();
}catch(e){console.error("DARKCITY INIT ERROR:",e);document.body.innerHTML="<div style=\"color:#c73e3e;font-family:monospace;padding:2rem\">DARKCITY ERROR: "+e.message+"</div>";}

