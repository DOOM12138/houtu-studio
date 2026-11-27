import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {workflowImage} from '../lib/workflow-image.mjs';
import {normalizeEditOptions,decodeImage} from '../lib/painting.mjs';
import {recipeValue,validateDeskMode} from './studio-recipe.mjs';
import {referenceInputs} from './feature-images.mjs';
import {orientedDimensions} from '../lib/images.mjs';
import {agentOptions} from '../public/retouch-agent-options.js';
import {PRESETS} from '../public/catalog.js';
import {stepPicture} from '../public/workflow-pictures.js';
import {agentSubjectMask} from './agent-mask.mjs';
import {readFile} from 'node:fs/promises';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error=(message,status=400)=>Object.assign(Error(message),{status});
const preset=id=>PRESETS.find(tool=>tool.id===id);
export function deskRecipe(input){
 const finish={type:'export',name:'保存成片',options:{format:'png',maxEdge:0}};
 if(input.mode==='auto'){
  const a=input.auto||{};
  if(a.paint===true&&a.paintLevel!==undefined&&(!Number.isInteger(a.paintLevel)||a.paintLevel<1||a.paintLevel>10))throw error('厚涂程度需要 1–10 的整数。');
  const paintStyle=a.paintStyle??'cos';
  if(a.paint===true&&!['cos','anime'].includes(paintStyle))throw error('请选择二次元或 COS 质感厚涂。');
  const provider=a.referenceProvider??'xiaohongshu';
  if(!['xiaohongshu','douyin','commons','none'].includes(provider))throw error('请选择有效的参考图来源。');
  const tasks=['portrait','color',...(a.paint===true?['paint']:[]),...(a.effects===true?['effects']:[])];
  const opts=agentOptions({mode:'auto',provider:'auto',hardwarePolicy:'auto',sceneGuide:{character:a.character,work:a.work},tasks,...(a.paint===true&&a.paintScope!==undefined?{paintScope:a.paintScope}:{}),style:a.paint===true?paintStyle:'natural',paintLevel:a.paintLevel??2,effect:a.effect||'sparkles',autoSearch:provider!=='none',referenceProvider:provider==='none'?'xiaohongshu':provider,allowPublicFallback:false,quality:true,autoRepair:false,maxImageSteps:6,planningModel:input.model,generationModel:input.model});
  return recipeValue({name:'全自动 · 场景精修',model:input.model,stages:[{type:'agent',name:'分析场景并自动精修',options:opts},finish]});
 }
 if(input.mode!=='semi')throw error('请选择全自动或半自动。');
 const ids=input.operations;
 if(!Array.isArray(ids)||ids.length<1||ids.length>PRESETS.length||new Set(ids).size!==ids.length||ids.some(id=>!preset(id)))throw error('请至少勾选一个已有功能，每项只加入一次。');
 return recipeValue({name:'半自动 · 逐步修图',reviewEach:true,model:input.model,stages:[...ids.map(id=>({type:'retouch',name:preset(id).name,options:{operation:id}})),finish]});
}

