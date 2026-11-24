import http from 'node:http';
﻿// Synthetic provider files and images exercise persistence without real credentials or AI usage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {AccountLedger,trackedBridge} from '../backend/accounts.mjs';
import {ImageLibrary} from '../backend/library.mjs';
import {WorkflowStore} from '../backend/workflows.mjs';
import {createApp} from '../server.mjs';
const A='first@example.invalid',B='second@example.invalid',TOKEN='SYNTHETIC-PRIVATE-CREDENTIAL';
const source=await sharp({create:{width:100,height:128,channels:4,background:'#a8b9c2'}}).png().toBuffer(),image='data:image/png;base64,'+source.toString('base64');
async function temporary(t){const dir=await mkdtemp(path.join(tmpdir(),'houtu-server-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function wait(check){for(let i=0;i<250;i++){const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Archive test timed out');}
class Bridge extends EventEmitter{
 constructor(home){super();this.home=home;this.calls=0;}
 async account(){const value=JSON.parse(await readFile(path.join(this.home,'auth.json'),'utf8'));return value.email?{email:value.email,plan:value.plan,accessToken:value.accessToken}:null;}
 async logout(){await writeFile(path.join(this.home,'auth.json'),JSON.stringify({email:null}));}
 async stop(){}
 async begin(job){this.calls++;job.threadId='archive-'+this.calls;job.turnId='turn';job.resolvedModel='fixture-vision';await job.onModelSelected?.(job.resolvedModel);const result=await sharp({create:{width:100,height:128,channels:4,background:this.calls===1?'#b5a68f':'#a58fba'}}).png().toBuffer();setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:result.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},15);}
 async critique(_image,_reference,_instructions,_extra,control){this.analysisCalls=(this.analysisCalls||0)+1;control.resolvedModel=control.model||'fixture-vision';await control.onModelSelected?.(control.resolvedModel);return {summary:'Synthetic color advice',settings:{exposure:.1},layers:[]};}
 async cancel(){}
}
async function fixture(t){const directory=await mkdtemp(path.join(tmpdir(),'houtu-server-test-')),home=path.join(directory,'codex');await mkdir(home,{recursive:true});const auth=email=>writeFile(path.join(home,'auth.json'),JSON.stringify({email,plan:'plus',accessToken:TOKEN,refreshToken:TOKEN}));await auth(A);const bridge=new Bridge(home),app=await createApp({directory,bridge,platform:{async close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port,{csrf}=await(await fetch(origin+'/api/health')).json();const post=async(route,input)=>{const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify(input)});return {status:response.status,value:await response.json()};};t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});return {directory,home,auth,bridge,app,origin,post};}

