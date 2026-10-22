/* Chat Signals: observe current conversation UI; never read/store transcript bodies. */
(function(){
  'use strict';
  if(globalThis.__chatSignalsOwner)return;
  const color=globalThis.ChatSignalsColor,state=globalThis.ChatSignalsState;
  if(!color||!state)return;
  const owner={dispose};globalThis.__chatSignalsOwner=owner;
  const tracker=state.create();
  const tokens=new WeakMap();
  let tokenCount=0,current=null,currentHex=null,observer=null,observedMain=null,
    queued=false,job=0,clickSettleJob=0,routeNonce=0,iconLink=null,previousState=-1,lastProbe=0;
  const STOP='button[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Stop response"]';
  const ACTION='button[aria-label="Copy"],button[data-testid="copy-turn-action-button"],button[data-testid="copy-button"],[data-testid="turn-action-controls"] button';
  const EMOJI={idle:'',unknown:'❔',generating:'⏳',verifying:'🔎',
    interrupted:'🔌',failed:'⚠️',limit:'🛑',finished:'✅'};
  const strip=s=>String(s||'').replace(/^(?:(?:⏳|🔔|✅|🔌|⚠️|❌|🛑|🔎|❔)\s+)+/u,'');
  const present=el=>Boolean(el?.isConnected&&el.getClientRects().length);
  const token=node=>{
    if(!node)return null;
    if(!tokens.has(node))tokens.set(node,++tokenCount);
    return tokens.get(node);
  };
  function lastAssistant(main){
    if(!main)return null;
    // Reverse structural walk with a hard node budget. No transcript text read.
    const walker=document.createTreeWalker(main,NodeFilter.SHOW_ELEMENT);
    let node=main,last=main.lastElementChild;
    if(!last)return null;
    while(last.lastElementChild)last=last.lastElementChild;
    walker.currentNode=last;
    for(let i=0;i<768;i++){
      node=walker.currentNode;
      if(node?.matches?.('[data-message-author-role="assistant"]'))
        return node.closest('article,[data-testid^="conversation-turn"]')||node;
      if(!walker.previousNode())break;
    }
    return null;
  }
  function visibleNotice(){
    const nodes=document.querySelectorAll('[role="alert"],[data-testid="conversation-error"],[data-testid="toast"]');
    for(let i=0;i<Math.min(nodes.length,24);i++){
      const node=nodes[i];
      if(!present(node)||node.closest('[data-message-author-role]'))continue;
      // Only short diagnostic status elements, not any response/transcript text.
      if(node.textContent.length>180)continue;
      const text=node.textContent.trim().toLowerCase().replace(/\s+/g,' ');
      let kind=null;
      if(/(?:maximum (?:conversation )?length|conversation is too long|reached its limit)/.test(text))kind='limit';
      else if(/(?:could not load this chatgpt conversation|couldn't load this conversation)/.test(text))kind='conversation_load_failed';
      else if(/(?:this response couldn.t load)/.test(text))kind='response_load_failed';
      else if(/connection interrupted.*waiting for the complete answer/.test(text))kind='interrupted';
      else if(/^(?:network error|something went wrong|message delivery timed out|failed to generate response)[.!]?$/i.test(text))kind='error';
      if(kind)return {kind,id:token(node)};
    }
    return null;
  }
  function sample(){
    const main=document.querySelector('main');
    const last=lastAssistant(main);
    const action=last?.querySelector(ACTION);
    const notice=visibleNotice();
    return {key:current?.key||null,stop:[...document.querySelectorAll(STOP)]
      .slice(0,4).some(present),assistantToken:token(last),
      actionToken:present(action)?token(action):null,
      noticeKind:notice?.kind||null,noticeToken:notice?.id||null,hidden:document.hidden};
  }
  function drawIcon(hex,kind){
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.clearRect(0,0,32,32);ctx.fillStyle=hex;
    if(kind==='project'){
      ctx.beginPath();ctx.arc(16,16,14,0,Math.PI*2);ctx.fill();
    }else{
      ctx.beginPath();ctx.roundRect(2,2,28,28,kind==='gpt'?10:5);ctx.fill();
    }
    return canvas.toDataURL('image/png');
  }
  function paintIdentity(){
    if(!current||!currentHex){iconLink?.remove();iconLink=null;return;}
    const png=drawIcon(currentHex,current.kind);if(!png)return;
    if(!iconLink?.isConnected){
      iconLink=document.createElement('link');iconLink.rel='icon';iconLink.type='image/png';
      iconLink.dataset.chatSignalsIcon='1';document.head.append(iconLink);
    }
    if(iconLink.href!==png)iconLink.href=png;
  }
  function publish(){
    const r=tracker.snapshot();if(r.changed===previousState)return;
    previousState=r.changed;
    const root=document.documentElement;
    root.dataset.chatSignalsState=r.phase;
    root.dataset.chatSignalsRead=r.read;
    root.dataset.chatSignalsReason=r.reason;
    root.dataset.chatSignalsConfidence=r.confidence;
    if(currentHex)root.dataset.chatSignalsColor=currentHex;
    else delete root.dataset.chatSignalsColor;
    const prefix=!current?'':r.phase==='finished'&&r.read==='unread'?'🔔':EMOJI[r.phase]||'';
    const base=strip(document.title);
    const title=(prefix?prefix+' ':'')+base;
    if(document.title!==title)document.title=title;
  }
  function allocate(){
    const identity=current,nonce=++routeNonce;
    if(!identity)return;
    currentHex=color.choose(color.hash(identity.key));paintIdentity();publish();
    if(!globalThis.chrome?.runtime?.sendMessage)return;
    try{chrome.runtime.sendMessage({type:'chat-signals-register',key:color.hash(identity.key)},answer=>{
      if(nonce!==routeNonce||current?.key!==identity.key)return;
      if(!/^#[0-9a-f]{6}$/.test(answer?.hex||''))return;
      if(currentHex!==answer.hex){
        currentHex=answer.hex;paintIdentity();
        document.documentElement.dataset.chatSignalsColor=answer.hex;
      }
    });}catch{/* identity fallback is still deterministic */}
  }
  const STRUCTURAL='[data-message-author-role="assistant"],'+
    '[data-testid^="conversation-turn"],'+STOP+','+ACTION+','+
    '[role="alert"],[data-testid="conversation-error"],[data-testid="toast"]';
  function relevantChanges(records){
    // Streaming text children have no structural evidence. Inspect at most
    // 64 inserted/removed roots and 80 descendants per nontrivial root.
    let examined=0;
    for(const record of records){
      for(const nodes of [record.addedNodes,record.removedNodes]){
        for(const node of nodes){
          if(++examined>64)return true; // uncertain batch: one coalesced check
          if(node.nodeType!==1)continue;
          if(node.matches?.(STRUCTURAL))return true;
          if(!node.firstElementChild)continue;
          const walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT);
          let count=0,child;
          while((child=walker.nextNode())){
            if(++count>80)return true; // do not traverse huge inserted subtrees
            if(child.matches?.(STRUCTURAL))return true;
          }
        }
      }
    }
    return false;
  }
  function bindMain(main){
    if(main===observedMain)return;
    observer?.disconnect();observer=null;observedMain=main;
    if(!main)return;
    observer=new MutationObserver(records=>{
      if(relevantChanges(records))schedule();
    });
    observer.observe(main,{subtree:true,childList:true});
  }
  function reconcile(){
    queued=false;job=0;
    const next=color.identity(location.href);
    if(next?.key!==current?.key){
      current=next;currentHex=null;
      previousState=-1;tracker.reset(next?.key||null);
      if(!next){++routeNonce;paintIdentity();}
      else allocate();
    }
    bindMain(document.querySelector('main'));
    if(!current){publish();return;}
    tracker.observe(sample());publish();
  }
  function schedule(){
    if(queued)return;
    queued=true;
    const now=performance.now(),delay=Math.max(0,250-(now-lastProbe));
    job=setTimeout(()=>{lastProbe=performance.now();reconcile();},delay);
  }
  function onClick(event){
    if(event.target?.closest?.(STOP)){tracker.cancel();publish();}
    // Route changes occur in React without always firing popstate.
    schedule();
    if(clickSettleJob)clearTimeout(clickSettleJob);
    clickSettleJob=setTimeout(()=>{clickSettleJob=0;schedule();},350);
  }
  function onVisible(){if(!document.hidden){tracker.viewed();publish();}schedule();}
  function dispose(){
    observer?.disconnect();observer=null;
    if(job)clearTimeout(job);
    if(clickSettleJob)clearTimeout(clickSettleJob);
    document.removeEventListener('click',onClick,true);
    document.removeEventListener('visibilitychange',onVisible);
    window.removeEventListener('popstate',schedule);
    window.removeEventListener('pageshow',schedule);
    window.removeEventListener('pagehide',dispose);
    iconLink?.remove();
    if(globalThis.__chatSignalsOwner===owner)delete globalThis.__chatSignalsOwner;
  }
  document.addEventListener('click',onClick,true);
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('popstate',schedule);
  window.addEventListener('pageshow',schedule);
  window.addEventListener('pagehide',dispose,{once:true});
  schedule();
  // Bounded late hydration, never a recurring poll.
  setTimeout(schedule,800);setTimeout(schedule,2600);
})();
