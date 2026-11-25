import sharp from 'sharp';
import {blendBoundary,calibrateContext,SEAM_VERSION} from './seam.mjs';

const OPTIONS = { limitInputPixels: 40_000_000, failOn: 'error' };

export async function orientedDimensions(bytes) {
  const metadata=await sharp(bytes,OPTIONS).metadata();
  const swap=[5,6,7,8].includes(metadata.orientation);
  return {width:swap?metadata.height:metadata.width,height:swap?metadata.width:metadata.height};
}

// Normalize EXIF orientation once so browser coordinates and pixel crop coordinates agree.
export async function prepareEditImage(bytes, selection, {contextRatio=.12,smoothing=null}={}) {
  let source, info;
  try {
    const normalized = await sharp(bytes, OPTIONS).rotate().toColourspace('srgb').png().toBuffer({ resolveWithObject: true });
    source = normalized.data; info = normalized.info;
  } catch { throw new Error('图片无法读取，或像素超过 4000 万；请换一张图片。'); }
  const { width, height } = info;
  if (!selection) return { source, width, height, editImage: null, region: null };
  const x = Math.min(width - 1, Math.round(selection.x * width));
  const y = Math.min(height - 1, Math.round(selection.y * height));
  const w = Math.min(width - x, Math.round(selection.width * width));
  const h = Math.min(height - y, Math.round(selection.height * height));
  if (w < 64 || h < 64) throw new Error('局部选区至少需要 64 × 64 像素，请画大一点。');
  if(!Number.isFinite(contextRatio)||contextRatio<0||contextRatio>.5)throw new Error('编辑上下文范围无效。');
  const padding = Math.round(Math.max(w, h) * contextRatio);
  const left = Math.max(0, x - padding), top = Math.max(0, y - padding);
  const edit = { left, top, width: Math.min(width, x + w + padding) - left, height: Math.min(height, y + h + padding) - top };
  const region = { left: x, top: y, width: w, height: h, edit, ...(smoothing?{smoothing}:{}) };
  const editImage = await sharp(source).extract(edit).png().toBuffer();
  return { source, width, height, editImage, region };
}

export async function finishEditImage(generated, source, region,{report={},matchBoundary=true}={}) {
  if (!Buffer.isBuffer(generated) || generated.length > 64 * 1024 * 1024) throw new Error('生成的图片文件无效或过大。');
  let normalized;
  try { normalized = await sharp(generated, OPTIONS).rotate().toColourspace('srgb').png().toBuffer(); }
  catch { throw new Error('生成结果不是可读取的图片文件。'); }
  if (!region){const input=await orientedDimensions(source),output=await orientedDimensions(normalized),aspectMismatch=Math.round(Math.abs((output.width/output.height)/(input.width/input.height)-1)*1000)/1000;Object.assign(report,{method:SEAM_VERSION,skipped:'whole-frame',aspectMismatch,needsReview:aspectMismatch>.08});return normalized;}
  const shape=await sharp(source,OPTIONS).metadata(),generatedShape=await sharp(normalized).metadata();
  const {width:ew,height:eh}=region.edit,target={left:region.left-region.edit.left,top:region.top-region.edit.top,width:region.width,height:region.height};
  let context=await sharp(source,OPTIONS).extract(region.edit).ensureAlpha().raw().toBuffer(),generatedContext=await sharp(normalized).resize(ew,eh,{fit:'fill'}).ensureAlpha().raw().toBuffer();
  const calibration=matchBoundary?calibrateContext(context,generatedContext,ew,eh,target):{applied:false,reason:'intentional-colour'};report.contextCalibration=calibration;
  let patch=Buffer.alloc(region.width*region.height*4);
  for(let y=0;y<region.height;y++)generatedContext.copy(patch,y*region.width*4,((target.top+y)*ew+target.left)*4,((target.top+y)*ew+target.left+region.width)*4);
  const selected=await sharp(source,OPTIONS).extract({left:region.left,top:region.top,width:region.width,height:region.height}).ensureAlpha().raw().toBuffer();
  if(calibration.applied)for(let i=0;i<patch.length;i+=4){if(patch[i+3]===0||patch[i]===selected[i]&&patch[i+1]===selected[i+1]&&patch[i+2]===selected[i+2]&&patch[i+3]===selected[i+3])continue;for(let c=0;c<3;c++)patch[i+c]=Math.round(Math.max(0,Math.min(255,patch[i+c]*calibration.gains[c]+calibration.biases[c])));}
  context=null;generatedContext=null;
  const smoothing=region.smoothing;
  if(smoothing&&(!Number.isFinite(smoothing.featherRatio)||smoothing.featherRatio<=0||smoothing.featherRatio>.5||!Number.isInteger(smoothing.maxFeather)||smoothing.maxFeather<1||smoothing.maxFeather>256||smoothing.curve!=='smoothstep'))throw new Error('局部过渡设置无效。');
  const feather = Math.max(1, Math.min(smoothing?.maxFeather||48, Math.floor(Math.min(region.width, region.height) * (smoothing?.featherRatio||0.06))));
  let alpha = Buffer.alloc(region.width * region.height);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      // A crop touching the image frame has no external seam on that side.
      const edge = Math.min(region.left>0?x:Infinity,region.top>0?y:Infinity,region.left+region.width<shape.width?region.width-1-x:Infinity,region.top+region.height<shape.height?region.height-1-y:Infinity);
      const t=Math.min(1,edge/feather);
      alpha[y * region.width + x] = Math.round(255*t*t*(3-2*t));
    }
  }
  const blended=await blendBoundary(selected,patch,alpha,region.width,region.height,{feather,colourBand:feather*2,soften:false,matchBoundary,report});
  patch=null;alpha=null;
  const mismatch=Math.abs((generatedShape.width/generatedShape.height)/(region.edit.width/region.edit.height)-1);
  report.aspectMismatch=Math.round(mismatch*1000)/1000;report.needsReview||=mismatch>.08;
  // Copy the replacement bytes, rather than alpha-compositing the original twice.
  // This preserves *all four* original channels outside the selected rectangle.
  const original=await sharp(source,OPTIONS).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let y=0;y<region.height;y++)blended.copy(original.data,((region.top+y)*shape.width+region.left)*4,y*region.width*4,(y+1)*region.width*4);
  return sharp(original.data,{raw:{width:shape.width,height:shape.height,channels:4}}).png().toBuffer();
}

