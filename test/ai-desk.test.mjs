import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {deskRecipe} from '../backend/ai-desk-runs.mjs';
import {PRESETS} from '../public/catalog.js';
import {moveOperation,listOperation,stageOptions} from '../public/desk-controls.js';
import {deskFixture} from './helpers/desk-fixture.mjs';

test('all existing operations remain selectable and the queue preserves order without modifying its input',()=>{
 const ids=PRESETS.map(t=>t.id),recipe=deskRecipe({mode:'semi',operations:ids});
 assert.equal(ids.length,75);assert.deepEqual(recipe.stages.slice(0,-1).map(s=>s.options.operation),ids);
 assert.deepEqual(moveOperation(['skin','face'],'face',-1),['face','skin']);
 assert.deepEqual(listOperation(['skin','face'],'skin',false),['face']);
 assert.throws(()=>deskRecipe({mode:'semi',operations:[]}));assert.throws(()=>deskRecipe({mode:'semi',operations:['custom','custom']}));
 const auto=deskRecipe({mode:'auto',auto:{paint:false,effects:false}});assert.deepEqual(auto.stages[0].options.tasks,['portrait','color']);
 assert.deepEqual(deskRecipe({mode:'auto',auto:{paint:true,effects:true}}).stages[0].options.tasks,['portrait','color','paint','effects']);
});

test('a confirmed tool runs once, pauses, survives restart, chains exact inputs and locally finishes without another AI call',async t=>{
 const f=await deskFixture();t.after(()=>f.close());const source=await f.source(),key=randomUUID(),intent={mode:'semi',operations:['soft-glow','clear-background'],requestKey:key,source};
 const [v,same]=await Promise.all([f.ok('/api/studio/ai-runs',intent),f.ok('/api/studio/ai-runs',intent)]);
 assert.equal(v.id,same.id);assert.equal(f.bridge.images.length,0);
 assert.equal((await f.raw('/api/studio/ai-runs',{...intent,operations:['blemish']})).status,409);
 const u='/api/studio/ai-runs/'+v.id;assert.equal((await f.raw('/api/studio/projects/'+v.id+'/run',{mode:'auto'})).status,409);
 const first={workflowId:v.workflowId,revision:v.revision,step:v.next,options:{operation:'soft-glow',task:{autoTarget:false}}};
 const results=await Promise.all([f.raw(u+'/next',first),f.raw(u+'/next',first)]);assert.ok(results.some(r=>r.status===202));assert.ok(results.some(r=>r.status===409));
 let result=await f.wait(v.id);assert.equal(result.queue,'paused');assert.equal(result.next,'stage2');assert.equal(f.bridge.images.length,1);assert.ok(result.result.attemptId);
 assert.equal((await f.raw(u+'/next',first)).status,409);assert.equal(f.bridge.images.length,1);
 const ref1=result.result;await f.restart();result=await f.ok(u);assert.equal(result.result.attemptId,ref1.attemptId);assert.equal(result.next,'stage2');
 const second={workflowId:v.workflowId,step:result.next,revision:result.revision,options:{operation:'clear-background',scene:{protectSubject:true},task:{autoTarget:false}}};
 await f.ok(u+'/next',second);result=await f.wait(v.id);assert.equal(result.done,true,result.message);assert.equal(result.queue,'done');assert.equal(result.result.stepId,'deliver');
 assert.equal(f.bridge.subjects,1);assert.equal(f.bridge.images.length,2);assert.equal(f.bridge.images[1].source,ref1.assetId);
 const flow=await f.ok('/api/workflows/'+v.workflowId);assert.deepEqual(flow.deskReviews.stage2.inputOrigin,ref1);assert.equal(flow.steps[0].output.imageAsset,source.assetId);
 const child=await f.ok('/api/workflows/'+result.steps[1].child);assert.equal(child.sourceOrigin.stepId,ref1.stepId);assert.equal(child.sourceOrigin.attemptId,ref1.attemptId);
 assert.equal((await f.raw(u+'/next',second)).status,409);assert.equal(f.bridge.images.length,2);
});

