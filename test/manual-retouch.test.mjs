import test from 'node:test';
import assert from 'node:assert/strict';
import {renderManualPortrait,manualOperations} from '../public/manual-portrait-engine.js';
import {compositeNeutral} from '../public/manual-neutral.js';
const w=192,h=160;
function image({textureLeft=12,textureRight=12,left=90,right=150}={}){const out=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,amount=x<w/2?textureLeft:textureRight,base=x<w/2?left:right,value=base+(x%4<2?amount:-amount);out.set([value,value,value,255],i);}return out;}
const stroke=(tool,patch={})=>({tool,r:.3,strength:1,points:[[.75,.5]],separation:.035,...patch});
const value=(a,x=144,y=80)=>a[(y*w+x)*4];
test('low-band cloning moves tone while retaining the signed texture residual',()=>{
 const source=image(),op=stroke('low-clone',{sample:[.25,.5]}),result=renderManualPortrait(source,w,h,[op]).pixels;
 assert.ok(value(result)<value(source)-40);assert.ok(Math.abs((value(result,144)-value(result,146))-(value(source,144)-value(source,146)))<=2);
 assert.deepEqual(renderManualPortrait(source,w,h,JSON.parse(JSON.stringify([op]))).pixels,result);
 assert.equal(manualOperations([op])[0].separation,op.separation);
});
test('high-band cloning borrows detail without replacing the destination tone',()=>{
 const source=image({textureLeft:18,textureRight:0}),op=stroke('high-clone',{sample:[.25,.5]}),result=renderManualPortrait(source,w,h,[op]).pixels;
 const mean=(value(result,144)+value(result,146))/2;assert.ok(Math.abs(mean-150)<=2);assert.ok(value(result,144)-value(result,146)>25);
});
test('frequency soften reduces detail locally and low smoothing leaves a flat tone untouched',()=>{
 const source=image(),result=renderManualPortrait(source,w,h,[stroke('high-soften')]).pixels;
 assert.ok(Math.abs(value(result,144)-value(result,146))<3);
 const flat=image({textureLeft:0,textureRight:0,left:120,right:120});assert.deepEqual(renderManualPortrait(flat,w,h,[stroke('low-smooth')]).pixels,flat);
});
test('every advanced brush retains alpha, protected pixels and all bytes outside brush support',()=>{
 for(const tool of ['low-smooth','low-clone','high-clone','high-soften','gray-dodge','gray-burn','gray-erase']){
  const source=image();for(let i=3;i<source.length;i+=4)source[i]=i%7?210:0;
  const op=stroke(tool,{sample:[.25,.5]}),result=renderManualPortrait(source,w,h,[op]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;assert.equal(result.pixels[i+3],source[i+3]);if(Math.hypot(x-.75*w,y-.5*h)>=.3*Math.min(w,h))assert.deepEqual(result.pixels.subarray(i,i+4),source.subarray(i,i+4));}
  const protectedResult=renderManualPortrait(source,w,h,[{...op,tool:'protect'},op]);
  for(let p=0;p<w*h;p++)if(protectedResult.protection[p]===255)assert.deepEqual(protectedResult.pixels.subarray(p*4,p*4+4),source.subarray(p*4,p*4+4));
 }
});
test('neutral gray is an exact no-op; dodge, burn and erasure are replayable without a color cast',()=>{
 const source=image({textureLeft:0,textureRight:0,left:110,right:110});assert.deepEqual(compositeNeutral(source,new Int16Array(w*h)),source);
 const dodge=stroke('gray-dodge'),burn=stroke('gray-burn'),erase=stroke('gray-erase');
 const lighter=renderManualPortrait(source,w,h,[dodge]).pixels,darker=renderManualPortrait(source,w,h,[burn]).pixels;
 assert.ok(value(lighter)>110);assert.ok(value(darker)<110);
 for(let i=0;i<lighter.length;i+=4){assert.equal(lighter[i],lighter[i+1]);assert.equal(lighter[i],lighter[i+2]);}
 const erased=renderManualPortrait(source,w,h,[dodge,erase]).pixels;assert.equal(value(erased),110);
 const restored=renderManualPortrait(source,w,h,[dodge,{...erase,tool:'restore'}]).pixels;assert.equal(value(restored),110);
 assert.deepEqual(renderManualPortrait(source,w,h,[dodge]).pixels,lighter);assert.deepEqual(renderManualPortrait(source,w,h,[]).pixels,source);
});
test('diagnostic views are separate from export pixels and show an empty gray layer as 50 percent gray',()=>{
 const source=image(),ops=[stroke('gray-dodge')],composite=renderManualPortrait(source,w,h,ops).pixels;
 const gray=renderManualPortrait(source,w,h,[],{view:'gray'}).pixels;assert.equal(value(gray),128);
 const high=renderManualPortrait(source,w,h,ops,{view:'high',separation:.035}).pixels,low=renderManualPortrait(source,w,h,ops,{view:'low',separation:.035}).pixels;
 assert.notDeepEqual(high,composite);assert.notDeepEqual(low,composite);assert.deepEqual(renderManualPortrait(source,w,h,ops).pixels,composite);
 assert.throws(()=>manualOperations([stroke('high-clone')]));assert.throws(()=>manualOperations([stroke('low-smooth',{separation:NaN})]));assert.throws(()=>renderManualPortrait(source,w,h,[],{view:'hidden-export'}));
});
test('integer-aligned and image-edge texture samples remain finite across tiles and transparency',()=>{
 const width=600,height=96,source=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)source.set([130+(x%7<3?14:-14),120,100,x<3?0:255],(y*width+x)*4);
 const op={tool:'high-clone',r:.3,strength:.8,separation:.04,points:[[.1,.5],[.5,.5],[.9,.5]],sample:[0,.5]},result=renderManualPortrait(source,width,height,[op]).pixels;
 assert.ok(result.some((v,i)=>i%4!==3&&v!==source[i]));for(let i=3;i<source.length;i+=4)assert.equal(result[i],source[i]);assert.deepEqual(renderManualPortrait(source,width,height,[op]).pixels,result);
});
