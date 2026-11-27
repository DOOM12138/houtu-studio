import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { exportProcess } from '../backend/local-image.mjs';
import { maskAlpha } from '../frontend/masks.js';
import { renderManualPortrait, manualOperations } from '../public/manual-portrait-engine.js';

const w=100,h=100;
const pixels=new Uint8ClampedArray(w*h*4).fill(128);
for(let p=3;p<pixels.length;p+=4)pixels[p]=255;
const sparse=[[.205,.505],[.805,.505]];
const dense=Array.from({length:13},(_,i)=>[.205+.05*i,.505]);
const at=(x,y)=>y*w+x;

test('a single color mask stroke has identical coverage for sparse and dense paths',()=>{
 const stroke={coverage:'continuous',radius:.10,softness:.65,flow:1,mode:'add'};
 const renderPoints=points=>maskAlpha({type:'brush',strokes:[{...stroke,points}]},w,h,pixels,null);
 const sparseMask=renderPoints(sparse),denseMask=renderPoints(dense);
 assert.deepEqual(sparseMask,denseMask);
 assert.equal(sparseMask[at(50,57)],118);
 assert.equal(sparseMask[at(50,61)],0);
 const subtract=maskAlpha({type:'brush',invert:true,strokes:[{...stroke,mode:'subtract',points:sparse}]},w,h,pixels,null);
 assert.equal(subtract[at(50,57)],137);
 assert.equal(subtract[at(50,61)],255);
 assert.equal(renderPoints([sparse[0]])[at(20,57)],118);
 const legacy=maskAlpha({type:'brush',strokes:[{...stroke,coverage:undefined,points:sparse}]},w,h,pixels,null);
 assert.notDeepEqual(legacy,sparseMask);
});

test('continuous neutral gray paths cover the middle and remain identical across pointer density and restore',()=>{
 const sample=at(50,50)*4;
 const brush={tool:'gray-dodge',r:.10,strength:.6,continuous:true,points:sparse};
 const sparseResult=renderManualPortrait(pixels,w,h,[brush]).pixels;
 const denseResult=renderManualPortrait(pixels,w,h,[{...brush,points:dense}]).pixels;
 assert.deepEqual(sparseResult,denseResult);
 assert.ok(sparseResult[sample]>pixels[sample]);
 assert.equal(renderManualPortrait(pixels,w,h,[{...brush,continuous:undefined}]).pixels[sample],pixels[sample]);
 assert.equal(manualOperations([brush])[0].continuous,true);
 const burn=renderManualPortrait(pixels,w,h,[{...brush,tool:'gray-burn'}]).pixels;
 assert.ok(burn[sample]<pixels[sample]);
 const erased=renderManualPortrait(pixels,w,h,[brush,{...brush,tool:'gray-erase',strength:1}]).pixels;
 assert.deepEqual(erased.subarray(sample,sample+4),pixels.subarray(sample,sample+4));
});

test('recipe WebP quality 100 preserves visible RGB and alpha while lower quality stays lossy',async()=>{
 const data=Buffer.from([0,0,0,0, 0,210,161,10, 239,196,228,200, 220,254,254,255]);
 const input=await sharp(data,{raw:{width:4,height:1,channels:4}}).png().toBuffer();
 const high=await exportProcess(input,{format:'webp',quality:100});
 const lower=await exportProcess(input,{format:'webp',quality:90});
 assert.equal(high.lossless,true);
 assert.equal(lower.lossless,false);
 assert.deepEqual(await sharp(high.bytes).ensureAlpha().raw().toBuffer(),data);
 const decoded=await sharp(lower.bytes).ensureAlpha().raw().toBuffer();
 assert.notDeepEqual(decoded.subarray(4),data.subarray(4));
 assert.deepEqual([high.width,high.height],[4,1]);
 assert.equal(high.bytes.subarray(12,16).toString(),'VP8L');
});
