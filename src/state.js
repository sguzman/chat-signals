/* Evidence-bound response state tracker. No DOM, network or presentation dependencies. */
(function(root){
  'use strict';
  const phases=new Set(['idle','submitted','generating','verifying','finished','interrupted','failed','limit','unknown']);
  function create(){
    let key=null,phase='unknown',read='viewed',epoch=0,baselineAction=null,baselineAssistant=null,
      baselineNotice=null,lastSample=null,reason='no-observation',changed=0,cancelPendingStop=false,stopSeen=false;
    const out=()=>Object.freeze({phase,read,epoch,reason,changed,
      confidence:phase==='unknown'||phase==='verifying'?'unknown':
        phase==='finished'?'inferred':'observed'});
    function reset(next){
      key=next;phase=next?'idle':'unknown';read='viewed';epoch=0;
      baselineAction=null;baselineAssistant=null;baselineNotice=null;lastSample=null;cancelPendingStop=false;stopSeen=false;
      reason=next?'route-observed':'unrecognized-route';changed++;
      return out();
    }
    function intent(sample){
      if(!sample||!key||sample.key!==key)return out();
      epoch++;phase='submitted';read='viewed';cancelPendingStop=false;stopSeen=false;
      baselineAction=sample.actionToken||null;
      baselineAssistant=sample.assistantToken||null;
      baselineNotice=sample.noticeToken||null;
      reason='user-submit-intent';changed++;
      return out();
    }
    function expireIntent(){
      if(phase==='submitted'){
        phase='unknown';reason='submission-unconfirmed';changed++;
      }
      return out();
    }
    function begin(sample){
      cancelPendingStop=false;stopSeen=true;epoch++;phase='generating';read='viewed';
      baselineAction=sample.actionToken||null;
      baselineAssistant=sample.assistantToken||null;
      baselineNotice=sample.noticeToken||null;
      reason='stop-visible';changed++;
    }
    function observe(sample){
      if(!sample||typeof sample!=='object')return out();
      if(sample.key!==key)reset(sample.key||null);
      if(!key)return out();
      const before=phase+'|'+read+'|'+reason;
      const stop=Boolean(sample.stop);
      if(!stop)cancelPendingStop=false;
      if(stop&&cancelPendingStop){lastSample={assistantToken:sample.assistantToken||null};return out();}
      if(stop){
        stopSeen=true;
        if(phase==='submitted'){
          phase='generating';reason='stop-visible';
        }else if(phase!=='generating'&&phase!=='verifying'&&
          phase!=='interrupted'&&phase!=='failed'&&phase!=='limit')
          begin(sample); // stale Stop cannot manufacture new error epochs
        else if(phase!=='generating'){phase='generating';reason='stop-visible';}
      }else if(phase==='generating'&&stopSeen){
        stopSeen=false;
        phase='verifying';reason='stop-disappeared-unconfirmed';
      }
      const freshReply=Boolean(sample.assistantToken)&&
        sample.assistantToken!==baselineAssistant;
      const priorActionAbsent=lastSample?.assistantToken===sample.assistantToken&&
        !lastSample?.actionToken;
      const replyJustStarted=freshReply&&!stop&&(phase==='submitted'||
        (phase==='unknown'&&reason==='submission-unconfirmed'));
      // A new assistant turn is evidence that output started. This does not
      // claim completion or establish that the transport succeeded.
      if(replyJustStarted){
        phase='generating';reason='new-assistant-turn-visible';
      }
      const freshAction=Boolean(sample.actionToken)&&sample.actionToken!==baselineAction;
      // One newly-mounted reply plus an already-mounted toolbar is *not*
      // evidence of completion. Wait for a terminal Copy control to appear
      // AFTER that reply is observed, or for a previously seen Stop to end.
      const newTerminalAfterReply=priorActionAbsent&&freshAction&&freshReply;
      const terminalAfterStop=freshAction&&
        reason==='stop-disappeared-unconfirmed'&&
        (freshReply||(baselineAction===null&&priorActionAbsent));
      // A warning already present at the submission baseline is stale.
      // Only a fresh relevant notice may veto terminal completion evidence.
      const activeNotice=Boolean(sample.noticeKind)&&
        (sample.noticeToken!==baselineNotice||
         sample.noticeKind==='limit'||sample.noticeKind==='conversation_load_failed');
      if(!stop&&!replyJustStarted&&!activeNotice&&
         (phase==='submitted'||phase==='generating'||phase==='verifying'||phase==='interrupted') &&
         (newTerminalAfterReply||terminalAfterStop)){
        phase='finished';read=sample.hidden?'unread':'viewed';
        reason='fresh-assistant-terminal-action';
      }else if(sample.noticeKind==='limit'){
        phase='limit';reason='visible-conversation-limit';
      }else if(sample.noticeKind==='conversation_load_failed' && phase!=='finished'){
        phase='failed';reason='visible-conversation-load-failure';
      }else if(sample.noticeKind==='response_load_failed' && phase!=='finished' &&
        sample.noticeToken!==baselineNotice){
        phase='failed';reason='current-response-load-failure';
      }else if(sample.noticeKind==='interrupted' && phase!=='finished' &&
        sample.noticeToken!==baselineNotice){
        phase='interrupted';reason='current-interruption';
      }else if(sample.noticeKind==='error' && phase!=='finished' &&
        sample.noticeToken!==baselineNotice && epoch>0){
        phase='failed';reason='current-response-error';
      }else if(!sample.noticeKind && phase==='interrupted'){
        phase='verifying';reason='interruption-cleared-unconfirmed';
      }
      lastSample={assistantToken:sample.assistantToken||null,
        actionToken:sample.actionToken||null};
      if(phase+'|'+read+'|'+reason!==before)changed++;
      return out();
    }
    function cancel(){
      if(['submitted','generating','verifying','interrupted'].includes(phase)){
        phase='idle';read='viewed';reason='manual-cancel';cancelPendingStop=true;changed++;
      }
      return out();
    }
    function viewed(){
      if(phase==='finished'&&read==='unread'){
        read='viewed';reason='finished-viewed';changed++;
      }
      return out();
    }
    return Object.freeze({observe,reset,cancel,viewed,intent,expireIntent,snapshot:out});
  }
  const api=Object.freeze({create,phases});
  root.ChatSignalsState=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
