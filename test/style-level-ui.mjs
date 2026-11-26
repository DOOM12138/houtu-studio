// Isolated browser test: validates settings and request propagation, not real AI image quality.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../server.mjs';
import {browserExecutable} from '../backend/platform-browser.mjs';
const directory=await mkdtemp(path.join(tmpdir(),'houtu-style-ui-'));
const picture=await sharp({create:{width:240,height:320,channels:3,background:'#c1b29e'}}).png().toBuffer();
class Bridge extends EventEmitter {
  async account(){return {email:'fixture@example.invalid',plan:'test'};}
  async stop(){}
  async begin(job,prompt){this.prompt=prompt;job.threadId='style-ui';job.turnId='turn';setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:picture.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},25);}
}
const bridge=new Bridge(),app=await createApp({directory,bridge,platform:{async close(){}}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const out=path.resolve('.impeccable/review/style-levels');await mkdir(out,{recursive:true});
async function level(value){await page.locator('#paint-level').evaluate((input,n)=>{input.value=n;input.dispatchEvent(new Event('input',{bubbles:true}));},String(value));await page.waitForFunction(n=>document.querySelector('#compiled-prompt').textContent.includes('厚涂程度'+n+'/10'),value);assert.equal(await page.locator('#paint-value').textContent(),value+' / 10');}
try{
  await page.goto(origin+'/ai/?tool=full-body');await page.locator('#target-auto').uncheck(); // Uniform fixture is not a detectable person; scope mechanics are tested separately.
await page.waitForFunction(()=>document.querySelector('#prompt').value.length>0);
  assert.equal(await page.locator('#edit-style option').count(),4);
  assert.equal(await page.locator('#edit-style').inputValue(),'anime');
  await page.locator('#prompt-preview').evaluate(e=>{e.open=true;});
  for(let n=1;n<=10;n++)await level(n);
  await page.locator('#paint-level').focus();await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('#paint-value').textContent==='1 / 10');
  await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('#paint-value').textContent==='10 / 10');
  await level(8);await page.locator('[name="strength"][value="rich"]').check();
  assert.equal(await page.locator('#paint-level').inputValue(),'8');
  await page.waitForFunction(()=>document.querySelector('#compiled-prompt').textContent.includes('精修力度：细致'));
  for(const style of ['natural','photo']){
    await page.locator('#edit-style').selectOption(style);
    await page.waitForFunction(()=>document.querySelector('#compiled-prompt').textContent.includes('已关闭厚涂表现'));
    assert.equal(await page.locator('#paint-field').isVisible(),false);
    assert.equal(await page.locator('#nonpaint-help').isVisible(),true);
    assert.doesNotMatch(await page.locator('#compiled-prompt').textContent(),/厚涂程度\d+\/10/);
  }
  await page.locator('#tools-panel').evaluate(e=>{e.open=true;});
  await page.locator('[data-operation="anime-paint"]').click();
  await page.locator('#edit-style').selectOption('photo');
  await page.waitForFunction(()=>document.querySelector('#compiled-prompt').textContent.includes('非厚涂摄影精修'));
  assert.doesNotMatch(await page.locator('#compiled-prompt').textContent(),/将画面统一为干净自然的二次元数字厚涂/);
  await page.locator('[data-operation="full-body"]').click();
  await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.locator('#prompt-mode').selectOption('custom');
  assert.equal(await page.locator('#paint-field').isVisible(),false);assert.equal(await page.locator('#edit-style').isDisabled(),true);
  await page.locator('#prompt').fill('只整理原有饰品。');
  await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.locator('#prompt-mode').selectOption('guided');await page.locator('#edit-style').selectOption('cos');await level(9);
  await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.locator('#template-name').fill('UI厚涂9级');await page.locator('#save-template').click();
  await page.waitForFunction(()=>document.querySelector('#template-feedback').textContent.includes('已保存为新模板'));
  const saved=await(await fetch(origin+'/api/templates')).json();assert.equal(saved.templates.find(t=>t.name==='UI厚涂9级').options.paintLevel,9);
  await level(1);await page.locator('#edit-style').selectOption('photo');await page.locator('#apply-template').click();
  assert.equal(await page.locator('#edit-style').inputValue(),'cos');assert.equal(await page.locator('#paint-level').inputValue(),'9');
  await page.locator('#file').setInputFiles({name:'style-test.png',mimeType:'image/png',buffer:picture});
  const request=page.waitForResponse(r=>r.url().endsWith('/api/jobs')&&r.request().method()==='POST');
  await page.locator('#generate').click();const response=await request;assert.equal(response.status(),202);const job=await response.json();assert.equal(job.paintLevel,9);
  await page.waitForSelector('#reuse-result:not([hidden])');assert.match(bridge.prompt,/厚涂程度9\/10/);
  await page.goto(origin+'/?job='+job.id);await page.waitForFunction(()=>document.querySelector('#paint-level').value==='9');
  assert.equal(await page.locator('#edit-style').inputValue(),'cos');
  // Hidden preset inputs must not follow a complete custom request.
  await page.locator('#task-references').setInputFiles({name:'visible-guide.png',mimeType:'image/png',buffer:picture});
  await page.waitForFunction(()=>document.querySelector('#task-reference-list').textContent.includes('visible-guide'));
  await page.locator('#target-editor').evaluate(e=>e.open=true);
  const mask=await sharp({create:{width:240,height:320,channels:3,background:'white'}}).png().toBuffer();
  await page.locator('#target-mask-file').setInputFiles({name:'manual.png',mimeType:'image/png',buffer:mask});
  await page.locator('#target-mask-canvas').waitFor({state:'visible'});
  await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.locator('#prompt-mode').selectOption('custom');await page.locator('#prompt').fill('Only clean the original clothing edge.');
  assert.equal(await page.locator('#task-panel').isVisible(),false);assert.equal(await page.locator('#target-panel').isVisible(),false);
  const customRequest=page.waitForRequest(r=>r.url().endsWith('/api/jobs')&&r.method()==='POST');await page.locator('#generate').click();
  const sent=(await customRequest).postDataJSON();assert.deepEqual(sent.references,[]);assert.equal('targetMask' in sent,false);
  await page.waitForSelector('#reuse-result:not([hidden])');assert.doesNotMatch(bridge.prompt,/效果参考只约束|当前为非厚涂任务|厚涂表现执行/);
  await page.goto(origin+'/?job='+job.id);await page.waitForFunction(()=>document.querySelector('#paint-level').value==='9');
  for(const [width,theme] of [[1440,'light'],[390,'light'],[320,'dark']]){
    await page.setViewportSize({width,height:1000});await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('.settings').screenshot({path:path.join(out,width+'-'+theme+'.png')});
  }
  await page.locator('#edit-style').selectOption('photo');
  await page.locator('.settings').screenshot({path:path.join(out,'320-nonpainting.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS style UI: all 10 levels, keyboard control, non-painting override, independent retouch effort, custom mode, template roundtrip, job restore, 320px/dark mode');
}finally{await browser.close();await app.close();await rm(directory,{recursive:true,force:true});}
