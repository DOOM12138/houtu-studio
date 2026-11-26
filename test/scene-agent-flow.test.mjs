import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {createApp} from '../server.mjs';
import {agentOptions} from '../public/retouch-agent-options.js';

const picture=async(color,w=96,h=128)=>sharp({create:{width:w,height:h,channels:3,background:color}}).png().toBuffer();
const original=await picture('#606090'),output=await picture('#667199'),refs=await Promise.all(['#6699aa','#6d6548','#9944aa','#6e966b'].map(c=>picture(c,64,64)));
const observations=(...kinds)=>kinds.map(kind=>({kind,detail:'实际测试造型 '+kind}));
const profile={scene:{kind:'convention',confidence:'high',cues:observations('event-sign','crowd')},character:{kind:'fictional',name:'雷电将军',work:'原神',confidence:'high',cues:observations('outfit','prop','emblem')},appearanceTags:['purple-hair','sword'],lighting:'mixed'};
const pairs=(...kinds)=>kinds.map(kind=>({kind,source:'本图可见 '+kind,reference:'参考图可见 '+kind,agreement:'match'}));
class Bridge extends EventEmitter{
 reads=[];images=[];profile=profile;
 async stop(){}async cancel(){}async account(){return {email:'scene@test.invalid',plan:'fixture'};}async models(){return [];}
 async analyzeImages(files,prompt,c){this.reads.push({prompt,count:files.length});c.resolvedModel='isolated-scene-reader';await c.onModelSelected?.(c.resolvedModel);
  if(prompt.startsWith('你是二次元'))return {summary:'按图中线索分析',subjectPresent:true,observations:[],queries:[{query:'private query must not reach search',purpose:'style'}],waistBox:null,sceneProfile:this.profile};
  if(prompt.startsWith('你是嵌入式')){
   const ref=JSON.parse(prompt.match(/角色表：(\[[^\n]*?\])。/)[1]),actions=JSON.parse(prompt.match(/只能安排这些实际节点(\[[^\]]*\])/)[1]);
   const reviews=ref.map(r=>({assetId:r.id,role:r.role,decision:'use',cues:r.role==='lighting'?pairs('lighting'):pairs('prop','emblem')}));
   const wrong=ref.findIndex(r=>r.title==='不同徽记');if(wrong>=0)reviews[wrong].cues[0].agreement='different';
   const hypothesis=ref.find(r=>r.role==='appearance');
   return {summary:'按场景执行所选任务',selectedReferences:ref.map(r=>r.id),referenceReviews:reviews,
    roleHypothesis:hypothesis?{name:'雷电将军',work:'原神',confidence:'medium',referenceAssetId:hypothesis.id}:null,
    actions:actions.map(id=>({id,prompt:id==='person'?'保留现有眼妆和服装。':'按原有场景调整。',parameters:id==='color'?{settings:{exposure:.22,temperature:25}}:id==='effects'?{effect:'rain',amount:.25}:{}}))};
  }
  if(prompt.includes('只返回JSON {aligned:boolean'))return {aligned:true,complete:true,backgroundExcluded:true,edgesAcceptable:true,confidence:.96,summary:'隔离蒙版检查'};
  return {pass:true,severity:'minor',summary:'测试对照通过',checks:['scope','identity','lighting','seams','color'].map(key=>({key,pass:true,note:'fixture'})),repairable:false,repairStage:null,repairPrompt:''};
 }
 async begin(job,prompt,file,context,referenceFiles=[]){job.threadId='fixture-'+job.id;job.turnId='turn';this.images.push({prompt,refCount:referenceFiles.length});let result=output;
  if(prompt.includes('仅生成原图主体的像素级黑白保护蒙版'))result=await sharp({create:{width:96,height:128,channels:3,background:'black'}}).composite([{input:await picture('#ffffff',46,80),left:24,top:24}]).png().toBuffer();
  setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:result.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},15);
 }
}
async function fixture(t,raw=profile){
 const data=await fs.mkdtemp(path.join(tmpdir(),'scene-auto-')),bridge=new Bridge();bridge.profile=raw;
 const queries=[],catalog=[],record={status:'matched-record',id:'Q111655115',name:'雷电将军',work:'原神',enName:'Raiden Shogun',enWork:'Genshin Impact',workId:'Q65059474',url:'https://www.wikidata.org/wiki/Q111655115'};
 const app=await createApp({directory:data,bridge,automaticUpdateChecks:false,platform:{async close(){}},agentHardware:{snapshot:async()=>({platform:'linux',arch:'x64',ramBytes:4*1024**3,freeRamBytes:1024**3,gpus:[]})},agentCharacterLookup:async c=>{catalog.push(c.name);return record;},
  agentSearch:async q=>{queries.push(q);const found=q.includes('Raiden')?[[0,'匹配造型'],[1,'不同徽记']]:q.includes('mixed')||q.includes('convention')?[[2,'场景光色']]:[[3,'外观素材']];
   return found.map(([k,title])=>({title,url:'https://commons.wikimedia.org/wiki/File:'+k,image:String(k),license:'CC BY-SA 4.0',creator:'fixture'}));},agentFetchAsset:async url=>({bytes:refs[Number(url)]})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port,get=async u=>(await fetch(origin+u)).json(),csrf=(await get('/api/health')).csrf;
 const post=async(u,v)=>{const r=await fetch(origin+u,{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify(v)});const j=await r.json();assert.ok(r.ok,JSON.stringify(j));return j;};
 const project=await post('/api/studio/projects',{name:'场景测试'});await fetch(origin+'/api/studio/projects/'+project.id+'/photos?name=fixture.png',{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf},body:original});const p=await get('/api/studio/projects/'+project.id);
 const run=async config=>{const batch=await post('/api/studio/projects/'+p.id+'/agents',{requestKey:randomUUID(),revision:p.revision,photoIds:[p.photos[0].id],config,concurrency:1});return batch.mappings[0].childWorkflowId;};
 const idle=async()=>{for(let n=0;n<550;n++){if(!app.studio.active)return;await new Promise(r=>setTimeout(r,20));}throw Error('Agent queue did not settle');};
 t.after(async()=>{await app.close();await fs.rm(data,{recursive:true,force:true});});return {app,bridge,queries,catalog,run,idle,post,get,p};
}
test('one unattended scene pipeline verifies design and light separately, grades the actual image and forks corrections without inspecting again',async t=>{
 const f=await fixture(t),id=await f.run(agentOptions({tasks:['portrait','color'],sceneGuide:{},hardwarePolicy:'cloud',autoSearch:true,quality:true}));await f.idle();let w=await f.get('/api/retouch-agents/'+id);
 assert.deepEqual(w.steps.map(s=>s.id),['source','inspect','references','plan','subject','person','color','check','deliver']);assert.ok(w.steps.every(s=>s.status==='done'),w.steps.map(s=>s.id+':'+s.message).join(','));
 const node=id=>w.steps.find(s=>s.id===id).output;
 assert.equal(node('inspect').sceneProfile.scene.kind,'convention');assert.equal(node('inspect').sceneProfile.character.name,'雷电将军');assert.equal(node('inspect').analysis.guideVersion,w.config.sceneGuide.version);
 assert.equal(node('references').catalog.status,'matched-record');assert.deepEqual(f.catalog,['雷电将军']);assert.ok(f.queries.some(q=>q.includes('Raiden')));assert.ok(!f.queries.some(q=>q.includes('private')));
 const plan=node('plan').plan,bad=node('references').references.find(r=>r.title==='不同徽记');assert.ok(bad);assert.ok(!plan.selectedReferences.includes(bad.assetId));assert.equal(plan.referenceSupport,'visual-agreement');
 assert.equal(node('color').engine,'local-sRGB');assert.equal(node('color').settings.temperature,12);assert.match(node('color').sceneProtection,/调色/);assert.notEqual(node('color').imageAsset,node('person').imageAsset);
 assert.equal(f.bridge.images.length,2,'cloud subject mask and a single portrait turn');assert.match(f.bridge.images[1].prompt,/核对可见服装与道具/);assert.ok(!f.bridge.images[1].prompt.includes('不同徽记'));assert.equal(node('person').promptVersion,w.config.sceneGuide.version);assert.ok(w.tutorials.length>=15);
 const inspections=()=>f.bridge.reads.filter(r=>r.prompt.startsWith('你是二次元')).length;
 const branch=await f.post('/api/retouch-agents/'+id+'/branch',{revision:w.revision,step:'references',requestKey:randomUUID(),mode:'manual',sceneGuide:{scene:'studio',character:'',work:''}});
 await f.idle();const next=await f.get('/api/retouch-agents/'+branch.childWorkflowId),inspection=next.steps.find(s=>s.id==='inspect').output;
 assert.equal(inspection.sceneProfile.scene.kind,'studio');assert.equal(inspection.sceneProfile.scene.detected,'convention');assert.equal(inspection.correction.origin,'user');assert.equal(inspections(),1);assert.equal(f.bridge.images.length,2);
 assert.equal(next.steps.find(s=>s.id==='plan').status,'pending');assert.equal((await f.get('/api/retouch-agents/'+id)).steps.find(s=>s.id==='inspect').output.sceneProfile.scene.kind,'convention');
});
test('unknown initial name uses visible traits; a visually supported reference can propose a role, while paint/effects stay independent',async t=>{
 const f=await fixture(t,{...profile,character:{...profile.character,kind:'unknown',name:'',work:'',confidence:'low'}}),id=await f.run(agentOptions({tasks:['portrait','color','effects','paint'],style:'cos',paintLevel:4,effect:'mist',sceneGuide:{},hardwarePolicy:'cloud'}));await f.idle();const w=await f.get('/api/retouch-agents/'+id),node=id=>w.steps.find(s=>s.id===id).output;
 assert.equal(w.steps.at(-1).status,'done',w.steps.map(s=>s.message).join(' / '));assert.ok(f.queries.every(q=>!q.includes('Raiden')&&!q.includes('雷电')));assert.equal(node('inspect').sceneProfile.character.name,'');
 assert.equal(node('plan').plan.sceneProfile.character.status,'reference-candidate');assert.equal(node('plan').plan.roleCatalogue.work,'原神');assert.equal(node('effects').effect,'mist');assert.match(f.bridge.images[1].prompt,/程度4\/10/);assert.ok(w.tutorials.some(r=>r.evidence.includes('厚涂')));assert.equal(f.bridge.images.length,2);
});
test('manual scene corrections remain manual with no search or analysis and unchecked graphs cause zero external calls',async t=>{
 const f=await fixture(t),id=await f.run(agentOptions({tasks:['color'],sceneGuide:{scene:'studio'},mode:'manual',provider:'local',autoSearch:true,quality:false}));await f.idle();const w=await f.get('/api/retouch-agents/'+id);
 await f.post('/api/retouch-agents/'+id+'/manual-plan',{revision:w.revision,plan:{summary:'本人指定方案',actions:[{id:'color',parameters:{settings:{exposure:.1}}}]}});
 const next=await f.get('/api/retouch-agents/'+id);assert.equal(next.steps.find(s=>s.id==='plan').output.plan.sceneProfile.scene.kind,'studio');assert.deepEqual([f.catalog.length,f.queries.length,f.bridge.images.length,f.bridge.reads.length],[0,0,0,0]);
});
