import sharp from 'sharp';

export const SEAM_VERSION='boundary-harmonic-v1';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};

// Only unchanged, textured context may establish a global camera/colour drift.
// Flat context, clipping, changed structure or too little evidence => no transform.
export function calibrateContext(original,edited,width,height,rect){
 const points=[],step=Math.max(1,Math.ceil(Math.sqrt(width*height/8000))),sides=new Set();
 for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
  if(x>=rect.left&&x<rect.left+rect.width&&y>=rect.top&&y<rect.top+rect.height)continue;
  const i=(y*width+x)*4;if(original[i+3]<250||edited[i+3]<250)continue;
  if([0,1,2].some(c=>original[i+c]<8||original[i+c]>247||edited[i+c]<8||edited[i+c]>247))continue;
  points.push(i);if(x<rect.left)sides.add('left');if(x>=rect.left+rect.width)sides.add('right');if(y<rect.top)sides.add('top');if(y>=rect.top+rect.height)sides.add('bottom');
 }
 const report={applied:false,samples:points.length,reason:'上下文不足或发生了结构变化'};
 if(points.length<128||sides.size<2)return report;
 const gains=[],biases=[];let totalBefore=0,totalAfter=0;
 for(let c=0;c<3;c++){
  let a=0,b=0,aa=0,bb=0,ab=0;
  for(const i of points){const x=edited[i+c],y=original[i+c];a+=x;b+=y;aa+=x*x;bb+=y*y;ab+=x*y;}
  const n=points.length,vx=aa-a*a/n,vy=bb-b*b/n,cov=ab-a*b/n;
  if(vx/n<25||vy/n<25||cov/Math.sqrt(vx*vy)<.985)return report;
  const gain=cov/vx,bias=(b-gain*a)/n;let after=0,before=0;
  for(const i of points){after+=(original[i+c]-(edited[i+c]*gain+bias))**2;before+=(original[i+c]-edited[i+c])**2;}
  if(gain<.75||gain>1.33||Math.abs(bias)>48||Math.sqrt(after/n)>4.5)return report;
  gains.push(gain);biases.push(bias);totalBefore+=before;totalAfter+=after;
 }
 Object.assign(report,{applied:Math.sqrt(totalBefore/(points.length*3))>=1.5,gains,biases,contextRmsBefore:Math.sqrt(totalBefore/(points.length*3)),contextRmsAfter:Math.sqrt(totalAfter/(points.length*3)),reason:'纹理与结构匹配的外围参考'});
 return report;
}

// Distances stay inside the editable domain. A black pixel can never receive paint,
// including transparent RGB values that a conventional over-composite may erase.
function distances(mask,width,height){
 const d=new Uint8Array(mask.length);let fixed=0,editable=0,white=0;
 for(let i=0;i<d.length;i++){d[i]=mask[i]===0?0:255;mask[i]===0?fixed++:editable++;if(mask[i]===255)white++;}
 if(!fixed||!editable)return {d,fixed,editable,white};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*width+x;if(!d[p])continue;let n=d[p];
  if(x)n=Math.min(n,d[p-1]+1);
  if(y){n=Math.min(n,d[p-width]+1);if(x)n=Math.min(n,d[p-width-1]+1);if(x+1<width)n=Math.min(n,d[p-width+1]+1);}
  d[p]=n;
 }
 for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
  const p=y*width+x;if(!d[p])continue;let n=d[p];
  if(x+1<width)n=Math.min(n,d[p+1]+1);
  if(y+1<height){n=Math.min(n,d[p+width]+1);if(x)n=Math.min(n,d[p+width-1]+1);if(x+1<width)n=Math.min(n,d[p+width+1]+1);}
  d[p]=n;
 }
 return {d,fixed,editable,white};
}

// A small screened harmonic field carries low-frequency boundary colour differences
// inward. The inner boundary is pinned to zero: intentional colour/detail changes
// in the AI core remain untouched. This is not a global histogram/skin-tone match.
async function colourField(original,edited,width,height,d,band){
 const scale=Math.min(1,192/Math.max(width,height)),w=Math.max(2,Math.round(width*scale)),h=Math.max(2,Math.round(height*scale));
 const sample=bytes=>sharp(bytes,{raw:{width,height,channels:4}}).resize(w,h,{fit:'fill',kernel:'linear'}).raw().toBuffer();
 const [a,b]=await Promise.all([sample(original),sample(edited)]),field=new Float32Array(w*h*3),kind=new Uint8Array(w*h),minimum=new Uint8Array(w*h).fill(255);
 for(let y=0;y<height;y++){const yy=Math.min(h-1,Math.floor(y*h/height));for(let x=0;x<width;x++){const q=yy*w+Math.min(w-1,Math.floor(x*w/width));if(d[y*width+x]<minimum[q])minimum[q]=d[y*width+x];}}
 let boundaryCount=0,error=0;
 for(let p=0;p<w*h;p++){
  kind[p]=minimum[p]===0?1:minimum[p]>=band?2:0;
  const x=p%w,y=Math.floor(p/w),boundary=kind[p]===1&&(x&&minimum[p-1]>0||x+1<w&&minimum[p+1]>0||y&&minimum[p-w]>0||y+1<h&&minimum[p+w]>0);
  for(let c=0;c<3;c++){const delta=a[p*4+c]-b[p*4+c];field[p*3+c]=kind[p]===2?0:clamp(delta,-64,64)*(1-smooth(minimum[p]/band));if(boundary){error+=delta*delta;boundaryCount++;}}
 }
 for(let iteration=0;iteration<160;iteration++){
  let change=0;
  for(let parity=0;parity<2;parity++)for(let y=0;y<h;y++)for(let x=(y+parity)%2;x<w;x+=2){
   const p=y*w+x;if(kind[p])continue;const neighbors=[];if(x)neighbors.push(p-1);if(x+1<w)neighbors.push(p+1);if(y)neighbors.push(p-w);if(y+1<h)neighbors.push(p+w);
   for(let c=0;c<3;c++){let sum=0;for(const q of neighbors)sum+=field[q*3+c];const i=p*3+c,next=field[i]+1.4*(sum/(neighbors.length+.12)-field[i]);change=Math.max(change,Math.abs(next-field[i]));field[i]=next;}
  }
  if(change<.025)break;
 }
 return {field,w,h,boundaryRms:boundaryCount?Math.sqrt(error/boundaryCount):0};
}

