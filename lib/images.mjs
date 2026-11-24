import sharp from 'sharp';

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

export async function finishEditImage(generated, source, region) {
  if (!Buffer.isBuffer(generated) || generated.length > 64 * 1024 * 1024) throw new Error('生成的图片文件无效或过大。');
  let normalized;
  try { normalized = await sharp(generated, OPTIONS).rotate().toColourspace('srgb').png().toBuffer(); }
  catch { throw new Error('生成结果不是可读取的图片文件。'); }
  if (!region) return normalized;
  // Only the selected rectangle is composited. Pixels outside it remain from the original.
  const patch = await sharp(normalized).resize(region.edit.width, region.edit.height, { fit: 'fill' })
    .extract({ left: region.left - region.edit.left, top: region.top - region.edit.top, width: region.width, height: region.height })
    .removeAlpha().toBuffer();
  const smoothing=region.smoothing;
  if(smoothing&&(!Number.isFinite(smoothing.featherRatio)||smoothing.featherRatio<=0||smoothing.featherRatio>.5||!Number.isInteger(smoothing.maxFeather)||smoothing.maxFeather<1||smoothing.maxFeather>256||smoothing.curve!=='smoothstep'))throw new Error('局部过渡设置无效。');
  const feather = Math.max(1, Math.min(smoothing?.maxFeather||16, Math.floor(Math.min(region.width, region.height) * (smoothing?.featherRatio||0.035))));
  const alpha = Buffer.alloc(region.width * region.height);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const edge = Math.min(x, y, region.width - 1 - x, region.height - 1 - y);
      const t=Math.min(1,edge/feather);
      alpha[y * region.width + x] = Math.round(255 * (smoothing?t*t*(3-2*t):t));
    }
  }
  const overlay = await sharp(patch).joinChannel(alpha, { raw: { width: region.width, height: region.height, channels: 1 } }).png().toBuffer();
  return sharp(source).composite([{ input: overlay, left: region.left, top: region.top }]).png().toBuffer();
}

export async function applyProtectionMask(edited,source,mask){
 const original=await sharp(source,OPTIONS).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width,height}=original.info;
 const metadata=await sharp(mask,OPTIONS).metadata();if(Math.abs(metadata.width/metadata.height-width/height)>.025)throw Error('人物蒙版与当前图片长宽比不一致，请重新分析或上传对应蒙版。');
 const alpha=await sharp(mask,OPTIONS).resize(width,height,{fit:'fill'}).flatten({background:'#000000'}).removeAlpha().greyscale().raw().toBuffer(),result=await sharp(edited,OPTIONS).resize(width,height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 for(let p=0;p<width*height;p++){const a=alpha[p]/255;if(a===0)continue;for(let c=0;c<4;c++){const i=p*4+c;original.data[i]=Math.round(original.data[i]+(result[i]-original.data[i])*a);}}
 return sharp(original.data,{raw:{width,height,channels:4}}).png().toBuffer();
}