test('account ledger records only verified identity fields, survives restart, and rolls back failed writes',async t=>{
 const directory=await temporary(t),ledger=new AccountLedger(directory);await ledger.load();const first=await ledger.observe({email:A,plan:'plus',accessToken:TOKEN,refreshToken:TOKEN});assert.ok(first.id);assert.equal(ledger.records().length,1);await ledger.observe({email:A.toUpperCase(),plan:'pro'});assert.equal(ledger.records().length,1);assert.equal(ledger.current().account.id,first.id);
 const persisted=await readFile(ledger.file,'utf8');assert.ok(!persisted.includes(TOKEN));const reload=new AccountLedger(directory);await reload.load();assert.equal(reload.state.serverId,ledger.state.serverId);assert.equal(reload.current().status,'unknown');assert.equal(reload.records()[0].email,A);
 const original=reload.write.bind(reload);reload.write=async()=>{throw Error('Synthetic disk failure');};await assert.rejects(()=>reload.observe({email:B,plan:'plus'}),/disk failure/);assert.equal(reload.records().length,1);reload.write=original;await reload.observe({email:B,plan:'plus'});assert.equal(reload.records().length,2);
 await reload.observe(null,'explicitLogout');assert.equal(reload.current().status,'signedOut');assert.equal(reload.records().length,2);
});
test('server creates a private project data tree and serves an archive without exposing credentials',async t=>{
 const {directory,origin}=await fixture(t);for(const name of ['codex','jobs','library'])assert.ok((await stat(path.join(directory,name))).isDirectory());
 const response=await fetch(origin+'/api/server/status'),raw=await response.text(),status=JSON.parse(raw);assert.equal(status.dataRoot,path.resolve(directory));assert.equal(status.scope,'local');assert.equal(status.current.account.email,A);assert.equal(status.accounts.length,1);assert.ok(!raw.includes(TOKEN));assert.ok(!(await(await fetch(origin+'/api/state')).text()).includes(TOKEN));
 for(const file of ['/data/codex/auth.json','/data/library/accounts.json','/library/accounts.json'])assert.equal((await fetch(origin+file)).status,404);
 const host=await new Promise((resolve,reject)=>{const request=http.request(origin+'/api/server/status',{headers:{Host:'untrusted.example:4317'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);request.end();});assert.equal(host,403);
 assert.ok((await(await fetch(origin+'/server/')).text()).includes('图片档案'));assert.equal((await fetch(origin+'/color/server.js')).status,200);
});
test('completed image versions keep their actual account across switches, failed retry and a full service restart',async t=>{
 const {directory,home,auth,bridge,app,origin,post}=await fixture(t);const created=await post('/api/jobs',{image,paintLevel:4});assert.equal(created.status,202);const job=created.value;await wait(async()=>{const value=await(await fetch(origin+'/api/jobs/'+job.id)).json();return value.status==='done'&&value;});
 let gallery=await(await fetch(origin+'/api/server/images')).json();assert.equal(gallery.total,1);assert.equal(gallery.images[0].account.email,A);const record=gallery.images[0],before=createHash('sha256').update(await readFile(path.join(directory,'workflows',record.workflowId,'assets',record.assetId))).digest('hex');
 const thumbnail=await fetch(origin+record.thumbnailUrl);assert.equal(thumbnail.status,200);const metadata=await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();assert.ok(metadata.width<=480&&metadata.height<=480);assert.equal(createHash('sha256').update(await readFile(path.join(directory,'workflows',record.workflowId,'assets',record.assetId))).digest('hex'),before);
 await auth(B);await fetch(origin+'/api/server/status');let flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();const retry=await post('/api/workflows/'+job.workflowId+'/retry',{step:'generate',revision:flow.revision});assert.equal(retry.status,202);const blocked=await wait(async()=>{const value=await(await fetch(origin+'/api/jobs/'+job.id)).json();return value.status==='error'&&value;});assert.match(blocked.message,/账号.*不同/);assert.equal(bridge.calls,1);
 gallery=await(await fetch(origin+'/api/server/images')).json();assert.equal(gallery.total,1);assert.equal(gallery.images[0].account.email,A);
 await auth(A);await fetch(origin+'/api/server/status');flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();await post('/api/workflows/'+job.workflowId+'/retry',{step:'generate',revision:flow.revision});await wait(async()=>{const value=await(await fetch(origin+'/api/jobs/'+job.id)).json();return value.status==='done'&&value;});gallery=await(await fetch(origin+'/api/server/images')).json();assert.equal(gallery.total,2);assert.equal(bridge.calls,2);
 const credential=await readFile(path.join(home,'auth.json'),'utf8');await app.close();assert.equal(await readFile(path.join(home,'auth.json'),'utf8'),credential);
 const reopened=await createApp({directory,bridge:new Bridge(home),platform:{async close(){}}});await new Promise(resolve=>reopened.server.listen(0,'127.0.0.1',resolve));try{const base='http://127.0.0.1:'+reopened.server.address().port,status=await(await fetch(base+'/api/server/status')).json(),restored=await(await fetch(base+'/api/server/images')).json();assert.equal(restored.total,2);assert.equal(status.accounts.length,2);assert.equal(status.current.account.email,A);assert.equal((await fetch(base+record.downloadUrl)).status,200);}finally{await reopened.close();}
});
test('color exports retain the account of their own analysis attempt rather than the newest analysis',async t=>{
 const directory=await temporary(t),workflows=new WorkflowStore(directory),library=new ImageLibrary(directory);await workflows.load();await library.load();const w=await workflows.create({kind:'color',name:'Versioned grade'}),asset=await workflows.putAsset(w.id,source,'image/png'),first={id:randomUUID(),email:A,plan:'plus'},second={id:randomUUID(),email:B,plan:'pro'};await workflows.checkpoint(w.id,'source',{imageAsset:asset.id});
 for(const account of [first,second]){await workflows.checkpoint(w.id,'analysis',{account,model:'fixture-vision'});await workflows.checkpoint(w.id,'grade',{});await workflows.checkpoint(w.id,'export',{imageAsset:asset.id});}
 await library.refresh(new Map(),workflows);const values=library.list(new URLSearchParams()).images;assert.equal(values.length,2);assert.deepEqual(new Set(values.map(v=>v.account.email)),new Set([A,B]));assert.ok(values.every(v=>v.accountRole==='analysis'));
});
test('same-pixel creative render attempts remain separate and only their own delivery hides the render duplicate',async t=>{
 const directory=await temporary(t),workflows=new WorkflowStore(directory),library=new ImageLibrary(directory);await workflows.load();await library.load();const w=await workflows.create({kind:'creative',name:'Composite versions'}),asset=await workflows.putAsset(w.id,source,'image/png'),account={id:randomUUID(),email:A,plan:'plus'};await workflows.checkpoint(w.id,'source',{imageAsset:asset.id});await workflows.checkpoint(w.id,'layout',{});
 await workflows.checkpoint(w.id,'render',{imageAsset:asset.id,engine:'ChatGPT-image',account});await workflows.checkpoint(w.id,'deliver',{imageAsset:asset.id,engine:'ChatGPT-image',account});await workflows.checkpoint(w.id,'render',{imageAsset:asset.id,engine:'ChatGPT-image',account});
 await library.refresh(new Map(),workflows);const values=library.list(new URLSearchParams()).images;assert.equal(values.length,2);assert.deepEqual(new Set(values.map(v=>v.status)),new Set(['saved','waiting']));
});
test('archive scans beyond the old 100-workflow limit, supports paging and does not invent historical accounts',async t=>{
 const directory=await temporary(t),library=new ImageLibrary(directory);await library.load();const hash='a'.repeat(64),account={id:randomUUID(),email:B,plan:'pro'},jobId=randomUUID(),data=Array.from({length:125},(_,i)=>({id:randomUUID(),kind:'retouch',jobId:i===0?jobId:null,name:'History '+i,updated:i+1,steps:[{id:'generate',attempts:[{id:'g',status:'done',output:{rawAsset:hash}}]},{id:'compose',attempts:[{id:'c',status:'done',ended:i+1,inputs:[{step:'generate',attempt:'g'}],output:{imageAsset:hash}}]}]}));
 await library.refresh(new Map([[jobId,{id:jobId,status:'done',output:'result.png',account}]]),{all:async()=>data});const first=library.list(new URLSearchParams()),last=library.list(new URLSearchParams('page=6'));assert.equal(first.total,125);assert.equal(first.images.length,24);assert.equal(last.images.length,5);assert.ok(first.images.every(v=>v.account===null));assert.equal(library.list(new URLSearchParams('q=history%20124')).total,1);
 await assert.rejects(()=>library.thumbnail('../auth.json',new Map(),{}),/编号无效/);
});
test('connection uncertainty preserves account history and cannot authorize an AI call',async t=>{
 const directory=await temporary(t),ledger=new AccountLedger(directory);await ledger.load();let available=true,calls=0;const raw={async account(){if(!available)throw Error('Synthetic disconnected client');return {email:A,plan:'plus',accessToken:TOKEN};},async begin(){calls++;}};const bridge=trackedBridge(raw,ledger);assert.deepEqual(await bridge.account(),{email:A,plan:'plus'});const account=ledger.current().account;available=false;await assert.rejects(()=>bridge.account(),/disconnected/);assert.equal(ledger.current().status,'unknown');assert.equal(ledger.records().length,1);await assert.rejects(()=>bridge.begin({account}),'Unknown session cannot authorize');assert.equal(calls,0);
});
test('local recomposition keeps the original account attribution without calling AI under the newly logged account',async t=>{
 const {origin,auth,bridge,post}=await fixture(t);const created=await post('/api/jobs',{image}),job=created.value;await wait(async()=>{const value=await(await fetch(origin+'/api/jobs/'+job.id)).json();return value.status==='done'&&value;});await auth(B);await fetch(origin+'/api/server/status');const flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();const retry=await post('/api/workflows/'+job.workflowId+'/retry',{step:'compose',revision:flow.revision});assert.equal(retry.status,202);await wait(async()=>{const value=await(await fetch(origin+'/api/jobs/'+job.id)).json();return value.status==='done'&&value;});assert.equal(bridge.calls,1);const images=(await(await fetch(origin+'/api/server/images')).json()).images;assert.equal(images.length,2);assert.ok(images.every(record=>record.account.email===A));
});
test('changing a model cannot make a color workflow silently charge the newly logged account',async t=>{
 const {origin,auth,bridge,post}=await fixture(t),created=(await post('/api/workflows',{name:'Color owner'})).value,{csrf}=await(await fetch(origin+'/api/health')).json();
 const response=await fetch(origin+'/api/workflows/'+created.id+'/assets',{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'image/png'},body:source}),asset=await response.json();let attempt=(await post('/api/workflows/'+created.id+'/begin',{step:'source'})).value;await post('/api/workflows/'+created.id+'/complete',{step:'source',token:attempt.token,state:{imageAsset:asset.id}});
 attempt=(await post('/api/workflows/'+created.id+'/begin',{step:'analysis'})).value;const first=await post('/api/color/critique',{image,workflow:{id:created.id,token:attempt.token}});assert.equal(first.status,200);assert.equal(first.value.account.email,A);assert.equal(bridge.analysisCalls,1);
 await auth(B);await fetch(origin+'/api/server/status');const flow=await(await fetch(origin+'/api/workflows/'+created.id)).json();await post('/api/workflows/'+created.id+'/restart',{step:'analysis',revision:flow.revision});attempt=(await post('/api/workflows/'+created.id+'/begin',{step:'analysis'})).value;
 const blocked=await post('/api/color/critique',{image,model:'fixture-other-model',workflow:{id:created.id,token:attempt.token}});assert.equal(blocked.status,400);assert.match(blocked.value.error,/账号.*不同/);assert.equal(bridge.analysisCalls,1);
});
test('a verified same email can resume metadata copied from another local server without trusting foreign record IDs',async t=>{
 const directory=await temporary(t),ledger=new AccountLedger(directory);await ledger.load();let calls=0;const raw={async account(){return {email:A,plan:'plus'};},async begin(){calls++;}},bridge=trackedBridge(raw,ledger);await bridge.account();const actual=ledger.current().account;
 const copied={account:{id:randomUUID(),email:A.toUpperCase(),plan:'plus'}};await bridge.begin(copied);assert.equal(calls,1);assert.equal(copied.account.id,actual.id);
 await assert.rejects(()=>bridge.begin({account:{id:actual.id,email:B,plan:'plus'}}),/账号.*不同/);assert.equal(calls,1);
});
test('a client without a valid email cannot authorize paid AI calls or create a fabricated account record',async t=>{
 const directory=await temporary(t),ledger=new AccountLedger(directory);await ledger.load();let calls=0,email='';const raw={async account(){return {email,plan:'plus'};},async begin(){calls++;}};const bridge=trackedBridge(raw,ledger);
 for(email of ['', '@','not-an-email']){assert.equal(await bridge.account(),null);assert.equal(ledger.current().status,'unknown');await assert.rejects(()=>bridge.begin({}),/无法确认/);assert.equal(calls,0);}
 assert.deepEqual(ledger.records(),[]);
});
