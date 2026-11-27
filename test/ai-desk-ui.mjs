import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {browserExecutable} from '../backend/platform-browser.mjs';
import {deskFixture} from './helpers/desk-fixture.mjs';
import {rawFixture} from './helpers/raw-fixture.mjs';

const f=await deskFixture(),errors=[],out=path.resolve('.impeccable/review/ai-modes');
const browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
await ctx.addInitScript(()=>{
 const counts=window.uiProbe={decode:0,encode:0,posts:0,renders:0};
 const post=Worker.prototype.postMessage;
 Worker.prototype.postMessage=function(message,...rest){if(['preview','export'].includes(message?.kind))counts.renders++;return post.call(this,message,...rest);};
 const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(...args){counts.decode++;return decode.apply(this,args);};
 const encode=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){counts.encode++;return encode.apply(this,args);};
 const native=window.fetch;window.fetch=(url,init)=>{if(init?.method==='POST'&&String(url).includes('/ai-runs'))counts.posts++;return native(url,init);};
});
const page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
const privateSample=process.env.HOUTU_PRIVATE_EXPORT_FIXTURE==='1';
const png=privateSample?await sharp('data/private-regression/cos-export.jpg').png().toBuffer():
 await sharp({create:{width:320,height:240,channels:3,background:'#8b8491'}}).png().toBuffer();
