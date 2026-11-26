import {readRequestBytes} from './lib/request-body.mjs';
import {MAX_IMAGE_UPLOAD_BYTES,IMAGE_JSON_BODY_BYTES,LAB_JSON_BODY_BYTES,IMAGE_UPLOAD_MESSAGE} from './public/upload-limits.js';
import {ImageImports} from './backend/image-imports.mjs';
import {MAX_CUBE_BYTES} from './backend/raw-vlog.mjs';
import {superresModels} from './backend/super-resolution.mjs';
import {SoftwareUpdates} from './backend/software-updates.mjs';
import {MobileDownloads} from './backend/mobile-downloads.mjs';
import {localAccessAllowed} from './lib/local-access.mjs';
import {APP_VERSION} from './lib/app-version.mjs';
import {LayerProjects} from './backend/layer-projects.mjs';
import {WorkspaceHandoffs} from './backend/workspace-handoffs.mjs';
import {Diagnostics,logFilter} from './backend/diagnostics.mjs';
import {exportProjectPhotos,backupProject,restoreProject} from './backend/studio-archive.mjs';
import {CanvasDrafts} from './backend/canvas-drafts.mjs';
import {AiDeskRuns} from './backend/ai-desk-runs.mjs';
import {StudioService} from './backend/studio.mjs';
import {StudioPlanner} from './backend/studio-planner.mjs';
import {RetouchAgents} from './backend/retouch-agents.mjs';
import {AgentHardware} from './backend/agent-hardware.mjs';
import {LocalRetouchAgent} from './backend/local-retouch-agent.mjs';
import {recipeValue,recipeReport} from './backend/studio-recipe.mjs';
import {safeName} from './backend/local-image.mjs';
import sharp from 'sharp';
import {isBellyOperation,bellyRegionOptions} from './public/belly-options.js';
import {isSceneOperation} from './public/scene-options.js';
import {AccountLedger,trackedBridge,accountSnapshot} from './backend/accounts.mjs';
import {ImageLibrary} from './backend/library.mjs';
import os from 'node:os';
import {normalizeModel} from './public/model-options.js';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, realpath, rm, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { stat, unlink } from 'node:fs/promises';
import { CodexBridge } from './lib/codex.mjs';
import { DEFAULT_PROMPT, paintingPrompt, decodeImage, normalizeEditOptions } from './lib/painting.mjs';
import { prepareEditImage, finishEditImage, applyProtectionMask, orientedDimensions } from './lib/images.mjs';
import {TargetVision,applyTargetRetention,normalizedTargetMask,TARGET_POLICY_VERSION} from './backend/target-vision.mjs';
import {TARGET_POLICIES,matchRepairBoundary,targetBlendOptions} from './public/target-policy.js';
import {toneChoice,toneAdvicePrompt} from './frontend/tonal-looks.js';
import {suggestedHeadScope} from './backend/edit-scope.mjs';
import {PromptLab} from './backend/prompt-lab.mjs';
import {jobEvidence,saveJobEvidence} from './backend/job-evidence.mjs';
import {referenceInputs,expandedCanvas,upscaleOutput} from './backend/feature-images.mjs';
import {requireAnalysisSpec} from './lib/prompt-registry.mjs';
import {referenceGuideInstruction} from './public/paint-profile.js';
import {PROMPT_VERSION} from './public/prompt-contract.js';
import { PRESETS, normalizePaintLevel } from './public/catalog.js';
import { TemplateStore } from './lib/templates.mjs';
import { buildPortable } from './scripts/build-portable.mjs';
import { openBrowser } from './lib/platform.mjs';
import { ColorStore, normalizePreset } from './backend/color.mjs';
import { importReference, searchReferences } from './backend/references.mjs';
import { WorkflowStore } from './backend/workflows.mjs';
import { CreativeService } from './backend/creative.mjs';
import { PlatformBrowser } from './backend/platform-browser.mjs';
import {replaceFile} from './lib/files.mjs';
import {resolvePicture,auditPortrait,pictureSignature} from './backend/portrait.mjs';

import {useProjectEnvironment} from './lib/project-env.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
useProjectEnvironment(ROOT);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const publicJob = j => ({ requestKey:j.requestKey||null,pipelineParentId:j.pipelineParentId||null,id: j.id, status: j.status, account:accountSnapshot(j.account), model:j.model||null, resolvedModel:j.resolvedModel||null, strength: j.strength, paintLevel: normalizePaintLevel(j.paintLevel,j.strength), prompt: j.prompt, preserve: j.preserve,
  operation: j.operation || 'full-body', style: j.style || 'anime', areas: j.areas, selection: j.selection || null,
  parentId: j.parentId || null, imageWidth: j.imageWidth, imageHeight: j.imageHeight,
  promptMode: j.promptMode || 'guided',
  workflowId:j.workflowId||null, workflowStep:j.workflowStep||null, workflowToken:j.workflowToken||null, runId:j.runId||null,
  targetMaskAsset:j.targetMaskAsset||null,targetMaskOverride:Boolean(j.targetMaskOverride),compositionTargetMaskAsset:j.compositionTargetMaskAsset||null,featureReferences:j.featureReferences||[],task:j.task||null,promptVersion:j.promptVersion||null,region:j.region||null,rawAsset:j.rawAsset||null,composition:j.composition||null,
  belly:j.belly||null,scene:j.scene||null,compositionMaskOverride:Boolean(j.compositionMaskOverride),compositionMaskAsset:j.compositionMaskAsset||null,portrait:j.portrait||null,maskAsset:j.maskAsset||null,round:j.round||1,sourceWorkflowId:j.sourceWorkflowId||null,sourceAsset:j.sourceAsset||null,sourceStep:j.sourceStep||null,portraitAuditId:j.portraitAuditId||null,
  created: j.created, message: j.message, sourceUrl: `/images/${j.id}/source.${j.extension}`,
  outputUrl: j.output ? `/images/${j.id}/${j.output}` : null });

