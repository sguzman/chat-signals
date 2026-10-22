const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../src/color.js');
const sample=n=>`https://chatgpt.com/c/synthetic-chat-${String(n).padStart(6,'0')}`;

test('identity is scoped, query-independent and rejects arbitrary pages',()=>{
 const normal=colors.identity(sample(1));
 const project=colors.identity('https://chatgpt.com/g/g-p-example123/c/synthetic123');
 const alternateProject=colors.identity('https://chatgpt.com/project/example123/c/synthetic123');
 const gpt=colors.identity('https://chatgpt.com/g/g-example123/c/synthetic123');
 assert.equal(normal.kind,'chat');
 assert.equal(project.kind,'project');
 assert.equal(alternateProject.kind,'project');
 assert.equal(gpt.kind,'gpt');
 assert.notEqual(colors.hash(project.key),colors.hash(gpt.key));
 assert.equal(colors.identity('https://chatgpt.com/g/synthetic123/c/synthetic123'),null);
 assert.deepEqual(colors.identity(sample(1)+'?private=1'),normal);
 assert.equal(colors.identity('https://example.com/c/synthetic123'),null);
 assert.equal(colors.identity('https://chatgpt.com/'),null);
});
test('OKLab palette and identity colors are deterministic',()=>{
 assert.equal(colors.palette.length,72);
 assert.equal(new Set(colors.palette.map(x=>x.hex)).size,72);
 assert.equal(colors.choose('test'),colors.choose('test'));
 for(const x of colors.palette){
   assert.match(x.hex,/^#[0-9a-f]{6}$/);
   assert.equal(x.lab.length,3);
 }
});
test('active allocation separates the first 24 synthetic conversations',()=>{
 const occupied=[];
 for(let i=0;i<24;i++){
   const key=colors.hash(colors.identity(sample(i)).key);
   const next=colors.choose(key,occupied);
   assert.ok(!occupied.includes(next),'collision in first 24');
   occupied.push(next);
 }
 assert.equal(new Set(occupied).size,24);
});