const file={name:'演练图.png',mimeType:'image/png',buffer:png};
const ready=()=>page.waitForFunction(()=>document.querySelector('#docName')?.textContent==='演练图.png'&&!document.querySelector('#export').disabled);
async function selectTool(id,label){
 const q=page.locator('#desk-search');await q.fill(label);await page.locator('[data-operation-choice="'+id+'"]').check();
}
const read=async route=>(await fetch(f.origin+route)).json();
async function waitPic(step){await page.waitForFunction(id=>document.querySelector('[data-desk-step="'+id+'"]')?.textContent.includes('已完成'),step,{timeout:30000});}
try{
 await fs.mkdir(out,{recursive:true});
 await page.goto(f.origin+'/workbench/?panel=ai');await page.locator('#desk-mode-auto').waitFor();
 assert.equal(await page.locator('#desk-mode-auto').getAttribute('aria-selected'),'true');
 await page.locator('#file').setInputFiles(file);await ready();await page.locator('#larger').click();
 await page.locator('[data-section=color]').click();
 const slider=page.locator('#exposure');await slider.evaluate(e=>{e.value='.25';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#ioState')?.textContent==='本机草稿');await page.locator('[data-section=ai]').click();
 const before=await page.evaluate(()=>{window.stageIdentity=document.querySelector('#stage');return {...window.uiProbe,zoom:document.querySelector('#zoomLabel').value,url:location.href};});
 await page.locator('#desk-mode-semi').click();await selectTool('soft-glow','柔光');await selectTool('lighting','人物光影');
 await page.locator('#desk-mode-auto').click();await page.locator('#desk-auto-paint').check();await page.locator('#desk-paint-style').selectOption('anime');const paintScope=page.getByRole('combobox',{name:'厚涂范围'});assert.equal(await paintScope.inputValue(),'portrait');await paintScope.selectOption({label:'全身厚涂'});assert.equal(await paintScope.inputValue(),'full-body');assert.equal(await page.locator('#desk-paint-style').inputValue(),'anime');const level=page.getByRole('spinbutton',{name:'厚涂程度 1–8'});await level.fill('');assert.ok(await page.locator('#desk-start').isDisabled());await level.fill('8');assert.ok(!await page.locator('#desk-start').isDisabled());await level.fill('9');assert.ok(await page.locator('#desk-start').isDisabled());await page.locator('#desk-auto-paint').uncheck();await page.locator('#desk-mode-semi').click();
 const after=await page.evaluate(()=>({...window.uiProbe,zoom:document.querySelector('#zoomLabel').value,url:location.href,same:window.stageIdentity===document.querySelector('#stage')}));
 assert.equal(after.same,true);for(const key of ['decode','encode','posts','renders','zoom','url'])assert.equal(after[key],before[key],key);
 assert.equal(f.bridge.images.length,0);assert.equal(f.bridge.reads.length,0);
 assert.match(await page.locator('.desk-sequence').textContent(),/柔光.*人物光影/);
 await page.getByRole('button',{name:'上移人物光影',exact:true}).click();assert.match(await page.locator('.desk-sequence').textContent(),/人物光影.*柔光/);
 await page.screenshot({path:path.join(out,'desktop-semi.png')});
 await page.locator('#desk-start').click();await waitPic('stage1');await page.waitForFunction(()=>!document.querySelector('#desk-start').disabled);
 const runId=new URL(page.url()).searchParams.get('deskRun');assert.ok(runId);let v=await read('/api/studio/ai-runs/'+runId);assert.equal(v.next,'stage2');assert.equal(f.bridge.images.length,1);assert.equal(f.bridge.images[0].op,'lighting');
 const runSource=await read('/api/workflows/'+v.origin.workflowId);assert.equal(runSource.kind,'single-canvas');assert.equal(runSource.steps.find(s=>s.id==='edit').output.settings.global.exposure,.25);
 const draftsBefore=await read('/api/studio/canvas-drafts');assert.equal(draftsBefore.photos.length,1);await page.reload();await waitPic('stage1');assert.equal((await read('/api/studio/canvas-drafts')).photos.length,1);await page.waitForFunction(()=>!document.querySelector('#desk-start').disabled);assert.equal(f.bridge.images.length,1);
 await page.locator('#desk-start').click();await waitPic('deliver');assert.equal(f.bridge.images.length,2);assert.equal(f.bridge.images[1].op,'soft-glow');
 v=await read('/api/studio/ai-runs/'+runId);assert.ok(v.done);
 await page.locator('[data-desk-step=stage1] button').click();
 assert.ok(await page.locator('#desk-follow').isVisible());
 await page.locator('#desk-follow').click();assert.equal(await page.locator('#desk-follow').count(),0);
 await page.locator('[data-section=color]').click();await page.locator('#contrast').evaluate(e=>{e.value='10';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>document.querySelector('#ioState')?.textContent==='本机草稿');
 const renderCount=await page.evaluate(()=>window.uiProbe.renders);
 await page.locator('[data-section=ai]').click();await waitPic('deliver');
 await page.locator('#desk-mode-auto').click();await page.locator('#desk-mode-semi').click();await waitPic('deliver');
 await page.locator('[data-section=color]').click();assert.equal(await page.evaluate(()=>window.uiProbe.renders),renderCount);
 await page.locator('#undo').click();await page.waitForFunction(()=>document.querySelector('#contrast')?.value==='0');
 await page.locator('#export').click();const download=page.waitForEvent('download');await page.locator('#doExport').click();
 const actual=await sharp(await fs.readFile(await(await download).path())).raw().toBuffer();
 const expected=await sharp(Buffer.from(await(await fetch(f.origin+'/api/workflows/'+v.result.workflowId+'/assets/'+v.result.assetId)).arrayBuffer())).ensureAlpha().raw().toBuffer();
 assert.deepEqual([...actual.subarray(0,3)],[...expected.subarray(0,3)]);
 await page.locator('[data-section=ai]').click();await page.locator('#desk-mode-auto').click();
 assert.equal(await page.locator('#desk-reference-provider').inputValue(),'xiaohongshu');
 await page.locator('#desk-reference-provider').selectOption('douyin');
 await page.locator('#desk-reference-character').fill('影宝');
 await page.locator('#desk-reference-work').fill('原神');
 await page.locator('#desk-auto-paint').check();
 assert.equal(await paintScope.inputValue(),'full-body');
 const fullBodyRequest=page.waitForRequest(r=>r.method()==='POST'&&new URL(r.url()).pathname==='/api/studio/ai-runs');
 await page.locator('#desk-start').click();
 assert.equal((await fullBodyRequest).postDataJSON().auto.paintScope,'full-body');
 await page.waitForFunction(()=>document.querySelector('[data-desk-step=deliver]')?.textContent.includes('已完成'),null,{timeout:30000});
 const ai=await read('/api/studio/ai-runs/'+new URL(page.url()).searchParams.get('deskRun'));assert.equal(ai.mode,'auto');assert.equal(ai.agent.referenceProvider,'douyin');assert.equal(ai.agent.sceneGuide.character,'影宝');assert.equal(ai.agent.sceneGuide.work,'原神');assert.equal(ai.origin.assetId,v.result.assetId);assert.ok(ai.done);assert.equal(f.bridge.images.length,4);
 // The update notice must not add a grid row or resize the photo.
 const box=await page.locator('#mat').boundingBox(),currentVersion=(await read('/api/health')).version;
 await page.route('**/api/updates/status',route=>route.fulfill({json:{currentVersion,available:true,latest:{version:'9.9.1'}}}));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.locator('#workbench-update-slot .update-notice').waitFor();
 assert.deepEqual(await page.locator('#mat').boundingBox(),box);
 const dismiss=page.locator('#workbench-update-slot button').last();
 await dismiss.click();await page.unroute('**/api/updates/status');
 for(let attempt=0;attempt<2;attempt++){
  await page.reload();await waitPic('deliver');
  assert.equal(await page.locator('#filmPhotos .tile').count(),1);
 }
 const runUrl=page.url();
 await page.getByRole('button',{name:'移除照片 演练图.png',exact:true}).click();
 await page.locator('#confirm-photo-removal').click();
 await page.waitForFunction(()=>document.querySelectorAll('#filmPhotos .tile').length===0);
 assert.equal((await read('/api/studio/canvas-drafts?removed=1')).photos.length,1);
 await page.goto(runUrl);
 await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('保存在工作流'));
 assert.equal(await page.locator('#filmPhotos .tile').count(),0);
 await page.locator('#project-menu').click();await page.locator('#recently-removed').click();
 await page.getByRole('button',{name:'恢复 演练图.png',exact:true}).click();await ready();await waitPic('deliver');
 assert.equal(await page.locator('#filmPhotos .tile').count(),1);
 assert.equal((await read('/api/studio/canvas-drafts?removed=1')).photos.length,0);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:820});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#desk-mode-semi').click();await page.locator('#desk-mode-auto').click();await page.screenshot({path:path.join(out,'phone-'+width+'.png')});
 }
 await page.goto(f.origin+'/ai/');await page.locator('#desk-mode-auto').waitFor();assert.equal(await page.locator('#desk-mode-auto').getAttribute('aria-selected'),'true');
 await page.locator('#desk-auto-paint').check();assert.ok(await paintScope.isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.locator('#desk-mode-semi').click();assert.ok(await page.locator('#desk-search').isVisible());await page.getByRole('button',{name:'单项精修工具',exact:true}).click();
 assert.ok(await page.locator('#operation-title').isVisible());
 // A RAW profile changes the base without clearing previous non-destructive adjustments.
 await page.goto(f.origin+'/workbench/?panel=color');
 await page.locator('#file').setInputFiles({name:'V-Log 样片.dng',mimeType:'application/octet-stream',buffer:rawFixture()});
 await page.waitForFunction(()=>document.querySelector('#docName')?.textContent==='V-Log 样片.dng'&&!document.querySelector('#export').disabled);
 await page.locator('#exposure').evaluate(e=>{
  e.value='.35';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.locator('#group-raw summary').click();
 await page.locator('#raw-vlog').click();
 await page.waitForFunction(()=>document.querySelector('#rawWorkingProfile')?.textContent==='V-Log 灰片'&&document.querySelector('#ioState')?.textContent==='本机草稿');
 const cube='LUT_3D_SIZE 2\n0 0 0\n0.5 0 0\n0 0.5 0\n0.5 0.5 0\n0 0 0.5\n0.5 0 0.5\n0 0.5 0.5\n0.5 0.5 0.5\n';
 await page.locator('#rawLutFile').setInputFiles({name:'test.cube',mimeType:'application/octet-stream',buffer:Buffer.from(cube)});
 await page.waitForFunction(()=>document.querySelector('#rawWorkingProfile')?.textContent.includes('test.cube'));
 await page.locator('#undo').click();
 assert.match(await page.locator('#rawWorkingProfile').textContent(),/V-Log 灰片/);
 await page.locator('#redo').click();
 assert.match(await page.locator('#rawWorkingProfile').textContent(),/test\.cube/);
 const draftId=new URL(page.url()).searchParams.get('canvasPhoto');
 for(let i=0;i<100;i++){
  const doc=await read('/api/studio/canvas-drafts/'+draftId);
  if(doc.nodes?.[doc.cursor]?.action?.profile==='vlog-lut')break;
  if(i===99)throw Error('RAW profile history did not persist.');
  await new Promise(r=>setTimeout(r,50));
 }
 await page.reload();await page.waitForFunction(()=>document.querySelector('#docName')?.textContent==='V-Log 样片.dng'&&document.querySelector('#ioState')?.textContent==='本机草稿');
 assert.equal(await page.locator('#exposure').inputValue(),'0.35');
 await page.setViewportSize({width:320,height:690});
 await page.locator('#group-raw summary').click();
 assert.ok(await page.locator('#raw-import-lut').isVisible());
 assert.match(await page.locator('#rawWorkingProfile').textContent(),/test\.cube/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.locator('#raw-standard').click();
 await page.waitForFunction(()=>document.querySelector('#rawWorkingProfile')?.textContent==='标准 sRGB');
 assert.equal(f.bridge.images.length,4);
 // Standard photos must load independently of the host-supplied MIME.
 await page.setViewportSize({width:1400,height:850});
 for(const [format,name,type,width,height] of [
  ['png','通用类型.PNG','application/octet-stream',150,100],
  ['webp','空类型.WEBP','',160,100],
  ['jpeg','实拍尺寸.JPG','application/octet-stream',8256,5504],
  ['tiff','显影尺寸.TIFF','application/octet-stream',8256,5504]
 ]){
  const image=await sharp({create:{width,height,channels:3,background:'#90704b'}}).toFormat(format).toBuffer();
  await page.locator('#file').setInputFiles({name,mimeType:type,buffer:image});
  await page.waitForFunction(({name,size})=>document.querySelector('#docName')?.textContent===name&&document.querySelector('#docSize')?.textContent===size&&!document.querySelector('#export').disabled,
   {name,size:width+' × '+height},{timeout:45000});
 }
 // The original 8256×5504 geometry is also used by the full-resolution render/export.
 if(!await page.locator('#exposure').count())await page.locator('#group-light summary').click();
 await page.locator('#exposure').evaluate(e=>{
  e.value='.2';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.locator('#export').click();
 await page.locator('#exportFormat').selectOption('image/jpeg');
 const exported=page.waitForEvent('download',{timeout:90000});await page.locator('#doExport').click();
 const geometry=await sharp(await (await exported).path()).metadata();
 assert.deepEqual([geometry.width,geometry.height],[8256,5504]);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,realGenerations:0,semiSingleStep:true,restoredNoResubmit:true,exactChainedSource:true,fullAuto:true,modeSwitchNoImageIO:true,sameCanvas:true,editAfterAi:true,display320:true,legacySingleTool:true}));
}catch(e){console.error('URL',page.url(),'pageerrors',errors,'notice',await page.locator('.desk-notice').allTextContents(),'status',await page.locator('#ioState').allTextContents());await page.screenshot({path:path.join(out,'failure.png')});throw e;}
finally{await ctx.close();await browser.close();await f.close();}
