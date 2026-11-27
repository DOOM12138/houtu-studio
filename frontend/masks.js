import { clamp, rgbToHsl } from './engine.js';
export const MASK_NAMES={person:'人物',background:'背景',hair:'头发',skin:'皮肤',face:'面部皮肤',clothes:'服装',accessories:'饰品',brush:'空白画笔',luminance:'亮度范围',color:'颜色范围',linear:'线性渐变',radial:'径向渐变'};
function applyContinuousStroke(mask,width,height,stroke) {
  if(!stroke.points?.length)return;
  const radius=clamp(stroke.radius,.002,.5)*Math.min(width,height);
  const feather=radius*clamp(stroke.softness??.65,.01,1);
  const flow=clamp(stroke.flow??1);
  if(!flow)return;
  const path=stroke.points.map(([x,y])=>[x*width,y*height]);
  const xs=path.map(p=>p[0]),ys=path.map(p=>p[1]);
  const left=clamp(Math.floor(Math.min(...xs)-radius),0,width),right=clamp(Math.ceil(Math.max(...xs)+radius),0,width);
  const top=clamp(Math.floor(Math.min(...ys)-radius),0,height),bottom=clamp(Math.ceil(Math.max(...ys)+radius),0,height);
  const span=right-left;
  if(span<=0||bottom<=top)return;
  const coverage=new Uint8Array(span*(bottom-top));
  for(let k=0;k<Math.max(1,path.length-1);k++){
    const [ax,ay]=path[k],[bx,by]=path[k+1]||path[k],dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
    const x0=Math.max(left,Math.floor(Math.min(ax,bx)-radius)),x1=Math.min(right,Math.ceil(Math.max(ax,bx)+radius));
    const y0=Math.max(top,Math.floor(Math.min(ay,by)-radius)),y1=Math.min(bottom,Math.ceil(Math.max(ay,by)+radius));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const nx=x+.5-ax,ny=y+.5-ay;
      const t=length?clamp((nx*dx+ny*dy)/length):0;
      const distance=Math.hypot(nx-dx*t,ny-dy*t);
      const weight=Math.round(clamp((radius-distance)/feather)*255);
      const offset=(y-top)*span+x-left;
      if(weight>coverage[offset])coverage[offset]=weight;
    }
  }
  // Merge the path once. Extra pointer events in the same stroke do not
  // increase pressure or harden the feather.
  const target=stroke.mode==='subtract'?0:255;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const alpha=flow*coverage[(y-top)*span+x-left]/255;
    const p=y*width+x;
    if(alpha)mask[p]+=(target-mask[p])*alpha;
  }
}

export function maskAlpha(mask,width,height,data,semantic) {
  const out=new Uint8ClampedArray(width*height),target=mask.color||[.8,.4,.3];
  const classes={background:[0],person:[1,2,3,4,5],hair:[1],skin:[2,3],face:[3],clothes:[4],accessories:[5]};
  for(let p=0;p<out.length;p++){
    const x=(p%width+.5)/width,y=(Math.floor(p/width)+.5)/height;let a=0;
    if(classes[mask.type]&&semantic){const sx=Math.min(semantic.width-1,Math.floor(x*semantic.width)),sy=Math.min(semantic.height-1,Math.floor(y*semantic.height));const i=sy*semantic.width+sx;
      a=semantic.confidence?classes[mask.type].reduce((n,c)=>n+semantic.confidence[c][i],0):classes[mask.type].includes(semantic.categories[i])?1:0;
    } else if(mask.type==='luminance'){const v=(.2126*data[p*4]+.7152*data[p*4+1]+.0722*data[p*4+2])/255;const low=mask.low??.4,high=mask.high??1,soft=.08;a=clamp((v-low+soft)/soft)*clamp((high-v+soft)/soft);}
    else if(mask.type==='color'){const rgb=[data[p*4]/255,data[p*4+1]/255,data[p*4+2]/255];const d=Math.hypot(...rgb.map((v,c)=>v-target[c]));a=clamp(1-d/(mask.tolerance??.35));}
    else if(mask.type==='linear'){const angle=(mask.angle??90)*Math.PI/180; a=clamp(.5+(x-.5)*Math.cos(angle)+(y-.5)*Math.sin(angle));}
    else if(mask.type==='radial'){a=clamp((1-Math.hypot((x-.5)/.42,(y-.5)/.42))*3);}
    if(mask.invert)a=1-a;out[p]=clamp(a)*255;
  }
  // Normalized strokes share across preview/export. Feather is a soft falloff.
  for(const stroke of mask.strokes||[]){
    if(stroke.coverage==='continuous'){applyContinuousStroke(out,width,height,stroke);continue;}
    const radius=clamp(stroke.radius,.002,.5),soft=clamp(stroke.softness??.65,.01,1),points=stroke.points||[];
    for(let k=0;k<points.length;k++){const end=points[k],start=points[k-1]||end;const steps=Math.max(1,Math.ceil(Math.hypot((end[0]-start[0])*width,(end[1]-start[1])*height)/(radius*Math.min(width,height)*.35)));
      for(let j=0;j<=steps;j++){const px=(start[0]+(end[0]-start[0])*j/steps)*width,py=(start[1]+(end[1]-start[1])*j/steps)*height,r=radius*Math.min(width,height);
        for(let yy=Math.max(0,Math.floor(py-r));yy<Math.min(height,Math.ceil(py+r));yy++)for(let xx=Math.max(0,Math.floor(px-r));xx<Math.min(width,Math.ceil(px+r));xx++){const t=Math.hypot(xx+.5-px,yy+.5-py)/r;if(t>1)continue;const a=clamp((1-t)/soft)*(stroke.flow??1),i=yy*width+xx;out[i]=stroke.mode==='subtract'?out[i]*(1-a):out[i]+(255-out[i])*a;}
      }
    }
  }
  return out;
}
