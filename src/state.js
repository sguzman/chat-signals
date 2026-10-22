/* Evidence-bound response state tracker. No DOM, network or presentation dependencies. */
(function(root){
  'use strict';
  const phases=new Set(['idle','generating','verifying','finished','interrupted','failed','limit','unknown']);
  function create(){
    let key=null,phase='unknown',read='viewed',epoch=0,baselineAction=null,baselineAssistant=null,
      baselineNotice=null,lastSample=null,reason='no-observation',changed=0,cancelPendingStop=false;
    const out=()=>Object.freeze({phase,read,epoch,reason,changed,
      confidence:phase==='unknown'||phase==='verifying'?'unknown':
        phase==='finished'?'inferred':'observed'});
    function reset(next){
      key=next;phase=next?'idle':'unknown';read='viewed';epoch=0;
      baselineAction=null;baselineAssistant=null;baselineNotice=null;lastSample=null;cancelPendingStop=false;
      reason=next?'route-observed':'unrecognized-route';changed++;
      return out();
    }
    function begin(sample){
      cancelPendingStop=false;epoch++;phase='generating';read='viewed';
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
        if(phase!=='generating'&&phase!=='verifying'&&phase!=='interrupted')begin(sample);
        else if(phase!=='generating'){phase='generating';reason='stop-visible';}
      }else if(phase==='generating'){
        phase='verifying';reason='stop-disappeared-unconfirmed';
      }
      const freshAction=Boolean(sample.actionToken)&&sample.actionToken!==baselineAction;
      const replyFresh=Boolean(sample.assistantToken)&&
        sample.assistantToken!==baselineAssistant;
      const freshActionOnStartedTurn=baselineAction===null&&freshAction;
      // A replaced old Copy button alone is not a completed new response.
      if(!stop && (phase==='generating'||phase==='verifying'||phase==='interrupted') &&
         freshAction && (replyFresh||freshActionOnStartedTurn)){
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
      lastSample={assistantToken:sample.assistantToken||null};
      if(phase+'|'+read+'|'+reason!==before)changed++;
      return out();
    }
    function cancel(){
      if(['generating','verifying','interrupted'].includes(phase)){
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
    return Object.freeze({observe,reset,cancel,viewed,snapshot:out});
  }
  const api=Object.freeze({create,phases});
  root.ChatSignalsState=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
