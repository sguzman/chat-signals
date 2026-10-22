/* Pure, bounded event classifier: presentation never feeds back into state. */
(function(root){
  'use strict';
  // These are user-facing categories, not Firefox notification priorities.
  const EVENTS=Object.freeze({
    finished:Object.freeze({kind:'completion',category:'success',sound:'success'}),
    interrupted:Object.freeze({kind:'interruption',category:'warning',sound:'warning'}),
    failed:Object.freeze({kind:'failure',category:'error',sound:'error'}),
    limit:Object.freeze({kind:'limit',category:'warning',sound:'limit'})
  });
  function create(){
    let identity=null;
    const notified=new Map();
    function reset(key){
      identity=key||null;
      notified.clear();
    }
    function transition(previous,next){
      if(!identity||!previous||!next||previous.phase===next.phase||
         !Number.isSafeInteger(next.epoch)||next.epoch<1)return null;
      const item=EVENTS[next.phase];
      if(!item)return null; // idle, submitted, generating, verifying, unknown, read changes
      // An already-open failed/limited chat is not a fresh response event.
      if(previous.epoch!==next.epoch)return null;
      if((notified.get(item.kind)||0)>=next.epoch)return null;
      notified.set(item.kind,next.epoch);
      return item;
    }
    return Object.freeze({reset,transition});
  }
  const api=Object.freeze({create,EVENTS});
  root.ChatSignalsAlerts=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
