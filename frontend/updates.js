const $=id=>document.getElementById(id);
const activeStates=new Set(['downloading','verifying','extracting','waiting-for-stop','backing-up','applying','restarting']);
let state,busy=false,restarting=false,expectedVersion=null,pollTimer;
const size=n=>(n/1024/1024).toFixed(1)+' MB';
function message(text,error=false){$('updates-status').textContent=text;$('updates-status').classList.toggle('error',error);}
async function api(route,input){const init={signal:AbortSignal.timeout(45000)};if(input!==undefined){const h=await(await fetch('/api/health',{signal:AbortSignal.timeout(5000)})).json();Object.assign(init,{method:'POST',headers:{'Content-Type':'application/json','X-Paint-CSRF':h.csrf},body:JSON.stringify(input)});}const r=await fetch('/api/updates/'+route,init),value=await r.json();if(!r.ok)throw Error(value.error||'更新操作未完成，请重试。');return value;}
function render(value){
 state=value;const job=value.job,working=activeStates.has(job.status),ready=job.status==='ready'&&!restarting;
 $('updates-versions').textContent='当前版本 '+value.currentVersion+(value.latest?' · 最新稳定版 '+value.latest.version:'');
 if(!busy)$('updates-auto').checked=value.settings.autoCheck;$('updates-auto').disabled=busy||restarting;
 $('updates-check').disabled=busy||restarting;$('updates-check').textContent=busy?'正在处理…':'检查更新';
 $('updates-source').hidden=!value.sourceMode;
 $('updates-download').hidden=value.sourceMode||!value.installable||ready||working||restarting;
 $('updates-download').disabled=busy;$('updates-download').textContent=['error','interrupted'].includes(job.status)?'继续下载并校验':'下载并校验更新';
 $('updates-apply').hidden=value.sourceMode||!ready;$('updates-apply').disabled=busy;
 $('updates-rollback').hidden=!value.rollback||working||ready||restarting;$('updates-rollback').disabled=busy;
 if(value.rollback)$('updates-rollback').textContent='回退到 '+value.rollback.version;
 $('updates-release').href=value.latest?.url||value.releases;$('updates-notes').hidden=!value.latest?.notes;
 $('updates-notes-text').textContent=value.latest?.notes||'';
 const downloading=job.status==='downloading';$('updates-progress').hidden=!downloading;$('updates-bytes').hidden=!downloading;
 if(downloading){$('updates-progress').value=job.total?Math.min(100,job.bytes/job.total*100):0;$('updates-bytes').textContent=size(job.bytes)+' / '+size(job.total);}
 if(restarting&&value.currentVersion===expectedVersion&&!activeStates.has(job.status)){restarting=false;expectedVersion=null;message('版本切换完成，当前为 '+value.currentVersion+'。其他工作台页面可刷新后继续。');}
 else if(restarting&&['rolled-back','recovery-needed','error'].includes(job.status)){restarting=false;message(job.message+(job.error?' '+job.error:''),true);}
 else if(restarting)message('正在备份、切换程序并重启，请保持此页打开…');
 else if(working||ready||['rolled-back','recovery-needed','error','interrupted'].includes(job.status))message(job.message+(job.error?' '+job.error:''),['error','recovery-needed'].includes(job.status));
 else if(value.checkError)message('检查更新失败：'+value.checkError,true);
 else if(value.available)message('发现新版本 '+value.latest.version+(value.sourceMode?'，可查看说明后按 Git 流程更新。':value.installable?'，可以先下载，校验完成后再安装。':'，完整安装包尚未就绪，请稍后再检查。'));
 else message(value.lastChecked?'已经是最新稳定版。上次检查：'+new Date(value.lastChecked).toLocaleString('zh-CN'):'尚未检查公开版本。');
 schedule(working||restarting?1500:30000);
}
function schedule(ms){clearTimeout(pollTimer);pollTimer=setTimeout(refresh,ms);}
async function refresh(){if(busy){schedule(1500);return;}try{render(await api('status'));}catch(e){message(restarting?'网站正在重启，等待重新连接…':'暂时无法读取版本，请检查网站是否启动。',!restarting);schedule(restarting?1500:10000);}}
async function action(route,input={},restartVersion){if(busy)return;busy=true;if(state)render(state);try{if(restartVersion){restarting=true;expectedVersion=restartVersion;}render(await api(route,input));}catch(e){restarting=false;expectedVersion=null;message(e.message,true);}finally{busy=false;if(state){$('updates-check').disabled=false;$('updates-check').textContent='检查更新';$('updates-auto').disabled=restarting;$('updates-download').disabled=false;$('updates-apply').disabled=false;$('updates-rollback').disabled=false;}schedule(restarting?1000:4000);}}
if($('software-updates')){
 $('updates-check').onclick=()=>action('check');$('updates-download').onclick=()=>action('prepare');
 $('updates-auto').onchange=()=>action('settings',{autoCheck:$('updates-auto').checked});
 $('updates-apply').onclick=()=>{if(confirm('安装会重启网站。请先保存其他页面的修改，并完成或暂停正在运行的任务。现在安装？'))action('apply',{id:state.job.id},state.job.version);};
 $('updates-rollback').onclick=()=>{if(confirm('回退程序到 '+state.rollback.version+'？当前照片、账号和工作流数据会保留。'))action('rollback',{id:state.rollback.id},state.rollback.version);};
 refresh();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
}
