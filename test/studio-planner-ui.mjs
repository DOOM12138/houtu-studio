import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {createApp} from '../server.mjs';
import {browserExecutable} from '../backend/platform-browser.mjs';

const directory=await mkdtemp(path.join(tmpdir(),'planner-ui-'));
const png=await sharp({create:{width:220,height:280,channels:4,background:'#886655'}}).png().toBuffer();
const other=await sharp({create:{width:220,height:280,channels:4,background:'#557788'}}).png().toBuffer();
class Bridge extends EventEmitter{
 analyses=0;images=0;
 async account(){return {email:'planner-ui@example.invalid',plan:'test'};}
 async models(){return [{id:'planner-test',name:'测试规划模型'},{id:'render-test',name:'测试跑图模型'}];}
 async analyzeImages(files,prompt,c){this.analyses++;c.resolvedModel='planner-test';await c.onModelSelected?.(c.resolvedModel);return {summary:'将人物与衣料统一安排到一次细化，保留照片身份、构图和光线。',recipe:{name:'测试独立方案',stages:[{type:'retouch',name:'统一人物细化',options:{operation:'portrait-polish',style:'natural',prompt:'轻微整理人物与衣褶，保留身份、服装设计、原场地与整体色彩。'}},{type:'export',options:{format:'png'}}]}};}
 async begin(job){this.images++;job.threadId='ui-'+job.id;job.turnId='turn';job.resolvedModel='render-test';await job.onModelSelected?.(job.resolvedModel);setTimeout(()=>{this.emit('notification','item/completed',{threadId:job.threadId,item:{type:'imageGeneration',status:'completed',result:other.toString('base64')}});this.emit('notification','turn/completed',{threadId:job.threadId,turn:{status:'completed'}});},80);}
 async stop(){}async cancel(){}
}
const bridge=new Bridge();let app,browser;
try{
 app=await createApp({directory,bridge,automaticUpdateChecks:false,platform:{async close(){}},targetAnalyzer:async bytes=>{const m=await sharp(bytes).metadata();return {supported:true,found:true,mask:await sharp({create:{width:m.width,height:m.height,channels:3,background:'white'}}).png().toBuffer(),policy:'isolated-test'};}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port,csrf=(await(await fetch(origin+'/api/health')).json()).csrf;
 const post=async(route,data)=>{const r=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Paint-CSRF':csrf},body:JSON.stringify(data)});assert.ok(r.ok,await r.clone().text());return r.json();};
 const get=async route=>(await fetch(origin+route)).json();
 const until=async(predicate,message)=>{for(let i=0;i<500;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error(message);};
 const created=await post('/api/studio/projects',{name:'调度验收 · 合成色块',recipe:{name:'原图导出',stages:[{type:'export',options:{format:'png'}}]}});
 for(const [i,image]of [png,other].entries()){const r=await fetch(origin+'/api/studio/projects/'+created.id+'/photos?name=sample-'+i+'.png',{method:'POST',headers:{Origin:origin,'Content-Type':'image/png','X-Paint-CSRF':csrf},body:image});assert.ok(r.ok);}
 const initial=await get('/api/studio/projects/'+created.id),originalFlows=initial.photos.map(p=>p.workflowId);
 browser=await chromium.launch({executablePath:await browserExecutable(),headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],modelRequests=new Set();
 page.on('pageerror',error=>{errors.push(error.message);console.error('BROWSER ERROR: '+error.message);});page.on('response',r=>{if(r.ok()&&/\/(models|vision)\//.test(r.url()))modelRequests.add(new URL(r.url()).pathname);if(r.status()>=400&&/\.js$/.test(new URL(r.url()).pathname))console.error('MODULE '+r.status()+' '+new URL(r.url()).pathname);});
 await page.goto(origin+'/studio/?project='+created.id);await page.locator('#planner-scope').waitFor({state:'attached'});await page.locator('#studio-planner>summary').click();await page.locator('#planner-scope').filter({hasText:'已选 2 张'}).waitFor();
 await page.locator('#planner-provider').selectOption('local');await page.locator('#planner-create').click();
 await page.locator('#planner-apply').waitFor({timeout:120000});assert.equal(bridge.analyses,0);assert.equal(bridge.images,0);
 assert.ok(modelRequests.has('/models/selfie_multiclass_256x256.tflite'));assert.ok(modelRequests.has('/models/face_landmarker.task'));
 assert.match(await page.locator('#planner-results').innerText(),/本机模型辅助方案/);assert.match(await page.locator('#planner-results').innerText(),/0个AI跑图步骤/);
 await page.locator('#planner-apply').click();await page.locator('#studio-tab-workflow[aria-selected=true]').waitFor();
 await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.press('Control+z');
 await until(async()=>JSON.stringify((await get('/api/studio/projects/'+created.id)).photos.map(p=>p.workflowId))===JSON.stringify(originalFlows),'Group undo did not restore the original versions');
 await page.locator('#studio-tab-recipe').click();let releaseResponse,responseHeld;
 const held=new Promise(r=>responseHeld=r),released=new Promise(r=>releaseResponse=r),laterRequests=[];
 const watch=r=>{if(/\/(apply|run)$/.test(new URL(r.url()).pathname)&&r.method()==='POST')laterRequests.push(r.url());};page.on('request',watch);
 const pattern='**/api/studio/projects/*/plans',hold=async route=>{const response=await route.fetch();responseHeld();await released;await route.fulfill({response});};
 await page.route(pattern,hold);await page.locator('#planner-auto').click();await held;await page.locator('#planner-cancel').click();releaseResponse();
 await page.locator('#planner-status').filter({hasText:'已停止后续应用与跑图'}).waitFor();assert.deepEqual(laterRequests,[]);assert.equal(bridge.images,0);page.off('request',watch);await page.unroute(pattern,hold);
 let releaseApply,applyHeld;const waitingApply=new Promise(r=>applyHeld=r),allowedApply=new Promise(r=>releaseApply=r),runRequests=[];
 const recordRun=r=>{if(new URL(r.url()).pathname.endsWith('/run')&&r.method()==='POST')runRequests.push(r.url());};page.on('request',recordRun);
 const readPattern=origin+'/api/studio/plans/*',readyRead=async route=>{let v=await get(new URL(route.request().url()).pathname);for(let i=0;i<200&&v.status==='running';i++){await new Promise(r=>setTimeout(r,10));v=await get(new URL(route.request().url()).pathname);}await route.fulfill({json:v});};
 const applyPattern='**/api/studio/plans/*/apply',holdApply=async route=>{const response=await route.fetch();applyHeld();await allowedApply;await route.fulfill({response});};
 await page.route(readPattern,readyRead);await page.route(applyPattern,holdApply);await page.locator('#planner-auto').click();await waitingApply;await page.locator('#planner-cancel').click();releaseApply();
 await page.locator('#studio-notice').filter({hasText:'连续跑图已停止'}).waitFor();assert.deepEqual(runRequests,[]);assert.equal(bridge.images,0);page.off('request',recordRun);await page.unroute(readPattern,readyRead);await page.unroute(applyPattern,holdApply);
 await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.press('Control+z');await until(async()=>JSON.stringify((await get('/api/studio/projects/'+created.id)).photos.map(p=>p.workflowId))===JSON.stringify(originalFlows),'Undo after a stopped application did not restore the originals');
 await page.locator('#studio-tab-recipe').click();await page.locator('#planner-provider').selectOption('chatgpt');
 await page.locator('#planner-model select').selectOption('planner-test');await page.locator('#studio-model select').selectOption('render-test');
 assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('houtu-planning-model'),localStorage.getItem('houtu-selected-model')]),['planner-test','render-test']);
 await page.locator('#planner-task-outfit').check();await page.locator('#planner-goal').fill('人物与衣料轻柔统一整理，保持原图色调。');
 const runStarted=page.waitForResponse(r=>r.url().endsWith('/run')&&r.request().method()==='POST',{timeout:30000});await page.locator('#planner-auto').click();assert.ok((await runStarted).ok());
 await until(async()=>bridge.images===2&&(await get('/api/studio/projects/'+created.id)).queue.state==='done','Planned image workflow did not finish');
 const finished=await get('/api/studio/projects/'+created.id);assert.equal(bridge.analyses,2);assert.equal(bridge.images,2);assert.equal(finished.history.entries.length,1);assert.equal(finished.history.entries[0].label,'应用智能调度方案');
 await page.reload();await page.locator('#planner-scope').waitFor({state:'attached'});await page.locator('#studio-planner>summary').click();await page.locator('#planner-scope').filter({hasText:'已选 2 张'}).waitFor();await page.locator('#planner-status').filter({hasText:'方案已应用'}).waitFor();assert.equal(bridge.images,2);
 const screenshots=path.resolve('.impeccable/review/planner');await mkdir(screenshots,{recursive:true});
 for(const [width,theme]of [[1440,'light'],[390,'light'],[320,'dark']]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.locator('#studio-tab-recipe').click();await page.locator('#studio-planner').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screenshots,width+'-'+theme+'.png'),fullPage:true});if(width===320){await page.locator('#studio-planner>summary').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screenshots,'320-planner-top.png')});await page.locator('#planner-create').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screenshots,'320-planner-actions.png')});}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal page overflow at '+width);}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',realLocalModels:true,syntheticCloudAnalyses:bridge.analyses,syntheticImageCalls:bridge.images,realImageCalls:0,undo:true,reloadDoesNotRun:true,viewports:[1440,390,320],screenshots}));
}finally{await browser?.close();await app?.close();await rm(directory,{recursive:true,force:true});}
