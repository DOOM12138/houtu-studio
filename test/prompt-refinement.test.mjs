import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../public/catalog.js';
import {paintingPrompt} from '../lib/painting.mjs';
import {agentOptions,AGENT_VERSION,AGENT_LONG_SHOT_REVISION,AGENT_TEXTURE_REVISION,AGENT_HIGH_PAINT_REVISION,AGENT_PROMPT_REVISION} from '../public/retouch-agent-options.js';
import {compileAgentPrompt,inspectionPrompt,planPrompt,checkPrompt,validateAgentCheck} from '../backend/agent-planning.mjs';

test('all default edit prompts preserve a concrete task and guided output',()=>{
 for(const tool of PRESETS){
  const prompt=paintingPrompt({operation:tool.id,style:'natural'});
  assert.match(prompt,/返回真实图片/,tool.id);
  assert.match(prompt,/必须保留/,tool.id);
  assert.ok(prompt.length<6000,tool.id);
 }
 const crop=paintingPrompt({operation:'skin',selection:{x:.1,y:.1,width:.4,height:.4}});
 assert.match(crop,/图2只供核对.*回贴无亮边、暗边和色差/);
});

test('new Agent prompts are scoped to the node and legacy recipes retain their instructions',()=>{
 const old=agentOptions({version:AGENT_VERSION,tasks:['portrait','clean']});
 const fresh=agentOptions({tasks:['portrait','clean']});
 const action={id:'person',prompt:'整理右眼外侧晕出的妆，保留原眼妆设计。'};
 const previous=compileAgentPrompt(old,action,[]);
 const current=compileAgentPrompt(fresh,action,[]);
 assert.equal(fresh.promptRevision,AGENT_PROMPT_REVISION);
 assert.equal(agentOptions(fresh).promptRevision,AGENT_PROMPT_REVISION);
 assert.equal(old.promptRevision,undefined);
 assert.ok(current.length<previous.length*.8);
 assert.doesNotMatch(current,/移除|衣料仅整理|3D质感/);
 assert.match(current,/保留原妆/);
 assert.match(inspectionPrompt(fresh),/看不清时说明不确定/);
 assert.match(current,/全身远景按原片可见细节/);
 const previousRevision=agentOptions({...fresh,promptRevision:'agent-prompts-2026-11-27-r2'});
 assert.equal(previousRevision.promptRevision,'agent-prompts-2026-11-27-r2');
 assert.doesNotMatch(compileAgentPrompt(previousRevision,action,[]),/全身远景按原片可见细节/);
 assert.doesNotMatch(inspectionPrompt(old),/看不清时说明不确定/);
 const clothes=compileAgentPrompt(agentOptions({tasks:['outfit']}),{id:'person',prompt:'只整理裙摆右侧乱褶。'},[]);
 assert.match(clothes,/保留结构褶、纹样、接缝和覆盖范围/);
 assert.doesNotMatch(clothes,/人物细化只处理/);
 const paint=compileAgentPrompt(agentOptions({tasks:['paint'],paintLevel:6}),{id:'person',prompt:'处理面部妆感。'},[]);
 assert.match(paint,/厚涂程度6\/10/);
 const oldHigh=agentOptions({version:AGENT_VERSION,tasks:['paint'],paintLevel:10});
 assert.equal(oldHigh.paintLevel,6);
 const resumed=compileAgentPrompt({...oldHigh,paintLevel:10},{id:'person',prompt:'加强眼妆和脸部体积。'},[]);
 assert.match(resumed,/程度6\/10/);
 assert.match(resumed,/禁止涂鸦、乱线、粗糙刷痕/);
 const cleanup=compileAgentPrompt(fresh,{id:'clean',prompt:'清理左侧画面边缘的灯架。'},[]);
 assert.match(cleanup,/原场地与发丝边缘/);
 assert.doesNotMatch(cleanup,/厚涂|原眼妆/);
});

