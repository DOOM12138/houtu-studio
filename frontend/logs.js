const markup=`
 <div class="titlebar"><div><h2 class="logs-title">运行日志</h2><p>查看执行步骤、模型回执和失败原因；从关联工作流继续处理。</p></div><button id="logs-export" class="primary" type="button">导出脱敏日志 ZIP</button></div>
 <p class="hint logs-privacy">只记录必要的运行信息。导出不含照片、账号凭据、图片文件名、原始提示词和 AI 原始回复。旧版本未记录的日志不会补造。</p>
 <form id="logs-filters" class="logs-filters" aria-label="筛选日志">
  <label>级别<select id="logs-level" name="level"><option value="">全部级别</option><option value="error">错误</option><option value="warn">提醒</option><option value="info">信息</option></select></label>
  <label>类别<select id="logs-category" name="category"><option value="">全部类别</option><option value="workflow">工作流步骤</option><option value="agent">Agent 调度</option><option value="model">模型回执</option><option value="job">图片任务</option><option value="runtime">运行组件</option><option value="request">接口异常</option><option value="export">日志导出</option></select></label>
  <label>时间范围<select id="logs-hours" name="hours"><option value="1">最近 1 小时</option><option value="24" selected>最近 24 小时</option><option value="168">最近 7 天</option><option value="336">最近 14 天</option><option value="0">全部保留记录</option></select></label>
  <label>工作流编号<input id="logs-workflow" name="workflowId" type="text" autocomplete="off" placeholder="可从失败步骤进入" pattern="[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"></label>
  <label>查找运行信息<input id="logs-query" name="q" type="search" maxlength="100" placeholder="步骤、模型或错误码"></label>
  <div class="logs-filter-actions"><button type="submit">应用筛选</button><button id="logs-reset" type="button">重置</button></div>
 </form>
 <div class="logs-toolbar"><div><strong id="logs-count">正在读取…</strong><span id="logs-updated" class="hint"></span></div><div class="logs-actions"><label><input id="logs-auto" type="checkbox" checked>每 5 秒刷新</label><button id="logs-refresh" type="button">刷新</button></div></div>
 <p id="logs-status" role="status" aria-live="polite"></p><p id="logs-storage" class="hint"></p>
 <section id="logs-download" class="logs-download" aria-label="导出结果" hidden><h2>诊断包已就绪</h2><p id="logs-receipt"></p><a id="logs-save" download>下载日志包</a><details><summary>校验值与导出内容</summary><p class="hint">包含当前筛选的最近 1000 条日志、程序环境、文件校验清单；指定工作流时附带脱敏步骤摘要。保留最近 5 份导出包，48 小时后可被清理。</p><code id="logs-sha"></code></details></section>
 <section aria-label="日志记录"><ol id="logs-list" class="logs-list"></ol><div id="logs-empty" class="logs-empty" hidden><h2>当前没有匹配的日志</h2><p>可以扩大时间范围或重置筛选。新执行的步骤会自动记录。</p></div></section>
 <p class="hint logs-footer">运行记录自动轮转，磁盘上限约 10 MB；导出缓存最多 40 MB。修图不因日志写入失败而中断。查看和导出日志不调用模型。</p>
`;
const mounted=new WeakSet();
export function mountLogs(root,embedded=false){
if(!root||mounted.has(root))return;
mounted.add(root);
root.innerHTML=markup;
const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;},uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
if(!embedded){
try{document.documentElement.dataset.theme=localStorage.getItem('houtu-color-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');}catch{}
$('theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('houtu-color-theme',t);}catch{}};
}
let csrf='',reading=false,exporting=false,lastKey='',applied={hours:24},generation=0,receipt=null;
const initial=new URLSearchParams(location.search),workflow=initial.get('workflow')||initial.get('workflowId')||'',job=initial.get('job')||'';
if(uuid.test(workflow)){$('logs-workflow').value=workflow;applied.workflowId=workflow;applied.hours=0;$('logs-hours').value='0';}if(uuid.test(job))applied.jobId=job;
function replaceFilterURL(params=new URLSearchParams()){
 const url=new URL(location.href);
 url.search=params.toString();
 if(embedded)url.hash='logs';
 history.replaceState(null,'',url.href);
}
function workflowLink(id,step){
 const path='/workflows/?id='+encodeURIComponent(id)+(step?'#step-'+encodeURIComponent(step):'');
 return embedded?'/workbench/?'+new URLSearchParams({tool:path}):path;
}
const status=(text,error=false)=>{$('logs-status').textContent=text;$('logs-status').dataset.error=String(error);};
async function api(route,input){if(input!==undefined&&!csrf){const h=await fetch('/api/health');if(!h.ok)throw Error('本机服务未连接。');csrf=(await h.json()).csrf;}const r=await fetch(route,input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Paint-CSRF':csrf},body:JSON.stringify(input)}),data=await r.json();if(!r.ok)throw Error(data.error||'日志操作未完成。');return data;}
const LABELS={attempt:'第几次尝试',kind:'类型',status:'状态',step:'步骤',provider:'执行路线',policy:'硬件策略',role:'模型用途',requestedModel:'请求模型',resolvedModel:'实际主模型',model:'模型',engine:'执行引擎',reportedImageEngine:'返回绘图引擎',requestState:'请求状态',reasonCode:'原因码',operation:'操作',durationMs:'耗时(ms)',httpStatus:'HTTP',exitCode:'退出码',count:'数量',bytes:'字节',dedicatedBytes:'专用显存(字节)',ramBytes:'内存(字节)',binding:'设备绑定方式',vendorId:'GPU厂商编号',gpuChanged:'GPU已变更',gpuVerified:'GPU已验证',gpuMatched:'GPU匹配'};
function render(data){const key=JSON.stringify(data.entries);if(lastKey!==key){lastKey=key;const list=$('logs-list'),opened=new Set([...list.querySelectorAll('details[open]')].map(e=>e.dataset.id)),fragment=document.createDocumentFragment();for(const e of data.entries){const li=make('li',undefined,'log-entry');li.dataset.level=e.level;const head=make('div',undefined,'log-head'),time=make('time',new Date(e.time).toLocaleString());time.dateTime=new Date(e.time).toISOString();head.append(make('span',({info:'信息',warn:'提醒',error:'错误'})[e.level],'log-level'),make('h2',e.message),time);li.append(head);const meta=make('div',undefined,'log-meta');for(const [k,v]of Object.entries(e.data))if(LABELS[k])meta.append(make('span',LABELS[k]+'：'+String(v)));if(e.data.requestedModel&&!e.data.resolvedModel)meta.append(make('span','实际主模型：未收到回执'));li.append(meta);if(e.error)li.append(make('p',e.error.message+(e.error.code?' · '+e.error.code:''),'log-error'));const links=make('div',undefined,'log-links');if(e.data.workflowId){const a=make('a','查看关联工作流'+(e.data.step?' · '+e.data.step:''));a.href=workflowLink(e.data.workflowId,e.data.step);const filter=make('button','只看此工作流');filter.type='button';filter.onclick=()=>{$('logs-workflow').value=e.data.workflowId;$('logs-filters').requestSubmit();};links.append(a,filter);}if(e.data.parentWorkflowId){const a=make('a','查看上级流程');a.href=workflowLink(e.data.parentWorkflowId);links.append(a);}li.append(links);const details=make('details');details.dataset.id=e.id;details.open=opened.has(e.id);details.append(make('summary','运行元数据与安全调用位置'),make('pre',JSON.stringify({event:e.event,...e.data,...(e.error?{error:e.error}:{})},null,2)));li.append(details);fragment.append(li);}list.replaceChildren(fragment);}
 $('logs-empty').hidden=data.entries.length>0;$('logs-count').textContent=data.total+' 条匹配 · 显示最近 '+data.entries.length+' 条';$('logs-updated').textContent='更新于 '+new Date().toLocaleTimeString();$('logs-storage').textContent=(data.storage.warning||'本机日志自动轮转，最多 '+Math.round(data.storage.maxBytes/1024**2)+' MB。')+(data.skipped?' 已跳过 '+data.skipped+' 条不可读记录。':'');
}
async function refresh(){if(reading)return;reading=true;const version=generation;$('logs-refresh').disabled=true;try{const data=await api('/api/logs?'+new URLSearchParams({...applied,limit:200}));if(version===generation){render(data);status('');}}catch(e){status(e.message,true);}finally{reading=false;$('logs-refresh').disabled=false;if(version!==generation)void refresh();}}
$('logs-filters').onsubmit=e=>{e.preventDefault();const next=Object.fromEntries(new FormData(e.currentTarget));if(next.workflowId&&!uuid.test(next.workflowId)){status('请输入完整有效的工作流编号。',true);return;}applied=next;generation++;const params=new URLSearchParams();if(next.workflowId)params.set('workflow',next.workflowId);replaceFilterURL(params);void refresh();};
$('logs-reset').onclick=()=>{$('logs-filters').reset();applied={hours:24};generation++;replaceFilterURL();void refresh();};$('logs-refresh').onclick=()=>void refresh();
$('logs-export').onclick=async()=>{if(exporting)return;exporting=true;$('logs-export').disabled=true;status('正在生成当前筛选的脱敏日志包…');try{receipt=await api('/api/logs/export',applied);const a=$('logs-save');a.href=receipt.downloadUrl;a.download=receipt.name;$('logs-receipt').textContent=receipt.count+' 条日志 · '+Math.ceil(receipt.bytes/1024)+' KB · '+receipt.name;$('logs-sha').textContent='SHA-256: '+receipt.sha256;$('logs-download').hidden=false;status('日志包已生成，点击下载保存。');}catch(e){status(e.message,true);}finally{exporting=false;$('logs-export').disabled=false;}};
$('logs-save').onclick=e=>{if(window.houtuDocuments&&receipt){e.preventDefault();try{window.houtuDocuments.postMessage(JSON.stringify({type:'saveUrl',url:new URL(receipt.downloadUrl,location.origin).href,name:receipt.name,mime:'application/zip'}));status('请选择日志包的保存位置。');}catch{status('无法打开保存窗口，请稍后再试。',true);}}};
document.addEventListener('visibilitychange',()=>{if(!root.hidden&&!document.hidden&&$('logs-auto').checked)void refresh();});setInterval(()=>{if(!root.hidden&&!document.hidden&&$('logs-auto').checked)void refresh();},5000);void refresh();

}
const standalone=document.querySelector('main[data-log-panel]');
if(standalone)mountLogs(standalone);
