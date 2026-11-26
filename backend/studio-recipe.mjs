import {superresOptions} from '../public/superres-options.js';
import {toneChoice} from '../frontend/tonal-looks.js';
import {normalizeEditOptions} from '../lib/painting.mjs';
import {normalizeModel} from '../public/model-options.js';
import {localOptions,exportOptions} from './local-image.mjs';
import {settings,BUILTINS} from '../frontend/engine.js';
import {isSceneOperation} from '../public/scene-options.js';
import {agentOptions,agentBudget} from '../public/retouch-agent-options.js';
const cleanName=(value,fallback)=>String(value||fallback).trim().slice(0,80)||fallback;
// Replace matching slots without moving the target's unrelated steps.
export function mergeRecipeStages(target,source,categories){
 const stages=[],remaining=new Map(categories.map(type=>[type,source.filter(s=>s.type===type)]));
 for(let index=0;index<target.length;index++){
  const stage=target[index],items=remaining.get(stage.type);
  if(!items){stages.push(stage);continue;}
  if(items.length)stages.push(items.shift());
  if(!target.slice(index+1).some(s=>s.type===stage.type)){stages.push(...items);items.length=0;}
 }
 for(const type of categories){const items=remaining.get(type);if(!items.length)continue;const at=['local','retouch'].includes(type)?0:stages.length-1;stages.splice(at,0,...items);}
 return stages;
}
export function recipeValue(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('流程配方格式无效。');
 const reviewed=input.reviewEach===true;
 if(!Array.isArray(input.stages)||input.stages.length<1||input.stages.length>(reviewed?76:12))throw Error(reviewed?'逐步清单最多75项修图和一个本机导出。':'流程配方需要1–12个步骤。');
 if(reviewed&&(input.stages.length<2||input.stages.slice(0,-1).some(s=>s?.type!=='retouch'||s.enabled===false)||new Set(input.stages.slice(0,-1).map(s=>s.options?.operation)).size!==input.stages.length-1))throw Error('逐步清单只接受互不重复的已有修图功能。');
 let enabled=0;const stages=input.stages.map((stage,index)=>{
  if(!stage||typeof stage!=='object')throw Error('流程步骤无效。');const type=stage.type;let options;
  if(type==='retouch'){options=normalizeEditOptions({...stage.options,model:null,parentId:null});if(!reviewed&&stage.enabled!==false&&isSceneOperation(options.operation)&&options.scene.protectSubject&&enabled>0)throw Error('使用主体保护的场照步骤请放在第一步，后续图像变动后需重新确认蒙版。');}
  else if(type==='agent')options=agentOptions(stage.options);
  else if(type==='upscale')options=superresOptions(stage.options);
  else if(type==='local')options=localOptions(stage.options);
  else if(type==='grade'){if(stage.options?.layers?.length)throw Error('流程全局调色不自动重算照片专属蒙版，请进入调色工作台使用局部图层。');options={settings:settings(stage.options?.settings||stage.options||{}),look:toneChoice(stage.options?.look)};}
  else if(type==='export')options=exportOptions(stage.options);
  else throw Error('不支持的流程步骤。');
  if(stage.enabled!==false)enabled++;return {id:type==='export'&&index===input.stages.length-1?'deliver':'stage'+(index+1),name:cleanName(stage.name,{agent:'修图Agent',retouch:'AI精修',upscale:'本机超分4K',local:'本机图像处理',grade:'全局调色',export:'导出成片'}[type]),type,enabled:stage.enabled!==false,options};
 });
 if(stages.at(-1).type!=='export'||stages.slice(0,-1).some(stage=>stage.type==='export'))throw Error('导出需要作为最后一步，且只能有一个导出步骤。');
 if(!stages.at(-1).enabled)throw Error('导出步骤不能关闭。');
 return {schemaVersion:1,...(reviewed?{reviewEach:true}:{}),name:cleanName(input.name,'我的修图配方'),description:String(input.description||'').slice(0,300),model:normalizeModel(input.model),stages};
}
export function validateDeskMode(mode,recipe){
 const steps=recipe?.stages||[],auto=mode==='auto'&&!recipe.reviewEach&&steps.length===2&&steps[0].type==='agent'&&steps[0].options.mode==='auto'&&steps[0].enabled&&steps[1].type==='export';
 const semi=mode==='semi'&&recipe.reviewEach===true&&steps.length>=2&&steps.slice(0,-1).every(s=>s.type==='retouch'&&s.enabled)&&steps.at(-1).type==='export';
 if(!auto&&!semi)throw Error('AI 修图模式与保存的步骤配置不一致。');
}
const retouch=(name,options)=>({type:'retouch',name,options:{task:{autoTarget:true,sourceRetention:0},...options}}),finish={type:'export',name:'成片导出',options:{format:'png',quality:90}};
// Append new builtins; stored builtin IDs must never change a local recipe into AI work.
export const RECIPE_SEEDS=[
 {name:'自然人物完整精修',stages:[retouch('人物自然细化',{operation:'portrait-polish',style:'natural'}),retouch('服装褶皱整理',{operation:'outfit',style:'natural'}),{type:'local',name:'轻量清晰度',options:{sharpen:.5}},finish]},
 {name:'克制二次元厚涂',stages:[retouch('二次元厚涂2级',{operation:'full-body',style:'anime',paintLevel:2}),retouch('成品人物细化',{operation:'portrait-polish',style:'natural'}),finish]},
 {name:'场照净场与人物细化',stages:[retouch('保留主体净场',{operation:'clear-background',scene:{protectSubject:true}}),retouch('人物与衣料细化',{operation:'portrait-polish',style:'natural'}),finish]},
 {name:'平滑瘦腹与服装整理',stages:[retouch('自然平滑收腹',{operation:'smooth-belly',belly:{level:2,fabric:'auto',transition:'wide'}}),retouch('服装顺势整理',{operation:'outfit',style:'natural'}),finish]},
 {name:'全本机整理与导出',stages:[{type:'local',name:'方向、尺寸与清晰度',options:{rotate:0,maxEdge:2400,sharpen:.3}},{type:'grade',name:'自然通透全局色彩',options:{settings:BUILTINS[0]?.settings||{}}},{...finish,options:{format:'jpeg',quality:92}}]},
 {name:'真人COS参考厚涂6级',stages:[retouch('眼妆、体积与发束',{operation:'cos-paint',style:'cos',paintLevel:6,strength:'balanced'}),finish]},
 {name:'暗调本机调色',stages:[{type:'grade',name:'清冷暗调70%',options:{look:{id:'dark-clean',amount:70}}},finish]},
 {name:'亮调本机调色',stages:[{type:'grade',name:'清透亮调70%',options:{look:{id:'bright-air',amount:70}}},finish]},
 {name:'电影质感本机调色',stages:[{type:'grade',name:'冷暖电影70%',options:{look:{id:'cinema-teal',amount:70}}},finish]},
 {name:'本机4K超分 · 真人／COS',stages:[{type:'upscale',name:'真人／COS 4K超分',options:{model:'general-x4v3-dn50',longEdge:4096,amount:75,preserveColor:true}},finish]},
 {name:'本机4K超分 · 二次元',stages:[{type:'upscale',name:'二次元4K超分',options:{model:'animevideov3',longEdge:4096,amount:75,preserveColor:true}},finish]},
].map((input,index)=>({id:'builtin-'+(index+1),builtin:true,...recipeValue(input)}));
export const recipeReport=recipe=>({steps:recipe.stages.length,aiSteps:recipe.stages.filter(stage=>stage.enabled&&stage.type==='retouch').length+recipe.stages.filter(s=>s.enabled&&s.type==='agent').reduce((n,s)=>n+agentBudget(s.options).imageSteps,0),localSteps:recipe.stages.filter(stage=>stage.enabled&&!['retouch','agent'].includes(stage.type)).length,requiresSubjectMask:recipe.stages.some(stage=>stage.enabled&&stage.type==='retouch'&&stage.options.scene?.protectSubject),freeWebsite:true});
