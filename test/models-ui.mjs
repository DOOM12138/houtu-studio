// Uses isolated synthetic images and models; no user account or real model turns.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../server.mjs';
import {browserExecutable} from '../backend/platform-browser.mjs';
const A='test-vision-a',B='test-vision-b',catalog=[{id:A,name:'Test Vision A',isDefault:true},{id:B,name:'Test Vision B'}];
const picture=await sharp({create:{width:240,height:320,channels:3,background:'#b9a890'}}).png().toBuffer();
class Bridge extends EventEmitter{
 signedIn=false;available=catalog;images=0;
 async account(){return this.signedIn?{email:'models-ui@example.invalid',plan:'test'}:null;}
 async models(){return this.available;}
 async stop(){}
 async begin(job){this.images++;job.resolvedModel=job.model||A;await job.onModelSelected?.(job.resolvedModel);job.threadId='model-ui';job.turnId='turn';setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:picture.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},20);}
}
const directory=await mkdtemp(path.join(tmpdir(),'houtu-model-ui-')),bridge=new Bridge(),app=await createApp({directory,bridge,platform:{async close(){}},targetAnalyzer:async()=>({found:true,mask:await sharp({create:{width:240,height:320,channels:3,background:'white'}}).png().toBuffer(),origin:'synthetic-fixture'})});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:await browserExecutable(),headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
const out=path.resolve('.impeccable/review/models');await mkdir(out,{recursive:true});
const select=()=>page.locator('#model-picker-select');
try{
 await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#model-picker').textContent.includes('请先使用ChatGPT登录'));assert.equal(await select().isDisabled(),true);
 bridge.signedIn=true;await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#model-picker-select option').length===3);
 await select().selectOption(B);assert.equal(bridge.images,0);
 await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.locator('#prompt-mode').selectOption('custom');assert.equal(await select().isDisabled(),false);await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.locator('#prompt-mode').selectOption('guided');
 await page.getByRole('button',{name:'编辑提示词',exact:true}).click();await page.locator('#template-name').fill('B model template');await page.locator('#save-template').click();await page.waitForFunction(()=>document.querySelector('#template-feedback').textContent.includes('已保存为新模板'));
 await select().selectOption(A);await page.locator('#apply-template').click();assert.equal(await select().inputValue(),B);assert.match(await page.locator('#model-picker').textContent(),/已选：Test Vision B/);
 await page.locator('#file').setInputFiles({name:'models-test.png',mimeType:'image/png',buffer:picture});
 bridge.available=[catalog[0]];await page.locator('#model-picker button').click();await page.waitForFunction(()=>document.querySelector('#model-picker').textContent.includes('此前所选模型不可用'));
 assert.equal(await select().inputValue(),B);assert.equal(await page.locator('#generate').isDisabled(),true);assert.equal(bridge.images,0);
 await select().selectOption(A);assert.equal(await page.locator('#generate').isDisabled(),false);
 await page.route('**/api/models?refresh=1',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试：模型列表暂时无法读取'})}));
 await page.locator('#model-picker button').click();await page.waitForFunction(()=>document.querySelector('#model-picker').textContent.includes('暂时无法读取'));assert.equal(await select().inputValue(),A);await page.unroute('**/api/models?refresh=1');
 bridge.available=catalog;await page.locator('#model-picker button').click();await page.waitForFunction(()=>document.querySelectorAll('#model-picker-select option').length===3);
 const request=page.waitForResponse(r=>r.url().endsWith('/api/jobs')&&r.request().method()==='POST');await page.locator('#generate').click();const response=await request;assert.equal(response.status(),202);const job=await response.json();assert.equal(job.model,A);
 await page.waitForSelector('#reuse-result:not([hidden])');assert.equal(bridge.images,1);await page.goto(origin+'/?job='+job.id);await page.waitForFunction(()=>document.querySelector('#model-picker-select').value==='test-vision-a');
 for(const [width,theme] of [[1440,'light'],[320,'dark']]){await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('.settings').screenshot({path:path.join(out,'retouch-'+width+'-'+theme+'.png')});}
 let expected=A;
 for(const [route,id] of [['/creative/','creative-model-picker'],['/ai/color/','color-model-picker']]){
   await page.goto(origin+route);await page.waitForFunction(id=>document.querySelectorAll('#'+id+' select option').length===3,id);assert.equal(await page.locator('#'+id+' select').inputValue(),expected);await page.locator('#'+id+' select').selectOption(B);expected=B;assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#'+id).screenshot({path:path.join(out,id+'-320.png')});
 }
 assert.deepEqual(errors,[]);console.log('PASS model UI: signed-out state, real catalog-shaped options, custom mode, templates, unavailable model preservation, refresh errors, request and history restore, three pages at 320px');
}finally{await browser.close();await app.close();await rm(directory,{recursive:true,force:true});}
