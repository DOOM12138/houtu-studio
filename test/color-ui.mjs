import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createApp} from '../server.mjs';
import sharp from 'sharp';
const dir=await mkdtemp(path.join(os.tmpdir(),'houtu-color-ui-'));
class Bridge extends EventEmitter{async account(){return null;}async stop(){}}
const app=await createApp({directory:dir,bridge:new Bridge()});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const site='http://127.0.0.1:'+app.server.address().port,out=path.resolve('.impeccable/review/color');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const fixture=await sharp({create:{width:640,height:800,channels:4,background:'#b7b0a0'}}).composite([{input:await sharp({create:{width:260,height:480,channels:4,background:'#688eac'}}).png().toBuffer(),top:150,left:180}]).png().toBuffer();
try{
 for(const [width,height,theme] of [[1440,1000,'light'],[390,844,'light'],[320,760,'dark']]){
  const context=await browser.newContext({viewport:{width,height},colorScheme:theme}),page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site+'/color/');await page.waitForSelector('#builtins button');assert.equal(await page.locator('#export').isDisabled(),true);
  await page.locator('#file').setInputFiles({name:'调色测试-非AI生成.png',mimeType:'image/png',buffer:fixture});await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('sRGB'));
  const before=await page.locator('#preview').evaluate(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]);assert.equal(before[0],183);
  await page.locator('#adjust-exposure-number').fill('1');await page.locator('#adjust-exposure-number').dispatchEvent('input');await page.waitForFunction(()=>document.querySelector('#preview').getContext('2d').getImageData(0,0,1,1).data[0]>200);
  await page.locator('#undo').click();await page.waitForFunction(()=>document.querySelector('#preview').getContext('2d').getImageData(0,0,1,1).data[0]===183);
  await page.locator('#mask-type').selectOption('brush');await page.locator('#add-mask').click();assert.match(await page.locator('#adjust-title').textContent(),/局部调色/);
  const box=await page.locator('#overlay').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55,{steps:5});await page.mouse.up();
  await page.locator('#adjust-temperature-number').fill('30');await page.locator('#adjust-temperature-number').dispatchEvent('input');await page.locator('#show-mask').uncheck();await page.waitForTimeout(300);
  await page.locator('#global').click();await page.locator('#preset-name').fill('UI调色测试-'+width);const save=page.waitForResponse(r=>r.url().endsWith('/api/color/presets/save'));await page.locator('#save-preset').click();assert.equal((await save).status(),200);
  const download=page.waitForEvent('download');await page.locator('#share-preset').click();const file=await (await download).path();const shared=JSON.parse(await readFile(file,'utf8'));assert.equal(shared.schema,'houtu-color-presets');assert.equal(shared.presets[0].layers.length,0);
  await page.getByText('参考图与平台链接',{exact:true}).click();
  const reference=await sharp({create:{width:300,height:300,channels:3,background:'#d4b8a0'}}).png().toBuffer();await page.locator('#reference-file').setInputFiles({name:'暖调参考.png',mimeType:'image/png',buffer:reference});await page.waitForFunction(()=>!document.querySelector('#match-reference').disabled);await page.locator('#match-reference').click();assert.match(await page.locator('#notice').textContent(),/已匹配/);
  const png=page.waitForEvent('download');await page.locator('#export').click();const exported=await (await png).path();const metadata=await sharp(await readFile(exported)).metadata();assert.equal(metadata.width,640);assert.equal(metadata.height,800);
  // Actual model + WASM inference, with no network/CDN substitution.
  if(width===1440){await page.locator('#segment').click();await page.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('分割完成')||document.querySelector('#notice').classList.contains('error'),{},{timeout:120000});assert.match(await page.locator('#model-status').textContent(),/分割完成/);await page.locator('#mask-type').selectOption('person');await page.locator('#add-mask').click();assert.equal(await page.locator('#mask-list .mask-row').count(),2);}
  const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify(overflow));assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,`${width}-${theme}.png`),fullPage:true});console.log('PASS color UI',width,theme);await context.close();
 }
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
