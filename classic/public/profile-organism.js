/**
 * DARKCITY PROFILE ORGANISM
 * ==========================
 * 
 * Replaces the static portrait on citizen profiles with a living neural organism.
 * 
 * Usage:
 *   <div id="citizen-brain" style="width:100%;height:400px;background:#080c14;border-radius:4px;position:relative;overflow:hidden;"></div>
 *   <script src="profile-organism.js"></script>
 *   <script>
 *     // With real API data:
 *     ProfileOrganism.init('citizen-brain', 'XENDRO', { apiUrl: 'https://your-railway-url.up.railway.app' });
 *     
 *     // With manual data:
 *     ProfileOrganism.init('citizen-brain', 'XENDRO', { layerProfile: {...}, depth: 0.714, tier: 'deep' });
 *   </script>
 * 
 * The organism grows from the center, breathes, and its shape reflects the citizen's 
 * actual neural activation pattern. Deep thinkers have full, radiant organisms.
 * Shallow agents have sparse, outer-concentrated structures.
 */

const ProfileOrganism = (function(){

function lc(ratio, alpha){
  let h,s,l;
  if(ratio<0.33){h=160;s=85;l=42;}
  else if(ratio<0.66){const p=(ratio-0.33)/0.33;h=160+65*p;s=85;l=42+12*p;}
  else{const p=(ratio-0.66)/0.34;h=225-190*p;s=80;l=54-10*p;}
  return `hsla(${h},${s}%,${l}%,${alpha})`;
}

function rng(s){s=Math.sin(s)*43758.5;return s-Math.floor(s);}

function genOrg(profile, maxR){
  const nodes=[], links=[];
  const vals=[];
  const mx=Math.max(...Object.values(profile),1);
  for(let i=0;i<26;i++) vals[i]=(profile[i]||0)/mx;

  for(let i=0;i<26;i++){
    const ratio=i/26;
    const lr=maxR*0.08+maxR*0.92*ratio;
    const count=Math.max(1,Math.round(vals[i]*7)+1);
    for(let j=0;j<count;j++){
      const angle=(j/count)*Math.PI*2+i*0.38+rng(i*100+j*7)*0.25;
      const jit=(rng(i*50+j*13)-0.5)*lr*0.1;
      nodes.push({
        ox:Math.cos(angle)*(lr+jit), oy:Math.sin(angle)*(lr+jit),
        x:0, y:0, r:0.8+vals[i]*3.5,
        layer:i, val:vals[i],
        phase:rng(i*30+j*11)*6.28, speed:0.004+rng(i*20+j)*0.01,
        drift:rng(i*40+j*17)*0.2+0.08
      });
    }
  }
  for(let i=0;i<6;i++){
    const a=(i/6)*Math.PI*2;
    nodes.push({ox:Math.cos(a)*maxR*0.04,oy:Math.sin(a)*maxR*0.04,x:0,y:0,r:1.8,layer:0,val:1,phase:rng(i*99)*6.28,speed:0.012,drift:0.04});
  }
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      if(Math.abs(nodes[i].layer-nodes[j].layer)>3)continue;
      const dx=nodes[i].ox-nodes[j].ox,dy=nodes[i].oy-nodes[j].oy;
      if(Math.sqrt(dx*dx+dy*dy)<maxR*0.3&&rng(i*7+j*3)<0.25)
        links.push({a:i,b:j,pulse:rng(i*11+j*5)*6.28});
    }
  }
  return{nodes,links};
}

