import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../public/catalog.js';
import {paintingPrompt} from '../lib/painting.mjs';
import {agentOptions,AGENT_VERSION,AGENT_PROMPT_REVISION} from '../public/retouch-agent-options.js';
import {compileAgentPrompt,inspectionPrompt} from '../backend/agent-planning.mjs';

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
 assert.doesNotMatch(inspectionPrompt(old),/看不清时说明不确定/);
 const clothes=compileAgentPrompt(agentOptions({tasks:['outfit']}),{id:'person',prompt:'只整理裙摆右侧乱褶。'},[]);
 assert.match(clothes,/保留结构褶、纹样、接缝和覆盖范围/);
 assert.doesNotMatch(clothes,/人物细化只处理/);
 const paint=compileAgentPrompt(agentOptions({tasks:['paint'],paintLevel:6}),{id:'person',prompt:'处理面部妆感。'},[]);
 assert.match(paint,/厚涂程度6\/10/);
 const cleanup=compileAgentPrompt(fresh,{id:'clean',prompt:'清理左侧画面边缘的灯架。'},[]);
 assert.match(cleanup,/原场地与发丝边缘/);
 assert.doesNotMatch(cleanup,/厚涂|原眼妆/);
});
