/* Small on-device completion chime. Playback requires browser audio permission. */
(function(root){
  'use strict';
  let ctx=null;
  function audioClass(){return root.AudioContext||root.webkitAudioContext;}
  function unlock(){
    const Ctor=audioClass();
    if(!Ctor)return Promise.resolve('unavailable');
    try{
      if(!ctx)ctx=new Ctor();
      if(ctx.state==='running')return Promise.resolve('ready');
      return Promise.resolve(ctx.resume()).then(()=>
        ctx.state==='running'?'ready':'blocked',()=> 'blocked');
    }catch{return Promise.resolve('blocked');}
  }
  async function play(){
    // Never queue a sound indefinitely. A background tab with suspended audio
    // can stay suspended until it is focused again; a late chime is misleading.
    const requested=Date.now();
    const result=await unlock();
    if(result!=='ready'||Date.now()-requested>750)return 'blocked';
    try{
      const start=ctx.currentTime+0.015;
      for(const [i,freq] of [659.25,880].entries()){
        const begin=start+i*0.13;
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.type='sine';osc.frequency.value=freq;
        gain.gain.setValueAtTime(0.0001,begin);
        gain.gain.exponentialRampToValueAtTime(0.075,begin+0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001,begin+0.12);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start(begin);osc.stop(begin+0.125);
        osc.onended=()=>{osc.disconnect();gain.disconnect();};
      }
      return 'scheduled'; // Not a claim of audible OS output.
    }catch{return 'blocked';}
  }
  root.ChatSignalsChime=Object.freeze({unlock,play});
  if(typeof module==='object'&&module.exports)module.exports=root.ChatSignalsChime;
})(typeof globalThis!=='undefined'?globalThis:this);
