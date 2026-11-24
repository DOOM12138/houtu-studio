import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {bellyOptions,bellyRegionOptions} from '../public/belly-options.js';
import {normalizeEditOptions,paintingPrompt} from '../lib/painting.mjs';
import {prepareEditImage,finishEditImage} from '../lib/images.mjs';
import {templateValue,importTemplates} from '../lib/templates.mjs';
import {createApp} from '../server.mjs';
const width=256,height=320,source=await sharp({create:{width,height,channels:4,background:'black'}}).png().toBuffer(),generated=await sharp({create:{width,height,channels:4,background:'white'}}).png().toBuffer(),selection={x:.25,y:.25,width:.5,height:.5};

test('smooth belly options retain material and gradual transition rules without forcing painting or whole-body shrinking',()=>{
 const defaults=normalizeEditOptions({operation:'smooth-belly',style:'anime',paintLevel:10,preserve:false});assert.equal(defaults.belly.level,2);assert.equal(defaults.belly.transition,'wide');assert.equal(defaults.style,'natural');assert.equal(defaults.preserve,true);
 const values=[];for(const fabric of ['auto','fitted','loose','structured'])for(const level of [1,5,10]){const prompt=paintingPrompt({operation:'smooth-belly',belly:{fabric,level}});assert.ok(prompt.includes('瘦腹力度 '+level+'/10'));assert.match(prompt,/平滑|柔和/);assert.match(prompt,/褶皱/);assert.match(prompt,/印花.*格纹.*拉链/);assert.match(prompt,/背景直线/);assert.doesNotMatch(prompt,/二次元数字厚涂风格|厚涂程度\d+\/10/);values.push(prompt);}assert.equal(new Set(values).size,12);
 for(const belly of [{level:0},{level:11},{level:2.5},{level:'5'},{fabric:'rubber'},{transition:'hard'},{scope:'full-body'}])assert.throws(()=>bellyOptions(belly,'smooth-belly'));
 assert.equal(bellyOptions({level:9},'face'),null);
 const custom=paintingPrompt({operation:'custom',promptMode:'custom',prompt:'只整理衣摆。',belly:{level:10}});assert.doesNotMatch(custom,/瘦腹力度/);
});
test('wide belly context and smoothstep blending preserve outside pixels with a gentler, monotonic edge transition',async()=>{
 const regular=await prepareEditImage(source,selection),wide=await prepareEditImage(source,selection,bellyRegionOptions({transition:'wide'}));assert.ok(wide.region.edit.width>regular.region.edit.width);assert.ok(wide.region.edit.height>regular.region.edit.height);assert.equal(wide.region.smoothing.curve,'smoothstep');
 const output=await sharp(await finishEditImage(generated,wide.source,wide.region)).ensureAlpha().raw().toBuffer(),baseline=await sharp(await finishEditImage(generated,regular.source,regular.region)).ensureAlpha().raw().toBuffer(),original=await sharp(source).ensureAlpha().raw().toBuffer();
 const {left,top,width:w,height:h}=wide.region;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<left||x>=left+w||y<top||y>=top+h){const i=(y*width+x)*4;assert.deepEqual(output.subarray(i,i+4),original.subarray(i,i+4));}
 const row=top+Math.floor(h/2),at=x=>output[(row*width+x)*4];assert.equal(at(left),0);assert.equal(at(left+Math.floor(w/2)),255);assert.ok(at(left+1)<baseline[(row*width+left+1)*4]);for(let x=left;x<left+20;x++)assert.ok(at(x+1)>=at(x));
 assert.equal((await prepareEditImage(source,null,bellyRegionOptions({}))).region,null);await assert.rejects(()=>finishEditImage(generated,source,{...wide.region,smoothing:{featherRatio:99,maxFeather:128,curve:'smoothstep'}}),/过渡设置/);
});
test('belly templates roundtrip preferences while stripping input images and private fields',()=>{
 const value=templateValue({name:'宽松衣料平滑收腹',text:'保留腰带和刺绣。',options:{operation:'smooth-belly',belly:{level:6,fabric:'loose',transition:'wide',scope:'waist-belly',image:'private',account:'private'}}});const restored=importTemplates({templates:[value]})[0];assert.deepEqual(restored.options.belly,{level:6,fabric:'loose',transition:'wide',scope:'waist-belly'});assert.ok(!JSON.stringify(restored).includes('private'));
});
class Bridge extends EventEmitter{calls=0;async account(){return {email:'belly-test@example.invalid',plan:'test'};}async stop(){}async begin(job,prompt){this.calls++;this.prompt=prompt;job.threadId='belly-'+this.calls;job.turnId='turn';setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:generated.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},15);}}
async function done(origin,id){for(let i=0;i<200;i++){const job=await(await fetch(origin+'/api/jobs/'+id)).json();if(job.status==='done')return job;if(job.status==='error')throw Error(job.message);await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Belly workflow timeout');}
test('belly settings and region smoothing survive history, service restart and raw-only recomposition',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'houtu-belly-test-')),bridge=new Bridge(),app=await createApp({directory,bridge,platform:{async close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port,{csrf}=await(await fetch(origin+'/api/health')).json();
 const response=await fetch(origin+'/api/jobs',{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/png;base64,'+source.toString('base64'),operation:'smooth-belly',belly:{level:4,fabric:'fitted',transition:'wide'},selection})});assert.equal(response.status,202);const created=await response.json();
 try{let job=await done(origin,created.id);assert.equal(job.belly.level,4);assert.match(bridge.prompt,/贴身衣料/);assert.match(bridge.prompt,/实际编辑矩形/);assert.match(bridge.prompt,/图案相位连续对齐/);const flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();assert.equal(flow.steps[0].output.options.belly.fabric,'fitted');const region=flow.steps.find(n=>n.id==='prepare').output.region;assert.equal(region.smoothing.curve,'smoothstep');const first=Buffer.from(await(await fetch(origin+job.outputUrl)).arrayBuffer());await app.close();
 const reopenedBridge=new Bridge(),reopened=await createApp({directory,bridge:reopenedBridge,platform:{async close(){}}});await new Promise(resolve=>reopened.server.listen(0,'127.0.0.1',resolve));const next='http://127.0.0.1:'+reopened.server.address().port;try{job=await(await fetch(next+'/api/jobs/'+job.id)).json();assert.equal(job.belly.level,4);assert.equal(job.region.smoothing.curve,'smoothstep');const health=await(await fetch(next+'/api/health')).json(),current=await(await fetch(next+'/api/workflows/'+job.workflowId)).json();const retry=await fetch(next+'/api/workflows/'+job.workflowId+'/retry',{method:'POST',headers:{Origin:next,'X-Paint-CSRF':health.csrf,'Content-Type':'application/json'},body:JSON.stringify({step:'compose',revision:current.revision})});assert.equal(retry.status,202);job=await done(next,job.id);assert.deepEqual(Buffer.from(await(await fetch(next+job.outputUrl)).arrayBuffer()),first);assert.equal(reopenedBridge.calls,0);}finally{await reopened.close();}
 }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
