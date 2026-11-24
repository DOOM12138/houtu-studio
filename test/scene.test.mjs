import {prepareEditImage,orientedDimensions} from '../lib/images.mjs';
﻿// Synthetic images and an isolated bridge test scene semantics and real compositing, not vendor model quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {normalizeEditOptions,paintingPrompt} from '../lib/painting.mjs';
import {templateValue,importTemplates} from '../lib/templates.mjs';
import {PRESETS} from '../public/catalog.js';
import {SCENE_OPERATIONS,sceneOptions} from '../public/scene-options.js';
import {subjectWeights} from '../public/subject-mask.js';
import {createApp} from '../server.mjs';
const width=128,height=160,source=await sharp({create:{width,height,channels:4,background:'#906c4c'}}).png().toBuffer(),generated=await sharp({create:{width,height,channels:4,background:'#284a82'}}).png().toBuffer(),image='data:image/png;base64,'+source.toString('base64');
async function mask(x=40,y=35,w=48,h=90){return sharp({create:{width,height,channels:3,background:'white'}}).composite([{input:await sharp({create:{width:w,height:h,channels:3,background:'black'}}).png().toBuffer(),left:x,top:y}]).png().toBuffer();}
const firstMask=await mask(),asImage=bytes=>'data:image/png;base64,'+bytes.toString('base64');
class Bridge extends EventEmitter{calls=0;signedIn=true;async account(){return this.signedIn?{email:'scene-test@example.invalid',plan:'test'}:null;}async stop(){}async begin(job,prompt){this.calls++;this.prompt=prompt;job.threadId='scene-'+this.calls;job.turnId='turn';setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:generated.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},20);}}
async function setup(t){const directory=await mkdtemp(path.join(tmpdir(),'houtu-scene-test-')),bridge=new Bridge(),app=await createApp({directory,bridge,platform:{async close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port,{csrf}=await(await fetch(origin+'/api/health')).json(),post=async(route,input)=>{const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify(input)});return {status:response.status,value:await response.json()};};t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});return {directory,bridge,app,origin,post};}
async function done(origin,id){for(let i=0;i<200;i++){const job=await(await fetch(origin+'/api/jobs/'+id)).json();if(job.status==='done')return job;if(job.status==='error')throw Error(job.message);await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Scene job timed out');}

test('six scene tools compile distinct venue-cleanup and dimensional prompts without forcing portrait repainting',()=>{
 assert.equal(PRESETS.length,75);assert.ok(SCENE_OPERATIONS.every(id=>PRESETS.some(preset=>preset.id===id)));
 for(const operation of ['remove-people','remove-equipment','clear-background']){const prompt=paintingPrompt({operation,style:'anime',paintLevel:10,strength:'rich',scene:{subject:'前景蓝发白衣主角',tone:'dark'}});assert.match(prompt,/保留/);assert.match(prompt,/蓝发白衣/);assert.match(prompt,/场馆|场地|地面/);assert.doesNotMatch(prompt,/二次元数字厚涂风格|厚涂程度10\/10|精修力度：细致/);}
 assert.match(paintingPrompt({operation:'remove-equipment'}),/长柄伞/);
 assert.match(paintingPrompt({operation:'clear-background'}),/路人.*灯架/);
 assert.match(paintingPrompt({operation:'clear-background'}),/不添加.*白棚底/);
 for(const intensity of [1,5,10])assert.match(paintingPrompt({operation:'dimension-effects',scene:{intensity,effect:'lightning'}}),new RegExp('次元程度 '+intensity+'/10'));
 assert.notEqual(paintingPrompt({operation:'hair-lift'}),paintingPrompt({operation:'hair-glow'}));
 assert.equal(normalizeEditOptions({operation:'clear-background'}).style,'natural');
 for(const scene of [{intensity:0},{intensity:11},{intensity:2.5},{protectSubject:'yes'},{tone:'white'},{people:'all'},{subject:'x'.repeat(501)}])assert.throws(()=>sceneOptions(scene,'clear-background'));
});
test('subject component selection keeps a central subject, excludes separate bystanders and can explicitly keep all people',()=>{
 const size=30,probability=new Float32Array(size*size);for(let y=10;y<22;y++)for(let x=10;x<21;x++)probability[y*size+x]=.98;for(let y=1;y<7;y++)for(let x=1;x<6;x++)probability[y*size+x]=.95;
 const primary=subjectWeights(probability,size,size);assert.equal(primary[15*size+15],1);assert.equal(primary[3*size+3],0);assert.equal(primary[29*size+29],0);assert.equal(subjectWeights(probability,size,size,'all')[3*size+3],1);
 assert.throws(()=>subjectWeights(new Float32Array(900),30,30),/未可靠识别/);assert.throws(()=>subjectWeights(new Float32Array(10),30,30),/尺寸无效/);
});
test('scene templates retain editable rules and effect intensity without copying masks, images or account data',()=>{
 const value=templateValue({name:'暗调净场',text:'保留衣服和道具。',options:{operation:'clear-background',scene:{subject:'蓝发主角',tone:'dark',protectSubject:true,mask:'private-mask',image:'private',account:'private'}}});assert.equal(value.options.scene.tone,'dark');assert.equal(value.options.scene.protectSubject,true);assert.ok(!JSON.stringify(value).includes('private'));
 const restored=importTemplates({templates:[value]});assert.equal(restored[0].options.scene.subject,'蓝发主角');assert.equal(templateValue({name:'效果',text:'少量雷电',options:{operation:'dimension-effects',scene:{effect:'lightning',intensity:8}}}).options.scene.intensity,8);
});
test('scene protection survives jobs and history; changing only the matte recomposes saved raw pixels without another AI call',async t=>{
 const {bridge,origin,post}=await setup(t);const response=await post('/api/jobs',{image,operation:'clear-background',scene:{subject:'前景主角',tone:'dark',protectSubject:true},protectionMask:asImage(firstMask)});assert.equal(response.status,202);let job=await done(origin,response.value.id);assert.equal(job.scene.tone,'dark');assert.equal(bridge.calls,1);assert.match(bridge.prompt,/不添加.*白棚底/);
 let pixels=await sharp(Buffer.from(await(await fetch(origin+job.outputUrl)).arrayBuffer())).ensureAlpha().raw().toBuffer(),original=await sharp(source).ensureAlpha().raw().toBuffer();for(let y=35;y<125;y++)for(let x=40;x<88;x++)assert.deepEqual(pixels.subarray((y*width+x)*4,(y*width+x+1)*4),original.subarray((y*width+x)*4,(y*width+x+1)*4));
 let flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();const initialAsset=flow.steps[0].output.maskAsset;assert.equal(flow.steps[0].output.options.scene.subject,'前景主角');
 bridge.signedIn=false;const changed=await mask(10,10,30,50);const recomposed=await post('/api/workflows/'+job.workflowId+'/retry',{step:'compose',revision:flow.revision,replaceProtection:true,protectionMask:asImage(changed)});assert.equal(recomposed.status,202);job=await done(origin,job.id);assert.equal(bridge.calls,1);assert.equal(job.compositionMaskOverride,true);assert.notEqual(job.compositionMaskAsset,initialAsset);
 flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();assert.equal(flow.steps[0].output.maskAsset,initialAsset);const history=flow.steps.find(node=>node.id==='compose').attempts.filter(attempt=>attempt.status==='done');assert.equal(history.length,2);assert.equal(history[0].output.maskAsset,initialAsset);assert.equal(history[1].output.maskAsset,job.compositionMaskAsset);
 const stale=await post('/api/workflows/'+job.workflowId+'/retry',{step:'compose',revision:flow.revision-1,replaceProtection:true,protectionMask:null});assert.equal(stale.status,409);assert.equal((await(await fetch(origin+'/api/jobs/'+job.id)).json()).compositionMaskAsset,job.compositionMaskAsset);
 const full=await post('/api/workflows/'+job.workflowId+'/retry',{step:'compose',revision:flow.revision,replaceProtection:true,protectionMask:null});assert.equal(full.status,202);job=await done(origin,job.id);assert.equal(job.compositionMaskAsset,null);pixels=await sharp(Buffer.from(await(await fetch(origin+job.outputUrl)).arrayBuffer())).raw().toBuffer();assert.deepEqual(pixels,await sharp(generated).raw().toBuffer());assert.equal(bridge.calls,1);
});
test('missing or mismatched subject masks and a missing selected-person region are rejected before AI generation',async t=>{
 const {bridge,post}=await setup(t);assert.equal((await post('/api/jobs',{image,operation:'clear-background'})).status,400);assert.equal((await post('/api/jobs',{image,operation:'clear-background',scene:{protectSubject:false},protectionMask:asImage(firstMask)})).status,400);
 assert.equal((await post('/api/jobs',{image,operation:'remove-people',scene:{people:'selection',protectSubject:false}})).status,400);
 const wrong=await sharp({create:{width:160,height:80,channels:3,background:'white'}}).png().toBuffer();const result=await post('/api/jobs',{image,operation:'clear-background',protectionMask:asImage(wrong)});assert.equal(result.status,400);assert.match(result.value.error,/长宽比/);assert.equal(bridge.calls,0);
});
test('scene crop edits preserve both every pixel outside the edit rectangle and the protected subject inside it',async t=>{
 const {origin,post}=await setup(t);const response=await post('/api/jobs',{image,operation:'remove-equipment',scene:{protectSubject:true},selection:{x:0,y:0,width:.75,height:.75},protectionMask:asImage(firstMask)});assert.equal(response.status,202);const job=await done(origin,response.value.id),pixels=await sharp(Buffer.from(await(await fetch(origin+job.outputUrl)).arrayBuffer())).ensureAlpha().raw().toBuffer(),original=await sharp(source).ensureAlpha().raw().toBuffer();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x>=96||y>=120||x>=40&&x<88&&y>=35&&y<125){const offset=(y*width+x)*4;assert.deepEqual(pixels.subarray(offset,offset+4),original.subarray(offset,offset+4));}
});
test('EXIF-rotated phone photos accept their display-oriented subject mask before generation',async t=>{
 const {origin,post}=await setup(t),jpeg=await sharp({create:{width:160,height:128,channels:3,background:'#906c4c'}}).jpeg().withMetadata({orientation:6}).toBuffer();assert.deepEqual(await orientedDimensions(jpeg),{width:128,height:160});
 const response=await post('/api/jobs',{image:'data:image/jpeg;base64,'+jpeg.toString('base64'),operation:'clear-background',protectionMask:asImage(firstMask)});assert.equal(response.status,202);const job=await done(origin,response.value.id),output=await sharp(Buffer.from(await(await fetch(origin+job.outputUrl)).arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true}),normalized=await prepareEditImage(jpeg,null),original=await sharp(normalized.source).ensureAlpha().raw().toBuffer();assert.equal(output.info.width,128);assert.equal(output.info.height,160);
 for(let y=35;y<125;y++)for(let x=40;x<88;x++){const i=(y*width+x)*4;assert.deepEqual(output.data.subarray(i,i+4),original.subarray(i,i+4));}
});
