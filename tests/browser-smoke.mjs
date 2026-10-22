// Isolated Firefox + Chromium smoke. Synthetic intercepted ChatGPT pages only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox,chromium} from 'playwright';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const scripts=await Promise.all(['src/color.js','src/state.js','src/content.js'].map(read));
const html='<!doctype html><html><head><title>Synthetic Chat</title></head><body>'+
  '<main><article data-testid="conversation-turn-old"><div data-message-author-role="assistant">'+
  '<button aria-label="Copy">Copy</button></div></article>'+
  '<form id="composer"><textarea id="prompt-textarea"></textarea></form></main></body></html>';
for(const [name,engine] of [['firefox',firefox],['chromium',chromium]]){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:850}});
  const page=await context.newPage();
  try{
    await page.route('https://chatgpt.com/**',route=>route.fulfill({
      contentType:'text/html',body:html,status:200
    }));
    await page.goto('https://chatgpt.com/c/synthetic-chat-001');
    for(const script of scripts)await page.addScriptTag({content:script});
    await page.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='idle');
    const initial=await page.evaluate(()=>({
      icon:document.querySelector('link[data-chat-signals-icon]')?.href,
      title:document.title
    }));
    assert.ok(initial.icon?.startsWith('data:image/png;base64,'));
    assert.equal(initial.title,'Synthetic Chat');
    await page.evaluate(()=>{
      const button=document.createElement('button');
      button.type='button';button.dataset.testid='stop-button';
      button.textContent='Stop';
      document.getElementById('composer').append(button);
    });
    await page.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='generating');
    assert.match(await page.title(),/^⏳ /u);
    await page.evaluate(()=>{
      document.querySelector('[data-testid="stop-button"]').remove();
    });
    await page.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='verifying');
    await page.evaluate(()=>{
      const article=document.createElement('article');
      article.dataset.testid='conversation-turn-new';
      article.innerHTML='<div data-message-author-role="assistant"><button aria-label="Copy">Copy</button></div>';
      document.querySelector('main').append(article);
    });
    await page.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='finished');
    const end=await page.evaluate(()=>({
      title:document.title,icon:document.querySelector('link[data-chat-signals-icon]')?.href,
      confidence:document.documentElement.dataset.chatSignalsConfidence
    }));
    assert.match(end.title,/^✅ /u);
    assert.equal(end.confidence,'inferred');
    assert.equal(end.icon,initial.icon,'state must not change identity color');
    const snapshot=await page.evaluate(()=>{
      for(let i=0;i<1000;i++){
        const m=document.createElement('meta');m.name='synthetic-'+i;
        document.head.append(m);m.remove();
      }
      return document.documentElement.dataset.chatSignalsState;
    });
    assert.equal(snapshot,'finished');
    // Wait for the two intentional startup hydration checks before measuring.
    await page.waitForTimeout(2800);
    const rescans=await page.evaluate(async()=>{
      const native=document.createTreeWalker.bind(document);
      let calls=0;
      document.createTreeWalker=(...args)=>{calls++;return native(...args);};
      const old=document.querySelector('[data-testid="conversation-turn-old"]');
      for(let i=0;i<48;i++){
        const span=document.createElement('span');
        span.textContent='Synthetic streamed token';
        old.append(span);
      }
      await new Promise(resolve=>setTimeout(resolve,550));
      const result=calls;
      document.createTreeWalker=native;
      return result;
    });
    assert.equal(rescans,0,'ordinary streamed text DOM must not rescan transcript tail');
    console.log('PASS '+name+': generating -> verifying -> confirmed; stable PNG and title; bounded streaming');
  }finally{
    await context.close();await browser.close();
  }
}
