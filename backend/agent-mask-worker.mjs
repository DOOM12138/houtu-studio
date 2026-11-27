import {parentPort} from 'node:worker_threads';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import sharp from 'sharp';import * as ort from 'onnxruntime-node';
import {guideMaskEdges} from './agent-mask-edges.mjs';
parentPort.once('message',async({bytes})=>{let session;try{
 const model=await fs.readFile(fileURLToPath(new URL('../models/agent/person-segmentation.onnx',import.meta.url)));if(createHash('sha256').update(model).digest('hex')!=='3241ac4ad8aa35bdaf33946776db29f7c283a413aa0b0dacb9483594b4531aad')throw Error('主体分割模型校验失败，请修复安装。');
 const mobile=process.platform==='android';if(mobile){ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;sharp.concurrency(1);sharp.cache({memory:16,files:0,items:8});}
 const input=Buffer.from(bytes),meta=await sharp(input,{limitInputPixels:40000000}).metadata(),swap=meta.orientation>=5&&meta.orientation<=8,width=swap?meta.height:meta.width,height=swap?meta.width:meta.height;
 const rgb=await sharp(input,{limitInputPixels:40000000}).rotate().flatten({background:'white'}).toColourspace('srgb').resize(256,256,{fit:'fill',kernel:'cubic'}).removeAlpha().raw().toBuffer(),values=new Float32Array(3*256*256);
 for(let i=0;i<256*256;i++)for(let c=0;c<3;c++)values[c*256*256+i]=rgb[i*3+c]/255;
 session=await ort.InferenceSession.create(model,{executionProviders:[mobile?'wasm':'cpu'],intraOpNumThreads:1,interOpNumThreads:1,executionMode:'sequential'});const output=await session.run({pixel_values:new ort.Tensor('float32',values,[1,3,256,256])}),alpha=output.alphas.data,mask=Buffer.alloc(256*256);let selected=0,confidence=0;
 for(let i=0;i<mask.length;i++){const a=Math.max(0,Math.min(1,alpha[i]));mask[i]=Math.round(a*255);if(a>.5){selected++;confidence+=a;}}
 const coverage=selected/mask.length,meanConfidence=selected?confidence/selected:0;
 const edgeSize=mobile?640:1024;
 const guide=await sharp(input,{limitInputPixels:40000000}).rotate().flatten({background:'white'}).toColourspace('srgb').removeAlpha().resize({width:edgeSize,height:edgeSize,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
 const edgeWidth=guide.info.width,edgeHeight=guide.info.height;
 const coarse=await sharp(mask,{raw:{width:256,height:256,channels:1}}).resize(edgeWidth,edgeHeight,{fit:'fill',kernel:'cubic'}).greyscale().raw().toBuffer();
 const refined=guideMaskEdges(guide.data,coarse,edgeWidth,edgeHeight);
 const png=await sharp(refined,{raw:{width:edgeWidth,height:edgeHeight,channels:1}}).resize(width,height,{fit:'fill',kernel:'cubic'}).png().toBuffer();
 parentPort.postMessage({mask:png,width,height,coverage,confidence:meanConfidence,found:coverage>.005&&coverage<.98,requiresReview:coverage<.01||coverage>.92||meanConfidence<.7,refinement:'guided-luminance-v1',engine:mobile?'mediapipe-onnx-wasm':'mediapipe-onnx-cpu',model:'mediapipe-selfie-segmentation',modelSha256:'3241ac4ad8aa35bdaf33946776db29f7c283a413aa0b0dacb9483594b4531aad'});
 }catch(e){parentPort.postMessage({error:e.message});}finally{await session?.release();parentPort.close();}});
