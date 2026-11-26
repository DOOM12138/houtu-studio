export const OUTPAINT_RATIOS=['1:1','4:5','2:3','3:2','16:9','9:16'];
export function outpaintCanvas(value){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('扩图画布设置无效。');
 if(value.mode==='ratio'){
  if(!OUTPAINT_RATIOS.includes(value.ratio))throw Error('请选择支持的扩图画幅。');
  return {mode:'ratio',ratio:value.ratio};
 }
 if(value.mode!=='sides')throw Error('扩图方式无效。');
 const result={mode:'sides'};for(const side of ['left','right','top','bottom']){
  const n=value[side];if(!Number.isInteger(n)||n<0||n>100)throw Error('每边扩图比例为0–100%的整数。');result[side]=n;
 }
 return result;
}
export function outpaintLayout(width,height,task={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>40000000)throw Error('扩图输入尺寸无效，最多4000万像素。');
 const canvas=outpaintCanvas(task.canvas),sides={left:0,right:0,top:0,bottom:0},long=Math.max(width,height);
 if(canvas?.mode==='ratio'){
  const [a,b]=canvas.ratio.split(':').map(Number),targetWidth=Math.max(width,Math.ceil(height*a/b)),targetHeight=Math.max(height,Math.ceil(width*b/a));
  sides.left=Math.floor((targetWidth-width)/2);sides.right=targetWidth-width-sides.left;sides.top=Math.floor((targetHeight-height)/2);sides.bottom=targetHeight-height-sides.top;
 }else if(canvas?.mode==='sides'){
  for(const side of Object.keys(sides))sides[side]=canvas[side]?Math.max(1,Math.round(long*canvas[side]/100)):0;
 }else{
  const padding=task.padding??20,direction=task.direction??'all';if(!Number.isInteger(padding)||padding<5||padding>50)throw Error('扩图比例为5–50%。');if(!['all','left','right','top','bottom'].includes(direction))throw Error('扩图方向无效。');
  const amount=Math.max(16,Math.round(long*padding/100));for(const side of Object.keys(sides))if(direction==='all'||direction===side)sides[side]=amount;
 }
 const targetWidth=width+sides.left+sides.right,targetHeight=height+sides.top+sides.bottom;
 if(targetWidth===width&&targetHeight===height)throw Error('画布没有新增区域。请增加某一边的比例，或换一个画幅。');
 if(targetWidth*targetHeight>40000000)throw Error('扩图后的画布超过4000万像素，请降低扩图比例或先缩小原图。');
 return {...sides,width:targetWidth,height:targetHeight,originalWidth:width,originalHeight:height};
}
