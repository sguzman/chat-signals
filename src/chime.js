/* Brief on-device event cues. Playback requires browser audio permission. */
(function(root){
  'use strict';
  let ctx=null;
  const MOTIFS=Object.freeze({
    success:Object.freeze([[659.25,0,0.12],[880,0.13,0.12]]),
    warning:Object.freeze([[698.46,0,0.14],[523.25,0.16,0.16]]),
    error:Object.freeze([[329.63,0,0.20],[349.23,0,0.20]]),
    limit:Object.freeze([[783.99,0,0.09],[587.33,0.11,0.09],[440,0.22,0.17]])
  });
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
  async function play(kind='success'){
    const motif=MOTIFS[kind];
    if(!motif)return 'silent'; // Routine and unknown states never make noise.
    const requested=Date.now();
    const result=await unlock();
    // Never play a stale cue after a suspended background tab wakes.
    if(result!=='ready'||Date.now()-requested>750)return 'blocked';
    try{
      const start=ctx.currentTime+0.015;
      const peak=kind==='success'?0.075:kind==='error'?0.042:0.055;
      for(const [hz,offset,duration] of motif){
        const begin=start+offset,osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='sine';osc.frequency.value=hz;
        gain.gain.setValueAtTime(0.0001,begin);
        gain.gain.exponentialRampToValueAtTime(peak,begin+0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001,begin+duration);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start(begin);osc.stop(begin+duration+0.005);
        osc.onended=()=>{osc.disconnect();gain.disconnect();};
      }
      return 'scheduled'; // Not proof of OS audibility.
    }catch{return 'blocked';}
  }
  const api=Object.freeze({unlock,play,MOTIFS});
  root.ChatSignalsChime=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
