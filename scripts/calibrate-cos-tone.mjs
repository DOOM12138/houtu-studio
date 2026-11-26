// Fit a local color transform to a before/after pair and measure it on held-out tiles.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const [beforePath,afterPath,out,subjectArgument]=process.argv.slice(2);
if(!beforePath||!afterPath||!out)throw Error('Usage: calibrate-cos-tone.mjs ORIGINAL.jpg EDITED.jpg OUTPUT_DIRECTORY [x,y,width,height]');
const subject=subjectArgument?.split(',').map(Number)||null;
if(subject&&(subject.length!==4||!subject.every(Number.isFinite)||subject[0]<0||subject[1]<0||subject[2]<=0||subject[3]<=0||subject[0]+subject[2]>1||subject[1]+subject[3]>1))throw Error('Subject requires a normalized rectangle inside the image.');
const clamp=n=>Math.max(0,Math.min(1,n));
const luminance=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const [source,reference]=await Promise.all([beforePath,afterPath].map(file=>fs.readFile(file)));
const read=(input,width)=>sharp(input).rotate().resize({width,withoutEnlargement:true}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
const [a,b]=await Promise.all([read(source,384),read(reference,384)]);
const {width:w,height:h}=a.info;
if(w!==b.info.width||h!==b.info.height||a.info.channels!==3||b.info.channels!==3)throw Error('Use an original and edit sharing a common canvas ratio.');
const at=(im,x,y)=>(y*im.info.width+x)*3;
const gray=(im,x,y)=>{const i=at(im,x,y);return luminance(im.data[i],im.data[i+1],im.data[i+2]);};
const edge=(im,x,y)=>Math.abs(gray(im,x+2,y)-gray(im,x-2,y))+Math.abs(gray(im,x,y+2)-gray(im,x,y-2));
function map(x,y,s,dx,dy){return [Math.round((x-w/2)*s+w/2+dx),Math.round((y-h/2)*s+h/2+dy)];}
let alignment=null;
for(const s of [.99,1,1.01,1.02])for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
 let sum=0,n=0;
 for(let y=16;y<h-16;y+=4)for(let x=16;x<w-16;x+=4){
  const [u,v]=map(x,y,s,dx,dy),first=edge(a,x,y),second=edge(b,u,v);
  sum+=Math.abs(Math.log1p(first)-Math.log1p(second));n++;
 }
 const score=sum/n;
 if(!alignment||score<alignment.score)alignment={scale:s,dx,dy,score};
}
const terms=['constant','r','g','b','r²','g²','b²','luma²','luma³','r²-position','luma×r²-position'];
if(subject)terms.push('subject','subject×luma','subject×(r-g)','subject×(g-b)');
function subjectWeight(x,y){
 if(!subject)return 0;
 const [left,top,width,height]=subject;
 const edge=Math.min((x-left)/width,(left+width-x)/width,(y-top)/height,(top+height-y)/height);
 const t=clamp(edge/.23);
 return t*t*(3-2*t);
}
function basis(r,g,b,x,y){
 const l=luminance(r,g,b),radius=(x-.5)**2+(y-.49)**2;
 const features=[1,r,g,b,r*r,g*g,b*b,l*l,l*l*l,radius,radius*l];
 if(subject){const weight=subjectWeight(x,y);features.push(weight,weight*l,weight*(r-g),weight*(g-b));}
 return features;
}
function solve(matrix,rhs){
 const state=matrix.map((row,i)=>[...row,rhs[i]]);
 for(let c=0;c<state.length;c++){
  let pivot=c;
  for(let i=c+1;i<state.length;i++)if(Math.abs(state[i][c])>Math.abs(state[pivot][c]))pivot=i;
  [state[c],state[pivot]]=[state[pivot],state[c]];
  const factor=state[c][c];
  if(Math.abs(factor)<1e-12)throw Error('Color fit is singular.');
  for(let j=c;j<=state.length;j++)state[c][j]/=factor;
  for(let i=0;i<state.length;i++)if(i!==c){
   const k=state[i][c];
   for(let j=c;j<=state.length;j++)state[i][j]-=k*state[c][j];
  }
 }
 return state.map(row=>row.at(-1));
}
const n=terms.length,matrix=Array.from({length:n},()=>Array(n).fill(0)),rhs=Array.from({length:3},()=>Array(n).fill(0)),held=[];
let trained=0;
for(let y=12;y<h-12;y+=2)for(let x=12;x<w-12;x+=2){
 const [xx,yy]=map(x,y,alignment.scale,alignment.dx,alignment.dy);
 const i=at(a,x,y),j=at(b,xx,yy),rgb=[...a.data.subarray(i,i+3)].map(v=>v/255),target=[...b.data.subarray(j,j+3)].map(v=>v/255);
 const key=basis(...rgb,x/w,y/h);
 const onSubject=subjectWeight(x/w,y/h)>.5;
 const hold=onSubject?(Math.floor(x/6)+Math.floor(y/8))%4===0:(Math.floor(x/24)+2*Math.floor(y/26))%5===0;
 if(hold){held.push({rgb,target,key,onSubject});continue;}
 for(let u=0;u<n;u++){
  for(let v=0;v<n;v++)matrix[u][v]+=key[u]*key[v];
  for(let c=0;c<3;c++)rhs[c][u]+=key[u]*target[c];
 }
 trained++;
}
if(!trained||!held.length)throw Error('This photograph is too small for fitting and hold-out.');
for(let i=1;i<n;i++)matrix[i][i]+=.035;
const weights=rhs.map(row=>solve(matrix,row));
const predicted=key=>weights.map(row=>clamp(row.reduce((sum,v,i)=>sum+v*key[i],0)));
let baseline=0,fit=0,subjectBaseline=0,subjectFit=0,subjectHeldOut=0;
for(const {rgb,target,key,onSubject} of held){
 if(onSubject)subjectHeldOut++;
 const result=predicted(key);
 for(let c=0;c<3;c++){
  const baseError=Math.abs(rgb[c]-target[c]),fitError=Math.abs(result[c]-target[c]);
  baseline+=baseError;fit+=fitError;
  if(onSubject){subjectBaseline+=baseError;subjectFit+=fitError;}
 }
}
const original=await read(source,1536),pixels=Buffer.alloc(original.data.length);
const {width,height}=original.info;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const i=at(original,x,y),key=basis(original.data[i]/255,original.data[i+1]/255,original.data[i+2]/255,x/width,y/height);
 predicted(key).forEach((v,c)=>{pixels[i+c]=Math.round(v*255);});
}
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
const model={type:'paired-rgb-tone-regression',version:1,terms,weights,alignment,subject,
 inputs:{before:checksum(source),reference:checksum(reference)},
 validation:{trained,heldOut:held.length,baselineMae8bit:baseline*255/(held.length*3),fittedMae8bit:fit*255/(held.length*3),...(subjectHeldOut?{subjectHeldOut,subjectBaselineMae8bit:subjectBaseline*255/(subjectHeldOut*3),subjectFittedMae8bit:subjectFit*255/(subjectHeldOut*3)}:{})}};
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'tone-model.json'),JSON.stringify(model,null,2)+'\n');
await sharp(pixels,{raw:{width,height,channels:3}}).jpeg({quality:94}).toFile(path.join(out,'tone-preview.jpg'));
console.log(model.validation);
