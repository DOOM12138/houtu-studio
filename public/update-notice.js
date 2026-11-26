// GitHub is checked by the desktop service or native APK updater. Pages read local status only.
let notice,pageVersion=null,loading=false,events=null,reconnectTimer=null,memoryDismissed=null;
const mobile=()=>document.documentElement.dataset.platform==='android';
function nativeMessage(type,extra={}){if(!window.houtuDocuments)return false;window.houtuDocuments.postMessage(JSON.stringify({type,...extra}));return true;}
function dismissed(){try{return sessionStorage.getItem('houtu-update-dismissed')||memoryDismissed;}catch{return memoryDismissed;}}
function remove(){notice?.remove();notice=null;}
function panel(version,kind,text){
 if(notice?.dataset.version===version&&notice.dataset.kind===kind)return null;
 remove();notice=document.createElement('aside');notice.className='update-notice';notice.dataset.version=version;notice.dataset.kind=kind;notice.setAttribute('aria-label','软件更新');notice.setAttribute('aria-live','polite');
 const message=document.createElement('span');message.textContent=text;notice.append(message);const slot=document.getElementById('workbench-update-slot');if(slot)slot.replaceChildren(notice);else document.querySelector('header')?.after(notice);return notice;
}
function render(s,native=false){
 if(!s||typeof s.currentVersion!=='string')return;
 if(pageVersion&&pageVersion!==s.currentVersion){const p=panel(s.currentVersion,'reload','程序已更新到 '+s.currentVersion+'，保存本页修改后刷新，即可同步使用全部新功能。');if(p){const b=document.createElement('button');b.type='button';b.textContent='刷新工作台';b.onclick=()=>location.reload();p.append(b);}return;}
 pageVersion??=s.currentVersion;
 if(!native&&location.pathname.startsWith('/server')){remove();return;}
 const version=s.latest?.version,hidden=native?(!s.settings?.autoCheck||s.dismissedVersion===version):dismissed()===version;
 if(!s.available||!version||hidden){remove();return;}
 const p=panel(version,native?'android':'desktop','厚涂小站 '+version+' 已发布 · 全功能更新');if(!p)return;
 let action;if(native){action=document.createElement('button');action.type='button';action.textContent='查看更新';action.onclick=()=>nativeMessage('checkUpdates');}
 else{action=document.createElement('a');action.href='/server/#software-updates';action.textContent=s.sourceMode?'查看 Git 更新':'查看更新';}
 const later=document.createElement('button');later.type='button';later.textContent='稍后';later.setAttribute('aria-label',native?'暂不提示此版本':'本次会话暂不提示此版本');later.onclick=()=>{if(native)nativeMessage('dismissUpdate',{version});else{memoryDismissed=version;try{sessionStorage.setItem('houtu-update-dismissed',version);}catch{}}remove();};p.append(action,later);
}
async function check(){
 if(document.hidden||loading)return;if(mobile()){events?.close();events=null;nativeMessage('updatesStatus');return;}
 loading=true;try{const r=await fetch('/api/updates/status',{signal:AbortSignal.timeout(5000)});if(r.ok&&!mobile())render(await r.json());}catch{}finally{loading=false;}
}
function connect(){
 if(mobile()||document.hidden||events||typeof EventSource==='undefined')return;
 try{events=new EventSource('/api/updates/events');events.addEventListener('ready',check);events.addEventListener('version',check);events.onerror=()=>{events?.close();events=null;clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,60000);};}catch{}
}
window.addEventListener('houtu:update-status',event=>{if(mobile())render(event.detail,true);});
window.addEventListener('houtu:documents-ready',check);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){check();connect();}});window.addEventListener('focus',check);
window.addEventListener('pagehide',()=>{events?.close();events=null;clearTimeout(reconnectTimer);});window.addEventListener('pageshow',()=>{check();connect();});
setTimeout(()=>{check();connect();},300);setInterval(check,60000);
