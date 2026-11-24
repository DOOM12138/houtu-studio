import { clamp, rgbToHsl } from './engine.js';
export const MASK_NAMES={person:'人物',background:'背景',hair:'头发',skin:'皮肤',face:'面部皮肤',clothes:'服装',accessories:'饰品',brush:'空白画笔',luminance:'亮度范围',color:'颜色范围',linear:'线性渐变',radial:'径向渐变'};
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
  for(const stroke of mask.strokes||[]){const radius=clamp(stroke.radius,.002,.5),soft=clamp(stroke.softness??.65,.01,1),points=stroke.points||[];
    for(let k=0;k<points.length;k++){const end=points[k],start=points[k-1]||end;const steps=Math.max(1,Math.ceil(Math.hypot((end[0]-start[0])*width,(end[1]-start[1])*height)/(radius*Math.min(width,height)*.35)));
      for(let j=0;j<=steps;j++){const px=(start[0]+(end[0]-start[0])*j/steps)*width,py=(start[1]+(end[1]-start[1])*j/steps)*height,r=radius*Math.min(width,height);
        for(let yy=Math.max(0,Math.floor(py-r));yy<Math.min(height,Math.ceil(py+r));yy++)for(let xx=Math.max(0,Math.floor(px-r));xx<Math.min(width,Math.ceil(px+r));xx++){const t=Math.hypot(xx+.5-px,yy+.5-py)/r;if(t>1)continue;const a=clamp((1-t)/soft)*(stroke.flow??1),i=yy*width+xx;out[i]=stroke.mode==='subtract'?out[i]*(1-a):out[i]+(255-out[i])*a;}
      }
    }
  }
  return out;
}
