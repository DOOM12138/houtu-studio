import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROMPT_SPECS, ANALYSIS_SPECS } from '../lib/prompt-registry.mjs';
import { MANUAL_ENGINE, MANUAL_TOOLS } from '../public/manual-portrait-engine.js';

export const MINIMUM_SCORE = 98;
const required = { positive: 2, negative: 1 };
const registered = new Map([
  ...PROMPT_SPECS.map(spec => [spec.id, { ...spec, kind: 'image', family: 'AI 修图' }]),
  ...ANALYSIS_SPECS.map(spec => [spec.id, { ...spec, family: 'AI 分析与调度' }]),
]);

for (const id of MANUAL_TOOLS) {
  const criteria = id.startsWith('gray-')
    ? ['笔触的明暗方向、范围和过渡准确', '肤色、原有材质及保护区保留']
    : id.startsWith('low-') || id.startsWith('high-')
      ? ['编辑只作用于所选频段与笔触范围', '肤色纹理连续，保护区原样保留']
      : ['操作符合实际指令，形状、材质与过渡连续', '保护区域与非目标区域符合预期'];
  registered.set('manual.' + id, { name: id, kind: ['protect','unprotect','clear-protection'].includes(id) ? 'analysis' : 'image', family: '本机人物', version: MANUAL_ENGINE, criteria });
}

const local = [
  ['local.color-grade', '曲线、白平衡和局部调色', 'image', ['影调与冷暖符合参考，颜色过渡连续', '肤色、白衣与亮暗细节符合目标']],
  ['local.color-match', '参考匹配和调色预设', 'image', ['相近材质的色彩关系符合参考', '保留原图结构与身份，色彩不溢出']],
  ['local.subject-mask', '主体与细长结构蒙版', 'image', ['主体重合度达到 98', '边缘一致度达到 98']],
  ['local.super-resolution', '本机神经超分', 'image', ['边缘纹理可信，未生成涂抹或伪纹理', '源色、主体结构、比例与透明度符合目标']],
  ['local.raw-develop', 'RAW 显影和灰档', 'image', ['完整像素尺寸和色彩解释正确', '高光暗部、白平衡及16位母版符合预期']],
  ['local.image-transform', '裁切、旋转与翻转', 'image', ['几何位置尺寸和方向准确', '保留范围内色彩和纹理正确']],
  ['local.layer-composite', '图层、混合与蒙版合成', 'image', ['层序混合、几何与蒙版渲染符合预期', '边缘及透明像素符合预览']],
  ['local.export', '成片和批量导出', 'analysis', ['正确保存请求格式、尺寸与元数据', '选中项与导出的文件逐一对应']],
  ['workflow.resume', '检查点恢复与中途重试', 'analysis', ['只从确认步骤继续，保留每个步骤实际产物', '未知提交不重发，历史和输入一致']],
  ['workflow.batch', '选片、配方与参数同步', 'analysis', ['只对目标照片应用所选属性', '各照片的范围和版本正确隔离']],
  ['workflow.handoff', '跨模块带图与回退', 'analysis', ['来源、尺寸和产物版本一致', '原始照片与已有历史保持完整']],
];
for (const [id, name, kind, criteria] of local) registered.set(id, { name, kind, family: '本机与工作流', criteria });

export const benchmarkInventory = () => Array.from(registered, ([operation, spec]) => ({
  operation, name: spec.name ?? operation, family: spec.family, kind: spec.kind, criteria: [...spec.criteria],
  ...(spec.version ? { toolVersion: spec.version } : {}),
}));
const partitions = new Set(['calibration', 'diagnostic', 'held-out']);
const kinds = new Set(Object.keys(required));
const files = ['input', 'reference', 'baseline', 'candidate'];
const digest = value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const web = value => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
const mean = scores => scores.reduce((sum, value) => sum + value, 0) / scores.length;
const validScores = (scores, spec) => Array.isArray(scores) && scores.length === spec.criteria.length
  && scores.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100);

function recordProblem(row, spec) {
  if (!spec || !partitions.has(row.partition) || !nonempty(row.caseId) || !digest(row.hashes?.input)) return 'invalid-case';
  if (row.partition !== 'held-out') return null;
  if (!kinds.has(row.kind) || !files.every(file => digest(row.hashes?.[file]))) return 'missing-artifact';
  if (!nonempty(row.source?.basis) || !nonempty(row.receipt?.engine) || !nonempty(row.receipt?.evidence)) return 'missing-provenance';
  if (spec.kind === 'image' && row.kind === 'positive'
    && (row.source.sameShot !== true || !web(row.source.url) || row.hashes.input === row.hashes.reference
      || row.hashes.input === row.hashes.candidate
      || (spec.family === 'AI 修图' && row.hashes.reference === row.hashes.candidate))) return 'unverified-before-after';
  if (row.protected !== true && row.protected !== false) return 'missing-invariant-review';
  if (!nonempty(row.reviewer) || !nonempty(row.notes) || !validScores(row.baselineScores, spec)
    || !validScores(row.candidateScores, spec)) return 'missing-scores';
  return null;
}

