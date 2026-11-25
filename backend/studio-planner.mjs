import os from 'node:os';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {PRESETS} from '../public/catalog.js';
import {PLANNING_VERSION,planningOptions,localObservation,localProposal,planningPrompt,planningOperations,choosePlanningProvider} from '../public/studio-planning.js';
import {recipeValue,recipeReport} from './studio-recipe.mjs';
import {accountSnapshot} from './accounts.mjs';
import {requireAnalysisSpec} from '../lib/prompt-registry.mjs';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const clone=x=>structuredClone(x);

export function planningCapacity({memory=os.totalmem(),cores=os.availableParallelism?.()||os.cpus().length,modelsReady=true}={}){
 const local=modelsReady&&memory>=4*1024**3&&cores>=2;
 return {memoryGiB:Math.round(memory/1024**3),cores,modelsReady,localSupported:modelsReady,recommended:local?'local':'chatgpt',concurrency:memory>=8*1024**3&&cores>=4?2:1,reason:local?'本机内存和CPU足以运行内置视觉小模型，优先本机识别与规则规划。':modelsReady?'本机资源较少，建议ChatGPT规划，跑图按一张执行。':'内置识别模型未完整安装，建议修复组件或使用ChatGPT规划。',localDescription:'MediaPipe人物／面部识别＋任务规则；复杂审美与自由指令使用ChatGPT规划。'};
}

export function checkedProposal(data,options,photo){
 if(!data||typeof data.summary!=='string'||!data.summary.trim()||!Array.isArray(data.recipe?.stages)||data.recipe.stages.length>8)throw fail('调度模型没有返回完整方案，请从分析步骤重试。',400);
 const allowed=planningOperations(options.tasks);
 const stages=data.recipe.stages.map(s=>{
  if(!s||!['retouch','grade','upscale','export'].includes(s.type))throw fail('规划包含未授权的步骤类型，不能自动裁切或旋转原图。',400);
  if(s.type==='retouch'){
   if(!allowed.has(s.options?.operation)||s.options?.selection)throw fail('规划中包含无效工具或未经确认的坐标选区。',400);
   if(!options.tasks.includes('belly')&&['smooth-belly','body-shape','garment-fit'].includes(s.options.operation))throw fail('未选择身材调整，规划不能自动安排瘦身。',400);
   if(!options.tasks.includes('paint')&&(['anime-paint','cos-paint'].includes(s.options.operation)||['anime','cos'].includes(s.options.style)))throw fail('未选择厚涂，规划不能自动转画风。',400);
   if((['anime','cos'].includes(s.options.style)&&s.options.style!==options.style)||(s.options.operation==='cos-paint'&&options.style!=='cos')||(s.options.operation==='anime-paint'&&options.style!=='anime'))throw fail('规划的厚涂风格与所选COS／二次元媒介不一致，请重新分析。',400);
   if(['anime-paint','cos-paint'].includes(s.options.operation)&&s.options.style!==options.style)throw fail('厚涂步骤未采用所选媒介，请重新分析。',400);
   const cleanup=['clear-background','remove-people','remove-equipment'].includes(s.options.operation);
   const paintStage=['anime-paint','cos-paint'].includes(s.options.operation)||['anime','cos'].includes(s.options.style)||s.options.operation==='full-body'&&options.tasks.includes('paint');
   return {...s,options:{...s.options,style:cleanup||options.tasks.includes('paint')&&!paintStage?'natural':options.style,promptMode:'guided',preserve:true,selection:null,paintLevel:options.paintLevel,...(cleanup?{scene:{...s.options.scene,protectSubject:true}}:{}),task:{...s.options.task,autoTarget:true}}};
  }
  if(s.type==='grade'&&!options.tasks.includes('color')||s.type==='upscale'&&!options.tasks.includes('upscale'))throw fail('规划增加了未选择的调色或超分任务。',400);
  if(s.type==='grade'){const look=s.options?.look;if(options.tone==='none'&&look&&Number(look.amount??70)>0||options.tone!=='none'&&!String(look?.id||'').startsWith(options.tone+'-'))throw fail('规划的影调与所选暗调／亮调／电影取向不一致。',400);}
  if(s.type==='export'&&s.options?.maxEdge)throw fail('调度方案不能擅自缩小最终成片尺寸。',400);
  return s;
 });
 if(['grade','upscale'].some(type=>stages.filter(s=>s.type===type).length>1))throw fail('同一方案不能重复叠加调色或超分步骤。',400);
 const recipe=recipeValue({...data.recipe,model:options.generationModel,stages}),report=recipeReport(recipe);
 if(report.aiSteps>options.maxAiSteps)throw fail('规划超过本轮AI步骤上限，请减少任务或重新规划。',400);
 const needsInput=[];
 for(const s of recipe.stages){
  if(s.type!=='retouch')continue;const tool=PRESETS.find(t=>t.id===s.options.operation);
  if(s.options.scene?.protectSubject&&!photo.maskPresent)needsInput.push('请为“'+s.name+'”保存主体保护蒙版。');
  if(tool?.referenceRole&&!photo.references.some(r=>['any',tool.referenceRole].includes(r.role)))needsInput.push('“'+s.name+'”需要'+tool.referenceRole+'用途的参考图。');
  if(tool?.needsTarget&&!s.options.task?.target)needsInput.push('请补充“'+s.name+'”的目标部位。');
 }
 return {photoId:photo.photoId,name:photo.name,summary:data.summary.trim().slice(0,1800),recipe,report,needsInput:[...new Set(needsInput)]};
}

