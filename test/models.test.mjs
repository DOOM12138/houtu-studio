import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {CodexBridge} from '../lib/codex.mjs';
import {normalizeEditOptions} from '../lib/painting.mjs';
import {templateValue} from '../lib/templates.mjs';
import {createApp} from '../server.mjs';
import {WorkflowStore} from '../backend/workflows.mjs';
import {CreativeService} from '../backend/creative.mjs';
const A='test-vision-a',B='test-vision-b';
const catalog=[{id:A,name:'Test Vision A',isDefault:true},{id:B,name:'Test Vision B',isDefault:false}];
const png=await sharp({create:{width:80,height:96,channels:3,background:'#b5a48f'}}).png().toBuffer(),image='data:image/png;base64,'+png.toString('base64');
const areas=['face','eyes','skin','hair','hands','outfit','accessories','light'];
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(check){for(let i=0;i<200;i++){const result=await check();if(result)return result;await pause();}throw Error('Test wait timed out');}

function rpc(){const bridge=new CodexBridge('unused-test-home'),calls=[];bridge.start=async()=>{};bridge.request=async(method,params)=>{calls.push({method,params});if(method==='model/list')return {data:catalog.map(x=>({...x,model:x.id,displayName:x.name,inputModalities:['text','image']})),nextCursor:null};if(method==='thread/start')return {thread:{id:'thread-model'},model:params.model||A};if(method==='turn/start')return {turn:{id:'turn-model'}};};return {bridge,calls};}

test('model catalog paginates, filters hidden and text-only entries, supports old catalogs, and protects cached values',async()=>{
 const {bridge,calls}=rpc();bridge.request=async(method,params)=>{calls.push({method,params});return params.cursor?{data:[{model:B,displayName:'B legacy'}],nextCursor:null}:{data:[{model:A,displayName:'A',inputModalities:['image']},{model:'hidden',hidden:true},{model:'text-only',inputModalities:['text']}],nextCursor:'page-2'};};
 const models=await bridge.models();assert.deepEqual(models.map(x=>x.id),[A,B]);assert.equal(calls[1].params.cursor,'page-2');models[0].name='mutated';assert.equal((await bridge.models())[0].name,'A');assert.equal(calls.length,2);await bridge.models({refresh:true});assert.equal(calls.length,4);
 const cyclic=rpc().bridge;cyclic.request=async()=>({data:[],nextCursor:'same'});await assert.rejects(()=>cyclic.models(),/分页异常/);
});
test('selected model reaches thread and turn; actual model is persisted before a paid turn, and failures never fall back',async()=>{
 const {bridge,calls}=rpc();const job={directory:'isolated-test',model:B,onModelSelected:async actual=>{assert.equal(actual,B);calls.push({method:'persist-model'});}};
 await bridge.begin(job,'edit','source.png');const thread=calls.find(x=>x.method==='thread/start'),turn=calls.find(x=>x.method==='turn/start');assert.equal(thread.params.model,B);assert.equal(turn.params.model,B);assert.equal(job.resolvedModel,B);assert.ok(calls.findIndex(x=>x.method==='persist-model')<calls.findIndex(x=>x.method==='turn/start'));
 const pinned=rpc();await pinned.bridge.begin({directory:'test',model:null,resolvedModel:B},'retry','source.png');assert.equal(pinned.calls.find(x=>x.method==='thread/start').params.model,B);
 const unavailable=rpc();await assert.rejects(()=>unavailable.bridge.begin({model:'missing',directory:'test'},'edit','source.png'),/当前不可用/);assert.ok(!unavailable.calls.some(x=>x.method==='thread/start'));
 const mismatch=rpc();const old=mismatch.bridge.request;mismatch.bridge.request=async(method,params)=>method==='thread/start'?{thread:{id:'wrong'},model:A}:old(method,params);await assert.rejects(()=>mismatch.bridge.begin({model:B,directory:'test'},'edit','source.png'),/不同/);assert.ok(!mismatch.calls.some(x=>x.method==='turn/start'));
 for(const model of ['bad model','<script>',{},'x'.repeat(129)])assert.throws(()=>normalizeEditOptions({model}),/模型标识/);
 assert.equal(templateValue({name:'Model B',text:'保留身份。',options:{model:B}}).options.model,B);assert.equal(normalizeEditOptions({}).model,null);
});
test('visual analysis also uses the selected model and records the actual model',async()=>{
 const {bridge,calls}=rpc();const original=bridge.request;bridge.request=async(method,params)=>{const result=await original(method,params);if(method==='turn/start')setTimeout(()=>{bridge.emit('notification','item/completed',{threadId:'thread-model',item:{type:'agentMessage',text:'{"summary":"Test analysis"}'}});bridge.emit('notification','turn/completed',{threadId:'thread-model',turn:{status:'completed'}});},0);return result;};
 const control={model:B},value=await bridge.analyzeImages(['source.png'],'analyze',control);assert.equal(value.summary,'Test analysis');assert.equal(control.resolvedModel,B);assert.equal(calls.find(x=>x.method==='thread/start').params.model,B);assert.equal(calls.find(x=>x.method==='turn/start').params.model,B);
});

