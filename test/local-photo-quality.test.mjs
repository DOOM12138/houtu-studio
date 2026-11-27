import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { exportProcess, localProcess } from '../backend/local-image.mjs';
import { recipeValue } from '../backend/studio-recipe.mjs';
import { manualOperations, renderManualPortrait } from '../public/manual-portrait-engine.js';

const strip=Buffer.from([255,0,0,255, 255,255,0,255, 0,255,0,255, 255,0,255,255, 0,0,255,255, 0,255,255,255]);
const photo=await sharp(strip,{raw:{width:3,height:2,channels:4}}).png().toBuffer();
const rgba=img=>sharp(img).ensureAlpha().raw().toBuffer();

test('quarter-turn followed by a flip acts on the output axes with legacy recipe replay intact',async()=>{
  const order=(indices)=>Buffer.concat(indices.map(i=>strip.subarray(i*4,(i+1)*4)));
  const cases=[
    [90,true,false,[0,3,1,4,2,5]],
    [270,true,false,[5,2,4,1,3,0]],
    [90,false,true,[5,2,4,1,3,0]],
    [90,true,true,[2,5,1,4,0,3]],
  ];
  for(const [rotate,flipX,flipY,positions] of cases){
    const recipe=recipeValue({stages:[{type:'local',options:{rotate,flipX,flipY,flipSpace:'output'}},{type:'export'}]});
    const result=await localProcess(photo,recipe.stages[0].options);
    assert.deepEqual(await rgba(result),order(positions));
    const meta=await sharp(result).metadata();
    assert.deepEqual([meta.width,meta.height],[2,3]);
  }
  assert.deepEqual(await rgba(await localProcess(photo,{rotate:90,flipX:true})),order([5,2,4,1,3,0]));
});

test('quality 95 JPEG exports retain full chroma and keep resized dimensions',async()=>{
  const image=await sharp(strip,{raw:{width:3,height:2,channels:4}}).resize(96,64,{kernel:'nearest'}).png().toBuffer();
  const normal=await exportProcess(image,{format:'jpeg',quality:94,maxEdge:48});
  const high=await exportProcess(image,{format:'jpeg',quality:95,maxEdge:48});
  assert.equal(normal.chromaSubsampling,'4:2:0');
  assert.equal(high.chromaSubsampling,'4:4:4');
  assert.deepEqual([high.width,high.height],[48,32]);
  const png=await exportProcess(image,{format:'png'});
  assert.equal(png.chromaSubsampling,undefined);
  assert.deepEqual(await rgba(png.bytes),await rgba(image));
});

test('new texture strokes join sparse points without crossing source bounds and keep saved legacy brushes compatible',()=>{
  const w=96,h=64;
  const original=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    original.set(y<24?[222,210,190,255]:[29,44,31,255],(y*w+x)*4);
  }
  const brush={tool:'clone',sample:[.10,.22],r:.09,strength:1,points:[[.2,.55],[.8,.55]]};
  const modern=manualOperations([{...brush,continuous:true}]);
  assert.equal(modern[0].continuous,true);
  const newer=renderManualPortrait(original,w,h,JSON.parse(JSON.stringify(modern))).pixels;
  const old=renderManualPortrait(original,w,h,[brush]).pixels;
  const index=(35*w+48)*4;
  assert.ok(newer[index]>190);
  assert.equal(old[index],original[index]);
  const edge={...brush,points:[[.5,.55]],sample:[.01,.22],r:.23};
  const protectedEdge=renderManualPortrait(original,w,h,[{...edge,continuous:true}]).pixels;
  const legacyEdge=renderManualPortrait(original,w,h,[edge]).pixels;
  const noSample=(35*w+43)*4;
  assert.equal(protectedEdge[noSample],original[noSample]);
  assert.ok(legacyEdge[noSample]>original[noSample]);
});
