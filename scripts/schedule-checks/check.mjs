import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const repo='DOOM12138/houtu-studio',minimumRunId=45753504909;
const sem=v=>/^v(\d+)\.(\d+)\.(\d+)$/.exec(v||'')?.slice(1).map(Number);
const cmp=(a,b)=>{for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
function readGitHub(args,{run,deadline,now=Date.now,pause=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms)}){
 for(let attempt=0;;attempt++){
  const remaining=deadline-now();if(remaining<250)throw Error('GitHub precheck time budget exhausted');
  try{return run(args,Math.min(12000,remaining));}
  catch(error){
   const detail=String(error.stderr||'')+' '+String(error.message||'');
   const transient=error.code==='ETIMEDOUT'||/\bEOF\b|ECONNRESET|ETIMEDOUT|TLS handshake timeout|connection (?:was )?reset|connection timed out/i.test(detail);
   if(!transient||attempt>=2)throw error;
   const delay=Math.min(250*(attempt+1),deadline-now()-250);if(delay<=0)throw error;pause(delay);
  }
 }
}
const complete=r=>r&&!r.draft&&!r.prerelease&&['Windows-x64.zip','Windows-x64-Setup.exe','Android-arm64-v8a.apk','Android-x86_64.apk','SHA256.txt'].every(s=>r.assets?.some(a=>a.name==='houtu-studio-'+r.tag_name.slice(1)+'-'+s&&a.state==='uploaded'&&a.size>0&&/^sha256:[a-f0-9]{64}$/.test(a.digest||'')));
function pendingReleases(runs,stable,releases,handled,known){
 const pending=[],byTag=new Map(releases.map(r=>[r.tag_name,r]));
 for(const run of runs){
  if(run.id<minimumRunId||run.status!=='completed')continue;
  const version=sem(run.head_branch);if(!version)continue;
  const key=run.id+':'+run.run_attempt+':'+run.conclusion;if(handled.includes(key))continue;
  const newer=sem(stable?.tag_name)&&cmp(sem(stable.tag_name),version)>=0&&complete(stable);
  const item={key,runId:run.id,attempt:run.run_attempt,tag:run.head_branch,url:run.html_url};
  if(newer){
   if(stable.tag_name===run.head_branch&&!known.includes(stable.tag_name))pending.push({...item,reason:'new-stable-needs-verification'});
   continue;
  }
  if(['failure','timed_out','action_required','startup_failure'].includes(run.conclusion))pending.push({...item,reason:run.conclusion});
  else if(run.conclusion==='cancelled')pending.push({...item,reason:'cancelled-needs-status'});
  else if(run.conclusion==='success'&&!complete(byTag.get(run.head_branch)))pending.push({...item,reason:'incomplete-release'});
 }
 return pending;
}
if(process.argv.includes('--self-test')){
 const tag='v1.34.0',assetNames=['Windows-x64.zip','Windows-x64-Setup.exe','Android-arm64-v8a.apk','Android-x86_64.apk','SHA256.txt'],good={tag_name:tag,draft:false,prerelease:false,assets:assetNames.map(s=>({name:'houtu-studio-1.34.0-'+s,state:'uploaded',size:1,digest:'sha256:'+'a'.repeat(64)}))},old={...good,tag_name:'v1.33.0',assets:good.assets.map(a=>({...a,name:a.name.replace('1.34.0','1.33.0')}))},run={id:minimumRunId+1,head_branch:tag,status:'completed',conclusion:'failure',run_attempt:1,html_url:'https://github.com/'+repo+'/actions/runs/1'};
 assert.equal(pendingReleases([run],old,[],[],[])[0].reason,'failure');
 assert.equal(pendingReleases([run],old,[],[run.id+':1:failure'],[]).length,0);
 assert.equal(pendingReleases([run],good,[good],[],[tag]).length,0);
 assert.equal(pendingReleases([{...run,status:'in_progress'}],old,[],[],[]).length,0);
 assert.equal(pendingReleases([{...run,head_branch:'main'}],old,[],[],[]).length,0);
 assert.equal(pendingReleases([{...run,conclusion:'cancelled'}],old,[],[],[])[0].reason,'cancelled-needs-status');
 assert.equal(pendingReleases([{...run,conclusion:'success'}],old,[],[],[])[0].reason,'incomplete-release');
 assert.equal(pendingReleases([{...run,conclusion:'success'}],good,[good],[],[])[0].reason,'new-stable-needs-verification');
 assert.equal(pendingReleases([{...run,conclusion:'success'}],good,[good],[],[tag]).length,0);
 let retryClock=0,retryCalls=0;const retryOptions={deadline:3000,now:()=>retryClock,pause:ms=>retryClock+=ms,run:()=>{retryCalls++;if(retryCalls<3)throw Object.assign(Error('request failed'),{stderr:'unexpected EOF'});return 'ok';}};
 assert.equal(readGitHub(['api','user'],retryOptions),'ok');assert.equal(retryCalls,3);
 retryCalls=0;assert.throws(()=>readGitHub(['api','user'],{...retryOptions,run:()=>{retryCalls++;throw Object.assign(Error('request failed'),{stderr:'HTTP 401 Bad credentials'});}}),/request failed/);assert.equal(retryCalls,1);
 retryCalls=0;assert.throws(()=>readGitHub(['api','user'],{...retryOptions,run:()=>{retryCalls++;throw Object.assign(Error('request failed'),{stderr:'EOF'});}}),/request failed/);assert.equal(retryCalls,3);
 retryCalls=0;assert.throws(()=>readGitHub(['api','user'],{...retryOptions,deadline:retryClock+100,run:()=>retryCalls++}),/time budget/);assert.equal(retryCalls,0);
 console.log('PASS release precheck: failures, deduplication, superseded runs, cancellations, incomplete and new stable releases');process.exit(0);
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(pkg.name!=='anime-paint-studio'||!path.isAbsolute(root))throw Error('Unexpected project root');
process.chdir(root);const directory=path.join(root,'tmp','release-followup');await fs.mkdir(directory,{recursive:true});
const env={...process.env,TMP:path.join(root,'tmp'),TEMP:path.join(root,'tmp'),TMPDIR:path.join(root,'tmp'),GH_DEBUG:'',HTTPS_PROXY:process.env.HTTPS_PROXY||process.env.HTTP_PROXY||'http://127.0.0.1:7890'};
const deadline=Date.now()+50000,gh=args=>readGitHub(args,{deadline,run:(command,timeout)=>execFileSync('gh',command,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout,maxBuffer:8*1024*1024})});
if(JSON.parse(gh(['api','user'])).login!=='DOOM12138')throw Error('GitHub account differs from the authorised repository owner');
const runs=JSON.parse(gh(['api','repos/'+repo+'/actions/workflows/release.yml/runs?per_page=30'])).workflow_runs,stable=JSON.parse(gh(['api','repos/'+repo+'/releases/latest'])),releases=gh(['api','--paginate','repos/'+repo+'/releases?per_page=100','--jq','.[] | {tag_name,draft,prerelease,assets:[.assets[]|{name,state,size,digest}]}']).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
let handled={keys:[]};try{handled=JSON.parse(await fs.readFile(path.join(directory,'handled.json'),'utf8'));if(!Array.isArray(handled.keys))throw Error('Invalid handled receipt');}catch(e){if(e.code!=='ENOENT')throw e;}
let known=[];try{known=JSON.parse(await fs.readFile(path.join(root,'RELEASE_STATUS.json'),'utf8')).applications.map(r=>r.tag);}catch(e){if(e.code!=='ENOENT')throw e;}
const pending=pendingReleases(runs,stable,releases,handled.keys,known);
if(pending.length)await fs.writeFile(path.join(directory,'pending.json'),JSON.stringify({repository:repo,checkedAt:new Date().toISOString(),pending},null,2));
console.log('CINDY_PRECHECK_OK');console.log(JSON.stringify({repository:repo,pending:pending.length,latestPublished:stable.tag_name}));process.exit(pending.length?0:2);
