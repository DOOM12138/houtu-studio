import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import curriculum from '../lib/scene-curriculum.json' with {type:'json'};
import {agentOptions,agentActions} from '../public/retouch-agent-options.js';
import {SCENE_RETOUCH_TASKS,sceneGuideOptions} from '../public/scene-guide.js';
import {resolveSceneProfile,catalogBoundProfile,sceneQueries,reviewSceneReferences,referencesForAction,roleFromReviewedImage} from '../backend/scene-direction.mjs';
import {lookupFictionalCharacter} from '../backend/character-catalog.mjs';
import {checkWikimediaURL,windowsHttpsProxy} from '../backend/scene-wikimedia.mjs';
import {sceneReferenceStep} from '../backend/scene-reference-search.mjs';
import {frameTones,guardedColor,finalSceneGrade} from '../backend/scene-tones.mjs';
import {lessonCards} from '../backend/scene-methods.mjs';
import {compileAgentPrompt,planPrompt,validateAgentPlan} from '../backend/agent-planning.mjs';

const config=agentOptions({tasks:SCENE_RETOUCH_TASKS,sceneGuide:{}});
const observations=(...kinds)=>kinds.map(kind=>({kind,detail:'可见的独立测试线索 '+kind}));
const raw={scene:{kind:'convention',confidence:'high',cues:observations('event-sign','venue')},character:{kind:'fictional',name:'雷电将军',work:'原神',confidence:'medium',cues:observations('emblem','prop','wig')},appearanceTags:['purple-hair','sword'],lighting:'side'};
const profile=()=>resolveSceneProfile(raw,config.sceneGuide,true);
const pair=(kind,agreement='match')=>({kind,source:'原片可见'+kind,reference:'对照图可见'+kind,agreement});
test('scene preset keeps the legacy schema and graph opt-in, corrections are bounded',()=>{
 assert.ok(!('sceneGuide' in agentOptions({tasks:['color']})));
 assert.deepEqual(agentActions(config),['person','color']);
 assert.deepEqual(agentActions(agentOptions({tasks:[],sceneGuide:{}})),[]);
 assert.throws(()=>sceneGuideOptions({version:'future'}));assert.throws(()=>sceneGuideOptions({character:'https://bad.example'}));
});
test('different scene anchors, competing late cues and uncertain costume evidence affect routing',()=>{
 for(const [kind,types]of [['convention',['booths','crowd']],['studio',['backdrop','controlled-light']],['location',['street','daylight','lighting-rig']]]){
  assert.equal(resolveSceneProfile({...raw,scene:{kind,confidence:'high',cues:observations(...types)}},config.sceneGuide,true).scene.kind,kind);
 }
 for(const [kind,types]of [['convention',['crowd','shadow']],['studio',['backdrop','studio-set','lighting-rig','controlled-light','shadow','event-sign']],['studio',['studio-set','controlled-light','landscape','daylight']],['location',['sky','street','studio-set']]]){
  assert.equal(resolveSceneProfile({...raw,scene:{kind,confidence:'high',cues:observations(...types)}},config.sceneGuide,true).scene.kind,'unknown');
 }
 const ambiguous=resolveSceneProfile({...raw,character:{...raw.character,cues:observations('wig','wig')}},config.sceneGuide,true);
 assert.equal(ambiguous.character.name,'');assert.equal(ambiguous.character.canSearchName,false);
 assert.equal(resolveSceneProfile(raw,config.sceneGuide,false).character.name,'');
 const corrected=resolveSceneProfile(raw,sceneGuideOptions({scene:'studio',character:'原创角色',work:'自设作品'}),true);
 assert.deepEqual([corrected.scene.kind,corrected.scene.detected,corrected.scene.origin],['studio','convention','user-specified']);
 assert.equal(corrected.character.status,'user-specified');
});
test('only a matching fictional catalogue record and work enable named public image queries',async()=>{
 const claim=id=>({mainsnak:{datavalue:{value:{id}}}}),entity=(id,name,kind,work)=>({id,labels:{en:{value:name}},claims:{P31:[claim(kind)],P1441:work?[claim(work)]:[]}});
 const char=entity('Q11','Example','Q1569167','Q40'),person=entity('Q12','Example','Q5'),same=entity('Q14','Example','Q95074','Q41');
 const datasets={'Q11':char,'Q12':person,'Q14':same,'Q40':entity('Q40','Source Work','Q0'),'Q41':entity('Q41','Other Work','Q0')};
 const read=async params=>params.action==='wbsearchentities'?{search:[{id:'Q12'},{id:'Q14'},{id:'Q11'}]}:{entities:Object.fromEntries(params.ids.split('|').map(k=>[k,datasets[k]]))};
 const candidate={name:'Example',work:'Source Work',canSearchName:true};
 const match=await lookupFictionalCharacter(candidate,{read});assert.equal(match.id,'Q11');assert.equal(match.status,'matched-record');
 const ambiguous=await lookupFictionalCharacter({...candidate,work:'Unknown Media'},{read});assert.equal(ambiguous.status,'ambiguous');
 const one=await lookupFictionalCharacter({...candidate,work:'Unverified subtitle'},{read:params=>params.action==='wbsearchentities'?{search:[{id:'Q11'}]}:read(params)});
 assert.equal(one.status,'matched-name');assert.equal(one.work,undefined);assert.equal(catalogBoundProfile(profile(),one).character.work,'');
 const rejected=await lookupFictionalCharacter(candidate,{read:async p=>p.action==='wbsearchentities'?{search:[{id:'Q12'}]}:{entities:{Q12:person}}});assert.equal(rejected.status,'not-fictional');
 const declined=await lookupFictionalCharacter({...candidate,canSearchName:false},{read:()=>assert.fail('lookup should not run')});assert.equal(declined.status,'not-requested');
 for(const status of ['unavailable','not-requested','no-match','ambiguous','not-fictional','unconfirmed-work']){
  const p=catalogBoundProfile(profile(),{status}),qs=sceneQueries(p,config,{status});assert.equal(p.character.name,'');assert.ok(qs.every(q=>q.guideRole!=='design'&&!q.query.includes('雷电将军')));
 }
 const qs=sceneQueries(catalogBoundProfile(profile(),match),config,match);assert.ok(qs[0].publicQuery.includes('Example'));assert.ok(qs.some(q=>q.guideRole==='lighting'));
});
test('visual agreement is task-specific and a matching title or contradictory cues cannot admit a design reference',()=>{
 const refs=[{assetId:'a',guideRole:'design'},{assetId:'b',guideRole:'lighting'},{assetId:'c',guideRole:'material',usage:'material'}];
 const p=profile(),base={selectedReferences:['a','b','c'],actions:[{id:'small',parameters:{materialId:'c'}}]},reviews=[
 {assetId:'a',role:'design',decision:'use',cues:[pair('emblem'),pair('wig'),pair('prop','different')]},
 {assetId:'b',role:'lighting',decision:'use',cues:[pair('lighting')]},
 {assetId:'c',role:'material',decision:'use',cues:[pair('texture')]}];
 let out=reviewSceneReferences(base,reviews,refs,p);assert.deepEqual(out.selectedReferences,['b','c']);assert.equal(out.referenceSupport,'not-established');
 assert.deepEqual(referencesForAction({id:'person',parameters:{}},out,refs).map(r=>r.assetId),['b']);
 assert.deepEqual(referencesForAction(base.actions[0],out,refs).map(r=>r.assetId),['b','c']);
 reviews[0].cues=[pair('emblem'),pair('prop')];out=reviewSceneReferences(base,reviews,refs,p);assert.equal(out.referenceSupport,'visual-agreement');assert.ok(referencesForAction({id:'person'},out,refs).some(r=>r.assetId==='a'));
 assert.ok(roleFromReviewedImage({name:'角色',work:'作品',confidence:'high',referenceAssetId:'a'},out));assert.equal(roleFromReviewedImage({name:'角色',work:'作品',confidence:'high',referenceAssetId:'b'},out),null);
 assert.deepEqual(reviewSceneReferences(base,[],refs,p).selectedReferences,[]);
});
test('seven video topics each contain five distinct verified timelines; prompts retrieve only the relevant methods',()=>{
 const tally=Object.fromEntries(Object.keys(curriculum.topics).map(t=>[t,new Set()]));
 for(const v of curriculum.videos){for(const [t,s]of Object.entries(v.studies)){tally[t].add(v.url);assert.ok(s.samples.length>=2);assert.ok(s.samples.every(k=>k.seconds>=0&&k.seconds<=v.durationSeconds));}}
 assert.equal(Object.keys(tally).length,7);for(const set of Object.values(tally))assert.ok(set.size>=5);
 const p=profile(),observation={sceneProfile:p,summary:'测试',subjectPresent:true,observations:[],queries:[]},model={summary:'保留原片',actions:[{id:'color',parameters:{settings:{temperature:30}}},{id:'person',prompt:'保留眼妆'}]};
 const plan=validateAgentPlan(model,config,[],observation);
 assert.deepEqual(new Set(plan.sceneLessons.map(c=>c.topic)),new Set(['convention','portrait','color']));assert.ok(!planPrompt(config,observation,[]).includes('[可选特效]'));
 const prompt=compileAgentPrompt(config,plan.actions[0],[],{scenePlan:plan});assert.ok(prompt.includes('眼妆'));assert.ok(prompt.length<=6000);
 for(const topic of ['paint','effects'])assert.ok(lessonCards(p,agentOptions({sceneGuide:{},tasks:[topic],...(topic==='paint'?{style:'cos'}:{})})).some(c=>c.topic===topic));
});
test('source-based colour limits run on actual final basic sliders after a look is selected',async()=>{
 const pixels=await sharp({create:{width:100,height:80,channels:4,background:'#ffffff'}}).png().toBuffer(),p=profile();p.tones=await frameTones(pixels);assert.equal(p.tones.p95,255);
 const result=guardedColor({exposure:.7,temperature:80,highlights:30,hsl:[[30,30,30]]},p);
 assert.equal(result.settings.exposure,.12);assert.equal(result.settings.temperature,12);assert.equal(result.settings.highlights,0);assert.deepEqual(result.settings.hsl[0],[0,0,0]);
 const merged=finalSceneGrade(result.settings,p)({...result.settings,exposure:.4,whites:10},{});assert.equal(merged.exposure,.12);assert.equal(merged.whites,0);
});
test('public reference transport only accepts prescribed Wikimedia endpoints and uses the configured Windows HTTPS proxy',()=>{
 assert.ok(checkWikimediaURL('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/720px-F.jpg','image'));assert.throws(()=>checkWikimediaURL('https://commons.wikimedia.org/wiki/File:Title','api'));assert.throws(()=>checkWikimediaURL('https://other.invalid/wikipedia/commons/image.jpg','image'));assert.throws(()=>checkWikimediaURL('https://name:pw@www.wikidata.org/w/api.php','api'));
 assert.equal(windowsHttpsProxy('http=x.test:1;https=127.0.0.1:7777'),'http://127.0.0.1:7777/');
});
test('recovering a reference checkpoint retries failed public reads without duplicating successful reads or assets',async()=>{
 const source={references:[]},p=profile(),w={id:'fixture',config:{...config,referenceCount:2},steps:[{output:source}]},node={id:'references',output:null};let fail=true,saves=0,lookups=0,requests=[];
 const bytes=await sharp({create:{width:32,height:24,channels:3,background:'#6688aa'}}).png().toBuffer();
 const service={guard(){},async partial(id,step,token,out){saves++;node.output=structuredClone(out);},async characterLookup(){lookups++;return {status:fail?'unavailable':'matched-record',enName:'Raiden Shogun',enWork:'Genshin Impact'};},async searchGuide(q){requests.push(q);if(fail&&q.includes('mixed'))throw Error('offline');return q.includes('Raiden')?[{url:'https://commons.wikimedia.org/wiki/File:Design',title:'Design',image:'fixture',license:'CC0'}]:[];},async fetchGuideAsset(){return {bytes};},workflows:{async putAsset(){return {id:'saved-image'};}}};
 const first=await sceneReferenceStep(service,w,node,'token',{},'input',p);assert.equal(first.references.length,0);assert.ok(first.queries.some(q=>q.status==='failed'&&!q.complete));assert.ok(requests.every(q=>!q.includes('雷电')&&!q.includes('Raiden')));
 fail=false;const second=await sceneReferenceStep(service,w,node,'token2',{},'input',p);assert.equal(lookups,2);assert.equal(second.references.length,1);assert.equal(second.references[0].guideRole,'design');assert.equal(requests.filter(q=>q==='cosplay convention').length,1);assert.ok(saves>1);
 w.config={...config,autoSearch:false};node.output=null;service.searchGuide=()=>assert.fail('external search');service.characterLookup=()=>assert.fail('external catalogue');const off=await sceneReferenceStep(service,w,node,'off',{},'input',p);assert.equal(off.queries.length,0);
});
