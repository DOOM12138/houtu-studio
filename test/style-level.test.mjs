import test from 'node:test';
import assert from 'node:assert/strict';
import {paintingPrompt,normalizeEditOptions} from '../lib/painting.mjs';
import {PAINT_LEVELS,normalizePaintLevel} from '../public/catalog.js';
import {templateValue,importTemplates} from '../lib/templates.mjs';

test('all eight painterly levels have distinct instructions, independent of retouch effort',()=>{
  for(const style of ['anime','cos']){
    const prompts=PAINT_LEVELS.map(({level})=>paintingPrompt({style,paintLevel:level,prompt:'保留身份。'}));
    assert.equal(new Set(prompts).size,8);
    prompts.forEach((prompt,i)=>assert.ok(prompt.includes('厚涂程度'+(i+1)+'/10')));
    for(const strength of ['light','balanced','rich']){
      const options=normalizeEditOptions({style,strength,paintLevel:4});
      assert.equal(options.paintLevel,4);
      assert.ok(paintingPrompt(options).includes('厚涂程度4/10'));
    }
  }
  for(const value of [0,11,-1,2.5,'5',null,NaN,Infinity])assert.throws(()=>normalizeEditOptions({paintLevel:value}),/1–10/);
  assert.equal(normalizePaintLevel(undefined,'light'),2);
  assert.equal(normalizePaintLevel(undefined,'balanced'),5);
  assert.equal(normalizePaintLevel(undefined,'rich'),6);
});
test('non-painting styles ignore saved painterly level and suppress painting-specific tool instructions',()=>{
  for(const style of ['natural','photo'])for(const operation of ['full-body','eyes','hair','makeup','anime-paint','cos-paint','portrait-polish']){
    const options={style,operation,prompt:'保留人物身份与构图。'};
    const low=paintingPrompt({...options,paintLevel:1}),high=paintingPrompt({...options,paintLevel:10});
    assert.equal(low,high);
    assert.match(low,/非厚涂/);
    assert.doesNotMatch(low,/厚涂程度\d+\/10|将画面统一为干净自然的二次元数字厚涂|将厚涂细节融入原照片/);
  }
  const custom=paintingPrompt({promptMode:'custom',prompt:'只清理衣服上的灰尘。',paintLevel:10});
  assert.doesNotMatch(custom,/厚涂程度|当前功能|精修力度/);
});
test('template export and legacy import retain valid style levels without private input data',()=>{
  const current=templateValue({name:'9级COS',text:'保留衣服。',options:{style:'cos',strength:'light',paintLevel:9,image:'private'}});
  assert.equal(current.options.paintLevel,8);
  assert.equal(current.options.image,undefined);
  const imported=importTemplates({schemaVersion:1,templates:[current]});
  assert.equal(imported[0].options.paintLevel,8);
  const old=templateValue({name:'旧模板',text:'整理细节。',options:{style:'natural',strength:'rich'}});
  assert.equal(old.options.paintLevel,6);
  assert.equal(old.options.style,'natural');
});

test('out-of-range historic inputs normalize to the new maximum and retain clean edges',()=>{for(const style of ['cos','anime']){const top=paintingPrompt({style,paintLevel:8});assert.equal(paintingPrompt({style,paintLevel:10}),top);assert.match(top,/厚涂程度8\/10/);assert.match(top,/禁止涂鸦、乱线、粗糙刷痕/);assert.match(top,/看不清的虹膜、睫毛、纹样与饰品保留/);}});
