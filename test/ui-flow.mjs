// This file alone uses a synthetic model bridge; production has no mock/image-demo mode.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { largeJpegFixture } from './fixtures.mjs';

class TestBridge extends EventEmitter {
  count = 0;
  async account() { return { email: 'ui-test@example.invalid', plan: 'test' }; }
  async begin(job, prompt, inputPath, contextPath) {
    job.threadId = `test-thread-${++this.count}`; job.turnId = 'test-turn';
    this.last = { job, prompt, inputPath, contextPath };
    const { width, height } = await sharp(inputPath).metadata();
    const output = this.returnInput ? await readFile(inputPath) : await sharp({ create: { width, height, channels: 3, background: '#5b6f8a' } }).png().toBuffer();
    setTimeout(() => {
      this.emit('notification', 'item/completed', { threadId: job.threadId, item: { type: 'imageGeneration', status: 'completed', result: output.toString('base64') } });
      this.emit('notification', 'turn/completed', { threadId: job.threadId, turn: { id: job.turnId, status: 'completed' } });
    }, 40);
  }
  stop() {}
}

const directory = await mkdtemp(path.join(tmpdir(), 'paint-ui-flow-'));
const bridge = new TestBridge();
const app = await createApp({ directory, bridge });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(site, { waitUntil: 'networkidle' });
  const original = await sharp({ create: { width: 320, height: 400, channels: 3, background: '#c8b9a4' } }).png().toBuffer();
  await page.locator('#file').setInputFiles({ name: '[TEST ONLY] synthetic.png', mimeType: 'image/png', buffer: original });
  await page.waitForFunction(() => !document.querySelector('#source-frame').hidden);
  await page.locator('[data-operation="eyes"]').click();
  await page.locator('#edit-style').selectOption('cos');
  await page.locator('.region-numbers>summary').click();
  await page.locator('#apply-region').click();
  await page.locator('#generate').click();
  await page.waitForFunction(() => !document.querySelector('#download').hidden, { timeout: 15000 });
  const first = bridge.last.job.id;
  assert.equal(bridge.last.job.operation, 'eyes');
  assert.equal(bridge.last.job.style, 'cos');
  assert.ok(bridge.last.contextPath);
  assert.match(await page.locator('#feedback').textContent(), /选区外已保留/);
  const file = await (await page.request.get(new URL(await page.locator('#download').getAttribute('href'), site).href)).body();
  const pixels = await sharp(file).raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0,3)], [200,185,164]);
  const center = (200 * 320 + 160) * 4; // Composite produces RGBA.
  assert.deepEqual([...pixels.subarray(center, center + 3)], [91,111,138]);
  await page.locator('#compare-mode').click();
  await page.locator('#compare-range').press('End');
  assert.equal(await page.locator('#compare-range').inputValue(), '100');
  assert.equal(await page.locator('#compare-line').evaluate(el => el.style.left), '100%');
  // Download and reuse must remain visible even in slider view.
  assert.equal(await page.locator('#download').isVisible(), true);
  await page.locator('#reuse-result').click();
  await page.waitForFunction(() => document.querySelector('#region-note').textContent === '整图精修');
  assert.equal(await page.locator('#region-note').textContent(), '整图精修');
  assert.match(await page.locator('#file-name').textContent(), /第1轮成品/);
  await page.locator('[data-operation="face"]').click();
  await page.locator('#generate').click();
  await page.waitForFunction(() => !document.querySelector('#download').hidden, { timeout: 15000 });
  assert.equal(bridge.last.job.parentId, first);
  assert.equal(bridge.last.job.operation, 'face');
  assert.equal(bridge.last.contextPath, null);
  await page.waitForFunction(() => document.querySelectorAll('.history-item').length === 2);
  await page.locator('.history-item').last().click();
  await page.waitForFunction(() => document.querySelector('#operation-title').textContent === '厚涂眼睛');
  assert.equal(await page.locator('#operation-title').textContent(), '厚涂眼睛');
  assert.equal(await page.locator('#edit-style').inputValue(), 'cos');
  assert.match(await page.locator('#region-note').textContent(), /局部/);
  // A legal JPEG can normalize to a PNG larger than the external-upload limit.
  bridge.returnInput = true;
  const largeJpeg = await largeJpegFixture();
  await page.locator('#file').setInputFiles({ name: '[LARGE TEST ONLY].jpg', mimeType: 'image/jpeg', buffer: largeJpeg });
  await page.waitForFunction(() => document.querySelector('#file-name').textContent === '[LARGE TEST ONLY].jpg');
  await page.locator('#generate').click();
  await page.waitForFunction(() => !document.querySelector('#download').hidden, null, { timeout: 30000 });
  const big = bridge.last.job.id;
  await page.locator('#reuse-result').click();
  await page.waitForFunction(() => /第\d+轮成品\.png/.test(document.querySelector('#file-name').textContent));
  // This fixture is synthetic noise, not a portrait; the separate portrait UI
  // suite verifies foreground-mask protection with an explicit valid mask.
  await page.locator('#portrait-protect-bg').uncheck();
  assert.equal(await page.locator('#generate').isEnabled(), true);
  await page.locator('#generate').click();
  await page.waitForFunction(() => !document.querySelector('#download').hidden, null, { timeout: 30000 });
  assert.equal(bridge.last.job.parentId, big);
  await page.waitForFunction(() => document.querySelectorAll('.history-item').length === 4);
  await page.locator('.history-item').nth(1).click();
  await page.waitForFunction(() => document.querySelector('#file-name').textContent === '之前的原图');
  assert.equal(await page.locator('#generate').isEnabled(), true);
  assert.match(await page.locator('#image-info').textContent(), /2600 × 2600/);
  assert.deepEqual(errors, []);
  console.log('UI flow passed: local edit, download, slider, reuse/history including PNG files over 12 MB. Synthetic bridge only; no paid calls.');
} finally {
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
