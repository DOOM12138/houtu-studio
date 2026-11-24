// Real local pixels and browser interactions; no claim about commercial AI retouch quality.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../server.mjs';
import {browserExecutable} from '../backend/platform-browser.mjs';
const directory=await mkdtemp(path.join(tmpdir(),'houtu-studio-ui-')),source=await sharp({create:{width:320,height:400,channels:3,background:'#a79582'}}).png().toBuffer();
class Bridge extends EventEmitter{async account(){return null;}async stop(){}}
const app=await createApp({directory,bridge:new Bridge(),platform:{async close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port,browser=await chromium.launch({executablePath:await browserExecutable(),headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);const out=path.resolve('.impeccable/review/studio');await mkdir(out,{recursive:true});
try{
 await page.goto(origin+'/studio/');await page.locator('#project-name').fill('免费修图 · 项目测试');await page.locator('#new-project button').click();await page.waitForSelector('#studio-workspace:not([hidden])');
 await page.locator('#recipe-choice').selectOption('builtin-5');await page.locator('#save-project-recipe').click();await page.waitForFunction(()=>document.querySelector('#studio-notice').textContent.includes('默认配方已保存'));
 await page.locator('#studio-files').setInputFiles([{name:'角色照片.png',mimeType:'image/png',buffer:source},{name:'相同的照片.png',mimeType:'image/png',buffer:source}]);await page.waitForFunction(()=>document.querySelector('#studio-notice').textContent.includes('合并 1'));assert.equal(await page.locator('.studio-photo').count(),1);
 await page.locator('.studio-photo-controls select').first().selectOption('5');await page.waitForFunction(()=>!document.querySelector('#run-auto').disabled);await page.locator('.studio-photo-frame').click();await page.waitForSelector('#studio-photo-detail:not([hidden])');
 await page.locator('#run-semi').click();await page.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('已暂停'));assert.match(await page.locator('.studio-photo>p').last().textContent(),/1\/3/);
 await page.locator('#run-auto').click();await page.waitForFunction(()=>document.querySelector('#queue-status').textContent.startsWith('已完成 ·'));await page.waitForFunction(()=>document.querySelector('#detail-result').complete&&document.querySelector('#result-label').textContent.includes('导出'));assert.match(await page.locator('#result-label').textContent(),/导出/);assert.equal(await page.locator('#detail-steps a').count(),3);
 await page.locator('#add-type').selectOption('local');await page.locator('#add-stage').click();await page.waitForFunction(()=>document.querySelectorAll('.studio-stage').length===4);assert.equal(await page.locator('.studio-stage-head button[aria-label^="上移"]').first().isDisabled(),true);
 const color=await browser.newPage();color.on('pageerror',e=>errors.push(e.message));await color.goto(origin+await page.locator('#detail-handoffs a').filter({hasText:'继续局部调色'}).getAttribute('href'));await color.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('sRGB'));await color.close();
 const manager=await browser.newPage();await manager.goto(origin+await page.locator('#detail-workflow').getAttribute('href'));await manager.waitForSelector('.flow-step');assert.equal(await manager.locator('.flow-step').count(),4);assert.match(await manager.locator('#workflow-detail').textContent(),/回到照片项目继续/);await manager.close();
 const download=page.waitForEvent('download');await page.locator('#export-recipe').click();assert.match((await download).suggestedFilename(),/配方/);
 const delivery=page.waitForEvent('download');await page.locator('#deliver-photos').click();assert.match((await delivery).suggestedFilename(),/成片\.zip/);
 const backup=page.waitForEvent('download');await page.locator('#backup-project').click();assert.match((await backup).suggestedFilename(),/项目备份\.json/);
 for(const [width,theme]of [[1440,'light'],[390,'light'],[320,'dark']]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);await page.screenshot({path:path.join(out,width+'-'+theme+'.png'),fullPage:true});}
 await page.goto(origin+'/features/');assert.match(await page.locator('body').textContent(),/没有站内收费/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log('PASS studio UI: free local project, deduplicated intake, rating, ordered recipe, semi/auto checkpoints, step images, recipe sharing, delivery and private backup, desktop and 320px/dark mode');
}finally{await browser.close();await app.close();await rm(directory,{recursive:true,force:true});}
