import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(pkg.name!=='anime-paint-studio'||!path.isAbsolute(root))throw Error('Unexpected project root');
process.chdir(root);
const directory=path.join(root,'tmp','release-followup');
await fs.mkdir(directory,{recursive:true});
const env={...process.env,TMP:path.join(root,'tmp'),TEMP:path.join(root,'tmp'),TMPDIR:path.join(root,'tmp'),HTTPS_PROXY:process.env.HTTPS_PROXY||process.env.HTTP_PROXY||'http://127.0.0.1:7890'};
const gh=args=>JSON.parse(execFileSync('gh',args,{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024}));
const who=gh(['api','user']);if(who.login!=='DOOM12138')throw Error('GitHub account differs from the authorised repository owner');
const repo='DOOM12138/houtu-studio',runs=gh(['api','repos/'+repo+'/actions/workflows/release.yml/runs?per_page=30']).workflow_runs;
const stable=gh(['api','repos/'+repo+'/releases/latest']);
const sem=v=>/^v(\d+)\.(\d+)\.(\d+)$/.exec(v||'')?.slice(1).map(Number);
const cmp=(a,b)=>{for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
const complete=r=>!r.draft&&!r.prerelease&&['Windows-x64.zip','Windows-x64-Setup.exe','Android-arm64-v8a.apk','Android-x86_64.apk','SHA256.txt'].every(s=>r.assets?.some(a=>a.name==='houtu-studio-'+r.tag_name.slice(1)+'-'+s&&a.state==='uploaded'&&a.size>0&&/^sha256:[a-f0-9]{64}$/.test(a.digest||'')));
let handled={keys:[]};try{handled=JSON.parse(await fs.readFile(path.join(directory,'handled.json'),'utf8'));if(!Array.isArray(handled.keys))throw Error('Invalid handled receipt');}catch(e){if(e.code!=='ENOENT')throw e;}
const pending=[];
for(const run of runs){
 if(run.id<45753504909||run.status!=='completed')continue;
 const version=sem(run.head_branch);if(!version)continue;
 const key=run.id+':'+run.run_attempt+':'+run.conclusion;if(handled.keys.includes(key))continue;
 if(sem(stable.tag_name)&&cmp(sem(stable.tag_name),version)>=0&&complete(stable))continue;
 if(['failure','timed_out','action_required','startup_failure'].includes(run.conclusion))pending.push({key,runId:run.id,attempt:run.run_attempt,tag:run.head_branch,reason:run.conclusion,url:run.html_url});
 else if(run.conclusion==='success'){
  const release=gh(['api','repos/'+repo+'/releases/tags/'+run.head_branch]);
  if(!complete(release))pending.push({key,runId:run.id,attempt:run.run_attempt,tag:run.head_branch,reason:'incomplete-release',url:run.html_url});
 }
}
if(pending.length)await fs.writeFile(path.join(directory,'pending.json'),JSON.stringify({repository:repo,checkedAt:new Date().toISOString(),pending},null,2));
console.log('CINDY_PRECHECK_OK');
console.log(JSON.stringify({repository:repo,pending:pending.length,latestPublished:stable.tag_name}));
process.exit(pending.length?0:2);
