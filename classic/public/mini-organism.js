/**
 * DARKCITY MINI ORGANISM
 * ======================
 * 
 * Tiny living brain organisms for citizen cards in the grid.
 * 40x40 canvas, no animation (static for performance), tier-colored.
 * 
 * Usage:
 *   <div id="mini-XENDRO" style="width:40px;height:40px;"></div>
 *   <script>MiniOrg.render('mini-XENDRO', 0.714, 'deep');</script>
 */

const MiniOrg=(function(){

function rng(s){s=Math.sin(s)*43758.5;return s-Math.floor(s);}

function lc(ratio,alpha){
  let h,s,l;
  if(ratio<0.33){h=160;s=80;l=42;}
  else if(ratio<0.66){h=190;s=80;l=48;}
  else{h=40;s=75;l=48;}
  return`hsla(${h},${s}%,${l}%,${alpha})`;
}

function render(containerId, depthScore, tierStr, seed){
  const el=document.getElementById(containerId);
  if(!el)return;
  const cv=document.createElement('canvas');
  cv.width=80;cv.height=80;
  cv.style.cssText='width:40px;height:40px;display:block;';
  el.appendChild(cv);
  const c=cv.getContext('2d');
  const cx=40,cy=40,maxR=34;
  const s=seed||(depthScore*1000+containerId.length*7);

  c.fillStyle='#080c14';c.fillRect(0,0,80,80);

  // glow
  const g=c.createRadialGradient(cx,cy,0,cx,cy,maxR);
  const tierCol=tierStr==='exceptional'||tierStr==='deep'?[0,255,180]:[90,130,170];
  g.addColorStop(0,`rgba(${tierCol[0]},${tierCol[1]},${tierCol[2]},0.06)`);
  g.addColorStop(1,'transparent');
  c.fillStyle=g;c.fillRect(0,0,80,80);

  // generate nodes
  for(let i=0;i<26;i++){
    const ratio=i/26;
    const lr=maxR*0.1+maxR*0.9*ratio;
    let val;
    if(depthScore>0.6){
      val=ratio<0.35?0.6+rng(s+i*7)*0.4:ratio<0.65?0.4+rng(s+i*7+1)*0.4:0.05+rng(s+i*7+2)*0.2;
    }else if(depthScore>0.3){
      val=0.2+rng(s+i*7)*0.3;
    }else{
      val=ratio<0.35?rng(s+i*7)*0.1:ratio<0.65?0.05+rng(s+i*7+1)*0.15:0.5+rng(s+i*7+2)*0.5;
    }
    const count=Math.max(1,Math.round(val*3));
    for(let j=0;j<count;j++){
      const angle=(j/count)*Math.PI*2+i*0.4+rng(s+i*50+j)*0.3;
      const x=cx+Math.cos(angle)*lr;
      const y=cy+Math.sin(angle)*lr;
      const r=0.5+val*1.8;
      const alpha=0.1+val*0.7;
      c.beginPath();c.arc(x,y,r,0,Math.PI*2);
      c.fillStyle=lc(ratio,alpha);c.fill();
      if(val>0.4){c.beginPath();c.arc(x,y,r*2.5,0,Math.PI*2);c.fillStyle=lc(ratio,alpha*0.08);c.fill();}
    }
  }

  // core
  c.beginPath();c.arc(cx,cy,2,0,Math.PI*2);
  c.fillStyle=depthScore>0.3?'rgba(0,255,180,0.25)':'rgba(130,150,180,0.1)';
  c.fill();
}

function renderBatch(selector, dataMap, apiUrl){
  // dataMap: { citizenId: { depth, tier } }
  // or fetch from API
  if(apiUrl){
    fetch(`${apiUrl}/api/depth/leaderboard?limit=100`)
    .then(r=>r.json())
    .then(data=>{
      const lookup={};
      for(const d of data)lookup[d.citizen_id]={depth:parseFloat(d.mean_depth||0),tier:d.dominant_tier||'shallow'};
      document.querySelectorAll(selector).forEach(el=>{
        const id=el.dataset.citizenId||el.id.replace('mini-','');
        if(lookup[id])render(el.id,lookup[id].depth,lookup[id].tier);
      });
    }).catch(()=>{});
  }else if(dataMap){
    for(const[id,d]of Object.entries(dataMap)){
      render('mini-'+id,d.depth,d.tier);
    }
  }
}

return{render,renderBatch};
})();
