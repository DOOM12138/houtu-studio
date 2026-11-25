// Runs only in the trusted repository's tag workflow. Never uploads local data.
import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildPortable} from './build-portable.mjs';import {inspectUpdatePackage} from '../backend/update-package.mjs';
const root=path.resolve('.'),pkg=JSON.parse(await fs.readFile('package.json','utf8')),tag=process.env.GITHUB_REF_NAME,repository=process.env.GITHUB_REPOSITORY;
if(!repository||tag!=='v'+pkg.version)throw Error('Release tag must match package.json.');
const version=pkg.version,filename='houtu-studio-'+version+'-Windows-x64.zip',output=path.join(root,'release',filename),sum=path.join(root,'release','houtu-studio-'+version+'-SHA256.txt');
const run=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
const probe=spawnSync('gh',['release','view',tag,'--repo',repository,'--json','isDraft'],{encoding:'utf8',windowsHide:true});
if(probe.status===0&&!JSON.parse(probe.stdout).isDraft)throw Error('Published releases are immutable in this workflow. Use a new version tag.');
const result=await buildPortable({root,output,includePrompts:false,progress:console.log});
const android=await Promise.all(['arm64-v8a','x86_64'].map(async abi=>{const name='houtu-studio-'+version+'-Android-'+abi+'.apk',file=path.join(root,'release',name),bytes=await fs.readFile(file);if(bytes.length<10000||bytes.length>1024**3)throw Error('Android APK size invalid.');return {name,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}));
await fs.writeFile(sum,[result.sha256+'  '+filename,...android.map(a=>a.sha256+'  '+a.name)].join('\n')+'\n');
// Validate the actual ZIP using the same extraction and manifest checks as clients.
const extracted=path.join(root,'tmp','release-validation-'+version);
execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts','extract-update.ps1'),'-Archive',output,'-Destination',extracted],{windowsHide:true,stdio:'inherit'});
await inspectUpdatePackage(path.join(extracted,'厚涂小站'),version);
const changelog=await fs.readFile('CHANGELOG.md','utf8'),notes=changelog.split('## '+version+'\n')[1]?.split('\n## ')[0]?.trim();if(!notes)throw Error('Missing release notes.');
const notesFile=path.join(root,'tmp','release-notes.md');await fs.writeFile(notesFile,notes+'\n\nWindows x64：下载 ZIP 后解压，双击「启动网站.cmd」。已有 1.17+ 便携版可在「本机服务器 → 版本与更新」升级。\n\nAndroid 10+：普通64位手机选择 Android-arm64-v8a.apk；x86_64 是对应架构版本。安装后在手机独立运行，无需电脑；应用内「更多 → 检查安卓版更新」可校验并自行升级。\n');
if(probe.status!==0)run(['release','create',tag,'--repo',repository,'--draft','--verify-tag','--title','厚涂小站 '+version,'--notes-file',notesFile]);
run(['release','upload',tag,output,sum,...android.map(a=>a.file),'--repo',repository,'--clobber']);
const release=JSON.parse(run(['release','view',tag,'--repo',repository,'--json','isDraft,assets']));
if(!release.isDraft||!release.assets.some(a=>a.name===filename&&a.size===result.bytes)||!release.assets.some(a=>a.name===path.basename(sum))||!android.every(apk=>release.assets.some(a=>a.name===apk.name&&a.size===apk.bytes)))throw Error('Release upload verification failed; draft retained.');
run(['release','edit',tag,'--repo',repository,'--draft=false','--latest','--notes-file',notesFile]);console.log(JSON.stringify(result));
