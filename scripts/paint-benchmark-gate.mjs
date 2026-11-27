import { readFile } from 'node:fs/promises';

const categories = ['dark-face', 'split-light', 'full-body'];
const weights = { palette: 20, lighting: 20, contour: 20, makeup: 15, texture: 15, seams: 10 };
const required = 50;
const minimum = 98;
const sha256 = value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const videoURL = value => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

export function evaluatePaintCases(records, { revision } = {}) {
  if (!Array.isArray(records) || !revision) throw Error('Provide an array and the exact revision being evaluated.');
  const summary = Object.fromEntries(categories.map(id => [id, { eligible: 0, passed: 0, failed: 0, missing: 0 }]));
  const digestCounts = new Map();
  for (const row of records) {
    if (sha256(row?.sourceSha256)) digestCounts.set(row.sourceSha256, (digestCounts.get(row.sourceSha256) || 0) + 1);
  }
  const rejected = [];
  for (const [index, row] of records.entries()) {
    const valid = categories.includes(row?.category)
      && row.revision === revision && row.partition === 'held-out'
      && videoURL(row.videoURL)
      && Number.isFinite(row.beforeSeconds) && row.beforeSeconds >= 0
      && Number.isFinite(row.afterSeconds) && row.afterSeconds >= 0 && row.afterSeconds !== row.beforeSeconds
      && sha256(row.sourceSha256) && sha256(row.targetSha256) && sha256(row.resultSha256)
      && new Set([row.sourceSha256, row.targetSha256, row.resultSha256]).size === 3
      && digestCounts.get(row.sourceSha256) === 1
      && typeof row.reviewer === 'string' && row.reviewer.trim().length > 0
      && typeof row.note === 'string' && row.note.trim().length > 0
      && typeof row.colourStable === 'boolean' && typeof row.structureStable === 'boolean'
      && Object.keys(weights).every(key => Number.isFinite(row.scores?.[key]) && row.scores[key] >= 0 && row.scores[key] <= 100);
    if (!valid) {
      rejected.push(index + 1);
      continue;
    }
    const group = summary[row.category];
    group.eligible++;
    const weighted = Object.entries(weights).reduce((n, [key, weight]) => n + row.scores[key] * weight / 100, 0);
    if (weighted + Number.EPSILON >= minimum && row.colourStable && row.structureStable) group.passed++;
    else group.failed++;
  }
  for (const group of Object.values(summary)) group.missing = Math.max(0, required - group.eligible);
  return {
    revision, threshold: minimum, requiredPerCategory: required, summary, rejected,
    pass: !rejected.length && Object.values(summary).every(group => group.eligible >= required && group.failed === 0),
  };
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const [file, revision] = process.argv.slice(2);
  if (!file || !revision) throw Error('Usage: node scripts/paint-benchmark-gate.mjs <local-review.json> <revision>');
  const result = evaluatePaintCases(JSON.parse(await readFile(file, 'utf8')), { revision });
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}
