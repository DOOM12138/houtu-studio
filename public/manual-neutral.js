// An independent signed 16-bit field around exact 50% gray; zero is neutral.
export const NEUTRAL_TOOLS = new Set(['gray-dodge', 'gray-burn', 'gray-erase']);
const MAX = 32767;
export function strokeDistance(points,width,height,bounds) {
 const coordinates=points.map(([x,y])=>[x*width,y*height]);
 const [firstX,firstY]=coordinates[0];
 const segments=(coordinates.length===1?coordinates:coordinates.slice(1)).map(([x,y],index)=>{
  const [left,top]=coordinates[index],dx=x-left,dy=y-top;
  if(bounds&&(Math.min(left,x)>bounds.right||Math.max(left,x)<bounds.left||Math.min(top,y)>bounds.bottom||Math.max(top,y)<bounds.top))return null;
  return {left,top,dx,dy,length:dx*dx+dy*dy};
 }).filter(Boolean);
 if(!segments.length)return null;
 return (x,y)=>{
  let closest=(x-firstX)**2+(y-firstY)**2;
  for(const {left,top,dx,dy,length} of segments){
   const t=length?Math.max(0,Math.min(1,((x-left)*dx+(y-top)*dy)/length)):0;
   closest=Math.min(closest,(x-left-dx*t)**2+(y-top-dy*t)**2);
  }
  return closest;
 };
}
export function paintNeutral(field,width,height,op,protection){
 const path=op.continuous?strokeDistance(op.points,width,height):null;
 const r=Math.max(2,op.r*Math.min(width,height)),xs=op.points.map(p=>p[0]*width),ys=op.points.map(p=>p[1]*height);
 const left=Math.max(0,Math.floor(Math.min(...xs)-r)),right=Math.min(width-1,Math.ceil(Math.max(...xs)+r)),top=Math.max(0,Math.floor(Math.min(...ys)-r)),bottom=Math.min(height-1,Math.ceil(Math.max(...ys)+r));
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const at=y*width+x;if(protection[at]===255)continue;let weight=0;
  if(path){const distance=path(x,y);if(distance<r*r)weight=(1-distance/(r*r))**3;}
  else for(const p of op.points){const d=(x-p[0]*width)**2+(y-p[1]*height)**2;if(d<r*r)weight=Math.max(weight,(1-d/(r*r))**3);}
  const amount=weight*op.strength*(1-protection[at]/255),target=op.tool==='gray-dodge'?MAX:op.tool==='gray-burn'?-MAX:0;
  field[at]=Math.round(field[at]+(target-field[at])*amount);
 }
}
export function compositeNeutral(pixels,field,{view=false}={}){
 const output=pixels.slice();
 for(let at=0;at<field.length;at++){
  const delta=field[at],i=at*4;
  if(view){const gray=Math.round(127.5+delta/MAX*127.5);output[i]=output[i+1]=output[i+2]=gray;continue;}
  if(!delta||!pixels[i+3])continue;
  const s=.5+delta/(MAX*2);
  for(let c=0;c<3;c++){
   const b=pixels[i+c]/255,d=b<=.25?((16*b-12)*b+4)*b:Math.sqrt(b);
   const value=s<=.5?b-(1-2*s)*b*(1-b):b+(2*s-1)*(d-b);
   output[i+c]=Math.round(Math.max(0,Math.min(1,value))*255);
  }
 }
 return output;
}
