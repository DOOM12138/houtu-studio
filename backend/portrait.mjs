import {workflowImage} from '../lib/workflow-image.mjs';
import {requireAnalysisSpec} from '../lib/prompt-registry.mjs';
import {accountSnapshot} from './accounts.mjs';
import {normalizeModel} from '../public/model-options.js';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {decodeImage} from '../lib/painting.mjs';
import {PORTRAIT_AREAS,portraitOptions} from '../public/portrait-options.js';
export async function pictureSignature(bytes){const decoded=await sharp(bytes,{limitInputPixels:40000000,failOn:'error'}).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});return createHash('sha256').update(`${decoded.info.width}x${decoded.info.height}:`).update(decoded.data).digest('hex');}
export async function resolvePicture(input,{jobs,workflows}){
 let bytes,parentJobId=null,parentWorkflowId=null,sourceAsset=null,sourceStep=null,sourceOrigin=null;
 const ref=input.source;
 if(ref!==undefined){
  if(input.image!==undefined||!ref||typeof ref!=='object')throw Error('本机图片引用无效。');
  if(ref.kind==='workflow'){
   const resolved=await workflowImage(workflows,ref,{read:true}),w=resolved.w;bytes=resolved.bytes;parentWorkflowId=w.id;parentJobId=w.jobId&&jobs.has(w.jobId)?w.jobId:null;sourceAsset=ref.assetId;sourceStep=resolved.origin.stepId;sourceOrigin=resolved.origin;
  }else{
   if(!['source','result'].includes(ref.kind)||typeof ref.jobId!=='string')throw Error('本机作品引用无效。');const job=jobs.get(ref.jobId);if(!job)throw Error('引用的作品不存在。');const name=ref.kind==='result'?job.output:`source.${job.extension}`;if(!name||!/^(source|result(?:-[a-f0-9-]{36})?)\.(png|jpg|webp)$/.test(name)||ref.kind==='result'&&job.status!=='done')throw Error('引用的图片尚未完成或不可用。');bytes=await readFile(path.join(job.directory,name));parentWorkflowId=job.workflowId||null;parentJobId=ref.kind==='result'?job.id:job.parentId||null;sourceStep=ref.kind==='result'?'compose':'source';if(parentWorkflowId){const workflow=await workflows.get(parentWorkflowId),id=workflow.steps.find(n=>n.id===sourceStep&&n.status==='done')?.output?.imageAsset;if(id){const resolved=await workflowImage(workflows,{workflowId:parentWorkflowId,assetId:id},{read:true});if(resolved.bytes.equals(bytes)){sourceOrigin=resolved.origin;sourceAsset=id;sourceStep=resolved.origin.stepId;}}}
  }
 }else bytes=decodeImage(input.image).bytes;
 const identity=[];let ancestor=parentWorkflowId;
 for(let i=0;ancestor&&i<20;i++){
  const w=await workflows.get(ancestor),source=w.steps[0]?.output;
  if(source?.referenceAssets?.length){for(const assetId of source.referenceAssets.slice(0,5))identity.push({workflowId:w.id,assetId});break;}
  if(w.kind==='creative'&&source?.source){for(const assetId of [source.source,...(source.characters||[])].slice(0,5))identity.push({workflowId:w.id,assetId});break;}
  ancestor=w.parentId;
 }
 return {bytes,parentJobId,parentWorkflowId,sourceAsset,sourceStep,sourceOrigin,identity};
}
export function validatePortraitAudit(value){
 if(!value||typeof value.summary!=='string'||!Array.isArray(value.issues))throw Error('画面检查没有返回可用建议，请从检查步骤重试。');
 const issues=PORTRAIT_AREAS.map(([id,name])=>{const item=value.issues.find(x=>x.area===id);if(!item||!['none','minor','moderate','not-visible'].includes(item.severity)||typeof item.finding!=='string'||typeof item.recommendation!=='string')throw Error('画面检查缺少部位信息，不能假定所有部位都需要修改。');return {area:id,name,severity:item.severity,finding:item.finding.slice(0,600),recommendation:item.recommendation.slice(0,600)};});
 if(!value.profile?.levels||!PORTRAIT_AREAS.every(([id])=>Number.isInteger(value.profile.levels[id])&&value.profile.levels[id]>=0&&value.profile.levels[id]<=3))throw Error('画面检查缺少可执行的部位细化建议。');
 const profile=portraitOptions(value.profile);for(const issue of issues)if(['none','not-visible'].includes(issue.severity))profile.levels[issue.area]=0;
 profile.notes=issues.filter(x=>!['none','not-visible'].includes(x.severity)).map(x=>`${x.name}：${x.recommendation}`).join('\n').slice(0,2000);
 return {summary:value.summary.slice(0,1500),issues,profile};
}
export async function auditPortrait({workflows,bridge,resolved,auditId,control={},model=null}){
 const promptSpec=requireAnalysisSpec('portrait.audit');model=normalizeModel(model);let w;
 if(auditId){const previous=await workflows.get(auditId);if(previous.kind!=='portrait-audit')throw Error('人物检查工作流类型不符。');if(normalizeModel(previous.steps[0].output?.model)!==model){const asset=await workflows.asset(previous.id,previous.steps[0].output.imageAsset);resolved={bytes:await readFile(asset.file),parentWorkflowId:previous.id};auditId=null;}}
 if(auditId){w=await workflows.get(auditId);if(w.kind!=='portrait-audit')throw Error('人物检查工作流类型不符。');}
 else{w=await workflows.create({kind:'portrait-audit',name:'人物画面检查',parentId:resolved.parentWorkflowId});const image=await workflows.putAsset(w.id,resolved.bytes,'image/png');await workflows.checkpoint(w.id,'source',{model,imageAsset:image.id,pixelSignature:await pictureSignature(resolved.bytes),sourceWorkflowId:resolved.parentWorkflowId},[{id:image.id,type:'image',label:'本轮实际需要细化的图片'}],'当前人物成品已保存');}
 const node=w.steps.find(n=>n.id==='diagnose');if(node.status==='done')return {workflowId:w.id,diagnosis:node.output};
 control.model=model||w.executionModel||null;control.account=w.executionAccount||null;bridge.capture?.(control);
 if(control.account&&!w.executionAccount)await workflows.mutate(w.id,current=>{current.executionAccount=control.account;return {};});
 control.onModelSelected=async selected=>{if(selected)await workflows.mutate(w.id,current=>{current.executionModel=selected;return {};});};
 const attempt=await workflows.begin(w.id,'diagnose');
 try{
  const image=await workflows.asset(w.id,(await workflows.get(w.id)).steps[0].output.imageAsset),dir=path.join(workflows.folder(w.id),'vision',attempt.token);await mkdir(dir,{recursive:true});const file=path.join(dir,'portrait.jpg');await writeFile(file,await sharp(image.file).rotate().flatten({background:'#f0f0f0'}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:92}).toBuffer());
  const data=await bridge.analyzeImages([file],`Inspect this exact finished image for a conservative second-pass portrait retouch. Do not identify the real person or give medical diagnoses. Preserve identity, facial proportions, pose, existing medium/style (anime/photo/3D), clothing design, background, color grading and composite effects. Inspect visible defects and opportunities only; do not invent hidden hands, texture or anatomy. Return JSON {summary:Chinese string,issues:[{area:face|eyes|skin|hair|hands|outfit|accessories|light,severity:none|minor|moderate|not-visible,finding:Chinese string,recommendation:Chinese string}],profile:{levels:{face:0..3,eyes:0..3,skin:0..3,hair:0..3,hands:0..3,outfit:0..3,accessories:0..3,light:0..3},texture:0..100,faceLock:true}}. Include all eight areas; use not-visible and level0 for areas outside the image. Prefer level1 for minor refinements, no blanket strong smoothing. Levels are model-editing instructions, not deterministic numeric filter amounts.`,control);
  const diagnosis={...validatePortraitAudit(data),promptVersion:promptSpec.version,compiledPrompt:control.analysisPrompt||null,account:accountSnapshot(control.account),model,resolvedModel:control.resolvedModel||null};await workflows.complete(w.id,'diagnose',attempt.token,{state:diagnosis,message:'画面检查与细化建议已保存，等待确认，不自动出图'});return {workflowId:w.id,diagnosis};
 }catch(e){await workflows.fail(w.id,'diagnose',attempt.token,e.message).catch(()=>{});throw Object.assign(e,{workflowId:w.id});}
}
