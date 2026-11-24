import path from 'node:path';
import { spawn } from 'node:child_process';
export function powershell() { return path.join(process.env.SystemRoot || process.env.WINDIR || 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); }
export function openBrowser(port, page = '/') {
  if (process.platform !== 'win32') return;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('本机端口无效。');
  if(!['/','/server/','/server/#software-updates'].includes(page))throw new Error('页面地址无效。');
  spawn(powershell(), ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Start-Process 'http://127.0.0.1:${port}${page}'`], { windowsHide: true, stdio: 'ignore' }).unref();
}
