document.documentElement.dataset.platform='android';
const originalOpen=window.open;window.open=function(url,...args){if(window.houtuDocuments&&typeof url==='string'&&url.startsWith('https://')){window.houtuDocuments.postMessage(JSON.stringify({type:'open',url}));return null;}return originalOpen.call(window,url,...args);};
try{const original=navigator.clipboard?.writeText?.bind(navigator.clipboard),writeText=async text=>{if(window.houtuDocuments){window.houtuDocuments.postMessage(JSON.stringify({type:'copy',text:String(text)}));return;}if(original)return original(text);throw Error('复制尚未就绪，请稍后再试。');};if(navigator.clipboard)Object.defineProperty(navigator.clipboard,'writeText',{value:writeText});else Object.defineProperty(navigator,'clipboard',{value:{writeText}});}catch{}
window.houtuInterceptBlobDownloads(async (blob, name) => {
 if (!window.houtuDocuments) throw Error('手机保存窗口正在启动，请稍后再试。');
 const receipt = await window.houtuStageExport('/api/mobile/downloads', blob, name);
 window.houtuDocuments.postMessage(JSON.stringify({
  type:'saveUrl',name:receipt.name,mime:receipt.mime,url:new URL(receipt.downloadUrl,location.origin).href
 }));
});
document.addEventListener('DOMContentLoaded',()=>{for(const e of document.querySelectorAll('header nav'))e.setAttribute('aria-hidden','true');for(const e of document.querySelectorAll('h1'))if(e.textContent==='本机服务器')e.textContent='手机图片档案';for(const e of document.querySelectorAll('.titlebar p'))if(e.textContent.includes('这台电脑的图片档案'))e.textContent='这台手机的图片档案与账号记录，关闭页面后仍保留。';});
