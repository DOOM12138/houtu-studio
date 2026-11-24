import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { normalizeEditOptions, DEFAULT_PROMPT } from './painting.mjs';

export const MAX_TEMPLATES = 100;
export function templateValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('提示词模板格式无效。');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60) throw new Error('模板名称需要 1–60 个字。');
  if (typeof value.text !== 'string' || !value.text.trim()) throw new Error('模板需要填写提示词。');
  if (value.options !== undefined && (!value.options || typeof value.options !== 'object' || Array.isArray(value.options))) throw new Error('模板设置格式无效。');
  const options = normalizeEditOptions({ ...(value.options || {}), prompt: value.text, selection: null, parentId: null });
  const { operation, style, model, strength, paintLevel, preserve, areas, promptMode,portrait,scene,belly,task } = options;
  return { name: value.name.trim(), text: options.prompt, options: { operation, style, model, strength, paintLevel, preserve, areas, promptMode,task,...(belly?{belly}:{}),...(scene?{scene}:{}),...(portrait?{portrait}:{}) } };
}

export function importTemplates(input) {
  const list = Array.isArray(input) ? input : input?.templates;
  if (!Array.isArray(list) || list.length > MAX_TEMPLATES) throw new Error('模板文件应包含不超过 100 条模板。');
  return list.map(templateValue);
}

const seeds = [
  { name: '全人物 · 轻柔二次元厚涂', text: DEFAULT_PROMPT, options: { operation: 'full-body', style: 'anime' } },
  { name: 'COS · 保留真人质感', text: '保留人物身份、脸型与原始全身取景。细化假发、妆面、手部、服装与饰品，让全身光影自然统一，保留真人和服装的质感。', options: { operation: 'cos-paint', style: 'cos' } },
  { name: '自由写 · 局部发丝精修', text: '只整理原图中头发的发束走向、碎发和光泽。保留发型主体、发色、发饰与人物身份，不改变其他部位，不额外增加发量。', options: { operation: 'hair', promptMode: 'custom' } },
];

export class TemplateStore {
  constructor(directory, defaultsFile) { this.file = path.join(directory, 'prompts.json'); this.defaultsFile = defaultsFile; this.queue = Promise.resolve(); this.items = []; }
  async load() {
    let records;
    try { records = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('提示词库无法读取，请检查 data/prompts.json。');
      try { records = JSON.parse(await readFile(this.defaultsFile, 'utf8')); }
      catch (fallback) { if (fallback.code !== 'ENOENT') throw new Error('随包提示词库格式无效。'); records = seeds; }
      const now = Date.now(); this.items = importTemplates(records).map(v => ({ ...v, id: randomUUID(), created: now, updated: now }));
      await this.persist(this.items); return;
    }
    const list = Array.isArray(records) ? records : records.templates;
    const normalized = importTemplates(records);
    this.items = normalized.map((v, i) => ({ ...v, id: /^[a-f0-9-]{36}$/.test(list[i].id || '') ? list[i].id : randomUUID(), created: list[i].created || Date.now(), updated: list[i].updated || Date.now() }));
  }
  list() { return structuredClone(this.items); }
  async persist(items) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, templates: items }, null, 2));
    await rename(temporary, this.file);
  }
  mutate(fn) {
    const next = this.queue.then(async () => { const items = this.list(); const result = fn(items); await this.persist(items); this.items = items; return result; });
    this.queue = next.catch(() => {}); return next;
  }
  save(value, id) {
    const normalized = templateValue(value);
    return this.mutate(items => {
      const index = id ? items.findIndex(item => item.id === id) : -1;
      if (id && index < 0) throw new Error('要更新的模板不存在。');
      if (!id && items.length >= MAX_TEMPLATES) throw new Error('最多保存 100 条模板，请先删除不需要的模板。');
      const now = Date.now();
      const item = { ...normalized, id: id || randomUUID(), created: index >= 0 ? items[index].created : now, updated: now };
      if (index >= 0) items[index] = item; else items.push(item);
      return item;
    });
  }
  remove(id) { return this.mutate(items => { const index = items.findIndex(v => v.id === id); if (index < 0) throw new Error('模板不存在。'); items.splice(index, 1); }); }
  import(input) {
    const values = importTemplates(input);
    return this.mutate(items => {
      let added = 0;
      for (const value of values) {
        if (items.some(item => item.name === value.name && item.text === value.text && JSON.stringify(item.options) === JSON.stringify(value.options))) continue;
        if (items.length >= MAX_TEMPLATES) throw new Error('导入后超过 100 条模板，已取消本次导入。');
        const now = Date.now(); items.push({ ...value, id: randomUUID(), created: now, updated: now }); added++;
      }
      return added;
    });
  }
}
