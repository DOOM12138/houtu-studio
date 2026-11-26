// Local pixel editing. No model, network, account or generated replacement pixels.
import {FREQUENCY_TOOLS,applyFrequencyStroke,frequencyView} from './manual-frequency.js';
import {NEUTRAL_TOOLS,paintNeutral,compositeNeutral} from './manual-neutral.js';
export const MANUAL_ENGINE='manual-portrait-v2';
export const MANUAL_TOOLS=new Set(['push','shrink','expand','smooth','clone','dodge','burn','restore','protect','unprotect','clear-protection','reset',...FREQUENCY_TOOLS,...NEUTRAL_TOOLS]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function manualOperations(value){
 if(!Array.isArray(value)||value.length>300)throw Error('手动操作最多保存300笔，请保存当前版本后继续。');let total=0;
 return value.map(op=>{if(!op||!MANUAL_TOOLS.has(op.tool)||!Array.isArray(op.points)||!op.points.length||op.points.length>512)throw Error('手动笔触无效。');total+=op.points.length;if(total>10000)throw Error('笔触点过多，请保存当前版本后继续。');const number=(v,min,max)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error('手动笔触参数超出范围。');return v;};const result={tool:op.tool,r:number(op.r,.005,.4),strength:number(op.strength,0,1),points:op.points.map(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('笔触坐标无效。');return [number(p[0],0,1),number(p[1],0,1)];})};if(['clone','low-clone','high-clone'].includes(op.tool)){if(!Array.isArray(op.sample)||op.sample.length!==2)throw Error('请先选择纹理取样点。');result.sample=op.sample.map(v=>number(v,0,1));}if(FREQUENCY_TOOLS.has(op.tool))result.separation=number(op.separation,.000001,.2);return result;});
}
function weight(d2,r){if(d2>=r*r)return 0;const q=1-d2/(r*r);return q*q*q;}
function maskWeight(d2,r){const distance=Math.sqrt(d2)/r;if(distance<=.6)return 1;if(distance>=1)return 0;const t=(distance-.6)/.4;return 1-t*t*(3-2*t);}
function region(width,height,points,r){const xs=points.map(p=>p[0]*width),ys=points.map(p=>p[1]*height);return {left:Math.max(0,Math.floor(Math.min(...xs)-r)),right:Math.min(width-1,Math.ceil(Math.max(...xs)+r)),top:Math.max(0,Math.floor(Math.min(...ys)-r)),bottom:Math.min(height-1,Math.ceil(Math.max(...ys)+r))};}
function sample(source,width,height,x,y){
 x=clamp(x,0,width-1);y=clamp(y,0,height-1);const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,values=[0,0,0,0];
 for(const [px,py,w]of [[x0,y0,(1-fx)*(1-fy)],[Math.min(x0+1,width-1),y0,fx*(1-fy)],[x0,Math.min(y0+1,height-1),(1-fx)*fy],[Math.min(x0+1,width-1),Math.min(y0+1,height-1),fx*fy]]){const i=(py*width+px)*4,a=source[i+3]/255;values[3]+=w*a;for(let c=0;c<3;c++)values[c]+=w*a*source[i+c];}
 const a=values[3];return a?[values[0]/a,values[1]/a,values[2]/a,a*255]:[0,0,0,0];
}
export function renderManualPortrait(input,width,height,operations,settings={}){
 if(!(input instanceof Uint8ClampedArray)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>24000000||input.length!==width*height*4)throw Error('人物图片尺寸无效，最多2400万像素。');
 if(!settings||typeof settings!=='object'||!['composite','low','high','gray'].includes(settings.view||'composite'))throw Error('人物检查视图无效。');
 const all=manualOperations(operations),ops=all.slice(all.findLastIndex(o=>o.tool==='reset')+1),protection=new Uint8Array(width*height),short=Math.min(width,height);let pixels=input.slice(),neutral=null;
 for(const op of ops.filter(o=>['protect','unprotect','clear-protection'].includes(o.tool))){if(op.tool==='clear-protection'){protection.fill(0);continue;}const radius=Math.max(2,op.r*short),box=region(width,height,op.points,radius);for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){let w=0;for(const p of op.points)w=Math.max(w,maskWeight((x-p[0]*width)**2+(y-p[1]*height)**2,radius));const i=y*width+x;protection[i]=op.tool==='protect'?Math.max(protection[i],Math.round(255*w*op.strength)):Math.max(0,protection[i]-Math.round(255*w*op.strength));}}
 for(const op of ops.filter(o=>!['protect','unprotect','clear-protection'].includes(o.tool))){if(!op.strength)continue;if(NEUTRAL_TOOLS.has(op.tool)){neutral??=new Int16Array(width*height);paintNeutral(neutral,width,height,op,protection);continue;}if(FREQUENCY_TOOLS.has(op.tool)){applyFrequencyStroke(pixels.slice(),pixels,width,height,op,protection);continue;}if(neutral&&op.tool==='restore')paintNeutral(neutral,width,height,{...op,tool:'gray-erase'},protection);const radius=Math.max(2,op.r*short),box=region(width,height,op.points,radius),source=pixels.slice();
  for(let y=box.top;y<=box.bottom;y++)for(let x=box.left;x<=box.right;x++){const at=y*width+x,index=at*4,available=1-protection[at]/255;if(available<=1e-7)continue;let amount=0,nearest=op.points[0],best=Infinity;
   let centerX=0,centerY=0,centerWeight=0;for(const p of op.points){const d=(x-p[0]*width)**2+(y-p[1]*height)**2,w=weight(d,radius);if(d<best){best=d;nearest=p;}amount=Math.max(amount,w);centerX+=p[0]*w;centerY+=p[1]*w;centerWeight+=w;}if(centerWeight)nearest=[centerX/centerWeight,centerY/centerWeight];amount*=op.strength*available;if(amount<=0)continue;
   let value;
   if(['push','shrink','expand'].includes(op.tool)){
    let sx=x,sy=y;
    if(op.tool==='push'){let dx=0,dy=0;for(let i=1;i<op.points.length;i++){const a=op.points[i-1],b=op.points[i],w=weight((x-a[0]*width)**2+(y-a[1]*height)**2,radius);dx+=clamp((b[0]-a[0])*width,-radius*.3,radius*.3)*w;dy+=clamp((b[1]-a[1])*height,-radius*.3,radius*.3)*w;}sx-=clamp(dx,-radius*.65,radius*.65)*op.strength*available;sy-=clamp(dy,-radius*.65,radius*.65)*op.strength*available;}
    else{const factor=(op.tool==='shrink'?1:-1)*amount*.23;sx+=(x-nearest[0]*width)*factor;sy+=(y-nearest[1]*height)*factor;}
    if(Math.abs(sx-x)+Math.abs(sy-y)<1e-8)continue;value=sample(source,width,height,sx,sy);for(let c=0;c<4;c++)pixels[index+c]=Math.round(value[c]);continue;
   }
   if(op.tool==='restore'){if(amount>=1-1e-8){pixels.set(input.subarray(index,index+4),index);continue;}value=Array.from(input.subarray(index,index+4));}
   else if(op.tool==='clone'){const first=op.points[0];value=sample(source,width,height,x+(op.sample[0]-first[0])*width,y+(op.sample[1]-first[1])*height);}
   else if(op.tool==='smooth'){const sum=[0,0,0];let count=0;const distance=Math.max(1,Math.round(short*.0025));for(const [dx,dy]of [[0,0],[-distance,0],[distance,0],[0,-distance],[0,distance],[-distance,-distance],[distance,-distance],[-distance,distance],[distance,distance]]){const px=clamp(x+dx,0,width-1),py=clamp(y+dy,0,height-1),i=(py*width+px)*4;const contrast=Math.abs(source[i]-source[index])+Math.abs(source[i+1]-source[index+1])+Math.abs(source[i+2]-source[index+2]),w=Math.exp(-contrast/38);for(let c=0;c<3;c++)sum[c]+=source[i+c]*w;count+=w;}value=[sum[0]/count,sum[1]/count,sum[2]/count,source[index+3]];}
   else{const multiplier=2**((op.tool==='dodge'?1:-1)*.8);value=[0,1,2].map(c=>255*clamp((source[index+c]/255)**2.2*multiplier,0,1)**(1/2.2));value.push(source[index+3]);}
   // Premultiplied blending preserves transparent edges during texture replacement.
   const a=source[index+3]/255,b=value[3]/255,alpha=a*(1-amount)+b*amount;for(let c=0;c<3;c++)pixels[index+c]=alpha?Math.round((source[index+c]*a*(1-amount)+value[c]*b*amount)/alpha):0;pixels[index+3]=Math.round(alpha*255);
  }
 }
 if(neutral)pixels=compositeNeutral(pixels,neutral);
 if(settings.view==='gray')pixels=compositeNeutral(pixels,neutral||new Int16Array(width*height),{view:true});
 if(settings.view==='low'||settings.view==='high')pixels=frequencyView(pixels,width,height,settings.separation??.005,settings.view==='high');
 return {pixels,protection};
}
