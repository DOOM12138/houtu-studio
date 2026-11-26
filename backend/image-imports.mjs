import {MAX_CUBE_BYTES,parseCube} from './raw-vlog.mjs';
import {MAX_IMAGE_UPLOAD_BYTES,IMAGE_UPLOAD_MESSAGE} from '../public/upload-limits.js';
import fs from 'node:fs/promises';import path from 'node:path';import {Worker} from 'node:worker_threads';import {RAW_EXTENSIONS,EXTRA_IMAGE_EXTENSIONS,extension,originalImageSignature} from '../public/image-formats.js';
export class ImageImports{
 constructor(workflows,{mobile=false}={}){this.workflows=workflows;this.mobile=mobile;this.active=false;this.worker=null;this.closed=false;}
 options(value={}){const exposure=value.exposure??0,whiteBalance=value.whiteBalance||'camera';if(!Number.isFinite(exposure)||exposure<-5||exposure>5||!['camera','auto'].includes(whiteBalance)||value.halfSize!==undefined&&typeof value.halfSize!=='boolean')throw Error('RAW显影参数无效。');return {exposure,whiteBalance,...(value.halfSize!==undefined?{halfSize:value.halfSize}:{})};}
 async create(bytes,name,value={}){
  if(this.active)throw Object.assign(Error('正在显影另一张图片，请稍后。'),{status:409});this.active=true;let w;try{if(Buffer.isBuffer(bytes)&&bytes.length>MAX_IMAGE_UPLOAD_BYTES)throw Object.assign(Error(IMAGE_UPLOAD_MESSAGE),{status:413});const ext=extension(name);if(!Buffer.isBuffer(bytes)||bytes.length>MAX_IMAGE_UPLOAD_BYTES||!originalImageSignature(bytes)||![...RAW_EXTENSIONS,...EXTRA_IMAGE_EXTENSIONS].includes(ext))throw Error('请选择受支持的RAW、TIFF、AVIF、GIF或BMP原始图片。');name=path.basename(String(name)).replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,150);const options=this.options(value);w=await this.workflows.create({kind:'image-import',name});const source=await this.workflows.putAsset(w.id,bytes,'application/octet-stream',{originalImage:true});await this.workflows.checkpoint(w.id,'source',{originalAsset:source.id,name,extension:ext,isRaw:RAW_EXTENSIONS.includes(ext),bytes:bytes.length},[{id:source.id,label:'只读保留的原始文件 · '+name,type:'file'}],'原始文件已保留，不上传AI服务');return await this.perform(w.id,options);}catch(e){if(w)e.workflowId=w.id;throw e;}finally{this.active=false;}
 }
 async develop(id,value){
  if(this.active)throw Object.assign(Error('正在显影另一张图片，请稍后。'),{status:409});
  this.active=true;
  try{
   if(value.profile===undefined)return await this.perform(id,this.options(value));
   if(!['standard','vlog'].includes(value.profile))throw Error('请选择标准显影或 V-Log 灰片。');
   const base=await this.rawSettings(id,value.fromAttempt);
   return await this.perform(id,{...base,...(value.profile==='vlog'?{profile:'vlog'}:{})});
  }finally{this.active=false;}
 }
 async rawSettings(id,fromAttempt){
  const w=await this.workflows.get(id);
  if(w.kind!=='image-import'||!w.steps.find(s=>s.id==='source')?.output?.isRaw)throw Error('V-Log 灰片和 LUT 需要原始 RAW 照片。');
  const step=w.steps.find(s=>s.id==='develop');
  const previous=fromAttempt?step.attempts.find(a=>a.id===fromAttempt&&a.status==='done')?.output:step.output;
  if(!previous?.imageAsset)throw Error('当前 RAW 显影版本不可用，请重新打开照片。');
  return this.options({...previous.options,halfSize:previous.halfSize});
 }
 async applyVLogLut(id,bytes,name,fromAttempt){
  if(this.active)throw Object.assign(Error('正在显影另一张图片，请稍后。'),{status:409});
  if(!/\.cube$/i.test(name)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_CUBE_BYTES)throw Error('请选择不超过 16 MB 的 .cube 3D LUT。');
  this.active=true;
  try{
   const base=await this.rawSettings(id,fromAttempt);
   const lut=parseCube(bytes.toString('utf8'));
   const asset=await this.workflows.putAsset(id,bytes,'application/octet-stream');
   const lutName=path.basename(name.replaceAll('\\','/')).replace(/[\x00-\x1f<>:"|?*]/g,'_').slice(0,120);
   return await this.perform(id,{...base,profile:'vlog-lut',lutAsset:asset.id,lutName},lut);
  }finally{this.active=false;}
 }
 async close(){this.closed=true;if(this.worker)await this.worker.terminate();}
 async perform(id,options,lut){if(this.closed)throw Error('服务正在关闭，原始文件保留。');const w=await this.workflows.get(id),source=w.steps.find(s=>s.id==='source')?.output;if(w.kind!=='image-import'||!source?.originalAsset)throw Error('原始图片记录不存在。');const input=await this.workflows.asset(id,source.originalAsset),attempt=await this.workflows.begin(id,'develop');await this.workflows.mutate(id,w=>{const node=w.steps.find(s=>s.id==='develop');if(node.token!==attempt.token)throw Error('显影步骤已变化。');node.attempts.at(-1).parameters={...options};});try{const output=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./raw-worker.mjs',import.meta.url),{workerData:{file:input.file,raw:source.isRaw,options,lut,maxPixels:this.mobile?12000000:24000000}}),timer=setTimeout(()=>{worker.terminate();reject(Error('本机显影超时，原始文件已保留。'));},180000);this.worker=worker;worker.once('message',m=>{clearTimeout(timer);m.error?reject(Error(m.error)):resolve(m);});worker.once('error',e=>{clearTimeout(timer);reject(e);});worker.once('exit',code=>{clearTimeout(timer);if(code)reject(Error('本机显影进程已停止，原始文件保留。'));});});const storePng=async(bytes,label)=>{try{const buffer=Buffer.from(bytes);if(buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('显影线程返回的PNG数据无效');return await this.workflows.putAsset(id,buffer,'image/png');}catch(e){throw Error(label+'：'+e.message);}};const master=await storePng(output.master,'保存16位母版'),rendered=await storePng(output.rendered,'保存编辑位图');const state={imageAsset:rendered.id,masterAsset:master.id,sourceAsset:source.originalAsset,options,metadata:output.metadata,width:output.width,height:output.height,halfSize:output.halfSize,decoder:output.decoder,masterBits:16,editingBits:8,editingSpace:'sRGB',...(options.profile?{masterSpace:options.profile==='vlog'?'Panasonic V-Log / V-Gamut':'LUT 输出 · Rec.709',workingSpace:'Panasonic V-Log / V-Gamut'}:{}),localOnly:true};await this.workflows.complete(id,'develop',attempt.token,{state,artifacts:[{id:rendered.id,label:options.profile==='vlog'?'V-Log 灰片预览 · 8位':'可编辑的sRGB显影版',type:'image'},{id:master.id,label:options.profile==='vlog'?'16位 V-Log / V-Gamut 母版':'16位PNG显影母版',type:'image'},...(options.lutAsset?[{id:options.lutAsset,label:'已用 LUT · '+options.lutName,type:'file'}]:[])],message:'本机显影完成，原始文件只读保留'});return {workflowId:id,name:source.name,isRaw:source.isRaw,...state,imageUrl:'/api/workflows/'+id+'/assets/'+rendered.id,originalUrl:'/api/image-imports/'+id+'/original',masterUrl:'/api/workflows/'+id+'/assets/'+master.id+'?download',source:{kind:'workflow',workflowId:id,assetId:rendered.id,stepId:'develop',attemptId:attempt.token}};}catch(e){await this.workflows.fail(id,'develop',attempt.token,e.message).catch(()=>{});e.workflowId=id;throw e;}}
 async view(id){const w=await this.workflows.get(id),source=w.steps.find(s=>s.id==='source')?.output,step=w.steps.find(s=>s.id==='develop'),output=step?.output;if(w.kind!=='image-import'||!source?.originalAsset)throw Error('原始图片记录不存在。');return {workflowId:id,name:source.name,isRaw:source.isRaw,status:step?.status||'pending',error:['error','interrupted'].includes(step?.status)?step.message:null,...output,options:step?.attempts?.at(-1)?.parameters||output?.options||{},originalUrl:'/api/image-imports/'+id+'/original',...(output?.imageAsset?{imageUrl:'/api/workflows/'+id+'/assets/'+output.imageAsset,masterUrl:'/api/workflows/'+id+'/assets/'+output.masterAsset+'?download',source:{kind:'workflow',workflowId:id,assetId:output.imageAsset,stepId:'develop',attemptId:[...(step?.attempts||[])].reverse().find(a=>a.status==='done'&&a.output?.imageAsset===output.imageAsset)?.id||null}}:{})};}
 async original(id){const w=await this.workflows.get(id);if(w.kind!=='image-import')throw Error('原始文件记录无效。');const source=w.steps.find(s=>s.id==='source')?.output;if(!source?.originalAsset)throw Error('原始文件不存在。');return {name:source.name,...await this.workflows.asset(id,source.originalAsset)};}
}