test('full auto runs scene analysis, selected edits and delivery on the server without frontend polling',async t=>{
 const f=await deskFixture();t.after(()=>f.close());const source=await f.source(),v=await f.ok('/api/studio/ai-runs',{mode:'auto',auto:{},requestKey:randomUUID(),source,model:'test-model'});assert.equal(f.bridge.images.length,0);assert.equal(f.bridge.reads.length,0);
 await f.ok('/api/studio/ai-runs/'+v.id+'/next',{workflowId:v.workflowId,step:v.next,revision:v.revision});
 await new Promise(r=>setTimeout(r,220));const done=await f.wait(v.id);assert.ok(done.done,done.message);
 assert.deepEqual(done.agent.steps.map(s=>s.id),['source','inspect','references','plan','subject','person','color','check','deliver']);
 assert.equal(f.bridge.images.length,2);assert.equal(done.result.stepId,'deliver');
});

test('missing per-step references and custom prompts fail before generating; correction keeps same step',async t=>{
 const f=await deskFixture();t.after(()=>f.close());const v=await f.ok('/api/studio/ai-runs',{mode:'semi',operations:['outfit-transfer','custom'],source:await f.source(),requestKey:randomUUID()});
 const u='/api/studio/ai-runs/'+v.id,cmd={workflowId:v.workflowId,step:v.next,revision:v.revision,options:stageOptions('outfit-transfer')};
 assert.ok((await f.raw(u+'/next',cmd)).status>=400);assert.equal(f.bridge.images.length,0);
 const img=await sharp({create:{width:40,height:50,channels:3,background:'blue'}}).png().toBuffer();
 await f.ok(u+'/next',{...cmd,options:{...cmd.options,task:{autoTarget:false}},references:[{title:'图片1',role:'outfit',image:'data:image/png;base64,'+img.toString('base64')}]});const result=await f.wait(v.id);assert.equal(result.next,'stage2');assert.equal(f.bridge.images.length,1);assert.equal(f.bridge.images[0].refs,1);
});

test('a missing reference can be explicitly skipped without a paid request and a later custom step still requires its own text',async t=>{
 const f=await deskFixture();t.after(()=>f.close());const v=await f.ok('/api/studio/ai-runs',{mode:'semi',operations:['outfit-transfer','custom'],source:await f.source(),requestKey:randomUUID()});
 const u='/api/studio/ai-runs/'+v.id,step=run=>({workflowId:run.workflowId,step:run.next,revision:run.revision});
 await f.ok(u+'/next',{...step(v),decision:'skip'});let n=await f.wait(v.id);assert.equal(n.steps[0].skipped,true);assert.equal(n.result.assetId,v.source.assetId);assert.equal(n.next,'stage2');assert.equal(f.bridge.images.length,0);
 assert.equal((await f.raw(u+'/next',{...step(n),options:{operation:'custom',prompt:''}})).status,400);
 n=await f.ok(u);await f.ok(u+'/next',{...step(n),options:{operation:'custom',prompt:'只整理衣服上的灰点，保留衣料。'}});n=await f.wait(v.id);assert.ok(n.done);assert.equal(f.bridge.images.length,1);assert.match(f.bridge.images[0].prompt,/灰点/);
});

test('stopping a busy semi task interrupts only its owned outstanding turn and never submits the second operation',async t=>{
 const f=await deskFixture();t.after(()=>f.close());const v=await f.ok('/api/studio/ai-runs',{mode:'semi',operations:['lighting','soft-glow'],source:await f.source(),requestKey:randomUUID()}),u='/api/studio/ai-runs/'+v.id;
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 f.bridge.begin=async job=>{f.bridge.images.push(job.id);job.threadId='owned-'+job.id;job.turnId='turn';entered();await gate;};
 f.bridge.cancel=async job=>{f.bridge.emit('notification','turn/completed',{threadId:job.threadId,turn:{id:'turn',status:'interrupted'}});release();};
 try{
  await f.ok(u+'/next',{step:v.next,workflowId:v.workflowId,revision:v.revision,options:{operation:'lighting'}});await started;
  assert.equal((await f.raw('/api/studio/ai-runs',{mode:'semi',operations:['face'],source:v.origin,requestKey:randomUUID()})).status,409);
  await f.ok(u+'/cancel',{workflowId:v.workflowId});const result=await f.wait(v.id);assert.ok(!result.done);assert.equal(result.steps[1].status,'pending');assert.equal(f.bridge.images.length,1);
 }finally{release();}
});

