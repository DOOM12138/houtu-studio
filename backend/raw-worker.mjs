// Short-lived local worker. Camera files never go to an AI provider.
import {workerData,parentPort} from 'node:worker_threads';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import sharp from 'sharp';import createLibRaw from 'libraw-wasm/dist/libraw.js';import {bmpPixels} from './bmp-image.mjs';
import {renderVLog} from './raw-vlog.mjs';
let stage='读取原片';
try{
 const {file,raw,options,maxPixels,lut}=workerData,bytes=await fs.readFile(file);let metadata={},master,rendered,width,height,halfSize=false;

 if (raw) {
  stage = 'RAW解码';
  const wasmBinary = await fs.readFile(fileURLToPath(new URL('../node_modules/libraw-wasm/dist/libraw.wasm',import.meta.url)));
  const core = await createLibRaw({wasmBinary}), decoder = new core.LibRaw();
  try {
   const log = options.profile === 'vlog' || options.profile === 'vlog-lut';
   const settings = {
    useCameraWb: options.whiteBalance === 'camera', useAutoWb: options.whiteBalance === 'auto',
    outputColor: 1, outputBps: 16, userQual: 3, noAutoBright: true, userFlip: -1,
    expCorrec: true, expShift: 2 ** options.exposure, expPreser: .5, halfSize: Boolean(options.halfSize),
    ...(log ? {gamm: [1, 1], outputColor: 0, expCorrec: false, highlight: 1} : {})
   };
   decoder.open(new Uint8Array(bytes), settings);
   const meta = decoder.metadata(false), pixels = Number(meta.width) * Number(meta.height);
   if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > 160000000) throw Error('RAW尺寸超出本机解码上限。');
   halfSize = settings.halfSize;
   if (pixels > maxPixels && !halfSize) {
    if (options.halfSize === false) throw Error('此RAW像素较大，请开启半尺寸显影。');
    halfSize = true;
    decoder.open(new Uint8Array(bytes), {...settings, halfSize: true});
   }
   const image = decoder.imageData();
   const channels = log ? [1, 3, 4] : [1, 3], length = image.width * image.height * image.colors;
   if (!Number.isInteger(image.width) || image.width * image.height > maxPixels || !channels.includes(image.colors)
    || !(image.data instanceof Uint16Array) || image.bits !== 16 || image.data.length !== length) {
    throw Error('RAW解码结果尺寸或位深不受支持。');
   }
   ({width, height} = image);
   stage = '编码16位母版';
   if (log) {
    const matrix = decoder.metadata(true).color_data?.rgb_cam;
    const result = renderVLog(image, matrix, options.exposure, lut);
    const raw = {width, height, channels: 3};
    master = await sharp(result.master,{raw}).pipelineColourspace('rgb16').toColourspace('rgb16').png().toBuffer();
    rendered = await sharp(result.preview,{raw}).png().toBuffer();
   } else {
    master = await sharp(image.data,{raw:{width,height,channels:image.colors}}).toColourspace('rgb16').png().toBuffer();
   }
   metadata = {
    make: String(meta.camera_make || '').slice(0,80), model: String(meta.camera_model || '').slice(0,100),
    sensorWidth: Number(meta.raw_width) || null, sensorHeight: Number(meta.raw_height) || null,
    iso: Number(meta.iso_speed) || null, shutter: Number(meta.shutter) || null,
    aperture: Number(meta.aperture) || null, orientation: Number(meta.flip) || 0
   };
  } finally {
   decoder.delete();
  }
 }else if(bytes.subarray(0,2).toString()==='BM'){const bitmap=bmpPixels(bytes,maxPixels);width=bitmap.width;height=bitmap.height;master=await sharp(bitmap.data,{raw:{width,height,channels:4}}).toColourspace('rgb16').png().toBuffer();metadata={inputFormat:'bmp',inputDepth:'uchar'};}
 else{const image=sharp(bytes,{limitInputPixels:maxPixels,animated:false}).rotate(),meta=await image.metadata();width=meta.autoOrient?.width||meta.width;height=meta.autoOrient?.height||meta.height;master=await image.toColourspace('rgb16').png().toBuffer();metadata={inputFormat:meta.format,inputDepth:meta.depth||null,firstFrameOnly:(meta.pages||1)>1};}
 stage='生成编辑位图';rendered??=await sharp(master,{limitInputPixels:maxPixels}).toColourspace('srgb').png().toBuffer();const outputMeta=await sharp(rendered).metadata();const masterCopy=Uint8Array.from(master),renderedCopy=Uint8Array.from(rendered);parentPort.postMessage({master:masterCopy,rendered:renderedCopy,width:outputMeta.width,height:outputMeta.height,metadata,halfSize,decoder:raw?'LibRaw-WASM 1.6.0':'Sharp',masterBits:16,editingBits:8,editingSpace:'sRGB'},[masterCopy.buffer,renderedCopy.buffer]);
}catch(e){parentPort.postMessage({error:stage+'：'+e.message});}finally{parentPort.close();}
