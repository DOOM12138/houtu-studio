import sharp from 'sharp';
import {decodeImage} from '../lib/painting.mjs';
import {taskOptions} from '../public/prompt-contract.js';
export function referenceInputs(input=[]){if(!Array.isArray(input)||input.length>5)throw Error('功能参考图最多5张。');return input.map((item,index)=>{if(!item||typeof item!=='object')throw Error('参考图格式无效。');if(!['any','outfit','pose','palette','element','makeup','scene','style','result-guide'].includes(item.role||'any'))throw Error('参考图角色无效。');const decoded=decodeImage(item.image);return {bytes:decoded.bytes,role:item.role||'any',title:String(item.title||'参考'+(index+1)).slice(0,80)};});}
export async function expandedCanvas(source,task){
 const t=taskOptions(task),meta=await sharp(source).metadata(),amount=Math.max(16,Math.round(Math.max(meta.width,meta.height)*t.padding/100)),sides={left:0,right:0,top:0,bottom:0};for(const side of Object.keys(sides))if(t.direction==='all'||side===t.direction)sides[side]=amount;
 const width=meta.width+sides.left+sides.right,height=meta.height+sides.top+sides.bottom;if(width*height>40000000)throw Error('扩图后的画布超过4000万像素，请先缩小原图或降低扩图比例。');
 // Repeated edge pixels supply an opaque transition, never an artificial black border.
 const bytes=await sharp(source).extend({...sides,extendWith:'copy'}).png().toBuffer(),mask=await sharp({create:{width,height,channels:3,background:'white'}}).composite([{input:await sharp({create:{width:meta.width,height:meta.height,channels:3,background:'black'}}).png().toBuffer(),left:sides.left,top:sides.top}]).png().toBuffer();return {bytes,mask,layout:{...sides,width,height,originalWidth:meta.width,originalHeight:meta.height}};
}
export async function upscaleOutput(bytes,task){const t=taskOptions(task),m=await sharp(bytes).metadata(),scale=t.longEdge/Math.max(m.width,m.height),width=Math.max(1,Math.round(m.width*scale)),height=Math.max(1,Math.round(m.height*scale));if(width*height>40000000)throw Error('此比例放大后超过4000万像素，请选择较小尺寸。');return sharp(bytes).resize(width,height,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();}