export class StudioPlanner{
 constructor({root,studio,workflows,bridge,acquire,release,capacity}){Object.assign(this,{root,studio,workflows,bridge,acquire,release});this.capacityOverride=capacity;this.active=null;this.closing=false;}
 capabilities(){return planningCapacity(this.capacityOverride||{modelsReady:['selfie_multiclass_256x256.tflite','face_landmarker.task'].every(n=>existsSync(path.join(this.root,'models',n)))});}
 claim(){const c={id:randomUUID(),cancelled:false};if(this.closing||this.active||!this.acquire(c.id))throw fail('已有修图或分析任务在运行，请等待完成。');this.active=c;return c;}
 releaseSlot(c){if(this.active===c)this.active=null;this.release(c.id);}
 guard(c){if(c.cancelled||this.closing)throw fail('调度分析已停止。');}
 async preflight(projectId,input){
  const options=planningOptions(input),p=await this.studio.get(projectId);if(p.revision!==options.revision)throw fail('照片项目已变化，请刷新后重新规划。');let referenceCount=0;
  for(const id of options.photoIds){const photo=p.photos.find(x=>x.id===id);if(!photo||photo.flag==='reject')throw fail('请选择本项目中有效的照片。',400);const w=await this.workflows.get(photo.workflowId);referenceCount+=(w.steps[0].output.featureReferences||[]).length;}
  const capacity=this.capabilities();return {...choosePlanningProvider(options,capacity,referenceCount>0),capacity,referenceCount};
 }
 async projectSource(projectId,input){
  const options=planningOptions(input),decision=await this.preflight(projectId,input),project=await this.studio.get(projectId);this.studio.assertEditable(projectId);
  if(project.revision!==options.revision)throw fail('照片项目已变化，请刷新后重新规划。');
  const provider=decision.provider;
  if(provider==='local'&&!this.capabilities().modelsReady)throw fail('内置视觉模型缺失，请修复组件或选择ChatGPT规划。');
  const photos=[];
  for(const photoId of options.photoIds){
   const photo=project.photos.find(p=>p.id===photoId);if(!photo||photo.flag==='reject')throw fail('请选择本项目中有效的照片。',400);
   const w=await this.workflows.get(photo.workflowId),source=w.steps[0].output;
   const entry={photoId,name:photo.name,workflowId:w.id,workflowRevision:w.revision,originalWorkflowId:photo.originalWorkflowId,originalAsset:photo.originalAsset,width:photo.inspection.width,height:photo.inspection.height,maskPresent:!!source.maskAsset,references:clone(source.featureReferences||[])};
   if(provider==='local')entry.observation=localObservation(input.observations?.find(o=>o.photoId===photoId),entry);
   photos.push(entry);
  }
  return {projectId,projectRevision:project.revision,options,provider,decisionReason:decision.reason,capacity:decision.capacity,photos};
 }
 async start(projectId,input){
  const c=this.claim();let w;
  try{
   const source=await this.projectSource(projectId,input);this.guard(c);
   w=await this.workflows.create({kind:'studio-plan',name:'智能调度 · '+(await this.studio.get(projectId)).name});c.workflowId=w.id;
   await this.workflows.mutate(w.id,current=>{current.projectId=projectId;current.promptVersion=PLANNING_VERSION;return {};});
   const artifacts=[];
   for(const photo of source.photos){
    this.guard(c);const asset=await this.workflows.asset(photo.originalWorkflowId,photo.originalAsset);
    const preview=await sharp(asset.file,{limitInputPixels:40000000}).rotate().flatten({background:'#ededed'}).toColourspace('srgb').resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
    const saved=await this.workflows.putAsset(w.id,preview,'image/jpeg');photo.previewAsset=saved.id;artifacts.push({id:saved.id,type:'image',label:photo.name+' · 本轮分析预览'});
    for(const ref of photo.references){const a=await this.workflows.asset(photo.workflowId,ref.assetId),b=await sharp(a.file,{limitInputPixels:40000000}).rotate().flatten({background:'#ededed'}).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer(),r=await this.workflows.putAsset(w.id,b,'image/jpeg');ref.previewAsset=r.id;}
   }
   this.guard(c);await this.workflows.checkpoint(w.id,'source',source,artifacts,'原图、参考用途和规划设置已固定；未调用跑图。');
   this.launch(c,w.id);return {accepted:true,workflowId:w.id};
  }catch(error){this.releaseSlot(c);if(w)error.workflowId=w.id;throw error;}
 }
 launch(c,id){c.workflowId=id;c.completion=this.execute(c,id).finally(()=>this.releaseSlot(c));c.completion.catch(()=>{});}
 async retry(id){
  const w=await this.get(id);if(w.steps.find(s=>s.id==='proposal').status==='done')return {accepted:true,workflowId:id};
  const source=w.steps[0].output;if(!source)throw fail('输入准备未完成，请创建新的规划。');
  if((await this.studio.get(source.projectId)).revision!==source.projectRevision)throw fail('原项目已变化，请重新规划，不能复用过期输入。');
  const c=this.claim();this.launch(c,id);return {accepted:true,workflowId:id};
 }
 async get(id){const w=await this.workflows.get(id);if(w.kind!=='studio-plan')throw fail('不是智能调度工作流。',400);return w;}
 async view(id){
  const w=await this.get(id),source=w.steps[0].output,proposal=w.steps.find(s=>s.id==='proposal'),apply=w.steps.find(s=>s.id==='apply');
  return {workflowId:id,projectId:source?.projectId,provider:source?.provider,decisionReason:source?.decisionReason,capacity:source?.capacity,options:source?.options,status:this.active?.workflowId===id?'running':apply.status==='done'?'applied':proposal.status==='done'?'ready':w.steps.some(s=>s.status==='error')?'error':w.steps.some(s=>s.status==='interrupted')?'interrupted':'pending',steps:w.steps.map(s=>({id:s.id,name:s.name,status:s.status,message:s.message,attempts:s.attempts.length})),items:proposal.output?.items||w.steps.find(s=>s.id==='analysis').output?.items||[],application:apply.output||null};
 }
 async partial(id,token,items){await this.workflows.mutate(id,w=>{const n=w.steps.find(s=>s.id==='analysis');if(n.token!==token)throw fail('分析步骤已过期。');n.output={items:clone(items)};n.attempts.at(-1).output=clone(n.output);n.message='已分析 '+items.length+' 张，结果已保存。';return {};});}
 async execute(c,id){
  let current='analysis',token;
  try{
   let w=await this.get(id);const source=w.steps[0].output,options=source.options;
   const node=w.steps.find(s=>s.id==='analysis'),items=clone(node.output?.items||[...node.attempts].reverse().find(a=>a.output?.items)?.output.items||[]);
   if(node.status!=='done'){
    ({token}=await this.workflows.begin(id,'analysis'));await this.partial(id,token,items);
    if(source.provider==='chatgpt'){
     requireAnalysisSpec('studio.plan');if(!await this.bridge.account())throw fail('请先登录本站ChatGPT账号再进行智能规划。',401);
     c.model=options.analysisModel;c.resolvedModel=w.executionModel||null;c.account=w.executionAccount||null;this.bridge.capture?.(c);
     await this.workflows.mutate(id,flow=>{flow.executionAccount=accountSnapshot(c.account);return {};});
     c.onModelSelected=async model=>{if(model)await this.workflows.mutate(id,flow=>{flow.executionModel=model;return {};});};
    }
    for(const photo of source.photos){
     this.guard(c);if(items.some(i=>i.photoId===photo.photoId))continue;let data,prompt=null;
     if(source.provider==='local')data=localProposal(options,photo.observation,photo);
     else{
      const allowed=planningOperations(options.tasks),tools=PRESETS.filter(p=>allowed.has(p.id)).map(p=>({id:p.id,name:p.name,referenceRole:p.referenceRole||null}));prompt=planningPrompt(options,photo,tools);
      const files=[];for(const hash of [photo.previewAsset,...photo.references.map(r=>r.previewAsset)])files.push((await this.workflows.asset(id,hash)).file);
      data=await this.bridge.analyzeImages(files,prompt,c);this.guard(c);
     }
     if(JSON.stringify(data).length>256000)throw fail('规划返回内容过大，请从本步重试。',400);
     const item={...checkedProposal(data,options,photo),analysis:{provider:source.provider,engine:source.provider==='local'?'mediapipe-browser+task-rules-v1':'chatgpt',model:source.provider==='local'?'selfie-multiclass+face-landmarker':options.analysisModel,resolvedModel:source.provider==='chatgpt'?c.resolvedModel||null:null,account:source.provider==='chatgpt'?accountSnapshot(c.account):null,promptVersion:PLANNING_VERSION,compiledPrompt:prompt,rawProposal:clone(data),observation:photo.observation||null}};
     if(source.provider==='local'&&item.recipe.stages.some(s=>['smooth-belly','body-shape','garment-fit'].includes(s.options.operation)))item.needsInput.push('本机视觉模型不能确认腹部可见范围，请先检查瘦腹部位再手动运行。');
     items.push(item);await this.partial(id,token,items);
    }
    this.guard(c);await this.workflows.complete(id,'analysis',token,{state:{items},message:'逐张识别与任务规划已保存；未调用图片生成'});token=null;
   }
   current='proposal';({token}=await this.workflows.begin(id,'proposal'));this.guard(c);w=await this.get(id);
   const finalItems=w.steps.find(s=>s.id==='analysis').output.items,totals={aiSteps:finalItems.reduce((n,i)=>n+i.report.aiSteps,0),localSteps:finalItems.reduce((n,i)=>n+i.report.localSteps,0)};
   await this.workflows.complete(id,'proposal',token,{state:{items:finalItems,totals,concurrency:source.capacity.concurrency},message:'方案已准备，确认应用后才建立各张照片的新流程'});token=null;
  }catch(error){if(token)await this.workflows[c.cancelled||this.closing?'interrupt':'fail'](id,current,token,error.message).catch(()=>{});throw error;}
 }
 async apply(id,{revision}={}){
  const c=this.claim();let token;
  try{
   const w=await this.get(id),source=w.steps[0].output,node=w.steps.find(s=>s.id==='proposal'),applied=w.steps.find(s=>s.id==='apply');
   if(applied.status==='done'){const current=await this.studio.get(source.projectId);if(!applied.output.versions.every(v=>current.photos.some(p=>p.id===v.photoId&&p.workflowId===v.workflowId)))throw fail('此方案已应用过，但当前照片版本已经变化。请使用历史重做或重新规划。');return {projectId:source.projectId,...applied.output,alreadyApplied:true};}
   if(node.status!=='done')throw fail('调度方案尚未完成。');
   const project=await this.studio.get(source.projectId),already=[];
   for(const item of node.output.items){const photo=project.photos.find(p=>p.id===item.photoId);if(photo&&(await this.workflows.get(photo.workflowId)).planOrigin?.workflowId===id)already.push({photoId:photo.id,workflowId:photo.workflowId});}
   if(already.length===source.photos.length){await this.workflows.checkpoint(id,'apply',{versions:already},[],'已恢复此前完成的应用记录，没有重新创建图片或流程');return {projectId:source.projectId,versions:already,alreadyApplied:true};}
   if(revision!==project.revision||project.revision!==source.projectRevision)throw fail('照片或设置已变化，请重新规划后应用。');
   for(const photo of source.photos){const actual=project.photos.find(p=>p.id===photo.photoId);if(actual?.workflowId!==photo.workflowId||(await this.workflows.get(photo.workflowId)).revision!==photo.workflowRevision)throw fail('规划对应的照片版本已变化，请重新规划。');}
   ({token}=await this.workflows.begin(id,'apply'));
   const result=await this.studio.mutate(source.projectId,async p=>{
    this.studio.assertEditable(p.id);if(p.revision!==source.projectRevision)throw fail('项目已变化，请重新规划。');const versions=[];
    for(const item of node.output.items){
     const photo=p.photos.find(x=>x.id===item.photoId),old=await this.workflows.get(photo.workflowId);
     await this.studio.buildPhotoVersion(p,photo,{recipe:recipeValue(item.recipe),reuse:old.recipe.model===item.recipe.model});
     await this.workflows.mutate(photo.workflowId,flow=>{flow.planOrigin={workflowId:id,photoId:photo.id,provider:source.provider};return {};});versions.push({photoId:photo.id,workflowId:photo.workflowId});
    }return {versions};
   },{historyLabel:'应用智能调度方案'});
   await this.workflows.complete(id,'apply',token,{state:{versions:result.versions},message:'已为每张照片建立独立新流程；可整组撤销，尚未开始跑图'});token=null;
   return {projectId:source.projectId,versions:result.versions};
  }catch(error){if(token)await this.workflows.fail(id,'apply',token,error.message).catch(()=>{});throw error;}finally{this.releaseSlot(c);}
 }
 async cancel(id){if(this.active?.workflowId===id){this.active.cancelled=true;if(this.active.threadId)await this.bridge.cancel(this.active).catch(()=>{});}return {ok:true};}
 async close(){this.closing=true;const c=this.active;if(c){c.cancelled=true;if(c.threadId)await this.bridge.cancel(c).catch(()=>{});await c.completion?.catch(()=>{});}}
}
