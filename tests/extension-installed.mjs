// True extension-install smoke: manifest, isolated content scripts and MV3 worker.
// Only disposable Chromium profiles and synthetic, intercepted ChatGPT pages.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const extensionPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=await mkdtemp(path.join(os.tmpdir(),'chat-signals-e2e-'));
const sample='<html><head><title>Synthetic Chat</title>'+
  '<link rel="icon" href="/synthetic-icon.svg" type="image/svg+xml" sizes="any">'+
  '</head><body>'+
  '<main><article data-testid="conversation-turn-old">'+
  '<div data-message-author-role="assistant"><button aria-label="Copy">Copy</button></div>'+
  '</article><form><textarea id="prompt-textarea"></textarea></form></main></body></html>';
let context;
const visit=async (suffix,route=null)=>{
  const page=await context.newPage();
  await page.route('https://chatgpt.com/**',route=>route.fulfill({
    contentType:'text/html',status:200,body:sample
  }));
  await page.goto('https://chatgpt.com'+(route||'/c/synthetic-chat-'+suffix));
  await page.waitForFunction(()=>document.documentElement.dataset.chatSignalsColor?.startsWith('#'),null,{timeout:12000});
  return page;
};
try{
  context=await chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,
    args:['--disable-extensions-except='+extensionPath,
      '--load-extension='+extensionPath],
    viewport:{width:1280,height:850}
  });
  let workers=context.serviceWorkers();
  if(!workers.length)workers=[await context.waitForEvent('serviceworker',{timeout:15000})];
  const worker=workers[0];
  assert.match(worker.url(),/chrome-extension:\/\/[^/]+\/src\/background\.js$/);
  const a=await visit('normal-001');
  const b=await visit('normal-002');
  const project=await visit('project-001','/g/g-p-example123/c/synthetic-chat-project-001');
  const gpt=await visit('gpt-001','/g/g-example123/c/synthetic-chat-gpt-001');
  // The initial favicon has a deterministic fallback while worker registration
  // completes. Wait for the real registered assignments before comparing tabs.
  let slots={};
  for(let i=0;i<40;i++){
    slots=await worker.evaluate(async()=>
      (await chrome.storage.session.get('chatSignalsSessionAllocationsV1')).chatSignalsSessionAllocationsV1||{});
    if(Object.keys(slots).length===4)break;
    await a.waitForTimeout(100);
  }
  assert.equal(Object.keys(slots).length,4,'real background worker must register each tab');
  const swatches=Object.values(slots).map(x=>x.hex);
  await Promise.all([a,b,project,gpt].map(async tab=>
    tab.waitForFunction(allocated=>allocated.includes(
      document.documentElement.dataset.chatSignalsColor),swatches,{timeout:5000})));
  const first=await a.evaluate(()=>({
    color:document.documentElement.dataset.chatSignalsColor,
    icon:document.querySelector('link[data-chat-signals-icon]')?.href,
    title:document.title,
    state:document.documentElement.dataset.chatSignalsState
  }));
  const second=await b.evaluate(()=>({
    color:document.documentElement.dataset.chatSignalsColor,
    icon:document.querySelector('link[data-chat-signals-icon]')?.href
  }));
  assert.match(first.color,/^#[0-9a-f]{6}$/);
  assert.notEqual(first.color,second.color,'worker must distinguish two active chats');
  const colors=await Promise.all([a,b,project,gpt].map(p=>
    p.evaluate(()=>document.documentElement.dataset.chatSignalsColor)));
  assert.equal(new Set(colors).size,4,'active chats must get distinct swatches');
  // Distinguish the intended project circle from normal and custom-GPT
  // rounded squares by inspecting alpha at a known edge pixel.
  const atEdge=page=>page.evaluate(async()=>{
    const src=document.querySelector('link[data-chat-signals-icon]')?.href;
    const img=new Image();img.src=src;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    return ctx.getImageData(6,4,1,1).data[3];
  });
  assert.ok(await atEdge(a)>200,'normal chat favicon should be a square');
  assert.ok(await atEdge(gpt)>200,'GPT favicon should be a rounded square');
  assert.ok(await atEdge(project)<30,'project favicon should be circular');
  assert.ok(Object.values(slots).every(x=>/^[0-9a-f]{16}$/.test(x.key)));
  assert.ok(first.icon?.startsWith('data:image/png;base64,'));
  const overwritten=await a.evaluate(()=>{
    const existing=document.querySelector('link[rel~="icon"]:not([data-chat-signals-icon])');
    return {url:existing?.getAttribute('href'),type:existing?.getAttribute('type'),
      sizes:existing?.getAttribute('sizes')};
  });
  assert.equal(overwritten.type,'image/png');
  assert.equal(overwritten.sizes,null);
  assert.ok(overwritten.url?.startsWith('data:image/png;base64,'),
    'installed extension must override competing favicon declaration');
  assert.ok(second.icon?.startsWith('data:image/png;base64,'));
  assert.equal(first.state,'idle');
  assert.equal(first.title,'Synthetic Chat');

  await a.evaluate(()=>{
    const stop=document.createElement('button');stop.dataset.testid='fruitjuice-stop-button';
    stop.textContent='Stop';document.querySelector('form').append(stop);
  });
  await a.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='generating');
  await a.evaluate(()=>{document.title='Synthetic Chat';});
  await a.waitForFunction(()=>document.title.startsWith('⏳ '));
  await a.evaluate(()=>document.querySelector('[data-testid="fruitjuice-stop-button"]').remove());
  await a.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='verifying');
  await a.evaluate(()=>{
    const reply=document.createElement('article');reply.dataset.testid='conversation-turn-new';
    reply.innerHTML='<div data-message-author-role="assistant"><button aria-label="Copy">Copy</button></div>';
    document.querySelector('main').append(reply);
  });
  await a.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='finished');
  const after=await a.evaluate(()=>({
    color:document.documentElement.dataset.chatSignalsColor,
    title:document.title,
    icon:document.querySelector('link[data-chat-signals-icon]')?.href
  }));
  assert.equal(after.color,first.color,'status must not change allocated color');
  assert.equal(after.icon,first.icon,'status must not rewrite icon');
  assert.match(after.title,/^✅ /u);
  assert.equal(await b.evaluate(()=>document.documentElement.dataset.chatSignalsState),'idle',
    'only requesting tab should be affected');

  await a.close();
  const c=await visit('normal-003');
  assert.match(await c.evaluate(()=>document.documentElement.dataset.chatSignalsColor),/^#[0-9a-f]{6}$/);
  console.log('PASS: unpacked MV3 extension installed; worker, per-tab palette, favicon, generation lifecycle and close');
}finally{
  if(context)await context.close();
  await rm(profile,{recursive:true,force:true});
}
