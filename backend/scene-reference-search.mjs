import sharp from 'sharp';
import {licensedMaterial} from './agent-planning.mjs';
import {sceneQueries,catalogBoundProfile} from './scene-direction.mjs';

export async function sceneReferenceStep(service,w,node,token,run,inputAsset,profile){
 const config=w.config,previous=node.output||{},limit=config.referenceCount;
 const initial=w.manualReferences||w.steps[0].output.references||[];
 const references=[...initial,...(previous.references||[])].filter((r,i,a)=>a.findIndex(v=>v.assetId===r.assetId)===i).slice(0,5);
 const warnings=[...new Set(previous.warnings||[])],queries=[...(previous.queries||[])];
 let catalog=previous.catalog||{status:'not-requested'};
 const state=()=>({imageAsset:inputAsset,references,warnings,queries,catalog});
 const save=async()=>{service.guard(run);await service.partial(w.id,node.id,token,state());};
 const warn=message=>{if(!warnings.includes(message)&&warnings.length<20)warnings.push(message);};
 await save();
 if(config.autoSearch){
  if(['not-requested','unavailable'].includes(catalog.status)&&profile.character.canSearchName){
   catalog=await service.characterLookup(profile.character);await save();
  }
  const searchable=catalogBoundProfile(profile,catalog);
  const specs=sceneQueries(searchable,config,catalog);
  const deadline=Date.now()+45000;let downloads=0;
  for(const q of specs){
   service.guard(run);
   const needsMaterial=config.tasks.some(s=>s==='small'||s==='large')&&!references.some(licensedMaterial);
   const maxTotal=needsMaterial&&q.guideRole!=='material'&&q.guideRole!=='appearance'?Math.max(0,limit-1):limit;
   const full=()=>references.length>=maxTotal||references.filter(r=>r.guideRole===q.guideRole).length>=q.cap;
   if(full())continue;
   const providers=config.referenceProvider==='xiaohongshu'&&q.purpose==='style'?['xiaohongshu',...(config.allowPublicFallback?['commons']:[])]:['commons'];
   for(const provider of providers){
    service.guard(run);if(full())break;
    const query=provider==='commons'?q.publicQuery:q.query;
    if(queries.some(entry=>entry.provider===provider&&entry.query===query&&entry.role===q.guideRole&&entry.complete))continue;
    if(Date.now()>=deadline||downloads>=12){warn('本次参考检索已到时限或读取上限，保留已取得的图片。');break;}
    const entry={query,purpose:q.purpose,role:q.guideRole,provider,complete:false,status:'searching'};queries.push(entry);await save();
    let pool;
    try{
     if(provider==='xiaohongshu'){await service.platform.open();pool=(await service.platform.search(query))?.results||[];}
     else pool=await service.searchGuide(query);
    }catch{
     entry.status='failed';
     warn(provider==='xiaohongshu'?'小红书搜索当前不可用，检查本应用登录状态。':'公开图库搜索暂不可用。');
     if(provider==='xiaohongshu'&&!config.allowPublicFallback){await save();throw Object.assign(Error('请完成平台登录后继续，或启用公开图库备用。'),{code:'INPUT_REQUIRED'});}
     await save();continue;
    }
    let attemptedFiles=0,readFailures=0;
    for(const item of pool.slice(0,8)){
     service.guard(run);if(full()||Date.now()>=deadline||downloads>=12)break;if(!item.url||references.some(r=>r.url===item.url))continue;
     downloads++;attemptedFiles++;
     try{
      const result=provider==='commons'?await service.fetchGuideAsset(item.image):await service.platform.capture(item.url);
      const license=provider==='commons'?String(item.license||'见来源许可').slice(0,180):'平台例图，仅作参考，保留水印';
      const usage=q.purpose==='material'&&licensedMaterial({usage:'material',license})?'material':'reference-only';
      if(q.purpose==='material'&&usage!=='material')continue;
      let image=sharp(result.bytes,{limitInputPixels:24000000,failOn:'error'}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true});
      const bytes=usage==='material'?await image.png().toBuffer():await image.flatten({background:'white'}).jpeg({quality:88}).toBuffer();
      const asset=await service.workflows.putAsset(w.id,bytes,usage==='material'?'image/png':'image/jpeg');
      if(references.some(r=>r.assetId===asset.id))continue;
      references.push({assetId:asset.id,title:String(result.title||item.title||'公开参考').slice(0,180),url:item.url,license,creator:String(item.creator||'').slice(0,180),usage,origin:provider,guideRole:q.guideRole,query});
     }catch{readFailures++;warn('部分候选图片不可读取或格式不支持。');}
     await save();
    }
    entry.complete=readFailures===0&&(Date.now()<deadline&&downloads<12||full());
    entry.status=readFailures?'partial':!pool.length?'empty':attemptedFiles?'review-pool':'no-new-images';await save();
   }
  }
  if(references.length<limit)warn('实际取得 '+references.length+' 张候选／目标 '+limit+' 张。按实际可用素材继续。');
 }
 if(config.materialFallback==='pause'&&config.tasks.some(t=>t==='small'||t==='large')&&!references.some(licensedMaterial))
  throw Object.assign(Error('尚未取得可直接合成的授权素材，请补充后继续。'),{code:'INPUT_REQUIRED'});
 return {...state(),materialMode:references.some(licensedMaterial)?'licensed-material':'original-generation-if-needed'};
}
