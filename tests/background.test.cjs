const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const color=require('../src/color.js');

function start(persistentStorage={}){
  let message,removed,clicked,session={},notifications=[],activations=[];
  let tabWindows=new Map(),tabUrls=new Map();
  const nonce='0123456789abcdef0123456789abcdef';
  const chrome={
    runtime:{lastError:null,getURL:p=>'moz-extension://synthetic/'+p,
      onMessage:{addListener:fn=>{message=fn;}}},
    tabs:{
      onRemoved:{addListener:fn=>{removed=fn;}},
      get:(id,callback)=>callback(tabWindows.has(id)?
        {id,windowId:tabWindows.get(id),
          url:tabUrls.get(id)||'https://chatgpt.com/c/synthetic-chat'}:undefined),
      update:(id,options,callback)=>{
        activations.push({kind:'tab',id,options});callback();
      }
    },
    windows:{update:(id,options,callback)=>{
      activations.push({kind:'window',id,options});callback();
    }},
    notifications:{
      onClicked:{addListener:fn=>{clicked=fn;}},
      create:(id,options,cb)=>{
        notifications.push({id,options});cb(id);
      }
    },
    storage:{
      session:{
        get:(_key,callback)=>callback({...session}),
        set:(value,callback)=>{session={...session,...value};callback();}
      },
      local:{
        get:(_key,callback)=>callback({...persistentStorage}),
        set:(value,callback)=>{Object.assign(persistentStorage,value);callback();}
      }
    }
  };
  vm.runInNewContext(fs.readFileSync('src/background.js','utf8'),{
    chrome,ChatSignalsColor:color
  });
  function send(id,request,origin='https://chatgpt.com/c/synthetic-chat'){
    return new Promise((resolve,reject)=>{
      const handled=message(request,{tab:{id},url:origin},resolve);
      if(!handled)resolve({rejected:true});
    });
  }
  const register=(id,key,documentToken=nonce)=>send(id,{
    type:'chat-signals-register',key,documentToken});
  const saveState=(id,key,state,documentToken=nonce)=>send(id,{
    type:'chat-signals-state',key,documentToken,state});
  const complete=(id,key,epoch=1,documentToken=nonce,origin,iconUrl)=>send(id,{
    type:'chat-signals-complete',key,epoch,documentToken,iconUrl},origin);
  const event=(id,key,kind,epoch=1,documentToken=nonce,origin,iconUrl)=>send(id,{
    type:'chat-signals-event',event:kind,key,epoch,documentToken,iconUrl},origin);
  return {register,saveState,complete,event,remove:id=>{
      tabWindows.delete(id);tabUrls.delete(id);removed(id);
    },read:()=>session,readColors:()=>persistentStorage.chatSignalsColorLedgerV1,
    readStates:()=>persistentStorage.chatSignalsStateLedgerV1,
    notifications:()=>notifications,
    setWindow:(tabId,windowId)=>tabWindows.set(tabId,windowId),
    setUrl:(tabId,url)=>tabUrls.set(tabId,url),
    clickImmediate:id=>clicked(id),
    click:async id=>{clicked(id);await new Promise(resolve=>setImmediate(resolve));},
    activations:()=>activations};
}