test('4/10 protects photographic texture throughout planning, rendering and review',()=>{
 const config=agentOptions({tasks:['portrait','paint','color'],style:'anime',paintLevel:4});
 const action={id:'person',prompt:'顺原光向强化主发束和衣料暗面。'};
 const old=agentOptions({...config,promptRevision:AGENT_LONG_SHOT_REVISION});
 for(const style of ['anime','cos']){
  const guided=paintingPrompt({operation:style==='anime'?'anime-paint':'cos-paint',style,paintLevel:4});
  assert.match(guided,/保留摄影媒介.*保留原眼型、视线、唇线.*不放大虹膜/);
  assert.match(compileAgentPrompt({...config,style},action,[]),/保留可见皮肤与粉底纹理.*若图1本身是插画/);
 }
 assert.match(planPrompt(config,{summary:'真人场照',observations:[],queries:[]},[]),/不能安排统一磨皮或重画妆面/);
 assert.doesNotMatch(compileAgentPrompt(old,action,[]),/保留摄影媒介/);
 assert.match(compileAgentPrompt(old,action,[]),/全身远景按原片可见细节/);
 const r4=agentOptions({...config,promptRevision:AGENT_TEXTURE_REVISION});
 assert.match(compileAgentPrompt(config,action,[]),/鼻面与面颊杂反光.*突出眼神/);
 assert.doesNotMatch(compileAgentPrompt(r4,action,[]),/鼻面与面颊杂反光/);
 assert.match(checkPrompt(r4),/texture为必检项/);
 assert.match(checkPrompt(config),/脸部只有整体提亮、纹理变柔且没有局部体积变化/);
 assert.doesNotMatch(checkPrompt(old),/texture/);
 assert.doesNotMatch(checkPrompt({...config,paintLevel:6}),/texture/);
 assert.doesNotMatch(paintingPrompt({operation:'lighting',style:'natural',paintLevel:4}),/保留摄影媒介/);
 assert.doesNotMatch(paintingPrompt({operation:'anime-paint',style:'anime',paintLevel:4,promptMode:'custom',prompt:'我的完整指令'}),/保留摄影媒介/);
 assert.match(checkPrompt(config),/重画五官、蜡面磨皮、塑料发束.*texture必须为false/);
 const keys=['scope','identity','lighting','seams','color'];
 const oldReply={pass:true,severity:'minor',summary:'检查',checks:keys.map(key=>({key,pass:true,note:'实际观察'})),repairable:true,repairStage:'person'};
 assert.equal(validateAgentCheck(oldReply,old).pass,true);
 assert.throws(()=>validateAgentCheck(oldReply,config),/完整依据/);
 assert.throws(()=>validateAgentCheck({...oldReply,checks:[...oldReply.checks,{key:'texture',pass:true,note:' '}]},config),/可见依据/);
 const failed=validateAgentCheck({...oldReply,checks:[...oldReply.checks,{key:'texture',pass:false,note:'眼线和唇缘被重新描画'}]},config);
 assert.equal(failed.pass,false);
 assert.equal(failed.repairable,false);
 assert.equal(validateAgentCheck({...oldReply,checks:[...oldReply.checks,{key:'texture',pass:true,note:'可见发丝与眼型保留'}]},config).pass,true);
});

test('new 8/10 has a distinct reference-calibrated scope and requires texture review',()=>{
 const c=agentOptions({tasks:['paint'],style:'anime',paintLevel:8});
 assert.equal(c.paintLevel,8);
 assert.match(compileAgentPrompt(c,{id:'person',prompt:'顺原片光线整理面部。'},[]),/8\/10 强厚涂.*颊下柔影/);
 assert.match(checkPrompt(c),/8\/10的scope须有明显而连续的颊鼻塑形/);
 assert.match(checkPrompt(c),/texture为必检项/);
 assert.match(paintingPrompt({operation:'anime-paint',style:'anime',paintLevel:8}),/厚涂程度8\/10/);
 assert.match(paintingPrompt({operation:'cos-paint',style:'cos',paintLevel:8}),/眼下、受光上颊和额鼻中间调.*下颌角或下巴折点/);
 assert.match(compileAgentPrompt(c,{id:'person',prompt:'保持原妆。'},[]),/颊侧、下颌角或下巴折点.*遮挡、远景看不清/);
 assert.match(checkPrompt(c),/整脸发闷.*旧轮廓双边/);
 const old=agentOptions({...c,promptRevision:AGENT_HIGH_PAINT_REVISION});
 assert.equal(old.paintLevel,8);
 assert.doesNotMatch(checkPrompt(old),/旧轮廓双边/);
 assert.doesNotMatch(paintingPrompt({operation:'anime-paint',style:'anime',paintLevel:4}),/下颌角或下巴折点/);
});
