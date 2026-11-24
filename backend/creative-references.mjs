import {requireAnalysisSpec} from '../lib/prompt-registry.mjs';
import {modelKey} from '../public/model-options.js';
import sharp from 'sharp';
import {manualReferences,signature} from './creative-vision.mjs';
const referenceKey=url=>{try{const u=new URL(url),note=u.pathname.match(/\/(?:explore|search_result)\/([^/?#]+)/);return note&&u.hostname.endsWith('xiaohongshu.com')?'xhs:'+note[1]:u.origin+u.pathname;}catch{return String(url);}};
const LICENSE=/^(CC0|Public domain|PDM|CC BY(?:-SA)? [1-4](?:\.0)?)$/i;
export async function collectReferences(service,w,attempt,execution){
 const config=w.config,id=w.id,source=w.steps[0].output,old=w.steps.find(n=>n.id==='materials').output||{},manual=manualReferences(w),brief=w.steps.find(n=>n.id==='brief')?.output;
 let material=w.overrides?.material||source.material,provenance=[],query=config.query||brief?.queries?.commons||'',platformQuery=config.platformQuery||brief?.queries?.xiaohongshu||config.character.slice(0,80)||'人物 合成 光影 参考',searchPlan=null;
 const key=signature({source:source.source,characters:source.characters,material,manual,query,platformQuery,autoMaterials:config.autoMaterials,autoReferences:config.autoReferences,provider:config.referenceProvider,platformReference:config.platformReference});
 let candidates=old.collectionSignature===key?(old.candidates||manual):manual;
 if(old.collectionSignature===key){material=old.material||material;provenance=old.provenance||[];}
 const progress=async()=>{const partial={material,reference:candidates[0]?.assetId||null,candidates,provenance,searchPlan,collectionSignature:key,queries:{commons:query,xiaohongshu:platformQuery},target:config.referenceCount||5};await service.workflows.mutate(id,current=>{const n=current.steps.find(s=>s.id==='materials');if(n.token!==attempt.token)throw Error('参考采集已经过期。');n.output=partial;n.artifacts=candidates.map(r=>({id:r.assetId,type:'image',label:r.title}));Object.assign(n.attempts.at(-1),{output:partial,artifacts:n.artifacts});return {};});return partial;};
 if(config.autoMaterials&&!material&&config.aiSearch&&!query){
  const oldKey=signature({...modelKey(config.model),source:source.source,characters:source.characters,material,manual,character:config.character,prompt:config.prompt,mode:config.mode});
  if(old.searchPlan?.signature===oldKey)searchPlan=old.searchPlan;
  else{if(!await service.bridge.account())throw Error('素材关键词规划需要先登录ChatGPT。');const image=await service.workflows.asset(id,source.source),ref=source.characters[0]?await service.workflows.asset(id,source.characters[0]):null;const control=await service.modelControl(id,execution,config.model);execution.job=control;let result;try{result=await service.bridge.critique(image.file,ref?.file||null,'Inspect the source and character sheet. Return JSON {query:English Wikimedia search words,summary:Chinese explanation} for a coherent supporting background/prop. '+config.character+' '+config.prompt,[],control);}finally{if(execution.job===control)execution.job=null;}searchPlan={promptVersion:requireAnalysisSpec('creative.material-search').version,compiledPrompt:control.analysisPrompt||null,signature:oldKey,account:control.account||null,model:config.model||null,resolvedModel:control.resolvedModel||null,query:String(result.query||'').slice(0,120),summary:String(result.summary||'').slice(0,600)};if(!searchPlan.query)throw Error('没有取得可用素材关键词。');await progress();}
  query=searchPlan.query;
 }
 if(execution.stop)throw Error('已停止，已采集的参考和关键词已保留。');
 if(config.autoMaterials&&!material){const results=(await service.search(query||'fantasy landscape')).filter(r=>LICENSE.test(r.license));let lastError;for(const result of results.slice(0,3)){try{const fetched=await service.fetchAsset(result.image);const bytes=await sharp(fetched.bytes,{limitInputPixels:24000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer();material=(await service.workflows.putAsset(id,bytes,'image/png')).id;provenance.push({...result,usage:'composition'});await progress();break;}catch(e){lastError=e;}}if(!material)throw lastError||Error('没有找到许可明确的合成素材，请上传素材或换关键词。');}
 const desired=config.referenceCount||5,needAuto=config.autoReferences&&manual.length<desired,legacyPlatform=config.platformReference&&manual.length===0&&!config.autoReferences;
 if(needAuto&&candidates.length<desired||legacyPlatform&&candidates.length<1){
  const provider=legacyPlatform?'xiaohongshu':config.referenceProvider||'xiaohongshu';
  if(provider==='xiaohongshu'&&typeof service.platform.open==='function')await service.platform.open();
  const result=provider==='xiaohongshu'?await service.platform.search(platformQuery):{results:await service.search(query||'portrait cinematic light')};
  const pool=(result.results||[]).slice(0,12),maxPool=legacyPlatform?1:8;let lastError=null;
  for(const item of pool){if(candidates.length>=maxPool||execution.stop)break;const url=item.url;if(candidates.some(r=>referenceKey(r.url)===referenceKey(url)))continue;
   try{
    let bytes,title,sourceUrl,license;
    if(provider==='xiaohongshu'){const capture=await service.platform.capture(url);({bytes,title}=capture);sourceUrl=capture.source;license='平台截图仅作风格参考，保留水印';}
    else{const fetched=await service.fetchAsset(item.image);bytes=await sharp(fetched.bytes,{limitInputPixels:24000000}).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).png().toBuffer();title=item.title;sourceUrl=item.url;license=item.license||'仅作参考，见来源页面';}
    const stored=await service.workflows.putAsset(id,bytes,'image/png');if(candidates.some(r=>r.assetId===stored.id))continue;
    candidates.push({assetId:stored.id,title:String(title||'自动参考').slice(0,180),url:sourceUrl,origin:provider,usage:'reference-only',pinned:false});provenance.push({title,url:sourceUrl,license,usage:'reference-only'});await progress();
   }catch(e){lastError=e;await progress();if(/登录|验证|权限|独立窗口/.test(e.message))throw e;}
  }
  if(!candidates.length)throw lastError||Error('没有取得可读取的参考图，请先完成平台登录／验证，或上传参考图片。');
 }
 const origin=w.overrides?.referenceOrigin||source.referenceOrigin;if(origin&&candidates.length&&!provenance.some(p=>p.url===origin.url))provenance.push({title:origin.title,url:origin.url,license:'仅作风格参考，保留水印',usage:'reference-only'});
 const state=await progress();state.warning=candidates.length<desired&&config.autoReferences?`实际取得${candidates.length}张参考，少于目标${desired}张；不会补入虚构图片。`:'';
 if(Array.isArray(w.overrides?.referenceSelection)){const previous=w.overrides.referenceSelection,valid=previous.filter(id=>candidates.some(r=>r.assetId===id));if(valid.length!==previous.length){await service.workflows.mutate(id,current=>{const node=current.steps.find(n=>n.id==='materials');if(node.token!==attempt.token)throw Error('参考采集已过期。');current.overrides={...current.overrides,referenceSelection:valid.length?valid:null};return {};});state.warning+=(state.warning?' ':'')+`旧选择中${previous.length-valid.length}张不在新参考池中，已保留仍可用的选择；请确认新的参考。`;}}
 return {state,artifacts:[...(material?[{id:material,type:'image',label:'实际合成素材'}]:[]),...candidates.map(r=>({id:r.assetId,type:'image',label:'参考 · '+r.title}))]};
}
