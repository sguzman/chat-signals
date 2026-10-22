const test=require('node:test');
const assert=require('node:assert/strict');
const {create,EVENTS}=require('../src/alerts.js');
const snapshot=(phase,epoch=1,read='viewed')=>({phase,epoch,read});
test('completion notifies only once; unread to viewed never produces a cue',()=>{
 const alerts=create();alerts.reset('synthetic-chat');
 const done=alerts.transition(snapshot('generating'),snapshot('finished',1,'unread'));
 assert.deepEqual({...done},{kind:'completion',category:'success',sound:'success'});
 assert.equal(alerts.transition(snapshot('finished',1,'unread'),snapshot('finished',1,'viewed')),null);
 assert.equal(alerts.transition(snapshot('finished',1,'viewed'),snapshot('finished',1,'viewed')),null);
 assert.equal(alerts.transition(snapshot('verifying',1),snapshot('finished',1,'viewed')),null,
   'same response epoch is already announced');
 assert.deepEqual({...alerts.transition(snapshot('generating',2),snapshot('finished',2))}, 
   {kind:'completion',category:'success',sound:'success'});
});
test('interruption can recover silently and never renotify in the same epoch',()=>{
 const alerts=create();alerts.reset('synthetic-chat');
 assert.equal(alerts.transition(snapshot('generating'),snapshot('interrupted')).kind,'interruption');
 assert.equal(alerts.transition(snapshot('interrupted'),snapshot('verifying')),null);
 assert.equal(alerts.transition(snapshot('verifying'),snapshot('interrupted')),null);
 assert.equal(alerts.transition(snapshot('interrupted'),snapshot('generating')),null);
 assert.equal(alerts.transition(snapshot('generating'),snapshot('finished')).kind,'completion');
 assert.equal(alerts.transition(snapshot('finished',1,'unread'),snapshot('finished',1,'viewed')),null);
});
test('errors and length limit have independent one-shot categories',()=>{
 const alerts=create();alerts.reset('synthetic-chat');
 assert.deepEqual({...alerts.transition(snapshot('generating'),snapshot('failed'))},
   {kind:'failure',category:'error',sound:'error'});
 assert.deepEqual({...alerts.transition(snapshot('failed'),snapshot('limit'))},
   {kind:'limit',category:'warning',sound:'limit'});
 assert.equal(alerts.transition(snapshot('limit'),snapshot('failed')),null);
 assert.equal(alerts.transition(snapshot('failed'),snapshot('limit')),null);
 assert.equal(alerts.transition(snapshot('generating',2),snapshot('failed',2)).kind,'failure');
});
test('idle, submission, generation, verifying, unknown and loaded old errors are silent',()=>{
 const alerts=create();alerts.reset('synthetic-chat');
 for(const phase of ['submitted','generating','verifying','idle','unknown'])
   assert.equal(alerts.transition(snapshot('idle'),snapshot(phase)),null);
 assert.equal(alerts.transition(snapshot('idle',0),snapshot('failed',0)),null);
 assert.equal(alerts.transition(snapshot('idle',0),snapshot('limit',0)),null);
 assert.equal(alerts.transition(snapshot('idle',1),snapshot('finished',2)),null,
   'response epoch mismatch must not invent a notification');
});
test('route change clears deduplication but not within-route state',()=>{
 const alerts=create();alerts.reset('first');
 assert.equal(alerts.transition(snapshot('generating'),snapshot('finished')).kind,'completion');
 alerts.reset('second');
 assert.equal(alerts.transition(snapshot('generating'),snapshot('finished')).kind,'completion');
 alerts.reset(null);
 assert.equal(alerts.transition(snapshot('generating'),snapshot('finished')),null);
});
test('event types and public categories are exactly scoped',()=>{
 assert.deepEqual(Object.keys(EVENTS).sort(),['failed','finished','interrupted','limit']);
});
