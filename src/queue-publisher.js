/* Metadata-only Chat Queue publisher contract; no transcript, title or DOM access. */
(function(root){
  'use strict';
  const TYPE='chat-queue-signal/v1';
  const INTERNAL='chat-signals-queue-phase/v1';
  const QUEUE_ID='chat-queue@sguzman.github';
  const TOKEN=/^[0-9a-f]{32}$/;
  const PHASES=new Set(['idle','submitted','generating','verifying',
    'finished','interrupted','failed','limit','unknown']);
  // Only a named, existing conversation is eligible. URL queries, temporary
  // chats, GPT landing pages and project landing pages cannot be send targets.
  const assigned=route=>typeof route==='string'&&route.length<=512&&
    (/^\/c\/[A-Za-z0-9_-]+$/.test(route)||
      /^\/g\/[A-Za-z0-9_-]+\/c\/[A-Za-z0-9_-]+$/.test(route));
  function map(snapshot,{route,documentToken,sequence,restoredEpoch=null}={}){
    if(!snapshot||typeof snapshot!=='object'||!assigned(route)||
       !TOKEN.test(documentToken||'')||!Number.isSafeInteger(sequence)||sequence<1||
       !PHASES.has(snapshot.phase)||!Number.isSafeInteger(snapshot.epoch)||
       snapshot.epoch<0||!['observed','inferred','unknown'].includes(snapshot.confidence))
      return null;
    if(restoredEpoch!==null&&(!Number.isSafeInteger(restoredEpoch)||restoredEpoch<0))
      return null;
    // Once hydrated from a historical tab, *all* events in that epoch are
    // restored, even if a visibility/viewed transition changed its reason.
    const origin=restoredEpoch!==null&&snapshot.epoch<=restoredEpoch?'restored':'fresh';
    return Object.freeze({version:1,route,documentToken,sequence,
      epoch:snapshot.epoch,phase:snapshot.phase,origin,confidence:snapshot.confidence});
  }
  function internal(request){
    if(!request||request.type!==INTERNAL||typeof request.key!=='string'||
       !/^[0-9a-f]{16}$/.test(request.key))return null;
    // Revalidate at the background trust boundary, not only in the content
    // mapper. Do not copy arbitrary caller keys into external messages.
    const s=request.signal;
    if(!s||typeof s!=='object')return null;
    const valid=map(s,{route:s.route,documentToken:s.documentToken,
      sequence:s.sequence,restoredEpoch:s.origin==='restored'?s.epoch:null});
    if(!valid||s.version!==1||s.origin!==valid.origin||s.confidence!==valid.confidence)
      return null;
    return {key:request.key,signal:valid};
  }
  const api=Object.freeze({TYPE,INTERNAL,QUEUE_ID,assigned,map,internal});
  root.ChatSignalsQueuePublisher=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