export async function createApp({ directory = path.join(ROOT, 'data'), bridge: suppliedBridge, packageBuilder = buildPortable, composeImage = finishEditImage, platform: suppliedPlatform,targetAnalyzer:suppliedTargetAnalyzer,upscaleProcess,updatesFetcher,automaticUpdateChecks=!suppliedBridge, localAccessToken=null, vision:suppliedVision=null, clientPlatform='desktop',agentMask,agentSearch,agentCharacterLookup,agentFetchAsset,agentHardware,localRetouchAgent } = {}) {
  if(clientPlatform==='android'&&(typeof localAccessToken!=='string'||localAccessToken.length<16))throw Error('手机工作台缺少本机访问密钥。');
  const home = path.join(directory, 'codex');
  const jobsDirectory = path.join(directory, 'jobs');
  await mkdir(jobsDirectory, { recursive: true });await mkdir(home,{recursive:true});
  const diagnostics=await new Diagnostics(directory,{root:ROOT,version:APP_VERSION}).load();await diagnostics.record({event:'runtime.start'});
  const accounts=new AccountLedger(directory);await accounts.load();
  const library=new ImageLibrary(directory);await library.load();
  const rawBridge=suppliedBridge||new CodexBridge(home);if('diagnostic' in rawBridge){const previousDiagnostic=rawBridge.diagnostic;rawBridge.diagnostic=value=>{diagnostics.clientEvent(value);previousDiagnostic?.call(rawBridge,value);};}const bridge=trackedBridge(rawBridge,accounts);
  const startedAt=Date.now();let studio,planner,agents;const targetVision=suppliedVision||new TargetVision(()=>{const address=server.address();if(!address)throw Error('服务尚未启动。');return 'http://127.0.0.1:'+address.port;});
  const csrf = randomBytes(32).toString('hex');
  const mobileDownloads=new MobileDownloads(directory,{maxBytes:clientPlatform==='android'?110*1024*1024:400*1024*1024});await mobileDownloads.load();
  const downloadPrefix=clientPlatform==='android'?'/api/mobile/downloads':'/api/desktop/downloads';
  const jobs = new Map();
  const instanceId = randomUUID();
  const templates = new TemplateStore(directory, path.join(ROOT, 'defaults', 'prompts.json'));
  await templates.load();
  const colors = new ColorStore(directory, path.join(ROOT, 'defaults', 'color-presets.json'));
  await colors.load();
  const workflows=new WorkflowStore(directory,{onReadError:(workflowId,error)=>{void diagnostics.record({event:'workflow.load-failed',workflowId,level:'warn',error});},onWrite:(previous,current)=>diagnostics.observeWorkflow(previous,current)});await workflows.load();const workspace=new WorkspaceHandoffs(directory,{workflows,studio:()=>studio,jobs});await workspace.load();const layerProjects=new LayerProjects({workflows,vision:targetVision,mobile:clientPlatform==='android'});const imageImports=new ImageImports(workflows,{mobile:clientPlatform==='android'});const promptLab=new PromptLab(directory);await promptLab.load();
  const packages = new Map();
  let activePackage = null, latestPackage = null;
  const packageView = value => value && ({ id: value.id, status: value.status, message: value.message, bytes: value.bytes, sha256: value.sha256, downloadUrl: value.status === 'done' ? `/downloads/package/${value.id}` : null });
  let active = null, pendingOperations=0;const managedJobs=new Set();
  let critiqueActive = false;let portraitAuditControl=null,portraitAuditTask=null,isClosing=false,closingPromise=null;
  let login = null, loginStartedAt = 0;
  let loginError = '';
  const runtimeBusy=()=>Boolean(active||activePackage||critiqueActive||studio?.active||studio?.archiving||mobileDownloads?.active||diagnostics.activeExports||workspace.active||layerProjects.active||imageImports.active||(clientPlatform==='android'&&login&&Date.now()-loginStartedAt<15*60*1000));
  const platform=suppliedPlatform||new PlatformBrowser(directory);
  const creative=new CreativeService({workflows,bridge,platform,acquire:id=>{if(active||activePackage||critiqueActive||studio?.active||studio?.archiving)return false;active='creative-'+id;return true;},release:id=>{if(active==='creative-'+id)active=null;}});
  const jobWrites=new Map();
  const persist=j=>{const snapshot=JSON.stringify(publicJob(j),null,2);const next=(jobWrites.get(j.id)||Promise.resolve()).catch(()=>{}).then(async()=>{const temp=path.join(j.directory,'job-'+randomUUID()+'.tmp');await writeFile(temp,snapshot);await replaceFile(temp,path.join(j.directory,'job.json'));diagnostics.observeJob(JSON.parse(snapshot));});jobWrites.set(j.id,next);return next;};
  const isRunning = j => j && ['preparing', 'generating', 'cancelling'].includes(j.status);

  for (const entry of await readdir(jobsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
    try {
      const dir = path.join(jobsDirectory, entry.name);
      const saved = JSON.parse(await readFile(path.join(dir, 'job.json'), 'utf8'));
      const job = { ...saved, directory: dir,
        extension: saved.sourceUrl?.split('.').at(-1), output: saved.outputUrl?.split('/').at(-1) || null };
      if (isRunning(job)) { job.status = 'error'; job.message = '网站已重启，上次生成中断。可重新生成。'; await persist(job); }
      jobs.set(job.id, job);
    } catch { /* Incomplete job from an interrupted disk write. */ }
  }

  const finish = async (job, status, message, runId=job.runId) => {
    if (!isRunning(job)||job.runId!==runId||job.finishingRun===runId) return;
    job.finishingRun=runId;if(status==='done'&&job.composition?.needsReview)message+=' 边缘颜色、取景比例或过窄区域需复核，请对照原图检查；原始出图已保留，可只重新合成。';
    const workflowId=job.workflowId,step=job.workflowStep,token=job.workflowToken;
    clearTimeout(job.deadline);
    if(workflowId&&status!=='done'&&token)await workflows.fail(workflowId,step,token,message).catch(()=>{});
    if(job.runId!==runId)return;
    await persist({...job,status,message,workflowToken:job.workflowToken===token?null:job.workflowToken});
    if(job.runId!==runId)return;
    job.status=status;job.message=message;if(job.workflowToken===token)job.workflowToken=null;
    if (active === job.id) active = null;managedJobs.delete(job.id);
  };

  const startJobStep=async(job,step,runId=job.runId)=>{if(job.runId!==runId||!isRunning(job))throw new Error('这次执行已过期。');const attempt=await workflows.begin(job.workflowId,step);if(job.runId!==runId||!isRunning(job))throw new Error('这次执行已过期。');job.workflowStep=step;job.workflowToken=attempt.token;await persist(job);};
  const doneJobStep=async(job,state,artifacts,message,runId=job.runId)=>{const step=job.workflowStep,token=job.workflowToken;if(job.runId!==runId)throw new Error('这次执行已过期。');await workflows.complete(job.workflowId,step,token,{state,artifacts,message});if(job.runId!==runId)throw new Error('这次执行已过期。');job.workflowToken=null;await persist(job);};
  const checkedTargetMask=async(input,bytes)=>{const decoded=decodeImage(input.targetMask);if(decoded.extension!=='png')throw Error('范围需要PNG格式。');if(input.targetSourceSignature&&input.targetSourceSignature!==await pictureSignature(bytes))throw Error('范围来自另一张图片，请重新分析。');return normalizedTargetMask(decoded.bytes,await orientedDimensions(bytes));};
  const targetControl=async(job,bytes,snapshot,composition=false)=>{const w=await workflows.get(job.workflowId),source=w.steps[0].output,task=composition?job.task:source?.options?.task,manual=composition&&job.targetMaskOverride?job.compositionTargetMaskAsset:source?.targetMaskAsset;if(manual)return {found:true,origin:'manual',maskAsset:manual,sourceRetention:task?.sourceRetention??0,version:TARGET_POLICY_VERSION};if(!task?.autoTarget||!TARGET_POLICIES[job.operation])return null;if(composition&&snapshot?.fallback==='manual-selection'&&job.selection)return {...snapshot,sourceRetention:task.sourceRetention};if(snapshot?.maskAsset&&snapshot.origin!=='manual'&&snapshot.version===TARGET_POLICY_VERSION)return {...snapshot,sourceRetention:task.sourceRetention};let result;try{result=await(suppliedTargetAnalyzer?suppliedTargetAnalyzer(bytes,job):targetVision.analyze(bytes,{operation:job.operation,areas:job.areas,portrait:job.portrait}));}catch(error){if(!job.selection)throw error;return {found:false,fallback:'manual-selection',note:error.message};}if(!composition&&result.integrity?.requiresReview){if(job.selection)return {found:false,fallback:'manual-selection',note:result.integrity.note,integrity:result.integrity};throw Error('自动人物范围可能不完整，请先预览并手绘修正可编辑范围，或框选明确区域后再生成。');}if(!result.found){if(job.selection)return {...result,mask:undefined,fallback:'manual-selection'};throw Error('未可靠识别要修改的部位，请手动框选，或关闭自动部位保护。');}const asset=await workflows.putAsset(job.workflowId,result.mask,'image/png');return {...result,mask:undefined,maskAsset:asset.id,sourceRetention:task.sourceRetention};};
  const composeOutput=async(job,bytes,runId)=>{
    if(job.runId!==runId)throw new Error('这次执行已过期。');
    await startJobStep(job,'compose',runId);
    job.message=job.region?'正在将局部精修合回原图…':'正在保存精修结果…';
    const workflow=await workflows.get(job.workflowId),prepared=workflow.steps.find(n=>n.id==='prepare')?.output;
    if(!prepared?.sourceAsset)throw new Error('原图检查点缺失，请从裁片步骤继续。');
    const source=await workflows.asset(job.workflowId,prepared.sourceAsset),original=await readFile(source.file);
    if(job.runId!==runId)throw new Error('这次执行已过期。');
    job.composition=null;const localReport={},maskReport={};
    let output=await composeImage(bytes,original,prepared.region||null,{report:localReport,matchBoundary:job.operation!=='iris-color'});
    const sourceState=workflow.steps.find(n=>n.id==='source')?.output;
    const effectiveMask=job.compositionMaskOverride?job.compositionMaskAsset:sourceState?.maskAsset;
    const currentTarget=await targetControl(job,original,prepared.autoTarget,true);job.targetMaskAsset=currentTarget?.maskAsset||null;if(currentTarget?.maskAsset){const mask=await workflows.asset(job.workflowId,currentTarget.maskAsset),retained=await applyTargetRetention(await readFile(mask.file),currentTarget.sourceRetention),targetReport={};output=await applyProtectionMask(output,original,retained,{report:targetReport,...targetBlendOptions(PRESETS.find(t=>t.id===job.operation))});localReport.targetProtection={...currentTarget,statistics:targetReport};localReport.needsReview=Boolean(localReport.needsReview||targetReport.needsReview||currentTarget.integrity?.requiresReview);}
    if(prepared.expansion){const mask=await workflows.asset(job.workflowId,prepared.expansion.maskAsset);output=await applyProtectionMask(output,original,await readFile(mask.file),{report:maskReport,matchBoundary:matchRepairBoundary(PRESETS.find(t=>t.id===job.operation))});}
    if(effectiveMask){const mask=await workflows.asset(job.workflowId,effectiveMask);output=await applyProtectionMask(output,original,await readFile(mask.file),{report:maskReport,matchBoundary:matchRepairBoundary(PRESETS.find(t=>t.id===job.operation))});}
    if(job.runId!==runId)throw new Error('这次执行已过期。');
    if(job.operation==='detail-upscale')output=await upscaleOutput(output,job.task);
    const asset=await workflows.putAsset(job.workflowId,output,'image/png');
    if(job.runId!==runId)throw new Error('这次执行已过期。');
    const filename=`result-${runId}.png`;await writeFile(path.join(job.directory,filename),output);
    if(job.runId!==runId)throw new Error('这次执行已过期。');job.output=filename;
    job.composition={method:localReport.method||maskReport.method||'custom-compositor',stages:[{scope:'selection',...localReport},...(effectiveMask?[{scope:'protection',...maskReport}]:[])],needsReview:Boolean(localReport.needsReview||maskReport.needsReview)};
    const generation=workflow.steps.find(n=>n.id==='generate')?.output;
    await doneJobStep(job,{imageAsset:asset.id,jobId:job.id,task:job.task,composition:job.composition,account:accountSnapshot(generation?.account),maskAsset:effectiveMask||null,model:generation?.model||null,resolvedModel:generation?.resolvedModel||null},[{id:asset.id,label:'完整精修成品',type:'image'}],'合成完成，完整图片已保存',runId);
  };
  const generateJob=async(job)=>{if(isClosing||job.cancelled)throw new Error('网站正在停止，本轮可从当前步骤继续。');
    await startJobStep(job,'generate');
    if(!await bridge.account())throw new Error('请先使用 ChatGPT 账号登录。');
    bridge.capture(job);
    job.onModelSelected=async()=>{await persist(job);};
    const runId=job.runId;job.status='generating';job.threadId=null;job.turnId=null;job.saving=null;job.message='正在连接 ChatGPT 图片服务…';await persist(job);
    clearTimeout(job.deadline);job.deadline=setTimeout(()=>{bridge.cancel(job).catch(()=>{});finish(job,'error','等待已超过12分钟，可从生成步骤重试。',runId).catch(()=>{});},12*60*1000);
    const workflow=await workflows.get(job.workflowId),prepared=workflow.steps.find(n=>n.id==='prepare')?.output;
    if(!prepared?.sourceAsset||!prepared.inputAsset)throw new Error('编辑输入检查点缺失，请从裁片步骤继续。');
    const runDirectory=path.join(job.directory,'runs',runId);await mkdir(runDirectory,{recursive:true});
    const source=await workflows.asset(job.workflowId,prepared.sourceAsset),input=await workflows.asset(job.workflowId,prepared.inputAsset);
    const sourcePath=path.join(runDirectory,'source.png'),editPath=path.join(runDirectory,'input.png');
    await writeFile(sourcePath,await readFile(source.file));await writeFile(editPath,await readFile(input.file));
    if(job.runId!==runId)throw new Error('这次执行已过期。');
    const sentInputs=[{assetId:prepared.inputAsset,role:'edit-target',title:'图1实际编辑输入'}];if(job.region)sentInputs.push({assetId:prepared.sourceAsset,role:'full-context',title:'完整上下文原图'});const identityPaths=[];for(const [i,id]of (workflow.steps[0].output.referenceAssets||[]).entries()){const asset=await workflows.asset(job.workflowId,id),file=path.join(runDirectory,'identity-'+i+'.png');const bytes=(await prepareEditImage(await readFile(asset.file),null)).source;await writeFile(file,bytes);sentInputs.push({assetId:(await workflows.putAsset(job.workflowId,bytes,'image/png')).id,role:'identity',title:'身份参考'});identityPaths.push(file);}const identityHint=identityPaths.length?'\n附加原始图片／人设参考只用于保留人物身份、服装与配饰，不照搬其中的旧背景、旧调色或旧构图。当前图1成品是编辑目标。':'';const featurePaths=[],roles=[];for(const [i,ref]of (workflow.steps[0].output.featureReferences||[]).entries()){const asset=await workflows.asset(job.workflowId,ref.assetId),file=path.join(runDirectory,'feature-reference-'+i+'.png');await writeFile(file,await readFile(asset.file));featurePaths.push(file);sentInputs.push({assetId:ref.assetId,role:ref.role,title:ref.title});roles.push('图'+(2+(job.region?1:0)+identityPaths.length+i)+'：功能参考 '+ref.role+' · '+ref.title+'；只借用本功能需要的特征，不替换目标人物身份。');}job.sentInputs=sentInputs.map((r,index)=>({...r,index:index+1}));job.actualPrompt=(prepared.compiledPrompt||paintingPrompt(job))+identityHint+'\n'+roles.join('\n')+(sentInputs.some(r=>['style','result-guide'].includes(r.role))?'\n'+referenceGuideInstruction(job.style,{custom:job.promptMode==='custom'}):'');job.promptVersion=prepared.promptVersion||PROMPT_VERSION;await persist(job);bridge.begin(job,job.actualPrompt,editPath,job.region?sourcePath:null,[...identityPaths,...featurePaths]).catch(error=>finish(job,'error',friendlyError(error.message),runId)).catch(()=>{});
  };
  const prepareJob=async(job,bytes)=>{
    await startJobStep(job,'prepare');let prepared=await prepareEditImage(bytes,job.selection,isBellyOperation(job.operation)?bellyRegionOptions(job.belly):undefined);const preservedSource=prepared.source;let expansion=null;if(job.operation==='outpaint'){expansion=await expandedCanvas(prepared.source,job.task);const mask=await workflows.putAsset(job.workflowId,expansion.mask,'image/png');prepared={source:expansion.bytes,width:expansion.layout.width,height:expansion.layout.height,editImage:null,region:null};expansion={...expansion.layout,maskAsset:mask.id};}job.region=prepared.region;job.imageWidth=prepared.width;job.imageHeight=prepared.height;if(job.maskAsset){const mask=await workflows.asset(job.workflowId,job.maskAsset);if(Math.abs(mask.width/mask.height-prepared.width/prepared.height)>.025)throw new Error('人物蒙版与本轮图片比例不符，请上传对应蒙版。');const stats=await (await import('sharp')).default(mask.file).flatten({background:'#000000'}).greyscale().stats();if(stats.channels[0].max===0)throw new Error('人物蒙版没有选中可编辑区域，请先修正。');}
    const autoTarget=await targetControl(job,prepared.source,null);if(autoTarget?.maskAsset)job.targetMaskAsset=autoTarget.maskAsset;
    await writeFile(path.join(job.directory,'source.png'),preservedSource);if(prepared.editImage)await writeFile(path.join(job.directory,'input.png'),prepared.editImage);
    const source=await workflows.putAsset(job.workflowId,prepared.source,'image/png'),edit=prepared.editImage?await workflows.putAsset(job.workflowId,prepared.editImage,'image/png'):source;
    await doneJobStep(job,{sourceAsset:source.id,inputAsset:edit.id,region:prepared.region,width:prepared.width,height:prepared.height,expansion,autoTarget,promptVersion:PRESETS.find(t=>t.id===job.operation)?.promptRevision||PROMPT_VERSION,compiledPrompt:paintingPrompt({...job,expansion})},[{id:source.id,label:'标准化完整原图',type:'image'},...(prepared.editImage?[{id:edit.id,label:'发送给模型的局部裁片',type:'image'}]:[])],'编辑输入已保存');
  };

  const storeOutput = async (job, item) => {
    const runId=job.runId;
    if (item.failure || item.status === 'failed') throw new Error(item.failure?.type === 'usageLimitExceeded'
      ? '当前账号的图片额度已用完，请等待额度恢复。' : '图片生成未成功，请稍后重试。');
    let bytes;
    if (item.savedPath) {
      const source = await realpath(item.savedPath);
      const allowed = await realpath(home);
      const relative = path.relative(allowed, source);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('生成图片不在本站图片目录中。');
      bytes = await readFile(source);
    } else if (item.result) {
      const raw = item.result.startsWith('data:') ? item.result.split(',')[1] : item.result;
      bytes = Buffer.from(raw, 'base64');
    } else throw new Error('客户端没有返回可下载的图片，请升级客户端后重试。');
    if(job.runId!==runId)throw new Error('这次执行已过期。');
    const raw=await workflows.putAsset(job.workflowId,bytes,item.result?.startsWith('data:image/jpeg')?'image/jpeg':'image/png');if(job.runId!==runId)throw new Error('这次执行已过期。');job.rawAsset=raw.id;
    await doneJobStep(job,{rawAsset:raw.id,generationRunId:runId,reportedImageEngine:typeof item.model==='string'?item.model:null,sentInputs:job.sentInputs||null,account:accountSnapshot(job.account),appVersion:APP_VERSION,promptVersion:job.promptVersion||PROMPT_VERSION,compiledPrompt:job.actualPrompt||paintingPrompt(job),model:job.model||null,resolvedModel:job.resolvedModel||null},[{id:raw.id,label:'AI返回的原始出图（合成前）',type:'image'}],'原始生成图已保存，后续合成无需再次生成',runId);
    await composeOutput(job,bytes,runId);
  };

  bridge.on('notification', (method, params) => {
    if (method === 'account/login/completed') {
      login = null; loginError = params.success ? '' : '登录未完成，请重新登录。';
    }
    const job = [...jobs.values()].find(j=>isRunning(j)&&j.threadId&&j.threadId===params.threadId);
    if (!job) return;
    if (method === 'turn/started') job.turnId = params.turn.id;
    if(method==='item/completed'&&params.item?.type==='agentMessage'&&typeof params.item.text==='string')job.imageReply=params.item.text.slice(0,2000);
    if (method === 'item/started' && params.item?.type === 'imageGeneration') {
      job.message = `正在进行${PRESETS.find(p => p.id === job.operation)?.name || '人物精修'}，请稍候…`;
    }
    if (method === 'item/completed' && params.item?.type === 'imageGeneration' && !job.saving) {
      job.saving = storeOutput(job, params.item);
      job.saving.catch(() => {});
    }
    if (method === 'turn/completed') {
      const runId=job.runId;
      (async () => {
        try {
          await job.saving;
          if (params.turn.status === 'interrupted') await finish(job, 'cancelled', '已停止生成。',runId);
          else if (params.turn.status === 'failed') await finish(job, 'error', friendlyError(params.turn.error?.message),runId);
          else if (job.output) await finish(job, 'done', job.region ? '局部精修完成，选区外已保留原图。' : '人物精修完成，可以对比、下载或继续精修。',runId);
          else await finish(job, 'error', '这次没有生成图片。'+(job.imageReply?'模型回复：'+job.imageReply:'请检查本机绘图执行组件及账号的图片能力。'),runId);
        } catch (error) { await finish(job, 'error', friendlyError(error.message),runId); }
      })().catch(() => {});
    }
  });
  bridge.on('disconnected', () => {
    for(const job of jobs.values())if(isRunning(job)&&!job.localComposition&&(job.threadId||job.workflowStep==='generate')){const runId=job.runId;Promise.resolve(job.saving).then(()=>finish(job,job.output?'done':'error',job.output?'原始出图与合成已保存；图片服务随后断开。':'本机图片服务已断开，请核对已保存步骤后恢复。',runId)).catch(error=>finish(job,'error',friendlyError(error.message),runId)).catch(()=>{});}
    login = null;
  });

  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const body = async (req, maxBytes = 18 * 1024 * 1024) => {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('请求格式应为 JSON。'), { status: 415 });
    const bytes=await readRequestBytes(req,maxBytes,'本次请求总量过大，请减少同时提交的参考图；单图上限100 MB。');
    try { return JSON.parse(bytes.toString('utf8')); }
    catch { throw Object.assign(new Error('请求内容无效。'), { status: 400 }); }
  };

  const findRequest=requestKey=>[...jobs.values()].find(job=>job.requestKey===requestKey);
  const startRetouch=async(input,{requestKey=null,pipelineParentId=null,expectedAccount=null,managed=false,isCancelled=null}={})=>{
    if(requestKey){if(!/^[a-f0-9]{64}$/.test(requestKey))throw Error('流程请求标识无效。');const existing=findRequest(requestKey);if(existing)return publicJob(existing);}
    if(isCancelled?.())throw Object.assign(Error('Agent已取消，未创建新的图片请求。'),{status:409});
    const imageRuntime=bridge.imageRuntimeStatus?.();if(imageRuntime?.ready===false)throw Object.assign(Error(imageRuntime.message),{status:409});
    if(active||activePackage||critiqueActive||managed&&(!studio?.active||managedJobs.size>=2)||!managed&&(managedJobs.size||studio?.active||studio?.archiving))throw Object.assign(Error('工作台已有任务，请先暂停或等待完成。'),{status:409});
    const reservation=Symbol('managed-image');if(managed)managedJobs.add(reservation);else active='reserved';let job;try{
          const options = normalizeEditOptions(input),tool=PRESETS.find(p=>p.id===options.operation),references=referenceInputs(input.references);if(tool.output==='outpaint'&&input.protectionMask)throw Error('扩图使用原图全区域保护，不需要额外人物蒙版。');if(tool.referenceRole&&references.some(r=>!['any','style','result-guide',tool.referenceRole].includes(r.role)))throw Error('参考图角色与当前功能不一致，请重新选择。');if(tool.referenceRole&&!references.some(r=>r.role==='any'||r.role===tool.referenceRole))throw Error('此功能需要参考图，请先添加1–5张功能参考图。');if(tool.needsTarget&&!options.selection&&!options.task.target.trim())throw Error('请指定要转换的部位，或先框选编辑区域。');
          if(isSceneOperation(options.operation)&&!options.scene.protectSubject&&input.protectionMask)throw Error('关闭主体像素保护时请不要提交保护蒙版。');
          if(isSceneOperation(options.operation)&&options.scene.protectSubject&&!input.protectionMask)throw Error('请先分析主体保护或上传蒙版，也可关闭像素保护后按AI语义清理。');
          if(options.operation==='remove-people'&&options.scene.people==='selection'&&!options.selection)throw Error('请先画出需要清除路人的编辑选区。');
          if (options.parentId && !jobs.has(options.parentId)) throw new Error('上一版作品不存在，请重新打开作品。');
          const prompt = paintingPrompt(options);
          const resolved=await resolvePicture(input,{jobs,workflows}),image={bytes:resolved.bytes};if(options.operation==='detail-upscale'){const m=await orientedDimensions(image.bytes);if(options.task.longEdge**2*Math.min(m.width,m.height)/Math.max(m.width,m.height)>40000000)throw Error('此比例放大后超过4000万像素，请选择较小输出尺寸。');}if(resolved.parentJobId)options.parentId=resolved.parentJobId;
          if (!await bridge.account()) throw Object.assign(Error('请先使用 ChatGPT 账号登录。'),{status:401});
          if(isCancelled?.())throw Object.assign(Error('Agent已取消，未创建新的图片请求。'),{status:409});
          const owner={account:expectedAccount};bridge.capture(owner);
          const id = randomUUID();
          const workflow=await workflows.create({kind:'retouch',name:PRESETS.find(p=>p.id===options.operation)?.name||'人物精修',jobId:id,parentId:resolved.parentWorkflowId});if(resolved.sourceOrigin)await workflows.mutate(workflow.id,w=>{w.sourceOrigin=resolved.sourceOrigin;return {};});
          if(pipelineParentId)await workflows.mutate(workflow.id,w=>{w.pipelineParentId=pipelineParentId;return {};});
          job = { id,requestKey,pipelineParentId,account:owner.account, directory: path.join(jobsDirectory, id), extension: 'png', output: null,
            created: Date.now(), status: 'preparing', message: '正在准备原图…', prompt: input.prompt,
            ...options,promptVersion:tool.promptRevision||PROMPT_VERSION,workflowId:workflow.id,runId:randomUUID(),region:null,sourceWorkflowId:resolved.parentWorkflowId,sourceAsset:resolved.sourceAsset,sourceStep:resolved.sourceStep,round:options.parentId?(jobs.get(options.parentId)?.round||1)+1:1,portraitAuditId:input.portraitAuditId||null };
          await mkdir(job.directory);
          jobs.set(id, job);if(managed){managedJobs.delete(reservation);managedJobs.add(id);}else active=id;await persist(job);
          await startJobStep(job,'source');
          const featureReferences=[];for(const ref of references){const normalized=await prepareEditImage(ref.bytes,null),asset=await workflows.putAsset(workflow.id,normalized.source,'image/png');featureReferences.push({assetId:asset.id,title:ref.title,role:ref.role==='any'?(tool.referenceRole||'any'):ref.role});}
          job.featureReferences=featureReferences;const source=await workflows.putAsset(workflow.id,image.bytes,'image/png');let targetMaskAsset=null;if(input.targetMask){if(tool.fullFrame)throw Error('独立输出、扩图和放大不使用原位编辑蒙版。');targetMaskAsset=(await workflows.putAsset(workflow.id,await checkedTargetMask(input,image.bytes),'image/png')).id;job.targetMaskAsset=targetMaskAsset;}
          let maskAsset=null;if(input.protectionMask){const mask=decodeImage(input.protectionMask);if(isSceneOperation(options.operation)&&mask.extension!=='png')throw Error('主体保护蒙版需要PNG格式。');const stored=await workflows.putAsset(workflow.id,mask.bytes,'image/png'),displayShape=isSceneOperation(options.operation)?await orientedDimensions(image.bytes):source;if(isSceneOperation(options.operation)&&Math.abs(stored.width/stored.height-displayShape.width/displayShape.height)>.025)throw Error('主体保护蒙版与原图长宽比不一致，请重新分析。');maskAsset=stored.id;}job.maskAsset=maskAsset;const referenceAssets=[];for(const ref of resolved.identity){const asset=await workflows.asset(ref.workflowId,ref.assetId);referenceAssets.push((await workflows.putAsset(workflow.id,await readFile(asset.file),'image/png')).id);}if(input.portraitAuditId){const audit=await workflows.get(input.portraitAuditId);if(audit.kind!=='portrait-audit')throw new Error('人物检查记录无效。');const audited=await workflows.asset(audit.id,audit.steps[0].output.imageAsset);if((audit.steps[0].output.pixelSignature||await pictureSignature(await readFile(audited.file)))!==await pictureSignature(image.bytes))throw new Error('这份检查针对其他图片，请重新检查。');}await doneJobStep(job,{imageAsset:source.id,options,maskAsset,targetMaskAsset,referenceAssets,featureReferences,promptVersion:tool.promptRevision||PROMPT_VERSION,sourceWorkflowId:resolved.parentWorkflowId,sourceStep:resolved.sourceStep,sourceAsset:resolved.sourceAsset},[{id:source.id,label:'本轮实际人物成品输入',type:'image'},...(maskAsset?[{id:maskAsset,label:isSceneOperation(options.operation)?'主体保护蒙版：黑色保留、白色可修改':'本轮背景保护蒙版',type:'image'}]:[])],'原图、细化参数与保护蒙版已保存');
          await prepareJob(job,image.bytes);if(isCancelled?.())job.cancelled=true;await generateJob(job);

      return publicJob(job);
    }catch(error){if(job&&isRunning(job))await finish(job,'error',friendlyError(error.message));throw error;}finally{managedJobs.delete(reservation);if(!managed&&active==='reserved')active=null;}
  };
  const recomposeManaged=async view=>{
    if(active||activePackage||critiqueActive||managedJobs.size>=2)throw Object.assign(Error('工作台正忙，请稍后恢复。'),{status:409});const reservation=Symbol('managed-compose');managedJobs.add(reservation);let job;
    try{job=jobs.get(view.id);const w=await workflows.get(job.workflowId),generated=w.steps.find(n=>n.id==='generate');if(generated?.status!=='done'||!generated.output?.rawAsset)throw Error('原始出图尚未保存，请在子工作流确认生成状态。');await workflows.restart(w.id,'compose',w.revision);Object.assign(job,{runId:randomUUID(),status:'preparing',message:'复用AI原始图重新合成',localComposition:true,output:null,workflowToken:null,threadId:null,turnId:null,saving:null});managedJobs.delete(reservation);managedJobs.add(job.id);await persist(job);const runId=job.runId;Promise.resolve().then(async()=>{const raw=await workflows.asset(w.id,generated.output.rawAsset);await composeOutput(job,await readFile(raw.file),runId);await finish(job,'done','已复用原始出图完成合成',runId);}).catch(error=>finish(job,'error',friendlyError(error.message),runId)).catch(()=>{});return publicJob(job);}catch(error){if(job&&isRunning(job))await finish(job,'error',friendlyError(error.message));throw error;}finally{managedJobs.delete(reservation);}
  };
  studio=new StudioService({directory,workflows,adapter:{upscale:upscaleProcess,isBusy:()=>Boolean(active||activePackage||critiqueActive||managedJobs.size),startRetouch,findRequest:key=>{const job=findRequest(key);return job?publicJob(job):null;},getJob:id=>jobs.has(id)?publicJob(jobs.get(id)):null,recompose:recomposeManaged,authorize:async expected=>{if(!await bridge.account())throw Error('请先登录本站ChatGPT账号。');const control={account:expected};bridge.capture(control);return control.account;}}});await studio.load();
  planner=new StudioPlanner({root:ROOT,studio,workflows,bridge,acquire:id=>{if(runtimeBusy()||login||isClosing)return false;active='planner-'+id;return true;},release:id=>{if(active==='planner-'+id)active=null;}});
  agents=new RetouchAgents({studio,workflows,bridge,platform,mask:agentMask,search:agentSearch,characterLookup:agentCharacterLookup,fetchAsset:agentFetchAsset,upscale:upscaleProcess,hardware:agentHardware||new AgentHardware(),localAgent:localRetouchAgent||new LocalRetouchAgent({root:ROOT,directory:path.join(directory,'local-agent')}),
   acquirePrepare:id=>{if(runtimeBusy()||login||isClosing)return false;active='agent-'+id;return true;},releasePrepare:id=>{if(active==='agent-'+id)active=null;},
   render:{findRequest:key=>{const j=findRequest(key);return j?publicJob(j):null;},getJob:id=>jobs.has(id)?publicJob(jobs.get(id)):null,
    capacity:owner=>agents.owns(owner)&&studio.active?.projectId===owner.projectId&&!active&&!activePackage&&!critiqueActive&&managedJobs.size<2,
    start:async(owner,input,options)=>{if(!agents.owns(owner)||studio.active?.projectId!==owner.projectId||!studio.active.photoIds.includes(owner.photoId))throw Error('Agent执行授权已失效。');try{return await startRetouch(input,{...options,managed:true,isCancelled:()=>agents.cancelled(owner)});}catch(error){if(!findRequest(options.requestKey))error.submissionState='not-submitted';throw error;}},
    cancel:async id=>{const job=jobs.get(id);if(isRunning(job)){job.cancelled=true;job.status='cancelling';await persist(job);await bridge.cancel(job);}}
   }});await agents.load();
  const canvasDrafts=new CanvasDrafts(directory,workflows);await canvasDrafts.load();
  studio.adapter.cancelReviewed=async(id,pipelineId)=>{const job=jobs.get(id);if(!job||!isRunning(job)||job.pipelineParentId!==pipelineId||job.cancelSent)return;job.cancelled=true;if(job.turnId){job.cancelSent=true;try{await bridge.cancel(job);}catch(error){job.cancelSent=false;throw error;}if(isRunning(job)){job.status='cancelling';job.message='正在停止当前生成。';}}};
  const deskRuns=new AiDeskRuns({studio,workflows,agents,subjectMask:agentMask});
  studio.adapter.runAgent=({parentWorkflowId,stepId,inputAsset,...context})=>agents.runChild(parentWorkflowId,stepId,inputAsset,context);

  const updates=new SoftwareUpdates({root:ROOT,directory,cacheDirectory:suppliedBridge?path.join(directory,'.updates'):undefined,fetcher:updatesFetcher,
    reserve:()=>{if(isClosing||active||activePackage||critiqueActive||login||studio.active||studio.archiving||studio.queues.size||creative.running.size||pendingOperations||library.pendingThumbs.size)return false;active='software-update';return true;},
    release:()=>{if(active==='software-update')active=null;},serverInfo:()=>({port:server.address()?.port,instanceId}),
    onHandoff:()=>{setTimeout(()=>close().catch(error=>console.error('更新前停止网站失败：'+error.message)),150);}});await updates.load();
  if(automaticUpdateChecks)updates.startAutomatic();
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || '';
    if(!localAccessAllowed(req.headers,localAccessToken))return json(res,401,{error:'请从本应用打开本机工作台。'});
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const pagePolicy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    res.setHeader('Content-Security-Policy',pagePolicy);
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return json(res, 403, { error: '仅允许本机访问。' });
    let trackedOperation=false,diagnosticOperation='UNKNOWN';
    try {
      const url = new URL(req.url, `http://${host}`);
      const embedded = req.method==='GET'&&url.searchParams.get('embedded')==='workbench'&&
        /^\/(?:color|portrait|layers|ai(?:\/color)?|creative|upscale|studio|workflows|lab)\/?$/.test(url.pathname);
      if(embedded)res.setHeader('Content-Security-Policy',pagePolicy.replace("frame-ancestors 'none'","frame-ancestors 'self'"));
      const route = url.pathname;diagnosticOperation=req.method+'.'+(/^\/api\/(layers|workspace|logs|retouch-agents|retouch-agent-capabilities|studio|workflows|jobs|updates|color|creative|superres|image-imports|account|models|login|templates)(?:\/|$)/.exec(route)?.[1]||'other');if(clientPlatform==='android'&&(route==='/api/packages'||route.startsWith('/downloads/package/')||/^\/api\/updates\/(prepare|apply|rollback)$/.test(route)))return json(res,409,{error:'安卓版请使用应用菜单中的安卓版更新。'});if(isClosing&&!['/api/health','/api/shutdown'].includes(route))return json(res,503,{error:'网站正在停止，请稍后重开。'});
      if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: '不支持的请求。' });
      if(req.method==='POST'&&(req.headers.origin!==`http://${host}`||req.headers['x-paint-csrf']!==csrf))return json(res,403,{error:'请从本站页面发起操作。'});
      let localCheckpoint=false;if(req.method==='POST'&&(studio.active||studio.archiving)){localCheckpoint=['/api/workflows','/api/workspace/copy','/api/workspace/images'].includes(route);const localRoute=/^\/api\/workflows\/([a-f0-9-]{36})\/(assets|begin|complete|fail|restart)$/.exec(route);if(localRoute)localCheckpoint=['manual-portrait','color','layer-composite','single-canvas'].includes((await workflows.get(localRoute[1])).kind);}
      if(req.method==='POST'&&(studio.active||studio.archiving)&&!localCheckpoint&&!route.startsWith('/api/studio/')&&route!==downloadPrefix&&route!=='/api/shutdown'&&!route.startsWith('/api/updates/')&&route!=='/api/logs/export'&&route!=='/api/workspace/handoffs'&&!route.startsWith('/api/layers/')&&route!=='/api/layers/import'&&!/^\/api\/jobs\/[a-f0-9-]{36}\/cancel$/.test(route)&&!/^\/api\/retouch-agents\/[a-f0-9-]{36}\/(pause|cancel)$/.test(route))return json(res,409,{error:'照片流程正在运行，请先完成本步并暂停。'});
      if(updates.handoff&&route.startsWith('/api/')&&!route.startsWith('/api/updates/')&&!['/api/health','/api/shutdown'].includes(route))return json(res,409,{error:'网站即将重启安装更新，请等待完成后重新打开。'});
      if(route.startsWith('/api/')&&!route.startsWith('/api/updates/')&&!['/api/health','/api/shutdown'].includes(route)){pendingOperations++;trackedOperation=true;}
      if(route===downloadPrefix&&req.method==='POST'){
        const receipt=await mobileDownloads.create(req,{name:url.searchParams.get('name')||'导出文件',mime:url.searchParams.get('mime')||'application/octet-stream'});
        return json(res,201,{...receipt,downloadUrl:downloadPrefix+'/'+receipt.id});
      }
      const mobileDownload=new RegExp('^'+downloadPrefix+'/([a-f0-9-]{36})$').exec(route);if(mobileDownload&&req.method==='GET'){const asset=await mobileDownloads.asset(mobileDownload[1]);res.writeHead(200,{'Content-Type':asset.mime,'Content-Length':asset.bytes,'X-Houtu-Content-SHA256':asset.sha256,'Content-Disposition':"attachment; filename=export; filename*=UTF-8''"+encodeURIComponent(asset.name)});await pipeline(createReadStream(asset.file),res);return;}
      if(route==='/api/updates/events'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('event: ready\ndata: {}\n\n');
        const unsubscribe=updates.subscribe(()=>{if(!res.destroyed)res.write('event: version\ndata: {}\n\n');}),heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},25000);heartbeat.unref();res.once('close',()=>{clearInterval(heartbeat);unsubscribe();});return;
      }
      if(route==='/api/updates/status'&&req.method==='GET')return json(res,200,await updates.view());
      if(route.startsWith('/api/updates/')&&req.method==='POST'){
        try{if(updates.handoff)throw Error('网站正在重启安装更新，请稍后再操作。');const input=await body(req,4096);let result;
          if(route==='/api/updates/check')result=await updates.check({automatic:input.automatic===true});
          else if(route==='/api/updates/settings')result=await updates.configure(input);
          else if(route==='/api/updates/prepare')result=await updates.beginPrepare();
          else if(route==='/api/updates/apply')result=await updates.apply({id:input.id});
          else if(route==='/api/updates/rollback')result=await updates.apply({id:input.id,rollback:true});
          else return json(res,404,{error:'更新操作不存在。'});
          return json(res,200,result);
        }catch(error){return json(res,409,{error:String(error.message).slice(0,400)});}
      }
      if(route==='/api/targets/analyze'&&req.method==='POST'){const input=await body(req,IMAGE_JSON_BODY_BYTES),resolved=await resolvePicture(input,{jobs,workflows}),options=normalizeEditOptions(input),result=await targetVision.analyze(resolved.bytes,{operation:options.operation,areas:options.areas,portrait:options.portrait});return json(res,200,{...result,selectionSuggestion:options.operation==='face'&&result.mask?await suggestedHeadScope(result.mask):null,mask:result.mask?'data:image/png;base64,'+result.mask.toString('base64'):null,sourceSignature:await pictureSignature(resolved.bytes)});}
      const labJob=/^\/api\/prompt-lab\/jobs\/([a-f0-9-]{36})$/.exec(route);if(labJob){const job=jobs.get(labJob[1]);if(req.method==='GET')return json(res,200,await jobEvidence(job,workflows));if(req.method==='POST')return json(res,201,await saveJobEvidence(job,workflows,promptLab,await body(req,20000)));}
      if(route==='/api/prompt-lab/trials'&&req.method==='GET')return json(res,200,await promptLab.trials());
      if(route==='/api/prompt-lab'&&req.method==='GET')return json(res,200,await promptLab.list());if(route==='/api/prompt-lab/records'&&req.method==='POST')return json(res,201,await promptLab.save(await body(req,LAB_JSON_BODY_BYTES)));const labImage=/^\/api\/prompt-lab\/images\/([a-f0-9-]{36})\/(source|result|input|raw|ref-\d{1,2})$/.exec(route);if(labImage&&req.method==='GET'){const file=await promptLab.image(labImage[1],labImage[2]);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});await pipeline(createReadStream(file),res);return;}
      if(route==='/api/superres/models'&&req.method==='GET')return json(res,200,await superresModels());
      if(route==='/api/superres/import'&&req.method==='POST'){
        if(active||activePackage||critiqueActive||studio.active||studio.archiving||studio.queues.size)return json(res,409,{error:'工作台正忙，请先完成或暂停当前任务。'});
        const reservation='superres-import-'+randomUUID();active=reservation;
        try{const input=await body(req,IMAGE_JSON_BODY_BYTES),resolved=await resolvePicture(input,{jobs,workflows});
          const project=await studio.create({name:input.name||'4K超分 · '+new Date().toLocaleDateString('zh-CN'),recipe:{name:'本机4K超分',stages:[{type:'upscale',name:'本机4K超分',options:input.options||{}},{type:'export',name:'超分成片导出',options:{format:'png',maxEdge:0,prefix:'4K超分'}}]}}),added=await studio.addPhoto(project.id,resolved.bytes,input.name||'超分原图',{savedSource:true});
          const photo=(await studio.get(project.id)).photos[0];if(resolved.parentWorkflowId)await workflows.mutate(photo.workflowId,w=>{w.parentId=resolved.parentWorkflowId;w.sourceOrigin=resolved.sourceOrigin||{workflowId:resolved.parentWorkflowId,assetId:resolved.sourceAsset,step:resolved.sourceStep};return {};});
          return json(res,201,{projectId:project.id,photoId:photo.id,workflowId:photo.workflowId,url:'/upscale/?project='+project.id});
        }finally{if(active===reservation)active=null;}
      }
      if(route==='/api/layers/import'&&req.method==='POST')return json(res,201,await layerProjects.restore(await body(req,210*1024*1024)));
      const layerRoute=/^\/api\/layers\/([a-f0-9-]{36})(?:\/(preview|document|export|project|reference|subject|fork))?$/.exec(route);if(layerRoute){const [,id,action]=layerRoute;if(!action&&req.method==='GET')return json(res,200,await layerProjects.get(id));if(action==='project'&&req.method==='GET'){const value=await layerProjects.project(id),bytes=Buffer.from(JSON.stringify(value));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'Content-Disposition':'attachment; filename="houtu-layer-project.json"'});res.end(bytes);return;}if(req.method==='POST'){const input=await body(req,1024*1024);if(action==='preview'){const result=await layerProjects.render(id,input.document,{maxEdge:1280});res.writeHead(200,{'Content-Type':'image/png','X-Houtu-Preview-Width':result.width,'X-Houtu-Preview-Height':result.height});res.end(result.bytes);return;}if(action==='fork')return json(res,201,await layerProjects.fork(id,input.document));if(action==='document')return json(res,200,await layerProjects.save(id,input.document,input.revision));if(action==='export')return json(res,200,await layerProjects.export(id,input));if(action==='reference')return json(res,201,await layerProjects.reference(id,input.source));if(action==='subject')return json(res,200,await layerProjects.subjectMask(id,input.assetId));}return json(res,405,{error:'不支持此图层操作。'});}
      if(route==='/api/workspace/copy'&&req.method==='POST'){const input=await body(req,4096);return json(res,201,await workspace.copySource(input.workflowId,input.source));}
      if(route==='/api/workspace/active'&&req.method==='GET')return json(res,200,await workspace.current());
      const handoffRoute=/^\/api\/workspace\/handoffs\/([a-f0-9-]{36})$/.exec(route);if(handoffRoute&&req.method==='GET')return json(res,200,await workspace.get(handoffRoute[1]));
      if(route==='/api/workspace/handoffs'&&req.method==='POST')return json(res,201,await workspace.create(await body(req,4096)));
      if(route==='/api/workspace/images'&&req.method==='POST')return json(res,201,await workspace.ingest(await readRequestBytes(req,MAX_IMAGE_UPLOAD_BYTES,IMAGE_UPLOAD_MESSAGE),url.searchParams.get('name')||'跨板块图片.png'));
      if(route==='/api/logs'&&req.method==='GET')return json(res,200,await diagnostics.read(Object.fromEntries(url.searchParams)));
      if(route==='/api/logs/export'&&req.method==='POST'){const input=logFilter(await body(req,4096)),workflow=input.workflowId?await workflows.get(input.workflowId).catch(()=>null):null,receipt=await diagnostics.export(input,workflow);void diagnostics.record({event:'export.created',workflowId:input.workflowId,data:{bytes:receipt.bytes,count:receipt.count}});return json(res,201,receipt);}
      const logDownload=/^\/api\/logs\/exports\/([a-f0-9-]{36})$/.exec(route);if(logDownload&&req.method==='GET'){const receipt=await diagnostics.asset(logDownload[1]);res.writeHead(200,{'Content-Type':'application/zip','Content-Length':receipt.bytes,'Cache-Control':'no-store','X-Houtu-Content-SHA256':receipt.sha256,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(receipt.name)});await pipeline(createReadStream(receipt.file),res);return;}
      if(route==='/api/retouch-agent-capabilities'&&req.method==='GET')return json(res,200,await agents.capabilities({refresh:url.searchParams.get('refresh')==='1',model:url.searchParams.get('model')||'auto'}));
      if(route==='/api/studio/projects'&&req.method==='GET')return json(res,200,{projects:studio.list(),active:studio.active?{projectId:studio.active.projectId,currentPhoto:studio.active.currentPhoto,currentStep:studio.active.currentStep}:null});
      if(route==='/api/studio/canvas-drafts'&&req.method==='GET')return json(res,200,{photos:canvasDrafts.list(url.searchParams.get('removed')==='1')});
      const canvasDraft=/^\/api\/studio\/canvas-drafts\/([a-f0-9-]{36})$/.exec(route);
      const archiveCanvas=/^\/api\/studio\/canvas-drafts\/([a-f0-9-]{36})\/archive$/.exec(route);
      if(archiveCanvas&&req.method==='POST')return json(res,200,await canvasDrafts.setRemoved(archiveCanvas[1],await body(req,4096)));
      if(canvasDraft&&req.method==='GET')return json(res,200,await canvasDrafts.get(canvasDraft[1]));
      if(canvasDraft&&req.method==='POST')return json(res,200,await canvasDrafts.save(canvasDraft[1],await body(req,3*1024*1024)));
      if(route==='/api/studio/ai-runs'&&req.method==='POST')return json(res,201,await deskRuns.prepare(await body(req,100000)));
      const desk=/^\/api\/studio\/ai-runs\/([a-f0-9-]{36})(?:\/(next|pause|cancel))?$/.exec(route);
      if(desk){if(req.method==='GET'&&!desk[2])return json(res,200,await deskRuns.view(desk[1]));if(req.method==='POST'&&desk[2]==='next')return json(res,202,await deskRuns.advance(desk[1],await body(req,IMAGE_JSON_BODY_BYTES)));if(req.method==='POST'&&desk[2]==='cancel')return json(res,200,await deskRuns.stop(desk[1],await body(req,4096)));if(req.method==='POST'&&desk[2]==='pause'){await deskRuns.record(desk[1]);await studio.pause(desk[1]);return json(res,200,await deskRuns.view(desk[1]));}}
      const agentCreate=/^\/api\/studio\/projects\/([a-f0-9-]{36})\/agents$/.exec(route);
      if(agentCreate&&req.method==='POST')return json(res,202,await agents.start(agentCreate[1],await body(req,100000)));
      const agentBatch=/^\/api\/retouch-agent-batches\/([a-f0-9-]{36})(?:\/(run))?$/.exec(route);
      if(agentBatch){if(req.method==='GET'&&!agentBatch[2])return json(res,200,await agents.batchView(agentBatch[1]));if(req.method==='POST'&&agentBatch[2]==='run'){await body(req,4096);return json(res,202,await agents.runBatch(agentBatch[1]));}}
      const agentRoute=/^\/api\/retouch-agents\/([a-f0-9-]{36})(?:\/(continue|pause|cancel|step|mode|accept|prompt|parameters|mask|manual-plan|branch))?$/.exec(route);
      if(agentRoute){const [,id,action]=agentRoute;if(req.method==='GET'&&!action)return json(res,200,await agents.view(id));if(req.method==='POST'&&action){const input=await body(req,100000),methods={continue:'continue',pause:'pause',cancel:'pause',step:'manualStep',mode:'setMode',accept:'accept',prompt:'savePrompt',parameters:'saveParameters',mask:'provideMask','manual-plan':'manualPlan',branch:'branch'};return json(res,200,await agents[methods[action]](id,action==='cancel'?{...input,cancel:true}:input));}}
      if(route==='/api/studio/planning/capabilities'&&req.method==='GET')return json(res,200,planner.capabilities());
      const planningPreflight=/^\/api\/studio\/projects\/([a-f0-9-]{36})\/planning-preflight$/.exec(route);
      if(planningPreflight&&req.method==='POST')return json(res,200,await planner.preflight(planningPreflight[1],await body(req,100000)));
      const planningProject=/^\/api\/studio\/projects\/([a-f0-9-]{36})\/plans$/.exec(route);
      if(planningProject&&req.method==='POST')return json(res,202,await planner.start(planningProject[1],await body(req,100000)));
      const planningPreview=/^\/api\/studio\/projects\/([a-f0-9-]{36})\/photos\/([a-f0-9-]{36})\/planning-preview$/.exec(route);
      if(planningPreview&&req.method==='GET'){const {photo}=await studio.photo(planningPreview[1],planningPreview[2]),a=await workflows.asset(photo.originalWorkflowId,photo.originalAsset),bytes=await sharp(a.file,{limitInputPixels:40000000}).rotate().flatten({background:'#ededed'}).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(bytes);}
      const planningRoute=/^\/api\/studio\/plans\/([a-f0-9-]{36})(?:\/(retry|cancel|apply))?$/.exec(route);
      if(planningRoute){const [,id,action]=planningRoute;if(req.method==='GET'&&!action)return json(res,200,await planner.view(id));if(req.method==='POST'&&action){const input=await body(req,4096);return json(res,action==='retry'?202:200,await planner[action](id,input));}}
      if(route==='/api/studio/projects'&&req.method==='POST')return json(res,201,await studio.create(await body(req,1000000)));
      if(route==='/api/studio/recipes'&&req.method==='GET')return json(res,200,{recipes:studio.recipeList()});
      if(route==='/api/studio/recipes'&&req.method==='POST')return json(res,201,await studio.saveRecipe(await body(req,1000000)));
      if(route==='/api/studio/validate'&&req.method==='POST'){const recipe=recipeValue(await body(req,1000000));return json(res,200,{recipe,report:recipeReport(recipe)});}
      if(route==='/api/studio/restore'&&req.method==='POST')return json(res,201,await restoreProject(studio,await body(req,210*1024*1024)));
      const studioPhotoBatch=/^\/api\/studio\/projects\/([a-f0-9-]{36})\/photos\/batch$/.exec(route);if(studioPhotoBatch&&req.method==='POST')return json(res,200,await studio.updatePhotos(studioPhotoBatch[1],await body(req,128*1024)));
      const studioRoute=/^\/api\/studio\/projects\/([a-f0-9-]{36})(?:\/(recipe|apply|history|run|pause|delivery|backup|photos|sync-preview|sync)(?:\/([a-f0-9-]{36})(?:\/(mask|references|fork|thumbnail|versions|checkout))?)?)?$/.exec(route);
      if(studioRoute){const [,id,action,photoId,photoAction]=studioRoute;
        if(req.method==='POST'&&action==='history')return json(res,200,await studio.moveHistory(id,await body(req,4096)));
        if(req.method==='POST'&&action==='apply')return json(res,200,await studio.applyRecipe(id,await body(req,1000000)));
        if(req.method==='GET'&&photoAction==='versions')return json(res,200,await studio.photoVersions(id,photoId));
        if(req.method==='POST'&&photoAction==='checkout')return json(res,200,await studio.checkoutPhoto(id,photoId,await body(req,4096)));
        if(req.method==='POST'&&action==='sync-preview')return json(res,200,await studio.syncPlan(id,await body(req,1000000)));
        if(req.method==='POST'&&action==='sync')return json(res,200,await studio.syncPhotos(id,await body(req,1000000)));
        if(req.method==='GET'&&!action)return json(res,200,await studio.view(id));
        if(req.method==='GET'&&photoId&&!photoAction)return json(res,200,await studio.photo(id,photoId));
        if(req.method==='GET'&&photoAction==='thumbnail'){const detail=await studio.photo(id,photoId),asset=await workflows.asset(detail.photo.originalWorkflowId,detail.photo.originalAsset);const bytes=await sharp(asset.file,{limitInputPixels:40000000}).rotate().resize({width:360,height:360,fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer();res.writeHead(200,{'Content-Type':'image/webp','Content-Length':bytes.length});res.end(bytes);return;}
        if(req.method==='POST'){
          if(action==='photos'&&!photoId){if(String(req.headers['content-type']||'').split(';')[0]==='application/json'){const input=await body(req,4096),resolved=await resolvePicture(input,{jobs,workflows}),added=await studio.addPhoto(id,resolved.bytes,url.searchParams.get('name')||'已保存原图',{savedSource:true});if(!added.duplicate&&resolved.parentWorkflowId)await workflows.mutate(added.photo.workflowId,w=>{w.parentId=resolved.parentWorkflowId;w.sourceOrigin=resolved.sourceOrigin||{workflowId:resolved.parentWorkflowId,assetId:resolved.sourceAsset,step:resolved.sourceStep};return {};});return json(res,201,added);}const bytes=await readRequestBytes(req,MAX_IMAGE_UPLOAD_BYTES,IMAGE_UPLOAD_MESSAGE);return json(res,201,await studio.addPhoto(id,bytes,url.searchParams.get('name')||'photo'));}
          if(photoAction==='references')return json(res,200,await studio.attachReferences(id,photoId,referenceInputs((await body(req,IMAGE_JSON_BODY_BYTES)).references)));
          if(photoAction==='mask'){const input=await body(req,IMAGE_JSON_BODY_BYTES),decoded=decodeImage(input.mask);if(decoded.extension!=='png')throw Error('保护蒙版需要PNG格式。');return json(res,200,await studio.attachMask(id,photoId,decoded.bytes));}
          const input=await body(req,1000000);if(action==='backup')return json(res,200,await backupProject(studio,id));if(action==='delivery')return json(res,200,await exportProjectPhotos(studio,id,input.photoIds));if(action==='recipe')return json(res,200,await studio.setRecipe(id,input));if(action==='run')return json(res,202,await studio.run(id,input));if(action==='pause')return json(res,200,await studio.pause(id));if(photoAction==='fork')return json(res,200,await studio.forkPhoto(id,photoId,input));if(photoId)return json(res,200,await studio.updatePhoto(id,photoId,input));
        }
      }
      const studioDownload=/^\/api\/studio\/downloads\/([a-f0-9-]{36})$/.exec(route);
      if(studioDownload&&req.method==='GET'){const receipt=JSON.parse(await readFile(path.join(studio.directory,'exports',studioDownload[1]+'.json'),'utf8')),file=path.join(studio.directory,'exports',studioDownload[1]+(receipt.kind==='backup'?'.jsondata':'.zip'));res.writeHead(200,{'Content-Type':receipt.kind==='backup'?'application/json':'application/zip','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(receipt.name)}`,'Content-Length':(await stat(file)).size});await pipeline(createReadStream(file),res);return;}
      if (route === '/api/health' && req.method === 'GET') return json(res, 200, { app: 'houtu-studio', version: APP_VERSION, instanceId, csrf, clientPlatform, busy:runtimeBusy() });
      if(route==='/api/portrait/source'&&req.method==='GET'){
        const auditId=url.searchParams.get('audit');if(auditId){const w=await workflows.get(auditId);if(w.kind!=='portrait-audit')throw new Error('不是人物检查工作流。');const assetId=w.steps[0].output?.imageAsset;if(!assetId)throw new Error('检查原图尚未保存。');return json(res,200,{workflowId:w.id,assetId,url:`/api/workflows/${w.id}/assets/${assetId}`,name:w.name,auditId:w.id,diagnosis:w.steps.find(n=>n.id==='diagnose').status==='done'?w.steps.find(n=>n.id==='diagnose').output:null});}
        const id=url.searchParams.get('workflow'),assetId=url.searchParams.get('asset');await resolvePicture({source:{kind:'workflow',workflowId:id,assetId}},{jobs,workflows});const w=await workflows.get(id);return json(res,200,{workflowId:id,assetId,url:`/api/workflows/${id}/assets/${assetId}`,name:w.name});
      }
      if(route==='/api/portrait/cancel'&&req.method==='POST'){if(portraitAuditControl){portraitAuditControl.cancelled=true;await bridge.cancel(portraitAuditControl);}return json(res,200,{ok:true});}
      if(route==='/api/portrait/diagnose'&&req.method==='POST'){
        if(active||activePackage||critiqueActive)return json(res,409,{error:'已有任务正在运行，请等待完成。'});active='portrait-audit';portraitAuditControl={};
        try{const input=await body(req,IMAGE_JSON_BODY_BYTES);if(!await bridge.account())return json(res,401,{error:'请先登录ChatGPT再使用人物画面检查。'});const resolved=input.auditId?null:await resolvePicture(input,{jobs,workflows});if(portraitAuditControl.cancelled||isClosing)throw new Error('画面检查已停止，输入记录仍保留。');portraitAuditTask=auditPortrait({workflows,bridge,resolved,auditId:input.auditId,model:normalizeModel(input.model),control:portraitAuditControl});return json(res,200,await portraitAuditTask);}finally{if(active==='portrait-audit')active=null;portraitAuditControl=null;portraitAuditTask=null;}
      }
      const lineageMatch=/^\/api\/jobs\/([a-f0-9-]{36})\/lineage$/.exec(route);
      if(lineageMatch&&req.method==='GET'){let node=jobs.get(lineageMatch[1]);if(!node)return json(res,404,{error:'精修版本不存在。'});const versions=[],seen=new Set();for(let i=0;node&&i<50&&!seen.has(node.id);i++){seen.add(node.id);versions.push(publicJob(node));node=jobs.get(node.parentId);}return json(res,200,{versions:versions.reverse()});}
      if(route==='/api/platform/status'&&req.method==='GET')return json(res,200,await platform.status());
      if(route.startsWith('/api/platform/')&&req.method==='POST'){
        const input=await body(req,4096);
        if(route==='/api/platform/open')return json(res,200,await platform.open(input.provider));
        if(route==='/api/platform/search')return json(res,200,await platform.search(input.query,input.provider));
        if(route==='/api/platform/capture'){const result=await platform.capture(input.url,input.provider);return json(res,200,{...result,bytes:undefined,image:'data:image/png;base64,'+result.bytes.toString('base64')});}
        if(route==='/api/platform/close'){await platform.close();return json(res,200,{ok:true});}
      }
      if(route==='/api/creative'&&req.method==='POST'){const input=await body(req,64*1024),w=await creative.create(input);if(input.sourceOrigin)await workspace.bindOrigin(w.id,input.sourceOrigin);return json(res,201,await workflows.get(w.id));}
      const creativeState=/^\/api\/creative\/([a-f0-9-]{36})$/.exec(route);
      if(creativeState&&req.method==='GET'){const workflow=await workflows.get(creativeState[1]);if(workflow.kind!=='creative')throw new Error('工作流类型不符。');return json(res,200,{workflow,running:creative.running.has(workflow.id)});}
      const creativeRoute=/^\/api\/creative\/([a-f0-9-]{36})\/(inputs|subject|materials|selection|prompt|config|preview|run|stop)$/.exec(route);
      if(creativeRoute&&req.method==='POST'){if(activePackage)return json(res,409,{error:'正在打包，请完成后再创建或执行工作流。'});const [,id,action]=creativeRoute,input=await body(req,32768);let output;
        if(action==='inputs')output=await creative.configureInputs(id,input);
        if(action==='subject')output=input.action==='begin'?await creative.subjectStart(id,input.revision):await creative.subjectFinish(id,input);
        if(action==='materials')output=await creative.materials(id,input);
        if(action==='selection')output=await creative.selectReferences(id,input);
        if(action==='prompt')output=await creative.editPrompt(id,input);
        if(action==='config')output=await creative.configure(id,input.config,input.revision);
        if(action==='preview'){if(input.persistForHandoff){const bytes=await creative.preview(id,input.config,{fullSize:true}),ref=await workspace.ingest(bytes,'特效与合成预览.png',{parentId:id,origin:{workflowId:id,config:input.config}});output={image:'/api/workflows/'+ref.workflowId+'/assets/'+ref.assetId,handoff:ref};}else output={image:'data:image/png;base64,'+(await creative.preview(id,input.config)).toString('base64')};}
        if(action==='run')output=await creative.run(id,input);
        if(action==='stop'){await creative.stop(id);output={ok:true};}
        return json(res,200,output);
      }
      if(route==='/api/image-imports'&&req.method==='POST'){const bytes=await readRequestBytes(req,MAX_IMAGE_UPLOAD_BYTES,IMAGE_UPLOAD_MESSAGE),name=String(url.searchParams.get('name')||'original.raw');return json(res,201,await imageImports.create(bytes,name));}
      const importView=/^\/api\/image-imports\/([a-f0-9-]{36})$/.exec(route);if(importView&&req.method==='GET')return json(res,200,await imageImports.view(importView[1]));
      const logLut=/^\/api\/image-imports\/([a-f0-9-]{36})\/vlog-lut$/.exec(route);
      if(logLut&&req.method==='POST'){
        const bytes=await readRequestBytes(req,MAX_CUBE_BYTES,'LUT 最大支持 16 MB。');
        return json(res,200,await imageImports.applyVLogLut(logLut[1],bytes,url.searchParams.get('name')||'',url.searchParams.get('fromAttempt')));
      }
      const importMatch=/^\/api\/image-imports\/([a-f0-9-]{36})\/(develop|original)$/.exec(route);if(importMatch){if(importMatch[2]==='develop'&&req.method==='POST')return json(res,200,await imageImports.develop(importMatch[1],await body(req,4096)));if(importMatch[2]==='original'&&req.method==='GET'){const asset=await imageImports.original(importMatch[1]);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':asset.bytes,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`});await pipeline(createReadStream(asset.file),res);return;}}
      if(route==='/api/workflows'&&req.method==='GET')return json(res,200,{workflows:await workflows.list({section:url.searchParams.get('section')||'',status:url.searchParams.get('status')||'',query:(url.searchParams.get('q')||'').slice(0,200)})});
      if(route==='/api/workflows'&&req.method==='POST'){const input=await body(req,4096);const w=await workflows.create({kind:['manual-portrait','layer-composite','single-canvas'].includes(input.kind)?input.kind:'color',name:input.name,parentId:input.parentId});if(input.sourceOrigin)await workspace.bindOrigin(w.id,input.sourceOrigin);return json(res,201,await workflows.get(w.id));}
      const workflowMatch=/^\/api\/workflows\/([a-f0-9-]{36})(?:\/(begin|complete|fail|restart|retry|assets)(?:\/([a-f0-9]{64}))?)?$/.exec(route);
      if(workflowMatch){
        const [,id,action,assetId]=workflowMatch;
        if(req.method==='GET'&&!action)return json(res,200,await workflows.get(id));
        if(action==='assets'&&req.method==='GET'&&assetId){const asset=await workflows.asset(id,assetId);res.writeHead(200,{'Content-Type':asset.type,'Content-Length':asset.bytes,...(url.searchParams.has('download')?{'Content-Disposition':`attachment; filename="workflow-${assetId.slice(0,8)}.${asset.type==='application/octet-stream'?'bin':asset.type.split('/')[1]}`}:{})});await pipeline(createReadStream(asset.file),res);return;}
        if(action==='assets'&&req.method==='POST'&&!assetId){const type=String(req.headers['content-type']||'').split(';')[0],bytes=await readRequestBytes(req,MAX_IMAGE_UPLOAD_BYTES,IMAGE_UPLOAD_MESSAGE);return json(res,201,await workflows.putAsset(id,bytes,type));}
        if(req.method==='POST'){
          if(action==='retry'){
            if(active||activePackage||critiqueActive)return json(res,409,{error:'有任务正在运行，请勿重复启动。'});
            active='reserved';let job;
            try{const input=await body(req,IMAGE_JSON_BODY_BYTES),w=await workflows.get(id);job=jobs.get(w.jobId);if(w.kind!=='retouch'||!job)throw new Error('此工作流应在调色工作台继续。');
              if(!['prepare','generate','compose'].includes(input.step))throw new Error('请选择裁片、生成或合成步骤。');
              const dependency={prepare:'source',generate:'prepare',compose:'generate'}[input.step],upstream=w.steps.find(n=>n.id===dependency);if(upstream?.status!=='done')throw new Error('前置步骤尚未完成，请先从前面的失败步骤继续。');
              if(input.step!=='compose'&&!await bridge.account())return json(res,401,{error:'请先登录 ChatGPT，合成步骤本身不需要重新生成。'});
              let taskUpdate=null;if(input.outputLongEdge!==undefined){if(input.step!=='compose'||job.operation!=='detail-upscale'||![1024,2048,4096,8192].includes(input.outputLongEdge))throw Error('只有细节放大的合成步骤可以调整输出尺寸。');taskUpdate={...job.task,longEdge:input.outputLongEdge};}if(input.targetSettings!==undefined){const t=input.targetSettings;if(input.step!=='compose'||PRESETS.find(p=>p.id===job.operation)?.fullFrame||typeof t.autoTarget!=='boolean'||!Number.isInteger(t.sourceRetention)||t.sourceRetention<0||t.sourceRetention>95)throw Error('部位保护与原图融合设置无效。');taskUpdate={...job.task,autoTarget:t.autoTarget,sourceRetention:t.sourceRetention};}let targetUpdate=null;if(input.replaceTargetMask===true){if(input.step!=='compose'||PRESETS.find(t=>t.id===job.operation)?.fullFrame)throw Error('此步骤不使用原位编辑范围。');let id=null;if(input.targetMask){const prepared=w.steps.find(n=>n.id==='prepare')?.output,original=await readFile((await workflows.asset(w.id,prepared.sourceAsset)).file);id=(await workflows.putAsset(job.workflowId,await checkedTargetMask(input,original),'image/png')).id;}targetUpdate={targetMaskOverride:true,compositionTargetMaskAsset:id,targetMaskAsset:id};}let maskUpdate=null;if(input.replaceProtection===true){
                if(input.step!=='compose'||!isSceneOperation(job.operation))throw Error('只有场照与次元的重合成可以替换主体保护。');
                let mask=null;if(input.protectionMask){const decoded=decodeImage(input.protectionMask);if(decoded.extension!=='png')throw Error('主体保护蒙版需要PNG格式。');mask=(await workflows.putAsset(id,decoded.bytes,'image/png')).id;}
                maskUpdate={compositionMaskOverride:true,compositionMaskAsset:mask};
              }
              await workflows.restart(id,input.step,input.revision);if(input.step!=='compose'){job.task={...w.steps[0].output.options.task};job.targetMaskOverride=false;job.compositionTargetMaskAsset=null;job.compositionMaskOverride=false;job.compositionMaskAsset=null;}if(taskUpdate)job.task=taskUpdate;if(targetUpdate)Object.assign(job,targetUpdate);if(maskUpdate)Object.assign(job,maskUpdate);Object.assign(job,{runId:randomUUID(),status:'preparing',message:'从所选步骤继续执行…',localComposition:input.step==='compose',output:null,workflowToken:null,threadId:null,turnId:null,saving:null});active=job.id;await persist(job);const runId=job.runId;
              Promise.resolve().then(async()=>{if(input.step==='compose'){const asset=await workflows.asset(id,upstream.output.rawAsset);await composeOutput(job,await readFile(asset.file),runId);await finish(job,'done','已复用原始出图完成合成，没有再次调用AI。',runId);}else{if(input.step==='prepare'){const asset=await workflows.asset(id,upstream.output.imageAsset);await prepareJob(job,await readFile(asset.file));}await generateJob(job);}}).catch(e=>finish(job,'error',friendlyError(e.message),runId)).catch(()=>{});
              return json(res,202,publicJob(job));
            }finally{if(active==='reserved')active=null;}
          }
          const w=await workflows.get(id);if(!['color','manual-portrait','layer-composite','single-canvas'].includes(w.kind))return json(res,409,{error:'精修工作流由图片任务执行，请使用步骤重试。'});
          const input=await body(req,24*1024*1024);let result;
          if(action==='begin')result=await workflows.begin(id,input.step,input.revision);
          else if(action==='complete')result=await workflows.complete(id,input.step,input.token,input);
          else if(action==='fail')result=await workflows.fail(id,input.step,input.token,input.message);
          else if(action==='restart')result=await workflows.restart(id,input.step,input.revision);
          else return json(res,404,{error:'工作流操作不存在。'});
          return json(res,200,result);
        }
      }
      if (route === '/api/color/presets' && req.method === 'GET') return json(res,200,{presets:colors.list()});
      if (route.startsWith('/api/color/') && req.method === 'POST') {
        if(activePackage) return json(res,409,{error:'正在打包，请完成后再修改预设或读取参考。'});
        if(route==='/api/color/critique'){
          if(active||critiqueActive)return json(res,409,{error:'请等待当前图片任务完成。'});
          critiqueActive=true;const dir=path.join(directory,'analysis',randomUUID());let analysisAttempt=null;
          try{const input=await body(req,IMAGE_JSON_BODY_BYTES);if(input.workflow){const w=await workflows.get(input.workflow.id),n=w.steps.find(n=>n.id==='analysis');if(w.kind!=='color'||n?.status!=='running'||n.token!==input.workflow.token)throw Object.assign(new Error('审美步骤已过期，请重新开始。'),{status:409});analysisAttempt=input.workflow;}if(!await bridge.account())throw Object.assign(new Error('请先在AI修图板块登录ChatGPT，再使用审美分析。'),{status:401});await mkdir(dir,{recursive:true});const image=decodeImage(input.image);const prepared=await prepareEditImage(image.bytes,null);const imagePath=path.join(dir,'source.png');await writeFile(imagePath,prepared.source);let referencePath=null;
            if(input.reference){const ref=decodeImage(input.reference);const ready=await prepareEditImage(ref.bytes,null);referencePath=path.join(dir,'reference.png');await writeFile(referencePath,ready.source);}
            const model=normalizeModel(input.model),control={model,account:null};
            if(analysisAttempt){const previous=(await workflows.get(analysisAttempt.id)).steps.find(n=>n.id==='analysis')?.output;control.account=accountSnapshot(previous?.account);if(normalizeModel(previous?.model)===model)control.resolvedModel=normalizeModel(previous?.resolvedModel);}
            bridge.capture(control);
            if(analysisAttempt){const record=async resolvedModel=>{await workflows.mutate(analysisAttempt.id,w=>{const n=w.steps.find(n=>n.id==='analysis');if(n.token!==analysisAttempt.token)throw Error('审美步骤已过期。');n.output={...n.output,model,resolvedModel,account:accountSnapshot(control.account)};Object.assign(n.attempts.at(-1),{output:n.output});return {};});};await record(control.resolvedModel||null);control.onModelSelected=record;}
            const requestedTone=toneChoice(input.tone),promptSpec=requireAnalysisSpec('color.advice'),instructions=requestedTone?toneAdvicePrompt(requestedTone,{hasReference:Boolean(referencePath)}):null,result=await bridge.critique(imagePath,referencePath,instructions,[],control);
            const preset=normalizePreset({name:'ChatGPT 审美方案',settings:result.settings,layers:result.layers});
            const response={requestedTone,promptVersion:promptSpec.version,compiledPrompt:control.analysisPrompt||null,account:accountSnapshot(control.account),model,resolvedModel:control.resolvedModel||null,summary:String(result.summary||'').slice(0,600),query:String(result.query||'').slice(0,120),preset};
            if(analysisAttempt)response.workflow=(await workflows.complete(analysisAttempt.id,'analysis',analysisAttempt.token,{state:{requestedTone,promptVersion:promptSpec.version,compiledPrompt:control.analysisPrompt||null,aiPlan:preset,account:accountSnapshot(control.account),model,resolvedModel:control.resolvedModel||null,summary:response.summary,query:response.query},message:'审美方案已保存，关闭页面后仍可恢复'})).workflow;
            return json(res,200,response);
          }catch(e){if(analysisAttempt)await workflows.fail(analysisAttempt.id,'analysis',analysisAttempt.token,friendlyError(e.message)).catch(()=>{});throw e;}finally{critiqueActive=false;await rm(dir,{recursive:true,force:true});}
        }
        const input=await body(req,2*1024*1024);
        if(route==='/api/color/presets/save')return json(res,200,{preset:await colors.save(input.preset,input.id)});
        if(route==='/api/color/presets/import')return json(res,200,{added:await colors.import(input)});
        if(route==='/api/color/presets/delete'){await colors.remove(input.id);return json(res,200,{ok:true});}
        if(route==='/api/color/reference')return json(res,200,await importReference(input.url));
        if(route==='/api/color/search')return json(res,200,{references:await searchReferences(input.query)});
        return json(res,404,{error:'接口不存在。'});
      }
      if (route === '/api/shutdown' && req.method === 'POST') {
        if ((await body(req)).instanceId !== instanceId) return json(res, 403, { error: '实例不匹配。' });
        if (activePackage) return json(res, 409, { error: '正在打包，请完成后再停止网站。' });
        json(res, 200, { ok: true }); setTimeout(() => close().catch(() => {}), 60); return;
      }
      if(route==='/api/server/cache'&&req.method==='GET')return json(res,200,await library.cacheInfo());
      if(route==='/api/server/cache/clear'&&req.method==='POST')return json(res,200,await library.clearCache());
      if(route==='/api/server/status'&&req.method==='GET'){
        try{await bridge.account();}catch{}
        const images=await library.refresh(jobs,workflows);
        const records=accounts.records().map(account=>({...account,images:images.filter(image=>image.account?.email.toLowerCase()===account.email.toLowerCase()).length}));
        return json(res,200,{serverId:accounts.state.serverId,startedAt,created:accounts.state.created,machine:os.hostname(),version:APP_VERSION,projectRoot:ROOT,dataRoot:path.resolve(directory),loginRoot:path.join(path.resolve(directory),'codex'),scope:'local',current:accounts.current(),accounts:records,images:images.length});
      }
      if(route==='/api/server/images'&&req.method==='GET'){await library.refresh(jobs,workflows);return json(res,200,library.list(url.searchParams,accounts.records()));}
      const thumbnail=/^\/api\/server\/thumbnails\/([a-f0-9]{64})$/.exec(route);
      if(thumbnail&&req.method==='GET'){
        if(!library.records.has(thumbnail[1]))await library.refresh(jobs,workflows);
        const file=await library.thumbnail(thumbnail[1],jobs,workflows),info=await stat(file);res.writeHead(200,{'Content-Type':'image/webp','Content-Length':info.size,'Cache-Control':'no-store'});await pipeline(createReadStream(file),res);return;
      }
      if(route==='/api/models'&&req.method==='GET'){
        try{
          if(!await bridge.account())return json(res,200,{signedIn:false,models:[],message:'请先使用ChatGPT登录，再读取账号模型。'});
          if(typeof bridge.models!=='function')return json(res,200,{signedIn:true,models:[],message:'当前客户端未提供模型列表，可使用客户端默认模型。'});
          return json(res,200,{signedIn:true,models:await bridge.models({refresh:url.searchParams.get('refresh')==='1'})});
        }catch{return json(res,503,{error:'模型列表读取失败，请刷新后重试。已选模型不会被自动替换。'});}
      }
      if (route === '/api/state' && req.method === 'GET') {
        let account = null, serviceError = '';
        try { account = await bridge.account(); } catch { serviceError = clientPlatform==='android'?'手机内置AI客户端尚未就绪，请重新打开应用或在更多中复制诊断；本地调色与超分仍可使用。':'本机图片客户端未就绪，请重启网站，或在项目文件夹运行 npm install。'; }
        return json(res, 200, { csrf, account, serviceError, imageRuntime:bridge.imageRuntimeStatus?.()||null, loginError, loginPending: Boolean(login), defaultPrompt: DEFAULT_PROMPT,
          activeAnalysis:critiqueActive||active==='portrait-audit',activeJob: jobs.has(active) ? publicJob(jobs.get(active)) : null, package: packageView(packages.get(latestPackage)) });
      }
      if (route === '/api/templates' && req.method === 'GET') return json(res, 200, { schemaVersion: 1, templates: templates.list() });
      if (route === '/api/templates/save' && req.method === 'POST') {
        if (activePackage) return json(res, 409, { error: '正在打包，请完成后再保存模板。' });
        const input = await body(req, 2 * 1024 * 1024);
        return json(res, 200, { template: await templates.save(input.template, input.id) });
      }
      if (route === '/api/templates/import' && req.method === 'POST') {
        if (activePackage) return json(res, 409, { error: '正在打包，请完成后再导入模板。' });
        return json(res, 200, { added: await templates.import(await body(req, 2 * 1024 * 1024)) });
      }
      const templateMatch = /^\/api\/templates\/([a-f0-9-]{36})\/delete$/.exec(route);
      if (templateMatch && req.method === 'POST') {
        if (activePackage) return json(res, 409, { error: '正在打包，请完成后再删除模板。' });
        await templates.remove(templateMatch[1]); return json(res, 200, { ok: true });
      }
      if (route === '/api/packages' && req.method === 'POST') {
        if (active || activePackage || critiqueActive) return json(res, 409, { error: '请等待当前生成、分析或打包完成。' });
        const input = await body(req);
        if(active||activePackage||critiqueActive||studio.active||studio.archiving)return json(res,409,{error:'已有任务正在运行，请先等待完成。'});
        if (typeof input.includePrompts !== 'boolean') throw new Error('请选择是否包含提示词。');
        const id = randomUUID(), file = path.join(directory, 'packages', `houtu-studio-${id}.zip`);
        const entry = { id, file, status: 'building', message: '准备打包…' };
        packages.set(id, entry); activePackage = id; latestPackage = id;
        Promise.resolve().then(() => packageBuilder({ root: ROOT, output: file, includePrompts: input.includePrompts, progress: message => { entry.message = message; } }))
          .then(result => { entry.status = 'done'; entry.message = '便携包已完成，可下载到其他 Windows x64 电脑。'; entry.bytes = result.bytes; entry.sha256 = result.sha256; })
          .catch(error => { entry.status = 'error'; entry.message = friendlyError(error.message); })
          .finally(() => { if (activePackage === id) activePackage = null; });
        return json(res, 202, packageView(entry));
      }
      const packageMatch = /^\/api\/packages\/([a-f0-9-]{36})$/.exec(route);
      if (packageMatch && req.method === 'GET') {
        const entry = packages.get(packageMatch[1]);
        return entry ? json(res, 200, packageView(entry)) : json(res, 404, { error: '打包记录不存在。' });
      }
      const packageDownload = /^\/downloads\/package\/([a-f0-9-]{36})$/.exec(route);
      if (packageDownload && req.method === 'GET') {
        const entry = packages.get(packageDownload[1]);
        if (!entry || entry.status !== 'done') return json(res, 404, { error: '便携包尚未完成。' });
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': (await stat(entry.file)).size,
          'Content-Disposition': `attachment; filename="houtu-studio-Windows-x64.zip"; filename*=UTF-8''${encodeURIComponent('厚涂小站-Windows-x64.zip')}` });
        await pipeline(createReadStream(entry.file), res); return;
      }
      if (route === '/api/login' && req.method === 'POST') {
        if (active) return json(res, 409, { error: '请等待当前图片完成或先停止生成。' });
        if (!login) {
          loginError = '';
          login = await bridge.login();
          loginStartedAt = Date.now();
          const auth = new URL(login.authUrl);
          if (auth.protocol !== 'https:' || auth.hostname !== 'auth.openai.com') { login = null; throw new Error('官方登录地址校验失败。'); }
        }
        return json(res, 200, { authUrl: login.authUrl });
      }
      if (route === '/api/logout' && req.method === 'POST') {
        if (active) return json(res, 409, { error: '请先停止当前生成。' });
        await bridge.logout(); login = null;
        return json(res, 200, { ok: true });
      }
      if (route === '/api/jobs' && req.method === 'GET') {
        return json(res, 200, { jobs: [...jobs.values()].sort((a,b) => b.created - a.created).slice(0, 24).map(publicJob) });
      }
      if (route === '/api/prompt' && req.method === 'POST') {
        return json(res, 200, { prompt: paintingPrompt(await body(req)) });
      }
      if(route==='/api/jobs'&&req.method==='POST'){return json(res,202,await startRetouch(await body(req,IMAGE_JSON_BODY_BYTES)));}
      const jobMatch = /^\/api\/jobs\/([a-f0-9-]{36})(\/cancel)?$/.exec(route);
      if (jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job) return json(res, 404, { error: '没有找到这次生成。' });
        if (!jobMatch[2] && req.method === 'GET') return json(res, 200, publicJob(job));
        if (jobMatch[2] && req.method === 'POST') {
          if (isRunning(job)) {
            if (!job.turnId) return json(res, 409, { error: '生成正在初始化，请稍后再停止。' });
            await bridge.cancel(job);
            if (isRunning(job)) { job.status = 'cancelling'; job.message = '正在停止生成…'; }
          }
          return json(res, 200, publicJob(job));
        }
      }
      if(req.method==='GET'&&route==='/'){
        const oldEditor=['job','operation','refineWorkflow','refineAsset','portraitAudit'].some(key=>url.searchParams.has(key))||
          (url.searchParams.has('tool')&&!url.searchParams.get('tool').startsWith('/'));
        const location=oldEditor?'/workbench/?tool='+encodeURIComponent('/ai/'+url.search):'/workbench/'+url.search;
        res.writeHead(302,{Location:location});res.end();return;
      }
      let file;
      const imageMatch = /^\/images\/([a-f0-9-]{36})\/(source\.(?:png|jpg|webp)|result(?:-[a-f0-9-]{36})?\.(?:png|jpg|webp))$/.exec(route);
      if (imageMatch && req.method === 'GET' && jobs.has(imageMatch[1])) {
        file = path.join(jobsDirectory, imageMatch[1], imageMatch[2]);
        const imageJob=jobs.get(imageMatch[1]);if(imageMatch[2].startsWith('source.')&&imageJob.operation==='outpaint'&&imageJob.workflowId){const originalWorkflow=await workflows.get(imageJob.workflowId),originalAsset=originalWorkflow.steps.find(n=>n.id==='source')?.output?.imageAsset;if(originalAsset)file=(await workflows.asset(originalWorkflow.id,originalAsset)).file;}
        if (url.searchParams.has('download')) res.setHeader('Content-Disposition', `attachment; filename="anime-paint-${imageMatch[1].slice(0,8)}.${path.extname(file).slice(1)}"`);
      } else if(req.method==='GET'&&/^\/workbench(?:\/?|\/(?:unified\.js|drafts\.js|tools\.js|worker\.js|unified\.css))$/.test(route)){file=path.join(ROOT,'frontend','unified',route.endsWith('.js')||route.endsWith('.css')?path.basename(route):'index.html');
      } else if(req.method==='GET'&&(route==='/layers'||route==='/layers/')){file=path.join(ROOT,'frontend','layer-workbench.html');
      } else if(req.method==='GET'&&(route==='/logs'||route==='/logs/')){file=path.join(ROOT,'frontend','logs.html');
      } else if(req.method==='GET'&&['/settings','/settings/','/server','/server/'].includes(route)){
        file=path.join(ROOT,'frontend','server.html');
      } else if (req.method === 'GET' && (route === '/color' || route === '/color/' || route === '/ai/color' || route === '/ai/color/')) {
        file=path.join(ROOT,'frontend','index.html');
      } else if(req.method==='GET'&&(route==='/upscale'||route==='/upscale/')){file=path.join(ROOT,'frontend','upscale.html');
      } else if(req.method==='GET'&&(route==='/studio'||route==='/studio/')){
        file=path.join(ROOT,'frontend','studio.html');
      } else if(req.method==='GET'&&(route==='/lab'||route==='/lab/')){file=path.join(ROOT,'frontend','lab.html');
      } else if(req.method==='GET'&&(route==='/features'||route==='/features/')){
        file=path.join(ROOT,'frontend','features.html');
      } else if(req.method==='GET'&&(route==='/workflows'||route==='/workflows/')){
        file=path.join(ROOT,'frontend','workflows.html');
      } else if(req.method==='GET'&&(route==='/creative'||route==='/creative/')){
        file=path.join(ROOT,'frontend','creative.html');
      } else if (req.method === 'GET' && /^\/color\/(app\.js|engine\.js|worker\.js|masks\.js|workflow-client\.js|workflows\.js|effects\.js|creative\.js|creative-multi\.js|server\.js|studio\.js|studio-agent\.js|scene-guide-panel\.js|studio-planner\.js|studio-culling\.js|studio-layout\.(?:js|css)|logs\.(?:js|css)|settings\.css|layer-(?:workbench\.(?:js|css)|document\.js)|features\.(?:js|css)|lab\.js|tonal-looks\.js|tone-controls\.js|upscale\.js|updates\.js|style\.css)$/.test(route)) {
        file=path.join(ROOT,'frontend',path.basename(route));
      } else if (req.method === 'GET' && /^\/vision\/(vision_bundle\.mjs|wasm\/vision_wasm_(?:nosimd_)?internal\.(?:js|wasm))$/.test(route)) {
        file=path.join(ROOT,'node_modules','@mediapipe','tasks-vision',route.slice('/vision/'.length));
      } else if (req.method === 'GET' && /^\/models\/(selfie_multiclass_256x256\.tflite|face_landmarker\.task|hand_landmarker\.task)$/.test(route)) {
        file=path.join(ROOT,'models',path.basename(route));
      } else {
        const files = { '/ai-desk.js':'ai-desk.js','/ai-desk.css':'ai-desk.css','/desk-controls.js':'desk-controls.js','/scene-guide.js':'scene-guide.js','/manual-frequency.js':'manual-frequency.js','/manual-neutral.js':'manual-neutral.js','/outpaint-layout.js':'outpaint-layout.js','/outpaint-controls.js':'outpaint-controls.js','/outpaint.css':'outpaint.css', '/retouch-agent-options.js':'retouch-agent-options.js','/retouch-agent-knowledge.js':'retouch-agent-knowledge.js','/workflow-pictures.js':'workflow-pictures.js','/studio-photos.js':'studio-photos.js','/studio-planning.js':'studio-planning.js','/editor-history.js':'editor-history.js','/editor-history.css':'editor-history.css','/upload-limits.js':'upload-limits.js','/portrait':'portrait.html','/portrait/':'portrait.html','/ai':'index.html','/ai/':'index.html','/image-import.js':'image-import.js','/image-formats.js':'image-formats.js','/workspace.js':'workspace.js','/workspace-continuation.js':'workspace-continuation.js','/capabilities.js':'capabilities.js','/workspace.css':'workspace.css','/workflow-sections.js':'workflow-sections.js','/manual-portrait.js':'manual-portrait.js','/manual-portrait-worker.js':'manual-portrait-worker.js','/manual-portrait-engine.js':'manual-portrait-engine.js','/manual-portrait.css':'manual-portrait.css', '/workbench-embedded.css':'workbench-embedded.css','/workbench-embedded.js':'workbench-embedded.js','/local-exports.js':'local-exports.js','/desktop-downloads.js':'desktop-downloads.js','/android-shell.js':'android-shell.js','/android-shell.css':'android-shell.css','/superres-options.js':'superres-options.js', '/superres.css':'superres.css', '/editor-layout.css':'editor-layout.css', '/image-viewer.js':'image-viewer.js','/view-geometry.js':'view-geometry.js','/image-viewer.css':'image-viewer.css', '/update-notice.js':'update-notice.js','/update-notice.css':'update-notice.css', '/paint-profile.js':'paint-profile.js','/feature-expansion.js':'feature-expansion.js','/prompt-contract.js':'prompt-contract.js','/feature-ui.js':'feature-ui.js','/target-policy.js':'target-policy.js','/target-masks.js':'target-masks.js','/vision-target.html':'vision-target.html', '/': 'index.html', '/app.js': 'app.js', '/catalog.js': 'catalog.js', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg','/portrait-options.js':'portrait-options.js','/portrait-ui.js':'portrait-ui.js','/model-picker.js':'model-picker.js','/model-options.js':'model-options.js','/scene-options.js':'scene-options.js','/belly-options.js':'belly-options.js','/scene-ui.js':'scene-ui.js','/subject-mask.js':'subject-mask.js' };
        if (!Object.hasOwn(files, route) || req.method !== 'GET') return json(res, 404, { error: '页面不存在。' });
        file = path.join(ROOT, 'public', files[route]);
      }
      let bytes = await readFile(file);
      if(path.extname(file)==='.html'){
        const downloads='<script src="/local-exports.js"></script>';
        const shell=embedded?'':clientPlatform==='android'?'<script src="/android-shell.js"></script><link rel="stylesheet" href="/android-shell.css">':'<script src="/desktop-downloads.js"></script>';
        const editor=embedded?'<link rel="stylesheet" href="/workbench-embedded.css"><script type="module" src="/workbench-embedded.js"></script>':'';
        bytes=Buffer.from(bytes.toString('utf8').replace('<head>','<head>'+downloads+editor+shell));
      }
      res.writeHead(200, { 'Content-Type': ({'.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm'})[path.extname(file)] || MIME[path.extname(file)] || 'application/octet-stream' }); res.end(bytes);
    } catch (error) {
      void diagnostics.record({event:'request.failed',level:error.status&&error.status<500?'warn':'error',workflowId:error.workflowId,data:{operation:diagnosticOperation,httpStatus:error.code==='ENOENT'?404:error.status||400},error});
      if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : error.status || 400, { error: friendlyError(error.message),...(error.workflowId?{workflowId:error.workflowId}:{}) });
      else res.end();
    } finally {if(trackedOperation)pendingOperations--;}
  });
  server.requestTimeout = 120000;
  const close = () => closingPromise ||= (async () => {isClosing=true;for(const job of jobs.values())if(isRunning(job))job.cancelled=true;if(portraitAuditControl)portraitAuditControl.cancelled=true;
    studio.closing=true;if(studio.active)studio.active.stop=true;
    for(const state of creative.running.values())state.stop=true;
    await imageImports.close();await updates.close();await platform.close();
    await agents.close();await planner.close();await bridge.stop(); for (const j of jobs.values()) clearTimeout(j.deadline);
    await creative.drain();await studio.drain();await agents.drain();await layerProjects.close();await targetVision.close();if(portraitAuditTask)await Promise.allSettled([portraitAuditTask]);
    await Promise.allSettled([...jobWrites.values()]);
    await Promise.allSettled([accounts.queue,library.queue,...library.pendingThumbs.values()]);
    await workspace.queue;await diagnostics.close();server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    try { const record = JSON.parse(await readFile(path.join(directory, 'server.json'), 'utf8')); if (record.instanceId === instanceId) await unlink(path.join(directory, 'server.json')); } catch {}
  })();
  return { server, bridge, studio, planner, agents, diagnostics, targetVision, updates, instanceId, close, isBusy:runtimeBusy };
}

