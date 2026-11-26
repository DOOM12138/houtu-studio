import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server.mjs';
import { decodeImage, paintingPrompt, normalizeEditOptions } from '../lib/painting.mjs';
import { prepareEditImage, finishEditImage } from '../lib/images.mjs';
import { PRESETS } from '../public/catalog.js';
import { largeJpegFixture } from './fixtures.mjs';
import { clientEnvironment } from '../lib/codex.mjs';

const fixtureBytes = await sharp({ create: { width: 256, height: 320, channels: 3, background: '#c8b9a4' } }).png().toBuffer();
const pixel = fixtureBytes.toString('base64');
const image = `data:image/png;base64,${pixel}`;

class FakeBridge extends EventEmitter {
  signedIn = false;
  async account() { return this.signedIn ? { email: 'test@example.invalid', plan: 'plus' } : null; }
  async login() { return { authUrl: 'https://auth.openai.com/authorize?state=test', loginId: 'login-test' }; }
  async logout() { this.signedIn = false; }
  async begin(job, prompt, inputPath, contextPath) { this.job = job; this.prompt = prompt; this.inputPath = inputPath; this.contextPath = contextPath; job.threadId = 'thread-test'; job.turnId = 'turn-test'; }
  async cancel(job) { this.emit('notification', 'turn/completed', { threadId: job.threadId, turn: { id: job.turnId, status: 'interrupted' } }); }
  stop() {}
}

