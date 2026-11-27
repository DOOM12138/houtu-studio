import test from 'node:test';import assert from 'node:assert/strict';import {renderManualPortrait,manualOperations} from '../public/manual-portrait-engine.js';
const w=96,h=112;function fixture(){const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;a[i]=x*2;a[i+1]=y*2;a[i+2]=(x%8<4?95:170);a[i+3]=x<6?80:255;}return a;}
test('reset and protection clearing remain undoable vector actions after reopening a manual record',()=>{const a=fixture(),brush={r:.15,strength:1,points:[[.5,.5]]},protect={...brush,tool:'protect'},edit={...brush,tool:'dodge'},clear={...brush,tool:'clear-protection'},reset={...brush,tool:'reset'},locked=renderManualPortrait(a,w,h,[protect,edit]),cleared=renderManualPortrait(a,w,h,[protect,edit,clear]);assert.ok(locked.protection.some(v=>v===255));assert.ok(cleared.protection.every(v=>v===0));assert.notDeepEqual(cleared.pixels,locked.pixels);const ops=JSON.parse(JSON.stringify([protect,edit,clear,reset]));assert.deepEqual(renderManualPortrait(a,w,h,ops).pixels,a);ops.pop();assert.deepEqual(renderManualPortrait(a,w,h,ops).pixels,cleared.pixels);ops.pop();assert.deepEqual(renderManualPortrait(a,w,h,ops).pixels,locked.pixels);});
test('manual body deformation changes the selected area and preserves every RGBA byte outside its smooth support',()=>{const a=fixture(),op={tool:'push',r:.18,strength:.6,points:[[.45,.5],[.54,.5]]},b=renderManualPortrait(a,w,h,[op]).pixels;let changed=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(Math.hypot(x-.45*w,y-.5*h)>=.18*Math.min(w,h))assert.deepEqual(b.subarray(i,i+4),a.subarray(i,i+4));else if(!b.subarray(i,i+4).every((v,c)=>v===a[i+c]))changed++;}assert.ok(changed>30);assert.deepEqual(a,fixture());});
test('manual protection has a fully protected core and replays deterministically for full-size export',()=>{const a=fixture(),ops=[{tool:'protect',r:.12,strength:1,points:[[.5,.5]]},{tool:'push',r:.3,strength:1,points:[[.4,.5],[.6,.5]]},{tool:'dodge',r:.3,strength:.7,points:[[.5,.5]]}],first=renderManualPortrait(a,w,h,ops),again=renderManualPortrait(a,w,h,ops);assert.deepEqual(first.pixels,again.pixels);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(first.protection[y*w+x]===255){const i=(y*w+x)*4;assert.deepEqual(first.pixels.subarray(i,i+4),a.subarray(i,i+4));}assert.ok(first.protection.some(v=>v===255));assert.ok(first.protection.some(v=>v>0&&v<255));});
test('manual texture sampling uses existing pixels, local lighting retains alpha, and invalid records never enter replay',()=>{const a=fixture(),clone=renderManualPortrait(a,w,h,[{tool:'clone',r:.12,strength:1,points:[[.7,.5]],sample:[.2,.5]}]).pixels,i=(56*w+67)*4;assert.ok(clone[i]<a[i]-50);const lit=renderManualPortrait(a,w,h,[{tool:'burn',r:.4,strength:.4,points:[[.05,.5]]}]).pixels;for(let p=3;p<a.length;p+=4)assert.equal(lit[p],a[p]);assert.throws(()=>manualOperations([{tool:'automatic-ai',r:.1,strength:1,points:[[.5,.5]]}]));assert.throws(()=>manualOperations([{tool:'push',r:.1,strength:1,points:[[Infinity,.5]]}]));assert.throws(()=>manualOperations([{tool:'clone',r:.1,strength:1,points:[[.5,.5]]}]));assert.deepEqual(renderManualPortrait(a,w,h,[]).pixels,a);});

