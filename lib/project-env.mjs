import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// Keep generated files on the same drive as this checkout, including child processes.
export function projectEnvironment(root = ROOT, inherited = process.env) {
  root = path.resolve(root);
  const temporary = path.join(root, 'tmp');
  const npmCache = path.join(root, '.cache', 'npm');
  const browsers = path.join(root, '.cache', 'browsers');
  for (const directory of [temporary, npmCache, browsers]) mkdirSync(directory, {recursive:true});
  return {...inherited, TEMP:temporary, TMP:temporary, TMPDIR:temporary, npm_config_cache:npmCache, PLAYWRIGHT_BROWSERS_PATH:browsers};
}
export function useProjectEnvironment(root = ROOT) {
  Object.assign(process.env, projectEnvironment(root));
}
