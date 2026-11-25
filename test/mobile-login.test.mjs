import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {createApp} from '../server.mjs';

test('phone OAuth keeps background work active until completion, logout or a bounded deadline', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'houtu-mobile-login-'));
  class Bridge extends EventEmitter {
    async account() { return null; }
    async login() { return {authUrl: 'https://auth.openai.com/oauth/authorize?test=1'}; }
    async logout() {}
    async stop() {}
  }
  const bridge = new Bridge();
  const app = await createApp({directory, bridge, platform: {async close() {}},
    clientPlatform: 'android', localAccessToken: 'mobile-fixture-secret'});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await fs.rm(directory, {recursive: true, force: true}); });
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const access = {Authorization: 'Bearer mobile-fixture-secret'};
  const health = await (await fetch(origin + '/api/health', {headers: access})).json();
  const post = route => fetch(origin + route, {method: 'POST', headers: {
    ...access, Origin: origin, 'X-Paint-CSRF': health.csrf, 'Content-Type': 'application/json'}, body: '{}'});
  assert.equal(app.isBusy(), false);
  assert.equal((await post('/api/login')).status, 200);
  assert.equal(app.isBusy(), true, 'the phone browser may remain open for more than the 30-second idle limit');
  // The lifecycle hold must expire even if the OAuth provider never notifies completion.
  const later = Date.now() + 16 * 60 * 1000;
  const deadline = t.mock.method(Date, 'now', () => later);
  assert.equal(app.isBusy(), false);
  deadline.mock.restore();
  bridge.emit('notification', 'account/login/completed', {success: false});
  assert.equal(app.isBusy(), false);
  assert.equal((await post('/api/login')).status, 200);
  assert.equal(app.isBusy(), true);
  assert.equal((await post('/api/logout')).status, 200);
  assert.equal(app.isBusy(), false);
});
