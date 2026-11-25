import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {composite} from './compositor.mjs';
import {gradeProcess} from './local-image.mjs';
import {cloudSubject,cloudUpscale} from './agent-cloud.mjs';
import {agentActions,imageAction} from '../public/retouch-agent-options.js';
import {inspectionPrompt,validateInspection,planPrompt,validateAgentPlan,localAgentPlan,checkPrompt,validateAgentCheck,licensedMaterial} from './agent-planning.mjs';
const inputRequired=message=>Object.assign(Error(message),{code:'INPUT_REQUIRED'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function executeAgentStep(service,w,node,token,run,inputAsset){
 if(w.config.hardwarePolicy)w=await service.ensureCompute(w,node,run);
 const config=w.config,source=w.steps[0].output,id=w.id,base={imageAsset:inputAsset},bytes=()=>service.bytes(id,inputAsset),refs=()=>w.steps.find(s=>s.id==='references')?.output?.references||source.references||[];
 if(node.id==='inspect'){
  if(source.provider==='chatgpt'||config.hardwarePolicy){const result=await service.analyzeChecked(w,node,token,run,[source.previewAsset],inspectionPrompt(config),value=>validateInspection(value,config));return {...base,...result.checked,analysis:result.receipt};}
  const image=await sharp(await bytes()).stats();return {...base,subjectPresent:null,summary:'本机图像指标与视觉分割辅助，不包含语言模型的复杂审美判断。',observations:[],queries:[{purpose:'style',query:config.goal.slice(0,120)||'cosplay portrait light color'},{purpose:'material',query:'transparent fantasy light particles PNG'}],luminance:image.channels.slice(0,3).map(c=>c.mean),analysis:{provider:'local',engine:'image-statistics+headless-segmentation'}};
 }
 if(node.id==='references'){
  const prior=node.output?.references||[],references=[...(w.manualReferences||source.references||[]),...prior].filter((r,i,a)=>a.findIndex(p=>p.assetId===r.assetId)===i).slice(0,5),warnings=[...(node.output?.warnings||[])],attempted=[...(node.output?.queries||[])];
  const save=()=>service.partial(id,node.id,token,{...base,references,warnings,queries:attempted});await save();
  if(config.autoSearch){
   const observation=w.steps.find(s=>s.id==='inspect').output,queries=observation.queries||[];const needMaterial=config.tasks.some(t=>['small','large'].includes(t));
   for(const q of queries.filter(q=>q.purpose==='style'||needMaterial)){
    service.guard(run);if(references.length>=config.referenceCount)break;
    if(!attempted.some(p=>p.query===q.query&&p.purpose===q.purpose))attempted.push(q);await save();
    let pool=[],provider=config.referenceProvider;
    try{if(provider==='xiaohongshu'&&q.purpose==='style'){
      if(typeof service.platform.open!=='function')throw Error('此设备未配置独立平台浏览器。');await service.platform.open();const found=await service.platform.search(q.query);pool=(found.results||[]).slice(0,8);
     }else{provider='commons';pool=await service.search(q.query);}
    }catch(error){warnings.push(error.message);if(provider==='xiaohongshu'&&config.allowPublicFallback){provider='commons';try{pool=await service.search(q.query);}catch(e){warnings.push(e.message);}}else if(provider==='xiaohongshu')throw inputRequired('平台需要登录或验证，请完成后继续，或允许公开图库备用。');}
    for(const entry of pool.slice(0,8)){
     service.guard(run);if(references.length>=config.referenceCount)break;const url=entry.url;if(references.some(r=>r.url===url))continue;
     try{let raw,title,license,usage='reference-only';if(provider==='xiaohongshu'){const captured=await service.platform.capture(url);raw=captured.bytes;title=captured.title;license='平台例图，仅作参考，保留水印';}
      else{const fetched=await service.fetchAsset(entry.image);raw=fetched.bytes;title=entry.title;license=entry.license;if(q.purpose==='material'&&licensedMaterial({...entry,usage:'material'}))usage='material';}
      const normalized=await sharp(raw,{limitInputPixels:24000000}).rotate().flatten({background:'white'}).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer(),asset=await service.workflows.putAsset(id,normalized,'image/jpeg');
      if(references.some(r=>r.assetId===asset.id))continue;references.push({assetId:asset.id,title:String(title||'自动参考').slice(0,180),url,license:String(license||'许可未明确，仅作参考').slice(0,180),creator:String(entry.creator||'').slice(0,180),usage,origin:provider});await save();
     }catch(error){warnings.push(error.message);await save();}
    }
   }
  }
  if(config.autoSearch&&references.length<config.referenceCount)warnings.push('实际取得'+references.length+'张参考，少于目标'+config.referenceCount+'张；未补入虚构图片。');
  if(config.materialFallback==='pause'&&config.tasks.some(t=>['small','large'].includes(t))&&!references.some(licensedMaterial))throw inputRequired('未取得可直接合成的授权素材；请上传／更换参考，或允许原创生成。');
  return {...base,references,warnings,queries:attempted,materialMode:references.some(licensedMaterial)?'licensed-material':'original-generation-if-needed'};
 }
 if(node.id==='plan'){
  const references=refs(),observation=w.steps.find(s=>s.id==='inspect').output;let plan,analysis;
  if(source.provider==='chatgpt'||config.hardwarePolicy){const result=await service.analyzeChecked(w,node,token,run,[source.previewAsset,...references.map(r=>r.assetId)],planPrompt(config,observation,references),value=>validateAgentPlan(value,config,references));plan=result.checked;analysis=result.receipt;}
  else{plan=localAgentPlan(config,observation,references);analysis={provider:'local',engine:'task-rules',model:'mediapipe-selfie-segmentation'};}
  if(observation.subjectPresent===false){const person=plan.actions.find(a=>a.id==='person');if(person){person.skip=true;person.reason='原图分析未见人物，不凭空增加人物修整。';}}if(observation.observations?.some(o=>o.task==='belly'&&o.visible===false)){const belly=plan.actions.find(a=>a.id==='belly');if(belly){belly.skip=true;belly.reason='腹部不可见，不虚构人体调整。';}}
  return {...base,plan,analysis};
 }
 if(node.id==='subject'){
  const actions=w.steps.find(s=>s.id==='plan').output.plan.actions,needed=actions.some(a=>!a.skip&&['person','belly','clean','small','effects'].includes(a.id));if(!needed)return {...base,maskAsset:null,skipped:true,reason:'所选流程未需要主体像素蒙版。'};
  if(w.steps.find(s=>s.id==='inspect')?.output?.subjectPresent===false&&!actions.some(a=>!a.skip&&['person','belly','clean'].includes(a.id)))return {...base,maskAsset:null,skipped:true,reason:'规划未发现需要保护的人物；只执行已勾选的背景特效／小合成。',origin:'planning-no-visible-subject'};
  if(source.protectionMask){const original=await service.bytes(id,source.protectionMask),mask=await sharp(original).flatten({background:'black'}).removeAlpha().greyscale().negate().png().toBuffer(),saved=await service.workflows.putAsset(id,mask,'image/png');return {...base,maskAsset:saved.id,origin:'saved-confirmed-mask',requiresReview:false};}
  if(config.hardwarePolicy&&service.compute(w)==='cloud')return cloudSubject(service,w,node,token,run,inputAsset);
  let result;try{result=await service.mask(await bytes(),{cancelled:()=>service.stopping(run)});}catch(error){if(!config.hardwarePolicy)throw error;await service.localFallback(w,node,error,run);return cloudSubject(service,await service.get(id),node,token,run,inputAsset);}
  if(!result.found||result.requiresReview){await service.partial(id,node.id,token,{...base,estimatedMask:result.mask?(await service.workflows.putAsset(id,result.mask,'image/png')).id:null,metrics:{coverage:result.coverage,confidence:result.confidence},engine:result.engine});throw inputRequired('本机主体识别不够可靠，请在Agent中确认或上传白色保留主体的蒙版，然后继续。');}
  const saved=await service.workflows.putAsset(id,result.mask,'image/png');return {...base,maskAsset:saved.id,origin:result.engine,model:result.model,modelSha256:result.modelSha256,metrics:{coverage:result.coverage,confidence:result.confidence}};
 }
 if(['check','recheck'].includes(node.id)){
  if(node.id==='recheck'&&w.steps.find(s=>s.id==='repair')?.output?.skipped){const previous=w.steps.find(s=>s.id==='check');return {...previous.output,...base,pass:previous.output.pass||w.acceptedChecks?.includes(previous.attempts.at(-1).id)||false,skipped:true,reason:'本轮未再次细化，沿用已有检查／用户确认。',semanticVerified:false};}
  if((source.provider==='chatgpt'||config.hardwarePolicy)&&agentActions(config).some(id=>id!=='upscale')){const preview=await service.preview(id,await bytes()),prompt=checkPrompt(config),result=await service.analyzeChecked(w,node,token,run,[source.previewAsset,preview],prompt,value=>validateAgentCheck(value,config));let checked=result.checked,cloudReview=null;if(result.receipt.provider==='local-agent'){const cloud=await service.analyzeCloud(await service.get(id),node,token,run,[source.previewAsset,preview],prompt);cloudReview={...validateAgentCheck(cloud.value,config),analysis:cloud.receipt};checked={...checked,pass:checked.pass&&cloudReview.pass,severity:checked.severity==='major'||cloudReview.severity==='major'?'major':'minor',checks:checked.checks.map(a=>{const b=cloudReview.checks.find(b=>b.key===a.key);return {...a,pass:a.pass&&b.pass,note:'本地：'+a.note+'；云端复核：'+b.note};}),summary:'本地Agent：'+checked.summary+'；云端复核：'+cloudReview.summary,repairable:checked.pass?cloudReview.repairable:cloudReview.pass?checked.repairable:checked.repairable&&cloudReview.repairable&&checked.repairStage===cloudReview.repairStage,repairStage:cloudReview.repairStage||checked.repairStage,repairPrompt:cloudReview.repairPrompt||checked.repairPrompt};}return {...base,...checked,analysis:result.receipt,cloudReview,semanticVerified:true};}
  return {...base,pass:true,severity:'minor',summary:'本机完成尺寸、图像可读性与执行范围账本检查；没有完成语义审美判断。',checks:['scope','identity','lighting','seams','color'].map(key=>({key,pass:key==='scope'?true:null,note:key==='scope'?'执行节点均来自勾选清单。':'本机指标无法独立判断此语义项目。'})),repairable:false,engine:'local-structural-check',semanticVerified:false};
 }
 if(node.id==='deliver')return {...base,account:w.roleAccounts?.rendering||null,model:config.generationModel,resolvedModel:w.roleModels?.rendering?.resolvedModel||null,selectedTasks:config.tasks,sources:refs().map(r=>({title:r.title,url:r.url,license:r.license,creator:r.creator,usage:r.usage})),notice:'原图、各步结果与旧分支保留。'};
 let action=w.steps.find(s=>s.id==='plan')?.output?.plan?.actions.find(a=>a.id===node.id),repair=false;
 if(node.id==='repair'){
  const check=w.steps.find(s=>s.id==='check')?.output;if(!check||check.pass||!check.repairable||check.severity==='major'||!config.autoRepair)return {...base,skipped:true,reason:'检查通过、无可自动修整项，或需要人工判断。'};
  action=w.steps.find(s=>s.id==='plan').output.plan.actions.find(a=>a.id===check.repairStage);if(!action||!imageAction(action.id))throw Error('检查要求修整未勾选的步骤。');action={...action,prompt:check.repairPrompt};repair=true;
 }
 if(!action||!agentActions(config).includes(action.id))throw Error('此节点不是已勾选的执行任务。');if(action.skip)return {...base,skipped:true,reason:action.reason};
 if(imageAction(action.id))return service.renderImage(w,node,token,run,inputAsset,action,{repair});
 if(action.id==='color'){
  const tone=config.tone==='none'?null:{id:{dark:'dark-clean',bright:'bright-air',cinema:'cinema-teal'}[config.tone],amount:50},report={};const output=await gradeProcess(await bytes(),action.parameters.settings||{},{look:tone,report});return {...base,imageAsset:(await service.workflows.putAsset(id,output,'image/png')).id,engine:'local-sRGB',settings:report.settings,tone:report.tone};
 }
 if(action.id==='effects'){
  const maskId=w.steps.find(s=>s.id==='subject')?.output?.maskAsset,mask=maskId?await service.bytes(id,maskId):null;
  const output=await composite(await bytes(),null,mask,{mode:'effects',effect:action.parameters.effect,amount:action.parameters.amount,seed:parseInt(w.id.replaceAll('-','').slice(0,8),16),protectSubject:true});return {...base,imageAsset:(await service.workflows.putAsset(id,output,'image/png')).id,engine:'local-effects',effect:action.parameters.effect,amount:action.parameters.amount};
 }
 if(action.id==='upscale'){
  if(config.hardwarePolicy&&service.compute(w)==='cloud')return cloudUpscale(service,w,node,token,run,inputAsset);
  let scaled;try{scaled=await service.upscale(await bytes(),{model:config.style==='anime'?'animevideov3':'general-x4v3-dn50',longEdge:4096,amount:65,preserveColor:true},{directory:service.workflows.folder(id)+'/upscale-cache',cancelled:()=>service.stopping(run),onProgress:progress=>service.partial(id,node.id,token,{...base,engine:'Real-ESRGAN',progress})});}catch(error){if(!config.hardwarePolicy)throw error;await service.localFallback(w,node,error,run);return cloudUpscale(service,await service.get(id),node,token,run,inputAsset);}return {...base,imageAsset:(await service.workflows.putAsset(id,scaled.bytes,'image/png')).id,engine:scaled.report.engineUsed,report:scaled.report};
 }
 throw Error('Agent节点未实现。');
}
