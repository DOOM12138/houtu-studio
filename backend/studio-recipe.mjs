import {normalizeEditOptions} from '../lib/painting.mjs';
import {normalizeModel} from '../public/model-options.js';
import {localOptions,exportOptions} from './local-image.mjs';
import {settings,BUILTINS} from '../frontend/engine.js';
import {isSceneOperation} from '../public/scene-options.js';
const cleanName=(value,fallback)=>String(value||fallback).trim().slice(0,80)||fallback;
export function recipeValue(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('流程配方格式无效。');
 if(!Array.isArray(input.stages)||input.stages.length<1||input.stages.length>12)throw Error('流程配方需要1–12个步骤。');
 let enabled=0;const stages=input.stages.map((stage,index)=>{
  if(!stage||typeof stage!=='object')throw Error('流程步骤无效。');const type=stage.type;let options;
  if(type==='retouch'){options=normalizeEditOptions({...stage.options,model:null,parentId:null});if(stage.enabled!==false&&isSceneOperation(options.operation)&&options.scene.protectSubject&&enabled>0)throw Error('使用主体保护的场照步骤请放在第一步，后续图像变动后需重新确认蒙版。');}
  else if(type==='local')options=localOptions(stage.options);
  else if(type==='grade'){if(stage.options?.layers?.length)throw Error('流程全局调色不自动重算照片专属蒙版，请进入调色工作台使用局部图层。');options={settings:settings(stage.options?.settings||stage.options||{})};}
  else if(type==='export')options=exportOptions(stage.options);
  else throw Error('不支持的流程步骤。');
  if(stage.enabled!==false)enabled++;return {id:type==='export'&&index===input.stages.length-1?'deliver':'stage'+(index+1),name:cleanName(stage.name,{retouch:'AI精修',local:'本机图像处理',grade:'全局调色',export:'导出成片'}[type]),type,enabled:stage.enabled!==false,options};
 });
 if(stages.at(-1).type!=='export'||stages.slice(0,-1).some(stage=>stage.type==='export'))throw Error('导出需要作为最后一步，且只能有一个导出步骤。');
 if(!stages.at(-1).enabled)throw Error('导出步骤不能关闭。');
 return {schemaVersion:1,name:cleanName(input.name,'我的修图配方'),description:String(input.description||'').slice(0,300),model:normalizeModel(input.model),stages};
}
const retouch=(name,options)=>({type:'retouch',name,options}),finish={type:'export',name:'成片导出',options:{format:'png',quality:90}};
export const RECIPE_SEEDS=[
 {name:'自然人物完整精修',stages:[retouch('人物自然细化',{operation:'portrait-polish',style:'natural'}),retouch('服装褶皱整理',{operation:'outfit',style:'natural'}),{type:'local',name:'轻量清晰度',options:{sharpen:.5}},finish]},
 {name:'克制二次元厚涂',stages:[retouch('二次元厚涂2级',{operation:'full-body',style:'anime',paintLevel:2}),retouch('成品人物细化',{operation:'portrait-polish',style:'natural'}),finish]},
 {name:'场照净场与人物细化',stages:[retouch('保留主体净场',{operation:'clear-background',scene:{protectSubject:true}}),retouch('人物与衣料细化',{operation:'portrait-polish',style:'natural'}),finish]},
 {name:'平滑瘦腹与服装整理',stages:[retouch('自然平滑收腹',{operation:'smooth-belly',belly:{level:2,fabric:'auto',transition:'wide'}}),retouch('服装顺势整理',{operation:'outfit',style:'natural'}),finish]},
 {name:'全本机整理与导出',stages:[{type:'local',name:'方向、尺寸与清晰度',options:{rotate:0,maxEdge:2400,sharpen:.3}},{type:'grade',name:'自然通透全局色彩',options:{settings:BUILTINS[0]?.settings||{}}},{...finish,options:{format:'jpeg',quality:92}}]},
].map((input,index)=>({id:'builtin-'+(index+1),builtin:true,...recipeValue(input)}));
export const recipeReport=recipe=>({steps:recipe.stages.length,aiSteps:recipe.stages.filter(stage=>stage.enabled&&stage.type==='retouch').length,localSteps:recipe.stages.filter(stage=>stage.enabled&&stage.type!=='retouch').length,requiresSubjectMask:recipe.stages.some(stage=>stage.enabled&&stage.type==='retouch'&&stage.options.scene?.protectSubject),freeWebsite:true});
