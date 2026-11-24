// Synthetic local server records; no real account sign-in or model calls.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createApp} from '../server.mjs';
import {WorkflowStore} from '../backend/workflows.mjs';
import {browserExecutable} from '../backend/platform-browser.mjs';
const directory=await mkdtemp(path.join(tmpdir(),'houtu-server-ui-')),png=await sharp({create:{width:160,height:220,channels:3,background:'#b5a68f'}}).png().toBuffer();
class Bridge extends EventEmitter{email='first@example.invalid';calls=0;async account(){return {email:this.email,plan:'test'};}async stop(){}async begin(job){this.calls++;job.threadId='server-ui-'+this.calls;job.turnId='turn';job.resolvedModel='fixture-vision';await job.onModelSelected?.(job.resolvedModel);setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:png.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},10);}}
const fixtureBridge=new Bridge();let app=await createApp({directory,bridge:fixtureBridge,platform:{async close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));let origin='http://127.0.0.1:'+app.server.address().port;
async function done(id){for(let i=0;i<200;i++){const j=await(await fetch(origin+'/api/jobs/'+id)).json();if(j.status==='done')return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Fixture job timed out');}
for(const email of ['first@example.invalid','second@example.invalid']){fixtureBridge.email=email;const {csrf}=await(await fetch(origin+'/api/health')).json();const response=await fetch(origin+'/api/jobs',{method:'POST',headers:{Origin:origin,'X-Paint-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/png;base64,'+png.toString('base64')})});assert.equal(response.status,202);await done((await response.json()).id);}
await app.close();
const workflows=new WorkflowStore(directory);await workflows.load();const w=await workflows.create({kind:'color',name:'本机调色档案'}),asset=await workflows.putAsset(w.id,png,'image/png');await workflows.checkpoint(w.id,'source',{imageAsset:asset.id});await workflows.checkpoint(w.id,'grade',{});for(let i=0;i<26;i++)await workflows.checkpoint(w.id,'export',{imageAsset:asset.id});
const legacy=randomUUID(),legacyRoot=path.join(directory,'jobs',legacy);await mkdir(legacyRoot,{recursive:true});await writeFile(path.join(legacyRoot,'source.png'),png);await writeFile(path.join(legacyRoot,'result.png'),png);await writeFile(path.join(legacyRoot,'job.json'),JSON.stringify({id:legacy,status:'done',strength:'light',created:1,prompt:'Legacy record',sourceUrl:'/images/'+legacy+'/source.png',outputUrl:'/images/'+legacy+'/result.png'}));
const bridge=new Bridge();bridge.email='second@example.invalid';app=await createApp({directory,bridge,platform:{async close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({executablePath:await browserExecutable(),headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);const out=path.resolve('.impeccable/review/server-library');await mkdir(out,{recursive:true});
try{
 await page.goto(origin+'/server/');await page.waitForFunction(()=>document.querySelectorAll('.server-image-card').length===24&&document.querySelectorAll('.server-account').length===2);assert.match(await page.locator('#server-current').textContent(),/second@example.invalid/);
 await page.locator('#archive-next').click();await page.waitForFunction(()=>document.querySelectorAll('.server-image-card').length===5);assert.match(await page.locator('#archive-page-label').textContent(),/2 \/ 2/);
 const status=await(await fetch(origin+'/api/server/status')).json(),first=status.accounts.find(account=>account.email==='first@example.invalid');
 await page.locator('#archive-account').selectOption(first.id);await page.waitForFunction(()=>document.querySelectorAll('.server-image-card').length===1);assert.match(await page.locator('.server-image-account').textContent(),/first@example.invalid/);
 const thumbnail=page.locator('.server-image-card img');await thumbnail.evaluate(image=>image.decode());
 assert.equal(await page.locator('.server-image-actions a').count(),3);await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
 await page.locator('#archive-account').selectOption('unknown');await page.locator('#archive-query').fill(legacy);await page.waitForFunction(()=>document.querySelectorAll('.server-image-card').length===1&&document.querySelector('.server-image-account').textContent==='未记录账号');
 await page.locator('#archive-query').fill('not-an-existing-image');await page.waitForSelector('#server-empty:not([hidden])');assert.equal(await page.locator('.server-image-card').count(),0);
 for(const [width,theme]of [[390,'light'],[320,'dark']]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/server/');await page.waitForFunction(()=>document.querySelectorAll('.server-account').length===2);await page.locator('#archive-account').selectOption(first.id);await page.waitForFunction(()=>document.querySelectorAll('.server-image-card').length===1);await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);assert.equal(await page.locator('#server-storage').getAttribute('open'),null);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,width+'-'+theme+'.png'),fullPage:true});
 }
 assert.equal(bridge.calls,0);assert.deepEqual(errors,[]);console.log('PASS server library UI: persisted account records, 29 versions, paging/search/account filter, legacy unknown identity, real thumbnails, empty state and 320px/dark mode without AI calls');
}finally{await browser.close();await app.close();await rm(directory,{recursive:true,force:true});}
