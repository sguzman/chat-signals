// Isolated Firefox + Chromium smoke. Synthetic intercepted ChatGPT pages only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox,chromium} from 'playwright';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const scripts=await Promise.all(['src/color.js','src/state.js','src/alerts.js','src/chime.js','src/content.js'].map(read));
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
    await page.evaluate(()=>{
      window.__completionChimes=0;
      window.ChatSignalsChime={
        unlock:async()=> 'ready',
        play:async()=>{window.__completionChimes++;return 'scheduled';}
      };
    });
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
    // Regression: the site changes favicon links with NO title, response or
    // focus change. The independent icon observer must repair both changes.
    await page.evaluate(()=>{
      const old=document.querySelector('link[rel~="icon"]:not([data-chat-signals-icon])');
      old.setAttribute('href','/site-icon-overwrite.ico');
      old.setAttribute('type','image/x-icon');
      const added=document.createElement('link');added.rel='icon';
      added.href='/site-late-favicon.svg';added.type='image/svg+xml';
      added.dataset.syntheticLateIcon='1';
      document.head.append(added);
    });
    await page.waitForFunction(()=>{
      const candidates=[...document.querySelectorAll('link[rel~="icon"]')];
      const expected=document.querySelector('link[data-chat-signals-icon]')?.getAttribute('href');
      return expected?.startsWith('data:image/png;base64,')&&
        candidates.length===4&&candidates.every(link=>
          link.getAttribute('href')===expected&&
          link.getAttribute('type')==='image/png'&&!link.hasAttribute('sizes'));
    });
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.chatSignalsState),
      'idle','favicon correction must not alter response state');
    assert.equal(await page.title(),'⚪ Synthetic Chat',
      'favicon-only site changes must not cause a title rewrite');
    await page.evaluate(()=>{document.title='Synthetic Chat Renamed';});
    await page.waitForFunction(()=>document.title==='⚪ Synthetic Chat Renamed');
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
    await page.waitForFunction(()=>window.__completionChimes===1);
    await page.evaluate(()=>{
      const prev=document.querySelector('[data-testid="conversation-turn-old"]');
      const button=document.createElement('button');button.setAttribute('aria-label','Copy');
      prev.append(button);
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>window.__completionChimes),1,
      'a stale reply control must not trigger another chime');
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
    // Reproduce the reported inverse: status is correct but the site resets
    // the favicon later, without touching the title or response structure.
    const titleBeforeIconDrift=await page.title();
    await page.evaluate(()=>{
      const late=document.querySelector('[data-synthetic-late-icon]');
      late.href='/late-site-reset.ico';
      late.type='image/x-icon';
      const replacement=document.createElement('link');
      replacement.rel='icon';replacement.href='/new-site-icon.ico';
      replacement.dataset.postCompletionIcon='1';
      document.head.append(replacement);
    });
    await page.waitForFunction(()=>{
      const expected=document.querySelector('[data-chat-signals-icon]')?.getAttribute('href');
      return [...document.querySelectorAll('link[rel~="icon"]')]
        .every(link=>link.getAttribute('href')===expected&&
          link.getAttribute('type')==='image/png'&&!link.hasAttribute('sizes'));
    });
    assert.equal(await page.title(),titleBeforeIconDrift,
      'favicon repair must not alter the current title');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.chatSignalsState),
      'finished','favicon repair must not change response state');
    assert.equal(await page.evaluate(()=>window.__completionChimes),1,
      'favicon repair must not replay completion alerts');
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
      {href:'/synthetic-icon-b.svg',type:'image/svg+xml',sizes:'any'},
      // This late site-owned icon did not exist at initial paint. Respect the
      // source it had before the extension's subsequent correction.
      {href:'/site-late-favicon.svg',type:'image/svg+xml',sizes:null},
      {href:'/new-site-icon.ico',type:null,sizes:null}
    ],'disposing restores the original favicon declarations');
    // A long formatted reply may contain more than 768 DOM descendants
    // between its footer's Copy button and the assistant marker. The latest
    // turn wrapper, not a global/old Copy button, must be the action scope.
    const rich=await context.newPage();
    try{
      await rich.route('https://chatgpt.com/**',route=>route.fulfill({
        contentType:'text/html',body:html,status:200
      }));
      await rich.goto('https://chatgpt.com/c/synthetic-rich-terminal');
      for(const script of scripts)await rich.addScriptTag({content:script});
      await rich.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='idle');
      await rich.evaluate(()=>{
        const turn=document.createElement('div');
        turn.dataset.testid='conversation-turn-rich';
        const article=document.createElement('article');
        article.dataset.messageAuthorRole='assistant';
        const body=document.createElement('section');
        for(let i=0;i<1200;i++){
          const span=document.createElement('span');span.textContent='x';
          body.append(span);
        }
        article.append(body);turn.append(article);
        const footer=document.createElement('div');
        footer.className='rich-footer';turn.append(footer);
        document.querySelector('form').before(turn);
        const stop=document.createElement('button');
        stop.dataset.testid='fruitjuice-stop-button';
        document.querySelector('form').append(stop);
      });
      await rich.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='generating');
      await rich.evaluate(()=>{
        const old=document.querySelector('[data-testid="conversation-turn-old"]');
        const stale=document.createElement('button');
        stale.setAttribute('aria-label','Copy');
        old.append(stale);
      });
      await rich.waitForTimeout(450);
      assert.equal(await rich.evaluate(()=>
        document.documentElement.dataset.chatSignalsState),'generating',
        'a stale earlier Copy must not complete a large active reply');
      await rich.evaluate(()=>{
        document.querySelector('[data-testid="fruitjuice-stop-button"]').remove();
        const copy=document.createElement('button');
        copy.setAttribute('aria-label','Copy');
        document.querySelector('.rich-footer').append(copy);
      });
      await rich.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='finished');
      assert.equal(await rich.evaluate(()=>
        document.documentElement.dataset.chatSignalsReason),
        'fresh-assistant-terminal-action');
      assert.match(await rich.title(),/^✅ /u);
    }finally{await rich.close();}
    // Startup/reload while a response is already in progress: an unlabeled
    // square Stop action (observed Oct 2026) must override initial idle.
    // A screenshot/title-only test misses this failure entirely.
    const resumed=await context.newPage();
    try{
      await resumed.route('https://chatgpt.com/**',route=>route.fulfill({
        contentType:'text/html',body:html,status:200
      }));
      await resumed.goto('https://chatgpt.com/c/synthetic-active-after-reload');
      const stopGlyph='M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z';
      await resumed.evaluate(glyph=>{
        const form=document.querySelector('form');
        form.dataset.chatgptComposer='1';
        const stop=document.createElement('button');stop.type='button';
        stop.className='size-token-button-composer';
        stop.innerHTML='<svg class="icon-primary-action"><path /></svg>';
        stop.querySelector('path').setAttribute('d',glyph);
        form.append(stop);
        // Identical icon outside composer must never be used as a Stop signal.
        const other=document.createElement('button');
        other.innerHTML=stop.innerHTML;document.body.append(other);
      },stopGlyph);
      for(const script of scripts)await resumed.addScriptTag({content:script});
      await resumed.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='generating');
      assert.match(await resumed.title(),/^⏳ /u,
        'restored actively generating tab must not remain idle');
      assert.equal(await resumed.evaluate(()=>document.documentElement.dataset.chatSignalsReason),
        'stop-visible');
      // Composer changes Stop -> Send in place by changing the SVG path
      // attribute; a structural-only MutationObserver misses that transition.
      await resumed.evaluate(()=>{
        document.querySelector('form button.size-token-button-composer svg path')
          .setAttribute('d','M0 0 L10 10');
      });
      await resumed.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='verifying');
      assert.match(await resumed.title(),/^🔎 /u);
    }finally{await resumed.close();}
    // An unrelated square icon must not create a generating state.
    const noStop=await context.newPage();
    try{
      await noStop.route('https://chatgpt.com/**',route=>route.fulfill({
        contentType:'text/html',body:html,status:200
      }));
      await noStop.goto('https://chatgpt.com/c/synthetic-not-generating');
      await noStop.evaluate(()=>{
        const other=document.createElement('button');
        other.type='button';other.className='size-token-button-composer';
        other.innerHTML='<svg class="icon-primary-action"><path d="M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z"/></svg>';
        document.body.append(other);
      });
      for(const script of scripts)await noStop.addScriptTag({content:script});
      await noStop.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='idle');
      assert.match(await noStop.title(),/^⚪ /u);
    }finally{await noStop.close();}
    // A genuine Send button is a second independent submission path.
    // Simulate a quick response with no observed Stop control at all.
    const quick=await context.newPage();
    try{
      await quick.route('https://chatgpt.com/**',route=>route.fulfill({
        contentType:'text/html',body:html,status:200
      }));
      await quick.goto('https://chatgpt.com/c/synthetic-chat-quick');
      for(const script of scripts)await quick.addScriptTag({content:script});
      await quick.evaluate(()=>{
        window.__completionChimes=0;
        window.ChatSignalsChime={
          unlock:async()=> 'ready',
          play:async()=>{window.__completionChimes++;return 'scheduled';}
        };
      });
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='idle');
      await quick.evaluate(()=>{
        const send=document.createElement('button');send.dataset.testid='send-button';
        send.type='button';send.textContent='Send';document.querySelector('form').append(send);
        send.click();
      });
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='submitted');
      assert.match(await quick.title(),/^📤 /u);
      await quick.evaluate(()=>{
        const turn=document.createElement('div');
        turn.dataset.testid='conversation-turn-new';
        // Realistic nested reply: controls belong to the turn, not to article.
        turn.innerHTML='<article data-message-author-role="assistant">'+
          '<div class="answer-shell"></div></article>'+
          '<div class="turn-action-controls">'+
          '<button aria-label="Thumbs up">Like</button></div>';
        document.querySelector('main').append(turn);
      });
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='generating');
      assert.match(await quick.title(),/^⏳ /u);
      // Nonterminal toolbar buttons, even under .turn-action-controls, must
      // never be mistaken for a completed response.
      await quick.waitForTimeout(400);
      assert.equal(await quick.evaluate(()=>
        document.documentElement.dataset.chatSignalsState),'generating');
      assert.equal(await quick.evaluate(()=>window.__completionChimes),0);
      // An old reply can have a freshly rebuilt Copy button. That must
      // not finish the new, still incomplete assistant turn.
      await quick.evaluate(()=>{
        const old=document.querySelector('[data-testid="conversation-turn-old"]');
        const rebuilt=document.createElement('button');
        rebuilt.setAttribute('aria-label','Copy');
        old.append(rebuilt);
      });
      await quick.waitForTimeout(400);
      assert.equal(await quick.evaluate(()=>
        document.documentElement.dataset.chatSignalsState),'generating');
      // Simulate finishing while hidden, then viewing the tab. The latter
      // must never create a second completion cue.
      await quick.evaluate(()=>{
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      });
      // No Stop button: a terminal Copy action beside, not inside, the new
      // assistant article confirms the current response finished.
      await quick.evaluate(()=>{
        const action=document.createElement('button');
        action.dataset.testid='copy-turn-action-button';
        action.textContent='Copy';
        document.querySelector('[data-testid="conversation-turn-new"] .turn-action-controls')
          .append(action);
      });
      await quick.waitForFunction(()=>document.documentElement.dataset.chatSignalsState==='finished');
      await quick.waitForFunction(()=>document.title.startsWith('🔔 '));
      await quick.waitForFunction(()=>window.__completionChimes===1);
      await quick.evaluate(()=>{
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await quick.waitForFunction(()=>document.title.startsWith('✅ '));
      await quick.waitForTimeout(400);
      assert.equal(await quick.evaluate(()=>window.__completionChimes),1,
        '🔔 unread -> ✅ viewed must not replay the chime');
    }finally{await quick.close();}
    // Regression: completion while hidden must be recognized from terminal
    // DOM changes alone. Visiting the tab is never the completion trigger.
    // The current reply's Copy action is CSS-hidden (not laid out) and may be
    // enabled by an in-place aria-label change after Stop disappears.
    for(const [scenario,copyBeforeStopEnds] of [
      ['copy-after-stop',false],['copy-before-stop',true]
    ]){
      const hiddenReply=await context.newPage();
      try{
        await hiddenReply.route('https://chatgpt.com/**',route=>route.fulfill({
          contentType:'text/html',body:html,status:200
        }));
        await hiddenReply.goto('https://chatgpt.com/c/synthetic-hidden-'+scenario);
        for(const script of scripts)await hiddenReply.addScriptTag({content:script});
        await hiddenReply.evaluate(()=>{
          window.__completionSounds=[];
          window.ChatSignalsChime={
            unlock:async()=> 'ready',
            play:async sound=>{window.__completionSounds.push(sound);return 'scheduled';}
          };
          Object.defineProperty(document,'hidden',
            {configurable:true,get:()=>true});
        });
        await hiddenReply.waitForFunction(()=>
          document.documentElement.dataset.chatSignalsState==='idle');
        await hiddenReply.evaluate(()=>{
          const editor=document.querySelector('#prompt-textarea');
          editor.dispatchEvent(new KeyboardEvent('keydown',
            {key:'Enter',bubbles:true,cancelable:true}));
          const turn=document.createElement('article');
          turn.dataset.testid='conversation-turn-current';
          turn.innerHTML='<div data-message-author-role="assistant">'+
            '<div class="streaming-body"></div></div>'+
            '<div class="turn-action-controls">'+
            '<button id="final-copy" aria-label="Pending"'+
            ' style="display:none">Copy</button></div>';
          document.querySelector('form').before(turn);
          const stop=document.createElement('button');
          stop.dataset.testid='fruitjuice-stop-button';
          document.querySelector('form').append(stop);
        });
        await hiddenReply.waitForFunction(()=>
          document.documentElement.dataset.chatSignalsState==='generating');
        if(copyBeforeStopEnds){
          await hiddenReply.evaluate(()=>
            document.querySelector('#final-copy').setAttribute('aria-label','Copy'));
          await hiddenReply.waitForTimeout(350);
          assert.equal(await hiddenReply.evaluate(()=>
            document.documentElement.dataset.chatSignalsState),'generating',
            'Copy before Stop disappearance cannot imply completion');
        }
        await hiddenReply.evaluate(()=>
          document.querySelector('[data-testid="fruitjuice-stop-button"]').remove());
        if(!copyBeforeStopEnds){
          await hiddenReply.waitForFunction(()=>
            document.documentElement.dataset.chatSignalsState==='verifying');
          assert.equal(await hiddenReply.evaluate(()=>
            window.__completionSounds.length),0);
          await hiddenReply.evaluate(()=>
            document.querySelector('#final-copy').setAttribute('aria-label','Copy'));
        }
        await hiddenReply.waitForFunction(()=>
          document.documentElement.dataset.chatSignalsState==='finished',
          null,{timeout:5000});
        assert.match(await hiddenReply.title(),/^🔔 /u,
          'completion occurs while document.hidden, without visiting tab');
        assert.deepEqual(await hiddenReply.evaluate(()=>
          window.__completionSounds),['success']);
        assert.equal(await hiddenReply.evaluate(()=>
          document.querySelector('#final-copy').getClientRects().length),0,
          'CSS-hidden Copy is still structurally owned by the current reply');
        await hiddenReply.evaluate(()=>{
          Object.defineProperty(document,'hidden',
            {configurable:true,get:()=>false});
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await hiddenReply.waitForFunction(()=>document.title.startsWith('✅ '));
        assert.deepEqual(await hiddenReply.evaluate(()=>
          window.__completionSounds),['success'],
          'visiting only changes read status, never sends another completion');
      }finally{await hiddenReply.close();}
    }
    // Distinct UI-confirmed warnings/errors/limits, with no repeated sound
    // for repeated DOM observations of the same synthetic event.
    for(const [kind,statusText,expectedSound] of [
      ['interrupted','Connection interrupted. Waiting for the complete answer','warning'],
      ['failed','Something went wrong','error'],
      ['limit','Conversation is too long','limit']
    ]){
      const diagnostic=await context.newPage();
      try{
        await diagnostic.route('https://chatgpt.com/**',route=>route.fulfill({
          contentType:'text/html',body:html,status:200
        }));
        await diagnostic.goto('https://chatgpt.com/c/synthetic-notice-'+kind);
        for(const script of scripts)await diagnostic.addScriptTag({content:script});
        await diagnostic.evaluate(()=>{
          window.__sounds=[];
          window.__eventNotifications=[];
          window.chrome={runtime:{sendMessage:(payload,callback)=>{
            if(payload.type==='chat-signals-event')window.__eventNotifications.push(payload);
            callback?.({created:true});
          }}};
          window.ChatSignalsChime={
            unlock:async()=> 'ready',
            play:async type=>{window.__sounds.push(type);return 'scheduled';}
          };
        });
        await diagnostic.waitForFunction(()=>
          document.documentElement.dataset.chatSignalsState==='idle');
        await diagnostic.evaluate(()=>{
          document.getElementById('prompt-textarea').dispatchEvent(
            new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        });
        await diagnostic.waitForFunction(()=>
          document.documentElement.dataset.chatSignalsState==='submitted');
        await diagnostic.evaluate(text=>{
          const notice=document.createElement('div');
          notice.setAttribute('role','alert');notice.textContent=text;
          document.querySelector('main').append(notice);
        },statusText);
        await diagnostic.waitForFunction(kind=>
          document.documentElement.dataset.chatSignalsState===kind,kind);
        await diagnostic.waitForFunction(()=>window.__sounds.length===1);
        assert.deepEqual(await diagnostic.evaluate(()=>window.__sounds),
          [expectedSound]);
        const notification=await diagnostic.evaluate(()=>{
          const item=window.__eventNotifications[0];
          const favicon=document.querySelector('link[data-chat-signals-icon]')?.href;
          return {event:item?.event,iconUrl:item?.iconUrl,
            favicon,amount:window.__eventNotifications.length};
        });
        assert.equal(notification.amount,1,'only one notification event');
        const expectedKind=kind==='interrupted'?'interruption':
          kind==='failed'?'failure':kind;
        assert.equal(notification.event,expectedKind);
        assert.ok(notification.iconUrl?.startsWith('data:image/png;base64,'));
        assert.ok(notification.favicon?.startsWith('data:image/png;base64,'));
        assert.notEqual(notification.iconUrl,notification.favicon,
          'severity emblem appears only on the notification icon');
        await diagnostic.evaluate(()=>{
          const alert=document.querySelector('[role="alert"]');
          const sibling=document.createElement('span');sibling.textContent='Unrelated';
          alert.append(sibling);sibling.remove();
        });
        await diagnostic.waitForTimeout(350);
        assert.deepEqual(await diagnostic.evaluate(()=>window.__sounds),
          [expectedSound],'no duplicate alert from incidental DOM mutation');
      }finally{await diagnostic.close();}
    }
    // A short, unlabelled error banner beside Retry is failure evidence,
    // even when the new assistant turn also receives a Copy action.
    const inputError=await context.newPage();
    try{
      await inputError.route('https://chatgpt.com/**',route=>route.fulfill({
        contentType:'text/html',body:html,status:200
      }));
      await inputError.goto('https://chatgpt.com/c/synthetic-input-stream-error');
      for(const script of scripts)await inputError.addScriptTag({content:script});
      await inputError.evaluate(()=>{
        window.__sounds=[];
        window.ChatSignalsChime={
          unlock:async()=> 'ready',
          play:async kind=>{window.__sounds.push(kind);return 'scheduled';}
        };
      });
      await inputError.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='idle');
      // Identical words inside a chat reply must not count as a status.
      await inputError.evaluate(()=>{
        const old=document.querySelector('[data-message-author-role="assistant"]');
        const text=document.createElement('p');
        text.textContent='Error in input stream';old.append(text);
      });
      await inputError.waitForTimeout(350);
      assert.equal(await inputError.evaluate(()=>
        document.documentElement.dataset.chatSignalsState),'idle');
      await inputError.evaluate(()=>{
        document.querySelector('#prompt-textarea').dispatchEvent(
          new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        const stop=document.createElement('button');
        stop.dataset.testid='fruitjuice-stop-button';
        document.querySelector('form').append(stop);
      });
      await inputError.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='generating');
      await inputError.evaluate(()=>{
        document.querySelector('[data-testid="fruitjuice-stop-button"]').remove();
        const fresh=document.createElement('article');
        fresh.dataset.testid='conversation-turn-new';
        fresh.innerHTML='<div data-message-author-role="assistant">'+
          '<button aria-label="Copy">Copy</button></div>';
        document.querySelector('main').append(fresh);
        const banner=document.createElement('div');
        banner.dataset.syntheticStreamError='1';
        banner.innerHTML='<span>Error in input stream</span><button>Retry</button>';
        document.querySelector('main').append(banner);
      });
      await inputError.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='failed');
      assert.match(await inputError.title(),/^⚠️ /u);
      assert.equal(await inputError.evaluate(()=>
        document.documentElement.dataset.chatSignalsReason),
        'visible-input-stream-error');
      await inputError.waitForFunction(()=>window.__sounds.length===1);
      assert.deepEqual(await inputError.evaluate(()=>window.__sounds),['error']);
      await inputError.waitForTimeout(350);
      assert.deepEqual(await inputError.evaluate(()=>window.__sounds),['error'],
        'same visible stream error must not repeat the failure alert');
    }finally{await inputError.close();}
    // The live ChatGPT interruption banner can be an ordinary div, without
    // role=alert or a test id. Appearance, reappearance, and recovery must
    // all be observable, with a single warning sound per attempt.
    const banner=await context.newPage();
    try{
      await banner.route('https://chatgpt.com/**',route=>route.fulfill({
        contentType:'text/html',body:html,status:200
      }));
      await banner.goto('https://chatgpt.com/c/synthetic-interruption-banner');
      for(const script of scripts)await banner.addScriptTag({content:script});
      await banner.evaluate(()=>{
        window.__sounds=[];
        window.ChatSignalsChime={
          unlock:async()=> 'ready',
          play:async kind=>{window.__sounds.push(kind);return 'scheduled';}
        };
      });
      await banner.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='idle');
      await banner.evaluate(()=>{
        document.querySelector('#prompt-textarea').dispatchEvent(
          new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        const el=document.createElement('div');
        el.id='plain-connection-banner';
        el.textContent='Connection interrupted. Waiting for the complete answer';
        document.querySelector('main').append(el);
      });
      await banner.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='interrupted');
      assert.match(await banner.title(),/^🔌 /u);
      assert.deepEqual(await banner.evaluate(()=>window.__sounds),[],
        'a new interruption must not immediately sound a warning');
      await banner.evaluate(()=>
        document.querySelector('#plain-connection-banner').remove());
      await banner.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='verifying');
      await banner.waitForTimeout(5300);
      assert.deepEqual(await banner.evaluate(()=>window.__sounds),[],
        'a recovered connection cannot deliver a delayed warning');
      await banner.evaluate(()=>{
        const el=document.createElement('div');el.id='plain-connection-banner';
        el.textContent='Connection interrupted. Waiting for the complete answer';
        document.querySelector('main').append(el);
      });
      await banner.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='interrupted');
      await banner.waitForFunction(()=>window.__sounds.length===1,
        null,{timeout:12000});
      assert.deepEqual(await banner.evaluate(()=>window.__sounds),['warning'],
        'a persistent interruption must still warn');
      await banner.evaluate(()=>
        document.querySelector('#plain-connection-banner').remove());
      await banner.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='verifying');
      await banner.evaluate(()=>{
        const el=document.createElement('div');el.id='plain-connection-banner';
        el.textContent='Connection interrupted. Waiting for the complete answer';
        document.querySelector('main').append(el);
      });
      await banner.waitForFunction(()=>
        document.documentElement.dataset.chatSignalsState==='interrupted');
      await banner.waitForTimeout(5300);
      assert.deepEqual(await banner.evaluate(()=>window.__sounds),['warning'],
        'same-epoch repeat interruption must not chime again');
    }finally{await banner.close();}
    console.log('PASS '+name+': confirmed completion, 🔔->✅ silence, and one-shot warning/error/limit cues');
  }finally{
    await context.close();await browser.close();
  }
}
