/* Independent MIT implementation of scoped conversation identity and OKLab color allocation. */
(function(root){
  'use strict';
  function identity(url){
    let u;try{u=new URL(url);}catch{return null;}
    if(u.protocol!=='https:'||u.hostname!=='chatgpt.com')return null;
    const p=u.pathname.split('/').filter(Boolean);
    const valid=s=>/^[a-zA-Z0-9_-]{6,128}$/.test(s||'');
    if(p.length===2&&p[0]==='c'&&valid(p[1]))
      return {kind:'chat',key:'chat:'+p[1]};
    if(p.length===4&&p[0]==='g'&&p[2]==='c'&&valid(p[1])&&valid(p[3]))
      return {kind:'gpt',key:'gpt:'+p[1]+'/chat:'+p[3]};
    if(p.length===4&&p[0]==='project'&&p[2]==='c'&&valid(p[1])&&valid(p[3]))
      return {kind:'project',key:'project:'+p[1]+'/chat:'+p[3]};
    return null;
  }
  function hash(value){
    // Two deterministic FNV-1a 32-bit streams, no raw URL sent to background.
    let a=2166136261>>>0,b=3141592653>>>0;
    for(let i=0;i<value.length;i++){
      const n=value.charCodeAt(i);
      a=Math.imul(a^n,16777619)>>>0;
      b=Math.imul(b^(n^0x5a5a),16777619)>>>0;
    }
    return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
  }
  const clamp=n=>Math.max(0,Math.min(1,n));
  function gamma(n){return n<=0.0031308?12.92*n:1.055*Math.pow(n,1/2.4)-0.055;}
  function degamma(n){return n<=0.04045?n/12.92:Math.pow((n+0.055)/1.055,2.4);}
  function fromLab(L,a,b){
    const l=(L+0.3963377774*a+0.2158037573*b)**3;
    const m=(L-0.1055613458*a-0.0638541728*b)**3;
    const s=(L-0.0894841775*a-1.291485548*b)**3;
    const channels=[4.0767416621*l-3.3077115913*m+0.2309699292*s,
      -1.2684380046*l+2.6097574011*m-0.3413193965*s,
      -0.0041960863*l-0.7034186147*m+1.707614701*s];
    return channels.map(x=>Math.round(clamp(gamma(x))*255));
  }
  function toLab(rgb){
    const [r,g,b]=rgb.map(x=>degamma(x/255));
    const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
    const m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
    const s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
    return [0.2104542553*l+0.793617785*m-0.0040720468*s,
      1.9779984951*l-2.428592205*m+0.4505937099*s,
      0.0259040371*l+0.7827717662*m-0.808675766*s];
  }
  const hex=rgb=>'#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');
  const palette=Object.freeze([0.50,0.67,0.82].flatMap((L,band)=>
    Array.from({length:24},(_,i)=>{
      const theta=(i*15+band*5)*Math.PI/180, C=[0.135,0.12,0.085][band];
      const rgb=fromLab(L,C*Math.cos(theta),C*Math.sin(theta));
      return Object.freeze({hex:hex(rgb),lab:Object.freeze(toLab(rgb))});
    })));
  const distance=(a,b)=>Math.hypot(a.lab[0]-b.lab[0],a.lab[1]-b.lab[1],a.lab[2]-b.lab[2]);
  function choose(key,occupiedHex=[]){
    const occupied=occupiedHex.map(x=>palette.find(p=>p.hex===x)).filter(Boolean);
    const start=parseInt(hash(key).slice(0,8),16)%palette.length;
    let best=palette[start],bestScore=-1;
    for(let j=0;j<palette.length;j++){
      const candidate=palette[(start+j)%palette.length];
      const score=occupied.length?Math.min(...occupied.map(o=>distance(candidate,o))):
        (j===0?1:0);
      if(score>bestScore+1e-9){bestScore=score;best=candidate;}
    }
    return best.hex;
  }
  const api=Object.freeze({identity,hash,choose,palette,distance,toLab,fromLab});
  root.ChatSignalsColor=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