export function friendlyError(message = '') {
  if (/quota|usage.?limit|rate.?limit|额度|429/i.test(message)) return '当前账号的使用额度不足或请求过于频繁，请稍后重试。';
  if (/unauthor|authenticat|401|token.*expir/i.test(message)) return '登录已失效，请重新使用 ChatGPT 登录。';
  if (/network|connect|fetch failed|timed? ?out|timeout/i.test(message)) return '连接图片服务失败，请检查网络后重试。';
  if (/^[\u4e00-\u9fff]/.test(message)) return message.slice(0, 180);
  return '这次处理未成功，请稍后重试；若持续失败，请重启网站。';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须是 1024–65535 之间的端口。');
  const app = await createApp();
  app.server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已在使用，请打开 http://127.0.0.1:${port} 或换一个 PORT。` : '网站启动失败。');
    app.bridge.stop(); process.exitCode = 1;
  });
  app.server.listen(port, '127.0.0.1', async () => {
    const address = `http://127.0.0.1:${port}`;
    console.log(`厚涂小站已启动：${address}\n请保持此窗口运行。`);
    try { await writeFile(path.join(ROOT, 'data', 'server.json'), JSON.stringify({ pid: process.pid, port, instanceId: app.instanceId })); }
    catch { console.error('无法保存启动信息，请把网站放在可写目录。'); await app.close(); process.exitCode = 1; return; }
    if (process.argv.includes('--open')) openBrowser(port);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
