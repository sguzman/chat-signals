const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../src/state.js');
const key='synthetic-not-stored';
const event=(overrides={})=>({key,stop:false,assistantToken:11,
 actionToken:21,noticeKind:null,noticeToken:null,hidden:false,...overrides});

test('HTTP absence and old action controls cannot prove completion',()=>{
 const f=create();f.observe(event());
 assert.equal(f.snapshot().phase,'idle');
 f.observe(event({stop:true}));
 assert.equal(f.snapshot().phase,'generating');
 f.observe(event());
 assert.equal(f.snapshot().phase,'verifying');
 f.observe(event());
 assert.equal(f.snapshot().phase,'verifying');
 f.observe(event({assistantToken:12,actionToken:22}));
 assert.equal(f.snapshot().phase,'finished');
 assert.equal(f.snapshot().reason,'fresh-assistant-terminal-action');
});
test('manual Stop does not restart until visible Stop disappears',()=>{
 const f=create();f.observe(event({stop:true}));
 f.cancel();assert.equal(f.snapshot().phase,'idle');
 f.observe(event({stop:true}));
 assert.equal(f.snapshot().phase,'idle');
 f.observe(event());
 f.observe(event({stop:true}));
 assert.equal(f.snapshot().phase,'generating');
});
test('incidental events cannot restart finished generation',()=>{
 const f=create();
 f.observe(event({stop:true}));f.observe(event({actionToken:22,assistantToken:12}));
 assert.equal(f.snapshot().phase,'finished');
 const before=f.snapshot().changed;
 f.observe(event({actionToken:22,assistantToken:12}));
 assert.equal(f.snapshot().changed,before);
 assert.equal(f.snapshot().phase,'finished');
 f.observe(event({stop:true,actionToken:22,assistantToken:12}));
 assert.equal(f.snapshot().phase,'generating');
});
test('foreground/background only affect read status',()=>{
 const f=create();
 f.observe(event({stop:true}));f.observe(event({actionToken:22,assistantToken:12,hidden:true}));
 assert.equal(f.snapshot().phase,'finished');
 assert.equal(f.snapshot().read,'unread');
 f.viewed();assert.equal(f.snapshot().phase,'finished');
 assert.equal(f.snapshot().read,'viewed');
});
test('stale red/error warning cannot suppress completed response',()=>{
 const f=create();
 f.observe(event({noticeKind:'error',noticeToken:42}));
 assert.equal(f.snapshot().phase,'idle');
 f.observe(event({stop:true,noticeKind:'error',noticeToken:42}));
 f.observe(event({stop:false,actionToken:22,assistantToken:12,noticeKind:'error',noticeToken:42}));
 assert.equal(f.snapshot().phase,'finished');
});
test('interruption is not completion and can clear to verifying',()=>{
 const f=create();
 f.observe(event({stop:true}));
 f.observe(event({noticeKind:'interrupted',noticeToken:43}));
 assert.equal(f.snapshot().phase,'interrupted');
 f.observe(event());
 assert.equal(f.snapshot().phase,'verifying');
});
test('separate failure and limit evidence; route change resets epoch',()=>{
 const f=create();f.observe(event({stop:true}));
 f.observe(event({noticeKind:'response_load_failed',noticeToken:99}));
 assert.equal(f.snapshot().phase,'failed');
 f.observe(event({noticeKind:'limit',noticeToken:100}));
 assert.equal(f.snapshot().phase,'limit');
 f.observe({...event(),key:'other-synthetic-chat'});
 assert.equal(f.snapshot().phase,'idle');
 assert.equal(f.snapshot().epoch,0);
});

test('re-rendered old action cannot falsely complete a new reply',()=>{
 const f=create();
 f.observe(event());
 f.observe(event({stop:true}));
 f.observe(event({assistantToken:11,actionToken:99}));
 assert.equal(f.snapshot().phase,'verifying');
 // A truly new assistant turn with a new final control is sufficient.
 f.observe(event({assistantToken:12,actionToken:100}));
 assert.equal(f.snapshot().phase,'finished');
});