function init(containerId, citizenId, opts={}){
  const container = document.getElementById(containerId);
  if(!container) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const c = canvas.getContext('2d');

  let W, H, t=0, org=null, active=false, growing=false, growStart=0;
  let floaters=[];
  let depthScore=0, tierName='unscored', features=0;

  function resize(){
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    W = canvas.width = rect.width * dpr;
    H = canvas.height = rect.height * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    initFloaters(rect.width, rect.height);
  }

  function initFloaters(w,h){
    floaters=[];
    for(let i=0;i<60;i++){
      floaters.push({
        x:rng(i*13)*w, y:rng(i*17)*h,
        vx:(rng(i*7)-0.5)*0.08, vy:(rng(i*11)-0.5)*0.06,
        r:rng(i*23)*0.8+0.2, a:rng(i*29)*0.04+0.01,
        phase:rng(i*31)*6.28
      });
    }
  }

  function buildOrganism(profile){
    const rect = container.getBoundingClientRect();
    const maxR = Math.min(rect.width, rect.height) * 0.35;
    org = genOrg(profile, maxR);
    active = true;
    growing = true;
    growStart = performance.now();
  }

  function frame(){
    t++;
    const rect = container.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const cx = w/2, cy = h/2;

    c.clearRect(0,0,w,h);
    c.fillStyle='#080c14';
    c.fillRect(0,0,w,h);

    // floaters
    for(const f of floaters){
      f.x+=f.vx;f.y+=f.vy;f.phase+=0.008;
      if(f.x<-5)f.x=w+5;if(f.x>w+5)f.x=-5;
      if(f.y<-5)f.y=h+5;if(f.y>h+5)f.y=-5;
      const pulse=Math.sin(f.phase)*0.3+0.7;
      c.beginPath();c.arc(f.x,f.y,f.r*pulse,0,Math.PI*2);
      c.fillStyle=`rgba(80,130,170,${f.a*pulse})`;c.fill();
    }

    if(!org||!org.nodes.length){
      // empty state
      c.fillStyle='rgba(130,160,190,0.12)';
      c.font='500 10px monospace';c.textAlign='center';c.textBaseline='middle';
      c.fillText('NEURAL PROFILE',cx,cy-8);
      c.fillText('AWAITING DEPTH SCAN',cx,cy+8);

      // dim rings
      for(let i=0;i<8;i++){
        const r=20+i*18;
        c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);
        c.strokeStyle='rgba(100,140,180,0.03)';c.lineWidth=0.5;c.stroke();
      }
      requestAnimationFrame(frame);
      return;
    }

    const prog = growing ? Math.min(1,(performance.now()-growStart)/3000) : 1;
    const br = Math.sin(t*0.011)*0.06+1;

    // glow
    const g=c.createRadialGradient(cx,cy,0,cx,cy,Math.min(w,h)*0.4);
    const ga=active?0.04*br:0.008;
    g.addColorStop(0,`rgba(0,255,180,${ga*2.5})`);
    g.addColorStop(0.35,`rgba(0,160,255,${ga})`);
    g.addColorStop(1,'transparent');
    c.fillStyle=g;c.fillRect(0,0,w,h);

    // links
    for(const lk of org.links){
      const a=org.nodes[lk.a],b=org.nodes[lk.b];
      if(!a||!b)continue;
      const lp=growing?Math.max(0,Math.min(1,(prog*26-Math.min(a.layer,b.layer))/4)):1;
      if(lp<0.01)continue;
      lk.pulse+=0.016;
      const av=(a.val+b.val)/2;
      const pulse=Math.sin(lk.pulse)*0.3+0.7;
      const alpha=av*0.1*pulse*lp;
      const ratio=(a.layer+b.layer)/52;
      const mx_=(a.x+b.x)/2+Math.sin(t*0.008+lk.pulse)*5;
      const my_=(a.y+b.y)/2+Math.cos(t*0.008+lk.pulse)*5;
      c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(mx_,my_,b.x,b.y);
      c.strokeStyle=lc(ratio,alpha);c.lineWidth=0.35+av*0.7;c.stroke();
      if(av>0.5&&lp>0.5){
        const ft=(t*0.003+lk.pulse)%1;
        c.beginPath();c.arc(a.x+(b.x-a.x)*ft,a.y+(b.y-a.y)*ft,0.5+av*0.6,0,Math.PI*2);
        c.fillStyle=lc(ratio,alpha*1.5);c.fill();
      }
    }

    // nodes
    for(const n of org.nodes){
      n.phase+=n.speed;
      n.x=cx+n.ox*prog+Math.sin(n.phase)*n.drift*6;
      n.y=cy+n.oy*prog+Math.cos(n.phase*0.7)*n.drift*4;
      const lp=growing?Math.max(0,Math.min(1,(prog*26-n.layer)/3)):1;
      if(lp<0.01)continue;
      const v=n.val,ratio=n.layer/26;
      const pulse=Math.sin(n.phase*2)*0.12+0.88;
      const r=n.r*br*lp;
      const alpha=(0.1+v*0.9)*pulse*lp;
      if(v>0.3&&r>1){c.beginPath();c.arc(n.x,n.y,r*4,0,Math.PI*2);c.fillStyle=lc(ratio,alpha*0.05);c.fill();}
      c.beginPath();c.arc(n.x,n.y,r,0,Math.PI*2);c.fillStyle=lc(ratio,alpha);c.fill();
      if(v>0.5){c.beginPath();c.arc(n.x,n.y,r*2,0,Math.PI*2);c.fillStyle=lc(ratio,alpha*0.1);c.fill();}
    }

    // core
    const ca=0.2*br*prog;
    c.beginPath();c.arc(cx,cy,3*br,0,Math.PI*2);c.fillStyle=`rgba(0,255,200,${ca})`;c.fill();
    c.beginPath();c.arc(cx,cy,10*br,0,Math.PI*2);c.fillStyle=`rgba(0,255,200,${ca*0.12})`;c.fill();

    // stats overlay (bottom of canvas)
    if(depthScore>0&&prog>0.8){
      const tierCol=tier(depthScore).col;
      c.fillStyle='rgba(180,200,220,0.15)';
      c.font='500 9px monospace';c.textAlign='center';c.textBaseline='bottom';
      c.fillText('NEURAL DEPTH',cx,h-38);
      c.fillStyle=tierCol;
      c.font='500 18px monospace';
      c.fillText(depthScore.toFixed(3),cx,h-20);
      c.fillStyle='rgba(180,200,220,0.2)';
      c.font='400 8px monospace';
      c.fillText(tierName.toUpperCase()+' · '+features.toLocaleString()+' FEATURES',cx,h-8);
    }

    requestAnimationFrame(frame);
  }

  function tier(n){
    if(n>=0.8)return{name:'sovereign insight',col:'rgba(186,117,23,0.9)'};
    if(n>=0.6)return{name:'deep processing',col:'rgba(0,255,180,0.9)'};
    if(n>=0.3)return{name:'moderate depth',col:'rgba(55,138,221,0.9)'};
    return{name:'surface recall',col:'rgba(136,135,128,0.7)'};
  }

  // Resize observer
  const ro = new ResizeObserver(()=>resize());
  ro.observe(container);
  resize();

  // Load data
  if(opts.layerProfile){
    depthScore=opts.depth||0;
    tierName=opts.tier||tier(depthScore).name;
    features=opts.features||0;
    buildOrganism(opts.layerProfile);
  } else if(opts.apiUrl){
    fetch(`${opts.apiUrl}/api/depth/citizen/${encodeURIComponent(citizenId)}`)
    .then(r=>r.json())
    .then(data=>{
      depthScore=parseFloat(data.mean_depth||0);
      tierName=tier(depthScore).name;
      features=parseInt(data.total_features||0);
      
      if(data.recent_evaluations){
        for(const e of data.recent_evaluations) features+=parseInt(e.feature_count||0);
      }

      let profile=data.layer_profile;
      if(!profile){
        // Generate from depth score — deeper = more early/mid activation
        profile={};
        const seed=citizenId.split('').reduce((a,c)=>((a<<5)-a)+c.charCodeAt(0),0)/2147483647;
        for(let i=0;i<26;i++){
          const r=i/25;
          if(depthScore>0.6){
            profile[i]=r<0.35?300+rng(seed*100+i*7)*500:r<0.65?200+rng(seed*100+i*7+1)*350:30+rng(seed*100+i*7+2)*120;
          }else if(depthScore>0.3){
            profile[i]=r<0.35?100+rng(seed*100+i*7)*200:r<0.65?150+rng(seed*100+i*7+1)*250:150+rng(seed*100+i*7+2)*300;
          }else{
            profile[i]=r<0.35?rng(seed*100+i*7)*55:r<0.65?12+rng(seed*100+i*7+1)*75:300+rng(seed*100+i*7+2)*520;
          }
        }
      }
      buildOrganism(profile);
    })
    .catch(()=>{
      // Offline — show empty state
    });
  }

  frame();

  return{
    update(profile, depth, tierStr, feat){
      depthScore=depth||0;
      tierName=tierStr||tier(depthScore).name;
      features=feat||0;
      buildOrganism(profile);
    },
    destroy(){ ro.disconnect(); }
  };
}

return{init};
})();
