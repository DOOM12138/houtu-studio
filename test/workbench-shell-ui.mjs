import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {browserExecutable} from '../backend/platform-browser.mjs';
import {deskFixture} from './helpers/desk-fixture.mjs';

const app=await deskFixture(),browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});
try{
 const page=await browser.newPage({viewport:{width:1360,height:880}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(app.origin+'/');
 assert.equal(new URL(page.url()).pathname,'/workbench/');
 const bytes=process.env.HOUTU_PRIVATE_EXPORT_FIXTURE==='1'
  ?await fs.readFile('data/private-regression/cos-export.jpg')
  :await sharp({create:{width:320,height:240,channels:3,background:'#81726d'}}).jpeg().toBuffer();
 await page.locator('#file').setInputFiles({name:'同一照片.jpg',mimeType:'image/jpeg',buffer:bytes});
 await page.waitForFunction(()=>document.querySelector('#docName')?.textContent==='同一照片.jpg'&&!document.querySelector('#export').disabled);
 const id=new URL(page.url()).searchParams.get('canvasPhoto');
 await page.locator('#larger').click();
 const zoom=await page.locator('#zoomLabel').textContent();
 await page.evaluate(()=>{window.initialCanvas=document.querySelector('#stage');});
 await page.locator('#sectionTool').click();
 const tool=page.frameLocator('#advancedFrame iframe');
 await tool.locator('#adjust-exposure').waitFor();
 assert.ok((await page.locator('#advancedFrame iframe').boundingBox()).height>480,'advanced tool fills editing surface');
 await tool.locator('#export').evaluate(e=>e.disabled?new Promise(resolve=>{
  const o=new MutationObserver(()=>{if(!e.disabled){o.disconnect();resolve();}});o.observe(e,{attributes:true,attributeFilter:['disabled']});
 }):true);
 await tool.locator('#adjust-exposure').evaluate(e=>{e.value='.45';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
 if(process.env.HOUTU_PRIVATE_EXPORT_FIXTURE==='1'){await fs.mkdir('tmp/workbench-shell-preview',{recursive:true});await page.screenshot({path:'tmp/workbench-shell-preview/advanced.png'});}
 await page.locator('#applyAdvanced').click();
 await page.locator('#advancedTools').waitFor({state:'hidden'});
 const draft=await app.ok('/api/studio/canvas-drafts/'+id);
 assert.equal(draft.nodes[draft.cursor].action.type,'tool-image');
 assert.equal(await page.locator('#filmPhotos .tile').count(),1);
 assert.equal(await page.locator('#zoomLabel').textContent(),zoom);
 assert.equal(await page.evaluate(()=>window.initialCanvas===document.querySelector('#stage')),true);
 assert.equal(new URL(page.url()).pathname,'/workbench/');
 await page.locator('#moreTools').click();
 await page.getByRole('button',{name:'4K 超分',exact:true}).click();
 await page.frameLocator('#advancedFrame iframe').locator('#sr-before').waitFor({state:'attached'});
 assert.match(await page.locator('#advancedTitle').textContent(),/超分/);
 assert.equal(new URL(page.url()).pathname,'/workbench/');
 await page.locator('#closeAdvanced').click();
 await page.locator('#settings-page').click();
 await page.waitForURL('**/settings/');
 assert.deepEqual(await page.locator('.settings-destinations a').allTextContents(),['修图','设置']);
 await page.locator('[data-settings=logs]').click();
 await page.locator('#logs-export').waitFor();
 if(process.env.HOUTU_PRIVATE_EXPORT_FIXTURE==='1')await page.screenshot({path:'tmp/workbench-shell-preview/settings.png'});
 assert.equal(new URL(page.url()).pathname,'/settings/');
 await page.locator('#settings-workbench').click();
 await page.waitForFunction(photo=>document.querySelector('#docName')?.textContent==='同一照片.jpg'&&!document.querySelector('#export').disabled&&new URL(location.href).searchParams.get('canvasPhoto')===photo,id);
 assert.equal(new URL(page.url()).searchParams.get('canvasPhoto'),id);
 assert.equal(await page.locator('#zoomLabel').textContent(),zoom);
 await page.setViewportSize({width:320,height:680});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#topbar').scrollWidth<=innerWidth+1));
 await page.locator('#sectionTool').click();
 const narrow=page.frameLocator('#advancedFrame iframe');
 await narrow.locator('#adjust-exposure').waitFor();
 assert.ok(await narrow.locator('html').evaluate(e=>e.scrollWidth<=innerWidth+1));
 assert.ok((await page.locator('#advancedFrame iframe').boundingBox()).height>=450);
 await page.locator('#closeAdvanced').click();
 assert.deepEqual(errors,[]);
 assert.equal(app.bridge.images.length,0);
 assert.equal(app.bridge.reads.length,0);
 console.log('PASS workbench: single canvas, embedded grading applied, 4K stays in the workbench, settings returns the exact photo and zoom, 320px');
}finally{await browser.close();await app.close();}