export class AiDeskRuns{
 constructor({studio,workflows,agents,subjectMask=agentSubjectMask}){
  Object.assign(this,{studio,workflows,agents,subjectMask});this.preparing=new Map();this.advancing=new Set();
 }
 async prepare(input){
  if(!uuid.test(input.requestKey||''))throw error('工作流需要有效的开始编号。');
  const recipe=deskRecipe(input),source=await workflowImage(this.workflows,input.source||{},{read:true});
  const signature=hash({source:source.origin,recipe}),key=input.requestKey;
  const existing=this.preparing.get(key);
  if(existing){if(existing.signature!==signature)throw error('开始编号已属于另一份设置。',409);return existing.promise;}
  const promise=this.prepareRecorded(input,recipe,source,signature);
  this.preparing.set(key,{signature,promise});
  try{return await promise;}finally{this.preparing.delete(key);}
 }
 async prepareRecorded(input,recipe,source,signature){
  let project=[...this.studio.projects.values()].find(p=>p.aiDesk?.key===input.requestKey);
  if(project&&project.aiDesk.signature!==signature)throw error('开始编号已用于另一张图片或其他设置。',409);
  if(!project&&(this.studio.active||this.studio.archiving||this.studio.adapter.isBusy()))throw error('有任务正在执行，请在其完成后开始。',409);
  if(!project)project=await this.studio.create({name:String(input.name||'当前照片').slice(0,70)+' · '+(input.mode==='auto'?'全自动':'半自动'),recipe},{key:input.requestKey,signature,mode:input.mode,origin:source.origin});
  const photo=project.photos[0]||(await this.studio.addPhoto(project.id,source.bytes,input.name||'当前照片',{savedSource:true,sourceLink:source.origin})).photo;
  const w=await this.workflows.get(photo.originalWorkflowId);
  if(!w.sourceOrigin)await this.workflows.mutate(w.id,current=>{current.parentId=source.origin.workflowId;current.sourceOrigin=source.origin;return {};});
  return this.view(project.id);
 }
 async record(id){
  const project=await this.studio.get(id),photo=project.photos[0];
  if(!project.aiDesk||!photo)throw error('没有可打开的 AI 修图流程。',404);
  const workflow=await this.workflows.get(photo.originalWorkflowId);
  validateDeskMode(project.aiDesk.mode,workflow.recipe);
  return {project,photo,workflow};
 }
 async view(id){
  const {project,photo,workflow:w}=await this.record(id),nodes=w.steps.slice(1),pending=nodes.find(n=>n.status!=='done');
  const steps=nodes.map((n,i)=>{
   const definition=w.recipe.stages[i],child=n.output?.childWorkflowId||w.agentChildren?.[n.id]?.childWorkflowId;
   return {id:n.id,name:n.name,type:definition.type,operation:definition.options?.operation||null,status:n.status,skipped:n.output?.skipped===true,attempts:n.attempts.length,inputsFrozen:n.attempts.some(a=>a.output?.requestKey),message:n.message,picture:stepPicture(w,n.id),child:child||null};
  });
  const completed=[...steps].reverse().find(s=>s.picture),busy=this.studio.active?.projectId===id;
  let agent=null;
  if(project.aiDesk.mode==='auto'){
   const child=steps.find(s=>s.type==='agent')?.child;
   if(child){const v=await this.agents.view(child);agent={id:child,current:v.current,referenceProvider:v.config.referenceProvider,sceneGuide:v.config.sceneGuide,
     steps:v.steps.map(s=>({id:s.id,name:s.name,status:s.status,message:s.message,picture:s.imageOrigin,
      ...(s.id==='references'?{referenceSearch:{count:s.output?.references?.length||0,
       queries:(s.output?.queries||[]).slice(-16).map(({query,provider,status})=>({query,provider,status})),
       warnings:(s.output?.warnings||[]).slice(-4)}}:{})})),
     submitted:v.budget.submitted};}
  }
  const source=stepPicture(w,'source'),recordedOrigin=w.sourceOrigin||project.aiDesk.origin;
  return {id,mode:project.aiDesk.mode,source,origin:w.restoredBackup?source:recordedOrigin,recordedOrigin,name:photo.name,photoId:photo.id,workflowId:w.id,revision:w.revision,steps,agent,queue:project.queue.state,message:project.queue.message,busy,current:photo.workflowId===w.id,done:!pending,next:pending?.id||null,result:completed?.picture||null,previousReview:pending?w.deskReviews?.[pending.id]?.options||null:null};
 }
 async stop(id,{workflowId}={}){
  const {workflow}=await this.record(id),owner=this.studio.active;
  if(workflowId!==workflow.id)throw error('工作流版本已变化。',409);
  if(owner?.projectId!==id)return this.view(id);
  owner.cancelCurrent=true;owner.stop=true;
  const node=workflow.steps.find(s=>s.id===owner.currentStep);
  const agent=workflow.agentChildren?.[node?.id]?.childWorkflowId;
  if(agent)await this.agents.pause(agent,{cancel:true});
  else if(node?.output?.childJobId)await this.studio.adapter.cancelReviewed(node.output.childJobId,workflowId);
  await this.studio.pause(id);return this.view(id);
 }
 async advance(id,input){
  if(this.advancing.has(id))throw error('这一步正在提交，请稍后查看。',409);
  this.advancing.add(id);
  try{
   const {project,photo,workflow:w}=await this.record(id);
   if(photo.workflowId!==w.id||input.workflowId!==w.id)throw error('照片版本已变化，请重新打开工作流。',409);
   const node=w.steps.slice(1).find(n=>n.status!=='done');
   if(!node||this.studio.active?.projectId===id||input.step!==node.id||input.revision!==w.revision)throw error('步骤已变化，请查看当前进度。',409);
   const semi=project.aiDesk.mode==='semi',definition=w.recipe.stages.find(s=>s.id===node.id);
   let revision=w.revision;
   if(semi&&definition.type==='retouch'){
    const origin=stepPicture(w,node.deps[0]);
    if(!origin)throw error('这一步所需的输入还没有完成。',409);
    const previous=w.deskReviews?.[node.id];
    const submitted=node.attempts.some(a=>a.output?.requestKey);
    if(submitted&&previous?.inputAsset!==origin.assetId)throw error('输入已变更，请从希望使用的结果新建流程。',409);
    if(input.decision==='skip'&&submitted)throw error('本步已有提交记录，请先核对原请求。',409);
    const review=submitted?previous:input.decision==='skip'?{skip:true,options:definition.options,inputAsset:origin.assetId,inputOrigin:origin}:await this.stageReview(w,definition,origin,input);
    if(!review)throw error('历史请求缺少原有参数，请查看子工作流。',409);
    const updated=await this.workflows.mutate(w.id,current=>{
     if(current.revision!==w.revision)throw error('确认期间版本已变化，请刷新。',409);
     current.deskReviews||={};current.deskReviews[node.id]=review;return {};
    });revision=updated.workflow.revision;
   }
   await this.studio.run(id,{photoIds:[photo.id],mode:semi?'semi':'auto',concurrency:1},semi?{workflowId:w.id,step:node.id,revision}:null);
   return this.view(id);
  }finally{this.advancing.delete(id);}
 }
 async stageReview(w,definition,origin,input){
  const operation=definition.options.operation,tool=preset(operation);
  if(operation==='custom'&&!input.options?.prompt?.trim())throw error('请填写本步的完整自定义提示词。');
  if(input.options?.operation&&input.options.operation!==operation)throw error('本步只能执行已勾选的功能。');
  const options=normalizeEditOptions({...definition.options,...input.options,operation,model:null,parentId:null,promptMode:operation==='custom'?'custom':'guided'});
  if(tool.needsTarget&&!options.task.target&&!options.selection)throw error('请说明本步需要处理的物品或范围。');
  let maskAsset=null,targetMaskAsset=null;
  const bytes=await readFile((await this.workflows.asset(w.id,origin.assetId)).file);
  const shape=await orientedDimensions(bytes);
  const storeMask=async(data,generate)=>{
   let mask;
   if(data){const decoded=decodeImage(data);if(decoded.extension!=='png')throw error('保护范围需要 PNG 蒙版。');mask=decoded.bytes;}
   else if(generate){
    const estimate=await this.subjectMask(bytes);
    if(!estimate.found||estimate.requiresReview||!estimate.mask)throw error('主体边缘需要确认。请上传黑色保留主体的 PNG，或在本步明确关闭主体保护。');
    mask=await sharp(estimate.mask).flatten({background:'black'}).greyscale().negate().png().toBuffer();
   }else return null;
   const m=await sharp(mask,{limitInputPixels:40000000}).metadata();
   if(m.format!=='png'||Math.abs(m.width/m.height-shape.width/shape.height)>.025)throw error('蒙版长宽比需要与本步输入相同。');
   return (await this.workflows.putAsset(w.id,mask,'image/png')).id;
  };
  if(options.scene?.protectSubject)maskAsset=await storeMask(input.protectionMask,true);
  if(input.targetMask){if(tool.fullFrame)throw error('此功能使用完整画布。');targetMaskAsset=await storeMask(input.targetMask,false);}
  const data=referenceInputs(input.references||[]);
  if(tool.referenceRole&&!data.some(r=>r.role===tool.referenceRole||r.role==='any'))throw error('请为本步添加对应的参考图。');
  const refs=[];
  for(const ref of data){
   if(tool.referenceRole&&!['any',tool.referenceRole,'style','result-guide'].includes(ref.role))throw error('参考图用途与本步不一致。');
   const bytes=await sharp(ref.bytes,{limitInputPixels:40000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
   const asset=await this.workflows.putAsset(w.id,bytes,'image/png');refs.push({assetId:asset.id,title:ref.title,role:ref.role==='any'&&tool.referenceRole?tool.referenceRole:ref.role});
  }
  return {options,inputAsset:origin.assetId,inputOrigin:origin,maskAsset,targetMaskAsset,featureReferences:refs};
 }
}
