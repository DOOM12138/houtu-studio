import * as manual from '/manual-portrait-engine.js';
import * as grade from '/color/engine.js';

let preview=null;
self.onmessage=({data:job})=>{
  try{
    if(job.kind==='bind'){preview={key:job.key,width:job.width,height:job.height,data:job.data};return;}
    const input=job.kind==='export'?job:preview;
    if(!input||input.key!==job.key)throw Error('当前图片已切换。');
    const {width,height}=input,s=job.edits;
    let pixels=input.data;
    if(s.strokes.length)pixels=manual.renderManualPortrait(pixels,width,height,s.strokes).pixels;
    const layers=[];
    if(s.mask&&Object.values(s.local).some(Boolean)){
      const alpha=new Uint8Array(width*height),m=s.mask;
      const left=Math.round(m.x*width),right=Math.round((m.x+m.w)*width);
      const top=Math.round(m.y*height),bottom=Math.round((m.y+m.h)*height);
      const feather=Math.max(1,Math.round(Math.min(right-left,bottom-top)*.07));
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
        const edge=Math.min(x-left+.5,right-x-.5,y-top+.5,bottom-y-.5);
        const t=Math.max(0,Math.min(1,edge/feather));alpha[y*width+x]=Math.round(255*t*t*(3-2*t));
      }
      layers.push({alpha,settings:s.local,enabled:true,opacity:1});
    }
    if(layers.length||Object.values(s.global).some(Boolean))pixels=grade.render(pixels,width,height,s.global,layers);
    if(pixels===input.data)pixels=pixels.slice();
    self.postMessage({id:job.id,pixels},[pixels.buffer]);
  }catch(error){self.postMessage({id:job.id,error:error.message});}
};
