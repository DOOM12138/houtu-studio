import {createSceneTools} from './scene-ui.js';
import {isSceneOperation,isCleanupOperation} from './scene-options.js';
import {createModelPicker} from './model-picker.js';
import {createPortraitTools} from './portrait-ui.js';
import { PRESETS, STYLES, AREAS, DEFAULT_AREAS, PAINT_LEVELS, normalizePaintLevel } from './catalog.js';
const $ = id => document.getElementById(id);
const running = status => ['preparing', 'generating', 'cancelling'].includes(status);
let state = {}, sourceData = '', currentJob = null, timer = null, historyJobs = [];
let checking = false, busy = false,portraitChecking=false,portraitTaskType='';
let operation = 'full-body', toolFilter = '全部', selection = null, selecting = false, parentId = null;
let sourceMeta = null, dragStart = null, previousSelection = null, compiledVersion = 0;
let sourceReference = null, sourceObjectUrl = null;
let promptInitialized = false, templates = [], packageJob = null, packageTimer = null;
const modelPicker=createModelPicker({mount:$('model-picker'),onChange:optionsChanged});
const hasSource = () => Boolean(sourceData || sourceReference);

const selectedAreas = () => [...document.querySelectorAll('[name="area"]:checked')].map(el => el.value);
const editOptions = () => ({ operation: $('prompt-mode').value === 'custom' ? 'custom' : operation, style: $('edit-style').value, model:modelPicker.value, prompt: $('prompt').value, promptMode: $('prompt-mode').value,
  strength: document.querySelector('[name="strength"]:checked').value, paintLevel:Number($('paint-level').value), preserve: $('preserve').checked,
  scene:sceneTools.options(),areas: operation==='portrait-polish'?Object.entries(portraitTools.options().levels).filter(([,n])=>n>0).map(([id])=>id):selectedAreas(), selection, parentId,...(operation==='portrait-polish'?{portrait:portraitTools.options()}:{}) });
const sceneTools=createSceneTools({getImage:()=>$('source'),onChange:optionsChanged,onBusy:value=>{portraitChecking=value;portraitTaskType=value?'mask':'';updateControls();},feedback});
const portraitTools=createPortraitTools({api,getImage:()=>$('source'),getSource:()=>({...((sourceReference)?{source:sourceReference}:{image:sourceData}),model:modelPicker.value}),onChange:optionsChanged,onBusy:(value,type)=>{portraitChecking=value;portraitTaskType=type||'';updateControls();},feedback});

function renderTools() {
  const query = $('tool-search').value.trim().toLowerCase();
  const visible = PRESETS.filter(tool => (toolFilter === '全部' || tool.group === toolFilter) && `${tool.name}${tool.short}${tool.description}`.toLowerCase().includes(query));
  $('tool-list').replaceChildren();
  for (const group of [...new Set(visible.map(tool => tool.group))]) {
    const heading = document.createElement('h3'); heading.textContent = group; $('tool-list').append(heading);
    for (const tool of visible.filter(tool => tool.group === group)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tool-button';
      button.dataset.operation = tool.id; button.setAttribute('aria-pressed', String(tool.id === operation));
      button.disabled = busy || running(currentJob?.status);
      const name = document.createElement('strong'); name.textContent = tool.name;
      const hint = document.createElement('small'); hint.textContent = tool.short;
      button.append(name, hint); button.addEventListener('click', () => { $('prompt-mode').value = 'guided'; setOperation(tool.id); });
      $('tool-list').append(button);
    }
  }
  $('no-tools').hidden = Boolean(visible.length);
}

function setOperation(id, { autoStyle = true } = {}) {
  const tool = PRESETS.find(item => item.id === id) || PRESETS[0];
  operation = tool.id;
  $('operation-title').textContent = tool.name; $('active-tool-name').textContent = tool.name;
  $('operation-description').textContent = tool.description;
  $('areas-details').hidden = operation !== 'full-body';$('portrait-panel').hidden=operation!=='portrait-polish';
  if (autoStyle && tool.style) $('edit-style').value = tool.style;
  $('style-help').textContent = STYLES.find(style => style.id === $('edit-style').value).description;
  sceneTools.setOperation(operation,{reset:autoStyle});
  renderTools(); optionsChanged();
}

for (const area of AREAS) {
  const label = document.createElement('label');
  const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'area'; input.value = area.id; input.checked = true;
  const text = document.createElement('span'); text.textContent = area.name; label.append(input, text); $('area-options').append(label);
}
$('tool-search').addEventListener('input', renderTools);
$('tool-filters').addEventListener('click', event => {
  const button = event.target.closest('button[data-filter]'); if (!button || button.disabled) return;
  toolFilter = button.dataset.filter;
  $('tool-filters').querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
  renderTools();
});
$('edit-style').addEventListener('change', () => { $('style-help').textContent = STYLES.find(s => s.id === $('edit-style').value).description; optionsChanged(); });
$('area-options').addEventListener('change', optionsChanged);
$('paint-level').addEventListener('input', optionsChanged);
document.querySelectorAll('[name="strength"]').forEach(el => el.addEventListener('change', optionsChanged));
$('preserve').addEventListener('change', optionsChanged);
if (matchMedia('(max-width:1100px)').matches) $('tools-panel').open = false;

