import path from 'node:path';
import {mkdir,writeFile,readFile,stat,realpath} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {replaceFile} from '../lib/files.mjs';
import {accountSnapshot} from './accounts.mjs';
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9-]{36}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const attemptFor=(workflow,node,dependency)=>{const id=node.inputs?.find(d=>d.step===dependency)?.attempt;const step=workflow.steps.find(s=>s.id===dependency);return step?.attempts.find(a=>a.id===id)||null;};
const clean=value=>accountSnapshot(value);
export class ImageLibrary{
 constructor(directory){this.root=path.resolve(directory);this.directory=path.join(this.root,'library');this.index=path.join(this.directory,'images.json');this.thumbs=path.join(this.directory,'thumbnails');this.records=new Map();this.queue=Promise.resolve();this.signature=null;this.pendingThumbs=new Map();}
 async load(){await mkdir(this.thumbs,{recursive:true});try{await stat(this.index);}catch(error){if(error.code!=='ENOENT')throw error;await this.write([]);}}
 async write(images){const temp=this.index+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({schemaVersion:1,updated:Date.now(),images},null,2));await replaceFile(temp,this.index);}
 async refresh(jobs,workflows){const next=this.queue.catch(()=>{}).then(async()=>{
  const all=await workflows.all(),images=[],covered=new Set();
  for(const w of all){
   if(w.pipelineParentId){if(w.jobId)covered.add(w.jobId);continue;}
   const steps=w.kind==='pipeline'?['deliver']:w.kind==='retouch'?['compose']:w.kind==='color'?['export']:w.kind==='creative'?['deliver','render']:[];
   const delivered=new Set(),legacyDelivered=new Set();if(w.kind==='creative')for(const a of w.steps.find(n=>n.id==='deliver')?.attempts||[])if(a.status==='done'&&a.output?.imageAsset){const input=a.inputs?.find(n=>n.step==='render')?.attempt;if(input)delivered.add(input);else legacyDelivered.add(a.output.imageAsset);}
   for(const step of steps){const n=w.steps.find(n=>n.id===step);if(!n)continue;
    const attempts=n.attempts.length?n.attempts:(n.status==='done'?[{id:'legacy',status:'done',output:n.output,ended:w.updated}]:[]);
    for(const [i,a]of attempts.entries()){
     const asset=a.output?.imageAsset;if(a.status!=='done'||!HASH.test(asset||''))continue;if(step==='render'&&(delivered.has(a.id)||a.id==='legacy'&&legacyDelivered.has(asset)))continue;
     const generated=w.kind==='retouch'?attemptFor(w,a,'generate'):null,rendered=step==='deliver'?attemptFor(w,a,'render'):null;
     const output=a.output,details=generated?.output||rendered?.output||output;
     const renderAttempt=rendered||a,layout=attemptFor(w,renderAttempt,'layout'),grade=attemptFor(w,a,'grade');
     const analysis=w.kind==='color'?(grade?attemptFor(w,grade,'analysis')?.output:null):layout?.output?.vision|| (layout?attemptFor(w,layout,'brief')?.output:null);
     const renderAccount=w.kind==='color'||details.engine==='local-compositor'?null:clean(details.account)||clean(output.account);
     const analysisAccount=clean(analysis?.account),account=renderAccount||analysisAccount;
     const id=digest([w.id,step,a.id,asset].join('|')),job=jobs.get(w.jobId);
     const record={id,kind:w.kind,workflowId:w.id,jobId:w.jobId||null,name:String(w.name||'已保存成品').slice(0,100),version:i+1,step,created:a.ended||a.started||w.updated,assetId:asset,account,accountRole:renderAccount?'image':analysisAccount?'analysis':'unknown',model:details.resolvedModel||details.model||analysis?.resolvedModel||analysis?.model||null,paintLevel:job?.paintLevel||null,style:job?.style||null,status:step==='render'?'waiting':'saved',imageUrl:'/api/workflows/'+w.id+'/assets/'+asset,downloadUrl:'/api/workflows/'+w.id+'/assets/'+asset+'?download',thumbnailUrl:'/api/server/thumbnails/'+id,workflowUrl:'/workflows/?id='+w.id,editUrl:'/?refineWorkflow='+w.id+'&refineAsset='+asset};
     images.push(record);if(w.jobId)covered.add(w.jobId);
    }
   }
  }
  for(const job of jobs.values())if(job.status==='done'&&job.output&&!covered.has(job.id)&&UUID.test(job.id)&&/^result(?:-[a-f0-9-]{36})?\.(png|jpg|webp)$/.test(job.output)){
   const id=digest('job|'+job.id+'|'+job.output),url='/images/'+job.id+'/'+job.output;
   images.push({id,kind:'retouch',jobId:job.id,name:'人物精修',version:job.round||1,created:job.created,account:clean(job.account),accountRole:clean(job.account)?'image':'unknown',model:job.resolvedModel||job.model||null,paintLevel:job.paintLevel||null,style:job.style||null,status:'saved',imageUrl:url,downloadUrl:url+'?download',thumbnailUrl:'/api/server/thumbnails/'+id,editUrl:'/?job='+job.id,workflowUrl:job.workflowId?'/workflows/?id='+job.workflowId:null,file:job.output});
  }
  images.sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id));this.records=new Map(images.map(r=>[r.id,r]));const signature=digest(JSON.stringify(images));if(signature!==this.signature){await this.write(images);this.signature=signature;}return images;
 });this.queue=next;return next;}
 list(params,accounts=[]){const query=String(params.get('q')||'').trim().slice(0,200).toLowerCase(),kind=params.get('kind'),account=params.get('account'),accountEmail=accounts.find(a=>a.id===account)?.email.toLowerCase(),page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page')))||1)),size=24;
  const all=[...this.records.values()],filtered=all.filter(r=>(!kind||r.kind===kind)&&(!account||(account==='unknown'?!r.account:r.account?.id===account||Boolean(accountEmail&&r.account?.email.toLowerCase()===accountEmail)))&&(!query||[r.name,r.account?.email,r.model,r.jobId,r.workflowId].some(v=>String(v||'').toLowerCase().includes(query))));
  return {images:filtered.slice((page-1)*size,page*size),total:filtered.length,page,pageSize:size,totalAll:all.length,counts:Object.fromEntries(['retouch','color','creative','pipeline'].map(kind=>[kind,all.filter(r=>r.kind===kind).length]))};
 }
 async thumbnail(id,jobs,workflows){
  if(!HASH.test(id))throw Error('图片记录编号无效。');const record=this.records.get(id);if(!record)throw Object.assign(Error('图片记录不存在，请刷新图库。'),{status:404});
  let file,allowed;
  if(record.assetId){file=(await workflows.asset(record.workflowId,record.assetId)).file;allowed=path.join(this.root,'workflows',record.workflowId,'assets');}
  else{const job=jobs.get(record.jobId);if(!job)throw Error('图片任务不存在。');file=path.join(job.directory,record.file);allowed=job.directory;}
  const resolved=await realpath(file),relative=path.relative(await realpath(allowed),resolved);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('图片位置无效。');
  const info=await stat(resolved),key=digest(id+'|'+info.size+'|'+info.mtimeMs),target=path.join(this.thumbs,key+'.webp');try{await stat(target);return target;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!this.pendingThumbs.has(key)){const task=(async()=>{const temporary=target+'.'+randomUUID()+'.tmp';await sharp(resolved,{limitInputPixels:40000000}).rotate().resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:75}).toFile(temporary);await replaceFile(temporary,target);return target;})().finally(()=>this.pendingThumbs.delete(key));this.pendingThumbs.set(key,task);}
  return this.pendingThumbs.get(key);
 }
}
