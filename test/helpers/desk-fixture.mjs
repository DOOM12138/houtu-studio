import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../../server.mjs';

export class DeskBridge extends EventEmitter{
 images=[];reads=[];signed=true;subjects=0;pauseRender=null;
 async account(){return this.signed?{email:'desk@example.invalid',plan:'test'}:null;}
 async models(){return [{id:'test-model',name:'test-model'}];}async stop(){}async cancel(){}
 async analyzeImages(files,prompt,control){
  this.reads.push(prompt);control.resolvedModel='test-model';await control.onModelSelected?.('test-model');
  if(prompt.startsWith('你是二次元'))return {summary:'场地线索不足',subjectPresent:true,observations:[],queries:[],sceneProfile:{scene:{kind:'unknown',confidence:'low',cues:[]},character:{kind:'unknown',cues:[]}}};
  if(prompt.startsWith('你是嵌入式')){
   const ids=JSON.parse(prompt.match(/只能安排这些实际节点(\[[^\]]*\])/)[1]);return {summary:'仅按授权任务编辑',selectedReferences:[],referenceReviews:[],actions:ids.map(id=>({id,prompt:'保留原图的角色造型和背景，整理当前部位。',parameters:id==='color'?{settings:{exposure:.15}}:{}}))};
  }
  if(prompt.includes('aligned:boolean'))return {aligned:true,complete:true,backgroundExcluded:true,edgesAcceptable:true,confidence:.96,summary:'fixture'};
  return {pass:true,severity:'minor',summary:'测试完成',checks:['scope','identity','lighting','seams','color'].map(key=>({key,pass:true,note:'synthetic'}))};
 }
 async begin(job,prompt,file,context,refs){
  job.threadId='desk-'+job.id;job.turnId='turn';job.resolvedModel='test-model';await job.onModelSelected?.('test-model');
  this.images.push({op:job.operation,prompt,source:job.sourceAsset,model:job.model,refs:refs?.length||0});
  if(this.pauseRender)await this.pauseRender;
  const m=await sharp(file).metadata(),mask=prompt.includes('仅生成原图主体的像素级黑白保护蒙版');
  let pixels=sharp({create:{width:m.width,height:m.height,channels:3,background:mask?'black':(this.images.length%2?'#7894b3':'#b2a9be')}});
  if(mask)pixels=pixels.composite([{input:await sharp({create:{width:Math.floor(m.width/2),height:Math.floor(m.height/2),channels:3,background:'white'}}).png().toBuffer(),gravity:'center'}]);
  const result=(await pixels.png().toBuffer()).toString('base64');setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},20);
 }
}
export async function deskFixture(){
 const directory=await fs.mkdtemp(path.join(tmpdir(),'houtu-mode-test-')),bridge=new DeskBridge();let app,origin,csrf;
 async function start(){
  app=await createApp({directory,bridge,automaticUpdateChecks:false,platform:{async close(){}},agentSearch:async()=>[],agentCharacterLookup:async()=>({status:'no-match'}),agentHardware:{snapshot:async()=>({platform:'linux',arch:'x64',gpus:[],ramBytes:3e9,freeRamBytes:1e9})},
    agentMask:async bytes=>{bridge.subjects++;const m=await sharp(bytes).metadata(),mask=await sharp({create:{width:m.width,height:m.height,channels:3,background:'black'}}).composite([{input:await sharp({create:{width:Math.floor(m.width/2),height:Math.floor(m.height/2),channels:3,background:'white'}}).png().toBuffer(),gravity:'center'}]).png().toBuffer();return {mask,found:true,requiresReview:false};}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.server.address().port;csrf=(await(await fetch(origin+'/api/health')).json()).csrf;
 }
 await start();const auth={'Content-Type':'application/json',Origin:origin,'X-Paint-CSRF':csrf};
 const raw=async(u,body)=>{const r=await fetch(origin+u,body===undefined?{}:{method:'POST',headers:{...auth,Origin:origin,'X-Paint-CSRF':csrf},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const ok=async(u,v)=>{const r=await raw(u,v);assert.ok(r.status<300,JSON.stringify(r));return r.data;};
 const source=async()=>{const bytes=await sharp({create:{width:100,height:120,channels:3,background:'#797b73'}}).png().toBuffer(),r=await fetch(origin+'/api/workspace/images?name=test.png',{method:'POST',headers:{...auth,Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'image/png'},body:bytes});assert.equal(r.status,201);return {...await r.json(),kind:'workflow'};};
 const wait=async id=>{for(let n=0;n<400;n++){const run=await ok('/api/studio/ai-runs/'+id);if(!run.busy&&!['running','pausing'].includes(run.queue))return run;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out');};
 return {bridge,ok,raw,wait,source,get origin(){return origin;},get app(){return app;},async restart(){await app.close();await start();},async close(){await app.close();await fs.rm(directory,{recursive:true,force:true});}};
}
