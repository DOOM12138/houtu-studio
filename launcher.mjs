import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, open, unlink } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { openBrowser } from './lib/platform.mjs';

import {useProjectEnvironment} from './lib/project-env.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
useProjectEnvironment(ROOT);
const DATA = path.join(ROOT, 'data');
const RECORD = path.join(DATA, 'server.json');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function registered() {
  try {
    const entry = JSON.parse(await readFile(RECORD, 'utf8'));
    if (!Number.isInteger(entry.port) || entry.port < 1024 || entry.port > 65535 || typeof entry.instanceId !== 'string') return null;
    const response = await fetch(`http://127.0.0.1:${entry.port}/api/health`, { signal: AbortSignal.timeout(1200) });
    const health = await response.json();
    return health.app === 'houtu-studio' && health.instanceId === entry.instanceId ? entry : null;
  } catch { return null; }
}
function processExists(pid) {
  if(!Number.isSafeInteger(pid)||pid<1)return false;
  try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}
}
async function available(port) {
  return new Promise(resolve => { const server = net.createServer(); server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true))); });
}
async function main() {
  await mkdir(DATA, { recursive: true });
  let existing = await registered();
  if (process.argv.includes('--stop')) {
    if (!existing) { console.log('本站未运行。'); return; }
    const origin = `http://127.0.0.1:${existing.port}`;
    const state = await (await fetch(origin + '/api/health', { signal: AbortSignal.timeout(3000) })).json();
    const response = await fetch(origin + '/api/shutdown', { method: 'POST', headers: { Origin: origin, 'X-Paint-CSRF': state.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceId: existing.instanceId }) });
    if (!response.ok) throw new Error('停止失败，请关闭正在运行的启动窗口。');
    const deadline=Date.now()+12000;
    while(Date.now()<deadline && (await registered() || processExists(existing.pid)))await wait(100);
    if(await registered() || processExists(existing.pid))throw new Error('网站进程尚未完全退出，请稍后重试，暂时不要覆盖运行文件。');
    console.log('厚涂小站已停止。'); return;
  }
  const show = !process.argv.includes('--no-open');
  if (existing) { console.log(`http://127.0.0.1:${existing.port}`); if (show) openBrowser(existing.port); return; }
  const lockFile = path.join(DATA, 'launch.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    for (let i = 0; i < 50; i++) { await wait(200); existing = await registered(); if (existing) { console.log(`http://127.0.0.1:${existing.port}`); if (show) openBrowser(existing.port); return; } }
    // A lock left by a crashed launcher is a single known file, never a directory tree.
    try { await unlink(lockFile); } catch {}
    throw new Error('上次启动未完成，已清理启动标记，请再双击启动一次。');
  }
  try {
    const index = process.argv.indexOf('--port');
    const preferred = index >= 0 ? Number(process.argv[index + 1]) : 4317;
    if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65400) throw new Error('启动端口无效。');
    let selected;
    for (let port = preferred; port < preferred + 100; port++) if (await available(port)) { selected = port; break; }
    if (!selected) throw new Error('没有可用的本机端口。');
    const stdout = openSync(path.join(DATA, 'server.log'), 'a');
    const stderr = openSync(path.join(DATA, 'server-error.log'), 'a');
    const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(selected) }, detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr] });
    closeSync(stdout); closeSync(stderr);
    child.on('error', () => {}); child.unref();
    for (let i = 0; i < 100; i++) { await wait(150); existing = await registered(); if (existing) break; }
    if (!existing) throw new Error('网站启动失败，请查看 data/server-error.log。');
    console.log(`http://127.0.0.1:${existing.port}`); if (show) openBrowser(existing.port);
  } finally { await lock.close(); try { await unlink(lockFile); } catch {} }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
