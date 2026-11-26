import sharp from 'sharp';
import {settings} from '../frontend/engine.js';
export async function frameTones(bytes){
 const {data,info}=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:192,height:192,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const bins=new Uint32Array(256);let count=0;
 for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;bins[Math.round(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)]++;count++;}
 if(!count)return null;
 const at=f=>{let n=0;for(let k=0;k<256;k++){n+=bins[k];if(n>=count*f)return k;}return 255;};
 return {sampleWidth:info.width,sampleHeight:info.height,p05:at(.05),median:at(.5),p95:at(.95),clippedHighlights:Number(((bins[254]+bins[255])/count).toFixed(4)),clippedShadows:Number(((bins[0]+bins[1])/count).toFixed(4))};
}
export function guardedColor(raw,profile){
 const kind=profile.scene.kind,metrics=profile.tones;
 const bound=(value,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):0;
 const warmth={convention:12,studio:14,location:22,unknown:7}[kind]??7;
 const maxExposure=kind==='unknown'?.2:.6;
 const values={exposure:bound(raw?.exposure,-maxExposure,metrics?.p95>=246?Math.min(.12,maxExposure):maxExposure),
  temperature:bound(raw?.temperature,-warmth,warmth),tint:bound(raw?.tint,-warmth,warmth),contrast:bound(raw?.contrast,-22,22),
  highlights:bound(raw?.highlights,-30,metrics?.p95>=246?0:25),shadows:bound(raw?.shadows,metrics?.p05<=8?0:-25,30),saturation:bound(raw?.saturation,-18,18)};
 return {settings:settings(values),reason:kind==='unknown'?'场景未定，限制全局曝光与白平衡幅度。':metrics?.p95>=246?'原图亮部接近上限，限制全局正曝光与高光增益。':'按原图色彩与场景限制整体调色幅度。'};
}
export function finalSceneGrade(planned,profile){
 return (applied,tone)=>{
  if(!tone)return planned;
  const axes=['exposure','temperature','tint','contrast','highlights','shadows','saturation'];
  const combined=Object.fromEntries(axes.map(k=>[k,(applied[k]||0)+(planned[k]||0)]));
  const limited=guardedColor(combined,profile).settings;
  const result={...applied,...Object.fromEntries(axes.map(k=>[k,limited[k]]))};
  if(profile.tones?.p95>=246)result.whites=Math.min(0,result.whites);
  if(profile.tones?.p05<=8)result.blacks=Math.max(0,result.blacks);
  return result;
 };
}
