import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {projectEnvironment} from '../lib/project-env.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
test('temporary files and caches remain inside the checkout and reach child Node processes', async () => {
  const base = projectEnvironment(root);
  const isolated = await mkdtemp(path.join(base.TEMP, 'project-env-'));
  try {
    const inherited = {...process.env, TEMP:'unused-parent-temp', PROJECT_ENV_TEST:'preserved'};
    const environment = projectEnvironment(isolated, inherited);
    assert.equal(inherited.TEMP, 'unused-parent-temp');
    assert.equal(environment.PROJECT_ENV_TEST, 'preserved');
    for (const key of ['TEMP','TMP','TMPDIR','npm_config_cache','PLAYWRIGHT_BROWSERS_PATH']) {
      const relative = path.relative(isolated, environment[key]);
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      assert.ok((await stat(environment[key])).isDirectory());
    }
    const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module','-e', "import os from 'node:os';process.stdout.write(os.tmpdir())"], {cwd:isolated, env:environment, windowsHide:true});
    assert.equal(path.resolve(stdout), path.resolve(environment.TEMP));
  } finally { await rm(isolated, {recursive:true, force:true}); }
});
