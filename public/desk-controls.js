import {PRESETS} from './catalog.js';

export const deskTools=new Map(PRESETS.map(tool=>[tool.id,tool]));
export const deskGroups=[...new Set(PRESETS.map(tool=>tool.group))];
export const toolName=id=>deskTools.get(id)?.name||id;
export const deskDefaults=()=>({operations:[],parameters:{},auto:{tone:'none',paint:false,effects:false,paintLevel:2,paintStyle:'cos',paintScope:'portrait',effect:'sparkles',referenceProvider:'xiaohongshu',character:'',work:''},model:null});
export function stageOptions(id,params={}){
 const tool=deskTools.get(id);
 if(!tool)throw Error('此修图功能不存在。');
 const settings={operation:id,style:tool.style||'natural',...(params.prompt?.trim()?{prompt:params.prompt.trim()}:{}),
   task:{autoTarget:params.autoTarget!==false,target:params.target?.trim()||''}};
 if(tool.output==='outpaint'){settings.task.padding=params.padding??20;settings.task.direction=params.direction||'all';}
 if(tool.output==='upscale')settings.task.longEdge=params.longEdge??4096;
 if(tool.scene||['remove-people','remove-equipment','clear-background','dimension-effects','hair-lift','hair-glow'].includes(id)){
  if(params.protectSubject!==undefined)settings.scene={protectSubject:params.protectSubject};
 }
 if(id==='smooth-belly')settings.belly={level:params.level??2};
 if(tool.style==='cos'||tool.style==='anime')settings.paintLevel=params.level??2;
 if(tool.extended)settings.task.level=params.level??2;
 return settings;
}
export function listOperation(ids,id,checked){
 if(!deskTools.has(id))return ids;
 return checked?(ids.includes(id)?ids:[...ids,id]):ids.filter(v=>v!==id);
}
export function moveOperation(ids,id,offset){
 const i=ids.indexOf(id),j=i+offset;
 if(i<0||j<0||j>=ids.length)return ids;
 const result=[...ids];[result[i],result[j]]=[result[j],result[i]];return result;
}
export function missingInput(id,params={}){
 const tool=deskTools.get(id);
 if(tool?.referenceRole&&!params.references?.length)return '请先添加本步的参考图。';
 if(tool?.needsTarget&&!params.target?.trim())return '请先填写本步处理的部位或物品。';
 return '';
}