async function setup(t, extra = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'paint-test-'));
  const bridge = new FakeBridge();
  const app = await createApp({ directory, bridge, ...extra });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const state = await (await fetch(origin + '/api/state')).json();
  const post = async (url, body = {}) => fetch(origin + url, { method: 'POST',
    headers: { Origin: origin, 'X-Paint-CSRF': state.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { app, directory, bridge, origin, post };
}

const input = { image, prompt: '二次元厚涂，保留角色。', strength: 'light', preserve: true };
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
async function waitJob(origin,id,status){for(let i=0;i<150;i++){const j=await(await fetch(origin+'/api/jobs/'+id)).json();if(j.status===status)return j;await new Promise(r=>setTimeout(r,20));}throw Error('Job did not reach '+status);}

test('custom prompts preserve user text and do not add preset or style instructions', () => {
  const text = '只整理发梢，保持原有毛绒质感。' + '细节自然。'.repeat(310);
  const prompt = paintingPrompt({ ...input, prompt: text, promptMode: 'custom' });
  assert.ok(prompt.endsWith(text)); assert.ok(!prompt.includes('当前功能：'));
  assert.throws(() => paintingPrompt({ ...input, prompt: '字'.repeat(6001) }));
});

test('prompt templates support save, update, atomic import, deletion and restart persistence', async t => {
  const { post, origin, directory, app } = await setup(t);
  const initial = await (await fetch(origin + '/api/templates')).json();
  assert.equal(initial.templates.length, 3);
  const value = { name: '我的手部修复', text: '只修正手指衔接，不改变动作。', options: { operation: 'hands', style: 'cos', promptMode: 'custom' } };
  const saved = await (await post('/api/templates/save', { template: value })).json();
  assert.equal(saved.template.options.promptMode, 'custom');
  assert.equal((await post('/api/templates/save', { id: saved.template.id, template: { ...value, text: '只整理手指边缘。' } })).status, 200);
  assert.equal((await post('/api/templates/import', { templates: [{ name: 'invalid', text: '' }] })).status, 400);
  const imported = await (await post('/api/templates/import', { templates: [value, value] })).json();
  assert.equal(imported.added, 1);
  assert.equal((await post(`/api/templates/${initial.templates[0].id}/delete`)).status, 200);
  await app.close();
  const reopened = await createApp({ directory, bridge: new FakeBridge() });
  await new Promise(resolve => reopened.server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${reopened.server.address().port}`;
    const all = await (await fetch(base + '/api/templates')).json();
    assert.equal(all.templates.length, 4);
    assert.equal(all.templates.find(item => item.id === saved.template.id).text, '只整理手指边缘。');
  } finally { await reopened.close(); }
});

test('portable build route reports progress, blocks duplicate jobs, and streams completed archive', async t => {
  let options;
  const builder = async input => {
    options = input; input.progress('测试压缩中'); await new Promise(resolve => setTimeout(resolve, 100));
    await mkdir(path.dirname(input.output), { recursive: true }); await writeFile(input.output, Buffer.from('PK-test-only'));
    return { bytes: 12, sha256: 'test-only' };
  };
  const { post, origin } = await setup(t, { packageBuilder: builder });
  const packageJob = await (await post('/api/packages', { includePrompts: true })).json();
  assert.equal(packageJob.status, 'building');
  assert.equal((await post('/api/packages', { includePrompts: false })).status, 409);
  assert.equal((await post('/api/jobs', input)).status, 409);
  await new Promise(resolve => setTimeout(resolve, 150));
  const ready = await (await fetch(origin + `/api/packages/${packageJob.id}`)).json();
  assert.equal(ready.status, 'done'); assert.equal(options.includePrompts, true);
  const archive = await fetch(origin + ready.downloadUrl);
  assert.equal(archive.headers.get('content-type'), 'application/zip');
  assert.equal(await archive.text(), 'PK-test-only');
});

test('upload rejects SVG and mismatched raster bytes; prompts retain anime and restraint', () => {
  assert.throws(() => decodeImage('data:image/svg+xml;base64,PHN2Zy8+'));
  assert.throws(() => decodeImage('data:image/png;base64,' + Buffer.from('not an image at all').toString('base64')));
  assert.equal(decodeImage(image).extension, 'png');
  assert.throws(() => paintingPrompt({ strength: 'unknown' }));
  assert.throws(() => paintingPrompt({ prompt: ' ' }));
  assert.match(paintingPrompt(input), /轻度厚涂/);
  assert.match(paintingPrompt(input), /角色身份/);
});

test('child environment excludes inherited API keys and managed credentials', () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-not-a-key';
  const env = clientEnvironment('/isolated-test-home');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.CODEX_HOME, '/isolated-test-home');
  if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
});

test('mutations require same-origin and CSRF; private files cannot be read', async t => {
  const { origin } = await setup(t);
  assert.equal((await fetch(origin + '/api/login', { method: 'POST', headers: { Origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await fetch(origin + '/data/codex/auth.json')).status, 404);
  assert.equal((await fetch(origin + '/images/../data/codex/auth.json')).status, 404);
});

test('login opens official authorization; upload cannot generate while signed out', async t => {
  const { post } = await setup(t);
  assert.equal((await post('/api/jobs', input)).status, 401);
  const result = await (await post('/api/login')).json();
  assert.equal(new URL(result.authUrl).hostname, 'auth.openai.com');
  // A rejected job must release the reservation.
  assert.equal((await post('/api/jobs', input)).status, 401);
});

test('job stores actual image event, blocks duplicates, and serves a download', async t => {
  const { bridge, directory, post, origin } = await setup(t);
  bridge.signedIn = true;
  const response = await post('/api/jobs', input);
  assert.equal(response.status, 202);
  const job = await response.json();
  assert.equal((await post('/api/jobs', input)).status, 409);
  const output = path.join(directory, 'codex', 'generated_images', 'result.png');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(pixel, 'base64'));
  bridge.emit('notification', 'item/completed', { threadId: 'thread-test', item: { type: 'imageGeneration', status: 'completed', savedPath: output } });
  bridge.emit('notification', 'turn/completed', { threadId: 'thread-test', turn: { status: 'completed' } });
  await waitJob(origin,job.id,'done');
  const done = await (await fetch(origin + `/api/jobs/${job.id}`)).json();
  assert.equal(done.status, 'done');
  const download = await fetch(origin + done.outputUrl + '?download=1');
  assert.match(download.headers.get('content-disposition'), /attachment/);
  const downloaded = Buffer.from(await download.arrayBuffer());
  assert.deepEqual(await sharp(downloaded).raw().toBuffer(), await sharp(fixtureBytes).raw().toBuffer());
});

test('all 75 tools have distinct compiled tasks and full-person editing does not crop to a face', () => {
  assert.equal(PRESETS.length, 75);
  for (const preset of PRESETS) assert.ok(paintingPrompt({ ...input, operation: preset.id }).includes(`当前功能：${preset.name}`));
  const prompt = paintingPrompt({ ...input, operation: 'full-body', areas: ['hair', 'hands', 'outfit'] });
  assert.match(prompt, /不把结果裁成头像/);
  assert.match(prompt, /手指/); assert.match(prompt, /服装褶皱/);
  assert.throws(() => normalizeEditOptions({ ...input, operation: 'full-body', areas: [] }));
  assert.throws(() => normalizeEditOptions({ ...input, style: 'fake-style' }));
  assert.throws(() => normalizeEditOptions({ ...input, selection: { x: .9, y: 0, width: .5, height: .5 } }));
});

test('local edit preserves every pixel outside the rectangle and retains original dimensions', async () => {
  const prepared = await prepareEditImage(fixtureBytes, { x: .25, y: .25, width: .5, height: .5 });
  const green = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#00aa44' } }).png().toBuffer();
  const composite = await finishEditImage(green, prepared.source, prepared.region);
  const before = await sharp(prepared.source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(composite).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(after.info.width, 256); assert.equal(after.info.height, 320);
  for (let y = 0; y < 320; y++) for (let x = 0; x < 256; x++) {
    if (x >= 64 && x < 192 && y >= 80 && y < 240) continue;
    const index = (y * 256 + x) * 4;
    assert.ok(before.data.subarray(index, index + 4).equals(after.data.subarray(index, index + 4)), `outside pixel changed at ${x},${y}`);
  }
  const center = (160 * 256 + 128) * 4;
  assert.deepEqual([...after.data.subarray(center, center + 3)], [0,170,68]);
  await assert.rejects(() => prepareEditImage(fixtureBytes, { x: 0, y: 0, width: .1, height: .1 }), /64/);
});

test('a local job sends a crop plus full-image reference and persists full-image output and options', async t => {
  const { bridge, post, origin } = await setup(t);
  bridge.signedIn = true;
  const job = await (await post('/api/jobs', { ...input, operation: 'eyes', style: 'cos', selection: { x: .25, y: .25, width: .5, height: .5 } })).json();
  assert.equal(job.operation, 'eyes'); assert.equal(job.style, 'cos');
  assert.match(bridge.inputPath, /input\.png$/); assert.match(bridge.contextPath, /source\.png$/);
  assert.match(bridge.prompt, /图1是待编辑的局部裁片/);
  bridge.emit('notification', 'item/completed', { threadId: 'thread-test', item: { type: 'imageGeneration', status: 'completed', result: pixel } });
  bridge.emit('notification', 'turn/completed', { threadId: 'thread-test', turn: { status: 'completed' } });
  await waitJob(origin,job.id,'done');
  const result = await (await fetch(origin + `/api/jobs/${job.id}`)).json();
  assert.equal(result.status, 'done');
  const bytes = Buffer.from(await (await fetch(origin + result.outputUrl)).arrayBuffer());
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.width, 256); assert.equal(meta.height, 320);
  const next = await (await post('/api/jobs', { ...input, parentId: job.id, operation: 'hair' })).json();
  assert.equal(next.parentId, job.id);
});

test('a text-only turn is failure, never a fake painting', async t => {
  const { bridge, post, origin } = await setup(t);
  bridge.signedIn = true;
  const job = await (await post('/api/jobs', input)).json();
  bridge.emit('notification','item/completed',{threadId:'thread-test',item:{type:'agentMessage',text:'绘图工具无法启动，请检查执行组件。'}});
  bridge.emit('notification', 'turn/completed', { threadId: 'thread-test', turn: { status: 'completed' } });
  const result = await waitJob(origin,job.id,'error');
  assert.equal(result.status, 'error');
  assert.equal(result.outputUrl, null);
  const failureReceipt=await(await fetch(origin+'/api/jobs/'+job.id)).json();assert.match(failureReceipt.message,/执行组件/);
});

test('cancel interrupts the turn and releases the active generation', async t => {
  const { bridge, post, origin } = await setup(t);
  bridge.signedIn = true;
  const job = await (await post('/api/jobs', input)).json();
  assert.equal((await post(`/api/jobs/${job.id}/cancel`)).status, 200);
  const result = await waitJob(origin,job.id,'cancelled');
  assert.equal(result.status, 'cancelled');
  const workflow=await (await fetch(origin+'/api/workflows/'+job.workflowId)).json();
  assert.notEqual(workflow.steps.find(s=>s.id==='generate').status,'running');
  assert.equal((await post('/api/jobs', input)).status, 202);
});

test('restart preserves completed work and marks an unfinished generation interrupted', async t => {
  const { app, bridge, directory, post,origin:beforeRestartOrigin } = await setup(t);
  bridge.signedIn = true;
  const done = await (await post('/api/jobs', input)).json();
  bridge.emit('notification', 'item/completed', { threadId: 'thread-test', item: { type: 'imageGeneration', status: 'completed', result: pixel } });
  bridge.emit('notification', 'turn/completed', { threadId: 'thread-test', turn: { status: 'completed' } });
  await waitJob(beforeRestartOrigin,done.id,'done');
  const unfinished = await (await post('/api/jobs', input)).json();
  await app.close();
  const restarted = await createApp({ directory, bridge: new FakeBridge() });
  await new Promise(resolve => restarted.server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${restarted.server.address().port}`;
    const history = await (await fetch(origin + '/api/jobs')).json();
    assert.equal(history.jobs.find(j => j.id === done.id).status, 'done');
    assert.equal(history.jobs.find(j => j.id === unfinished.id).status, 'error');
    assert.match(history.jobs.find(j => j.id === unfinished.id).message, /重启/);
    const result = history.jobs.find(j => j.id === done.id);
    assert.equal((await fetch(origin + result.outputUrl)).status, 200);
  } finally { await restarted.close(); }
});

test('large normalized PNG sources and results can be reused by local reference without reupload', async t => {
  const { bridge, post, origin } = await setup(t);
  bridge.signedIn = true;
  const jpeg = await largeJpegFixture();
  assert.ok(jpeg.length < 12 * 1024 * 1024);
  const upload = await post('/api/jobs', { ...input, image: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
  assert.equal(upload.status, 202);
  const first = await upload.json();
  const png = await readFile(bridge.inputPath);
  assert.ok(png.length > 12 * 1024 * 1024);
  bridge.emit('notification', 'item/completed', { threadId: 'thread-test', item: { type: 'imageGeneration', status: 'completed', result: png.toString('base64') } });
  bridge.emit('notification', 'turn/completed', { threadId: 'thread-test', turn: { status: 'completed' } });
  let done;
  for (let n = 0; n < 100; n++) {
    done = await (await fetch(origin + `/api/jobs/${first.id}`)).json();
    if (done.status === 'done' || done.status === 'error') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(done.status, 'done');
  // Completed pixels can be visible while the server is finishing its private
  // bookkeeping. Wait for the public idle boundary before starting another job.
  const idle = async () => {
    for (let n = 0; n < 100; n++) {
      if (!(await (await fetch(origin + '/api/health')).json()).busy) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail('server did not become idle after a completed or cancelled image');
  };
  for (const kind of ['source', 'result']) {
    await idle();
    const { image: ignored, ...options } = input;
    const response = await post('/api/jobs', { ...options, source: { jobId: first.id, kind } });
    assert.equal(response.status, 202);
    const next = await response.json();
    assert.equal(next.imageWidth, 2600); assert.equal(next.imageHeight, 2600);
    if (kind === 'result') assert.equal(next.parentId, first.id);
    await post(`/api/jobs/${next.id}/cancel`); await settle();
  }
  const { image: ignored, ...options } = input;
  assert.equal((await post('/api/jobs', { ...options, source: { jobId: '../private', kind: 'result' } })).status, 400);
  assert.equal((await post('/api/jobs', { ...options, source: { jobId: first.id, kind: '../auth.json' } })).status, 400);
});

test('style level survives the actual job, workflow input and service restart; legacy jobs inherit compatible levels',async t=>{
  const {bridge,directory,post,origin,app}=await setup(t);bridge.signedIn=true;
  const response=await post('/api/jobs',{...input,prompt:'保留人物身份。',style:'cos',strength:'light',paintLevel:9});
  assert.equal(response.status,202);const job=await response.json();assert.equal(job.paintLevel,9);
  assert.match(bridge.prompt,/厚涂程度9\/10/);
  const flow=await(await fetch(origin+'/api/workflows/'+job.workflowId)).json();
  assert.equal(flow.steps.find(x=>x.id==='source').output.options.paintLevel,9);
  bridge.emit('notification','item/completed',{threadId:'thread-test',item:{type:'imageGeneration',status:'completed',result:pixel}});
  bridge.emit('notification','turn/completed',{threadId:'thread-test',turn:{status:'completed'}});
  await waitJob(origin,job.id,'done');
  const photoResponse=await post('/api/jobs',{...input,prompt:'自然整理皮肤。',style:'photo',paintLevel:10});
  assert.equal(photoResponse.status,202);const photo=await photoResponse.json();assert.equal(photo.style,'photo');
  assert.match(bridge.prompt,/非厚涂摄影精修/);assert.doesNotMatch(bridge.prompt,/厚涂程度\d+\/10/);
  bridge.emit('notification','item/completed',{threadId:'thread-test',item:{type:'imageGeneration',status:'completed',result:pixel}});
  bridge.emit('notification','turn/completed',{threadId:'thread-test',turn:{status:'completed'}});
  await waitJob(origin,photo.id,'done');
  await app.close();
  const photoFile=path.join(directory,'jobs',photo.id,'job.json');
  const legacy=JSON.parse(await readFile(photoFile,'utf8'));delete legacy.paintLevel;legacy.strength='balanced';
  await writeFile(photoFile,JSON.stringify(legacy));
  const restarted=await createApp({directory,bridge:new FakeBridge()});await new Promise(r=>restarted.server.listen(0,'127.0.0.1',r));
  try{const url='http://127.0.0.1:'+restarted.server.address().port;
    const restored=await(await fetch(url+'/api/jobs/'+job.id)).json();assert.equal(restored.paintLevel,9);assert.equal(restored.style,'cos');
    const restoredLegacy=await(await fetch(url+'/api/jobs/'+photo.id)).json();assert.equal(restoredLegacy.paintLevel,5);assert.equal(restoredLegacy.style,'photo');
  }finally{await restarted.close();}
});
