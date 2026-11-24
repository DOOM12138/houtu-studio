import https from 'node:https';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
const hosts=['xiaohongshu.com','xhslink.com','xhscdn.com','unsplash.com','pexels.com','wikimedia.org'];
function allowed(url){return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h));}
function public4(ip){const [a,b]=ip.split('.').map(Number);return a>0&&a<224&&a!==10&&a!==127&&a!==169&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));}
export async function publicFetch(raw,redirects=0){
  const url=new URL(raw);if(!allowed(url))throw new Error('仅支持小红书、Unsplash、Pexels 和 Wikimedia 的公开 HTTPS 链接；其他来源请上传参考图。');
  const addresses=await lookup(url.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!public4(a.address)))throw new Error('参考地址不可访问。');const ip=addresses[0].address;
  return new Promise((resolve,reject)=>{const req=https.get(url,{headers:{'User-Agent':'HoutuStudio/1.3 (local reference image importer)','Accept':'text/html,image/*,application/json'},lookup:(_host,options,done)=>done(null,options.all?[{address:ip,family:4}]:ip,4)},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(redirects>=4)return reject(new Error('参考链接重定向过多，请直接上传图片。'));return publicFetch(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);}
    if(res.statusCode!==200){res.resume();return reject(new Error('平台未开放此页面（可能需要登录），请保存图片后上传为参考图。'));}
    const chunks=[];let bytes=0;res.on('data',c=>{bytes+=c.length;if(bytes>10*1024*1024){req.destroy(new Error('参考文件超过10 MB，请缩小后上传。'));return;}chunks.push(c);});res.on('error',reject);res.on('end',()=>resolve({url:url.href,type:String(res.headers['content-type']||''),bytes:Buffer.concat(chunks)}));
  });req.setTimeout(18000,()=>req.destroy(new Error('读取参考超时，请直接上传参考图。')));req.on('error',reject);});
}
const unescape=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
export async function importReference(raw){
  const found=String(raw||'').match(/https:\/\/[^\s<>"“”]+/);if(!found)throw new Error('请粘贴公开图片或笔记的 HTTPS 链接。');
  let result=await publicFetch(found[0]),source=result.url;
  if(!result.type.startsWith('image/')){
    const html=result.bytes.toString('utf8'),tags=html.match(/<meta\s[^>]*>/gi)||[];let image;
    for(const tag of tags){if(!/(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i.test(tag))continue;image=tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];if(image)break;}
    if(!image)throw new Error('公开页面没有可读取的参考图；请保存图片或截图后上传。');result=await publicFetch(new URL(unescape(image),source).href);
  }
  if(!result.type.startsWith('image/')||/svg/i.test(result.type))throw new Error('参考链接没有返回受支持的图片，请直接上传。');
  const bytes=await sharp(result.bytes,{limitInputPixels:40000000}).rotate().toColourspace('srgb').resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
  return {image:'data:image/jpeg;base64,'+bytes.toString('base64'),source};
}
export async function searchReferences(query){
  const q=String(query||'portrait warm light').trim().slice(0,120);if(!q)throw new Error('请输入想参考的主题。');
  const url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:q+' filetype:bitmap',gsrnamespace:'6',gsrlimit:'6',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'700'}).toString();
  const response=await publicFetch(url.href),data=JSON.parse(response.bytes.toString('utf8'));
  if(data.error)throw new Error('公开图库暂时不可用，请上传参考图。');
  return Object.values(data.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).map(p=>{const i=p.imageinfo?.[0],plain=s=>String(s||'').replace(/<[^>]*>/g,'').slice(0,600);return i&&{title:p.title.replace(/^File:/,''),image:i.thumburl||i.url,url:i.descriptionurl,license:plain(i.extmetadata?.LicenseShortName?.value)||'见来源页面',creator:plain(i.extmetadata?.Artist?.value),credit:plain(i.extmetadata?.Credit?.value),licenseUrl:plain(i.extmetadata?.LicenseUrl?.value)};}).filter(x=>x&&allowed(new URL(x.image)));
}
