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
