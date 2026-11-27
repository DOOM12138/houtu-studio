import {outpaintCanvas} from './outpaint-layout.js';
export const PROMPT_VERSION='2026.11.27-r16';
export const DEFAULT_EDIT_BRIEF='以原图为准，只修本项可见问题。保留辨识度、原有设计、真实纹理及场景光色。';
export function featureDefault(tool){if(tool?.id?.endsWith('-extract'))return '仅提取明确指定的原物，设计、比例、颜色与可见细节保持，不虚构被遮挡部分；输出干净普通底图。';if(tool?.output==='outpaint')return '保留完整原图，只补新增边缘的环境和空间，不补画画外人物。';if(tool?.changes?.includes('medium'))return '以原角色设计为准进行指定媒介转换，保持身份、姿态、配色和服饰要素。';return DEFAULT_EDIT_BRIEF;}
export function taskOptions(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('专项设置格式无效。');
 const level=input.level??2,longEdge=input.longEdge??4096,padding=input.padding??20,direction=input.direction??'all';
 if(!Number.isInteger(level)||level<1||level>10)throw Error('专项程度为1–10的整数。');
 if(![1024,2048,4096,8192].includes(longEdge))throw Error('输出最长边请选择1024/2048/4096/8192。');
 if(!Number.isInteger(padding)||padding<5||padding>50)throw Error('扩图比例为5–50%。');
 if(!['all','left','right','top','bottom'].includes(direction))throw Error('扩图方向无效。');
 const sourceRetention=input.sourceRetention??0;if(!Number.isInteger(sourceRetention)||sourceRetention<0||sourceRetention>95)throw Error('原图融合比例为0–95%。');return {level,longEdge,padding,direction,autoTarget:input.autoTarget===true,sourceRetention,target:String(input.target||'').slice(0,500),...(input.canvas!==undefined?{canvas:outpaintCanvas(input.canvas)}:{})};
}
export function aestheticContract(tool,{painting=false}={}){
 const changes=new Set(tool.changes||[]),fixed=tool.id.endsWith('-extract')?['原物款式、比例、颜色与可见纹样']:['人物身份与神态','发色和配饰数量'];if(tool.id!=='iris-color'&&!tool.id.endsWith('-extract'))fixed.push('原瞳色');
 if(!tool.id.endsWith('-extract')&&!changes.has('pose'))fixed.push('五官相对位置与原姿态');
 if(!tool.id.endsWith('-extract')&&!changes.has('outfit'))fixed.push('服装款式、纹样、接缝与覆盖范围');
 if(!changes.has('background'))fixed.push('未要求修改的场景与景物');
 return [changes.has('medium')?'本次是明确的媒介转换：必须在允许范围内完成指定的三维渲染/实体手办材质，不可仅加滤镜或底座后仍保留原媒介。程度只控制细节和风格强调，不降低任务完成度；局部任务以外保持原媒介。':painting?'审美基准：在所选部位完成当前厚涂档位可观察的表面塑形，允许改变妆面、明暗归纳与发束表现；身份与设计保持，范围外保持原图。不要把风格任务退化成几乎不变的磨皮。':'审美基准：以原图为依据，完成本次明确任务所需的最小修改；已经自然的地方无需处理，不以“看起来改动很多”作为成功标准。',
  '必须保留：'+fixed.join('、')+'。不可见部位不补画，闭嘴不补牙，画外身体不生成。',
  !changes.has('lighting')&&!changes.has('palette')?'沿用原图整体白平衡、曝光与冷暖；肤色从脸到颈手连续，保留合理环境反光，不把不同材料统一抹成一种颜色。':'光线或调色改变必须让脸、颈手、头发、衣料和环境同步响应，保护自然肤色及层次。',
  changes.has('medium')?'按指定新媒介表现皮肤、头发、衣料与道具；手办需呈现哑光树脂头脸、漆面发束与微缩衣装材质，三维渲染需可辨PBR粗糙度和体积受光，角色设计和材质区分清楚，细节服从整体，不把所有材质做成同一种塑料。':'皮肤与原画纹理按选定媒介自然表现，假发顺着原有发束，衣褶遵循重力、姿态和受力点；避免塑料皮、假毛孔、橡皮衣服、锐化白边和局部贴片感。',
  '保留原有合法署名、服装文字和标识，不擅自新增、删除或重写；只返回一张真实图片，不附对比拼图、说明、边框或参数文字。'].join('\n');
}
export const UNIVERSAL_CHECKS=['人物辨识度与神态保留','只完成指定任务，未指定区域不重画','皮肤/发丝/衣料各有原本质感','肤色与环境光连续，无贴片和锐化边','取景与肢体结构可信，合法署名保留'];