function optionsChanged() {
  $('areas-count').textContent = `${selectedAreas().length} 项已选`;
  const custom = $('prompt-mode').value === 'custom';$('portrait-panel').hidden=operation!=='portrait-polish'||custom;
  $('prompt-label').textContent = custom ? '完整自定义提示词' : '补充修图描述';
  $('prompt-help').textContent = custom ? '直接使用这段指令，不追加工具与画风设置；局部选区仍然生效。' : '这段描述会和所选功能、画风、程度组合。';
  $('prompt-length').textContent = `${$('prompt').value.length} / 6000`;
  const style = STYLES.find(s => s.id === $('edit-style').value);
  const paintLevel = Number($('paint-level').value);
  const paint = PAINT_LEVELS[paintLevel-1];
  const cleanup=isCleanupOperation(operation);
  $('scene-panel').hidden=custom||!isSceneOperation(operation);
  $('edit-style').closest('.style-field').hidden=cleanup&&!custom;
  $('paint-field').hidden = custom || cleanup || !style.painting;
  $('nonpaint-help').hidden = custom || cleanup || style.painting;
  $('paint-value').value = `${paintLevel} / 10`;
  $('paint-help').textContent = `${paint.name}：${paint.description}`;
  $('paint-level').setAttribute('aria-valuetext', `${paintLevel}/10，${paint.name}`);
  updateControls();
  if ($('prompt-preview').open && state.csrf) refreshPrompt();
}

async function refreshPrompt() {
  const version = ++compiledVersion;
  try {
    const data = await api('/api/prompt', editOptions());
    if (version === compiledVersion) $('compiled-prompt').textContent = data.prompt;
  } catch (error) { if (version === compiledVersion) $('compiled-prompt').textContent = error.message; }
}
$('prompt-preview').addEventListener('toggle', () => { if ($('prompt-preview').open && state.csrf) refreshPrompt(); });
$('copy-instructions').addEventListener('click', async () => {
  try { await refreshPrompt(); await navigator.clipboard.writeText($('compiled-prompt').textContent); feedback('已复制本次完整修图指令。', true); }
  catch { feedback('无法自动复制，请选中下方指令手动复制。'); }
});

function feedback(text = '', success = false) {
  $('feedback').textContent = text;
  $('feedback').hidden = !text;
  $('feedback').classList.toggle('success', success);
}