export function evaluateFeatureBenchmarks(manifest, { operation } = {}) {
  if (!nonempty(manifest?.revision) || !Array.isArray(manifest.cases)) throw Error('需要明确的批次版本及案例数组。');
  if (operation && !registered.has(operation)) throw Error('未知功能：' + operation);
  const selected = operation ? [operation] : [...registered.keys()];
  const result = Object.fromEntries(selected.map(id => [id, {
    calibration: 0, diagnostic: 0, positive: 0, negative: 0, failed: 0, invalid: 0, reviews: [],
  }]));
  const invalid = [];
  const uses = new Map();
  const inScope = manifest.cases.map((row, index) => ({ row, index })).filter(({ row }) => !operation || row?.operation === operation);
  for (const { row, index } of inScope) {
    if (!row || typeof row !== 'object') continue;
    for (const key of [row.caseId, row.hashes?.input].filter(nonempty)) {
      const token = JSON.stringify([row.operation, key]);
      if (!uses.has(token)) uses.set(token, new Set());
      uses.get(token).add(index);
    }
  }
  for (const { row, index } of inScope) {
    const spec = registered.get(row?.operation), problem = recordProblem(row ?? {}, spec);
    if (problem) {
      if (spec) result[row.operation].invalid++;
      invalid.push({ index: index + 1, reason: problem });
      continue;
    }
    const group = result[row.operation];
    if (row.partition !== 'held-out') { group[row.partition]++; continue; }
    if ([row.caseId, row.hashes.input].some(key => uses.get(JSON.stringify([row.operation, key])).size > 1)) {
      group.invalid++;
      invalid.push({ index: index + 1, reason: 'duplicate-or-calibration-overlap' });
      continue;
    }
    const candidate = mean(row.candidateScores), baseline = mean(row.baselineScores);
    const metricPass = row.operation !== 'local.subject-mask' || row.candidateScores.every(score => score >= MINIMUM_SCORE);
    const passes = candidate >= MINIMUM_SCORE && row.protected && metricPass;
    group.reviews.push({ caseId: row.caseId, kind: row.kind, baseline, candidate, passes });
    if (passes) group[row.kind]++;
    else group.failed++;
  }
  for (const group of Object.values(result)) {
    group.missing = Object.fromEntries(Object.entries(required).map(([k, n]) => [k, Math.max(0, n - group[k])]));
    group.pass = group.failed === 0 && group.invalid === 0 && Object.values(group.missing).every(n => n === 0);
  }
  return {
    revision: manifest.revision, threshold: MINIMUM_SCORE, results: result, invalid,
    passedOperations: Object.values(result).filter(group => group.pass).length,
    pass: invalid.length === 0 && Object.values(result).every(group => group.pass),
  };
}

function within(directory, file) {
  const relative = path.relative(directory, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function artifactHash(directory, name) {
  if (!nonempty(name) || path.isAbsolute(name)) throw Error('素材路径必须相对案例清单目录。');
  const resolved = path.resolve(directory, name);
  if (!within(directory, resolved)) throw Error('素材路径超出了案例清单目录。');
  const file = await realpath(resolved);
  if (!within(directory, file) || !(await stat(file)).isFile()) throw Error('素材需要是清单目录下的文件。');
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

export async function checkFeatureManifest(filename, options = {}) {
  const file = await realpath(filename), directory = path.dirname(file);
  const manifest = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  if (!Array.isArray(manifest?.cases)) throw Error('案例清单需要 cases 数组。');
  const hashes = new Map();
  for (const [index, row] of manifest.cases.entries()) {
    if (!row || (options.operation && row.operation !== options.operation)) continue;
    const keys = row.partition === 'held-out' ? files : ['input'];
    row.hashes = {};
    for (const key of keys) {
      const name = row.artifacts?.[key];
      if (!nonempty(name)) continue;
      if (!hashes.has(name)) hashes.set(name, artifactHash(directory, name));
      try { row.hashes[key] = await hashes.get(name); }
      catch (error) { throw Error('第 ' + (index + 1) + ' 条案例的 ' + key + ' 素材不可读取：' + error.message); }
    }
  }
  return evaluateFeatureBenchmarks(manifest, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, manifest, operation] = process.argv.slice(2);
  if (action === 'list') console.log(JSON.stringify(benchmarkInventory(), null, 2));
  else if (action === 'check' && manifest) {
    const result = await checkFeatureManifest(manifest, { operation });
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 1;
  } else {
    console.error('用法：node scripts/feature-benchmark-gate.mjs list | check <cases.json> [operation]');
    process.exitCode = 2;
  }
}


