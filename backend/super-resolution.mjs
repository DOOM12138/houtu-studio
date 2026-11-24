import path from 'node:path';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {randomUUID,createHash} from 'node:crypto';
import {SR_MODELS,SR_VERSION,superresOptions,superresDimensions} from '../public/superres-options.js';import {projectEnvironment} from '../lib/project-env.mjs';import {fileHash,inside} from './update-package.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
export async function superresModels(){return {version:SR_VERSION,runtime:'onnxruntime-node 1.31.1 · CPU',local:true,models:await Promise.all(SR_MODELS.map(async m=>{let ready=false;try{ready=await fileHash(path.join(ROOT,'models/superres',m.file))===m.sha256;}catch{}return {...m,ready,license:'BSD-3-Clause'};}))};}
export async function superresProcess(bytes,input,{directory,onProgress=()=>{},cancelled=()=>false,timeoutMs=45*60*1000,tileSize=192}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>110*1024*1024)throw Error('超分输入文件超过110MB或格式无效。');const options=superresOptions(input),model=SR_MODELS.find(m=>m.id===options.model);if(options.engineVersion!==SR_VERSION||options.modelSha256!==model.sha256)throw Error('此配方记录了其他模型或引擎版本；请明确建立使用当前模型的新版本，不能静默替换。');
 if(!directory)throw Error('缺少超分工作流目录。');if(cancelled())throw Object.assign(Error('本机超分已暂停。'),{code:'SR_CANCELLED'});
 const base=path.resolve(directory);if(!inside(ROOT,base))throw Error('超分工作目录必须在项目内。');let prefix=ROOT;
 for(const part of path.relative(ROOT,path.join(base,'runs')).split(path.sep)){prefix=path.join(prefix,part);try{if((await fs.lstat(prefix)).isSymbolicLink())throw Error('超分目录不能经过链接或重解析点。');}catch(e){if(e.code==='ENOENT')break;throw e;}}
 const run=path.join(base,'runs',randomUUID());await fs.mkdir(run,{recursive:true});const realRoot=await fs.realpath(ROOT),realBase=await fs.realpath(base);if(!inside(realRoot,await fs.realpath(run)))throw Error('超分工作目录越界。');
 const source=path.join(run,'source'),output=path.join(run,'result.png'),planFile=path.join(run,'plan.json');await fs.writeFile(source,bytes);await fs.writeFile(planFile,JSON.stringify({protocol:1,base,source,output,cache:path.join(base,'tiles'),sourceHash:hash(bytes),options,tileSize}));
 async function cleanup(){try{const realRun=await fs.realpath(run);if(!inside(realBase,realRun)||!inside(realRoot,realRun)||!/^[a-f0-9-]{36}$/.test(path.basename(realRun)))throw Error('超分临时目录校验失败。');await fs.rm(realRun,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch(e){if(e.code!=='ENOENT')await fs.writeFile(path.join(base,'cleanup-error.json'),JSON.stringify({run,error:e.message})).catch(()=>{});}}
 if(cancelled()){await cleanup();throw Object.assign(Error('本机超分已暂停。'),{code:'SR_CANCELLED'});}
 const environment=projectEnvironment(ROOT);for(const key of ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_HOME','GH_TOKEN','GITHUB_TOKEN','NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE'])delete environment[key];
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(ROOT,'backend/superres-worker.mjs'),planFile],{cwd:ROOT,env:environment,windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});let result,errorText='',ended=false,aborting=false,timedOut=false,killTimer,progressQueue=Promise.resolve();
  child.stderr.on('data',b=>{errorText=(errorText+b.toString()).slice(-8000);});
  const abort=()=>{if(ended||aborting)return;aborting=true;try{child.send({cancel:true},()=>{});}catch{}killTimer=setTimeout(()=>{try{child.kill();}catch{}},5000);killTimer.unref();};
  const check=setInterval(()=>{if(cancelled())abort();},100);check.unref();const timeout=setTimeout(()=>{if(!aborting){timedOut=true;abort();}},timeoutMs);timeout.unref();const clear=()=>{clearInterval(check);clearTimeout(timeout);clearTimeout(killTimer);};
  child.on('message',m=>{if(m?.type==='progress')progressQueue=progressQueue.then(()=>onProgress(m.progress)).catch(()=>{});else if(m?.type==='done')result=m.report;else if(m?.type==='error')errorText=m.message;});
  child.on('error',async e=>{errorText=e.message;if(child.pid){try{child.kill();}catch{}return;}if(ended)return;ended=true;clear();await cleanup();reject(e);});
  child.on('exit',async code=>{if(ended)return;ended=true;clear();await progressQueue;
   try{if(timedOut)throw Object.assign(Error('本机超分超时已停止，已完成图块保留，可从本步继续。'),{code:'SR_TIMEOUT'});if(aborting||cancelled())throw Object.assign(Error('本机超分已暂停，已完成图块保留，继续时复用。'),{code:'SR_CANCELLED'});if(code!==0||!result)throw Error('本机超分未完成：'+(errorText||'执行进程提前退出').slice(-700));const out=await fs.readFile(output);if(out.length>110*1024*1024)throw Error('超分成片超过110MB，请选择较低尺寸。');await cleanup();resolve({bytes:out,report:result});
   }catch(e){await fs.writeFile(path.join(base,'last-error.json'),JSON.stringify({message:e.message,code:e.code,options,sourceHash:hash(bytes),at:Date.now()})).catch(()=>{});await cleanup();reject(e);}
  });
 });
}
export {superresOptions,superresDimensions};