export async function blendBoundary(original,edited,mask,width,height,{feather=12,colourBand=32,soften=true,report={}}={}){
 if(original.length!==width*height*4||edited.length!==original.length||mask.length!==width*height)throw Error('合成图像与蒙版尺寸不匹配。');
 feather=clamp(Math.round(feather),1,128);colourBand=clamp(Math.round(colourBand),feather+1,192);
 const {d,fixed,editable,white}=distances(mask,width,height);Object.assign(report,{method:SEAM_VERSION,alphaMode:'premultiplied-mask',featherPx:feather,colourBandPx:colourBand,protectedPixels:fixed,editablePixels:editable});
 if(!editable){Object.assign(report,{skipped:'all-protected',corePixels:0,narrowEditableAreas:false,needsReview:false});return original;}
 if(white===mask.length){original.set(edited);Object.assign(report,{skipped:'all-editable',corePixels:mask.length,narrowEditableAreas:false,needsReview:false});return original;}
 const colour=fixed?await colourField(original,edited,width,height,d,colourBand):null;
 let edgeBefore=0,edgeAfter=0,samples=0,corePixels=0,narrow=false;const offsets=[0,0,0];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*width+x,i=p*4;if(mask[p]===0)continue;
  if(mask[p]===255&&d[p]>=colourBand)corePixels++;
  if(fixed&&!narrow&&d[p]<colourBand){let peak=true;for(let dy=-1;dy<=1&&peak;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height&&d[yy*width+xx]>d[p]){peak=false;break;}}if(peak)narrow=true;}
  if(original[i]===edited[i]&&original[i+1]===edited[i+1]&&original[i+2]===edited[i+2]&&original[i+3]===edited[i+3])continue;
  const opacity=Math.min(mask[p]/255,soften&&fixed?smooth(d[p]/feather):1);
  if(opacity===0)continue;
  const alpha=edited[i+3]/255*opacity,sourceWeight=original[i+3]/255*(1-opacity),outAlpha=alpha+sourceWeight;
  if(outAlpha===0){for(let c=0;c<4;c++)original[i+c]=edited[i+c];continue;}
  offsets[0]=offsets[1]=offsets[2]=0;
  if(colour&&d[p]<colourBand){
   const gx=clamp((x+.5)*colour.w/width-.5,0,colour.w-1),gy=clamp((y+.5)*colour.h/height-.5,0,colour.h-1),xx=Math.floor(gx),yy=Math.floor(gy),xx1=Math.min(xx+1,colour.w-1),yy1=Math.min(yy+1,colour.h-1),tx=gx-xx,ty=gy-yy,taper=1-smooth(d[p]/colourBand);
   for(let c=0;c<3;c++){const f=colour.field;offsets[c]=((f[(yy*colour.w+xx)*3+c]*(1-tx)+f[(yy*colour.w+xx1)*3+c]*tx)*(1-ty)+(f[(yy1*colour.w+xx)*3+c]*(1-tx)+f[(yy1*colour.w+xx1)*3+c]*tx)*ty)*taper;}
  }
  for(let c=0;c<3;c++){
   const old=original[i+c],corrected=clamp(edited[i+c]+offsets[c],0,255);
   const value=Math.round((corrected*alpha+old*sourceWeight)/outAlpha);
   if(d[p]<=feather){edgeBefore+=(edited[i+c]-old)**2;edgeAfter+=(value-old)**2;samples++;}
   original[i+c]=value;
  }
  original[i+3]=Math.round(outAlpha*255);
 }
 Object.assign(report,{corePixels,narrowEditableAreas:narrow,boundaryPixels:Math.floor(samples/3),boundaryColourRmsBefore:samples?Math.round(Math.sqrt(edgeBefore/samples)*100)/100:0,boundaryColourRmsAfter:samples?Math.round(Math.sqrt(edgeAfter/samples)*100)/100:0,needsReview:Boolean(narrow||colour&&colour.boundaryRms>55),check:'过渡带内AI图/最终成品相对输入RGB的均方根差，仅为本机估算，非画质评分，不能识别所有结构错位。'});
 return original;
}
