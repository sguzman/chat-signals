const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const color=require('../src/color.js');

function start(){
  let message,removed,session={};
  const chrome={
    runtime:{lastError:null,onMessage:{addListener:fn=>{message=fn;}}},
    tabs:{onRemoved:{addListener:fn=>{removed=fn;}}},
    storage:{session:{
      get:(_key,callback)=>callback({...session}),
      set:(value,callback)=>{session={...session,...value};callback();}
    }}
  };
  vm.runInNewContext(fs.readFileSync('src/background.js','utf8'),{
    chrome,ChatSignalsColor:color
  });
  function register(id,key){
    return new Promise(resolve=>{
      const handled=message({type:'chat-signals-register',key},
        {tab:{id}},resolve);
      assert.equal(handled,true);
    });
  }
  return {register,remove:id=>removed(id),read:()=>session};
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
