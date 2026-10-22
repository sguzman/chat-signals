// Isolated Firefox + Chromium smoke. Synthetic intercepted ChatGPT pages only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox,chromium} from 'playwright';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const scripts=await Promise.all(['src/color.js','src/state.js','src/content.js'].map(read));
const html='<!doctype html><html><head><title>Synthetic Chat</title>'+
  '<link rel="icon" href="/synthetic-icon-a.ico" type="image/x-icon" sizes="16x16">'+
  '<link rel="icon" href="/synthetic-icon-b.svg" type="image/svg+xml" sizes="any">'+
  '</head><body>'+
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
    assert.equal(initial.title,'⚪ Synthetic Chat');
    const faviconCandidates=await page.evaluate(()=>[...document.querySelectorAll('link[rel~="icon"]:not([data-chat-signals-icon])')].map(link=>({
      png:link.getAttribute('href')?.startsWith('data:image/png;base64,'),
      type:link.getAttribute('type'),
      sizes:link.getAttribute('sizes')
    })));
    assert.equal(faviconCandidates.length,2);
    assert.ok(faviconCandidates.every(x=>x.png&&x.type==='image/png'&&x.sizes===null),
      'existing SVG/ICO favicon links must not outrank the allocated color');
    // Neither an unrelated Enter nor Shift+Enter counts as submission.
    const blocked=await page.evaluate(()=>{
      const el=document.querySelector('#prompt-textarea');
      const other=document.createElement('input');document.body.append(other);
      other.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));
      return document.documentElement.dataset.chatSignalsState;
    });
    assert.equal(blocked,'idle','unrelated and newline Enter must not trigger state');
    await page.evaluate(()=>{
      document.querySelector('#prompt-textarea').dispatchEvent(
        new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    });
    await page.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='submitted');
    assert.match(await page.title(),/^📤 /u);
    await page.evaluate(()=>{
      const button=document.createElement('button');
      button.type='button';button.dataset.testid='fruitjuice-stop-button';
      button.textContent='Stop';
      document.getElementById('composer').append(button);
    });
    await page.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='generating');
    assert.match(await page.title(),/^⏳ /u);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.chatSignalsReason),'stop-visible');
    // React/site title rewrites must not permanently erase a live emoji.
    await page.evaluate(()=>{document.title='Synthetic Chat';});
    await page.waitForFunction(()=>document.title.startsWith('⏳ '));
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.chatSignalsState),'generating');
    await page.evaluate(()=>{
      document.querySelector('[data-testid="fruitjuice-stop-button"]').remove();
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
    await page.evaluate(()=>{document.title='Synthetic Chat';});
    await page.waitForFunction(()=>document.title.startsWith('✅ '));
    // Bounded: even pathological repeated title rewrites cannot create an
    // unbounded feedback loop or spur a new response state.
    const writes=await page.evaluate(async()=>{
      let repairs=0;
      let source=document,descriptor=null;
      while(source&&!descriptor){
        descriptor=Object.getOwnPropertyDescriptor(source,'title');
        source=Object.getPrototypeOf(source);
      }
      if(!descriptor?.get||!descriptor?.set)throw Error('Document title accessor unavailable');
      Object.defineProperty(document,'title',{
        configurable:true,
        get(){return descriptor.get.call(document);},
        set(next){
          if(String(next).startsWith('✅ '))repairs++;
          return descriptor.set.call(document,next);
        }
      });
      try{
        for(let i=0;i<30;i++){
          document.title='Synthetic Chat';
          await Promise.resolve();
          await Promise.resolve();
        }
        await new Promise(resolve=>setTimeout(resolve,200));
        return repairs;
      }finally{delete document.title;}
    });
    assert.ok(writes<=12,'title recovery writes must have a strict per-minute cap');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.chatSignalsState),'finished');
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
    const restored=await page.evaluate(()=>{
      window.__chatSignalsOwner.dispose();
      return [...document.querySelectorAll('link[rel~="icon"]')].map(link=>({
        href:link.getAttribute('href'),type:link.getAttribute('type'),
        sizes:link.getAttribute('sizes')
      }));
    });
    assert.deepEqual(restored,[
      {href:'/synthetic-icon-a.ico',type:'image/x-icon',sizes:'16x16'},
      {href:'/synthetic-icon-b.svg',type:'image/svg+xml',sizes:'any'}
    ],'disposing restores the original favicon declarations');
    // A genuine Send button is a second independent submission path.
    // Simulate a quick response with no observed Stop control at all.
    const quick=await context.newPage();
    try{
      await quick.route('https://chatgpt.com/**',route=>route.fulfill({
        contentType:'text/html',body:html,status:200
      }));
      await quick.goto('https://chatgpt.com/c/synthetic-chat-quick');
      for(const script of scripts)await quick.addScriptTag({content:script});
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='idle');
      await quick.evaluate(()=>{
        const send=document.createElement('button');send.dataset.testid='send-button';
        send.type='button';send.textContent='Send';document.querySelector('form').append(send);
        send.click();
      });
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='submitted');
      assert.match(await quick.title(),/^📤 /u);
      await quick.evaluate(()=>{
        const reply=document.createElement('article');
        reply.dataset.testid='conversation-turn-new';
        reply.dataset.turn='assistant';
        reply.innerHTML='<div class="answer-shell"></div>';
        document.querySelector('main').append(reply);
      });
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='generating');
      assert.match(await quick.title(),/^⏳ /u);
      // No Stop button: a terminal Copy action still certifies completion.
      await quick.evaluate(()=>{
        const action=document.createElement('button');
        action.dataset.testid='copy-turn-action-button';
        action.textContent='Copy';
        document.querySelector('[data-testid="conversation-turn-new"]').append(action);
      });
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='finished');
      assert.match(await quick.title(),/^✅ /u);
    }finally{await quick.close();}
    console.log('PASS '+name+': submit -> generating -> verifying -> finished and assistant turn -> generating -> finished (no Stop)');
  }finally{
    await context.close();await browser.close();
  }
}
