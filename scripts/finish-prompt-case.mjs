import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {prepareEditImage,finishEditImage,applyProtectionMask} from '../lib/images.mjs';
import {normalizeEditOptions} from '../lib/painting.mjs';
import {expandedCanvas,upscaleOutput} from '../backend/feature-images.mjs';
const [caseFile,rawFile,output]=process.argv.slice(2);if(!output)throw Error('Specify case JSON, raw output and final output.');
const job=JSON.parse(await readFile(caseFile,'utf8')),options=normalizeEditOptions(job.options),source=await readFile(job.source.file),p=await prepareEditImage(source,options.selection);let original=p.source,region=p.region,mask=null;const report={};
if(job.expansion){const e=await expandedCanvas(original,options.task);original=e.bytes;region=null;mask=e.mask;}
let result=await finishEditImage(await readFile(rawFile),original,region,{report});
if(mask)result=await applyProtectionMask(result,original,mask,{report:report.expansion={}});
if(options.scene?.protectSubject){if(!job.source.mask)throw Error('This case requires a reviewed subject mask.');result=await applyProtectionMask(result,original,await readFile(job.source.mask),{report:report.protection={}});}
if(job.id==='detail-upscale')result=await upscaleOutput(result,options.task);
await writeFile(output,result);const m=await sharp(result).metadata();await writeFile(output+'.json',JSON.stringify({width:m.width,height:m.height,report},null,2));console.log(JSON.stringify({output,width:m.width,height:m.height,needsReview:report.needsReview}));