async function api(route, body) {
  const response = await fetch(route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Paint-CSRF': state.csrf || '' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '请求失败，请重试。'),{workflowId:data.workflowId});
  return data;
}

function updateControls() {
  const packing = packageJob?.status === 'building';
  const working = busy || portraitChecking || running(currentJob?.status) || packing;
  const custom = $('prompt-mode').value === 'custom';
  modelPicker.setDisabled(working);sceneTools.setDisabled(working||custom);
  const scene=isSceneOperation(operation)&&!custom,ready=scene&&sceneTools.options().protectSubject&&!sceneTools.maskReady;
  $('scene-recompose').hidden=!scene||!currentJob?.rawAsset||currentJob.operation!==operation;
  $('scene-recompose-help').hidden=$('scene-recompose').hidden;
  $('scene-recompose').disabled=working;
  document.querySelector('.strength-field').hidden=scene;
  if(scene)$('preserve').checked=true;
  $('generate').disabled = !modelPicker.valid() || !hasSource() || !state.account || working || !$('prompt').value.trim() || (!custom && ['full-body','portrait-polish'].includes(operation) && !editOptions().areas.length);
  $('generate').querySelector('span').textContent = packing ? '打包中，稍后精修' : portraitChecking ? (portraitTaskType==='audit'?'正在检查人物…':'正在分析人物蒙版…') : working ? '正在精修…' : ready ? '先检查主体保护' : isCleanupOperation(operation)&&!custom ? '开始场照清理' : selection ? '精修选区' : '开始精修';
  $('cancel').hidden = !running(currentJob?.status)&&!(portraitChecking&&portraitTaskType==='audit');
  $('cancel').disabled = currentJob?.status === 'cancelling';
  $('cancel').textContent = portraitChecking&&portraitTaskType==='audit'?'停止画面检查':currentJob?.status === 'cancelling' ? '正在停止…' : '停止生成';
  $('upload').disabled = working; $('replace').disabled = working; $('file').disabled = working;
  $('login').disabled = working; $('logout').disabled = working;
  $('prompt').disabled = working; $('preserve').disabled = working; $('reset-prompt').disabled = working || !state.defaultPrompt;
  document.querySelectorAll('[name="strength"],[name="area"],#edit-style,#preserve,#paint-level').forEach(el => { el.disabled = working || custom || (isSceneOperation(operation)&&el.id==='preserve'); });
  document.querySelectorAll('#tool-list button,#tool-filters button,#tool-search,#prompt-mode,#save-template,#template-name,#template-select,#import-templates').forEach(el => { el.disabled = working; });
  $('update-template').disabled = working || !$('template-select').value;
  $('apply-template').disabled = working || !$('template-select').value;
  $('delete-template').disabled = working || !$('template-select').value;
  $('build-package').disabled = working || !state.csrf;
  $('include-prompts').disabled = packing;
  $('select-region').disabled = !hasSource() || working;
  $('apply-region').disabled = !hasSource() || working;
  $('clear-region').disabled = !selection || working;
  document.querySelectorAll('.region-number-fields input').forEach(el => { el.disabled = working; });
  $('selection-canvas').classList.toggle('selecting', selecting && !working);
  $('reuse-result').hidden = !currentJob?.outputUrl || working;$('portrait-rollback').hidden=!currentJob?.sourceUrl||working;$('portrait-panel').inert=working;
  document.querySelector('.studio').classList.toggle('busy', working);
  $('action-hint').textContent = packing ? '正在打包便携版，完成后可以继续精修。' : working ? '请保持网站与本机服务运行。' : !hasSource() ? '先上传完整人物原图。' : !state.account ? '登录 ChatGPT 后即可开始。' : selection ? '只重绘选区，选区外保留原图。' : !custom && operation === 'full-body' && !selectedAreas().length ? '请至少选择一个精修部位。' : '按所选功能精修，保留原图取景。';
}

async function refreshState() {
  if (checking) return;
  checking = true;
  try {
    const accountBefore=state.account?(state.account.email||'signed-in'):null;
    state = await api('/api/state');
    if(accountBefore!==(state.account?(state.account.email||'signed-in'):null))modelPicker.reload(true);
    $('account').textContent = state.account ? `${state.account.email || '已连接 ChatGPT'} · ${state.account.plan.toUpperCase()}` : '尚未登录';
    $('login').hidden = Boolean(state.account);
    $('logout').hidden = !state.account;
    $('login').textContent = state.loginPending ? '继续登录 ChatGPT' : '使用 ChatGPT 登录';
    const note = state.serviceError || state.loginError;
    if (note) showConnection(note);
    else if (!state.loginPending) $('connection').hidden = true;
    if (!promptInitialized) { $('prompt').value = state.defaultPrompt; promptInitialized = true; optionsChanged(); }
    if (state.package && !packageJob) { renderPackage(state.package); if (state.package.status === 'building') watchPackage(); }
    if (!currentJob && state.activeJob) await restoreJob(state.activeJob);
    updateControls();
  } catch { showConnection('本机服务未连接。请双击项目中的「启动网站.cmd」，然后刷新此页面。'); }
  finally { checking = false; }
}

function showConnection(text, link) {
  $('connection').replaceChildren(document.createTextNode(text));
  if (link) {
    const a = document.createElement('a'); a.href = link; a.textContent = '打开官方登录页'; a.target = '_blank'; a.rel = 'noopener noreferrer'; $('connection').append(a);
  }
  $('connection').hidden = false;
}

$('login').addEventListener('click', async () => {
  // Open synchronously from the user's click so browser popup blocking cannot strand OAuth.
  const popup = window.open('about:blank', '_blank');
  if (popup) { popup.opener = null; popup.document.title = '正在打开 ChatGPT 官方登录'; }
  $('login').disabled = true; feedback();
  try {
    const { authUrl } = await api('/api/login', {});
    if (popup) popup.location.replace(authUrl);
    showConnection('请在 OpenAI 官方页面完成登录，完成后回到这里即可。', authUrl);
    state.loginPending = true;
    $('login').textContent = '继续登录 ChatGPT';
  } catch (error) { popup?.close(); feedback(error.message); }
  finally { $('login').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  try { await api('/api/logout', {}); state.account = null; await refreshState(); feedback('已退出本站的 ChatGPT 连接。', true); }
  catch (error) { feedback(error.message); }
});

$('theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('paint-theme', next); } catch { /* Optional preference storage. */ }
  drawSelection();
});
try { document.documentElement.dataset.theme = localStorage.getItem('paint-theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); } catch {}

function splitMode() {
  $('canvases').hidden = false; $('comparison').hidden = true;
  $('canvases').classList.remove('source-view');
  $('split-mode').classList.add('selected'); $('compare-mode').classList.remove('selected');
  $('source-mode').classList.remove('selected'); $('source-mode').setAttribute('aria-pressed', 'false');
  $('split-mode').setAttribute('aria-pressed', 'true'); $('compare-mode').setAttribute('aria-pressed', 'false');
  requestAnimationFrame(drawSelection);
}
$('split-mode').addEventListener('click', splitMode);
function sourceMode() {
  $('canvases').hidden = false; $('comparison').hidden = true; $('canvases').classList.add('source-view');
  $('source-mode').classList.add('selected'); $('source-mode').setAttribute('aria-pressed', 'true');
  for (const id of ['split-mode', 'compare-mode']) { $(id).classList.remove('selected'); $(id).setAttribute('aria-pressed', 'false'); }
  requestAnimationFrame(drawSelection);
}
$('source-mode').addEventListener('click', sourceMode);
$('compare-mode').addEventListener('click', () => {
  if (!currentJob?.outputUrl) return;
  $('compare-source').src = $('source').src; $('compare-result').src = currentJob.outputUrl;
  $('canvases').hidden = true; $('comparison').hidden = false;
  $('split-mode').classList.remove('selected'); $('compare-mode').classList.add('selected');
  $('source-mode').classList.remove('selected'); $('source-mode').setAttribute('aria-pressed', 'false');
  $('split-mode').setAttribute('aria-pressed', 'false'); $('compare-mode').setAttribute('aria-pressed', 'true');
});
$('compare-range').addEventListener('input', event => {
  $('compare-overlay').style.clipPath = `inset(0 ${100 - event.target.value}% 0 0)`;
  $('compare-line').style.left = `${event.target.value}%`;
});

async function setFile(file, reference = null) {
  if (!file || busy || portraitChecking || running(currentJob?.status)) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return feedback('请选择 PNG、JPG 或 WebP 图片。');
  if (!reference && file.size > 12 * 1024 * 1024) return feedback('图片超过 12 MB，请先缩小图片。');
  try {
    const data = reference ? URL.createObjectURL(file) : await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const img = new Image();
    img.src = data; await img.decode();
    if (img.width * img.height > 40_000_000) return feedback('图片像素过大，请缩小到 4000 万像素以内。');
    clearInterval(timer); currentJob = null;portraitTools.reset();sceneTools.resetMask();$('portrait-versions').hidden=true;
    parentId = null; selection = null; selecting = false; sourceMeta = { width: img.width, height: img.height };
    if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
    sourceObjectUrl = reference ? data : null;
    sourceReference = reference; sourceData = reference ? '' : data;
    $('source').src = data; $('source-frame').hidden = false; $('upload').hidden = true; $('replace').hidden = false;
    $('file-name').textContent = file.name;
    $('file-name').title = file.name;
    $('image-info').textContent = `${img.width} × ${img.height} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    clearResult(); updateRegion(); feedback(); updateControls(); requestAnimationFrame(drawSelection);
    return true;
  } catch { feedback('这张图片无法打开，请换一张试试。'); }
}

function clearResult() {
  splitMode(); $('result-frame').hidden = true; $('result-empty').hidden = false; $('loading').hidden = true;
  $('download').hidden = true; $('compare-mode').disabled = true;
  $('reuse-result').hidden = true;
  $('footer-hint').hidden = false;
  $('result').removeAttribute('src');
}

$('upload').addEventListener('click', () => $('file').click());
$('replace').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', event => { setFile(event.target.files[0]); event.target.value = ''; });
document.querySelector('.source-pane').addEventListener('dragover', event => { event.preventDefault(); if (!running(currentJob?.status)) $('upload').classList.add('dragging'); });
document.querySelector('.source-pane').addEventListener('dragleave', () => $('upload').classList.remove('dragging'));
document.querySelector('.source-pane').addEventListener('drop', event => { event.preventDefault(); $('upload').classList.remove('dragging'); setFile(event.dataTransfer.files[0]); });
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());
$('prompt').addEventListener('input', optionsChanged);
$('reset-prompt').addEventListener('click', () => { $('prompt').value = state.defaultPrompt; optionsChanged(); });

function updateRegion() {
  $('region-note').textContent = selection && sourceMeta
    ? `局部 ${Math.round(selection.width * sourceMeta.width)} × ${Math.round(selection.height * sourceMeta.height)} · 选区外保留`
    : '整图精修';
  $('select-region').textContent = selecting ? '结束画选区' : '画局部选区';
  if (selection) {
    for (const [id, key] of [['region-x', 'x'], ['region-y', 'y'], ['region-w', 'width'], ['region-h', 'height']]) $(id).value = +(selection[key] * 100).toFixed(1);
  }
  drawSelection(); optionsChanged();
}

function drawSelection() {
  const frame = $('source-frame'), image = $('source'), canvas = $('selection-canvas');
  if (!sourceMeta || frame.hidden || !frame.getClientRects().length || !image.naturalWidth) return;
  const frameBox = frame.getBoundingClientRect(), imageBox = image.getBoundingClientRect();
  const scale = Math.min(imageBox.width / sourceMeta.width, imageBox.height / sourceMeta.height);
  const width = sourceMeta.width * scale, height = sourceMeta.height * scale;
  if (!width || !height) return;
  canvas.style.left = `${imageBox.left - frameBox.left + (imageBox.width - width) / 2}px`;
  canvas.style.top = `${imageBox.top - frameBox.top + (imageBox.height - height) / 2}px`;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const ratio = devicePixelRatio || 1; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  if (selection) {
    ctx.fillStyle = '#a44e3126'; ctx.fillRect(selection.x * width, selection.y * height, selection.width * width, selection.height * height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(selection.x * width, selection.y * height, selection.width * width, selection.height * height);
  }
}

function validSelection(rect) {
  if (!sourceMeta || !Object.values(rect).every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) throw new Error('选区超出原图，请检查左侧、顶部、宽度和高度。');
  if (Math.round(rect.width * sourceMeta.width) < 64 || Math.round(rect.height * sourceMeta.height) < 64) throw new Error('选区至少需要 64 × 64 像素，请画大一点。');
  return rect;
}

$('select-region').addEventListener('click', () => {
  selecting = !selecting;
  if (selecting) { sourceMode(); feedback('在原图上拖动，框住要精修的部位；也可以用比例输入框设置。', true); }
  updateRegion();
});
$('clear-region').addEventListener('click', () => { selection = null; selecting = false; updateRegion(); feedback('已清除选区，下次处理完整原图。', true); });
$('apply-region').addEventListener('click', () => {
  try {
    selection = validSelection({ x: +$('region-x').value / 100, y: +$('region-y').value / 100, width: +$('region-w').value / 100, height: +$('region-h').value / 100 });
    selecting = false; sourceMode(); updateRegion(); feedback('局部选区已设置，选区外将保留原图。', true);
  } catch (error) { feedback(error.message); }
});
function pointerPoint(event) {
  const box = $('selection-canvas').getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
}
$('selection-canvas').addEventListener('pointerdown', event => {
  if (!selecting || busy || running(currentJob?.status)) return;
  event.preventDefault(); previousSelection = selection; dragStart = pointerPoint(event); $('selection-canvas').setPointerCapture(event.pointerId);
});
$('selection-canvas').addEventListener('pointermove', event => {
  if (!dragStart) return;
  const point = pointerPoint(event);
  selection = { x: Math.min(point.x, dragStart.x), y: Math.min(point.y, dragStart.y), width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) };
  drawSelection();
});
$('selection-canvas').addEventListener('pointerup', event => {
  if (!dragStart) return;
  const point = pointerPoint(event);
  const rect = { x: Math.min(point.x, dragStart.x), y: Math.min(point.y, dragStart.y), width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) };
  dragStart = null;
  try { selection = validSelection(rect); feedback('选区已设置；生成后会合回原图，保留选区外画面。', true); }
  catch (error) { selection = previousSelection; feedback(error.message); }
  updateRegion();
});
$('selection-canvas').addEventListener('pointercancel', () => { dragStart = null; selection = previousSelection; updateRegion(); });
$('source').addEventListener('load', drawSelection);
new ResizeObserver(() => requestAnimationFrame(drawSelection)).observe($('source-frame'));

function renderJob(job) {
  const wasRunning = running(currentJob?.status);
  currentJob = job;
  const working = running(job.status);
  $('loading').hidden = !working;
  $('loading-message').textContent = job.message;
  $('result-empty').hidden = working || Boolean(job.outputUrl);
  $('result-frame').hidden = !job.outputUrl || working;
  $('download').hidden = !job.outputUrl || working;
  $('footer-hint').hidden = Boolean(job.outputUrl) && !working;
  $('compare-mode').disabled = !job.outputUrl || working;
  if (job.outputUrl && !working) {
    $('result').src = job.outputUrl;
    $('download').href = job.outputUrl + '?download=1';
    $('download').download = isSceneOperation(job.operation)?`${PRESETS.find(p=>p.id===job.operation).name.replaceAll('/','-')}.png`:job.operation==='portrait-polish'?`人物细化-第${job.round||1}轮.png`:STYLES.find(s=>s.id===job.style)?.painting?`厚涂-${normalizePaintLevel(job.paintLevel,job.strength)}级.png`:'人物精修-非厚涂.png';
  }
  if (!working) {
    clearInterval(timer); timer = null;
    feedback(job.message, job.status === 'done' || job.status === 'cancelled');
    if (wasRunning && job.outputUrl) { selecting = false; splitMode(); }
  }
  updateControls();if(!working&&job.outputUrl)loadPortraitVersions(job);
}

function updateElapsed() {
  if (!currentJob) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - currentJob.created) / 1000));
  $('elapsed').textContent = `已等待 ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
}

function watchJob() {
  clearInterval(timer);
  let polling = false;
  timer = setInterval(async () => {
    updateElapsed();
    if (polling || !currentJob) return;
    polling = true;
    try {
      const job = await api(`/api/jobs/${currentJob.id}`);
      renderJob(job);
      if (!running(job.status)) await loadHistory();
    } catch { feedback('与本机服务的连接中断，正在重连。请保持启动窗口运行。'); }
    finally { polling = false; }
  }, 1600);
}

$('generate').addEventListener('click', async () => {
  if ($('generate').disabled) return;
  busy = true; feedback(); updateControls(); splitMode();
  try {
    let sceneMask=null;const sceneInput=editOptions();if(isSceneOperation(sceneInput.operation)&&sceneInput.scene.protectSubject){const ready=sceneTools.maskReady;sceneMask=await sceneTools.buildMask();if(!ready){feedback('主体保护已生成，请检查绿色区域，必要时增减保护，再点击开始场照清理。',true);return;}}
    const protectionMask=sceneMask||(editOptions().operation==='portrait-polish'&&$('portrait-protect-bg').checked?await portraitTools.buildMask():null);const job = await api('/api/jobs', { ...(sourceReference ? { source: sourceReference } : { image: sourceData }), ...editOptions(),...(protectionMask?{protectionMask}:{}),portraitAuditId:portraitTools.auditId });
    renderJob(job); updateElapsed(); watchJob();
  } catch (error) { feedback(error.message); }
  finally { busy = false; updateControls(); }
});
$('cancel').addEventListener('click', async () => {
  if(portraitChecking&&portraitTaskType==='audit'){try{await api('/api/portrait/cancel',{});feedback('已请求停止画面检查，已保存输入仍保留。');}catch(e){feedback(e.message);}return;}if (!currentJob) return;
  $('cancel').disabled = true;
  try { renderJob(await api(`/api/jobs/${currentJob.id}/cancel`, {})); }
  catch (error) { feedback(error.message); updateControls(); }
});

async function restoreJob(job) {
  try {
    const response = await fetch(job.sourceUrl);
    if (!response.ok) throw new Error('原图不存在。');
    const blob = await response.blob();
    if (!await setFile(new File([blob], '之前的原图', { type: blob.type }), { jobId: job.id, kind: 'source' })) return;
    modelPicker.set(job.model||job.resolvedModel||null);
    $('prompt').value = job.prompt || state.defaultPrompt;
    $('prompt-mode').value = job.promptMode || 'guided';
    const strength = document.querySelector(`[name="strength"][value="${['light', 'balanced', 'rich'].includes(job.strength) ? job.strength : 'light'}"]`);
    strength.checked = true; $('paint-level').value = normalizePaintLevel(job.paintLevel,job.strength); $('preserve').checked = job.preserve !== false;
    $('edit-style').value = STYLES.some(s => s.id === job.style) ? job.style : 'anime';
    document.querySelectorAll('[name="area"]').forEach(el => { el.checked = (job.areas || DEFAULT_AREAS).includes(el.value); });
    selection = job.selection || null; parentId = job.parentId || null;
    sceneTools.hydrate(job.compositionMaskOverride?{...job.scene,protectSubject:Boolean(job.compositionMaskAsset)}:job.scene,job.operation);
    setOperation(job.operation || 'full-body', { autoStyle: false }); updateRegion();
    if(job.portrait){portraitTools.hydrate(job.portrait);$('portrait-profile').value='custom';}$('portrait-protect-bg').checked=job.operation==='portrait-polish'?Boolean(job.maskAsset):true;if(job.portraitAuditId){try{const audit=await api('/api/portrait/source?audit='+job.portraitAuditId);portraitTools.setAuditId(job.portraitAuditId);if(audit.diagnosis)portraitTools.showDiagnosis(audit.diagnosis,job.portraitAuditId);}catch{}}if(job.operation==='portrait-polish'&&job.maskAsset&&job.workflowId){$('portrait-protect-bg').checked=true;await portraitTools.loadMask(`/api/workflows/${job.workflowId}/assets/${job.maskAsset}`);}if(isSceneOperation(job.operation)){const mask=job.compositionMaskOverride?job.compositionMaskAsset:job.maskAsset;if(mask&&job.workflowId)await sceneTools.loadEditingMask(`/api/workflows/${job.workflowId}/assets/${mask}`);}
    renderJob(job);
    if (running(job.status)) watchJob();
  } catch (error) { feedback(error.message); }
}

async function loadHistory() {
  try {
    const data = await api('/api/jobs'); historyJobs = data.jobs.filter(job => job.status === 'done' && job.outputUrl);
    if (!historyJobs.length) return;
    $('history').replaceChildren();
    for (const job of historyJobs) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'history-item';
      const stamp = new Date(job.created).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const strength = job.promptMode==='custom'?'自定义提示词':STYLES.find(s=>s.id===job.style)?.painting?`厚涂 ${normalizePaintLevel(job.paintLevel,job.strength)}/10`:'非厚涂精修';
      const tool = PRESETS.find(p => p.id === job.operation)?.name || '人物精修';
      button.setAttribute('aria-label', `打开 ${stamp} 的${tool}作品`);
      const img = document.createElement('img'); img.src = job.outputUrl; img.alt = `${strength}作品缩略图`; img.loading = 'lazy';
      const label = document.createElement('span'); label.textContent = `${stamp} · ${tool} · ${strength}${job.resolvedModel||job.model?' · '+(job.resolvedModel||job.model):''}${job.selection ? ' · 局部' : ''}`;
      button.append(img, label);
      button.addEventListener('click', async () => {
        if (busy || running(currentJob?.status)) return feedback('请先等待当前图片完成。');
        await restoreJob(job); document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      $('history').append(button);
    }
  } catch { /* History can recover after reconnect. */ }
}

function templateFeedback(text, error = false) { $('template-feedback').textContent = text; $('template-feedback').classList.toggle('error', error); }
async function loadTemplates(selectId = $('template-select').value) {
  try {
    const data = await api('/api/templates'); templates = data.templates;
    $('template-select').replaceChildren(new Option('选择一个模板', ''));
    for (const template of templates) $('template-select').append(new Option(template.name, template.id));
    $('template-select').value = templates.some(item => item.id === selectId) ? selectId : '';
    updateControls();
  } catch (error) { templateFeedback(error.message || '提示词库未连接，请刷新后重试。', true); }
}
function currentTemplate() { return { name: $('template-name').value, text: $('prompt').value, options: editOptions() }; }
$('prompt-mode').addEventListener('change', optionsChanged);
$('template-select').addEventListener('change', () => {
  const selected = templates.find(item => item.id === $('template-select').value);
  if (selected) $('template-name').value = selected.name;
  updateControls();
});
async function saveTemplate(update) {
  try {
    const data = await api('/api/templates/save', { template: currentTemplate(), ...(update ? { id: $('template-select').value } : {}) });
    await loadTemplates(data.template.id); templateFeedback(update ? '模板已更新。' : '已保存为新模板。');
  } catch (error) { templateFeedback(error.message, true); }
}
$('save-template').addEventListener('click', () => saveTemplate(false));
$('update-template').addEventListener('click', () => saveTemplate(true));
$('apply-template').addEventListener('click', () => {
  const template = templates.find(item => item.id === $('template-select').value); if (!template) return;
  modelPicker.set(template.options.model);
  $('prompt').value = template.text; $('prompt-mode').value = template.options.promptMode;
  $('edit-style').value = template.options.style; $('preserve').checked = template.options.preserve;
  document.querySelector(`[name="strength"][value="${template.options.strength}"]`).checked = true;
  $('paint-level').value = normalizePaintLevel(template.options.paintLevel,template.options.strength);
  document.querySelectorAll('[name="area"]').forEach(el => { el.checked = template.options.areas.includes(el.value); });
  sceneTools.hydrate(template.options.scene,template.options.operation);if(template.options.portrait)portraitTools.hydrate(template.options.portrait);setOperation(template.options.operation, { autoStyle: false });
  templateFeedback(`已应用「${template.name}」。原图与选区保留。`);
});
$('delete-template').addEventListener('click', async () => {
  const template = templates.find(item => item.id === $('template-select').value);
  if (!template || !window.confirm(`删除提示词模板「${template.name}」？`)) return;
  try { await api(`/api/templates/${template.id}/delete`, {}); await loadTemplates(''); templateFeedback('模板已删除。'); }
  catch (error) { templateFeedback(error.message, true); }
});
function downloadText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$('export-current').addEventListener('click', () => {
  if (!$('prompt').value.trim()) return templateFeedback('请先填写提示词。', true);
  const filename = ($('template-name').value.trim() || '当前提示词').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  downloadText($('prompt').value, filename + '.txt', 'text/plain;charset=utf-8');
});
$('export-templates').addEventListener('click', async () => {
  try { const data = await api('/api/templates'); downloadText(JSON.stringify(data, null, 2), '厚涂小站-提示词库.json', 'application/json;charset=utf-8'); templateFeedback('提示词库已导出，可在其他电脑导入。'); }
  catch (error) { templateFeedback(error.message, true); }
});
$('import-templates').addEventListener('click', () => $('template-file').click());
$('template-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (file.size > 2 * 1024 * 1024) return templateFeedback('导入文件不能超过 2 MB。', true);
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    const data = file.name.toLowerCase().endsWith('.txt') ? { templates: [{ name: file.name.replace(/\.txt$/i, '').slice(0,60), text, options: { ...editOptions(), selection: null, parentId: null } }] } : JSON.parse(text);
    const result = await api('/api/templates/import', data); await loadTemplates(); templateFeedback(`已导入 ${result.added} 条新模板，已有模板没有覆盖。`);
  } catch (error) { templateFeedback(error instanceof SyntaxError ? 'JSON 文件格式无效，请使用导出的提示词库文件。' : error.message, true); }
});
$('edit-prompt').addEventListener('click', () => { $('prompt-workshop').open = true; $('prompt-workshop').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('prompt').focus({ preventScroll: true }); });
function renderPackage(value) {
  packageJob = value; $('package-status').textContent = value.message + (value.bytes ? `（${(value.bytes / 1024 / 1024).toFixed(1)} MB）` : '');
  $('package-download').hidden = value.status !== 'done';
  if (value.downloadUrl) { $('package-download').href = value.downloadUrl; $('package-download').download = '厚涂小站-Windows-x64.zip'; }
  if (value.status !== 'building') { clearInterval(packageTimer); packageTimer = null; }
  updateControls();
}
function watchPackage() {
  clearInterval(packageTimer); let polling = false;
  packageTimer = setInterval(async () => {
    if (polling || !packageJob) return; polling = true;
    try { renderPackage(await api(`/api/packages/${packageJob.id}`)); }
    catch (error) { renderPackage({ ...packageJob, status: 'error', message: error.message }); }
    finally { polling = false; }
  }, 1500);
}
$('build-package').addEventListener('click', async () => {
  $('build-package').disabled = true;
  try { renderPackage(await api('/api/packages', { includePrompts: $('include-prompts').checked })); watchPackage(); }
  catch (error) { $('package-status').textContent = error.message; updateControls(); }
});

async function checkoutPortraitVersion(version){if(!version?.outputUrl||busy||portraitChecking||running(currentJob?.status))return;try{const response=await fetch(version.outputUrl);if(!response.ok)throw Error('这版成品文件不可用，请在工作流历史中查看。');const blob=await response.blob();if(!await setFile(new File([blob],'第'+(version.round||1)+'轮成品.png',{type:blob.type}),{kind:'result',jobId:version.id}))return;parentId=version.id;$('prompt-mode').value='guided';portraitTools.hydrate(version.portrait?{...version.portrait,notes:''}:{});$('portrait-profile').value=version.portrait?'custom':'gentle';$('portrait-protect-bg').checked=true;setOperation('portrait-polish');optionsChanged();for(const button of $('portrait-version-list').querySelectorAll('button[data-job-id]'))button.setAttribute('aria-pressed',String(button.dataset.jobId===version.id));if($('portrait-version-list').children.length)$('portrait-versions').hidden=false;feedback('已从第'+(version.round||1)+'轮成品准备新一轮人物细化；原版本保留，人物蒙版会按这版成品重新分析。',true);}catch(e){feedback(e.message);}}
$('reuse-result').addEventListener('click',()=>checkoutPortraitVersion(currentJob));

$('portrait-rollback').addEventListener('click',async()=>{const before=currentJob;if(!before||busy||running(before.status))return;try{const response=await fetch(before.sourceUrl);if(!response.ok)throw Error('本轮输入图片已不可用。');const blob=await response.blob();if(!await setFile(new File([blob],'回退-本轮开始前.png',{type:blob.type}),{kind:'source',jobId:before.id}))return;parentId=before.parentId||null;$('prompt-mode').value='guided';setOperation('portrait-polish');feedback('已退回本轮开始前的图片。旧成品保留，继续生成会另建一轮。',true);}catch(e){feedback(e.message);}});
async function loadPortraitVersions(job){try{const response=await api(`/api/jobs/${job.id}/lineage`);if(currentJob?.id!==job.id)return;$('portrait-version-list').replaceChildren();for(const version of response.versions){const button=document.createElement('button');button.type='button';button.className='portrait-version';button.dataset.jobId=version.id;button.disabled=busy||portraitChecking||running(currentJob?.status);button.setAttribute('aria-pressed',String(version.id===job.id));if(version.outputUrl){const img=document.createElement('img');img.src=version.outputUrl;img.alt='人物精修第'+(version.round||1)+'轮';button.append(img);}const label=document.createElement('span');label.textContent=`从第${version.round||1}轮成品继续 · ${PRESETS.find(p=>p.id===version.operation)?.name||'人物精修'}`;button.append(label);button.onclick=()=>checkoutPortraitVersion(version);$('portrait-version-list').append(button);}if(job.sourceWorkflowId){const a=document.createElement('a');a.href='/workflows/?id='+job.sourceWorkflowId;a.className='text-button';a.textContent='查看本轮来源工作流';$('portrait-version-list').append(a);}$('portrait-versions').hidden=false;}catch{/* The ordinary history remains available if the version query fails. */}}

$('to-color').addEventListener('click', async () => {
  try {
    if(currentJob?.outputUrl&&currentJob.workflowId){location.href='/color/?fromWorkflow='+currentJob.workflowId;return;}
    const referenceJob=sourceReference&&historyJobs.find(j=>j.id===sourceReference.jobId);
    const url=currentJob?.outputUrl || sourceData || (sourceReference?.kind==='result'?referenceJob?.outputUrl:referenceJob?.sourceUrl);
    if(!url){location.href='/color/';return;}
    const blob=await (await fetch(url)).blob();
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('houtu-handoff',1);r.onupgradeneeded=()=>r.result.createObjectStore('images');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put({blob,name:'人物精修.png'},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close();location.href='/color/#from-retouch';
  } catch {feedback('图片交接未成功，请下载图片后在调色工作台打开。');}
});

setOperation('full-body');
await Promise.all([refreshState(), loadHistory(), loadTemplates()]);
const portraitParams=new URLSearchParams(location.search);if(portraitParams.get('tool')&&PRESETS.some(p=>p.id===portraitParams.get('tool'))&&!portraitParams.get('job')&&!portraitParams.get('refineWorkflow')&&!portraitParams.get('portraitAudit'))setOperation(portraitParams.get('tool'));if(portraitParams.get('refineWorkflow')||portraitParams.get('portraitAudit')){try{const query=portraitParams.get('portraitAudit')?'audit='+encodeURIComponent(portraitParams.get('portraitAudit')):'workflow='+encodeURIComponent(portraitParams.get('refineWorkflow'))+'&asset='+encodeURIComponent(portraitParams.get('refineAsset'));const info=await api('/api/portrait/source?'+query),r=await fetch(info.url),blob=await r.blob();if(await setFile(new File([blob],info.name+'-成品.png',{type:blob.type}),{kind:'workflow',workflowId:info.workflowId,assetId:info.assetId})){$('prompt-mode').value='guided';setOperation('portrait-polish');if(info.auditId)portraitTools.setAuditId(info.auditId);if(info.diagnosis)portraitTools.showDiagnosis(info.diagnosis,info.auditId);feedback('已载入已保存成品，可以开始人物二次精修，前面的合成与调色不会重跑。',true);}}catch(e){feedback(e.message);}}
const requestedJob=new URLSearchParams(location.search).get('job');if(requestedJob&&/^[a-f0-9-]{36}$/.test(requestedJob)){try{await restoreJob(await api('/api/jobs/'+requestedJob));}catch(e){feedback(e.message);}}
setInterval(() => { if (state.loginPending || !state.csrf) refreshState(); }, 3000);
window.addEventListener('focus', () => { if (!running(currentJob?.status)) refreshState(); });

$('scene-recompose').addEventListener('click',async()=>{
 if(!currentJob?.workflowId||$('scene-recompose').disabled)return;busy=true;feedback();updateControls();
 try{const mask=sceneTools.options().protectSubject?await sceneTools.buildMask():null;const workflow=await api('/api/workflows/'+currentJob.workflowId);const job=await api('/api/workflows/'+currentJob.workflowId+'/retry',{step:'compose',revision:workflow.revision,replaceProtection:true,protectionMask:mask});renderJob(job);watchJob();}catch(error){feedback(error.message);}finally{busy=false;updateControls();}
});
