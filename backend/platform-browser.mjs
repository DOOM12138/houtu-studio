import path from 'node:path';
import {access,mkdir} from 'node:fs/promises';

const platforms = {
 xiaohongshu:{name:'小红书',home:'https://www.xiaohongshu.com/explore',hosts:['www.xiaohongshu.com','xiaohongshu.com'],post:/^\/(?:explore|discovery\/item|search_result)\/[a-z0-9]+\/?$/i,links:'a[href*="/explore/"], a[href*="/search_result/"], a[href*="/discovery/item/"]'},
 douyin:{name:'抖音',home:'https://www.douyin.com/',hosts:['www.douyin.com','douyin.com'],post:/^\/(?:video|note)\/\d+\/?$/,links:'a[href*="/video/"], a[href*="/note/"]'}
};
function platformConfig(provider){
 if(!Object.hasOwn(platforms,provider))throw Error('请选择小红书或抖音。');
 return platforms[provider];
}
function platformURL(value,provider,postOnly=false){
 const site=platformConfig(provider);
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&site.hosts.includes(u.hostname)&&(!postOnly||site.post.test(u.pathname))?u:null;
 }catch{return null;}
}
function searchURL(query,provider){
 const keyword=String(query||'人物 合成 特效').trim().slice(0,120);
 if(provider==='douyin')return 'https://www.douyin.com/search/'+encodeURIComponent(keyword);
 const url=new URL('https://www.xiaohongshu.com/search_result');
 url.searchParams.set('keyword',keyword);
 url.searchParams.set('source','web_explore_feed');
 return url.href;
}
async function requireVisiblePage(page,provider){
 const site=platformConfig(provider);
 const blocked=await page.getByText(/扫码登录|验证码登录|登录后查看|请完成验证|请先登录|安全验证|请完成安全校验/).evaluateAll(nodes=>nodes.some(el=>{
  const r=el.getBoundingClientRect(),style=getComputedStyle(el);
  return r.width>0&&r.height>0&&r.left<innerWidth&&r.right>0&&r.top<innerHeight&&r.bottom>0&&style.visibility==='visible'&&style.display!=='none';
 }));
 if(!platformURL(page.url(),provider)||blocked)throw Object.assign(Error('请在独立浏览器完成'+site.name+'登录或验证，再继续。'),{code:'PLATFORM_LOGIN'});
}
export async function browserExecutable(){
 const candidates=[
  process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft/Edge/Application/msedge.exe'),
  process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'),
  process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
  process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Microsoft/Edge/Application/msedge.exe')
 ].filter(Boolean);
 for(const f of candidates)try{await access(f);return f;}catch{}
 throw Object.assign(Error('未找到 Edge 或 Chrome，请安装浏览器或选择不自动找图。'),{code:'PLATFORM_UNAVAILABLE'});
}
export class PlatformBrowser{
 constructor(directory){this.profile=path.join(directory,'platform-browser');this.context=null;this.starting=null;this.busy=false;}
 async ensureBrowser(){
  if(this.context)return this.context;
  if(this.starting)return this.starting;
  this.starting=(async()=>{
   const {chromium}=await import('playwright-core');
   await mkdir(this.profile,{recursive:true});
   const context=await chromium.launchPersistentContext(this.profile,{executablePath:await browserExecutable(),headless:false,viewport:null,acceptDownloads:false,args:['--disable-sync','--no-first-run']});
   this.context=context;
   context.on('close',()=>{if(this.context===context)this.context=null;});
   return context;
  })().finally(()=>{this.starting=null;});
  return this.starting;
 }
 async page(provider,{create=false}={}){
  const site=platformConfig(provider);
  if(!this.context&&!create)throw Error('请先打开'+site.name+'独立浏览器。');
  const context=this.context||await this.ensureBrowser(),pages=context.pages().filter(page=>!page.isClosed());
  const found=[...pages].reverse().find(page=>platformURL(page.url(),provider));
  if(found)return found;
  if(!create)throw Error('请在独立浏览器打开'+site.name+'。');
  return pages.find(page=>page.url()==='about:blank')||await context.newPage();
 }
 async open(provider='xiaohongshu'){
  const site=platformConfig(provider),page=await this.page(provider,{create:true});
  if(!platformURL(page.url(),provider))await page.goto(site.home,{waitUntil:'domcontentloaded',timeout:15000});
  await page.bringToFront();
  return this.status(provider);
 }
 async status(provider='xiaohongshu'){
  platformConfig(provider);
  const page=this.context?.pages().find(page=>!page.isClosed()&&platformURL(page.url(),provider));
  if(!page)return {open:false,login:'not-checked',message:'登录状态只保存在应用的独立浏览器。'};
  return {open:true,url:page.url(),login:'confirm-in-browser',message:'请以独立窗口显示的登录或验证提示为准。'};
 }
 async search(query,provider='xiaohongshu'){
  const site=platformConfig(provider);
  if(this.busy)throw Error('参考平台正在读取，请稍后重查。');
  this.busy=true;
  try{
   const page=await this.page(provider,{create:true});
   await page.goto(searchURL(query,provider),{waitUntil:'domcontentloaded',timeout:18000});
   await requireVisiblePage(page,provider);
   await page.locator(site.links).first().waitFor({state:'visible',timeout:4500}).catch(()=>{});
   await requireVisiblePage(page,provider);
   const links=await page.locator(site.links).evaluateAll(nodes=>nodes
    .filter(a=>{const r=a.getBoundingClientRect(),s=getComputedStyle(a);return r.width>18&&r.height>18&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.visibility==='visible';})
    .map(a=>({url:a.href,title:(a.innerText||a.querySelector('img')?.alt||'平台参考').trim().slice(0,100)})));
   const results=[...new Map(links.filter(item=>platformURL(item.url,provider,true)).map(item=>[new URL(item.url).pathname,item])).values()].slice(0,12);
   return {results,message:results.length?'已读取'+site.name+'页面中的参考。':'未在'+site.name+'找到可读取的帖子。'};
  }finally{this.busy=false;}
 }
 async capture(url,provider='xiaohongshu'){
  const site=platformConfig(provider);
  if(this.busy)throw Error('参考平台正在读取，请稍后重查。');
  this.busy=true;
  try{
   const page=await this.page(provider);
   if(url){
    if(!platformURL(url,provider,true))throw Error('请选择'+site.name+'的有效帖子链接。');
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000});
   }
   await requireVisiblePage(page,provider);
   if(!platformURL(page.url(),provider,true))throw Error('请在独立窗口打开'+site.name+'的一条帖子。');
   // Capture only media already presented in the platform's own player or notes.
   const selector=provider==='douyin'?'video,main img,[data-e2e="video-player"] img':'img';
   await page.waitForFunction(query=>[...document.querySelectorAll(query)].some(node=>{
    const r=node.getBoundingClientRect(),s=getComputedStyle(node);
    const ready=node instanceof HTMLVideoElement?node.readyState>=2:node.complete&&node.naturalWidth>=200;
    return ready&&r.width>=200&&r.height>=180&&s.visibility==='visible'&&r.bottom>0&&r.top<innerHeight;
   }),selector,{timeout:7000});
   await requireVisiblePage(page,provider);
   if(!platformURL(page.url(),provider,true))throw Error('平台页面已切换，请重新选择帖子。');
   const best=await page.locator(selector).evaluateAll(nodes=>nodes.map((el,index)=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el),isVideo=el instanceof HTMLVideoElement;
    const ready=isVideo?el.readyState>=2:el.complete&&el.naturalWidth>=200;
    const visible=s.visibility==='visible'&&s.display!=='none'&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
    return {index,area:r.width*r.height,valid:ready&&visible&&r.width>=200&&r.height>=180,video:isVideo};
   }).filter(r=>r.valid).sort((a,b)=>Number(b.video)-Number(a.video)||b.area-a.area)[0]?.index??-1);
   if(best<0)throw Error('未找到当前帖子中已显示的参考图。');
   const source=page.url(),bytes=await page.locator(selector).nth(best).screenshot({type:'png',timeout:8000});
   if(page.url()!==source)throw Error('平台页面已切换，请重新选择帖子。');
   return {bytes,source,title:(await page.title()).slice(0,150),usage:'reference-only',license:'平台例图，仅作参考，保留水印'};
  }finally{this.busy=false;}
 }
 async close(){const context=this.context;this.context=null;if(context)await context.close();}
}