test('register assigns different OKLab colors to separate live chats',async()=>{
 const w=start();
 const a=await w.register(1,color.hash('chat:synthetic-1'));
 const b=await w.register(2,color.hash('chat:synthetic-2'));
 assert.match(a.hex,/^#[0-9a-f]{6}$/);
 assert.notEqual(a.hex,b.hex);
 const twin=await w.register(3,color.hash('chat:synthetic-1'));
 assert.equal(twin.hex,a.hex);
 const values=Object.values(w.read().chatSignalsSessionAllocationsV1);
 assert.equal(values.length,3);
 assert.ok(values.every(x=>/^[0-9a-f]{16}$/.test(x.key)));
});

test('registration updates one tab; onRemoved releases its allocation',async()=>{
 const w=start();
 await w.register(11,color.hash('chat:synthetic-1'));
 await w.register(12,color.hash('chat:synthetic-2'));
 w.remove(11);
 // serialized remove is asynchronous; next registration enters the same queue
 await w.register(13,color.hash('chat:synthetic-3'));
 const saved=w.read().chatSignalsSessionAllocationsV1;
 assert.equal(saved['11'],undefined);
 assert.ok(saved['12']&&saved['13']);
});

test('invalid identities never register',()=>{
 const w=start();
 let called=false;
 const source=fs.readFileSync('src/background.js','utf8');
 assert.match(source,/\^\[0-9a-f\]\{16\}\$/);
 assert.doesNotMatch(source,/tabs\.query\(/);
});

test('desktop completion notification fires once and never contains chat text',async()=>{
 const w=start(), key=color.hash('chat:synthetic-only');
 await w.register(7,key);
 const first=await w.complete(7,key,1);
 assert.equal(first.created,true);
 assert.equal(w.notifications().length,1);
 assert.equal(w.notifications()[0].options.isClickable,true);
 assert.equal(w.notifications()[0].options.title,'Chat Signals - Success');
 assert.equal(w.notifications()[0].options.message,'Response finished.');
 assert.equal(w.notifications()[0].options.iconUrl,'moz-extension://synthetic/icons/completion.png');
 assert.equal((await w.complete(7,key,1)).created,false,'duplicate epoch');
 assert.equal(w.notifications().length,1);
 assert.equal((await w.complete(7,key,2)).created,true,'subsequent response');
 assert.equal(w.notifications().length,2);
 assert.equal(w.notifications()[1].id,w.notifications()[0].id,'one current notification per tab');
});
test('new document or chat permits new completion; stale and unrelated sender rejected',async()=>{
 const w=start(), key=color.hash('chat:synthetic-only'),newKey=color.hash('chat:synthetic-other');
 await w.register(9,key);
 assert.equal((await w.complete(9,newKey)).created,false);
 assert.equal((await w.complete(9,key,1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).created,false);
 assert.equal((await w.complete(9,key,1,undefined,'https://other.example.com/c/synthetic')).rejected,true);
 assert.equal((await w.complete(9,key,1)).created,true);
 await w.register(9,newKey);
 assert.equal((await w.complete(9,key,2)).created,false);
 assert.equal((await w.complete(9,newKey,1)).created,true);
 await w.register(9,newKey,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
 assert.equal((await w.complete(9,newKey,1,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).created,true);
 assert.equal(w.notifications().length,3);
});
test('no completion notification before a registered active tab',async()=>{
 const w=start(),key=color.hash('chat:synthetic-only');
 assert.equal((await w.complete(20,key,1)).created,false);
 assert.equal(w.notifications().length,0);
});

test('per-chat colored notification icon matches favicon; invalid URL falls back',async()=>{
 const w=start(),key=color.hash('chat:synthetic-only');
 await w.register(23,key);
 const colored='data:image/png;base64,'+'A'.repeat(64);
 assert.equal((await w.complete(23,key,1,undefined,undefined,colored)).created,true);
 assert.equal(w.notifications()[0].options.iconUrl,colored);
 assert.equal((await w.complete(23,key,2,undefined,undefined,'https://example.invalid/evil')).created,true);
 assert.equal(w.notifications()[1].options.iconUrl,
   'moz-extension://synthetic/icons/completion.png');
});

test('different state alerts have independent categories, messages and idempotence',async()=>{
 const w=start(),key=color.hash('chat:synthetic-only');
 await w.register(33,key);
 const cases=[
  ['interruption','Chat Signals - Warning','Connection interrupted.'],
  ['failure','Chat Signals - Error','A response or conversation failed.'],
  ['limit','Chat Signals - Warning','Conversation length limit reached.'],
  ['completion','Chat Signals - Success','Response finished.']
 ];
 for(const [kind,title,message] of cases){
   assert.equal((await w.event(33,key,kind)).created,true,kind);
   const latest=w.notifications().at(-1).options;
   assert.equal(latest.title,title);
   assert.equal(latest.message,message);
   assert.equal((await w.event(33,key,kind)).created,false,'no duplicate '+kind);
 }
 assert.equal(w.notifications().length,4);
 assert.equal(w.notifications()[0].id,w.notifications()[3].id);
 assert.equal((await w.event(33,key,'unknown')).rejected,true);
});
test('recovery and read transition cause no background event; source may not supply notification text',async()=>{
 const w=start(),key=color.hash('chat:synthetic-only');
 await w.register(47,key);
 await w.event(47,key,'completion',1);
 const one=w.notifications().length;
 // The background only accepts enumerated event names, not claimed state.
 assert.equal((await w.event(47,key,'viewed',1)).rejected,true);
 assert.equal((await w.event(47,key,'recovery',1)).rejected,true);
 assert.equal(w.notifications().length,one);
 // A second new epoch is permitted, but a replay of the old one isn't.
 assert.equal((await w.event(47,key,'completion',1)).created,false);
 assert.equal((await w.event(47,key,'completion',2)).created,true);
 assert.equal(w.notifications().length,one+1);
 assert.ok(w.notifications().every(x=>!x.options.message.includes('synthetic-only')));
});
test('re-registering same document preserves alert ledger, replacing document clears it',async()=>{
 const w=start(),key=color.hash('chat:synthetic-only');
 await w.register(48,key);
 await w.event(48,key,'interruption',1);
 await w.register(48,key);
 assert.equal((await w.event(48,key,'interruption',1)).created,false);
 await w.register(48,key,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
 assert.equal((await w.event(48,key,'interruption',1,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).created,true);
});

test('clicking a completion notification activates the original tab then focuses its window',async()=>{
 const w=start(),key=color.hash('chat:synthetic-only');
 w.setWindow(51,7);
 await w.register(51,key);
 await w.event(51,key,'completion');
 await w.click('chat-signals-tab-51');
 assert.deepEqual(JSON.parse(JSON.stringify(w.activations())),[
   {kind:'tab',id:51,options:{active:true}},
   {kind:'window',id:7,options:{focused:true}}
 ]);
});
test('notification click ignores unknown, removed, or nonextension notifications',async()=>{
 const w=start(),key=color.hash('chat:synthetic-only');
 w.setWindow(52,8);await w.register(52,key);
 for(const id of ['other-notification','chat-signals-tab-52-extra','chat-signals-tab-9999']){
   await w.click(id);
 }
 assert.equal(w.activations().length,0);
 w.remove(52);await w.register(53,color.hash('chat:synthetic-extra'));
 await w.click('chat-signals-tab-52');
 assert.equal(w.activations().length,0);
});

test('click activation is dispatched synchronously without storage or work-queue waits',async()=>{
 const w=start(),key=color.hash('chat:synthetic-chat');
 w.setWindow(60,9);await w.register(60,key);await w.event(60,key,'completion');
 w.clickImmediate('chat-signals-tab-60');
 assert.deepEqual(JSON.parse(JSON.stringify(w.activations())),[
   {kind:'tab',id:60,options:{active:true}},
   {kind:'window',id:9,options:{focused:true}}
 ],'requests begin during click handling, not after any awaited storage operation');
});
test('click does not activate a tab that navigated away from chatgpt.com',async()=>{
 const w=start(),key=color.hash('chat:synthetic-chat');
 w.setWindow(61,10);await w.register(61,key);await w.event(61,key,'completion');
 w.setUrl(61,'https://example.org/');
 w.clickImmediate('chat-signals-tab-61');
 assert.equal(w.activations().length,0);
});

test('restart preserves each remembered chat color despite reverse tab registration order',async()=>{
 const persistent={};
 const keyA=color.hash('chat:restart-conversation-a');
 const keyB=color.hash('chat:restart-conversation-b');
 const keyC=color.hash('chat:restart-conversation-c');
 const first=start(persistent);
 const a=await first.register(1,keyA);
 const b=await first.register(2,keyB);
 const c=await first.register(3,keyC);
 assert.equal(new Set([a.hex,b.hex,c.hex]).size,3,
   'initial simultaneous allocation still favors distinct OKLab colors');
 assert.equal(Object.keys(first.readColors()).length,3);
 const reloaded=start(persistent);
 assert.equal((await reloaded.register(13,keyC)).hex,c.hex);
 assert.equal((await reloaded.register(12,keyB)).hex,b.hex);
 assert.equal((await reloaded.register(11,keyA)).hex,a.hex);
 assert.ok(Object.keys(reloaded.readColors()).every(x=>/^[0-9a-f]{16}$/.test(x)),
   'permanent records contain hashed identities only');
});

test('a new tab of the same chat reuses the persisted color',async()=>{
 const persistent={};
 const key=color.hash('chat:duplicate-conversation');
 const first=start(persistent);
 const a=await first.register(4,key);
 const reload=start(persistent);
 const again=await reload.register(6,key,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
 assert.equal(again.hex,a.hex);
 assert.equal(Object.keys(reload.readColors()).length,1);
});

test('content script waits for background color assignment instead of flashing a provisional swatch',()=>{
 const source=fs.readFileSync('src/content.js','utf8');
 assert.doesNotMatch(source,/currentHex=color\.choose\(color\.hash\(identity\.key\)\)/);
 assert.match(source,/applyHex\(answer\.hex\)/);
});

test('response state survives extension worker reload with same tab and conversation',async()=>{
 const persistent={};const key=color.hash('chat:stored-completion');
 const first=start(persistent);
 const initial=await first.register(20,key);
 assert.equal(initial.restored,null);
 assert.equal((await first.saveState(20,key,
   {phase:'finished',read:'unread',epoch:3})).saved,true);
 const reloaded=start(persistent);
 const result=await reloaded.register(20,key,
   'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
 assert.deepEqual(JSON.parse(JSON.stringify(result.restored)),
   {phase:'finished',read:'unread',epoch:3});
 assert.equal((await reloaded.register(21,key)).restored,null,
   'a separate tab must not inherit unread state');
 assert.equal(Object.keys(reloaded.readStates()).length,1);
 assert.ok(!JSON.stringify(reloaded.readStates()).includes('stored-completion'));
});

test('snapshots cannot leak across changed conversations, documents or tabs',async()=>{
 const w=start({});
 const first=color.hash('chat:first-identity');
 const other=color.hash('chat:other-identity');
 await w.register(71,first);
 assert.equal((await w.saveState(71,other,
   {phase:'finished',read:'unread',epoch:2})).saved,false);
 assert.equal((await w.saveState(71,first,
   {phase:'finished',read:'unread',epoch:2},
   'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).saved,false);
 assert.equal((await w.saveState(71,first,
   {phase:'made-up',read:'unread',epoch:2})).saved,false);
 await w.saveState(71,first,{phase:'failed',read:'viewed',epoch:2});
 assert.equal((await w.register(71,other)).restored,null);
 await w.saveState(71,other,{phase:'limit',read:'viewed',epoch:3});
 assert.equal((await w.register(71,other)).restored.phase,'limit');
});

test('closing a tab deletes its persisted status even when session storage is gone',async()=>{
 const persistent={};const key=color.hash('chat:close-cleanup');
 const first=start(persistent);await first.register(83,key);
 await first.saveState(83,key,{phase:'finished',read:'unread',epoch:2});
 const restarted=start(persistent);
 restarted.remove(83);
 // Trigger serialization by sending a registration in the same worker.
 await restarted.register(84,color.hash('chat:another-chat'));
 assert.equal(restarted.readStates()['83'],undefined);
 assert.equal((await restarted.register(83,key)).restored,null);
});

test('invalid persisted status fields do not restore executable or arbitrary data',async()=>{
 const persistent={};const key=color.hash('chat:malformed-record');
 const w=start(persistent);await w.register(95,key);
 const invalid=[{phase:'finished',read:'unread',epoch:-1},
   {phase:'finished',read:'unknown',epoch:1},
   {phase:'finished',read:'unread',epoch:'3'}];
 for(const value of invalid)
   assert.equal((await w.saveState(95,key,value)).saved,false);
 assert.equal((await start(persistent).register(95,key)).restored,null);
});