test('a final action newly appears on an assistant turn started without one',()=>{
 const f=create();
 f.observe(event({stop:true,assistantToken:12,actionToken:null}));
 f.observe(event({stop:false,assistantToken:12,actionToken:22}));
 assert.equal(f.snapshot().phase,'finished');
});

test('submission intent is visible before Stop, without claiming generation',()=>{
 const f=create(); f.observe(event());
 f.intent(event());
 assert.equal(f.snapshot().phase,'submitted');
 assert.equal(f.snapshot().epoch,1);
 assert.equal(f.snapshot().reason,'user-submit-intent');
 f.observe(event()); assert.equal(f.snapshot().phase,'submitted');
 f.observe(event({stop:true}));assert.equal(f.snapshot().phase,'generating');
 assert.equal(f.snapshot().epoch,1);
});
test('new reply and terminal toolbar in the same observation cannot falsely finish',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({actionToken:22,assistantToken:12}));
 assert.equal(f.snapshot().phase,'generating');
 assert.equal(f.snapshot().reason,'new-assistant-turn-visible');
 f.observe(event({actionToken:22,assistantToken:12}));
 assert.equal(f.snapshot().phase,'generating',
   'unchanged toolbar is not new completion evidence');
});
test('new Copy action appearing after an observed reply may finish without Stop',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({actionToken:null,assistantToken:12}));
 assert.equal(f.snapshot().phase,'generating');
 f.observe(event({actionToken:22,assistantToken:12}));
 assert.equal(f.snapshot().phase,'finished');
});
test('old action controls cannot finish an unconfirmed submitted response',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event());assert.equal(f.snapshot().phase,'submitted');
 f.expireIntent();assert.equal(f.snapshot().phase,'unknown');
 assert.equal(f.snapshot().reason,'submission-unconfirmed');
});
test('unknown routes reject submission and cancellation is not failure',()=>{
 const f=create();f.intent(event());assert.equal(f.snapshot().phase,'unknown');
 f.observe(event());f.intent(event());f.cancel();
 assert.equal(f.snapshot().phase,'idle');
 assert.equal(f.snapshot().reason,'manual-cancel');
});

test('a new assistant turn establishes generation without a visible Stop control',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({assistantToken:12,actionToken:null}));
 assert.equal(f.snapshot().phase,'generating');
 assert.equal(f.snapshot().reason,'new-assistant-turn-visible');
 f.observe(event({assistantToken:12,actionToken:null}));
 assert.equal(f.snapshot().phase,'generating');
 f.observe(event({assistantToken:12,actionToken:22}));
 assert.equal(f.snapshot().phase,'finished');
});
test('old assistant footer re-render is not a new response',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({assistantToken:11,actionToken:22}));
 assert.equal(f.snapshot().phase,'submitted');
});
test('a delayed reply can recover from unconfirmed submission',()=>{
 const f=create();f.observe(event());f.intent(event());f.expireIntent();
 assert.equal(f.snapshot().phase,'unknown');
 f.observe(event({assistantToken:12,actionToken:null}));
 assert.equal(f.snapshot().phase,'generating');
 f.observe(event({assistantToken:12,actionToken:22}));
 assert.equal(f.snapshot().phase,'finished');
});

test('a stale Stop during failure or limit does not manufacture new response epochs',()=>{
 const key='synthetic-chat';
 const sample=(more={})=>({key,stop:false,assistantToken:1,actionToken:null,
    noticeToken:null,noticeKind:null,hidden:false,...more});
 const f=create();f.observe(sample());f.intent(sample());
 f.observe(sample({stop:true}));
 f.observe(sample({stop:true,noticeKind:'error',noticeToken:50}));
 assert.equal(f.snapshot().phase,'failed');
 const epoch=f.snapshot().epoch;
 f.observe(sample({stop:true,noticeKind:'error',noticeToken:50}));
 f.observe(sample({stop:true,noticeKind:'error',noticeToken:50}));
 assert.equal(f.snapshot().epoch,epoch);
 assert.equal(f.snapshot().phase,'failed');
 f.intent(sample());
 assert.equal(f.snapshot().epoch,epoch+1);
 const limit=create();limit.observe(sample());limit.intent(sample());
 limit.observe(sample({noticeKind:'limit',noticeToken:60}));
 const limitEpoch=limit.snapshot().epoch;
 limit.observe(sample({stop:true,noticeKind:'limit',noticeToken:60}));
 assert.equal(limit.snapshot().epoch,limitEpoch);
 assert.equal(limit.snapshot().phase,'limit');
});

