import curriculum from '../lib/scene-curriculum.json' with {type:'json'};
import {SCENE_GUIDE_VERSION} from '../public/scene-guide.js';
export function lessonCards(profile,config,phase='plan'){
 if(!config.sceneGuide)return [];
 if(config.sceneGuide.version!==curriculum.version||curriculum.version!==SCENE_GUIDE_VERSION)throw Error('已保存的场景方法版本不可用，请保留旧结果并新建流程。');
 const topics=new Set();
 const scene=profile?.scene?.kind;if(['studio','convention','location'].includes(scene))topics.add(scene);
 const all=phase==='plan'||phase==='check';
 if((all||phase==='color')&&config.tasks.includes('color'))topics.add('color');
 if((all||phase==='person')&&config.tasks.some(t=>t==='portrait'||t==='outfit'))topics.add('portrait');
 if((all||phase==='person')&&config.tasks.includes('paint'))topics.add('paint');
 if((all||phase==='effects')&&config.tasks.includes('effects'))topics.add('effects');
 const cards=[];
 for(const [topic,label]of Object.entries(curriculum.topics)){
  if(!topics.has(topic))continue;
  for(const video of curriculum.videos){
   const study=video.studies[topic];if(!study)continue;
   cards.push({id:video.id+'/'+topic,topic,label,title:video.title,url:video.url,author:video.author,rule:study.rule,evidenceType:study.type,times:study.samples.map(p=>p.seconds)});
  }
 }
 return cards;
}
export function lessonText(cards){return cards.map(card=>'['+card.label+'] '+card.rule).join('\n');}
export function usedTutorials(plan) {
 return (plan?.sceneLessons||[]).map(c=>({id:c.id,title:c.title,url:c.url,
   evidence:c.label+' · '+(c.evidenceType==='captions'?'带时码字幕':'抽样画面')+' · '+c.times.map(t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')).join('、')+' · '+c.rule}));
}
