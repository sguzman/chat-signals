/* One tab registration at a time; no install-time tab scan or injection. */
(function(root){
  'use strict';
  if(!root.ChatSignalsColor&&typeof importScripts==='function')
    importScripts('color.js');
  const colors=root.ChatSignalsColor;
  const KEY='chatSignalsSessionAllocationsV1';
  const COLOR_LEDGER_KEY='chatSignalsColorLedgerV1';
  const STATE_LEDGER_KEY='chatSignalsStateLedgerV1';
  const STATE_TTL_MS=14*24*60*60*1000;
  const MAX_REMEMBERED_STATES=512;
  const PHASES=new Set(['idle','submitted','generating','verifying',
    'finished','interrupted','failed','limit','unknown']);
  // Remember recently used conversation colors across browser/extension restarts.
  // The entries contain only hashed identities and palette swatches.
  const MAX_REMEMBERED_COLORS=2048;
  const EVENT_INFO=Object.freeze({
    completion:Object.freeze({category:'Success',message:'Response finished.'}),
    interruption:Object.freeze({category:'Warning',message:'Connection interrupted.'}),
    failure:Object.freeze({category:'Error',message:'A response or conversation failed.'}),
    limit:Object.freeze({category:'Warning',message:'Conversation length limit reached.'})
  });
  let chain=Promise.resolve(),fallback={};
  const area=chrome.storage?.session;
  function get(){
    if(!area)return Promise.resolve(fallback);
    return new Promise(resolve=>area.get(KEY,data=>{
      if(chrome.runtime.lastError){resolve(fallback);return;}
      resolve(data?.[KEY]||{});
    }));
  }
  function put(data){
    fallback=data;
    if(!area)return Promise.resolve();
    return new Promise(resolve=>area.set({[KEY]:data},()=>resolve()));
  }
  const persistentArea=chrome.storage?.local;
  function getColorLedger(){
    if(!persistentArea)return Promise.resolve({});
    return new Promise(resolve=>persistentArea.get(COLOR_LEDGER_KEY,data=>{
      if(chrome.runtime.lastError){resolve({});return;}
      const ledger=data?.[COLOR_LEDGER_KEY];
      resolve(ledger&&typeof ledger==='object'&&!Array.isArray(ledger)?ledger:{});
    }));
  }
  function putColorLedger(ledger){
    if(!persistentArea)return Promise.resolve();
    return new Promise(resolve=>persistentArea.set({[COLOR_LEDGER_KEY]:ledger},()=>{
      resolve();
    }));
  }
  function getStateLedger(){
    if(!persistentArea)return Promise.resolve({});
    return new Promise(resolve=>persistentArea.get(STATE_LEDGER_KEY,data=>{
      if(chrome.runtime.lastError){resolve({});return;}
      const ledger=data?.[STATE_LEDGER_KEY];
      resolve(ledger&&typeof ledger==='object'&&!Array.isArray(ledger)?ledger:{});
    }));
  }
  function putStateLedger(ledger){
    if(!persistentArea)return Promise.resolve();
    return new Promise(resolve=>persistentArea.set({[STATE_LEDGER_KEY]:ledger},()=>resolve()));
  }
  function validState(value){
    return value&&typeof value==='object'&&PHASES.has(value.phase)&&
      (value.read==='unread'||value.read==='viewed')&&
      Number.isSafeInteger(value.epoch)&&value.epoch>=0;
  }
  function serialize(work){
    const next=chain.then(work,work);chain=next.catch(()=>{});
    return next;
  }
  async function register(tabId,key,documentToken){
    const slots=await get();
    const ledger=await getColorLedger();
    const previous=Object.values(slots).find(x=>x.key===key);
    const occupied=[...new Set(Object.values(slots).filter(x=>x.key!==key).map(x=>x.hex))];
    const saved=ledger[key];
    const remembered=colors.palette.some(x=>x.hex===saved)?saved:null;
    const hex=remembered||
      (colors.palette.some(x=>x.hex===previous?.hex)?previous.hex:null)||
      colors.choose(key,occupied);
    // First assignment prioritizes colors apart from active chats; once
    // chosen, a given conversation keeps its swatch across reloads.
    // Bounded storage evicts the oldest identities only when full.
    if(ledger[key]!==hex){
      delete ledger[key];
      ledger[key]=hex;
      while(Object.keys(ledger).length>MAX_REMEMBERED_COLORS)
        delete ledger[Object.keys(ledger)[0]];
      await putColorLedger(ledger);
    }
    const prior=slots[String(tabId)];
    const stored=(await getStateLedger())[String(tabId)];
    const recent=stored?.key===key&&validState(stored.state)&&
      Number.isFinite(stored.at)&&stored.at<=Date.now()&&
      Date.now()-stored.at<STATE_TTL_MS;
    const restored=recent?stored.state:null;
    const sameDocument=prior?.key===key&&prior.documentToken===documentToken;
    const delivered=sameDocument?prior.delivered||0:0;
    const deliveredEvents=sameDocument?prior.deliveredEvents||{}:{};
    slots[String(tabId)]={key,hex,documentToken,delivered,deliveredEvents};
    await put(slots);
    return {hex,restored};
  }
  async function saveState(tabId,key,documentToken,state){
    const slots=await get(),slot=slots[String(tabId)];
    if(!slot||slot.key!==key||slot.documentToken!==documentToken)
      return {saved:false};
    if(!validState(state))return {saved:false};
    const ledger=await getStateLedger(),now=Date.now();
    ledger[String(tabId)]={key,at:now,
      state:{phase:state.phase,read:state.read,epoch:state.epoch}};
    // A bounded last-known-state ledger. It never stores URLs, titles,
    // response text or weak DOM tokens.
    for(const [id,entry] of Object.entries(ledger))
      if(!entry||!Number.isFinite(entry.at)||entry.at>now||
         now-entry.at>=STATE_TTL_MS)delete ledger[id];
    while(Object.keys(ledger).length>MAX_REMEMBERED_STATES){
      const oldest=Object.keys(ledger).reduce((a,b)=>
        ledger[a].at<=ledger[b].at?a:b);
      delete ledger[oldest];
    }
    await putStateLedger(ledger);
    return {saved:true};
  }
  function notify(tabId,key,documentToken,epoch,kind,iconUrl){
    return serialize(async()=>{
      const slots=await get(),slot=slots[String(tabId)];
      const detail=EVENT_INFO[kind];
      if(!slot||!detail||slot.key!==key||slot.documentToken!==documentToken)
        return {created:false,reason:'not-current'};
      const notified=slot.deliveredEvents||{};
      if((notified[kind]||0)>=epoch||
         (kind==='completion'&&(slot.delivered||0)>=epoch))
        return {created:false,reason:'duplicate'};
      // Commit the one-shot notification before invoking OS delivery; a
      // background page suspension must not replay a completed response.
      notified[kind]=epoch;
      slot.deliveredEvents=notified;
      if(kind==='completion')slot.delivered=epoch; // old lifecycle ledger compatibility
      await put(slots);
      if(!chrome.notifications?.create)return {created:false,reason:'unavailable'};
      const icon=/^data:image\/png;base64,[A-Za-z0-9+/=]{40,8192}$/.test(iconUrl||'')?
        iconUrl:chrome.runtime.getURL('icons/completion.png');
      const options={type:'basic',title:'Chat Signals - '+detail.category,
        message:detail.message,iconUrl:icon,isClickable:true};
      return new Promise(resolve=>{
        try{
          chrome.notifications.create('chat-signals-tab-'+tabId,options,()=>{
            resolve({created:!chrome.runtime.lastError});
          });
        }catch{resolve({created:false,reason:'rejected'});}
      });
    });
  }
  chrome.runtime.onMessage.addListener((request,sender,reply)=>{
    const tabId=sender?.tab?.id;
    if(!Number.isInteger(tabId)||
       !/^https:\/\/chatgpt\.com\//.test(sender.url||sender.tab.url||'')||
       !/^[0-9a-f]{16}$/.test(request?.key||'')||
       !/^[0-9a-f]{32}$/.test(request?.documentToken||''))return false;
    if(request.type==='chat-signals-register'){
      serialize(()=>register(tabId,request.key,request.documentToken))
        .then(reply,()=>reply({hex:null}));
      return true;
    }
    if(request.type==='chat-signals-state'){
      serialize(()=>saveState(tabId,request.key,request.documentToken,request.state))
        .then(reply,()=>reply({saved:false}));
      return true;
    }
    const kind=request.type==='chat-signals-complete'?'completion':
      request.type==='chat-signals-event'?request.event:null;
    if(EVENT_INFO[kind]&&Number.isSafeInteger(request.epoch)&&request.epoch>=1){
      notify(tabId,request.key,request.documentToken,request.epoch,kind,request.iconUrl)
        .then(reply,()=>reply({created:false,reason:'error'}));
      return true;
    }
    return false;
  });
  // Dispatch activation directly from the click event. Waiting on the
  // storage serialization chain can outlive Wayland's user-activation token.
  // Extension notification IDs are private to this extension and contain
  // only the originating tab ID. Never open a new tab or touch chat content.
  chrome.notifications?.onClicked?.addListener(notificationId=>{
    const match=/^chat-signals-tab-(\d+)$/.exec(notificationId);
    if(!match)return;
    const tabId=Number(match[1]);
    if(!Number.isSafeInteger(tabId)||
       !chrome.tabs?.get||!chrome.tabs?.update||!chrome.windows?.update)return;
    chrome.tabs.get(tabId,tab=>{
      if(chrome.runtime.lastError||!tab||!Number.isInteger(tab.windowId))return;
      // Ignore a tab that has since navigated away from the conversation.
      if(typeof tab.url==='string'&&!/^https:\/\/chatgpt\.com\//.test(tab.url))return;
      // Schedule both requests together: no storage reads or awaited callbacks
      // between the notification click and window activation.
      chrome.tabs.update(tabId,{active:true},()=>void chrome.runtime.lastError);
      chrome.windows.update(tab.windowId,{focused:true},()=>void chrome.runtime.lastError);
    });
  });
  chrome.tabs.onRemoved.addListener(tabId=>{
    serialize(async()=>{
      const slots=await get();
      if(Object.prototype.hasOwnProperty.call(slots,String(tabId))){
        delete slots[String(tabId)];
        await put(slots);
      }
      const ledger=await getStateLedger();
      if(Object.prototype.hasOwnProperty.call(ledger,String(tabId))){
        delete ledger[String(tabId)];
        await putStateLedger(ledger);
      }
    }).catch(()=>{});
  });
})(typeof globalThis!=='undefined'?globalThis:this);
