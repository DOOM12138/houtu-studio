import test from 'node:test';
import assert from 'node:assert/strict';
import { importTemplates, templateValue } from '../lib/templates.mjs';
import { productionDirectories } from '../scripts/build-portable.mjs';

test('imported templates retain only text and safe editing options', () => {
  const item = templateValue({ name: '<img onerror=alert(1)>', text: '柔和厚涂', token: 'not-real', image: 'not-real', options: { operation: 'face', selection: { x: 0, y: 0, width: 1, height: 1 }, parentId: 'not-real', secret: 'not-real' } });
  assert.equal(item.name, '<img onerror=alert(1)>'); // UI renders as textContent.
  assert.equal(item.token, undefined); assert.equal(item.image, undefined);
  assert.equal(item.options.selection, undefined); assert.equal(item.options.parentId, undefined);
  assert.throws(() => importTemplates({ templates: [{ name: '没有文本' }] }));
  assert.throws(() => importTemplates(Array.from({ length: 101 }, () => ({ name: 'x', text: 'y' }))));
});

test('portable dependency selection excludes dev packages and redundant nested copies', () => {
  const result = productionDirectories({ packages: { '': {}, 'node_modules/sharp': {}, 'node_modules/sharp/node_modules/foo': {}, 'node_modules/@openai/codex': {}, 'node_modules/playwright-core': { dev: true } } });
  assert.deepEqual(result.sort(), ['node_modules/@openai/codex', 'node_modules/sharp']);
});
