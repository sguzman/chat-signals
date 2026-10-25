'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../src/queue-publisher.js');
const token='a'.repeat(32);
const snapshot={phase:'finished',epoch:4,confidence:'inferred'};
const map=(s=snapshot,extra={})=>p.map(s,{route:'/c/synthetic-123',
  documentToken:token,sequence:8,...extra});
test('publisher maps only bounded, assigned pathname and metadata',()=>{
  assert.deepEqual(map(),{version:1,route:'/c/synthetic-123',
    documentToken:token,sequence:8,epoch:4,phase:'finished',origin:'fresh',
    confidence:'inferred'});
  assert.equal(map(snapshot,{route:'/g/g-synthetic/c/synthetic-123'}).route,
    '/g/g-synthetic/c/synthetic-123');
  for(const route of ['','/','/search','/share/link','/c/','/g/project',
    '/c/synthetic-123/extra','/c/synthetic-123?query=private',
    '/c/synthetic-123#fragment','/c/%2E%2E','/c/'+ 'x'.repeat(520)])
    assert.equal(map(snapshot,{route}),null,route);
  assert.equal(JSON.stringify(map()).includes('private prompt'),false);
});
test('restored epoch stays historical through viewed, phase and repeat changes',()=>{
  const historical=map(snapshot,{restoredEpoch:4});
  assert.equal(historical.origin,'restored');
  assert.equal(map({...snapshot,phase:'idle'},{restoredEpoch:4}).origin,'restored');
  assert.equal(map({...snapshot,epoch:5},{restoredEpoch:4}).origin,'fresh');
  assert.equal(map({...snapshot,epoch:0},{restoredEpoch:4}).origin,'restored');
  assert.equal(map(snapshot,{restoredEpoch:null}).origin,'fresh');
});
test('bad metadata cannot cross the publisher/background trust boundary',()=>{
  for(const extra of [{documentToken:'bad'},{sequence:0},{sequence:1.5},
    {route:'/c/synthetic?token=bad'},{restoredEpoch:-1}])
    assert.equal(map(snapshot,extra),null);
  for(const s of [{...snapshot,confidence:'certain'},
    {...snapshot,phase:'other'},{...snapshot,epoch:-1},
    {...snapshot,epoch:1.2}])assert.equal(map(s),null);
  const message={type:p.INTERNAL,key:'0123456789abcdef',signal:map()};
  assert.equal(p.internal(message).signal.phase,'finished');
  assert.equal(p.internal({...message,key:'not-hash'}),null);
  assert.equal(p.internal({...message,signal:{...message.signal,origin:'restored',
    epoch:4}})?.signal.origin,'restored');
  assert.equal(p.internal({...message,signal:{...message.signal,
    origin:'forged'}}),null);
  assert.equal(p.internal({...message,signal:{...message.signal,
    route:'/share/private'}}),null);
});
