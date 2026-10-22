#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(source.name,'Chat Signals');
assert.deepEqual(source.permissions,['storage']);
assert.equal(source.content_scripts.length,1);
assert.deepEqual(source.content_scripts[0].matches,['https://chatgpt.com/*']);
for(const p of ['README.md','AGENTS.md','docs/AUTOPSY.md','docs/SOURCES.md',
 'docs/STATE-MODEL.md','docs/ARCHITECTURE.md','src/content.js','src/state.js',
 'src/color.js','src/background.js']){
 assert.ok(fs.existsSync(path.join(root,p)),'missing '+p);
}
for(const p of ['src/content.js','src/state.js','src/color.js','src/background.js']){
 const s=fs.readFileSync(path.join(root,p),'utf8');
 assert.doesNotMatch(s,/\b(?:eval|new Function)\s*\(/);
 assert.doesNotMatch(s,/\bsetInterval\s*\(/);
}
console.log('PASS: manifest, allowed hosts, file inventory and static safety');
