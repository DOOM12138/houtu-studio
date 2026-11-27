import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile,writeFile,rename,mkdir } from 'node:fs/promises';
import {normalizeToneState} from '../frontend/tonal-looks.js';
import { settings,clamp } from '../frontend/engine.js';
const TYPES=new Set(['person','background','hair','skin','face','clothes','accessories','brush','luminance','color','linear','radial']);
export function normalizePreset(input) {
  if(!input||typeof input!=='object'||typeof input.name!=='string'||!input.name.trim()) throw new Error('请输入预设名称。');
  const name=input.name.trim().slice(0,60),description=String(input.description||'').slice(0,240);
  if(!input.settings||typeof input.settings!=='object') throw new Error('预设缺少调色参数。');
  const layers=(Array.isArray(input.layers)?input.layers:[]).slice(0,12).filter(l=>TYPES.has(l.type)).map(l=>({
    id:randomUUID(),name:String(l.name||l.type).slice(0,60),type:l.type,enabled:l.enabled!==false,opacity:clamp(Number(l.opacity??1)||0),invert:Boolean(l.invert),
    low:clamp(Number(l.low??.4)||0),high:clamp(Number(l.high??1)||0),angle:clamp(Number(l.angle??90)||0,0,360),tolerance:clamp(Number(l.tolerance??.35)||.35,.01,1.74),
    color:Array.from({length:3},(_,i)=>clamp(Number(l.color?.[i]??.5)||0)),settings:settings(l.settings),
    ...(['linear','radial'].includes(l.type)&&l.geometry==='pixel'?{geometry:'pixel'}:{}),
    // Brush paths/raster/photographs are image-specific and never included in shared presets.
    strokes:[],
  })).filter(l=>l.type!=='brush');
  return {name,description,tone:normalizeToneState(input.tone,input.settings),settings:settings(input.settings),layers};
}
export class ColorStore {
  constructor(directory,defaults=path.join(directory,'no-default-color-presets.json')){this.file=path.join(directory,'color-presets.json');this.defaults=defaults;this.entries=[];this.queue=Promise.resolve();}
  async load(){try{const raw=JSON.parse(await readFile(this.file,'utf8'));this.entries=raw.presets.slice(0,100).map(p=>({...normalizePreset(p),id:p.id,created:p.created}));}catch(e){if(e.code!=='ENOENT')throw e;try{this.entries=JSON.parse(await readFile(this.defaults,'utf8')).presets.map(p=>({...normalizePreset(p),id:randomUUID(),created:Date.now()}));}catch(e){if(e.code!=='ENOENT')throw e;}}}
  list(){return structuredClone(this.entries);}
  mutate(fn){const next=this.queue.then(async()=>{const copy=structuredClone(this.entries),result=fn(copy);await mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({schemaVersion:1,presets:copy},null,2));await rename(temp,this.file);this.entries=copy;return result;});this.queue=next.catch(()=>{});return next;}
  save(input,id){const item=normalizePreset(input);return this.mutate(entries=>{const index=id?entries.findIndex(p=>p.id===id):-1;if(id&&index<0)throw new Error('预设不存在，请保存为新预设。');if(index<0&&entries.length>=100)throw new Error('最多保存100个预设，请先删除部分预设。');const entry={...item,id:id||randomUUID(),created:Date.now()};if(index<0)entries.push(entry);else entries[index]=entry;return entry;});}
  remove(id){return this.mutate(entries=>{const i=entries.findIndex(p=>p.id===id);if(i<0)throw new Error('预设不存在。');entries.splice(i,1);return true;});}
  import(input){if(input?.schema!=='houtu-color-presets'||input.version!==1||!Array.isArray(input.presets)||input.presets.length>100)throw new Error('请选择本网站导出的调色预设 JSON 文件。');const items=input.presets.map(normalizePreset);return this.mutate(entries=>{if(entries.length+items.length>100)throw new Error('导入后将超过100个预设，请先整理预设库。');entries.push(...items.map(p=>({...p,id:randomUUID(),created:Date.now()})));return items.length;});}
}
