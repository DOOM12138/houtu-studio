import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';import {WorkflowStore} from '../backend/workflows.mjs';import {ImageImports} from '../backend/image-imports.mjs';import {rawFixture} from './helpers/raw-fixture.mjs';
import {bmpPixels} from '../backend/bmp-image.mjs';
import {encodeVLog,parseCube,sampleCube,renderVLog} from '../backend/raw-vlog.mjs';
import {workflowImage} from '../lib/workflow-image.mjs';
import {originalImageSignature} from '../public/image-formats.js';

function bitmapFixture(bits=24,topDown=false){const stride=bits===24?8:8,b=Buffer.alloc(54+stride*2);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(2,18);b.writeInt32LE(topDown?-2:2,22);b.writeUInt16LE(1,26);b.writeUInt16LE(bits,28);const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,255]];for(let y=0;y<2;y++)for(let x=0;x<2;x++){const rgb=colors[y*2+x],at=54+(topDown?y:1-y)*stride+x*bits/8;b[at]=rgb[2];b[at+1]=rgb[1];b[at+2]=rgb[0];if(bits===32)b[at+3]=(x+y+1)*32;}return b;}

test('BMP padded rows and legacy alpha decode correctly and a failed RAW can be reopened without losing its original',async t=>{const expected=Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);for(const bits of [24,32])for(const topDown of [true,false])assert.deepEqual(bmpPixels(bitmapFixture(bits,topDown),4).data,expected);const directory=await fs.mkdtemp(path.join(os.tmpdir(),'import-recovery-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=new WorkflowStore(directory);await store.load();const importer=new ImageImports(store);t.after(()=>importer.close());const bmp=bitmapFixture(),result=await importer.create(bmp,'uncompressed.bmp');const image=await store.asset(result.workflowId,result.imageAsset),pixels=await sharp(image.file).ensureAlpha().raw().toBuffer();assert.deepEqual(pixels,Buffer.from(expected));const corrupt=Buffer.from(rawFixture());corrupt.fill(0,8);let id;await assert.rejects(importer.create(corrupt,'broken.dng'),e=>{id=e.workflowId;return Boolean(id);});const failed=await importer.view(id);assert.equal(failed.status,'error');assert.equal(failed.imageUrl,undefined);assert.match(failed.originalUrl,/original$/);assert.deepEqual(await fs.readFile((await importer.original(id)).file),corrupt);const attempt=(await store.get(id)).steps.find(s=>s.id==='develop').attempts.at(-1);assert.deepEqual(attempt.parameters,{exposure:0,whiteBalance:'camera'});assert.ok(failed.error);});
test('local RAW import decodes sensor samples, retains exact original bytes and a 16-bit master, and re-develops without replacing history',async t=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'raw-import-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=new WorkflowStore(directory);await store.load();const importer=new ImageImports(store);t.after(()=>importer.close());const original=rawFixture(),first=await importer.create(original,'synthetic.dng');assert.equal(first.masterBits,16);assert.equal(first.editingBits,8);assert.equal(first.editingSpace,'sRGB');assert.equal(first.metadata.model,'Synthetic Bayer');const saved=await importer.original(first.workflowId);assert.deepEqual(await fs.readFile(saved.file),original);const master=await store.asset(first.workflowId,first.masterAsset),preview=await store.asset(first.workflowId,first.imageAsset);assert.equal((await sharp(master.file).metadata()).bitsPerSample,16);assert.equal((await sharp(preview.file).metadata()).bitsPerSample,8);assert.equal(first.width,64);assert.equal(first.height,96);const next=await importer.develop(first.workflowId,{exposure:-1,whiteBalance:'camera',halfSize:false});assert.notEqual(next.imageAsset,first.imageAsset);const workflow=await store.get(first.workflowId);assert.equal(workflow.steps.find(s=>s.id==='develop').attempts.length,2);assert.deepEqual(await fs.readFile(saved.file),original);});
test('bitmap import retains TIFF high-bit input and invalid RAW parameters fail before conversion',async t=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bitmap-import-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=new WorkflowStore(directory);await store.load();const importer=new ImageImports(store);t.after(()=>importer.close());const tiff=await sharp({create:{width:20,height:30,channels:3,background:'#987b66'}}).tiff().toBuffer(),output=await importer.create(tiff,'sample.tiff');assert.equal(output.isRaw,false);assert.equal(output.width,20);assert.equal(output.height,30);await assert.rejects(importer.create(Buffer.from('not a sensor file'),'bad.dng'),/请选择/);assert.throws(()=>importer.options({exposure:Infinity}),/参数/);assert.throws(()=>importer.options({whiteBalance:'remote'}),/参数/);});

const identityCube = 'TITLE "identity"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
test('V-Log follows Panasonic code values and interpolates valid 3D .cube tables in RGB order',()=>{
 for(const [value,code] of [[0,128],[.18,433],[.9,602]])assert.equal(Math.round(encodeVLog(value)*1023),code);
 // Decode the V-Log primaries and reproduce the input with Panasonic's published forward matrix.
 const fromVGamut=[[1.806576,-.695697,-.110879],[-.170090,1.305955,-.135865],[-.025206,-.154468,1.179674]];
 const identity=[[1,0,0],[0,1,0],[0,0,1]];
 for(const rgb of identity){
  const data=Uint16Array.from(rgb,n=>n*65535);
  const {master}=renderVLog({data,colors:3},identity,0);
  const linear=Array.from(master,n=>10**((n/65535-.598206)/.241514)-.00873);
  const restored=fromVGamut.map(row=>row.reduce((sum,n,i)=>sum+n*linear[i],0));
  restored.forEach((value,i)=>assert.ok(Math.abs(value-rgb[i])<.0002));
 }
 const lut=parseCube(identityCube.replace('LUT_3D_SIZE 2','LUT_3D_SIZE 2\nLUT_3D_INPUT_RANGE 0.1 0.9'));
 const out=new Float64Array(3);
 for(const rgb of [[.13,.52,.85],[.13,.85,.52],[.52,.13,.85],[.52,.85,.13],[.85,.13,.52],[.85,.52,.13],[.9,.1,.9]]){
  sampleCube(lut,...rgb,out);
  for(let i=0;i<3;i++)assert.ok(Math.abs(out[i]-(rgb[i]-.1)/.8)<1e-6);
 }
 for(const malformed of ['LUT_1D_SIZE 2\n0 0 0\n1 1 1',identityCube+'0 0 0',identityCube.replace('0 0 0','no data'),identityCube.replace('SIZE 2','SIZE 666'),identityCube.replace('LUT_3D_SIZE 2','DOMAIN_MAX 0 0 0\nLUT_3D_SIZE 2')]){
  assert.throws(()=>parseCube(malformed),/3D/);
 }
 const rw2=Buffer.alloc(24);rw2.write('II');rw2[2]=0x55;
 assert.ok(originalImageSignature(rw2));
});
test('RAW V-Log and LUT use retained sensor data, retain 16-bit precision and pin each attempt',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'raw-vlog-'));
 const workflows=new WorkflowStore(directory);await workflows.load();
 const importer=new ImageImports(workflows);t.after(async()=>{await importer.close();await fs.rm(directory,{recursive:true,force:true});});
 const original=rawFixture();
 const before=await importer.create(original,'sensor.dng');
 const gray=await importer.develop(before.workflowId,{profile:'vlog',fromAttempt:before.source.attemptId});
 const lut=await importer.applyVLogLut(before.workflowId,Buffer.from(identityCube),'identity.cube',gray.source.attemptId);
 assert.equal(gray.masterSpace,'Panasonic V-Log / V-Gamut');
 assert.equal(lut.masterSpace,'LUT 输出 · Rec.709');
 assert.notEqual(gray.imageAsset,before.imageAsset);
 assert.equal(lut.imageAsset,gray.imageAsset);
 assert.equal(lut.masterAsset,gray.masterAsset);
 assert.notEqual(lut.source.attemptId,gray.source.attemptId);
 const master=(await workflows.asset(gray.workflowId,gray.masterAsset)).file;
 assert.equal((await sharp(master).metadata()).bitsPerSample,16);
 const data=await sharp(master).pipelineColourspace('rgb16').toColourspace('rgb16').raw({depth:'ushort'}).toBuffer();
 assert.ok(data.some((low,i)=>i%2===0&&low!==data[i+1]),'16-bit samples retain sub-8-bit precision');
 assert.equal((await workflowImage(workflows,before.source)).origin.attemptId,before.source.attemptId);
 assert.equal((await workflowImage(workflows,gray.source)).origin.attemptId,gray.source.attemptId);
 const savedLut=await workflows.asset(lut.workflowId,lut.options.lutAsset);
 assert.deepEqual(await fs.readFile(savedLut.file),Buffer.from(identityCube));
 assert.deepEqual(await fs.readFile((await importer.original(before.workflowId)).file),original);
 await assert.rejects(importer.applyVLogLut(before.workflowId,Buffer.from('LUT_3D_SIZE 2'),'invalid.cube',gray.source.attemptId),/3D/);
 await assert.rejects(importer.develop(before.workflowId,{profile:'vlog',fromAttempt:'absent'}),/显影版本不可用/);
 assert.equal((await importer.view(before.workflowId)).source.attemptId,lut.source.attemptId);
});
