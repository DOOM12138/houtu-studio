// Runs only in the trusted repository's tag workflow. Never uploads local data.
import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';
import {buildPortable} from './build-portable.mjs';import {inspectUpdatePackage} from '../backend/update-package.mjs';
const root=path.resolve('.'),pkg=JSON.parse(await fs.readFile('package.json','utf8')),tag=process.env.GITHUB_REF_NAME,repository=process.env.GITHUB_REPOSITORY;
if(!repository||tag!=='v'+pkg.version)throw Error('Release tag must match package.json.');
const version=pkg.version,filename='houtu-studio-'+version+'-Windows-x64.zip',output=path.join(root,'release',filename),sum=path.join(root,'release','houtu-studio-'+version+'-SHA256.txt');
const run=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
const probe=spawnSync('gh',['release','view',tag,'--repo',repository,'--json','isDraft'],{encoding:'utf8',windowsHide:true});
if(probe.status===0&&!JSON.parse(probe.stdout).isDraft)throw Error('Published releases are immutable in this workflow. Use a new version tag.');
const result=await buildPortable({root,output,includePrompts:false,progress:console.log});
await fs.writeFile(sum,result.sha256+'  '+filename+'\n');
// Validate the actual ZIP using the same extraction and manifest checks as clients.
const extracted=path.join(root,'tmp','release-validation-'+version);
execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts','extract-update.ps1'),'-Archive',output,'-Destination',extracted],{windowsHide:true,stdio:'inherit'});
await inspectUpdatePackage(path.join(extracted,'厚涂小站'),version);
const changelog=await fs.readFile('CHANGELOG.md','utf8'),notes=changelog.split('## '+version+'\n')[1]?.split('\n## ')[0]?.trim();if(!notes)throw Error('Missing release notes.');
const notesFile=path.join(root,'tmp','release-notes.md');await fs.writeFile(notesFile,notes+'\n\nWindows x64：下载 ZIP 后解压，双击「启动网站.cmd」。已有 1.17+ 便携版可在「本机服务器 → 版本与更新」升级。\n');
if(probe.status!==0)run(['release','create',tag,'--repo',repository,'--draft','--verify-tag','--title','厚涂小站 '+version,'--notes-file',notesFile]);
run(['release','upload',tag,output,sum,'--repo',repository,'--clobber']);
const release=JSON.parse(run(['release','view',tag,'--repo',repository,'--json','isDraft,assets']));
if(!release.isDraft||!release.assets.some(a=>a.name===filename&&a.size===result.bytes)||!release.assets.some(a=>a.name===path.basename(sum)))throw Error('Release upload verification failed; draft retained.');
run(['release','edit',tag,'--repo',repository,'--draft=false','--latest','--notes-file',notesFile]);console.log(JSON.stringify(result));
