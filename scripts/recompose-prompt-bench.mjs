// Reuses saved raw images. This adapter cannot launch an AI request.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import sharp from 'sharp';
import {createApp} from '../server.mjs';
import {TARGET_POLICIES,TARGET_POLICY_VERSION,matchRepairBoundary,targetBlendOptions} from '../public/target-policy.js';
import {applyTargetRetention} from '../backend/target-vision.mjs';
import {prepareEditImage,finishEditImage,applyProtectionMask} from '../lib/images.mjs';
import {PRESETS} from '../public/catalog.js';
import {normalizeEditOptions} from '../lib/painting.mjs';
import {expandedCanvas,upscaleOutput} from '../backend/feature-images.mjs';
class LocalOnly extends EventEmitter{async account(){return null;}async stop(){}async begin(){throw Error('This process cannot generate images.');}}
const dir=path.resolve(process.argv[2]||'data/prompt-evaluations/2026-11-24/jobs'),caseIndex=process.argv.indexOf('--case'),selectedCase=caseIndex<0?null:process.argv[caseIndex+1];
if(caseIndex>=0&&!/^[a-z0-9-]+$/.test(selectedCase||''))throw Error('Invalid case ID');
const app=await createApp({directory:path.resolve('tmp/prompt-vision-review'),bridge:new LocalOnly(),platform:{async close(){}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let done=0,blocked=0;
try{
 const queue=JSON.parse(await fs.readFile(path.join(dir,'queue.json'),'utf8'));
 for(const entry of queue.jobs){
  const id=entry.id;if(!/^[a-z0-9-]+$/.test(id))throw Error('Invalid case ID');if(selectedCase&&id!==selectedCase)continue;
  const receiptFile=path.join(dir,id+'-result.json');let receipt;try{receipt=JSON.parse(await fs.readFile(receiptFile,'utf8'));}catch{continue;}
  if(!['complete','generated','generated-compose-error'].includes(receipt.status))continue;
  try{
   if(!receipt.raw)throw Error('Saved raw image is missing; no new generation will be attempted.');const raw=await fs.readFile(receipt.raw),job=JSON.parse(await fs.readFile(path.join(dir,id+'.json'),'utf8')),opts=normalizeEditOptions(job.options),p=await prepareEditImage(await fs.readFile(job.source.file),opts.selection);
   let original=p.source,region=job.region||p.region,expansionMask=null;const report={},tool=PRESETS.find(t=>t.id===opts.operation);
   if(job.expansion){const e=await expandedCanvas(original,opts.task);original=e.bytes;region=null;expansionMask=e.mask;}
   let result=await finishEditImage(raw,original,region,{report,matchBoundary:opts.operation!=='iris-color'}),target=null;
   if(TARGET_POLICIES[opts.operation]){
    target=await app.targetVision.analyze(original,{operation:opts.operation,areas:opts.areas,portrait:opts.portrait});
    if(target.found&&!target.integrity?.requiresReview){const retention=opts.task.sourceRetention,mask=await applyTargetRetention(target.mask,retention);result=await applyProtectionMask(result,original,mask,{report:report.target={},...targetBlendOptions(tool)});target={...target,mask:undefined,sourceRetention:retention};}
    else{target={...target,mask:undefined,inputRequired:true};if(!region)throw Error('A reviewed manual scope or explicit selection is required; the saved raw image is retained.');target.fallback='manual-selection';}
   }
   if(expansionMask)result=await applyProtectionMask(result,original,expansionMask,{report:report.expansion={}});
   if(opts.scene?.protectSubject&&job.source.mask)result=await applyProtectionMask(result,original,await fs.readFile(job.source.mask),{report:report.subject={},matchBoundary:matchRepairBoundary(tool)});
   if(opts.operation==='detail-upscale')result=await upscaleOutput(result,opts.task);
   report.needsReview=Boolean(report.needsReview||report.target?.needsReview||report.subject?.needsReview||report.expansion?.needsReview||target?.integrity?.requiresReview);
   const revision='recompose-'+randomUUID(),file=path.join(dir,id+'-scoped-'+revision+'.png'),m=await sharp(result).metadata(),composition={revision,policyVersion:TARGET_POLICY_VERSION,target,width:m.width,height:m.height,report};
   await fs.writeFile(file,result,{flag:'wx'});await fs.writeFile(file+'.json',JSON.stringify(composition,null,2),{flag:'wx'});
   const attempts=[...(receipt.compositionAttempts||[])];if(receipt.scoped)attempts.push({scoped:receipt.scoped,composition:receipt.composition||null,status:receipt.status});
   const next={...receipt,status:'complete',inputRequired:false,compositionFinished:new Date().toISOString(),scoped:file,composition,compositionAttempts:attempts},temporary=receiptFile+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(next,null,2));await fs.rename(temporary,receiptFile);done++;console.log(JSON.stringify({id,status:'complete',done,file,aiRequests:0}));
  }catch(error){blocked++;console.log(JSON.stringify({id,status:'composition-blocked',message:error.message,aiRequests:0}));}
 }
}finally{await app.close();}
console.log(JSON.stringify({recomposed:done,blocked,aiRequests:0}));