class Bridge extends EventEmitter{
 signedIn=true;defaultModel=A;available=catalog;images=[];analyses=[];
 async account(){return this.signedIn?{email:'model-test@example.invalid',plan:'test'}:null;}
 async models(){return this.available;}
 async stop(){}
 async mark(control={}){control.resolvedModel=control.resolvedModel||control.model||this.defaultModel;await control.onModelSelected?.(control.resolvedModel);return control.resolvedModel;}
 async begin(job,prompt){const model=await this.mark(job);this.images.push(model);job.threadId='image-'+this.images.length;job.turnId='turn';setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:png.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},15);}
 async critique(_image,_reference,_instructions,_extras,control){this.analyses.push(await this.mark(control));return {summary:'Test color plan',query:'forest background',settings:{exposure:.1},layers:[]};}
 async analyzeImages(_images,instructions,control){this.analyses.push(await this.mark(control));if(instructions.includes('conservative second-pass'))return {summary:'Test portrait check',issues:areas.map(area=>({area,severity:'minor',finding:'Test',recommendation:'Keep texture'})),profile:{levels:Object.fromEntries(areas.map(a=>[a,1])),texture:85,faceLock:true}};return {subjectAnalysis:'Test subject',backgroundAnalysis:'Test background',characterConstraints:['Keep identity'],queries:{xiaohongshu:'测试参考',commons:'portrait reference'},summary:'Test brief'};}
}
async function setup(t){const directory=await mkdtemp(path.join(tmpdir(),'houtu-model-test-')),bridge=new Bridge(),app=await createApp({directory,bridge,platform:{async close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port,{csrf}=await(await fetch(origin+'/api/health')).json();const post=async(route,data)=>{const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});return {directory,bridge,app,origin,post};}
test('account model list, templates, jobs and workflow metadata survive service restart',async t=>{
 const {directory,bridge,app,origin,post}=await setup(t);bridge.signedIn=false;assert.deepEqual((await(await fetch(origin+'/api/models')).json()).models,[]);bridge.signedIn=true;assert.equal((await(await fetch(origin+'/api/models')).json()).models.length,2);
 const template=await post('/api/templates/save',{template:{name:'B template',text:'保留人物。',options:{model:B}}});assert.equal(template.template.options.model,B);
 const job=await post('/api/jobs',{image,model:B});await until(async()=>{const j=await(await fetch(origin+'/api/jobs/'+job.id)).json();return j.status==='done'&&j;});const saved=JSON.parse(await readFile(path.join(directory,'jobs',job.id,'job.json'),'utf8'));assert.equal(saved.model,B);assert.equal(saved.resolvedModel,B);
 const flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();assert.equal(flow.steps[0].output.options.model,B);assert.equal(flow.steps.find(n=>n.id==='generate').output.resolvedModel,B);
 await app.close();const reopened=await createApp({directory,bridge:new Bridge(),platform:{async close(){}}});await new Promise(resolve=>reopened.server.listen(0,'127.0.0.1',resolve));try{const restored=await(await fetch('http://127.0.0.1:'+reopened.server.address().port+'/api/jobs/'+job.id)).json();assert.equal(restored.model,B);assert.equal(restored.resolvedModel,B);}finally{await reopened.close();}
});
test('color analysis forwards the choice and portrait audits reuse same-model advice but branch on a changed model',async t=>{
 const {bridge,post}=await setup(t);const color=await post('/api/color/critique',{image,model:B});assert.equal(color.model,B);assert.equal(color.resolvedModel,B);
 const first=await post('/api/portrait/diagnose',{image,model:A});assert.equal(first.diagnosis.model,A);assert.equal(first.diagnosis.resolvedModel,A);const count=bridge.analyses.length;
 const cached=await post('/api/portrait/diagnose',{auditId:first.workflowId,model:A});assert.equal(cached.workflowId,first.workflowId);assert.equal(bridge.analyses.length,count);
 const changed=await post('/api/portrait/diagnose',{auditId:first.workflowId,model:B});assert.notEqual(changed.workflowId,first.workflowId);assert.equal(changed.diagnosis.model,B);assert.equal(bridge.analyses.length,count+1);
});
async function creative(t,config){const directory=await mkdtemp(path.join(tmpdir(),'houtu-model-creative-')),workflows=new WorkflowStore(directory),bridge=new Bridge();await workflows.load();const service=new CreativeService({workflows,bridge,acquire:()=>true,release:()=>{},search:async()=>[{image:'https://upload.wikimedia.org/test.png',url:'https://commons.wikimedia.org/wiki/File:Test',title:'Test',license:'CC0',creator:'Test'}],fetchAsset:async()=>({type:'image/png',bytes:png})});const w=await service.create({config:{mode:'scene',execution:'auto',autoAnalyze:false,autoReferences:false,effect:'none',...config}}),asset=await workflows.putAsset(w.id,png,'image/png');await service.configureInputs(w.id,{source:asset.id});await service.subject(w.id,null);t.after(async()=>{await rm(directory,{recursive:true,force:true});});const run=async(from,discardRaw=false)=>{const current=await workflows.get(w.id);await service.run(w.id,{revision:current.revision,from,discardRaw});await until(()=>!service.running.has(w.id));const result=await workflows.get(w.id);assert.ok(!result.steps.some(n=>n.status==='error'),JSON.stringify(result.steps.map(n=>({id:n.id,status:n.status,message:n.message}))));return result;};return {workflows,bridge,service,id:w.id,run};}
test('creative model changes invalidate generated-image caches while same-model retries reuse the saved raw image',async t=>{
 const {workflows,bridge,service,id,run}=await creative(t,{model:A});let w=await run();assert.deepEqual(bridge.images,[A]);w=await service.configure(id,{...w.config,model:B},w.revision);assert.equal(w.steps.find(n=>n.id==='brief').status,'stale');w=await run();assert.deepEqual(bridge.images,[A,B]);assert.equal(w.steps.find(n=>n.id==='render').output.resolvedModel,B);await run('render');assert.deepEqual(bridge.images,[A,B]);
});
test('a workflow started with client default pins the returned model across explicit regeneration',async t=>{
 const {workflows,bridge,id,run}=await creative(t,{});await run();assert.equal((await workflows.get(id)).executionModel,A);bridge.defaultModel=B;await run('render',true);assert.deepEqual(bridge.images,[A,A]);
});
test('changing the creative analysis model recomputes the brief and keyword planning receives the chosen model',async t=>{
 const first=await creative(t,{model:A,autoAnalyze:true,execution:'semi',mode:'effects'});let w=await first.run();assert.deepEqual(first.bridge.analyses,[A]);w=await first.service.configure(first.id,{...w.config,model:B},w.revision);w=await first.run();assert.deepEqual(first.bridge.analyses,[A,B]);assert.equal(w.steps.find(n=>n.id==='brief').output.model,B);
 const second=await creative(t,{model:B,autoMaterials:true,aiSearch:true,mode:'overlay'});await second.run();assert.deepEqual(second.bridge.analyses,[B]);
});
test('color workflow retry keeps the first actual default model, while an explicit new model starts new analysis',async t=>{
 const {origin,bridge,post}=await setup(t),created=await post('/api/workflows',{name:'Model retry test'}),{csrf}=await(await fetch(origin+'/api/health')).json();
 const response=await fetch(origin+'/api/workflows/'+created.id+'/assets',{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'image/png'},body:png});assert.ok(response.ok);const asset=await response.json();
 let attempt=await post('/api/workflows/'+created.id+'/begin',{step:'source'});await post('/api/workflows/'+created.id+'/complete',{step:'source',token:attempt.token,state:{imageAsset:asset.id},artifacts:[{id:asset.id,type:'image',label:'Test source'}]});
 attempt=await post('/api/workflows/'+created.id+'/begin',{step:'analysis'});let result=await post('/api/color/critique',{image,workflow:{id:created.id,token:attempt.token}});assert.equal(result.resolvedModel,A);
 bridge.defaultModel=B;let w=await(await fetch(origin+'/api/workflows/'+created.id)).json();await post('/api/workflows/'+created.id+'/restart',{step:'analysis',revision:w.revision});attempt=await post('/api/workflows/'+created.id+'/begin',{step:'analysis'});result=await post('/api/color/critique',{image,workflow:{id:created.id,token:attempt.token}});assert.equal(result.resolvedModel,A);
 w=await(await fetch(origin+'/api/workflows/'+created.id)).json();await post('/api/workflows/'+created.id+'/restart',{step:'analysis',revision:w.revision});attempt=await post('/api/workflows/'+created.id+'/begin',{step:'analysis'});result=await post('/api/color/critique',{image,model:B,workflow:{id:created.id,token:attempt.token}});assert.equal(result.resolvedModel,B);assert.deepEqual(bridge.analyses,[A,A,B]);
});
