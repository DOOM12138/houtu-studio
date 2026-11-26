import sharp from 'sharp';
import {effectSvg} from '../frontend/effects.js';
export async function composite(source,material,mask,options){
 const orient=async bytes=>{if(!bytes)return bytes;const m=await sharp(bytes).metadata();return m.orientation&&m.orientation!==1?sharp(bytes).rotate().png().toBuffer():bytes;};source=await orient(source);material=await orient(material);mask=await orient(mask);
 const meta=await sharp(source).metadata(),width=meta.width,height=meta.height;let base=source;
 if(options.mode==='background'){
  if(!material||!mask)throw Error('换背景需要背景素材和人物蒙版，请先分析人物。');
  const bg=await sharp(material).resize(width,height,{fit:'cover'}).ensureAlpha().png().toBuffer();
  const alpha=await sharp(mask).resize(width,height,{fit:'fill'}).removeAlpha().greyscale().raw().toBuffer();
  const foreground=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let p=0;p<width*height;p++)foreground.data[p*4+3]*=alpha[p]/255;const subject=await sharp(foreground.data,{raw:foreground.info}).png().toBuffer();
  base=await sharp(bg).composite([{input:subject}]).png().toBuffer();
 }else if(material&&options.mode==='overlay'){
  const scale=Math.max(.02,Math.min(2,options.scale)),opacity=Math.max(0,Math.min(1,options.opacity));let layer=await sharp(material).resize({width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),fit:'inside'}).rotate(options.rotation,{background:'#00000000'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=3;i<layer.data.length;i+=4)layer.data[i]*=opacity;
  let image=sharp(layer.data,{raw:layer.info});let left=Math.round(width*options.x-layer.info.width/2),top=Math.round(height*options.y-layer.info.height/2),cropLeft=Math.max(0,-left),cropTop=Math.max(0,-top),cropW=Math.min(layer.info.width-cropLeft,width-Math.max(left,0)),cropH=Math.min(layer.info.height-cropTop,height-Math.max(top,0));
  if(cropW>0&&cropH>0){const input=await image.extract({left:cropLeft,top:cropTop,width:cropW,height:cropH}).png().toBuffer();base=await sharp(source).composite([{input,left:Math.max(0,left),top:Math.max(0,top),blend:options.blend}]).png().toBuffer();}
 }
 if(options.effect!=='none'&&options.amount>0){const fx=Buffer.from(effectSvg(width,height,options));let effect=await sharp(fx).png().toBuffer();if(options.protectSubject&&mask){const alpha=await sharp(mask).resize(width,height).removeAlpha().greyscale().negate().raw().toBuffer();const raw=await sharp(effect).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let p=0;p<width*height;p++)raw.data[p*4+3]*=alpha[p]/255;effect=await sharp(raw.data,{raw:raw.info}).png().toBuffer();}base=await sharp(base).composite([{input:effect,blend:'over'}]).png().toBuffer();}
 return sharp(base).png().toBuffer();
}