test('an imported half-automatic project uses its own archived source; inconsistent mode metadata cannot silently run',async t=>{
 const f=await deskFixture(),fresh=await deskFixture();t.after(()=>f.close());t.after(()=>fresh.close());const source=await f.source(),run=await f.ok('/api/studio/ai-runs',{mode:'semi',operations:['lighting','soft-glow'],source,requestKey:randomUUID()});
 const part=await f.ok('/api/studio/projects/'+run.id+'/backup',{}),archive=await f.ok(part.downloadUrl);
 const copy=await fresh.ok('/api/studio/restore',archive),view=await fresh.ok('/api/studio/ai-runs/'+copy.id);
 assert.equal(view.source.workflowId,view.origin.workflowId);assert.notEqual(view.origin.workflowId,source.workflowId);assert.equal(view.recordedOrigin.workflowId,source.workflowId);
 const local=await fetch(fresh.origin+'/api/workflows/'+view.origin.workflowId+'/assets/'+view.origin.assetId);assert.equal(local.status,200);assert.equal(fresh.bridge.images.length,0);
 archive.payload.project.aiDesk.mode='auto';archive.sha256=createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex');assert.ok((await fresh.raw('/api/studio/restore',archive)).status>=400);
});

test('canvas drafts survive backend restart and reject stale writes and invalid history before modifying the file',async t=>{
 const f=await deskFixture();t.after(()=>f.close());const original=await f.source(),origin={...original,stepId:'source'},id=randomUUID(),u='/api/studio/canvas-drafts/'+id;
 const payload={revision:0,name:'稳定画布',origin,nodes:[{parent:null,label:'原图',action:null},{parent:0,label:'亮度',action:{type:'tone',target:'global',values:{exposure:.15}}}],cursor:1,redo:{0:1},pins:{},viewport:{zoom:1.5,panX:.1,panY:0}};
 assert.equal((await f.ok(u,payload)).revision,1);assert.equal((await f.raw(u,payload)).status,409);
 const invalid=structuredClone(payload);invalid.nodes[1].parent=1;invalid.revision=1;assert.ok((await f.raw(u,invalid)).status>=400);
 await f.restart();const saved=await f.ok(u);assert.equal(saved.cursor,1);assert.equal(saved.nodes[1].action.values.exposure,.15);assert.equal(saved.revision,1);assert.equal(saved.viewport.zoom,1.5);
 const index=await f.ok('/api/studio/canvas-drafts');assert.equal(index.photos.length,1);assert.equal(index.photos[0].metadataOnly,true);assert.equal(index.photos[0].nodes,undefined);
});

test('auto desk forwards an explicit search source and alias to the scene recipe',()=>{
 const auto=deskRecipe({mode:'auto',auto:{character:' 影宝 ',work:'原神'}}).stages[0].options;
 assert.equal(auto.referenceProvider,'xiaohongshu');
 assert.equal(auto.allowPublicFallback,false);
 assert.equal(auto.sceneGuide.character,'影宝');
 assert.equal(auto.sceneGuide.work,'原神');
 assert.equal(deskRecipe({mode:'auto',auto:{referenceProvider:'douyin'}}).stages[0].options.referenceProvider,'douyin');
 assert.equal(deskRecipe({mode:'auto',auto:{referenceProvider:'commons'}}).stages[0].options.referenceProvider,'commons');
 assert.equal(deskRecipe({mode:'auto',auto:{referenceProvider:'none'}}).stages[0].options.autoSearch,false);
 assert.throws(()=>deskRecipe({mode:'auto',auto:{referenceProvider:'other'}}),/来源/);
 assert.throws(()=>deskRecipe({mode:'auto',auto:{character:'https://example.test'}}),/角色/);
});