test('continuous push is independent of event density for a multi-segment path and keeps protected pixels',()=>{
 const width=416,height=220,source=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;source.set([x%19*11,y%12*19,(x+y)%23*10,x<2?0:255],i);
 }
 const path=[[.17,.42],[.48,.42],[.68,.68]],dense=[];
 for(let i=1;i<path.length;i++)for(let step=0;step<64;step++)dense.push(path[i-1].map((v,c)=>v+(path[i][c]-v)*step/64));
 dense.push(path.at(-1));
 const mark={tool:'protect',continuous:true,points:[[.28,.42],[.41,.42]],strength:1,r:.045};
 const brush={tool:'push',continuous:true,points:path,strength:.76,r:.13};
 const a=renderManualPortrait(source,width,height,[mark,brush]);
 const b=renderManualPortrait(source,width,height,[mark,{...brush,points:dense}]);
 assert.deepEqual(a.pixels,b.pixels);
 assert.notDeepEqual(a.pixels,source);
 assert.notDeepEqual(a.pixels,renderManualPortrait(source,width,height,[mark,{...brush,continuous:false}]).pixels);
 assert.deepEqual(renderManualPortrait(source,width,height,[{...brush,points:[path[0]]}]).pixels,source);
 for(let i=0;i<a.protection.length;i++)if(a.protection[i]===255)assert.deepEqual(a.pixels.subarray(i*4,i*4+4),source.subarray(i*4,i*4+4));
 assert.deepEqual(manualOperations(JSON.parse(JSON.stringify([mark,brush]))),[mark,brush]);
});

test('continuous protection, unprotect and restoration fill sparse segments',()=>{
 const width=180,height=100,source=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<source.length;i+=4)source.set([87,103,133,255],i);
 const path=[[.2,.5],[.8,.5]],brush={r:.12,strength:1,points:path,continuous:true},x=90,y=50,i=y*width+x,p=i*4;
 const protectedArea=renderManualPortrait(source,width,height,[{...brush,tool:'protect'}]).protection;
 assert.equal(protectedArea[i],255);
 const erased=renderManualPortrait(source,width,height,[{...brush,tool:'protect'},{...brush,tool:'unprotect',points:[[.4,.5],[.6,.5]]}]).protection;
 assert.equal(erased[i],0);
 assert.equal(erased[y*width+45],255);
 const gray=renderManualPortrait(source,width,height,[{...brush,tool:'gray-dodge'}]).pixels;
 assert.ok(gray[p]>source[p]);
 for(const first of [{...brush,tool:'gray-dodge'},{...brush,tool:'dodge',points:Array.from({length:61},(_,j)=>[.2+j/100,.5])}]){
  const legacy=renderManualPortrait(source,width,height,[first,{...brush,tool:'restore',continuous:false}]).pixels;
  assert.ok(legacy[p]>source[p]);
  const repaired=renderManualPortrait(source,width,height,[first,{...brush,tool:'restore'}]).pixels;
  assert.deepEqual(repaired.subarray(p,p+4),source.subarray(p,p+4));
  assert.deepEqual(repaired.subarray(0,width*4),source.subarray(0,width*4));
 }
});

test('frame-safe warps stay inside the frame and round-trip while old stroke records keep their replay',()=>{
 const width=128,height=100,source=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  source.set([x*2,y*2,(x+y)%19*12,255],(y*width+x)*4);
 }
 const horizontal={tool:'push',r:.4,strength:1,points:[[.02,.5],[.27,.5]],continuous:true};
 const vertical={...horizontal,points:[[.5,.98],[.5,.72]]};
 const radial={tool:'shrink',r:.4,strength:1,points:[[.14,.52]]};
 const full={...radial,tool:'expand',points:[[.87,.15]]};
 const red=(pixels,x,y)=>pixels[(y*width+x)*4];
 const green=(pixels,x,y)=>pixels[(y*width+x)*4+1];
 const [oldPush,oldShrink]=[horizontal,radial].map(op=>renderManualPortrait(source,width,height,[op]).pixels);
 assert.equal(red(oldPush,4,50),0);
 assert.equal(red(oldShrink,1,52),0);
 for(const op of [horizontal,vertical,radial,full]){
  const brush={...op,edgeSafe:true};
  const replay=manualOperations(JSON.parse(JSON.stringify([brush])));
  assert.deepEqual(replay,[brush]);
  assert.deepEqual(manualOperations([op]),[op]);
  const pixels=renderManualPortrait(source,width,height,replay).pixels;
  assert.notDeepEqual(pixels,source);
  for(let y=0;y<height;y++){
   for(const x of [0,width-1])assert.equal(red(pixels,x,y),red(source,x,y));
  }
  for(let x=0;x<width;x++){
   for(const y of [0,height-1])assert.equal(green(pixels,x,y),green(source,x,y));
  }
 }
 const pushed=renderManualPortrait(source,width,height,[{...horizontal,edgeSafe:true}]).pixels;
 assert.ok(red(pushed,4,50)>0);
 const shrunk=renderManualPortrait(source,width,height,[{...radial,edgeSafe:true}]).pixels;
 assert.ok(red(shrunk,1,52)>0);
 assert.equal(manualOperations([{...radial,tool:'smooth',edgeSafe:true}])[0].edgeSafe,undefined);
 const center={...radial,r:.2,points:[[.5,.5]]};
 assert.deepEqual(renderManualPortrait(source,width,height,[center]).pixels,renderManualPortrait(source,width,height,[{...center,edgeSafe:true}]).pixels);
 const line=new Uint8ClampedArray([0,20,80,255,100,80,30,255,250,140,20,255]);
 assert.deepEqual(renderManualPortrait(line,1,3,[{...horizontal,edgeSafe:true}]).pixels,line);
});

