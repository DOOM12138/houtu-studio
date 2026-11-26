import {SCENE_LABELS} from '/scene-guide.js';
const confidence={high:'较高',medium:'中等',low:'不足'};
const refRoles={design:'角色造型',lighting:'场景光色',appearance:'可见外观',material:'合成素材'};
const catalogStatus={'no-match':'没有核实到对应的虚构角色条目。','not-fictional':'同名条目指向真人，已停用按姓名搜图。',ambiguous:'存在多个同名角色，保持候选状态。','unconfirmed-work':'角色与作品的关系尚未核实。',unavailable:'角色资料暂不可读取，按可见造型降级。'};
const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
function detail(title){const d=el('details');d.append(el('summary',title));return d;}
function paragraph(text){const p=el('p',text);p.className='hint';return p;}
export function sceneGuideControls({label,row,select,onChange}){
 const enabled=el('input');enabled.type='checkbox';enabled.id='agent-scene-enabled';
 const scene=select('agent-scene-type',[['auto','自动判断'],['convention','指定为场照'],['studio','指定为棚拍'],['location','指定为外景']],'auto');
 const character=el('input'),work=el('input');character.id='agent-character-hint';work.id='agent-work-hint';
 character.maxLength=work.maxLength=64;character.placeholder='例如：雷电将军';work.placeholder='例如：原神';
 const extra=detail('场景和角色校正（选填）');
 extra.append(label('拍摄场景',scene),label('虚构角色名',character),label('作品或系列',work),paragraph('留空时根据图中服装、道具和背景分析。没有充分依据时按可见造型修图。'));
 const root=el('div');root.className='agent-option-group';root.append(row('识别场景与 COS 角色',enabled),extra);
 function update(){extra.hidden=!enabled.checked;}
 enabled.onchange=()=>{update();onChange();};update();
 return {root,enabled,read:()=>enabled.checked?{sceneGuide:{scene:scene.value,character:character.value.trim(),work:work.value.trim()}}:{},
  load(value){enabled.checked=Boolean(value);scene.value=value?.scene||'auto';character.value=value?.character||'';work.value=value?.work||'';update();},
  enable(){enabled.checked=true;update();}};
}
export function showSceneAnalysis(section,step){
 const output=step.output,profile=output?.sceneProfile;
 if(profile){
  const s=profile.scene,c=profile.character;
  section.append(el('p','拍摄场景 · '+(SCENE_LABELS[s.kind]||'场景未定')+'（'+(s.origin==='user-specified'?'用户指定，视觉判断为'+SCENE_LABELS[s.detected]:'视觉把握'+confidence[s.confidence])+'）'));
  const d=detail('查看场景与造型依据');
  if(profile.note)d.append(paragraph(profile.note));
  for(const cue of s.cues)d.append(paragraph('环境 · '+cue.detail));
  for(const cue of c.cues)d.append(paragraph('造型 · '+cue.detail));
  if(profile.tones)d.append(paragraph('原图亮度抽样 · 暗部 '+profile.tones.p05+' / 中位 '+profile.tones.median+' / 亮部 '+profile.tones.p95+'（0–255）'));
  section.append(paragraph(c.name?(c.status==='user-specified'?'指定角色':'角色候选')+' · '+c.name+(c.work?' / '+c.work:'')+(c.status==='visual-candidate'?'（视觉把握'+confidence[c.confidence]+'）':''):c.status==='original'?'可能为原创造型，按实际服饰细化。':'角色名未确定，按可见服饰和道具找参考。'),d);
 }
 if(output?.catalog){
  const c=output.catalog;
  if(['matched-record','matched-name'].includes(c.status)&&/^Q[1-9]\d{0,11}$/.test(c.id)){
   const a=el('a','角色资料 · '+c.name+(c.work?' / '+c.work:''));a.href='https://www.wikidata.org/wiki/'+c.id;a.rel='noopener noreferrer';a.target='_blank';section.append(a,paragraph(c.status==='matched-name'?'找到同名虚构角色记录，作品关系未核实；只按角色名检索，仍需比对造型。':'资料核对了角色与作品的关系。当前照片的装束仍需单独比对。'));
   if(c.background?.description||c.background?.worlds?.length){const d=detail('作品背景与设定依据');if(c.background.description)d.append(paragraph(c.background.description));for(const w of c.background.worlds||[])d.append(paragraph('叙事世界 · '+w.name));section.append(d);}
  }else if(catalogStatus[c.status])section.append(paragraph(catalogStatus[c.status]));
  if(output.queries?.length){const d=detail('查看实际搜图用词');for(const q of output.queries)d.append(paragraph((refRoles[q.role]||'参考')+' · '+q.provider+' · '+q.query));section.append(d);}
 }
 if(output?.plan?.referenceReviews?.length){
  if(output.plan.sceneProfile?.character?.status==='reference-candidate'){
   const c=output.plan.sceneProfile.character;
   section.append(paragraph('参考图复核后的角色候选 · '+c.name+(c.work?' / '+c.work:'')+'。这是造型比对的推测。'));
  }
  const d=detail('参考图为什么采用或舍弃');
  for(const r of output.plan.referenceReviews){
   const used=output.plan.selectedReferences.includes(r.assetId)||output.plan.actions.some(a=>a.parameters?.materialId===r.assetId);
   d.append(paragraph((used?'采用':'未采用')+' · '+(refRoles[r.role]||'参考')+' · '+(r.title||r.assetId.slice(0,10))+' · '+(r.cues.map(c=>c.detail).join('；')||r.reason)));
  }
  section.append(d);
 }
 if(output?.sceneProtection)section.append(paragraph(output.sceneProtection));
}
