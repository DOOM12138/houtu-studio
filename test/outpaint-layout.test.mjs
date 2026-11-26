import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {outpaintCanvas,outpaintLayout} from '../public/outpaint-layout.js';import {expandedCanvas} from '../backend/feature-images.mjs';import {taskOptions} from '../public/prompt-contract.js';
test('legacy directions and boundary percentages retain their published canvas sizes',()=>{
 for(const [direction,width,height,left,top]of [['all',148,180,26,26],['left',122,128,26,0],['right',122,128,0,0],['top',96,154,0,26],['bottom',96,154,0,0]]){const layout=outpaintLayout(96,128,{padding:20,direction});assert.deepEqual([layout.width,layout.height,layout.left,layout.top],[width,height,left,top]);}
 assert.equal(outpaintLayout(96,128,{padding:5,direction:'left'}).width,112);assert.equal(outpaintLayout(96,128,{padding:50,direction:'left'}).width,160);
});
test('independent sides and fixed ratios add canvas without cropping or rescaling the original',()=>{
 assert.deepEqual(outpaintLayout(96,128,{canvas:{mode:'sides',left:10,right:0,top:25,bottom:0}}),{left:13,right:0,top:32,bottom:0,width:109,height:160,originalWidth:96,originalHeight:128});
 assert.deepEqual(outpaintLayout(96,128,{canvas:{mode:'ratio',ratio:'1:1'}}),{left:16,right:16,top:0,bottom:0,width:128,height:128,originalWidth:96,originalHeight:128});
 const wide=outpaintLayout(96,128,{canvas:{mode:'ratio',ratio:'16:9'}});assert.deepEqual([wide.width,wide.height],[228,128]);
 const portrait=outpaintLayout(4000,6000,{canvas:{mode:'ratio',ratio:'4:5'}});assert.deepEqual([portrait.width,portrait.height],[4800,6000]);
});
test('invalid, unchanged and oversized canvas requests fail before any image generation',()=>{
 assert.throws(()=>outpaintLayout(96,128,{canvas:{mode:'sides',left:0,right:0,top:0,bottom:0}}),/没有新增/);assert.throws(()=>outpaintLayout(96,96,{canvas:{mode:'ratio',ratio:'1:1'}}),/没有新增/);assert.throws(()=>outpaintLayout(4000,6000,{padding:20}),/4000万/);
 for(const value of [[],{mode:'crop'},{mode:'ratio',ratio:'4:3'},{mode:'sides',left:-1,right:0,top:0,bottom:0},{mode:'sides',left:NaN,right:0,top:0,bottom:0}])assert.throws(()=>outpaintCanvas(value));
 const canvas={mode:'sides',left:10,right:5,top:0,bottom:0};assert.deepEqual(taskOptions({canvas}).canvas,canvas);assert.equal(taskOptions({}).canvas,undefined);
});
test('prepared pixels and edit masks agree with the shared layout for every direction and new mode',async()=>{
 const raw=Buffer.alloc(96*128*4);for(let y=0;y<128;y++)for(let x=0;x<96;x++){const i=(y*96+x)*4;raw.set([x*2,y*2,90,x<3?80:255],i);}const source=await sharp(raw,{raw:{width:96,height:128,channels:4}}).png().toBuffer();
 for(const task of [...['all','left','right','top','bottom'].map(direction=>({direction,padding:20})),{canvas:{mode:'sides',left:10,right:0,top:25,bottom:0}},{canvas:{mode:'ratio',ratio:'16:9'}}]){
  const prepared=await expandedCanvas(source,task),expected=outpaintLayout(96,128,task);assert.deepEqual(prepared.layout,expected);
  const image=await sharp(prepared.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),mask=await sharp(prepared.mask).greyscale().raw().toBuffer();assert.equal(image.info.width,expected.width);assert.equal(image.info.height,expected.height);
  for(let y=0;y<expected.height;y++)for(let x=0;x<expected.width;x++){const inside=x>=expected.left&&x<expected.left+96&&y>=expected.top&&y<expected.top+128;assert.equal(mask[y*expected.width+x],inside?0:255);if(inside){const a=((y-expected.top)*96+x-expected.left)*4,b=(y*expected.width+x)*4;assert.deepEqual(image.data.subarray(b,b+4),raw.subarray(a,a+4));}}
 }
});