export async function applyProtectionMask(edited,source,mask,{report={},matchBoundary=true,featherPx}={}){
 const original=await sharp(source,OPTIONS).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width,height}=original.info;
 const metadata=await sharp(mask,OPTIONS).metadata();if(Math.abs(metadata.width/metadata.height-width/height)>.025)throw Error('人物蒙版与当前图片长宽比不一致，请重新分析或上传对应蒙版。');
 const base=await sharp(mask,OPTIONS).flatten({background:'#000000'}).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true}),mw=base.info.width,mh=base.info.height;
 const alpha=mw===width&&mh===height?Buffer.from(base.data):await sharp(base.data,{raw:{width:mw,height:mh,channels:1}}).resize(width,height,{fit:'fill',kernel:'linear'}).greyscale().raw().toBuffer();
 // Project the complete area of each black source cell, including when shrinking.
 // Interpolation may soften gray values, but cannot unlock an originally black area.
 if(mw!==width||mh!==height)for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if(base.data[y*mw+x]===0){const left=Math.floor(x*width/mw),right=Math.min(width,Math.ceil((x+1)*width/mw)),top=Math.floor(y*height/mh),bottom=Math.min(height,Math.ceil((y+1)*height/mh));for(let yy=top;yy<bottom;yy++)alpha.fill(0,yy*width+left,yy*width+right);}
 const result=await sharp(edited,OPTIONS).rotate().toColourspace('srgb').resize(width,height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 if(featherPx!==undefined&&(!Number.isInteger(featherPx)||featherPx<1||featherPx>128))throw Error('蒙版羽化像素无效。');const feather=featherPx??Math.max(3,Math.min(24,Math.round(Math.min(width,height)*.012)));
 await blendBoundary(original.data,result,alpha,width,height,{feather,colourBand:feather*3,matchBoundary,report});
 const editedShape=await orientedDimensions(edited);report.aspectMismatch=Math.round(Math.abs((editedShape.width/editedShape.height)/(width/height)-1)*1000)/1000;if(report.editablePixels)report.needsReview||=report.aspectMismatch>.08;
 return sharp(original.data,{raw:{width,height,channels:4}}).png().toBuffer();
}
