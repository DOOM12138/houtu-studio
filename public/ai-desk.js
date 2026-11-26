import {deskDefaults,deskGroups,deskTools,listOperation,moveOperation,stageOptions,missingInput,toolName} from './desk-controls.js';
import {sceneOptions} from './scene-options.js';
import {TARGET_POLICIES} from './target-policy.js';
import {MAX_IMAGE_UPLOAD_BYTES} from './upload-limits.js';

const names={auto:'全自动',semi:'半自动'};
const statuses={pending:'待执行',done:'已完成',running:'执行中',stale:'待重新执行',error:'需处理',interrupted:'已暂停'};
const keyFor=picture=>picture&&[picture.workflowId,picture.assetId,picture.stepId,picture.attemptId].join('/');
function el(tag,text,cls){
 const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;
}
function button(label,fn,cls,id){
 const b=el('button',label,cls);b.type='button';if(id)b.id=id;b.onclick=fn;return b;
}
function details(label,parent){
 const box=el('details');box.append(el('summary',label));parent.append(box);return box;
}
function select(label,values,current,onChange,parent){
 const field=el('label',label,'desk-field'),control=el('select');control.setAttribute('aria-label',label);
 for(const [id,text]of values)control.add(new Option(text,id));control.value=current;
 control.onchange=()=>onChange(control.value);field.append(control);parent.append(field);return control;
}
function check(label,value,change,parent){
 const l=el('label',undefined,'desk-check'),c=el('input');c.type='checkbox';c.checked=!!value;c.onchange=()=>change(c.checked);l.append(c,document.createTextNode(label));parent.append(l);return c;
}
async function readReference(file){
 if(file.size>MAX_IMAGE_UPLOAD_BYTES)throw Error('参考图超过 100 MB。');
 const image=await createImageBitmap(file);
 try{
  const factor=Math.min(1,1200/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*factor));canvas.height=Math.max(1,Math.round(image.height*factor));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
 }finally{image.close();}
}
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('文件读取失败。'));r.readAsDataURL(file);});}
function numberField(parent,name,min,max,value,change){
 const label=el('label',name,'desk-field'),input=el('input');input.type='number';input.min=min;input.max=max;input.value=value;input.oninput=()=>change(input.value===''?NaN:Number(input.value));label.append(input);parent.append(label);
}
function parameters(parent,id,p,onDirty){
 const tool=deskTools.get(id);if(!tool)return;
 const set=(k,v)=>{p[k]=v;onDirty();};
 if(tool.needsTarget){const l=el('label','处理部位或物品','desk-field'),input=el('input');input.maxLength=500;input.value=p.target||'';input.oninput=()=>set('target',input.value);l.append(input);parent.append(l);}
 if(tool.referenceRole){
  const l=el('label','本步参考图片（最多 5 张）','desk-field'),input=el('input'),count=el('small',(p.references?.length||0)+' 张已就绪');
  input.type='file';input.multiple=true;input.accept='image/png,image/jpeg,image/webp';
  input.onchange=async()=>{
   const files=[...input.files],token=Symbol();p.readToken=token;p.reading=true;p.readError='';onDirty();
   try{if(files.length>5)throw Error('最多选择 5 张参考图。');const found=[];
    for(const f of files)found.push({role:tool.referenceRole,title:f.name,image:await readReference(f)});
    if(p.readToken!==token)return;p.references=found;count.textContent=found.length+' 张已就绪';
   }catch(e){if(p.readToken===token){p.references=[];p.readError=e.message;count.textContent=e.message;}}
   finally{if(p.readToken===token){p.reading=false;onDirty();}}
  };l.append(input,count);parent.append(l);
 }
 const group=details('本步参数',parent);
 if(id==='smooth-belly'||['anime','cos'].includes(tool.style)||tool.extended)
  numberField(group,'调整程度 1–10',1,10,p.level??2,v=>set('level',v));
 if(tool.output==='outpaint'){
  numberField(group,'扩展比例 %',5,50,p.padding??20,v=>set('padding',v));
  select('扩展方向',[['all','四周'],['left','左侧'],['right','右侧'],['top','上方'],['bottom','下方']],p.direction||'all',v=>set('direction',v),group);
 }
 if(tool.output==='upscale')select('目标长边',[1024,2048,4096,8192].map(x=>[String(x),x+' px']),String(p.longEdge||4096),v=>set('longEdge',Number(v)),group);
 const scene=sceneOptions({},id);
 if(scene){
  check('保护主体',p.protectSubject??scene.protectSubject,v=>set('protectSubject',v),group);
  const l=el('label','可选保护蒙版（黑色保留主体）','desk-field'),input=el('input'),state=el('small',p.protectionMask?'已载入蒙版':'默认从本步输入分析');
  input.type='file';input.accept='image/png';input.onchange=async()=>{const f=input.files[0],token=Symbol();p.maskToken=token;p.maskReading=true;p.maskError='';onDirty();
   try{if(f&&f.size>MAX_IMAGE_UPLOAD_BYTES)throw Error('蒙版超过100 MB。');const data=f?await fileData(f):null;if(token!==p.maskToken)return;p.protectionMask=data;state.textContent=data?'已载入蒙版':'默认从本步输入分析';}
   catch(e){if(token===p.maskToken){p.protectionMask=null;p.maskError=e.message;state.textContent=e.message;}}
   finally{if(token===p.maskToken){p.maskReading=false;onDirty();}}
  };l.append(input,state);group.append(l);
 }else if(TARGET_POLICIES[id])check('自动限制到所选部位',p.autoTarget!==false,v=>set('autoTarget',v),group);
 const l=el('label',id==='custom'?'完整提示词':'补充要求','desk-field'),text=el('textarea');text.rows=2;text.maxLength=3000;text.value=p.prompt||'';text.oninput=()=>set('prompt',text.value);l.append(text);group.append(l);
 if(id==='custom')group.open=true;
}

