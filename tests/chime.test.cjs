const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/chime.js','utf8');
function start(allowed=true){
  const calls=[],origin=Date;
  class AudioContext{
    constructor(){this.state=allowed?'suspended':'suspended';this.currentTime=2;this.destination={};}
    resume(){if(allowed)this.state='running';return Promise.resolve();}
    createOscillator(){
      const osc={type:'',frequency:{value:0},
        connect:()=>{},disconnect:()=>{},
        start:t=>calls.push(['start',t]),
        stop:t=>calls.push(['stop',t])};
      return osc;
    }
    createGain(){
      return {gain:{setValueAtTime:(v,t)=>calls.push(['gain',v,t]),
        exponentialRampToValueAtTime:(v,t)=>calls.push(['ramp',v,t])},
        connect:()=>{},disconnect:()=>{}};
    }
  }
  const sandbox={AudioContext,Promise,Date:origin};
  vm.runInNewContext(source,sandbox);
  return {api:sandbox.ChatSignalsChime,calls};
}
test('chime unlocks on user action and schedules only two brief tones',async()=>{
  const s=start(true);
  assert.equal(await s.api.unlock(),'ready');
  assert.equal(await s.api.play(),'scheduled');
  assert.equal(s.calls.filter(x=>x[0]==='start').length,2);
  assert.equal(s.calls.filter(x=>x[0]==='stop').length,2);
});
test('browser autoplay rejection is reported, not claimed audible',async()=>{
  const s=start(false);
  assert.equal(await s.api.unlock(),'blocked');
  assert.equal(await s.api.play(),'blocked');
  assert.equal(s.calls.length,0);
});
test('missing WebAudio does not crash or claim audible playback',async()=>{
  const sandbox={Promise,Date};
  vm.runInNewContext(source,sandbox);
  assert.equal(await sandbox.ChatSignalsChime.unlock(),'unavailable');
  assert.equal(await sandbox.ChatSignalsChime.play(),'blocked');
});

test('four event motifs remain short and acoustically distinct',async()=>{
 const motifTest=[
  ['success',2,true],
  ['warning',2,false],
  ['error',2,false],
  ['limit',3,false]
 ];
 const signature=[];
 for(const [kind,count,ascending] of motifTest){
   const s=start(true);
   assert.equal(await s.api.play(kind),'scheduled');
   assert.equal(s.calls.filter(x=>x[0]==='start').length,count);
   assert.equal(s.calls.filter(x=>x[0]==='stop').length,count);
   const tones=s.api.MOTIFS[kind];
   assert.equal(tones.length,count);
   if(ascending)assert.ok(tones[0][0]<tones[1][0]);
   if(kind==='warning'||kind==='limit')
     assert.ok(tones[0][0]>tones.at(-1)[0]);
   if(kind==='error')
     assert.equal(tones[0][1],tones[1][1],'mild dissonant simultaneous pair');
   assert.ok(tones.every(([frequency,offset,duration])=>
     frequency>=200&&frequency<1000&&offset+duration<=0.45));
   signature.push(tones.map(x=>x[0]+':'+x[1]).join('|'));
 }
 assert.equal(new Set(signature).size,4);
});
test('neutral states never play sound, even if audio is ready',async()=>{
 const s=start(true);
 for(const kind of ['idle','submitted','generating','verifying','unknown','viewed','recovered']){
   assert.equal(await s.api.play(kind),'silent');
 }
 assert.equal(s.calls.length,0);
});
