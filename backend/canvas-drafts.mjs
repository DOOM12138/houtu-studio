import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {workflowImage} from '../lib/workflow-image.mjs';
import {replaceFile} from '../lib/files.mjs';
import {manualOperations} from '../public/manual-portrait-engine.js';
import {LIMITS} from '../frontend/engine.js';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const error=(message,status=400)=>Object.assign(Error(message),{status});
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
function ref(v){
 if(!v||!uuid.test(v.workflowId)||!hash.test(v.assetId)||v.stepId&&!/^[a-z0-9-]{1,40}$/i.test(v.stepId)||v.attemptId&&!uuid.test(v.attemptId))throw error('草稿中的图片来源无效。');
 return {kind:'workflow',workflowId:v.workflowId,assetId:v.assetId,stepId:v.stepId||null,attemptId:v.attemptId||null};
}
function action(a){
 if(!a||typeof a!=='object')throw error('编辑历史内容无效。');
 if(a.type==='stroke')return {type:a.type,stroke:manualOperations([a.stroke])[0]};
 if(a.type==='ai-image'){if(!uuid.test(a.run))throw error('AI 步骤缺少来源。');return {type:a.type,origin:ref(a.origin),run:a.run};}
 if(a.type==='raw-develop'){
  if(!['standard','vlog','vlog-lut'].includes(a.profile))throw error('RAW 显影模式无效。');
  return {type:a.type,origin:ref(a.origin),profile:a.profile,...(a.profile==='vlog-lut'?{lutName:String(a.lutName||'').slice(0,120)}:{})};
 }
 if(a.type==='caption'){
  const v=a.values||{},values={};
  if(v.value!==undefined){if(typeof v.value!=='string'||v.value.length>80)throw error('题字最多80字。');values.value=v.value;}
  if(v.opacity!==undefined){if(!finite(v.opacity,0,100))throw error('文字透明度无效。');values.opacity=v.opacity;}
  if(v.visible!==undefined){if(typeof v.visible!=='boolean')throw error('文字图层状态无效。');values.visible=v.visible;}
  return {type:a.type,values};
 }
 if(a.type==='mask'){
  const r=a.rect;if(r===null)return {type:a.type,rect:null};
  if(!r||!['x','y','w','h'].every(k=>finite(r[k],0,1))||r.x+r.w>1.00001||r.y+r.h>1.00001)throw error('局部选区越界。');
  return {type:a.type,rect:{x:r.x,y:r.y,w:r.w,h:r.h}};
 }
 if(!['tone','replace-tone'].includes(a.type)||a.type==='tone'&&!['global','local'].includes(a.target))throw error('未知的调色操作。');
 const values={};for(const [key,n]of Object.entries(a.values||{})){
  if(!Object.hasOwn(LIMITS,key)||!finite(n,LIMITS[key][0],LIMITS[key][1]))throw error('调色参数无效。');values[key]=n;
 }
 return {type:a.type,...(a.type==='tone'?{target:a.target}:{}),values};
}
export class CanvasDrafts{
 constructor(directory,workflows){this.folder=path.join(directory,'studio','canvas-documents');this.workflows=workflows;this.queue=new Map();this.summaries=new Map();}
 file(id){if(!uuid.test(id))throw error('草稿编号无效。');return path.join(this.folder,id+'.json');}
 async load(){await fs.mkdir(this.folder,{recursive:true});for(const file of await fs.readdir(this.folder)){const id=file.slice(0,-5);if(file.endsWith('.json')&&uuid.test(id)){const d=await this.get(id);this.summaries.set(id,this.summary(d));}}}
 async get(id){try{return JSON.parse(await fs.readFile(this.file(id),'utf8'));}catch(e){if(e.code==='ENOENT')throw error('没有找到这张照片的草稿。',404);throw e;}}
 summary(d){return {id:d.id,name:d.name,origin:d.origin,runs:d.runs||{},thumbnail:d.thumbnail,created:d.created,updated:d.updated,revision:d.revision,removedAt:d.removedAt||null,metadataOnly:true};}
 list(removed=false){return [...this.summaries.values()].filter(d=>Boolean(d.removedAt)===removed).sort((a,b)=>removed?b.removedAt-a.removedAt:a.created-b.created);}
 async setRemoved(id,input){
  return this.run(id,async()=>{
   const doc=await this.get(id);
   if(typeof input.removed!=='boolean'||doc.revision!==input.revision)throw error('照片列表已在其他窗口更新，请刷新后重试。',409);
   const next={...doc,revision:doc.revision+1,updated:Date.now(),removedAt:input.removed?Date.now():null};
   return this.persist(next);
  });
 }
 save(id,input){return this.run(id,()=>this.write(id,input));}
 async run(id,work){
  this.file(id);
  const task=(this.queue.get(id)||Promise.resolve()).catch(()=>{}).then(work);
  this.queue.set(id,task);try{return await task;}finally{if(this.queue.get(id)===task)this.queue.delete(id);}
 }
 async write(id,input){
  const current=this.summaries.has(id)?await this.get(id):null;
  if(current?.removedAt)throw error('这张照片已移除，请先恢复。',409);
  if(!Number.isInteger(input.revision)||input.revision!==(current?.revision||0))throw error('草稿已在另一个窗口更新，请先导出当前成片。',409);
  const origin=ref(input.origin);
  if(current&&JSON.stringify(current.origin)!==JSON.stringify(origin))throw error('同一草稿不可替换原图。',409);
  const nodes=input.nodes;
  if(!Array.isArray(nodes)||!nodes.length||nodes.length>2500||!Number.isInteger(input.cursor)||!nodes[input.cursor])throw error('草稿历史超出范围。');
  if(nodes[0]?.parent!==null||nodes[0]?.action!==null)throw error('原图步骤无效。');
  const history=nodes.map((node,i)=>{if(i&&(!Number.isInteger(node.parent)||node.parent<0||node.parent>=i))throw error('草稿分支不连续。');return {label:String(node.label||'调整').slice(0,100),parent:node.parent,action:i?action(node.action):null};});
  const pins={};
  for(const [index,v]of Object.entries(input.pins||{})){if(!/^(0|[1-9]\d*)$/.test(index)||!history[index])throw error('快照步骤不存在。');pins[index]=ref(v);}
  const refs=doc=>[doc.origin,...Object.values(doc.pins),...doc.nodes.filter(n=>['ai-image','raw-develop'].includes(n.action?.type)).map(n=>n.action.origin)];
  if(history.some(node=>node.action?.type==='raw-develop'&&(origin.stepId!=='develop'||node.action.origin.stepId!=='develop'||node.action.origin.workflowId!==origin.workflowId)))throw error('RAW 显影版本须来自同一原片。');
  const known=new Set(current?refs(current).map(x=>JSON.stringify(x)):[]);
  for(const r of refs({origin,nodes:history,pins})){const k=JSON.stringify(r);if(!known.has(k)){await workflowImage(this.workflows,r);known.add(k);}}
  const redo={};for(const [a,b]of Object.entries(input.redo||{}))if(/^\d+$/.test(a)&&Number.isInteger(b)&&history[b]?.parent===Number(a))redo[a]=b;
  const v=input.viewport||{};const viewport={zoom:finite(v.zoom,.3,8)?v.zoom:1,panX:finite(v.panX,-50,50)?v.panX:0,panY:finite(v.panY,-50,50)?v.panY:0};
  const thumbnail=typeof input.thumbnail==='string'&&input.thumbnail.length<160000&&/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(input.thumbnail)?input.thumbnail:null;
  const runs={};for(const mode of ['auto','semi'])if(uuid.test(input.runs?.[mode]||''))runs[mode]=input.runs[mode];
  const doc={id,revision:input.revision+1,created:current?.created||Date.now(),updated:Date.now(),origin,name:String(input.name||'照片').slice(0,120),nodes:history,pins,redo,cursor:input.cursor,viewport,thumbnail,runs};
  return {revision:(await this.persist(doc)).revision};
 }
 async persist(doc){
  const target=this.file(doc.id),tmp=target+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(doc));await replaceFile(tmp,target);
  const summary=this.summary(doc);this.summaries.set(doc.id,summary);return summary;
 }
}
