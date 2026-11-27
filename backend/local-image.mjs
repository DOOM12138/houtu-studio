import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {toneChoice,createToneState,toneSettings} from '../frontend/tonal-looks.js';
import {render,settings,analyze} from '../frontend/engine.js';
const INPUT={limitInputPixels:40000000,failOn:'error'};
const bound=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export const safeName=value=>String(value||'photo').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().slice(0,100)||'photo';
export function localOptions(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('本机图像设置无效。');
 const rotate=Number(input.rotate??0);if(![0,90,180,270].includes(rotate))throw Error('旋转只支持0/90/180/270度。');
 const ratio=input.ratio??'original';if(!['original','1:1','4:5','3:2','16:9','9:16'].includes(ratio))throw Error('裁切比例无效。');
 if(input.flipSpace!==undefined&&input.flipSpace!=='output')throw Error('不支持的翻转坐标系。');
 return {rotate,flipX:input.flipX===true,flipY:input.flipY===true,...(input.flipSpace==='output'?{flipSpace:'output'}:{}),ratio,focusX:bound(input.focusX,0,100,50),focusY:bound(input.focusY,0,100,50),maxEdge:Math.round(bound(input.maxEdge,0,10000,0)),denoise:Math.round(bound(input.denoise,0,10,0)),sharpen:bound(input.sharpen,0,3,0)};
}
export const jpegChromaSubsampling = quality => quality>=95?'4:4:4':'4:2:0';
export function exportOptions(input={}){const format=input.format??'png';if(!['png','jpeg','webp'].includes(format))throw Error('导出支持PNG、JPEG或WebP。');return {format,quality:Math.round(bound(input.quality,40,100,90)),maxEdge:Math.round(bound(input.maxEdge,0,10000,0)),background:input.background==='black'?'black':'white',prefix:safeName(input.prefix||'成片')};}
export async function localProcess(bytes,input){
 const options=localOptions(input),upright=await sharp(bytes,INPUT).rotate().toColourspace('srgb').png().toBuffer();
 // Sharp applies flips in input coordinates before rotating. New recipe edits use output axes.
 const swap=options.flipSpace==='output'&&(options.rotate===90||options.rotate===270);
 const flipHorizontal=swap?options.flipY:options.flipX,flipVertical=swap?options.flipX:options.flipY;
 let value=await sharp(upright,INPUT).rotate(options.rotate).flip(flipVertical).flop(flipHorizontal).png().toBuffer();
 const meta=await sharp(value,INPUT).metadata();
 if(options.ratio!=='original'){const [a,b]=options.ratio.split(':').map(Number),ratio=a/b;let width=meta.width,height=meta.height;if(width/height>ratio)width=Math.max(1,Math.floor(height*ratio));else height=Math.max(1,Math.floor(width/ratio));const left=Math.round((meta.width-width)*options.focusX/100),top=Math.round((meta.height-height)*options.focusY/100);value=await sharp(value,INPUT).extract({left,top,width,height}).png().toBuffer();}
 let image=sharp(value,INPUT);if(options.maxEdge>0)image=image.resize({width:options.maxEdge,height:options.maxEdge,fit:'inside',withoutEnlargement:true});
 if(options.denoise>0)image=image.median(2*Math.min(3,Math.ceil(options.denoise/4))+1);
 if(options.sharpen>0)image=image.sharpen({sigma:.3+options.sharpen*.6,m1:options.sharpen,m2:options.sharpen*1.4});
 return image.png().toBuffer();
}
export async function gradeProcess(bytes,input,{look=null,report=null,resolveSettings=null}={}){
 const image=await sharp(bytes,INPUT).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),data=new Uint8ClampedArray(image.data),choice=toneChoice(look),tone=choice?createToneState(choice,analyze(data)):null,base=tone?toneSettings(tone):settings(input),applied=resolveSettings?resolveSettings(base,tone):base,pixels=render(data,image.info.width,image.info.height,applied);if(report)Object.assign(report,{settings:applied,tone});
 return sharp(Buffer.from(pixels),{raw:{width:image.info.width,height:image.info.height,channels:4}}).png().toBuffer();
}
export async function exportProcess(bytes,input){let image=sharp(bytes,INPUT).rotate().toColourspace('srgb');const options=exportOptions(input);if(options.maxEdge>0)image=image.resize({width:options.maxEdge,height:options.maxEdge,fit:'inside',withoutEnlargement:true});if(options.format==='jpeg')image=image.flatten({background:options.background}).jpeg({quality:options.quality,mozjpeg:true,chromaSubsampling:jpegChromaSubsampling(options.quality)});else if(options.format==='webp')image=image.webp({quality:options.quality});else image=image.png({compressionLevel:9});const data=await image.toBuffer(),metadata=await sharp(data,INPUT).metadata();return {bytes:data,type:'image/'+options.format,width:metadata.width,height:metadata.height,extension:options.format==='jpeg'?'jpg':options.format,...(metadata.chromaSubsampling?{chromaSubsampling:metadata.chromaSubsampling}:{})};}
export async function inspectPhoto(bytes){
 const meta=await sharp(bytes,INPUT).metadata();if(!['png','jpeg','webp'].includes(meta.format))throw Error('请选择PNG、JPEG或WebP照片。');const small=await sharp(bytes,INPUT).rotate().resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),stats=analyze(new Uint8ClampedArray(small.data)),gray=await sharp(bytes,INPUT).rotate().resize(9,8,{fit:'fill'}).removeAlpha().greyscale().raw().toBuffer();let hash=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++)hash=(hash<<1n)|BigInt(gray[y*9+x]>gray[y*9+x+1]);
 let variance=0,count=0;const p=small.data,w=small.info.width,h=small.info.height,l=(x,y)=>{const i=(y*w+x)*4;return p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722;};for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const lap=l(x-1,y)+l(x+1,y)+l(x,y-1)+l(x,y+1)-4*l(x,y);variance+=lap*lap;count++;}
 const sharpness=count?variance/count:0,warnings=[];if(stats.lightness<.18)warnings.push('整体偏暗，请检查主体曝光');if(stats.clippedLight>.12)warnings.push('高亮区域较多，请检查高光');if(sharpness<18)warnings.push('整体细节较少，可能偏软或背景虚化，请人工核对焦点');
 const swap=[5,6,7,8].includes(meta.orientation);return {width:swap?meta.height:meta.width,height:swap?meta.width:meta.height,format:meta.format,bytes:bytes.length,fileHash:createHash('sha256').update(bytes).digest('hex'),visualHash:hash.toString(16).padStart(16,'0'),sharpness:Math.round(sharpness),lightness:stats.lightness,clippedLight:stats.clippedLight,warnings};
}
export function hashDistance(a,b){let value=BigInt('0x'+a)^BigInt('0x'+b),count=0;while(value){count+=Number(value&1n);value>>=1n;}return count;}