test('missing baseline is not permission to treat old Copy action as completed',()=>{
 const f=create();
 f.observe(event({assistantToken:null,actionToken:null}));
 f.intent(event({assistantToken:null,actionToken:null}));
 f.observe(event({assistantToken:19,actionToken:31}));
 assert.equal(f.snapshot().phase,'generating');
 f.observe(event({assistantToken:19,actionToken:31}));
 assert.equal(f.snapshot().phase,'generating');
});
test('uncertainty after lag cannot immediately turn into success as output starts',()=>{
 const f=create();f.observe(event());f.intent(event());f.expireIntent();
 assert.equal(f.snapshot().phase,'unknown');
 f.observe(event({assistantToken:12,actionToken:22}));
 assert.equal(f.snapshot().phase,'generating');
 f.observe(event({assistantToken:12,actionToken:22}));
 assert.equal(f.snapshot().phase,'generating');
});

test('a visible interruption outranks a new completion toolbar, then recovers',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({assistantToken:12,actionToken:null}));
 const interrupt=event({assistantToken:12,actionToken:22,noticeKind:'interrupted',noticeToken:42});
 f.observe(interrupt);
 assert.equal(f.snapshot().phase,'interrupted');
 assert.equal(f.snapshot().reason,'current-interruption');
 // The first completed-control observation while the banner is present
 // cannot override the explicit interruption.
 f.observe(interrupt);
 assert.equal(f.snapshot().phase,'interrupted');
 f.observe(event({assistantToken:12,actionToken:22}));
 assert.equal(f.snapshot().phase,'verifying',
   'banner disappearance alone does not prove the reply completed');
});
test('an interrupted response can resume generation when Stop returns',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({noticeKind:'interrupted',noticeToken:52}));
 assert.equal(f.snapshot().phase,'interrupted');
 f.observe(event({noticeKind:null,stop:true}));
 assert.equal(f.snapshot().phase,'generating');
});

test('input-stream failure outranks simultaneous Copy completion and unread state',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({stop:true,assistantToken:12,actionToken:null}));
 f.observe(event({assistantToken:12,actionToken:22,hidden:true,
   noticeKind:'input_stream_error',noticeToken:87}));
 assert.equal(f.snapshot().phase,'failed');
 assert.equal(f.snapshot().read,'viewed');
 assert.equal(f.snapshot().reason,'visible-input-stream-error');
 const changed=f.snapshot().changed;
 f.observe(event({assistantToken:12,actionToken:22,hidden:true,
   noticeKind:'input_stream_error',noticeToken:87}));
 assert.equal(f.snapshot().changed,changed,'same banner must be idempotent');
});
test('late input-stream error corrects an inferred unread completion',()=>{
 const f=create();f.observe(event());f.intent(event());
 f.observe(event({stop:true,assistantToken:12,actionToken:null}));
 f.observe(event({assistantToken:12,actionToken:22,hidden:true}));
 assert.equal(f.snapshot().phase,'finished');
 assert.equal(f.snapshot().read,'unread');
 f.observe(event({assistantToken:12,actionToken:22,hidden:true,
   noticeKind:'input_stream_error',noticeToken:88}));
 assert.equal(f.snapshot().phase,'failed');
 assert.equal(f.snapshot().read,'viewed');
});
test('an older input-stream banner cannot poison a later successful Retry',()=>{
 const f=create();f.observe(event({noticeKind:'input_stream_error',noticeToken:42}));
 assert.equal(f.snapshot().phase,'failed');
 assert.equal(f.snapshot().epoch,0);
 f.intent(event({noticeKind:'input_stream_error',noticeToken:42}));
 f.observe(event({stop:true,noticeKind:'input_stream_error',noticeToken:42}));
 assert.equal(f.snapshot().phase,'generating');
 f.observe(event({assistantToken:12,actionToken:22,
   noticeKind:'input_stream_error',noticeToken:42}));
 assert.equal(f.snapshot().phase,'finished');
});
