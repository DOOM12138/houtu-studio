export function guideMaskEdges(rgb, alpha, width, height) {
 const length=width*height;
 if(rgb.length!==length*3||alpha.length!==length)throw new Error('蒙版引导像素尺寸不一致。');
 const radius=Math.max(2,Math.round(Math.max(width,height)/170));
 const luminance=new Float32Array(length),opacity=new Float32Array(length);
 for(let i=0;i<length;i++){
  luminance[i]=(rgb[i*3]*.2126+rgb[i*3+1]*.7152+rgb[i*3+2]*.0722)/255;
  opacity[i]=alpha[i]/255;
 }
 function mean(a,b){
  const stride=width+1, integral=new Float64Array(stride*(height+1)),out=new Float32Array(length);
  for(let y=0;y<height;y++){
   let row=0;
   for(let x=0;x<width;x++){
    const p=y*width+x,k=(y+1)*stride+x+1;
    row+=a[p]*(b?b[p]:1);
    integral[k]=integral[k-stride]+row;
   }
  }
  for(let y=0;y<height;y++){
   const t=Math.max(0,y-radius),d=Math.min(height,y+radius+1);
   for(let x=0;x<width;x++){
    const l=Math.max(0,x-radius),r=Math.min(width,x+radius+1);
    out[y*width+x]=(integral[d*stride+r]-integral[t*stride+r]-integral[d*stride+l]+integral[t*stride+l])/((d-t)*(r-l));
   }
  }
  return out;
 }
 const avgL=mean(luminance),avgA=mean(opacity),varL=mean(luminance,luminance),cov=mean(luminance,opacity);
 const slope=new Float32Array(length),intercept=new Float32Array(length);
 for(let i=0;i<length;i++){
  slope[i]=(cov[i]-avgL[i]*avgA[i])/(Math.max(0,varL[i]-avgL[i]**2)+.002);
  intercept[i]=avgA[i]-slope[i]*avgL[i];
 }
 const smoothSlope=mean(slope),smoothIntercept=mean(intercept),out=Buffer.from(alpha);
 for(let i=0;i<length;i++){
  if(avgA[i]<.015||avgA[i]>.985)continue;
  const corrected=smoothSlope[i]*luminance[i]+smoothIntercept[i];
  out[i]=Math.round(Math.max(0,Math.min(1,.25*opacity[i]+.75*corrected))*255);
 }
 return out;
}
