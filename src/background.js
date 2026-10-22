/* One tab registration at a time; no install-time tab scan or injection. */
(function(root){
  'use strict';
  if(!root.ChatSignalsColor&&typeof importScripts==='function')
    importScripts('color.js');
  const colors=root.ChatSignalsColor;
  const KEY='chatSignalsSessionAllocationsV1';
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
  function serialize(work){
    const next=chain.then(work,work);chain=next.catch(()=>{});
    return next;
  }
  async function register(tabId,key,documentToken){
    const slots=await get();
    const previous=Object.values(slots).find(x=>x.key===key);
    const occupied=[...new Set(Object.values(slots).filter(x=>x.key!==key).map(x=>x.hex))];
    const hex=previous?.hex||colors.choose(key,occupied);
    const prior=slots[String(tabId)];
    const delivered=prior?.key===key&&prior.documentToken===documentToken?
      prior.delivered||0:0;
    slots[String(tabId)]={key,hex,documentToken,delivered};
    await put(slots);
    return {hex};
  }
  function notify(tabId,key,documentToken,epoch,iconUrl){
    return serialize(async()=>{
      const slots=await get(),slot=slots[String(tabId)];
      if(!slot||slot.key!==key||slot.documentToken!==documentToken||
         slot.delivered>=epoch)return {created:false,reason:'not-current'};
      // Commit the one-shot notification before invoking OS delivery; a
      // background page suspension must not replay a completed response.
      slot.delivered=epoch;
      await put(slots);
      if(!chrome.notifications?.create)return {created:false,reason:'unavailable'};
      const icon=/^data:image\/png;base64,[A-Za-z0-9+/=]{40,8192}$/.test(iconUrl||'')?
        iconUrl:chrome.runtime.getURL('icons/completion.png');
      const options={type:'basic',title:'Chat Signals',
        message:'Response finished.',iconUrl:icon};
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
    if(request.type==='chat-signals-complete'&&
       Number.isSafeInteger(request.epoch)&&request.epoch>=1){
      notify(tabId,request.key,request.documentToken,request.epoch,request.iconUrl)
        .then(reply,()=>reply({created:false,reason:'error'}));
      return true;
    }
    return false;
  });
  chrome.tabs.onRemoved.addListener(tabId=>{
    serialize(async()=>{
      const slots=await get();
      if(!Object.prototype.hasOwnProperty.call(slots,String(tabId)))return;
      delete slots[String(tabId)];
      await put(slots);
    }).catch(()=>{});
  });
})(typeof globalThis!=='undefined'?globalThis:this);
