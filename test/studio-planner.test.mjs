import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../server.mjs';
import {planningCapacity,checkedProposal} from '../backend/studio-planner.mjs';
import {planningOptions,localProposal} from '../public/studio-planning.js';

const png=await sharp({create:{width:96,height:128,channels:4,background:'#ad9275'}}).png().toBuffer();
const blue=await sharp({create:{width:96,height:128,channels:4,background:'#6688aa'}}).png().toBuffer();
const recipe={name:'规划测试',stages:[{type:'export',options:{format:'png'}}]};
const proposal=()=>({summary:'保留原图身份与服装，合并轻微人物整理到一次跑图。',recipe:{name:'人物细化',stages:[{type:'retouch',name:'一次人物细化',options:{operation:'portrait-polish',style:'natural',prompt:'保留原图身份、服装与构图，轻柔整理人物。'}},{type:'export',options:{format:'png'}}]}});
class Bridge extends EventEmitter{
 email='planner@example.invalid';accounts=0;analyses=0;images=0;failAt=0;blocked=false;pending=null;
 async account(){this.accounts++;return {email:this.email,plan:'test'};}
 async analyzeImages(files,prompt,c){this.analyses++;assert.ok(files.length>=1);assert.match(prompt,/只分析图片并规划/);if(this.analyses===this.failAt)throw Error('synthetic analysis failure');c.resolvedModel='planner-test';c.threadId='analysis-'+this.analyses;c.turnId='turn';await c.onModelSelected?.(c.resolvedModel);if(this.blocked)await new Promise((resolve,reject)=>this.pending={resolve,reject});return proposal();}
 async begin(job){this.images++;job.threadId='fake-thread-'+job.id;job.turnId='fake-turn';job.resolvedModel='render-test';await job.onModelSelected?.(job.resolvedModel);setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:blue.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},40);}
 async cancel(){this.pending?.reject(Error('Synthetic analysis interrupted'));this.pending=null;}async stop(){}
}
async function fixture(t){
 const directory=await mkdtemp(path.join(tmpdir(),'studio-planner-')),bridge=new Bridge();let app,origin,csrf;
 async function start(){app=await createApp({directory,bridge,automaticUpdateChecks:false,platform:{async close(){}},targetAnalyzer:async bytes=>{const m=await sharp(bytes).metadata();return {supported:true,found:true,mask:await sharp({create:{width:m.width,height:m.height,channels:3,background:'white'}}).png().toBuffer(),policy:'isolated-test'};}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.server.address().port;csrf=(await get('/api/health')).csrf;}
 const get=async route=>{const r=await fetch(origin+route);assert.ok(r.ok,await r.clone().text());return r.json();};
 const raw=async(route,data)=>{const r=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Paint-CSRF':csrf},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 const post=async(route,data)=>{const r=await raw(route,data);assert.ok(r.status<300,JSON.stringify(r));return r.body;};
 const upload=async(id,bytes,name)=>{const r=await fetch(origin+'/api/studio/projects/'+id+'/photos?name='+name,{method:'POST',headers:{Origin:origin,'Content-Type':'image/png','X-Paint-CSRF':csrf},body:bytes});assert.ok(r.ok,await r.clone().text());return r.json();};
 const wait=async(id)=>{for(let i=0;i<300;i++){const v=await get('/api/studio/plans/'+id);if(v.status!=='running')return v;await new Promise(r=>setTimeout(r,10));}throw Error('Planning timed out');};
 const idle=async id=>{for(let i=0;i<300;i++){const p=await get('/api/studio/projects/'+id);if(!['running','pausing'].includes(p.queue.state))return p;await new Promise(r=>setTimeout(r,10));}throw Error('Run timed out');};
 await start();t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
 return {get,post,raw,upload,wait,idle,bridge,get app(){return app;},restart:async()=>{await app.close();await start();}};
}
async function project(f,two=false){const p=await f.post('/api/studio/projects',{recipe});await f.upload(p.id,png,'one.png');if(two)await f.upload(p.id,blue,'two.png');return f.get('/api/studio/projects/'+p.id);}
function options(p,provider='local'){return {provider,revision:p.revision,photoIds:p.photos.map(x=>x.id),tasks:['portrait'],style:'natural',maxAiSteps:2,analysisModel:'planner-test',generationModel:'render-test',observations:p.photos.map(x=>({photoId:x.id,workflowId:x.workflowId,originalAsset:x.originalAsset,engine:'mediapipe-browser-v1',person:{found:true,coverage:.5},face:{found:true,coverage:.08}}))};}

test('capacity chooses an honest local-model route and bounded image concurrency',()=>{
 assert.equal(planningCapacity({memory:32*1024**3,cores:8}).recommended,'local');
 assert.equal(planningCapacity({memory:3*1024**3,cores:2}).recommended,'chatgpt');
 assert.equal(planningCapacity({memory:32*1024**3,cores:8,modelsReady:false}).localSupported,false);
 assert.equal(planningCapacity({memory:6*1024**3,cores:4}).concurrency,1);
});
test('planner rejects unrequested body, style, grade, excessive steps and coordinates',()=>{
 const o=planningOptions({provider:'local',revision:0,photoIds:['00000000-0000-0000-0000-000000000000'],tasks:['portrait']}),p={photoId:'photo',name:'test',references:[],maskPresent:false};
 for(const change of [{operation:'smooth-belly'},{operation:'anime-paint',style:'anime'},{selection:{x:0,y:0,width:1,height:1}}]){const v=proposal();Object.assign(v.recipe.stages[0].options,change);assert.throws(()=>checkedProposal(v,o,p));}
 const many=proposal();many.recipe.stages.splice(0,0,...Array.from({length:2},()=>structuredClone(many.recipe.stages[0])));assert.throws(()=>checkedProposal(many,o,p),/上限/);
 const missing=localProposal({...o,tasks:['portrait']},{person:{found:false},face:{found:false}},{});assert.equal(missing.recipe.stages.filter(s=>s.type==='retouch').length,0);
});
test('local planning reads no ChatGPT account, persists each recipe, applies once and undoes the group',async t=>{
 const f=await fixture(t),p=await project(f,true),created=await f.post('/api/studio/projects/'+p.id+'/plans',options(p));
 const plan=await f.wait(created.workflowId);assert.equal(plan.status,'ready');assert.equal(plan.items.length,2);assert.equal(f.bridge.accounts,0);assert.equal(f.bridge.analyses,0);assert.equal(f.bridge.images,0);
 assert.equal(plan.items[0].analysis.observation.clientReported,true);assert.equal(plan.items[0].recipe.model,'render-test');
 const applied=await f.post('/api/studio/plans/'+plan.workflowId+'/apply',{revision:p.revision});assert.equal(applied.versions.length,2);assert.equal(f.bridge.images,0);
 const newer=await f.get('/api/studio/projects/'+p.id);assert.equal(newer.history.entries.length,1);assert.equal(newer.history.entries[0].label,'应用智能调度方案');
 await f.restart();assert.equal((await f.get('/api/studio/plans/'+plan.workflowId)).status,'applied');
 assert.equal((await f.post('/api/studio/plans/'+plan.workflowId+'/apply',{revision:newer.revision})).alreadyApplied,true);
 const unchanged=await f.get('/api/studio/projects/'+p.id);assert.deepEqual(unchanged.photos.map(p=>p.workflowId),newer.photos.map(p=>p.workflowId));
 await f.post('/api/studio/projects/'+p.id+'/history',{direction:'undo',revision:unchanged.revision});
 assert.deepEqual((await f.get('/api/studio/projects/'+p.id)).photos.map(p=>p.workflowId),p.photos.map(p=>p.workflowId));assert.equal(f.bridge.images,0);
 assert.equal((await f.raw('/api/studio/plans/'+plan.workflowId+'/apply',{revision:unchanged.revision+1})).status,409);
});
test('cloud planning preserves a completed photo on retry, pins the planning account and keeps generation separate',async t=>{
 const f=await fixture(t),p=await project(f,true);f.bridge.failAt=2;
 const {workflowId}=await f.post('/api/studio/projects/'+p.id+'/plans',options(p,'chatgpt'));let view=await f.wait(workflowId);assert.equal(view.status,'error');assert.equal(view.items.length,1);assert.equal(f.bridge.images,0);
 f.bridge.email='other@example.invalid';await f.post('/api/studio/plans/'+workflowId+'/retry',{});view=await f.wait(workflowId);assert.equal(view.status,'error');assert.equal(f.bridge.analyses,2);
 f.bridge.email='planner@example.invalid';await f.post('/api/studio/plans/'+workflowId+'/retry',{});view=await f.wait(workflowId);assert.equal(view.status,'ready');assert.equal(f.bridge.analyses,3);assert.equal(view.items[0].analysis.resolvedModel,'planner-test');
 await f.post('/api/studio/plans/'+workflowId+'/apply',{revision:p.revision});await f.post('/api/studio/projects/'+p.id+'/run',{mode:'auto',photoIds:p.photos.map(x=>x.id),concurrency:2});
 const finished=await f.idle(p.id);assert.equal(finished.queue.state,'done',finished.queue.message);assert.equal(f.bridge.images,2);
 await f.restart();await f.post('/api/studio/projects/'+p.id+'/run',{mode:'auto',photoIds:p.photos.map(x=>x.id),concurrency:2});assert.equal((await f.idle(p.id)).queue.state,'done');assert.equal(f.bridge.images,2);
});
test('stale plans and observations cannot target another photo version',async t=>{
 const f=await fixture(t),p=await project(f),bad=options(p);bad.observations[0].originalAsset='0'.repeat(64);
 assert.equal((await f.raw('/api/studio/projects/'+p.id+'/plans',bad)).status,400);
 const {workflowId}=await f.post('/api/studio/projects/'+p.id+'/plans',options(p));await f.wait(workflowId);
 await f.post('/api/studio/projects/'+p.id+'/photos/'+p.photos[0].id,{rating:3});const current=await f.get('/api/studio/projects/'+p.id);
 assert.equal((await f.raw('/api/studio/plans/'+workflowId+'/apply',{revision:current.revision})).status,409);
 assert.equal((await f.get('/api/studio/projects/'+p.id)).photos[0].workflowId,p.photos[0].workflowId);assert.equal(f.bridge.images,0);
});
test('automatic preflight considers task complexity without logging in or generating images',async t=>{
 const f=await fixture(t),p=await project(f),o=options(p,'auto');
 const light=await f.post('/api/studio/projects/'+p.id+'/planning-preflight',o);assert.equal(light.provider,'local');
 const reference=await f.post('/api/studio/projects/'+p.id+'/planning-preflight',{...o,goal:'参考同角色照片的冷暖光影，保留服装颜色。'});assert.equal(reference.provider,'chatgpt');
 const paint=await f.post('/api/studio/projects/'+p.id+'/planning-preflight',{...o,tasks:['paint'],style:'cos'});assert.equal(paint.provider,'chatgpt');assert.equal(f.bridge.accounts,0);assert.equal(f.bridge.images,0);
});
test('analysis owns the shared slot, can be stopped and resumes only after explicit retry',async t=>{
 const f=await fixture(t),p=await project(f);f.bridge.blocked=true;
 const {workflowId}=await f.post('/api/studio/projects/'+p.id+'/plans',options(p,'chatgpt'));
 for(let i=0;i<100&&!f.bridge.pending;i++)await new Promise(r=>setTimeout(r,5));assert.ok(f.bridge.pending);assert.equal(f.app.isBusy(),true);
 assert.equal((await f.raw('/api/studio/projects/'+p.id+'/plans',options(p,'chatgpt'))).status,409);
 await f.post('/api/studio/plans/'+workflowId+'/cancel',{});assert.equal((await f.wait(workflowId)).status,'interrupted');assert.equal(f.bridge.images,0);
 f.bridge.blocked=false;await f.post('/api/studio/plans/'+workflowId+'/retry',{});assert.equal((await f.wait(workflowId)).status,'ready');assert.equal(f.bridge.images,0);
});
test('proposal boundaries protect the venue subject, original frame and selected medium',()=>{
 const photo={photoId:'photo',name:'test',references:[],maskPresent:false},base={provider:'local',revision:0,photoIds:['00000000-0000-0000-0000-000000000000']};
 const clean=planningOptions({...base,tasks:['clean']}),background=proposal();background.recipe.stages[0].options.operation='background';assert.throws(()=>checkedProposal(background,clean,photo));
 background.recipe.stages[0].options={operation:'clear-background',style:'natural',scene:{protectSubject:false}};const protectedPlan=checkedProposal(background,clean,photo);assert.equal(protectedPlan.recipe.stages[0].options.scene.protectSubject,true);assert.ok(protectedPlan.needsInput.length);
 const portrait=planningOptions({...base,tasks:['portrait']}),crop=proposal();crop.recipe.stages.unshift({type:'local',options:{rotate:90,ratio:'1:1'}});assert.throws(()=>checkedProposal(crop,portrait,photo),/裁切|旋转/);
 const medium=planningOptions({...base,tasks:['paint'],style:'cos',paintLevel:6}),anime=proposal();anime.recipe.stages[0].options={operation:'anime-paint',style:'anime'};assert.throws(()=>checkedProposal(anime,medium,photo),/媒介|风格/);
 const omitted=proposal();omitted.recipe.stages[0].options={operation:'full-body'};assert.equal(checkedProposal(omitted,portrait,photo).recipe.stages[0].options.style,'natural');
 const grade={summary:'影调选择测试',recipe:{stages:[{type:'grade',options:{look:{id:'bright-air',amount:60}}},{type:'export',options:{format:'png'}}]}};assert.throws(()=>checkedProposal(grade,planningOptions({...base,tasks:['color'],tone:'dark'}),photo),/影调/);
});
