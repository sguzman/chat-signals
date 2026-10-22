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
  async function register(tabId,key){
    const slots=await get();
    const previous=Object.values(slots).find(x=>x.key===key);
    const occupied=[...new Set(Object.values(slots).filter(x=>x.key!==key).map(x=>x.hex))];
    const hex=previous?.hex||colors.choose(key,occupied);
    slots[String(tabId)]={key,hex};
    await put(slots);
    return {hex};
  }
  chrome.runtime.onMessage.addListener((request,sender,reply)=>{
    const tabId=sender?.tab?.id;
    if(request?.type!=='chat-signals-register'||!Number.isInteger(tabId)||
       !/^[0-9a-f]{16}$/.test(request.key||''))return false;
    serialize(()=>register(tabId,request.key)).then(reply,()=>reply({hex:null}));
    return true;
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
