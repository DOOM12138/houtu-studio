import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { PROMPT_SPECS, ANALYSIS_SPECS } from '../lib/prompt-registry.mjs';
import { MANUAL_TOOLS } from '../public/manual-portrait-engine.js';
import { benchmarkInventory, checkFeatureManifest, evaluateFeatureBenchmarks } from '../scripts/feature-benchmark-gate.mjs';

const op = 'local.subject-mask';
const hash = x => x.toString(16).padStart(64, '0');
const setup = (n, kind = 'positive') => ({
  operation: op,
  caseId: 'photo-' + n,
  kind,
  partition: 'held-out',
  hashes: { input: hash(n), reference: hash(n + 10), baseline: hash(n + 20), candidate: hash(n + 30) },
  source: { url: 'https://example.org/tutorial', sameShot: true, basis: 'Frame pair manually matched' },
  receipt: { engine: 'local', evidence: 'Retouch pipeline receipt' },
  reviewer: 'manual review',
  notes: 'Both measures evaluated from the saved artifacts',
  baselineScores: [93, 85],
  candidateScores: [99, 98],
  protected: true,
});
const report = (cases, operation = op) => evaluateFeatureBenchmarks({ revision: 'build-1', cases }, { operation });

test('the benchmark inventory is generated from the canonical registered tools', () => {
  const known = new Set(benchmarkInventory().map(row => row.operation));
  for (const spec of [...PROMPT_SPECS, ...ANALYSIS_SPECS]) assert.ok(known.has(spec.id), spec.id);
  for (const key of MANUAL_TOOLS) assert.ok(known.has('manual.' + key), key);
  assert.equal(known.size, benchmarkInventory().length);
});

test('requires two distinct positives and a negative with both mask metrics at 98 or above', () => {
  const complete = [setup(1), setup(2), setup(3, 'negative')];
  assert.equal(report(complete).pass, true);
  const weakEdge = { ...setup(2), candidateScores: [100, 97.999] };
  const failed = report([setup(1), weakEdge, setup(3, 'negative')]);
  assert.equal(failed.pass, false);
  assert.equal(failed.results[op].failed, 1);
  assert.equal(report([setup(1), setup(2)]).results[op].missing.negative, 1);
  assert.equal(report([setup(1), { ...setup(2), protected: false }, setup(3, 'negative')]).pass, false);
});

test('excludes calibration, diagnostics, duplicates, and unverified same-photo references', () => {
  const duplicate = { ...setup(1), caseId: 'encoded-copy' };
  const calibration = { ...setup(2), partition: 'calibration' };
  const diagnostic = { ...setup(3), partition: 'diagnostic' };
  const unverified = { ...setup(4), source: { ...setup(4).source, sameShot: false } };
  const value = report([setup(1), duplicate, setup(2), calibration, diagnostic, unverified]);
  assert.equal(value.pass, false);
  assert.equal(value.results[op].calibration, 1);
  assert.equal(value.results[op].diagnostic, 1);
  assert.equal(value.results[op].positive, 0);
  assert.equal(value.invalid.filter(row => row.reason === 'duplicate-or-calibration-overlap').length, 3);
  assert.equal(value.invalid.at(-1).reason, 'unverified-before-after');
});

test('hashes the actual artifacts and rejects files outside the private manifest directory', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'retouch-benchmark-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'cases.json');
  const row = { ...setup(1), partition: 'calibration', artifacts: { input: 'photo.txt' } };
  delete row.hashes;
  await writeFile(path.join(dir, 'photo.txt'), 'local private asset');
  await writeFile(filename, JSON.stringify({ revision: 'build-1', cases: [row] }));
  assert.equal((await checkFeatureManifest(filename, { operation: op })).results[op].calibration, 1);
  row.artifacts.input = '../missing.png';
  await writeFile(filename, JSON.stringify({ revision: 'build-1', cases: [row] }));
  await assert.rejects(checkFeatureManifest(filename, { operation: op }), /素材路径超出了案例清单目录/);
});
