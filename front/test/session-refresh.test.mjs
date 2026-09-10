import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory=await mkdtemp(join(tmpdir(),'vianko-session-'));
await build({entryPoints:['src/lib/session-refresh.ts'],bundle:true,platform:'node',format:'esm',outfile:join(directory,'session.mjs'),define:{'import.meta.env':'{"VITE_API_URL":"/api/v1","PROD":false}'}});
test.after(()=>rm(directory,{recursive:true,force:true}));
test('two independent tabs serialize refresh and reuse the stored result',async()=>{
 const storage=new Map();global.window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}};
 let chain=Promise.resolve();Object.defineProperty(global,'navigator',{configurable:true,value:{locks:{request:(_name,callback)=>{const next=chain.then(callback);chain=next.catch(()=>{});return next;}}}});
 const session={user:{id:'user'},tokens:{accessToken:'old',refreshToken:'refresh-old',expiresIn:900,expiresAt:'2000-01-01T00:00:00Z'}};
 storage.set('vianko-day.auth',JSON.stringify(session));let calls=0;const previous=global.fetch;
 global.fetch=async()=>{calls++;return new Response(JSON.stringify({tokens:{accessToken:'new',refreshToken:'refresh-new',expiresIn:900}}));};
 try {
  const a=await import(pathToFileURL(join(directory,'session.mjs'))+'?a');const b=await import(pathToFileURL(join(directory,'session.mjs'))+'?b');
  const results=await Promise.all([a.refreshSharedSession(session),b.refreshSharedSession(session)]);
  assert.equal(calls,1);assert.equal(results[0].tokens.refreshToken,'refresh-new');assert.deepEqual(results[0],results[1]);
  assert.ok(Date.parse(results[0].tokens.expiresAt)>Date.now());
 }finally{global.fetch=previous;}
});