test('local soften, dodge and burn cover sparse paths and preserve older stroke records',()=>{
 const width=180,height=112,source=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  source.set([92+x%3*23,91+y%3*16,124+(x+y)%3*14,255],(y*width+x)*4);
 }
 const points=[[.125,.5],[.875,.5]],dense=Array.from({length:97},(_,i)=>[.125+i/128,.5]);
 const protect={tool:'protect',r:.05,strength:1,points:[[.625,.5]]};
 const index=(56*width+90)*4;
 for(const tool of ['smooth','dodge','burn']){
  const op={tool,r:.11,strength:.9,points};
  const original=renderManualPortrait(source,width,height,[protect,op]).pixels;
  assert.deepEqual(original.subarray(index,index+4),source.subarray(index,index+4));
  const record=manualOperations(JSON.parse(JSON.stringify([{...op,continuous:true}])))[0];
  assert.equal(record.continuous,true);
  assert.deepEqual(manualOperations([op]),[op]);
  const {pixels,protection}=renderManualPortrait(source,width,height,[protect,record]);
  assert.notDeepEqual(pixels.subarray(index,index+4),source.subarray(index,index+4));
  assert.deepEqual(pixels,renderManualPortrait(source,width,height,[protect,{...record,points:dense}]).pixels);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const at=y*width+x,i=at*4;
   if(protection[at]===255||Math.abs(y-height/2)>=.11*height){
    assert.deepEqual(pixels.subarray(i,i+4),source.subarray(i,i+4));
   }
  }
  const dab={...op,points:[[.5,.5]]};
  assert.deepEqual(renderManualPortrait(source,width,height,[dab]).pixels,renderManualPortrait(source,width,height,[{...dab,continuous:true}]).pixels);
 }
});

test('local soften excludes hidden pixels and preserves original alpha and hidden RGB',()=>{
 const width=32,height=28,source=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  source.set(x<16?[120+x%2*5,95+y%3*12,100,255]:[124,90,95,x===16?90:0],(y*width+x)*4);
 }
 const alternate=source.slice();
 for(let i=0;i<alternate.length;i+=4){
  if(!alternate[i+3])alternate.set([153,109,128,0],i);
 }
 const brush={tool:'smooth',r:.25,strength:1,points:[[.52,.5]]};
 const old=renderManualPortrait(source,width,height,[brush]).pixels;
 const retinted=renderManualPortrait(alternate,width,height,[brush]).pixels;
 const i=(14*width+16)*4;
 assert.notDeepEqual(old.subarray(i,i+4),retinted.subarray(i,i+4));
 for(const tool of ['smooth','dodge','burn']){
  const op={...brush,tool,continuous:true};
  const one=renderManualPortrait(source,width,height,[op]).pixels;
  const two=renderManualPortrait(alternate,width,height,[op]).pixels;
  for(let i=0;i<one.length;i+=4){
   assert.equal(one[i+3],source[i+3]);
   assert.equal(two[i+3],alternate[i+3]);
   if(source[i+3]){
    assert.deepEqual(one.subarray(i,i+4),two.subarray(i,i+4));
   }else{
    assert.deepEqual(one.subarray(i,i+4),source.subarray(i,i+4));
    assert.deepEqual(two.subarray(i,i+4),alternate.subarray(i,i+4));
   }
  }
 }
});