export function createAiDesk(host){
 const {mount}=host;
 const root=el('section',undefined,'ai-mode-desk');root.setAttribute('aria-label','AI 修图方式');mount.prepend(root);
 const tabs=el('div',undefined,'ai-mode-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','处理方式');
 const pane=el('div',undefined,'ai-mode-body');pane.id='desk-mode-panel';pane.setAttribute('role','tabpanel');
 const message=el('p','','desk-notice');message.setAttribute('role','status');
 const dataArea=el('div'),progress=el('div'),submit=button('',()=>act(main),'desk-start','desk-start');
 const scroll=el('div',undefined,'desk-scroll'),footer=el('div',undefined,'desk-foot');
 const other=el('div',undefined,'desk-actions'),legacy=el('div',undefined,'desk-classic-actions');
 const old=button('单项精修工具',()=>{if(!locked)host.classic?.();});if(host.classic)legacy.append(old);
 scroll.append(dataArea,progress,other);if(host.classic)scroll.append(legacy);footer.append(message,submit);pane.append(scroll,footer);root.append(tabs,pane);
 let mode='auto',epoch=0,boundKey='',draft=deskDefaults(),runs={auto:null,semi:null},active=false,locked=false,scopePicker=null;
 let notice='',adopted=null,paintedKey='',timer=null,polling=false,shownState='',readyToRecover=null;
 let pendingPreparations={auto:null,semi:null};
 const models={plan:host.planningModel||null,image:host.generationModel||null};
 const modeButtons={};const chosen=()=>runs[mode];const stateAt=id=>draft.parameters[id]||(draft.parameters[id]={});
 function tell(s){notice=s;message.textContent=s;}
 function persist(){
  if(!boundKey)return;
  try{
   const params=Object.fromEntries(Object.entries(draft.parameters).map(([id,p])=>[id,Object.fromEntries(Object.entries(p).filter(([key,v])=>!['references','protectionMask','readToken','maskToken','reading','maskReading','maskError','readError'].includes(key)&&typeof v!=='symbol'))]));
   const data={mode,draft:{...draft,parameters:params},ids:{auto:runs.auto?.id||readyToRecover?.auto||null,semi:runs.semi?.id||readyToRecover?.semi||null},pending:pendingPreparations};
   sessionStorage.setItem('houtu-desk:'+boundKey,JSON.stringify(data));
  }catch{}
 }
 function restorePointer(run){
  const u=new URL(location.href);if(run)u.searchParams.set('deskRun',run.id);else u.searchParams.delete('deskRun');
  if(u.href!==location.href)history.replaceState(null,'',u);
 }
 function stopTimer(){clearTimeout(timer);timer=null;}
 const executing=run=>!!run&&(run.busy||['running','pausing'].includes(run.queue));
 const otherMode=()=>mode==='auto'?'semi':'auto';
 function armPoll(){stopTimer();if(active&&(executing(chosen())||executing(runs[otherMode()])))timer=setTimeout(()=>poll().catch(()=>{}),900);}
 async function poll(){
  if(polling||!active)return;
  const key=epoch,m=executing(runs[otherMode()])&&!executing(chosen())?otherMode():mode,id=runs[m]?.id;if(!id)return;polling=true;
  try{const view=await host.api('/api/studio/ai-runs/'+id);if(key===epoch&&runs[m]?.id===id){if(mode===m)accept(view,false);else{runs[m]=view;sync();}}}
  catch(error){if(key===epoch&&mode===m)tell('暂未读到进度，点击“刷新状态”可重查。');}
  finally{polling=false;armPoll();}
 }
 function picture(pic,explicit=false){
  if(!pic||!active)return;
  const key=keyFor(pic);if(explicit||paintedKey!==key){host.showPicture(pic,chosen(),explicit);paintedKey=key;}
  adopted=pic;
 }
 function accept(run,force){
  runs[mode]=run;host.remember?.(mode,run.id);persist();if(!active)return;
  restorePointer(run);
  const nextKey=JSON.stringify([run.id,run.revision,run.queue,run.busy,run.message,run.agent?.steps.map(s=>s.status)]);
  if(force||shownState!==nextKey){
   shownState=nextKey;render();
   if(run.result)picture(run.result);
   if(run.mode==='auto'&&run.agent?.steps){const last=[...run.agent.steps].reverse().find(s=>s.status==='done'&&s.picture&&['clean','person','color','effects','deliver','repair','upscale'].includes(s.id));if(!run.done&&last)picture(last.picture);}
  }
  armPoll();
 }
 function currentStep(){return chosen()?.steps.find(s=>s.id===chosen().next);}
 function inputProblem(){
  if(mode==='auto'&&!chosen()&&draft.auto.paint&&(!Number.isInteger(draft.auto.paintLevel)||draft.auto.paintLevel<1||draft.auto.paintLevel>10))return '厚涂程度需要 1–10 的整数。';
  const op=currentStep()?.operation||(!chosen()&&mode==='semi'?draft.operations[0]:null);
  if(!op)return '';const p=stateAt(op);
  if(p.reading||p.maskReading)return '正在准备本步输入…';
  if(p.readError||p.maskError)return p.readError||p.maskError;
  if(currentStep()?.inputsFrozen)return '';
  if(op==='custom'&&!p.prompt?.trim())return '请填写自定义提示词。';
  if(p.level!==undefined&&(!Number.isInteger(p.level)||p.level<1||p.level>10))return '程度需要 1–10 的整数。';
  if(p.padding!==undefined&&(!Number.isInteger(p.padding)||p.padding<5||p.padding>50))return '扩展比例需要 5–50 的整数。';
  return missingInput(op,p);
 }
 function sync(){
  const run=chosen(),step=currentStep(),busy=!!run?.busy,problem=inputProblem(),h=host.state();
  for(const m of ['auto','semi']){modeButtons[m].setAttribute('aria-selected',String(mode===m));modeButtons[m].tabIndex=mode===m?0:-1;modeButtons[m].disabled=locked;}
  pane.setAttribute('aria-labelledby',modeButtons[mode].id);
  const otherBusy=executing(runs[otherMode()]);
  const unavailable=locked||!h.hasPhoto||!h.signedIn||h.validModel===false||h.busy||busy||otherBusy||run&&!run.current||(!run&&mode==='semi'&&!draft.operations.length)||Boolean(problem);
  submit.disabled=Boolean(unavailable);submit.hidden=!!run?.done;
  const label=step?.name||(mode==='semi'?toolName(draft.operations[0])||'所选功能':'');
  submit.textContent=locked?'正在提交…':busy?'正在处理…':!h.hasPhoto?'先导入照片':!h.signedIn?'请先登录 ChatGPT':mode==='auto'?(run?'继续全自动':'开始全自动'):(run?'执行下一步':'开始第一步')+(label?' · '+label:'');
  if(!notice)message.textContent=problem||(otherBusy?names[otherMode()]+'正在运行，可先选功能，完成后再开始。':h.validModel===false?'所选模型暂不可用，请在模型设置中重新选择。':run&&!run.current?'此照片已切换版本，可以查看已保存结果。':'');
  old.disabled=locked;dataArea.inert=locked||busy;
  signInButton.hidden=!host.login||!!h.signedIn;
  signInButton.disabled=locked;
 }
 function changeMode(to){
  if(locked||to===mode&&active)return;
  stopTimer();epoch++;mode=to;active=true;shownState='';notice='';host.setClassic(false);
  restorePointer(chosen());
  persist();render();if(chosen()||executing(runs[otherMode()]))void poll();else if(boundKey)void loadSaved(mode);armPoll();
 }
 for(const m of ['auto','semi']){
  const b=button(names[m],()=>changeMode(m),undefined,'desk-mode-'+m);b.setAttribute('role','tab');b.setAttribute('aria-controls',pane.id);
  b.onkeydown=e=>{let next;if(e.key==='Home')next='auto';else if(e.key==='End')next='semi';else if(e.key==='ArrowRight'||e.key==='ArrowLeft')next=m==='auto'?'semi':'auto';if(next){e.preventDefault();changeMode(next);modeButtons[next].focus();}};
  modeButtons[m]=b;tabs.append(b);
 }
 function automatic(){
  dataArea.append(el('h3','按场景自动精修'),el('p','分析场景、寻找参考、修人物、调色并检查成片。'));
  const p=draft.auto;
  check('加入厚涂',p.paint,v=>{p.paint=v;persist();render();},dataArea).id='desk-auto-paint';
  if(p.paint)numberField(dataArea,'厚涂程度 1–10',1,10,p.paintLevel,v=>{p.paintLevel=v;persist();sync();});
  check('加入小特效',p.effects,v=>{p.effects=v;persist();render();},dataArea).id='desk-auto-effects';
  if(p.effects)select('特效',[['sparkles','微光粒子'],['rim','暖色轮廓光'],['mist','薄雾'],['snow','飘雪'],['rain','雨丝'],['bokeh','光斑'],['petals','花瓣']],p.effect,v=>{p.effect=v;persist();},dataArea);
 }
 function catalog(){
  dataArea.append(el('h3','勾选要做的功能'),el('p','按勾选顺序执行。每一步完成后，先看成片，再决定是否继续。'));
  const s=el('input');s.type='search';s.id='desk-search';s.value=draft.query||'';s.placeholder='找功能，如 灯架、扩图';s.setAttribute('aria-label','搜索已有修图功能');
  const list=el('div',undefined,'desk-list'),selected=el('ol',undefined,'desk-sequence'),settings=el('div');
  dataArea.append(s,list,selected,settings);
  function options(){
   const q=s.value.trim().toLowerCase();list.replaceChildren();let count=0;
   for(const group of deskGroups){
    const tools=[...deskTools.values()].filter(t=>t.group===group&&(!q||(t.name+' '+t.short+' '+t.group+' '+t.id).toLowerCase().includes(q)));
    if(!tools.length)continue;count+=tools.length;const category=details(group+' · '+tools.length,list);
    category.open=!!q||scopePicker===group;category.ontoggle=()=>{if(category.open&&!q)scopePicker=group;};
    for(const t of tools){const c=check(t.name,draft.operations.includes(t.id),v=>{
      draft.operations=listOperation(draft.operations,t.id,v);if(v&&!focusTool)focusTool=t.id;
      if(!draft.operations.includes(focusTool))focusTool=draft.operations[0]||null;
      persist();queue();sync();tell('');
    },category);c.dataset.operationChoice=t.id;}
   }
   if(!count)list.append(el('p','没有找到这个功能。'));
  }
  let focusTool=draft.operations.includes(draft.focusTool)?draft.focusTool:draft.operations[0]||null;
  function queue(){
   draft.focusTool=focusTool;
   selected.replaceChildren();settings.replaceChildren();
   draft.operations.forEach((id,i)=>{
    const li=el('li'),b=button((i+1)+'. '+toolName(id),()=>{focusTool=id;queue();},'step-label');b.setAttribute('aria-pressed',String(id===focusTool));
    const up=button('↑',()=>reorder(-1)),down=button('↓',()=>reorder(1)),remove=button('移除',()=>{draft.operations=listOperation(draft.operations,id,false);if(focusTool===id)focusTool=draft.operations[0]||null;const box=list.querySelector('[data-operation-choice="'+id+'"]');if(box)box.checked=false;queue();persist();sync();});
    up.disabled=i===0;down.disabled=i===draft.operations.length-1;up.setAttribute('aria-label','上移'+toolName(id));down.setAttribute('aria-label','下移'+toolName(id));
    function reorder(offset){draft.operations=moveOperation(draft.operations,id,offset);persist();queue();sync();}
    li.append(b,up,down,remove);selected.append(li);
   });
   if(focusTool){settings.append(el('h3',toolName(focusTool)));parameters(settings,focusTool,stateAt(focusTool),()=>{tell('');persist();sync();});}
  }
  s.oninput=()=>{draft.query=s.value;options();};options();queue();
 }
 function render(){
  pane.hidden=!active;root.classList.toggle('desk-idle',!active);
  dataArea.replaceChildren();progress.replaceChildren();other.replaceChildren();message.textContent=notice;
  const run=chosen();
  if(!run){
   if(mode==='auto')automatic();else catalog();
   const model=active?host.modelElement?.():null;if(model)dataArea.append(model);
  }else{
   const next=currentStep();
   progress.append(el('h3',run.done?'已完成':names[mode]+'进度'));
   const steps=run.agent?.steps||run.steps;const list=el('ol',undefined,'desk-progress');
   for(const s of steps){
    const li=el('li'),label=el('span',s.name,'step-label');li.dataset.deskStep=s.id;if(s.id===run.next||s.status==='running')li.setAttribute('aria-current','step');
    li.append(label,el('small',s.skipped?'已跳过':statuses[s.status]||s.status));if(s.picture&&s.status==='done'){const b=button('查看',()=>{picture(s.picture,true);tell('正在查看：'+s.name);});b.setAttribute('aria-label','查看'+s.name);li.append(b);}
    if(s.child&&['error','interrupted'].includes(s.status)){const link=el('a','处理此步');link.href='/workflows/?id='+s.child;li.append(link);}
    list.append(li);
   }
   const edits=run.steps.filter(s=>s.type==='retouch');
   if(edits.length){const done=edits.filter(s=>s.status==='done').length;progress.append(el('p','已完成 '+done+' / '+edits.length+' 项修图'));}
   if(steps.length>5){const more=details('查看全部 '+steps.length+' 个步骤',progress);more.open=!!draft.expandedProgress;more.ontoggle=()=>{draft.expandedProgress=more.open;};more.append(list);}else progress.append(list);
   if(next?.operation&&!run.busy){
    const configBox=el('div');progress.append(configBox);configBox.append(el('h3','下一步 · '+next.name));
    if(next.inputsFrozen)configBox.append(el('p','已有提交记录。继续会核对原请求，修改参数请另开一轮。'));
    else parameters(configBox,next.operation,stateAt(next.operation),()=>{tell('');persist();sync();});
   }
   if(run.message&&!notice)progress.append(el('p',run.message));
   if(next?.type==='retouch'&&!run.busy&&!next.inputsFrozen&&run.current)other.append(button('跳过本项',()=>act(async guard=>{const v=await host.api('/api/studio/ai-runs/'+run.id+'/next',{decision:'skip',workflowId:run.workflowId,step:next.id,revision:run.revision});if(guard())accept(v,true);}),'','desk-skip'));
   if(run.busy)other.append(button('停止当前任务',()=>act(async guard=>{const v=await host.api('/api/studio/ai-runs/'+run.id+'/cancel',{workflowId:run.workflowId});if(guard())accept(v,true);}),'','desk-stop'));
   if(run.busy)other.append(button('本步后暂停',()=>act(async guard=>{const v=await host.api('/api/studio/ai-runs/'+run.id+'/pause',{});if(guard())accept(v,true);})));
   other.append(button('刷新状态',()=>poll()));
   const a=el('a','完整工作流');a.href='/workflows/?id='+run.workflowId;other.append(a);
   if(run.agent&&(run.queue==='paused'||run.queue==='error')){const g=el('a','检查蒙版或确认质量');g.href='/studio/?project='+run.id+'&photo='+run.photoId+'&agent='+run.agent.id;other.append(g);}
   if(!run.busy)other.append(button('另开一轮',()=>{
    runs[mode]=null;readyToRecover&&delete readyToRecover[mode];pendingPreparations[mode]=null;host.remember?.(mode,null);restorePointer(null);adopted=adopted||run.result;shownState='';tell('新一轮将使用当前查看的图片。');persist();render();
   }));
  }
  sync();
 }
 async function act(fn){
  if(locked||!active)return;locked=true;tell('');sync();const key=epoch,guard=()=>key===epoch&&active;
  try{await fn(guard);}catch(e){if(guard())tell(e.message||'本机连接暂时中断，请刷新进度。');}
  finally{if(key===epoch){locked=false;sync();armPoll();}}
 }
 async function main(guard){
  if(executing(runs[otherMode()]))throw Error('另一模式仍在运行，请先等本步结束。');
  const p=inputProblem();if(p)throw Error(p);let run=chosen();
  if(!run){
   const source=host.pinDisplayed?await host.pinDisplayed():adopted||await host.pin();
   if(!guard())return;
   if(!boundKey)boundKey=keyFor(source);
   const intent={mode,source,name:host.state().name,model:host.state().model||models.image,operations:[...draft.operations],auto:{...draft.auto}};
   const signature=JSON.stringify(intent);
   const previous=pendingPreparations[mode];
   if(previous&&previous.signature!==signature)throw Error('上次准备回执未知，请先恢复原设置或打开工作流。');
   const key=previous?.key||crypto.randomUUID();pendingPreparations[mode]={key,signature};persist();
   try{run=await host.api('/api/studio/ai-runs',{...intent,requestKey:key});}catch(error){if(error.status&&error.status<500){pendingPreparations[mode]=null;persist();}throw error;}
   if(!guard())return;
   boundKey||=keyFor(run.origin);readyToRecover||={};readyToRecover[mode]=run.id;
   pendingPreparations[mode]=null;accept(run,true);
  }
  const step=run.steps.find(s=>s.id===run.next);if(!step||run.busy)return;
  const params=step.operation?stateAt(step.operation):{};
  const request={step:step.id,revision:run.revision,workflowId:run.workflowId,...(step.operation?{options:stageOptions(step.operation,params),references:params.references||[],...(params.protectionMask?{protectionMask:params.protectionMask}:{})}:{})};
  try{const next=await host.api('/api/studio/ai-runs/'+run.id+'/next',request);if(guard())accept(next,true);}
  catch(error){if(guard()){try{accept(await host.api('/api/studio/ai-runs/'+run.id),true);}catch{} }throw error;}
 }
 async function loadSaved(m){
  const id=readyToRecover?.[m];if(!id||runs[m]||!active)return;
  const t=epoch;try{const run=await host.api('/api/studio/ai-runs/'+id);if(t===epoch&&mode===m&&(host.owns?host.owns(run.origin):(!boundKey||keyFor(run.origin)===boundKey)))accept(run,true);}
  catch(e){if(t===epoch)tell(e.message);}
 }
 function sourceChanged(ref,documentKey){
  ++epoch;locked=false;stopTimer();runs={auto:null,semi:null};pendingPreparations={auto:null,semi:null};readyToRecover=null;draft=deskDefaults();boundKey=documentKey||keyFor(ref)||'';adopted=null;paintedKey='';notice='';shownState='';
  try{const raw=boundKey&&JSON.parse(sessionStorage.getItem('houtu-desk:'+boundKey));if(raw){draft=raw.draft||draft;mode=names[raw.mode]?raw.mode:mode;readyToRecover=raw.ids;pendingPreparations=raw.pending||pendingPreparations;}}catch{}
  const saved=host.savedRuns?.();if(saved)readyToRecover={...readyToRecover,...saved};
  render();if(active&&boundKey)void loadSaved(mode);
 }
 function deactivate(){active=false;epoch++;locked=false;paintedKey='';stopTimer();pane.hidden=true;for(const b of Object.values(modeButtons)){b.setAttribute('aria-selected','false');b.tabIndex=0;}}
 function open(m=mode){changeMode(m);}
 function restoreRun(run,key){sourceChanged(run.origin,key);mode=run.mode;active=true;host.setClassic(false);accept(run,true);}
 function suspend(){if(active)deactivate();}
 function search(term){open('semi');const input=dataArea.querySelector('#desk-search');if(input){input.value=term;input.dispatchEvent(new Event('input'));input.focus();}}
 const signInButton=button('登录 ChatGPT',()=>host.login?.(),'outline','desk-login');footer.insertBefore(signInButton,submit);
 render();return {open,deactivate,suspend,search,sourceChanged,restoreRun,sync,picture:()=>adopted,active:()=>active,locked:()=>locked};
}
