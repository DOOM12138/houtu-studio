import assert from 'node:assert/strict';
import test from 'node:test';
import {renderManualPortrait,manualOperations} from '../public/manual-portrait-engine.js';
import {maskAlpha} from '../frontend/masks.js';
import {normalizePreset} from '../backend/color.mjs';

test('frequency paths cross internal tiles regardless of point density and keep alpha and protected pixels',()=>{
 const width=900,height=176;
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=(y*width+x)*4,v=Math.round(90+22*Math.sin(x*.045)+18*Math.sin(y*.08)+(x%6<3?23:-23));
  pixels.set([v,v+18,v+26,x<4?0:220],a);
 }
 const sparse=[[.05,.68],[.95,.68]],dense=Array.from({length:85},(_,i)=>[.05+.90*i/84,.68]);
 const protection={tool:'protect',r:.025,strength:1,points:[[.63,.68]]};
 for(const tool of ['low-smooth','high-soften','low-clone','high-clone']){
  const params={tool,r:.10,strength:.8,separation:.024,continuous:true,sample:[.05,.37]};
  const a=renderManualPortrait(pixels,width,height,[protection,{...params,points:sparse}]);
  const b=renderManualPortrait(pixels,width,height,[protection,{...params,points:dense}]);
  assert.deepEqual(a.pixels,b.pixels,tool);
  const legacy=renderManualPortrait(pixels,width,height,[protection,{...params,continuous:false,points:sparse}]).pixels;
  const across=Array.from({length:80},(_,j)=>(Math.round(height*.68)*width+390+j)*4);
  assert.ok(across.some(i=>a.pixels[i]!==legacy[i]),tool);
  for(let i=0;i<pixels.length;i+=4){
   assert.equal(a.pixels[i+3],pixels[i+3]);
   if(a.protection[i/4]===255||Math.abs(Math.floor(i/4/width)-height*.68)>height*.1)assert.deepEqual(a.pixels.subarray(i,i+4),pixels.subarray(i,i+4));
  }
  assert.equal(manualOperations([{...params,points:sparse}])[0].continuous,true);
 }
});

test('new radial and diagonal gradients retain pixel geometry and preserve legacy and shared preset settings',()=>{
 const width=301,height=101,data=new Uint8ClampedArray(width*height*4);
 const at=(a,x,y)=>a[y*width+x];
 const radial={type:'radial',geometry:'pixel'};
 const circle=maskAlpha(radial,width,height,data,null);
 assert.equal(at(circle,184,50),at(circle,150,84));
 assert.equal(at(circle,195,50),0);
 const old=maskAlpha({type:'radial'},width,height,data,null);
 assert.notEqual(at(old,184,50),at(old,150,84));
 const diagonal=maskAlpha({type:'linear',angle:45,geometry:'pixel'},width,height,data,null);
 assert.equal(at(diagonal,180,50),at(diagonal,150,80));
 assert.equal(at(diagonal,150,50),128);
 const shared=normalizePreset({name:'Gradient',settings:{},layers:[radial,{type:'linear',angle:45},{type:'brush',geometry:'pixel'}]});
 assert.equal(shared.layers[0].geometry,'pixel');
 assert.equal(shared.layers[1].geometry,undefined);
 assert.equal(shared.layers.length,2);
});
