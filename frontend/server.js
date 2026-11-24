const $=id=>document.getElementById(id);
let page=1,total=0,requestId=0,timer;
const names={pipeline:'照片配方',retouch:'人物精修',color:'调色成品',creative:'特效与合成'};
const date=value=>value?new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未记录';
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'记录暂时无法读取，请重试。');return data;}
function notice(text,error=false){$('server-notice').textContent=text;$('server-notice').classList.toggle('error',error);}
function text(tag,value,className){const element=document.createElement(tag);element.textContent=value;if(className)element.className=className;return element;}
async function loadStatus(){
 const info=await get('/api/server/status'),current=info.current;
 $('server-current').textContent=current.status==='signedIn'?(current.account?'已登录 · '+current.account.email+' · '+current.account.plan:'已登录 · 客户端未返回账号标识'):current.status==='signedOut'?'ChatGPT 尚未登录，图片档案仍可查看':'账号状态待确认，已有记录仍保留';
 $('server-info').replaceChildren();
 for(const [label,value]of [['电脑',info.machine],['版本',info.version],['数据目录',info.dataRoot],['本机授权目录',info.loginRoot],['本次启动',date(info.startedAt)],['资料库建立',date(info.created)],['访问范围','仅此电脑 · 127.0.0.1']])$('server-info').append(text('dt',label),text('dd',value));
 const selected=$('archive-account').value;$('archive-account').replaceChildren(new Option('全部账号',''),new Option('未记录账号','unknown'));$('server-account-list').replaceChildren();$('server-account-count').textContent=info.accounts.length+' 个';
 for(const account of info.accounts){
  $('archive-account').append(new Option(account.email,account.id));const row=document.createElement('article');row.className='server-account';row.append(text('h3',account.email));
  const live=current.status==='signedIn'&&current.account?.id===account.id;row.append(text('p',(live?'当前登录':'历史记录')+' · '+account.plan+' · 关联 '+account.images+' 个产出版本','hint'));
  row.append(text('p','首次记录：'+date(account.firstSeen)+'\n最近确认：'+date(live?current.checkedAt:account.lastSeen),'hint'));$('server-account-list').append(row);
 }
 if(!info.accounts.length)$('server-account-list').append(text('p','还没有已确认的账号记录。登录并由本站客户端确认后，会自动建立档案。','hint'));
 if([...$('archive-account').options].some(option=>option.value===selected))$('archive-account').value=selected;
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
  card.append(text('p',record.account?(record.accountRole==='analysis'?'关联分析账号：':'修图账号：')+record.account.email:record.kind==='color'?'本机调色 · 未关联ChatGPT账号':'未记录账号','server-image-account'));
  if(record.model)card.append(text('p',(record.accountRole==='analysis'?'分析模型：':'主模型：')+record.model,'hint'));
  const actions=document.createElement('div');actions.className='server-image-actions';for(const [label,url]of [['继续精修',record.editUrl],['下载成品',record.downloadUrl],['步骤记录',record.workflowUrl]])if(url){const link=text('a',label);link.href=url;actions.append(link);}card.append(actions);$('server-images').append(card);
 }
 const pages=Math.max(1,Math.ceil(total/data.pageSize));$('archive-pages').hidden=pages<=1;$('archive-prev').disabled=page<=1;$('archive-next').disabled=page>=pages;$('archive-page-label').textContent='第 '+page+' / '+pages+' 页';
}
async function refresh(){const button=$('refresh-server');button.disabled=true;notice('正在刷新服务器档案…');const results=await Promise.allSettled([loadStatus(),loadImages()]);const failed=results.find(result=>result.status==='rejected');notice(failed?failed.reason.message:'图片与账号记录已更新。软件包不会携带这些私人资料。',Boolean(failed));button.disabled=false;}
$('refresh-server').onclick=refresh;
$('archive-query').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;loadImages().catch(error=>notice(error.message,true));},300);};
for(const id of ['archive-kind','archive-account'])$(id).onchange=()=>{page=1;loadImages().catch(error=>notice(error.message,true));};
$('archive-prev').onclick=()=>{if(page<=1)return;page--;loadImages().catch(error=>notice(error.message,true));};$('archive-next').onclick=()=>{if(page*24>=total)return;page++;loadImages().catch(error=>notice(error.message,true));};
try{document.documentElement.dataset.theme=localStorage.getItem('houtu-theme')||'light';}catch{}
$('theme').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('houtu-theme',next);}catch{}};
if(matchMedia('(max-width:700px)').matches)for(const id of ['server-storage','server-accounts'])$(id).open=false;
refresh();
