import {PLANNING_TASKS} from '/studio-planning.js';
import {PAINT_LEVEL_MAX} from '/paint-profile.js';
import {buildTargetMask} from '/target-masks.js';
import {createModelPicker} from '/model-picker.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const label=(text,control)=>{const l=node('label',text);l.append(control);return l;};
const select=(id,items,value)=>{const s=node('select');s.id=id;for(const [v,t]of items)s.append(new Option(t,v));s.value=value;return s;};
export function createStudioPlanner({mount,api,context,notify,onApplied,onRecipe,onRun}){
 const panel=node('details',null,'studio-planner');panel.id='studio-planner';panel.append(node('summary','经典配方规划 · 识别与拆分'));
 const intro=node('p','经典配方保留原来的视觉模型＋规则／云端规划路线。按显卡配置自动调度、由本地视觉Agent检查的功能在“Agent”面板。这里仍可为1–5张原图规划旧版配方，保留旧版本。','hint');panel.append(intro);
 const form=node('div',null,'studio-planner-form');
 const provider=select('planner-provider',[['auto','按电脑能力选择'],['local','本机视觉模型＋规则'],['chatgpt','ChatGPT审美规划']],'auto');
 const providerHint=node('p','展开后检测本机模型与内存。','hint');providerHint.id='planner-capacity';
 const tasks=node('fieldset');tasks.append(node('legend','本轮需要做什么'));const taskInputs=new Map();
 for(const [id,name]of PLANNING_TASKS){const box=node('input');box.type='checkbox';box.id='planner-task-'+id;box.checked=id==='portrait';taskInputs.set(id,box);const l=node('label',null,'studio-check');l.append(box,document.createTextNode(name));tasks.append(l);}
 const style=select('planner-style',[['natural','保留原画风'],['photo','自然摄影'],['anime','二次元厚涂'],['cos','COS质感厚涂']],'natural');
 const level=node('input');level.id='planner-paint-level';level.type='number';level.min='1';level.max=PAINT_LEVEL_MAX;level.value='2';
 const tone=select('planner-tone',[['none','沿用原图影调'],['dark','暗调'],['bright','亮调'],['cinema','电影质感']],'none');
 const budget=select('planner-budget',[['1','最多1次AI跑图／张'],['2','最多2次AI跑图／张'],['3','最多3次AI跑图／张']],'2');
 const goal=node('textarea');goal.id='planner-goal';goal.maxLength=2000;goal.rows=3;goal.placeholder='例如：人物轻微细化、衣褶自然；保留原场景，冷暖关系参考本张功能参考池。';
 const modelMount=node('div');modelMount.id='planner-model';const analysisModel=createModelPicker({mount:modelMount,storageKey:'houtu-planning-model',labelText:'ChatGPT规划模型',noteText:'只用于读图、拆分步骤和编写提示词；规划阶段不生成图片。'});
 form.append(label('调度方式',provider),providerHint,tasks,label('成片风格',style),label(`厚涂程度 1–${PAINT_LEVEL_MAX}`,level),label('影调取向',tone),label('AI步骤上限',budget),label('补充要求',goal),modelMount);
 const scope=node('p',null,'hint');scope.id='planner-scope';form.append(scope,node('p','ChatGPT规划与跑图使用已登录账号的可用额度。本机模式使用随包视觉模型和任务规则，不具备大语言模型的复杂审美推理。','hint'));
 const actions=node('div',null,'studio-actions');
 function action(id,text,fn,cls){const b=node('button',text,cls);b.type='button';b.id=id;b.onclick=()=>perform(fn);actions.append(b);return b;}
 const plan=action('planner-create','先生成方案',()=>start(false));
 const automatic=action('planner-auto','规划并连续处理',()=>start(true),'primary');
 const cancel=action('planner-cancel','停止分析',stop);cancel.disabled=true;
 const status=node('p','选择照片与任务后生成方案。','hint');status.id='planner-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const results=node('div');results.id='planner-results';panel.append(form,actions,status,results);mount.insertBefore(panel,mount.querySelector('.studio-fields'));
 let capability=null,loading=false,working=false,localBusy=false,submitting=false,cancelled=false,view=null,lastProject=null,planId=null,polling=false,autoRun=false,renderKey='',executionTicket=0;
 const key=id=>'houtu-studio-planner:'+id;
 const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
 function controls(){const c=context(),invalid=!c.project||c.photoIds.length<1||c.photoIds.length>5,locked=working||localBusy||view?.status==='running';plan.disabled=automatic.disabled=invalid||locked||c.locked;cancel.disabled=!submitting&&!localBusy&&view?.status!=='running';for(const b of results.querySelectorAll('button'))b.disabled=locked||c.locked;modelMount.hidden=provider.value==='local';level.disabled=!taskInputs.get('paint').checked;scope.textContent=c.project?'已选 '+c.photoIds.length+' 张 · AI最多 '+(c.photoIds.length*Number(budget.value))+' 步；实际以方案为准。':'请先打开照片项目。';}
 async function perform(fn){if(working)return;working=true;controls();try{await fn();}catch(error){autoRun=false;message(error.message,true);notify(error.message,true);}finally{working=false;localBusy=false;submitting=false;controls();}}
 async function detect(){if(capability||loading)return;loading=true;try{capability=await api('/api/studio/planning/capabilities');providerHint.textContent=capability.memoryGiB+' GB内存 · '+capability.cores+'个CPU执行单元。'+capability.reason;}catch(error){providerHint.textContent='检测失败：'+error.message;}finally{loading=false;controls();}}
 panel.addEventListener('toggle',()=>{if(panel.open)void detect();});
 for(const control of [provider,budget,...taskInputs.values()])control.addEventListener('change',controls);
 taskInputs.get('paint').addEventListener('change',()=>{if(taskInputs.get('paint').checked&&!['anime','cos'].includes(style.value))style.value='cos';if(!taskInputs.get('paint').checked&&['anime','cos'].includes(style.value))style.value='natural';});
 tone.addEventListener('change',()=>{if(tone.value!=='none')taskInputs.get('color').checked=true;});
 async function start(continuous){
  executionTicket++;cancelled=false;autoRun=false;submitting=true;controls();await detect();if(!capability)throw Error('请重试电脑能力检测后再规划。');const c=context();if(!c.project||!c.photoIds.length||c.photoIds.length>5)throw Error('请选择1–5张照片。');
  const chosenTasks=[...taskInputs].filter(([,v])=>v.checked).map(([id])=>id);if(!chosenTasks.length)throw Error('请选择需要安排的任务。');
  const input={provider:provider.value,revision:c.project.revision,photoIds:[...c.photoIds],tasks:chosenTasks,style:style.value,paintLevel:Number(level.value),tone:tone.value,maxAiSteps:Number(budget.value),goal:goal.value,analysisModel:analysisModel.value,generationModel:c.generationModel};
  const decision=await api('/api/studio/projects/'+c.project.id+'/planning-preflight',input);message(decision.reason);
  if(decision.provider==='local'){
   localBusy=true;controls();const values=[];
   for(const [index,id]of c.photoIds.entries()){
    if(cancelled)throw Error('本机识别已停止，尚未提交规划。');const photo=c.project.photos.find(p=>p.id===id);message('本机模型识别 '+(index+1)+'/'+c.photoIds.length+' · '+photo.name);
    const response=await fetch('/api/studio/projects/'+c.project.id+'/photos/'+id+'/planning-preview');if(!response.ok)throw Error('读取本机识别预览失败。');const blob=await response.blob();
    const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('读取识别图片失败。'));reader.readAsDataURL(blob);});
    const person=await buildTargetMask({image,operation:'full-body'});if(cancelled)throw Error('本机识别已停止。');const face=await buildTargetMask({image,operation:'face'});
    const compact=r=>({found:!!r.found,coverage:r.width&&r.height?Math.min(1,(r.selectedPixels||0)/(r.width*r.height)):0});
    values.push({photoId:id,workflowId:photo.workflowId,originalAsset:photo.originalAsset,engine:'mediapipe-browser-v1',person:compact(person),face:compact(face)});
   }input.observations=values;
  }
  if(cancelled)throw Error('规划已停止。');if(context().project?.id!==c.project.id||context().project.revision!==c.project.revision)throw Error('照片项目已变化，请重新规划。');
  message('正在保存规划输入，图片生成尚未开始…');const created=await api('/api/studio/projects/'+c.project.id+'/plans',input);
  try{localStorage.setItem(key(c.project.id),created.workflowId);}catch{}
  const current=context().project,abandoned=cancelled||current?.id!==c.project.id||current.revision!==c.project.revision;
  if(abandoned){autoRun=false;let stopError='';try{await api('/api/studio/plans/'+created.workflowId+'/cancel',{});}catch(error){stopError=' 分析停止状态尚未确认：'+error.message;}
   if(current?.id===c.project.id){planId=created.workflowId;view=null;renderKey='';await poll();}message('已停止后续应用与跑图，规划记录保留。'+stopError,!!stopError);return;}
  planId=created.workflowId;lastProject=c.project.id;autoRun=continuous;view=null;renderKey='';await poll();
 }
 async function stop(){executionTicket++;cancelled=true;autoRun=false;if(planId&&view?.status==='running')await api('/api/studio/plans/'+planId+'/cancel',{});message('停止请求已提交，已保存的分析结果保留。');}
 async function apply(continuous=false){
  if(!view||view.status!=='ready')return;const c=context(),ticket=executionTicket,requested=planId,projectId=view.projectId;if(projectId!==c.project?.id)throw Error('请切回方案所属项目后应用。');
  const result=await api('/api/studio/plans/'+requested+'/apply',{revision:c.project.revision});if(context().project?.id!==projectId)return;
  await onApplied(result);const loaded=await api('/api/studio/plans/'+requested);if(planId!==requested||context().project?.id!==projectId)return;view=loaded;render();
  if(continuous&&ticket!==executionTicket){message('方案已应用，连续跑图已停止。');notify('方案已应用，连续跑图已停止；新版本保留，可随时在工作流检查。');return;}
  const needed=view.items.flatMap(i=>i.needsInput||[]);
  if(continuous&&!needed.length){submitting=false;localBusy=false;controls();await onRun(view.options.photoIds,view.capacity.concurrency);notify('已按每张独立方案开始处理；失败步骤可从工作流继续。');}
  else notify(needed.length?'方案已应用，请先补齐主体蒙版或参考输入，再在工作流中运行。':'方案已应用为新版本，可在工作流中逐步运行，或连续处理。');
 }
 function render(){
  const signature=JSON.stringify(view);if(signature===renderKey){controls();return;}renderKey=signature;results.replaceChildren();if(!view){controls();return;}
  const title=node('h3',view.provider==='local'?'本机模型辅助方案':'ChatGPT规划方案'),link=node('a','完整规划记录');link.href='/workflows/?id='+view.workflowId;results.append(title,link);
  const counts=view.items.reduce((r,i)=>({ai:r.ai+i.report.aiSteps,local:r.local+i.report.localSteps}),{ai:0,local:0});
  results.append(node('p',view.decisionReason,'hint'),node('p',counts.ai+'个AI跑图步骤 · '+counts.local+'个本机步骤 · 建议同时处理'+view.capacity.concurrency+'张','hint'));
  for(const item of view.items){const article=node('section',null,'studio-planned-photo');article.append(node('h4',item.name),node('p',item.summary,'hint'));const list=node('ol');
   for(const stage of item.recipe.stages){const li=node('li');li.append(node('strong',stage.name),node('span',stage.type==='retouch'?' · AI跑图':' · 本机处理'));if(stage.type==='retouch'){const d=node('details');d.append(node('summary','查看本步提示词'),node('p',stage.options.prompt,'studio-plan-prompt'));li.append(d);}list.append(li);}article.append(list);
   article.append(node('p','分析模型：'+(item.analysis.resolvedModel||item.analysis.model||item.analysis.engine)+'；跑图模型：'+(item.recipe.model||'账号默认，实际模型随步骤记录'),'hint'));
   for(const warning of item.needsInput)article.append(node('p',warning,'hint error'));
   const draft=node('button','载入配方草稿');draft.type='button';draft.disabled=working||view.status==='running';draft.onclick=()=>{onRecipe(structuredClone(item.recipe));panel.open=false;notify('已载入该张配方草稿；修改后使用配方编辑器的“应用到所选照片”。原规划方案保留。');};article.append(draft);results.append(article);
  }
  const commands=node('div',null,'studio-actions');
  if(view.status==='ready'){for(const [id,title,run]of [['planner-apply','应用各张独立方案',false],['planner-apply-run','应用并连续处理',true]]){const b=node('button',title,run?'primary':null);b.id=id;b.type='button';b.disabled=working;b.onclick=()=>perform(()=>apply(run));commands.append(b);}message('方案已保存，规划本身没有生成图片。应用后可整组撤销。');}
  else if(['error','interrupted'].includes(view.status)){const b=node('button','从未完成的分析继续');b.id='planner-retry';b.type='button';b.onclick=()=>perform(async()=>{autoRun=false;await api('/api/studio/plans/'+planId+'/retry',{});await poll();});commands.append(b);message(view.steps.find(s=>['error','interrupted'].includes(s.status))?.message||'分析未完成，可从本步继续。',true);}
  else if(view.status==='running')message(view.steps.find(s=>s.status==='running')?.message||'正在分析照片，图片生成尚未开始…');
  else if(view.status==='applied')message('方案已应用。照片工作流保留每一步产物，运行与恢复请进入“工作流”面板。');
  results.append(commands);controls();
 }
 async function poll(){
  if(!planId||polling)return;polling=true;const requested=planId,projectId=context().project?.id;
  try{const loaded=await api('/api/studio/plans/'+requested);if(planId!==requested||context().project?.id!==projectId)return;view=loaded;render();
   if(view.status==='ready'&&autoRun){autoRun=false;if(working)await apply(true);else await perform(()=>apply(true));}
  }catch(error){autoRun=false;message(error.message,true);}finally{polling=false;}
 }
 let openedLink=false;
 function update(){const c=context();if(c.project?.id!==lastProject){executionTicket++;lastProject=c.project?.id;autoRun=false;view=null;planId=null;renderKey='';try{planId=lastProject?localStorage.getItem(key(lastProject)):null;}catch{}const params=new URLSearchParams(location.search);if(!openedLink&&lastProject&&params.get('project')===lastProject&&/^[a-f0-9-]{36}$/.test(params.get('plan')||'')){planId=params.get('plan');openedLink=true;panel.open=true;}render();if(planId)void poll();}controls();}
 setInterval(()=>{if(view?.status==='running'||planId&&!view)void poll();},1500);
 cancel.onclick=()=>{cancelled=true;autoRun=false;void stop().catch(error=>message(error.message,true));};
 update();return {update};
}
