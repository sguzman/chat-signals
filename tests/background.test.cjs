const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const color=require('../src/color.js');

function start(){
  let message,removed,session={},notifications=[];
  const nonce='0123456789abcdef0123456789abcdef';
  const chrome={
    runtime:{lastError:null,getURL:p=>'moz-extension://synthetic/'+p,
      onMessage:{addListener:fn=>{message=fn;}}},
    tabs:{onRemoved:{addListener:fn=>{removed=fn;}}},
    notifications:{create:(id,options,cb)=>{
      notifications.push({id,options});cb(id);
    }},
    storage:{session:{
      get:(_key,callback)=>callback({...session}),
      set:(value,callback)=>{session={...session,...value};callback();}
    }}
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
  const complete=(id,key,epoch=1,documentToken=nonce,origin)=>send(id,{
    type:'chat-signals-complete',key,epoch,documentToken},origin);
  return {register,complete,remove:id=>removed(id),read:()=>session,
    notifications:()=>notifications};
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
 assert.equal(w.notifications()[0].options.title,'Chat Signals');
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
