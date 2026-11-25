import {agentActions} from '../public/retouch-agent-options.js';
import sharp from 'sharp';
import {checkPrompt,validateAgentCheck} from './agent-planning.mjs';
export const CLOUD_AGENT_VERSION='agent-cloud-models-v1';
export const needsSubject=config=>agentActions(config).some(id=>['person','belly','clean','small','effects'].includes(id));
export const cloudInternalAction=(config,id)=>!!config.hardwarePolicy&&(id==='subject'?needsSubject(config):id==='upscale'&&config.tasks.includes('upscale'));
export function cloudInternalPrompt(config,id){
 if(id==='subject')return '仅生成原图主体的像素级黑白保护蒙版，不生成修后照片。保持原图取景、比例、姿态和人物位置完全对齐。主角完整可见的人物、头发、服装、肢体、耳朵、道具为白色；背景、路人、灯架为纯黑。发丝边缘可柔和灰阶；不能有文字、棋盘格、描边、阴影或新人物。白色代表需要保留的主角，不包含背景。不要修改人物形状，不把人像改成居中肖像。';
 if(id==='upscale')return '仅对当前成片做细节增强与清晰度提升，尽可能输出原生4K长边。逐像素尊重原有构图、身份、眼型、妆容、发色、服装纹样、光向与颜色；不再次执行厚涂、瘦身、换背景或增加特效。皮肤、发丝与织物纹理清楚但不过锐，不产生新五官、文字或重复细节。保持当前媒介和宽高比。输出一张增强后的图片。';
 throw Error('此节点没有获得云端模型执行授权。');
}
export const maskCheckPrompt=()=> '图片1为原图，图片2为待验证的主体黑白蒙版。只分析，不能生成图或调用工具。逐项检查蒙版是否与原图像素构图对齐、完整包含主角的可见全身和头发服装道具、排除背景与路人、边缘没有明显缺口或大范围溢出。不要识别真人姓名。只返回JSON {aligned:boolean,complete:boolean,backgroundExcluded:boolean,edgesAcceptable:boolean,confidence:0..1,summary:中文具体依据}。不能确认的项目按false，不要把近似轮廓称作精确抠图。';
export function validateCloudMask(value){if(!value||!['aligned','complete','backgroundExcluded','edgesAcceptable'].every(k=>typeof value[k]==='boolean')||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1||typeof value.summary!=='string')throw Error('云端蒙版检查没有返回完整依据。');return {...Object.fromEntries(['aligned','complete','backgroundExcluded','edgesAcceptable'].map(k=>[k,value[k]])),confidence:value.confidence,summary:value.summary.slice(0,1800),pass:value.confidence>=.85&&['aligned','complete','backgroundExcluded','edgesAcceptable'].every(k=>value[k])};}
const inputRequired=message=>Object.assign(Error(message),{code:'INPUT_REQUIRED'});
export async function cloudSubject(service,w,node,token,run,inputAsset){
 const rendered=await service.renderImage(w,node,token,run,inputAsset,{id:'subject',parameters:{}}),source=await service.workflows.asset(w.id,inputAsset),bytes=await service.bytes(w.id,rendered.imageAsset),mask=await sharp(bytes,{limitInputPixels:40000000}).flatten({background:'black'}).removeAlpha().greyscale().resize(source.width,source.height,{fit:'fill'}).png().toBuffer(),saved=await service.workflows.putAsset(w.id,mask,'image/png'),stats=await sharp(mask).stats();
 const pixels=await sharp(mask).raw().toBuffer();let white=0,black=0;for(const value of pixels){if(value>=245)white++;if(value<=10)black++;}const metrics={whiteFraction:white/pixels.length,blackFraction:black/pixels.length,softFraction:1-(white+black)/pixels.length};
 const candidate={...rendered,imageAsset:inputAsset,estimatedMask:saved.id,origin:'cloud-generated-mask',engine:'ChatGPT-image',localNeuralInference:false,maskMetrics:metrics};await service.partial(w.id,node.id,token,candidate);
 if(stats.channels[0].mean<1||stats.channels[0].mean>250||metrics.whiteFraction<.005||metrics.blackFraction<.005||metrics.softFraction>.25)throw inputRequired('云端蒙版覆盖或黑白分区异常，请确认或上传白色保留主体的蒙版，原请求不会重发。');
 const preview=await service.preview(w.id,mask),result=await service.analyzeCloud(w,node,token,run,[w.steps[0].output.previewAsset,preview],maskCheckPrompt()),review=validateCloudMask(result.value);await service.partial(w.id,node.id,token,{...candidate,maskReview:review,analysis:result.receipt});if(!review.pass)throw inputRequired('云端蒙版检查未通过，请确认／修正蒙版后继续；未调用本地模型。');
 return {...candidate,estimatedMask:null,maskAsset:saved.id,requiresReview:false,maskReview:review,analysis:result.receipt};
}
export async function cloudUpscale(service,w,node,token,run,inputAsset){
 const source=await service.workflows.asset(w.id,inputAsset);if(Math.max(source.width,source.height)>=4096)return {imageAsset:inputAsset,engine:null,localNeuralInference:false,report:{skipped:true,reason:'当前图片已达到4K长边，保留原尺寸与像素。'}};
 const rendered=await service.renderImage(w,node,token,run,inputAsset,{id:'upscale',parameters:{}});await service.partial(w.id,node.id,token,{...rendered,localNeuralInference:false});
 const preview=await service.preview(w.id,await service.bytes(w.id,rendered.imageAsset)),before=await service.preview(w.id,await service.bytes(w.id,inputAsset)),config={...w.config,tasks:['upscale'],style:'natural'},result=await service.analyzeCloud(w,node,token,run,[before,preview],'这是放大前后对照，只允许细节增强；不能改变原画风、身份、场景或颜色。'+checkPrompt(config)),review=validateAgentCheck(result.value,config);
 if(!review.pass){await service.partial(w.id,node.id,token,{...rendered,quality:review,analysis:result.receipt,localNeuralInference:false});throw inputRequired('云端4K细节增强检查未通过，结果保留；请检查后建立新分支，不会自动重复出图。');}
 const child=await service.workflows.get(rendered.childWorkflowId),compose=child.steps.find(s=>s.id==='compose')?.output,raw=compose?.rawAsset||child.steps.find(s=>s.id==='generate')?.output?.rawAsset||child.steps.find(s=>s.id==='generate')?.output?.imageAsset,native=raw?await service.workflows.asset(child.id,raw):null,delivered=await service.workflows.asset(w.id,rendered.imageAsset);
 return {...rendered,engine:'ChatGPT-image',quality:review,analysis:result.receipt,localNeuralInference:false,report:{runtime:'cloud',method:'云端细节增强；交付尺寸必要时由普通插值调整，不冒充本机Real-ESRGAN或原生4K细节证明',nativeGenerated:native?{width:native.width,height:native.height}:null,delivered:{width:delivered.width,height:delivered.height},resizedForDelivery:native?native.width!==delivered.width||native.height!==delivered.height:null}};
}
