import https from 'node:https';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const registry='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
let cachedAgent;
function usableProxy(value){
 if(!value)return '';
 try{const url=new URL(/^[a-z][\w+.-]*:\/\//i.test(value)?value:'http://'+value);return ['http:','https:'].includes(url.protocol)?url.href:'';}
 catch{return '';}
}
export function windowsHttpsProxy(value){
 if(!String(value).includes('='))return usableProxy(value);
 const servers=Object.fromEntries(String(value).split(';').map(pair=>pair.trim().split('=')));
 return usableProxy(servers.https);
}
async function proxyAgent(){
 const env=process.env,explicit=env.https_proxy||env.HTTPS_PROXY||env.http_proxy||env.HTTP_PROXY;
 let proxy=usableProxy(explicit),noProxy=env.no_proxy||env.NO_PROXY||'';
 if(!explicit&&process.platform==='win32'){
  const file=path.join(env.SystemRoot||'C:\\Windows','System32','reg.exe');
  const get=async key=>{try{const {stdout}=await exec(file,['query',registry,'/v',key],{windowsHide:true,timeout:1800,maxBuffer:16384});return stdout.match(new RegExp(key+'\\s+REG_\\w+\\s+([^\\r\\n]+)','i'))?.[1]?.trim()||'';}catch{return '';}};
  if(Number(await get('ProxyEnable'))===1){const [setting,bypass]=await Promise.all([get('ProxyServer'),get('ProxyOverride')]);proxy=windowsHttpsProxy(setting);noProxy=[noProxy,...bypass.split(';').map(s=>s.trim().replace(/^\*\./,'.'))].filter(Boolean).join(',');}
 }
 return new https.Agent({keepAlive:true,maxSockets:4,...(proxy?{proxyEnv:{HTTPS_PROXY:proxy,HTTP_PROXY:proxy,NO_PROXY:noProxy}}:{})});
}
function agent(){if(!cachedAgent||Date.now()-cachedAgent.created>60000){const old=cachedAgent;cachedAgent={created:Date.now(),promise:proxyAgent()};old?.promise.then(a=>{for(const sockets of Object.values(a.freeSockets))for(const s of sockets||[])s.destroy();}).catch(()=>{});}return cachedAgent.promise;}
export function checkWikimediaURL(value,purpose){
 const u=new URL(value);
 const ok=purpose==='image'?['upload.wikimedia.org','thumb.wikimedia.org'].includes(u.hostname)&&u.pathname.startsWith('/wikipedia/commons/'):
    ['commons.wikimedia.org','www.wikidata.org'].includes(u.hostname)&&u.pathname==='/w/api.php';
 if(!ok||u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('非公开资料库来源。');
 return u;
}
// Public GETs to fixed media/metadata destinations only. Browser cookies,
// account credentials, photo bytes and arbitrary request headers are never forwarded.
export async function wikiBytes(raw,{purpose='api',signal=AbortSignal.timeout(10000)}={}){
 const url=checkWikimediaURL(raw,purpose),transport=await agent(),limit=purpose==='image'?10*1024*1024:2*1024*1024;
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{agent:transport,signal,headers:{Accept:purpose==='image'?'image/*':'application/json','User-Agent':'HoutuStudio/1.36 (https://github.com/DOOM12138/houtu-studio; public reference lookup)'}},res=>{
   if(res.statusCode!==200){res.resume();reject(Error('公开资料服务 HTTP '+res.statusCode));return;}
   const chunks=[];let size=0;res.on('error',reject);res.on('data',chunk=>{size+=chunk.length;if(size>limit){req.destroy(Error('公开资料响应过大。'));return;}chunks.push(chunk);});
   res.on('end',()=>resolve({bytes:Buffer.concat(chunks),url:url.href,type:String(res.headers['content-type']||'')}));
  });req.on('error',reject);
 });
}
