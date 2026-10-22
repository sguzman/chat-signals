const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const manifest=require('../manifest.json');
test('narrow cross-browser MV3 with Firefox event page and Chromium worker',()=>{
 assert.equal(manifest.manifest_version,3);
 assert.deepEqual(manifest.permissions,['storage']);
 assert.deepEqual(manifest.background.scripts,['src/color.js','src/background.js']);
 assert.equal(manifest.background.service_worker,'src/background.js');
 assert.deepEqual(manifest.content_scripts[0].matches,['https://chatgpt.com/*']);
 assert.equal(manifest.content_scripts[0].all_frames,false);
 assert.equal(manifest.host_permissions,undefined);
});
test('no self-observing head, tab sweep, network, transcript access or hot injection',()=>{
 const content=fs.readFileSync('src/content.js','utf8');
 const worker=fs.readFileSync('src/background.js','utf8');
 assert.match(content,/observer\.observe\(main,/);
 assert.doesNotMatch(content,/observer\.observe\(document\.(?:head|body)/);
 assert.doesNotMatch(content,/textContent.*(?:assistant|lastAssistant)/);
 assert.doesNotMatch(content,/fetch\(|XMLHttpRequest|localStorage|setInterval\(/);
 assert.doesNotMatch(worker,/tabs\.query\(|executeScript\(|fetch\(|setInterval\(/);
});
