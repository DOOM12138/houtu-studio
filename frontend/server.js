const $=id=>document.getElementById(id),mobile=document.documentElement.dataset.platform==='android';
let page=1,total=0,requestId=0,timer;
const names={'manual-portrait':'人物手动修图',pipeline:'照片配方',retouch:'AI 人物精修',color:'调色成品',creative:'特效与合成'};
const date=value=>value?new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未记录';
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'记录暂时无法读取，请重试。');return data;}
function notice(text,error=false){$('server-notice').textContent=text;$('server-notice').classList.toggle('error',error);}
function text(tag,value,className){const element=document.createElement(tag);element.textContent=value;if(className)element.className=className;return element;}
const cacheSize=bytes=>bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':Math.ceil(bytes/1024)+' KB';
$('cache-clear').onclick=async()=>{
 const button=$('cache-clear'),line=$('cache-result');button.disabled=true;line.textContent='正在读取缓存大小…';
 try{
  const info=await get('/api/server/cache');
  if(!info.count){line.textContent='当前没有缩略图缓存。';return;}
  if(!confirm('清除 '+info.count+' 个缩略图缓存（'+cacheSize(info.bytes)+'）？')){line.textContent='已取消。';return;}
  const result=await post('/api/server/cache/clear');
  line.textContent='已清除 '+result.count+' 个，释放 '+cacheSize(result.bytes)+(result.skipped?'；'+result.skipped+' 个文件未能清除，可稍后重试。':'。');
 }catch(error){line.textContent=error.message;}finally{button.disabled=false;}
};
async function loadStatus(){
 const info=await get('/api/server/status'),current=info.current;
 $('server-current').textContent=current.status==='signedIn'?(current.account?'已登录 · '+current.account.email+' · '+current.account.plan:'已登录 · 客户端未返回账号标识'):current.status==='signedOut'?'ChatGPT 尚未登录，图片档案仍可查看':'账号状态待确认，已有记录仍保留';
 $('server-info').replaceChildren();
 for(const [label,value]of [[mobile?'手机':'电脑',mobile?'本机独立运行':info.machine],['版本',info.version],['数据目录',info.dataRoot],['本机授权目录',info.loginRoot],['本次启动',date(info.startedAt)],['资料库建立',date(info.created)],['访问范围',mobile?'仅本手机 · 127.0.0.1':'仅此电脑 · 127.0.0.1']])$('server-info').append(text('dt',label),text('dd',value));
 const selected=$('archive-account').value;$('archive-account').replaceChildren(new Option('全部账号',''),new Option('未记录账号','unknown'));$('server-account-list').replaceChildren();$('server-account-count').textContent=info.accounts.length+' 个';
 for(const account of info.accounts){
  $('archive-account').append(new Option(account.email,account.id));const row=document.createElement('article');row.className='server-account';row.append(text('h3',account.email));
  const live=current.status==='signedIn'&&current.account?.id===account.id;row.append(text('p',(live?'当前登录':'历史记录')+' · '+account.plan+' · 关联 '+account.images+' 个产出版本','hint'));
  row.append(text('p','首次记录：'+date(account.firstSeen)+'\n最近确认：'+date(live?current.checkedAt:account.lastSeen),'hint'));$('server-account-list').append(row);
 }
 if(!info.accounts.length)$('server-account-list').append(text('p','还没有已确认的账号记录。登录并由本站客户端确认后，会自动建立档案。','hint'));
 if([...$('archive-account').options].some(option=>option.value===selected))$('archive-account').value=selected;
}
function editDestination(route){
 const url=new URL(route,location.origin);
 if(url.origin!==location.origin)return null;
 if(!/^\/(?:ai|portrait|workflows)\/?$/.test(url.pathname))return null;
 return '/workbench/?'+new URLSearchParams({tool:url.pathname+url.search+url.hash});
}
async function loadImages(){
 $('archive-prev').disabled=true;$('archive-next').disabled=true;
 const token=++requestId,query=new URLSearchParams({page:String(page),q:$('archive-query').value,kind:$('archive-kind').value,account:$('archive-account').value});
 const data=await get('/api/server/images?'+query);if(token!==requestId)return;total=data.total;
 $('server-image-count').textContent='已归档 '+data.totalAll+' 个产出版本 · 当前筛选 '+data.total+' 个';$('server-images').replaceChildren();$('server-empty').hidden=Boolean(data.images.length);
 for(const record of data.images){
  const card=document.createElement('article');card.className='server-image-card';const frame=document.createElement('a');frame.className='server-image-frame';frame.href=record.imageUrl;frame.target='_blank';frame.rel='noopener';frame.setAttribute('aria-label','查看 '+record.name+' 第'+record.version+'版');
  const image=document.createElement('img');image.src=record.thumbnailUrl;image.alt=record.name+' · 第'+record.version+'版';image.loading='lazy';image.decoding='async';image.onerror=()=>{image.hidden=true;frame.append(text('span','预览暂不可用，原始记录仍保留。'));};frame.append(image);card.append(frame);
  card.append(text('h3',record.name+' · 第'+record.version+'版'),text('p',names[record.kind]+' · '+date(record.created)+(record.status==='waiting'?' · 等待交付':''),'hint'));
  card.append(text('p',record.account?(record.accountRole==='analysis'?'关联分析账号：':'修图账号：')+record.account.email:['color','manual-portrait'].includes(record.kind)?'本机处理 · 未关联ChatGPT账号':'未记录账号','server-image-account'));
  if(record.model)card.append(text('p',(record.accountRole==='analysis'?'分析模型：':'主模型：')+record.model,'hint'));
  const actions=document.createElement('div');actions.className='server-image-actions';for(const [label,url]of [['继续精修',record.editUrl],['下载成品',record.downloadUrl],['步骤记录',record.workflowUrl]])if(url){const link=text('a',label);link.href=location.pathname.startsWith('/settings')&&label!=='下载成品'?editDestination(url)||'/workbench/':url;actions.append(link);}card.append(actions);$('server-images').append(card);
 }
 const pages=Math.max(1,Math.ceil(total/data.pageSize));$('archive-pages').hidden=pages<=1;$('archive-prev').disabled=page<=1;$('archive-next').disabled=page>=pages;$('archive-page-label').textContent='第 '+page+' / '+pages+' 页';
}
async function refresh(){const button=$('refresh-server');button.disabled=true;notice('正在刷新服务器档案…');const results=await Promise.allSettled([loadStatus(),loadImages()]);const failed=results.find(result=>result.status==='rejected');notice(failed?failed.reason.message:'已刷新图片和账号记录。',Boolean(failed));button.disabled=false;}
$('refresh-server').onclick=refresh;
$('archive-query').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;loadImages().catch(error=>notice(error.message,true));},300);};
for(const id of ['archive-kind','archive-account'])$(id).onchange=()=>{page=1;loadImages().catch(error=>notice(error.message,true));};
$('archive-prev').onclick=()=>{if(page<=1)return;page--;loadImages().catch(error=>notice(error.message,true));};$('archive-next').onclick=()=>{if(page*24>=total)return;page++;loadImages().catch(error=>notice(error.message,true));};
try{document.documentElement.dataset.theme=localStorage.getItem('houtu-theme')||'light';}catch{}
$('theme').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('houtu-theme',next);}catch{}};
if(matchMedia('(max-width:700px)').matches)for(const id of ['server-storage','server-accounts'])$(id).open=false;
const sections = new Map([
 ['accounts', $('accounts')], ['storage', $('storage')], ['software-updates', $('settings-update-panel')],
 ['logs', $('logs')], ['help', $('help')]
]);
let loadedStorage=false,loadedAccount=false,models,authBusy=false,authTimer;
function authNotice(message,failed=false){
 $('settings-auth-status').textContent=message;
 $('settings-auth-status').classList.toggle('settings-error',failed);
}
async function post(route){
 const health=await get('/api/health');
 const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-Paint-CSRF':health.csrf},body:'{}'});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'账号操作未完成，请重试。');
 return data;
}
async function accountState(){
 const state=await get('/api/state');
 $('settings-login').hidden=Boolean(state.account);
 $('settings-login').textContent=state.loginPending?'继续登录 ChatGPT':'登录 ChatGPT';
 $('settings-logout').hidden=!state.account;
 if(state.account||!state.loginPending){
  clearTimeout(authTimer);
  $('settings-auth-link').hidden=true;
  $('settings-auth-link').removeAttribute('href');
 }
 if(state.loginError||state.serviceError)authNotice(state.loginError||state.serviceError,true);
 return state;
}
async function waitForLogin(){
 try{
  const state=await accountState();
  if(state.account){
   await loadStatus();
   await models?.reload();
   authNotice('ChatGPT 已连接。');
   return;
  }
  if(!state.loginPending)return;
 }catch(error){authNotice(error.message,true);}
 authTimer=setTimeout(waitForLogin,3000);
}
$('settings-login').onclick=async()=>{
 if(authBusy)return;
 authBusy=true;
 $('settings-login').disabled=true;
 const native=Boolean(window.houtuDocuments||window.chrome?.webview);
 const popup=native?null:window.open('about:blank','_blank');
 try{
  const data=await post('/api/login'),url=new URL(data.authUrl);
  if(url.origin!=='https://auth.openai.com')throw Error('官方登录地址校验失败。');
  const link=$('settings-auth-link');
  link.href=url.href;
  link.hidden=false;
  if(popup){
   popup.opener=null;
   popup.location.replace(url.href);
  }else if(native)window.open(url.href,'_blank');
  authNotice('请在 OpenAI 官方页面完成登录，再回到这里。');
  clearTimeout(authTimer);
  authTimer=setTimeout(waitForLogin,1500);
 }catch(error){popup?.close();authNotice(error.message,true);}
 finally{$('settings-login').disabled=false;authBusy=false;}
};
$('settings-logout').onclick=async()=>{
 if(authBusy)return;
 authBusy=true;
 $('settings-logout').disabled=true;
 try{
  await post('/api/logout');
  await Promise.all([accountState(),loadStatus(),models?.reload()]);
  authNotice('已退出本机的 ChatGPT 连接。');
 }catch(error){authNotice(error.message,true);}
 finally{$('settings-logout').disabled=false;authBusy=false;}
};
function nativeUpdate(type){
 if(!window.houtuDocuments)return;
 window.houtuDocuments.postMessage(JSON.stringify({type}));
}
window.addEventListener('houtu:update-status',event=>{
 const value=event.detail;
 if(!value?.currentVersion)return;
 $('settings-android-version').textContent='当前版本 '+value.currentVersion+
  (value.available&&value.latest?.version?' · 可更新到 '+value.latest.version:'');
});
window.addEventListener('houtu:documents-ready',()=>nativeUpdate('updatesStatus'));
$('settings-android-update').hidden=!mobile;
$('settings-android-check').onclick=()=>nativeUpdate('checkUpdates');
function section(){
 const hash=location.hash.slice(1);
 const initial=location.pathname.startsWith('/server')?'storage':'accounts';
 const name=sections.has(hash)?hash:initial;
 for(const [id,panel] of sections)panel.hidden=id!==name;
 for(const link of document.querySelectorAll('[data-settings]')){
  if(link.dataset.settings===name)link.setAttribute('aria-current','true');
  else link.removeAttribute('aria-current');
 }
 if(name==='storage'&&!loadedStorage){
  loadedStorage=true;
  void refresh();
 }
 if(name==='accounts'&&!loadedAccount){
  loadedAccount=true;
  void Promise.all([loadStatus(),accountState(),import('/model-picker.js').then(({createModelPicker})=>{
   models=createModelPicker({mount:$('settings-model'),labelText:'修图默认主模型'});
  })]).catch(error=>authNotice(error.message,true));
 }
 if(name==='logs'){
  void import('./logs.js').then(({mountLogs})=>mountLogs($('logs'),true));
 }
 if(name==='software-updates'){
  if(mobile)nativeUpdate('updatesStatus');
  else void import('./updates.js');
 }
}
try{
 const saved=sessionStorage.getItem('houtu-workbench-return');
 if(saved){
  const url=new URL(saved,location.origin);
  if(url.origin===location.origin&&/^\/workbench\/?$/.test(url.pathname)&&!url.username&&!url.password)$('settings-workbench').href=url.href;
 }
}catch{}
window.addEventListener('hashchange',()=>{
 section();
 window.scrollTo(0,0);
});
for(const link of document.querySelectorAll('[data-settings]'))link.addEventListener('click',event=>{
 if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 event.preventDefault();
 if(location.hash!==link.hash)history.pushState(null,'',link.hash);
 section();
 window.scrollTo(0,0);
});
section();
