/* Chat Signals: observe current conversation UI; never read/store transcript bodies. */
(function(){
  'use strict';
  if(globalThis.__chatSignalsOwner)return;
  const color=globalThis.ChatSignalsColor,state=globalThis.ChatSignalsState;
  const queuePublisher=globalThis.ChatSignalsQueuePublisher;
  if(!color||!state)return;
  const owner={dispose};globalThis.__chatSignalsOwner=owner;
  const tracker=state.create();
  const eventAlerts=globalThis.ChatSignalsAlerts?.create();
  // Brief recoverable connection notices should not produce desktop alerts.
  const INTERRUPTION_GRACE_MS=5000;
  let interruptionGraceJob=0,pendingInterruption=null;
  // Random per-document nonce: no page URL, prompt, title or user data is sent.
  const documentToken=crypto.randomUUID().replace(/-/g,'');
  const tokens=new WeakMap();
  const originalFavicons=new Map();
  let iconImage=null,faviconRepairWindow=0,faviconRepairCount=0,
    faviconObserver=null,faviconRepairJob=0,faviconRetryJob=0;
  let tokenCount=0,current=null,currentHex=null,observer=null,observedMain=null,
    queued=false,job=0,fastQueued=false,disposed=false,stateReady=true,
    lastSavedState=-1,clickSettleJob=0,intentExpiryJob=0,lastIntentAt=-1000,routeNonce=0,iconLink=null,previousState=-1,lastProbe=0,
    titleObserver=null,watchedTitle=null,titleWriteCount=0,titleWriteWindow=0,
    queueSequence=0,lastQueuePublished=-1,queueRestoredEpoch=null;
  // Oct 2026 ChatGPT composer variant renders Stop as an unlabeled button
  // carrying this square path (distinct from voice/Send). Require the exact
  // glyph within the composer; do not use any generic button/spinner match.
  const STOP_GLYPH='M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z';
  const STOP='button[data-testid="stop-button"],button[data-testid="fruitjuice-stop-button"],'+
    'button[aria-label="Stop generating"],button[aria-label="Stop response"],'+
    'button[aria-label="Stop streaming"],'+
    'form[data-chatgpt-composer] button.size-token-button-composer:has(svg.icon-primary-action > path[d="'+STOP_GLYPH+'"]),'+
    'form:has(#prompt-textarea,[data-testid="prompt-textarea"]) button.size-token-button-composer:has(svg.icon-primary-action > path[d="'+STOP_GLYPH+'"])';
  const SEND='button[data-testid="send-button"],button[data-testid="composer-submit-button"],button[aria-label="Send prompt" i],button[aria-label="Send message" i],button[aria-label="Send" i],button[data-testid="regenerate-response-button"],button[data-testid="retry-button"]';
  const EDITOR='#prompt-textarea,[data-testid="prompt-textarea"],[contenteditable="true"][role="textbox"]';
  const ASSISTANT='[data-message-author-role="assistant"],[data-turn="assistant"],'+
    '[data-conversation-role="assistant"],[data-chatgpt-agent-turn-start]';
  const TURN='[data-testid^="conversation-turn"],[data-turn-key]';
  // Only explicit terminal Copy controls certify completion. Generic action
  // toolbars can contain feedback, speech, share or other buttons while a
  // reply is still being generated.
  const ACTION='button[aria-label="Copy" i],button[aria-label="Copy response" i],button[title="Copy" i],button[data-testid="copy-turn-action-button"],button[data-testid="copy-button"]';
  const EMOJI={idle:'⚪',unknown:'❔',submitted:'📤',generating:'⏳',verifying:'🔎',
    interrupted:'🔌',failed:'⚠️',limit:'🛑',finished:'✅'};
  const strip=s=>String(s||'').replace(/^(?:(?:⚪|📤|⏳|🔔|✅|🔌|⚠️|❌|🛑|🔎|❔)\s+)+/u,'');
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
    let checkedTurn=null;
    for(let i=0;i<768;i++){
      node=walker.currentNode;
      // A formatted reply may contain thousands of descendants. Identify
      // its enclosing turn from the trailing footer/action control rather
      // than walking all the way back to the inner assistant marker.
      const turn=node?.closest?.(TURN);
      if(turn&&turn!==checkedTurn&&main.contains(turn)){
        checkedTurn=turn;
        if(turn.querySelector(ASSISTANT))return turn;
        // A user-only turn is not an assistant. Skip its descendants.
        walker.currentNode=turn;
      }else if(node?.matches?.(ASSISTANT)){
        // Some site versions have no identifiable outer turn wrapper.
        return node.closest('article')||node;
      }
      if(!walker.previousNode())break;
    }
    return null;
  }
  const CONNECTION_INTERRUPTED=
    /^connection interrupted[.!]? waiting for the complete answer[.!]?$/i;
  // Exact, visible ChatGPT response-status text, never arbitrary red UI.
  const INPUT_STREAM_ERROR=/^error in input stream[.!]?$/i;
  const knownPlainNotice=text=>
    CONNECTION_INTERRUPTED.test(text)||INPUT_STREAM_ERROR.test(text);
  const STATUS_SELECTOR='[role="alert"],[role="status"],'+
    '[data-testid="conversation-error"],[data-testid="toast"]';
  function classifyNotice(text){
    const normalized=String(text||'').trim().toLowerCase().replace(/\s+/g,' ');
    if(/(?:maximum (?:conversation )?length|conversation is too long|reached its limit)/.test(normalized))
      return 'limit';
    if(/(?:could not load this chatgpt conversation|couldn't load this conversation)/.test(normalized))
      return 'conversation_load_failed';
    if(/(?:this response couldn.t load)/.test(normalized))return 'response_load_failed';
    if(CONNECTION_INTERRUPTED.test(normalized))return 'interrupted';
    if(INPUT_STREAM_ERROR.test(normalized))return 'input_stream_error';
    if(/^(?:network error|something went wrong|message delivery timed out|failed to generate response)[.!]?$/.test(normalized))
      return 'error';
    return null;
  }
  function safeBanner(node){
    return node?.nodeType===1&&node.isConnected&&
      !node.closest('[data-message-author-role],.markdown,.prose,[contenteditable="true"]')&&
      !node.closest('#prompt-textarea,[data-testid="prompt-textarea"]')&&
      node.childElementCount<=1;
  }
  function visibleNotice(){
    const nodes=document.querySelectorAll(STATUS_SELECTOR);
    for(let i=0;i<Math.min(nodes.length,24);i++){
      const node=nodes[i];
      if(!present(node)||node.closest('[data-message-author-role]'))continue;
      if(node.textContent.length>180)continue;
      const kind=classifyNotice(node.textContent);
      if(kind)return {kind,id:token(node)};
    }
    // Connection/stream-error banners may have no alert role or test id.
    // Inspect bounded small status leaves outside message bodies, matching
    // only the exact known phrases. No message content is persisted.
    const main=document.querySelector('main');
    if(!main)return null;
    const items=main.querySelectorAll('div,span,p');
    let inspected=0;
    for(let i=items.length-1;i>=0&&inspected<900;i--){
      const el=items[i];
      if(!safeBanner(el))continue;
      inspected++;
      if(!present(el))continue;
      const length=el.textContent.length;
      if(length<15||length>100)continue;
      const label=el.textContent.trim().replace(/\s+/g,' ');
      if(CONNECTION_INTERRUPTED.test(label))
        return {kind:'interrupted',id:token(el)};
      if(INPUT_STREAM_ERROR.test(label))
        return {kind:'input_stream_error',id:token(el)};
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
      // A completed reply's Copy button may be mounted but CSS-hidden
      // until the tab is focused/hovered. DOM ownership, not layout
      // visibility, establishes which reply owns the terminal action.
      actionToken:action?.isConnected?token(action):null,
      noticeKind:notice?.kind||null,noticeToken:notice?.id||null,hidden:document.hidden};
  }
  function drawIcon(hex,kind,alertKind=null){
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.clearRect(0,0,32,32);ctx.fillStyle=hex;
    if(kind==='project'){
      ctx.beginPath();ctx.arc(16,16,14,0,Math.PI*2);ctx.fill();
    }else{
      ctx.beginPath();ctx.roundRect(2,2,28,28,kind==='gpt'?10:5);ctx.fill();
    }
    if(alertKind){
      // Notification-only severity emblem. The chat's allocated color and
      // the tab favicon remain untouched, with identical silhouette.
      const mark=alertKind==='completion'?'check':
        alertKind==='failure'?'cross':
        alertKind==='interruption'||alertKind==='limit'?'warning':null;
      if(mark){
        ctx.beginPath();
        ctx.arc(24,24,7.5,0,Math.PI*2);
        ctx.fillStyle='#ffffff';ctx.fill();
        ctx.lineWidth=1.2;ctx.strokeStyle='#25303c';ctx.stroke();
        ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
        ctx.strokeStyle='#25303c';ctx.fillStyle='#25303c';
        if(mark==='check'){
          ctx.beginPath();ctx.moveTo(20.5,24.2);
          ctx.lineTo(23,26.5);ctx.lineTo(27.5,21.4);ctx.stroke();
        }else if(mark==='cross'){
          ctx.beginPath();ctx.moveTo(21.5,21.5);ctx.lineTo(26.5,26.5);
          ctx.moveTo(26.5,21.5);ctx.lineTo(21.5,26.5);ctx.stroke();
        }else{
          ctx.beginPath();ctx.moveTo(24,20.5);ctx.lineTo(24,24.5);ctx.stroke();
          ctx.beginPath();ctx.arc(24,27,1,0,Math.PI*2);ctx.fill();
        }
      }
    }
    return canvas.toDataURL('image/png');
  }
  function restoreFavicons(){
    for(const [link,saved] of originalFavicons){
      // Respect a site update made after our write rather than overwriting it.
      if(!link.isConnected||link.getAttribute('href')!==saved.written)continue;
      for(const name of ['href','type','sizes']){
        if(saved[name]===null)link.removeAttribute(name);
        else link.setAttribute(name,saved[name]);
      }
    }
    originalFavicons.clear();
    iconLink?.remove();iconLink=null;iconImage=null;
  }
  function paintIdentity(){
    if(!current||!currentHex){restoreFavicons();return;}
    const png=drawIcon(currentHex,current.kind);if(!png)return;
    iconImage=png;
    // A second favicon link alone may lose to the site's links in Firefox.
    // Keep existing icon candidates consistent, without watching document.head.
    for(const link of document.querySelectorAll('link[rel~="icon"]')){
      if(link===iconLink)continue;
      let saved=originalFavicons.get(link);
      if(!saved){
        saved={href:link.getAttribute('href'),type:link.getAttribute('type'),
          sizes:link.getAttribute('sizes'),written:null};
        originalFavicons.set(link,saved);
      }
      if(link.getAttribute('href')!==png)link.setAttribute('href',png);
      if(link.getAttribute('type')!=='image/png')link.setAttribute('type','image/png');
      if(link.hasAttribute('sizes'))link.removeAttribute('sizes');
      saved.written=png;
    }
    if(!iconLink?.isConnected){
      iconLink=document.createElement('link');iconLink.rel='icon';iconLink.type='image/png';
      iconLink.dataset.chatSignalsIcon='1';document.head.append(iconLink);
    }
    if(iconLink.href!==png)iconLink.href=png;
  }
  // ChatGPT can replace favicon links without touching the conversation
  // title or response state. Repair that independent presentation channel.
  // Observe only head link changes; never inspect page text or response DOM.
  function onFaviconMutation(records){
    if(!current||!iconImage)return;
    const iconLinkChanged=node=>node?.nodeType===1&&(
      (node.localName==='link'&&
        (node.relList?.contains('icon')||node===iconLink||
         originalFavicons.has(node)))||
      Boolean(node.querySelector?.('link[rel~="icon"]')));
    for(const record of records){
      if(record.type==='attributes'){
        if(!iconLinkChanged(record.target))continue;
      }else if(![...record.addedNodes,...record.removedNodes].some(iconLinkChanged)){
        continue;
      }
      if(faviconRepairJob)return;
      faviconRepairJob=setTimeout(()=>{
        faviconRepairJob=0;maintainFavicon();
      },100); // coalesce a batch of site favicon changes
      return;
    }
  }
  function watchFavicons(){
    if(faviconObserver||!document.head)return;
    faviconObserver=new MutationObserver(onFaviconMutation);
    faviconObserver.observe(document.head,{
      attributes:true,attributeFilter:['href','rel','type','sizes'],
      childList:true,subtree:true
    });
  }
  // The alert icon is generated independently, so a colored notification
  // does not guarantee that ChatGPT's current tab favicon still matches it.
  function maintainFavicon(){
    if(!current||!currentHex||!iconImage)return;
    const links=document.querySelectorAll('link[rel~="icon"]');
    let drift=!iconLink?.isConnected||!links.length;
    for(const link of links){
      if(link.getAttribute('href')!==iconImage||
         link.getAttribute('type')!=='image/png'||link.hasAttribute('sizes')){
        drift=true;break;
      }
    }
    if(!drift)return;
    const now=performance.now();
    if(now-faviconRepairWindow>=60000){
      faviconRepairWindow=now;faviconRepairCount=0;
    }
    if(faviconRepairCount>=12){
      // A very active site can exhaust the repair budget. Retry once the
      // minute rolls over instead of leaving this tab uncolored indefinitely.
      if(!faviconRetryJob)faviconRetryJob=setTimeout(()=>{
        faviconRetryJob=0;maintainFavicon();
      },Math.max(100,60000-(now-faviconRepairWindow)));
      return;
    }
    faviconRepairCount++;
    paintIdentity();
  }
  // Only observe the existing <title> node, never document.head.
  // A content-title write produces one callback which immediately exits once
  // the desired prefix is present. The write budget bounds page/extension
  // contention without creating a self-sustaining repair loop.
  function stopWatchingTitle(){
    titleObserver?.disconnect();titleObserver=null;watchedTitle=null;
  }
  function maintainTitle(){
    maintainFavicon();
    const r=tracker.snapshot();
    const prefix=!current?'':r.phase==='finished'&&r.read==='unread'?'🔔':EMOJI[r.phase]||'';
    if(!prefix){stopWatchingTitle();return;}
    const node=document.head?.querySelector('title');
    if(node!==watchedTitle){
      stopWatchingTitle();
      if(node){
        watchedTitle=node;
        titleObserver=new MutationObserver(maintainTitle);
        titleObserver.observe(node,{childList:true,characterData:true,subtree:true});
      }
    }
    const desired=prefix+' '+strip(document.title);
    if(document.title===desired)return;
    const now=performance.now();
    if(now-titleWriteWindow>=60000){titleWriteWindow=now;titleWriteCount=0;}
    if(titleWriteCount>=12)return; // fail quiet under pathological site churn
    titleWriteCount++;
    document.title=desired;
  }
  function publish(){
    // A visibility event can precede registration. Do not briefly overwrite
    // the previous title with the reset-to-idle placeholder.
    if(current&&!stateReady)return;
    const r=tracker.snapshot();
    if(r.changed!==previousState){
      previousState=r.changed;
      const root=document.documentElement;
      root.dataset.chatSignalsState=r.phase;
      root.dataset.chatSignalsRead=r.read;
      root.dataset.chatSignalsReason=r.reason;
      root.dataset.chatSignalsConfidence=r.confidence;
      if(currentHex)root.dataset.chatSignalsColor=currentHex;
      else delete root.dataset.chatSignalsColor;
    }
    // Save only state transitions, not streaming text or transcript content.
    // Do not overwrite a prior snapshot with the initial idle placeholder
    // before the registration response has restored it.
    if(current&&stateReady&&r.changed!==lastSavedState){
      lastSavedState=r.changed;
      if(globalThis.chrome?.runtime?.sendMessage){
        try{chrome.runtime.sendMessage({type:'chat-signals-state',
          key:color.hash(current.key),documentToken,
          state:{phase:r.phase,read:r.read,epoch:r.epoch}},
          ()=>void chrome.runtime.lastError);}catch{/* local state remains valid */}
      }
    }
    // Only the current local tracker can publish versioned metadata. No
    // transcript, draft, title, page-supplied phase or query string is sent.
    if(current&&stateReady&&r.changed!==lastQueuePublished&&queuePublisher&&
       color.identity(location.href)?.key===current.key){
      const wire=queuePublisher.map(r,{route:location.pathname,documentToken,
        sequence:queueSequence+1,restoredEpoch:queueRestoredEpoch});
      if(wire){
        queueSequence++;lastQueuePublished=r.changed;
        try{chrome.runtime.sendMessage({type:queuePublisher.INTERNAL,
          key:color.hash(current.key),documentToken,signal:wire},
          ()=>void chrome.runtime.lastError);}
        catch{/* absent Queue cannot break Chat Signals */}
      }
    }
    // ChatGPT may rewrite its own title without changing the response state.
    // Re-check the prefix independently of the evidence/state revision.
    maintainTitle();
  }
  function allocate(){
    const identity=current,nonce=++routeNonce;
    if(!identity)return;
    const key=color.hash(identity.key);
    const applyHex=hex=>{
      if(nonce!==routeNonce||current?.key!==identity.key)return;
      if(currentHex===hex)return;
      currentHex=hex;paintIdentity();
      document.documentElement.dataset.chatSignalsColor=hex;
    };
    function ready(saved){
      if(stateReady||nonce!==routeNonce||current?.key!==identity.key||disposed)return;
      stateReady=true;
      const live=sample();
      // Fresh on-page Stop or explicit error is stronger than a previous
      // session snapshot. It will be read by the immediate reconciliation.
      if(saved&&!live.stop&&!live.noticeKind){
        tracker.restore(saved,live);
        const hydrated=tracker.snapshot();
        if(hydrated.reason.startsWith('restored-'))
          queueRestoredEpoch=hydrated.epoch;
      }
      if(!document.hidden)tracker.viewed();
      reconcile();
    }
    // Do not paint a provisional hash swatch first: the background allocator
    // may return a different, persisted color and cause a visible color jump.
    // A deterministic fallback is used only if background registration fails.
    if(!globalThis.chrome?.runtime?.sendMessage){
      applyHex(color.choose(key));ready(null);return;
    }
    try{chrome.runtime.sendMessage({type:'chat-signals-register',
      key,documentToken},answer=>{
      if(nonce!==routeNonce||current?.key!==identity.key||disposed)return;
      if(/^#[0-9a-f]{6}$/.test(answer?.hex||''))
        applyHex(answer.hex);
      else applyHex(color.choose(key));
      ready(answer?.restored);
    });}catch{applyHex(color.choose(key));ready(null);}
  }
  const STRUCTURAL=ASSISTANT+','+
    '[data-testid^="conversation-turn"],'+STOP+','+SEND+','+ACTION+','+
    STATUS_SELECTOR;
  function relevantChanges(records){
    // Stop/Send may swap their SVG glyph in-place, with no child insertion.
    // Watch only narrow control attributes in the current composer.
    for(const record of records){
      if(record.type!=='attributes')continue;
      const node=record.target;
      if((node.localName==='path'||node.localName==='button'||node.localName==='svg')&&
         node.closest?.('form')?.querySelector(EDITOR))return true;
    }
    // Streaming text children have no structural evidence. Inspect at most
    // 64 inserted/removed roots and 80 descendants per nontrivial root.
    let examined=0;
    for(const record of records){
      for(const nodes of [record.addedNodes,record.removedNodes]){
        for(const node of nodes){
          if(++examined>64)return true; // uncertain batch: one coalesced check
          if(node.nodeType===3){
            // Detect a status inserted as plain text without scanning
            // arbitrary streamed response text.
            if(safeBanner(node.parentElement)&&
               knownPlainNotice(node.textContent.trim()))return true;
            continue;
          }
          if(node.nodeType!==1)continue;
          if(safeBanner(node)&&node.textContent.length<=100&&
             knownPlainNotice(node.textContent.trim()))return true;
          if(node.matches?.(STRUCTURAL))return true;
          if(!node.firstElementChild)continue;
          const walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT);
          let count=0,child;
          while((child=walker.nextNode())){
            if(++count>80)return true; // do not traverse huge inserted subtrees
            if(safeBanner(child)&&child.textContent.length<=100&&
               knownPlainNotice(child.textContent.trim()))return true;
            if(child.matches?.(STRUCTURAL))return true;
          }
        }
      }
    }
    return false;
  }
  function isComposerControlTarget(node){
    if(node?.nodeType!==1)return false;
    const form=node.closest?.('form');
    return Boolean(form?.querySelector(EDITOR)&&
      !node.closest(EDITOR));
  }
  function isReplyActionArea(node){
    if(node?.nodeType!==1)return false;
    // Watch only controls/footers outside reply text. A message-body
    // mutation, even in a very long response, is not completion evidence.
    return Boolean(node.closest?.(TURN)&&
      !node.closest('[data-message-author-role],.markdown,.prose,[contenteditable="true"]'));
  }
  function terminalChanges(records){
    const phase=tracker.snapshot().phase;
    if(!['submitted','generating','verifying','interrupted'].includes(phase))
      return false;
    for(const record of records){
      const target=record.target;
      if(record.type==='childList'){
        // Removed Stop controls no longer match composer-scoped :has()
        // selectors after detachment. The still-connected parent does.
        if(isComposerControlTarget(target)||isReplyActionArea(target))
          return true;
        // Some layouts put the Copy button inside the assistant article.
        if(target.nodeType===1&&target.closest?.(ASSISTANT)&&
           [...record.addedNodes,...record.removedNodes].some(node=>
             node.nodeType===1&&
             (node.matches?.(ACTION)||node.querySelector?.(ACTION))))
          return true;
      }else if(record.type==='attributes'&&target.nodeType===1){
        if(isComposerControlTarget(target)&&
           ['button','svg','path'].includes(target.localName))return true;
        // Copy can be enabled or relabeled in place without adding nodes.
        if((isReplyActionArea(target)||target.closest?.(ASSISTANT))&&
           (target.localName==='button'||target.getAttribute?.('role')==='button'))
          return true;
      }
    }
    return false;
  }
  function scheduleTerminal(){
    // DOM mutations themselves are delivered as microtasks. A browser may
    // heavily throttle hidden-tab setTimeout callbacks; don't put terminal
    // state recognition behind the ordinary 250ms timer.
    if(fastQueued||disposed)return;
    fastQueued=true;
    queueMicrotask(()=>{
      fastQueued=false;
      if(disposed)return;
      if(job)clearTimeout(job);
      queued=false;job=0;
      lastProbe=performance.now();
      reconcile();
    });
  }
  function bindMain(main){
    if(main===observedMain)return;
    observer?.disconnect();observer=null;observedMain=main;
    if(!main)return;
    observer=new MutationObserver(records=>{
      if(terminalChanges(records)){
        scheduleTerminal();
        return;
      }
      // Plain-text status banners have no semantic selector. A removal of an
      // interruption must be observed so recovery can leave 🔌 promptly.
      if((tracker.snapshot().phase==='interrupted'&&
          records.some(record=>record.removedNodes.length>0))||
         relevantChanges(records))schedule();
    });
    observer.observe(main,{subtree:true,childList:true,attributes:true,
      attributeFilter:['d','aria-label','data-testid','title','class','style',
        'hidden','disabled','aria-hidden']});
  }
  function cancelInterruptionGrace(){
    if(interruptionGraceJob)clearTimeout(interruptionGraceJob);
    interruptionGraceJob=0;pendingInterruption=null;
  }
  function deliverEvent(event,next){
    // Read/unread changes and routine transitions never create an event.
    const chime=globalThis.ChatSignalsChime;
    if(chime?.play)void chime.play(event.sound).then(outcome=>{
      document.documentElement.dataset.chatSignalsSound=outcome;
    },()=>{document.documentElement.dataset.chatSignalsSound='blocked';});
    if(globalThis.chrome?.runtime?.sendMessage){
      try{
        chrome.runtime.sendMessage({type:'chat-signals-event',
          event:event.kind,key:color.hash(current.key),
          documentToken,epoch:next.epoch,
          iconUrl:currentHex?drawIcon(currentHex,current.kind,event.kind):null},answer=>{
          document.documentElement.dataset.chatSignalsNotification=
            answer?.created?'requested':'unavailable';
        });
      }catch{
        document.documentElement.dataset.chatSignalsNotification='unavailable';
      }
    }
  }
  function emitEvent(previous,next){
    if(!current||!eventAlerts)return;
    // A temporary connection blip is observable (🔌) but not yet alertable.
    // Re-read the current status before delivering a warning.
    if(pendingInterruption&&
       (next.phase!=='interrupted'||next.epoch!==pendingInterruption.next.epoch||
        current.key!==pendingInterruption.key))
      cancelInterruptionGrace();
    if(next.phase==='interrupted'&&previous.phase!=='interrupted'&&next.epoch>0){
      if(pendingInterruption)return;
      pendingInterruption={key:current.key,previous,next};
      interruptionGraceJob=setTimeout(()=>{
        interruptionGraceJob=0;
        const pending=pendingInterruption;
        pendingInterruption=null;
        if(!pending||current?.key!==pending.key)return;
        const live=tracker.snapshot();
        if(live.phase!=='interrupted'||live.epoch!==pending.next.epoch)return;
        if(sample().noticeKind!=='interrupted'){schedule();return;}
        const event=eventAlerts.transition(pending.previous,live);
        if(event)deliverEvent(event,live);
      },INTERRUPTION_GRACE_MS);
      return;
    }
    const event=eventAlerts.transition(previous,next);
    if(event&&event.kind!=='interruption')deliverEvent(event,next);
  }
  function reconcile(){
    queued=false;job=0;
    const next=color.identity(location.href);
    if(next?.key!==current?.key){
      cancelInterruptionGrace();
      current=next;currentHex=null;
      eventAlerts?.reset(next?.key||null);
      previousState=-1;lastSavedState=-1;lastQueuePublished=-1;
      queueRestoredEpoch=null;
      stateReady=!next;
      tracker.reset(next?.key||null);
      if(!next){++routeNonce;paintIdentity();}
      else allocate();
    }
    bindMain(document.querySelector('main'));
    if(!current){publish();return;}
    if(!stateReady)return; // no idle flicker or storage overwrite on reload
    const previous=tracker.snapshot();
    tracker.observe(sample());
    emitEvent(previous,tracker.snapshot());
    publish();
  }
  function schedule(){
    if(queued)return;
    queued=true;
    const now=performance.now(),delay=Math.max(0,250-(now-lastProbe));
    job=setTimeout(()=>{lastProbe=performance.now();reconcile();},delay);
  }
  function noteSubmit(){
    if(!current)return;
    const now=performance.now();
    if(now-lastIntentAt<350)return;
    lastIntentAt=now;
    // A fresh user submission supersedes an older snapshot even when the
    // background registration has not answered yet.
    stateReady=true;
    // Run in the user's Send gesture; Firefox requires prior activation
    // before background Web Audio may be permitted.
    if(globalThis.ChatSignalsChime?.unlock)
      void globalThis.ChatSignalsChime.unlock();
    tracker.intent(sample());publish();
    if(intentExpiryJob)clearTimeout(intentExpiryJob);
    intentExpiryJob=setTimeout(()=>{
      intentExpiryJob=0;tracker.expireIntent();publish();
    },9000);
    schedule();
  }
  function onSubmit(event){
    // Recognize composer submission without reading private draft text.
    const form=event.target;
    if(form?.matches?.('form')&&form.querySelector(EDITOR))noteSubmit();
  }
  function onKeydown(event){
    if(event.key!=='Enter'||event.shiftKey||event.altKey||event.metaKey||
       event.isComposing||event.repeat||event.defaultPrevented)return;
    if(event.target?.closest?.(EDITOR))noteSubmit();
  }
  function onClick(event){
    if(event.target?.closest?.(STOP)){tracker.cancel();publish();}
    const button=event.target?.closest?.(SEND);
    if(button&&!button.matches(':disabled,[aria-disabled="true"]'))noteSubmit();
    // Route changes occur in React without always firing popstate.
    schedule();
    if(clickSettleJob)clearTimeout(clickSettleJob);
    clickSettleJob=setTimeout(()=>{clickSettleJob=0;schedule();},350);
  }
  // The Queue background may register after the first idle publication.
  // A browser-attested, provider-background-only one-shot request causes a
  // fresh source observation, not a replay of a historical terminal event.
  function onQueueSync(request,sender,reply){
    if(request?.type!=='chat-signals-queue-sync/v1')return false;
    if(sender?.id!==globalThis.chrome?.runtime?.id||!stateReady||disposed||!current||
       request.route!==location.pathname||
       color.identity(location.href)?.key!==current.key)return false;
    lastQueuePublished=-1; // the next reconcile republishes the current epoch
    schedule();
    reply({queued:true});
    return false;
  }
  function onVisible(){if(!document.hidden){tracker.viewed();publish();}schedule();}
  function dispose(){
    disposed=true;
    cancelInterruptionGrace();
    observer?.disconnect();observer=null;
    faviconObserver?.disconnect();faviconObserver=null;
    if(faviconRepairJob)clearTimeout(faviconRepairJob);
    if(faviconRetryJob)clearTimeout(faviconRetryJob);
    faviconRepairJob=0;faviconRetryJob=0;
    stopWatchingTitle();
    if(current && /^(?:⚪|📤|⏳|🔔|✅|🔌|⚠️|🛑|🔎|❔)\\s+/u.test(document.title))
      document.title=strip(document.title);
    if(job)clearTimeout(job);
    if(clickSettleJob)clearTimeout(clickSettleJob);
    if(intentExpiryJob)clearTimeout(intentExpiryJob);
    globalThis.chrome?.runtime?.onMessage?.removeListener?.(onQueueSync);
    document.removeEventListener('submit',onSubmit,true);
    document.removeEventListener('keydown',onKeydown,true);
    document.removeEventListener('click',onClick,true);
    document.removeEventListener('visibilitychange',onVisible);
    window.removeEventListener('popstate',schedule);
    window.removeEventListener('pageshow',schedule);
    window.removeEventListener('pagehide',dispose);
    restoreFavicons();
    if(globalThis.__chatSignalsOwner===owner)delete globalThis.__chatSignalsOwner;
  }
  watchFavicons();
  globalThis.chrome?.runtime?.onMessage?.addListener?.(onQueueSync);
  document.addEventListener('submit',onSubmit,true);
  document.addEventListener('keydown',onKeydown,true);
  document.addEventListener('click',onClick,true);
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('popstate',schedule);
  window.addEventListener('pageshow',schedule);
  window.addEventListener('pagehide',dispose,{once:true});
  schedule();
  // Bounded late hydration, never a recurring poll.
  setTimeout(schedule,800);setTimeout(schedule,2600);
})();
