import {PAINT_LEVEL_MAX} from './paint-profile.js';
import {normalizeModel} from './model-options.js';
import {sceneGuideOptions} from './scene-guide.js';
export const socialReferenceProvider = provider => ['xiaohongshu','douyin'].includes(provider);
export const strictSocialReferences = config => socialReferenceProvider(config.referenceProvider) && config.allowPublicFallback === false;
export const AGENT_VERSION='retouch-agent-v1';
export const AGENT_LONG_SHOT_REVISION='agent-prompts-2026-11-27-r3';
export const AGENT_TEXTURE_REVISION='agent-prompts-2026-11-27-r4';
export const AGENT_SCULPT_REVISION='agent-prompts-2026-11-27-r5';
export const AGENT_HIGH_PAINT_REVISION='agent-prompts-2026-11-27-r6';
export const AGENT_FACE_FINISH_REVISION='agent-prompts-2026-11-27-r7';
export const AGENT_ORIGINAL_LIGHT_REVISION='agent-prompts-2026-11-27-r8';
export const AGENT_EVEN_LIGHT_REVISION='agent-prompts-2026-11-27-r9';
export const AGENT_PROMPT_REVISION='agent-prompts-2026-11-27-r10';
export const agentPaintLevel=config=>Math.min(config.paintLevel,[AGENT_HIGH_PAINT_REVISION,AGENT_FACE_FINISH_REVISION,AGENT_ORIGINAL_LIGHT_REVISION,AGENT_EVEN_LIGHT_REVISION,AGENT_PROMPT_REVISION].includes(config.promptRevision)?PAINT_LEVEL_MAX:6);
export const AGENT_TASKS=[['portrait','人物细化'],['outfit','衣料整理'],['belly','平滑瘦腹'],['clean','场照净场'],['paint','厚涂'],['color','调色'],['effects','小特效'],['small','小合成'],['large','大合成'],['figure','3D质感／手办'],['upscale','4K超分']];
export const PERSON_TASKS=['portrait','outfit','paint'];
const allowed=new Set(AGENT_TASKS.map(([id])=>id));
export function agentOptions(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('修图Agent设置无效。');
 const mode=input.mode||'auto',provider=input.provider||'auto';if(!['auto','semi','manual'].includes(mode)||!['auto','local','chatgpt'].includes(provider))throw Error('请选择全自动、半自动或手动，以及调度方式。');
 const tasks=[...new Set(input.tasks||[])];if(tasks.some(id=>!allowed.has(id)))throw Error('Agent包含未支持的勾选功能。');
 const paint=tasks.includes('paint'),style=input.style||(paint?'cos':'natural');if(!['natural','photo','cos','anime'].includes(style)||paint&&!['cos','anime'].includes(style)||!paint&&['cos','anime'].includes(style))throw Error('厚涂勾选与画风不一致。');
 const paintLevel=Number(input.paintLevel??2),bellyLevel=Number(input.bellyLevel??2),maxImageSteps=Number(input.maxImageSteps??6);if(!Number.isInteger(paintLevel)||paintLevel<1||paintLevel>10||!Number.isInteger(bellyLevel)||bellyLevel<1||bellyLevel>10||!Number.isInteger(maxImageSteps)||maxImageSteps<1||maxImageSteps>8)throw Error('厚涂／瘦腹程度为1–10，跑图上限为1–8。');
 const tone=tasks.includes('color')?input.tone||'none':'none';if(!['none','dark','bright','cinema'].includes(tone))throw Error('影调选择无效。');
 const effect=tasks.includes('effects')?input.effect||'sparkles':'none';if(!['sparkles','bokeh','snow','rain','petals','mist','rim','none'].includes(effect))throw Error('小特效选项无效。');
 const quality=input.quality!==false,repair=quality&&input.autoRepair===true;
 const hardware={};if(input.hardwarePolicy!==undefined){if(!['auto','cloud','hybrid'].includes(input.hardwarePolicy)||!['auto','qwen3-vl:4b','qwen3-vl:8b'].includes(input.localAgentModel||'auto'))throw Error('硬件路由或本地视觉Agent选择无效。');hardware.hardwarePolicy=input.hardwarePolicy;hardware.localAgentModel=input.localAgentModel||'auto';}
 const promptRevision=input.promptRevision??(input.version===AGENT_VERSION?null:AGENT_PROMPT_REVISION);
 if(promptRevision!==null&&![AGENT_PROMPT_REVISION,AGENT_EVEN_LIGHT_REVISION,AGENT_ORIGINAL_LIGHT_REVISION,AGENT_FACE_FINISH_REVISION,AGENT_HIGH_PAINT_REVISION,AGENT_SCULPT_REVISION,AGENT_TEXTURE_REVISION,AGENT_LONG_SHOT_REVISION,'agent-prompts-2026-11-27-r2'].includes(promptRevision))throw Error('Agent提示词版本无效。');
 const paintScope=input.paintScope??'portrait';
 if(!['portrait','full-body'].includes(paintScope)||paintScope==='full-body'&&(!paint||![AGENT_ORIGINAL_LIGHT_REVISION,AGENT_EVEN_LIGHT_REVISION,AGENT_PROMPT_REVISION].includes(promptRevision)))throw Error('全身厚涂需要新版已勾选厚涂的流程。');
 return {version:AGENT_VERSION,...(paintScope==='full-body'?{paintScope}:{}),...(promptRevision?{promptRevision}:{}),mode,provider,...hardware,...(input.sceneGuide==null?{}:{sceneGuide:sceneGuideOptions(input.sceneGuide)}),tasks,style,paintLevel:agentPaintLevel({paintLevel,promptRevision}),bellyLevel,tone,effect,goal:String(input.goal||'').trim().slice(0,2000),planningModel:normalizeModel(input.planningModel),generationModel:normalizeModel(input.generationModel),autoSearch:input.autoSearch!==false,referenceProvider:['commons','xiaohongshu','douyin'].includes(input.referenceProvider)?input.referenceProvider:'commons',allowPublicFallback:input.allowPublicFallback!==false,materialFallback:input.materialFallback==='pause'?'pause':'original',referenceCount:Math.max(1,Math.min(5,Math.round(Number(input.referenceCount)||5))),quality,autoRepair:repair,maxImageSteps};
}
export function agentActions(config){
 const tasks=new Set(config.tasks),ids=[];if(tasks.has('clean'))ids.push('clean');if(PERSON_TASKS.some(id=>tasks.has(id)))ids.push('person');for(const id of ['belly','small','large','figure','color','effects','upscale'])if(tasks.has(id))ids.push(id);return ids;
}
export const imageAction=id=>['clean','person','belly','small','large','figure','repair'].includes(id);
export function agentSteps(config){
 const actions=agentActions(config),steps=[['source','保留原图与勾选意图']];
 if(actions.length){steps.push(['inspect','分析人物、背景与光影'],['references',config.autoSearch?'自动找图与素材来源':'已提供参考与素材']);steps.push(['plan','安排所选功能与提示词']);if(actions.some(id=>['clean','person','belly','small','effects'].includes(id)))steps.push(['subject',config.hardwarePolicy?'主体蒙版（按硬件路由）':'本机自动主体蒙版']);for(const id of actions.filter(id=>id!=='upscale'))steps.push([id,({clean:'保留主体的场照净场',person:'人物／衣料／厚涂（仅勾选项）',belly:'平滑瘦腹与衣褶过渡',small:'小合成',large:'大场景合成',figure:'3D质感／手办图片',color:'本机调色',effects:'本机小特效'})[id]]);if(config.quality)steps.push(['check','检查身份、光影与融合']);if(config.autoRepair&&actions.some(imageAction))steps.push(['repair','必要时在所选范围细化一次'],['recheck','细化后再次检查（不循环跑图）']);if(actions.includes('upscale'))steps.push(['upscale',config.hardwarePolicy?'4K细节增强（按硬件路由）':'本机4K超分']);}
 steps.push(['deliver','保存成品与交付记录']);return steps.map(([id,name],index)=>({id,name,deps:index?[steps[index-1][0]]:[]}));
}
export function agentBudget(config){const actions=agentActions(config),base=actions.filter(imageAction).length,cloudExtra=config.hardwarePolicy&&config.hardwarePolicy!=='hybrid'?(actions.some(id=>['clean','person','belly','small','effects'].includes(id))?1:0)+(actions.includes('upscale')?1:0):0,images=base+(config.autoRepair&&base?1:0)+cloudExtra;return {imageSteps:images,cloudExtra,limit:config.maxImageSteps,withinLimit:images<=config.maxImageSteps,localSteps:actions.filter(id=>!imageAction(id)).length};}
