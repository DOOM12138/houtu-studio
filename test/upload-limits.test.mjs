import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {createApp} from '../server.mjs';import {decodeImage} from '../lib/painting.mjs';import {readRequestBytes} from '../lib/request-body.mjs';
import {MAX_IMAGE_UPLOAD_BYTES,IMAGE_JSON_BODY_BYTES} from '../public/upload-limits.js';
const png=await sharp({create:{width:48,height:64,channels:4,background:'#786b93'}}).png().toBuffer();
class Local extends EventEmitter{async account(){return null;}async stop(){}}
test('100 MB image boundaries are inclusive and base64 decoding does not use the old 12 MB ceiling',()=>{
 const full=Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES);png.copy(full);const encoded=full.toString('base64');assert.ok(Buffer.byteLength(JSON.stringify({image:'data:image/png;base64,'+encoded}))<IMAGE_JSON_BODY_BYTES);
 const decoded=decodeImage('data:image/png;base64,'+encoded);assert.equal(decoded.bytes.length,MAX_IMAGE_UPLOAD_BYTES);assert.equal(decoded.extension,'png');
 const over=Buffer.concat([full,Buffer.from([0])]);assert.throws(()=>decodeImage('data:image/png;base64,'+over.toString('base64')),e=>e.status===413&&e.message.includes('100 MB'));
 assert.throws(()=>decodeImage('data:image/png;base64,'+encoded.slice(0,10)+'!'+encoded.slice(11)));
});
test('actual HTTP intake stores exactly 100 MB and rejects one byte over for projects, assets and RAW imports',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'upload-boundary-')),app=await createApp({directory,bridge:new Local(),platform:{async close(){}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port,health=await(await fetch(origin+'/api/health')).json(),headers={Origin:origin,'X-Paint-CSRF':health.csrf};
 t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
 const post=async(url,value)=>{const r=await fetch(origin+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(value)});assert.ok(r.ok,await r.clone().text());return r.json();};
 const project=await post('/api/studio/projects',{recipe:{stages:[{type:'export'}]}}),full=Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES);png.copy(full);
 const upload=await fetch(origin+'/api/studio/projects/'+project.id+'/photos?name=100MB.png',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:full});assert.equal(upload.status,201,await upload.clone().text());const added=await upload.json(),source=await app.studio.workflows.asset(added.photo.originalWorkflowId,added.photo.originalAsset);assert.equal(source.bytes,MAX_IMAGE_UPLOAD_BYTES);
 const w=await post('/api/workflows',{name:'100 MB asset'}),asset=await fetch(origin+'/api/workflows/'+w.id+'/assets',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:full});assert.equal(asset.status,201);assert.equal((await asset.json()).bytes,MAX_IMAGE_UPLOAD_BYTES);
 const over=Buffer.concat([full,Buffer.from([0])]);for(const route of ['/api/studio/projects/'+project.id+'/photos','/api/workflows/'+w.id+'/assets','/api/image-imports?name=too-large.dng']){const r=await fetch(origin+route,{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:over});assert.equal(r.status,413,route);assert.match((await r.json()).error,/100 MB/);}
 // Previously stored or generated assets retain their separate 110MB ceiling.
 const legacy=await app.studio.workflows.putAsset(w.id,over,'image/png');await app.studio.workflows.checkpoint(w.id,'source',{imageAsset:legacy.id});const reused=await post('/api/studio/projects/'+project.id+'/photos?name=legacy.png',{source:{kind:'workflow',workflowId:w.id,assetId:legacy.id}});assert.equal((await app.studio.workflows.asset(reused.photo.originalWorkflowId,reused.photo.originalAsset)).bytes,MAX_IMAGE_UPLOAD_BYTES+1);
 // Base64 transport must also pass a real image-bearing JSON endpoint, without any AI.
 app.targetVision.analyze=async()=>({found:false,supported:true});const mid=Buffer.alloc(31*1024*1024);png.copy(mid);const analyzed=await fetch(origin+'/api/targets/analyze',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/png;base64,'+mid.toString('base64'),operation:'face'})});assert.equal(analyzed.status,200,await analyzed.clone().text());
});
test('chunked excess receives HTTP 413 while remaining bytes are discarded and the server remains usable',async t=>{
 const server=http.createServer(async(req,res)=>{try{const bytes=await readRequestBytes(req,32,'limit');res.writeHead(200).end(String(bytes.length));}catch(e){res.writeHead(e.status||500).end(e.message);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,method:'POST',headers:{'Transfer-Encoding':'chunked'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write(Buffer.alloc(20));req.end(Buffer.alloc(20));});assert.equal(response,413);assert.equal(await(await fetch('http://127.0.0.1:'+server.address().port)).text(),'0');
});
