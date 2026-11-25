import {ensureDesktopRuntime,DESKTOP_RUNTIME_FILES} from './build-desktop.mjs';
import {SR_MODELS} from '../public/superres-options.js';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, cp, copyFile, readdir, lstat, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { projectEnvironment } from '../lib/project-env.mjs';
import { powershell } from '../lib/platform.mjs';
import { importTemplates } from '../lib/templates.mjs';
import { normalizePreset } from '../backend/color.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ALLOWED = ['server.mjs', 'launcher.mjs', 'lib', 'public', 'frontend', 'backend', 'models', 'scripts', 'vendor-licenses', 'package.json', 'package-lock.json', 'README.md', 'DEPLOY.md', 'SOURCES.md', 'AGENTS.md', 'agent.md', 'ARCHITECTURE.md', 'GIT_WORKFLOW.md', 'FEATURES.md', 'FEATURE_PARITY.md', 'PROMPT_LAB.md', 'CHANGELOG.md', 'LICENSE', '.npmrc', '开发终端.cmd', '启动网站.cmd', '停止网站.cmd', '一键部署.cmd', '启动服务器.cmd', '服务器管理.cmd', '停止服务器.cmd', '检查更新.cmd', '回退版本.cmd'];
export function productionDirectories(lock) {
  return Object.entries(lock.packages || {}).filter(([name, entry]) => name.startsWith('node_modules/') && !entry.dev).map(([name]) => name)
    .sort((a,b) => a.length - b.length).filter((name, i, all) => !all.slice(0, i).some(parent => name.startsWith(parent + '/')));
}
async function exists(file) { try { await stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function inventory(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error('便携包不接受符号链接。');
    if (info.isDirectory()) files.push(...await inventory(absolute, base));
    else files.push({ path: path.relative(base, absolute).split(path.sep).join('/'), bytes: info.size, sha256: await hashFile(absolute) });
  }
  return files;
}
async function hashFile(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
export async function buildPortable({ root = ROOT, output, includePrompts = false, progress = () => {} } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('此打包器需要在 Windows x64 上运行。');
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  output ||= path.join(root, 'release', `厚涂小站-${metadata.version}-Windows-x64-${randomUUID().slice(0,8)}.zip`);
  output = path.resolve(output);
  if (path.extname(output).toLowerCase() !== '.zip' || await exists(output)) throw new Error('请选择尚不存在的 ZIP 输出文件。');
  const temporaryBase = path.resolve(root, 'tmp');
  const environment = projectEnvironment(root);
  const temporary = path.join(temporaryBase, `houtu-pack-${randomUUID()}`);
  const app = path.join(temporary, '厚涂小站');
  await mkdir(app, { recursive: true });
  try {
    progress('正在整理网站文件');
    for (const file of ALLOWED) await cp(path.join(root, file), path.join(app, file), { recursive: true, dereference: false });
    if(await hashFile(path.join(app,'models','selfie_multiclass_256x256.tflite'))!=='c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0')throw new Error('内置人物模型校验失败，已取消打包。');
    for(const [name,expected]of Object.entries({'face_landmarker.task':'64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff','hand_landmarker.task':'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'}))if(await hashFile(path.join(app,'models',name))!==expected)throw Error('部位模型校验失败：'+name);
    for(const model of SR_MODELS)if(await hashFile(path.join(app,'models/superres',model.file))!==model.sha256)throw Error('内置超分模型校验失败：'+model.id);
    progress('正在加入独立桌面程序和免安装运行环境');
    await ensureDesktopRuntime(root);
    await mkdir(path.join(app, 'runtime'));
    await copyFile(process.execPath, path.join(app, 'runtime', 'node.exe'));
    for(const file of DESKTOP_RUNTIME_FILES)await copyFile(path.join(root,'runtime',file),path.join(app,'runtime',file));
    await copyFile(path.join(root,'runtime/desktop-build.json'),path.join(app,'runtime/desktop-build.json'));
    await cp(path.join(root,'vendor-licenses/desktop'),path.join(app,'vendor-licenses/desktop'),{recursive:true});
    const licenses = [path.join(root, 'runtime', 'LICENSE.txt'), path.join(root, 'vendor-licenses', 'node-LICENSE.txt'), path.join(path.dirname(process.execPath), 'LICENSE'), path.join(path.dirname(process.execPath), 'LICENSE.txt')];
    const license = (await Promise.all(licenses.map(async file => await exists(file) ? file : null))).find(Boolean);
    if (!license) throw new Error('缺少 Node.js 许可文件，无法生成完整便携包。');
    await copyFile(license, path.join(app, 'runtime', 'LICENSE.txt'));
    const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
    const dependencies = [];
    for (const relative of productionDirectories(lock)) {
      if(relative.startsWith('node_modules/@openai/codex'))continue;
      if (!await exists(path.join(root, relative))) continue; // Other OS/CPU optional packages.
      await cp(path.join(root, relative), path.join(app, relative), { recursive: true, dereference: false, filter:source=>{if(relative!=='node_modules/onnxruntime-node')return true;const parts=path.relative(path.join(root,relative),source).split(path.sep);if(parts[0]!=='bin'||parts[1]!=='napi-v6'||parts.length<3)return true;return parts[2]==='win32'&&(parts.length<4||parts[3]==='x64');} });
      const pkg = JSON.parse(await readFile(path.join(root, relative, 'package.json'), 'utf8'));
      dependencies.push({ name: pkg.name, version: pkg.version, license: pkg.license || 'See bundled package license' });
    }
    for (const required of ['runtime/codex-app-server.exe','runtime/codex-code-mode-host.exe', 'node_modules/libraw-wasm/dist/libraw.js','node_modules/libraw-wasm/dist/libraw.wasm','vendor-licenses/raw/LibRaw-0.22.1.tar.gz','vendor-licenses/raw/LibRaw-LICENSE.CDDL.txt','node_modules/sharp/package.json','node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node','node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll','vendor-licenses/onnxruntime-1.31.1/LICENSE','vendor-licenses/directml-1.15.4/LICENSE.txt','vendor-licenses/dxc-1.8.2502.8/LICENSE-LLVM.txt']) if (!await exists(path.join(app, required))) throw new Error('缺少 Windows x64 生产依赖，请先完成 npm install。');
    const nativeFiles = await readdir(path.join(app, 'node_modules', '@img', 'sharp-win32-x64', 'lib'));
    if (!nativeFiles.some(name => name.endsWith('.node')) || !nativeFiles.some(name => name.endsWith('.dll'))) throw new Error('缺少图片处理的原生模块或 DLL。');
    let templateCount = 0;
    if (includePrompts) {
      const templatesFile = path.join(root, 'data', 'prompts.json');
      if (await exists(templatesFile)) {
        const templates = importTemplates(JSON.parse(await readFile(templatesFile, 'utf8')));
        await mkdir(path.join(app, 'defaults'));
        await writeFile(path.join(app, 'defaults', 'prompts.json'), JSON.stringify({ schemaVersion: 1, templates }, null, 2));
        templateCount = templates.length;
      }
      const colorFile=path.join(root,'data','color-presets.json');
      if(await exists(colorFile)){
        const saved=JSON.parse(await readFile(colorFile,'utf8'));
        const presets=saved.presets.slice(0,100).map(normalizePreset);
        await mkdir(path.join(app,'defaults'),{recursive:true});
        await writeFile(path.join(app,'defaults','color-presets.json'),JSON.stringify({schemaVersion:1,presets},null,2));
      }
    }
    await writeFile(path.join(app, 'THIRD-PARTY-NOTICES.txt'), [
      'This distribution includes Node.js and the production npm packages listed below.',
      'Node.js license and third-party notices are in runtime/LICENSE.txt.',
      'Codex app-server + code-mode host 0.172.0: Apache-2.0 and component notices, including MIT/BSD V8 and Unicode ICU, in vendor-licenses/code-mode-host/.',
      'Local super-resolution: official Real-ESRGAN checkpoints converted to ONNX; BSD-3-Clause and provenance in models/superres/.',
      'ONNX Runtime 1.31.1 MIT and full third-party notices: vendor-licenses/onnxruntime-1.31.1/.',
      'Bundled Windows DirectML 1.15.4 is under Microsoft Software License Terms, with additional code notices: vendor-licenses/directml-1.15.4/.',
      'Bundled DXC 1.8.2502.8 LLVM/MIT/Microsoft notices: vendor-licenses/dxc-1.8.2502.8/.',
      'Individual package licenses and notices are preserved in their node_modules directories.',
      'MediaPipe model card and license: models/model-card.pdf and models/LICENSE.txt. Model source and SHA-256 are recorded in models/README.md.',
      '', ...dependencies.map(dep => `${dep.name} ${dep.version} — ${dep.license}`), '',
    ].join('\n'));
    const files = await inventory(app);
    if (files.some(file => /^(data|backups|test|\.git|\.impeccable)\//i.test(file.path) || /(^|\/)(auth\.json|\.env|config\.toml)$/i.test(file.path) || /\.log$/i.test(file.path))) throw new Error('包内出现不应发布的私有数据，已取消打包。');
    await writeFile(path.join(app, 'portable-manifest.json'), JSON.stringify({ schemaVersion: 2, updaterCompatibility: 1, dataCompatibility: 1, app: 'houtu-studio', version: metadata.version, platform: 'win32-x64', nodeVersion: process.version, created: new Date().toISOString(), templatesIncluded: templateCount, dependencies, files }, null, 2));
    progress('正在压缩便携包');
    await mkdir(path.dirname(output), { recursive: true });
    await new Promise((resolve, reject) => {
      const child = spawn(powershell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'archive.ps1'), '-Source', temporary, '-Destination', output], { cwd:root, env:environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.resume(); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('ZIP 压缩失败，请检查磁盘空间和目录权限。')));
    });
    const bytes = (await stat(output)).size;
    return { file: output, bytes, sha256: await hashFile(output), files: files.length + 1, templates: templateCount, version: metadata.version };
  } finally {
    const relative = path.relative(temporaryBase, temporary);
    if (!relative || path.isAbsolute(relative) || relative.startsWith('..') || !/^houtu-pack-[a-f0-9-]+$/.test(relative)) throw new Error('临时目录校验失败，已保留目录。');
    await rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output');
  try {
    const result = await buildPortable({ output: outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined, includePrompts: process.argv.includes('--include-prompts'), progress: message => console.log(JSON.stringify({ type: 'progress', message })) });
    console.log(JSON.stringify({ type: 'done', ...result }));
  } catch (error) { console.error(JSON.stringify({ type: 'error', message: error.message })); process.exitCode = 1; }
}
