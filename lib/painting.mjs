import { PRESETS, STYLES, AREAS, DEFAULT_AREAS } from '../public/catalog.js';
import {portraitOptions,portraitInstructions} from '../public/portrait-options.js';
export const DEFAULT_PROMPT = '保留角色特征与原图构图，整体协调，光影自然，细节干净，不过度磨皮或夸张塑形。';

export function normalizeEditOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('修图设置无效。');
  const { operation = 'full-body', style = 'anime', prompt = DEFAULT_PROMPT, strength = 'light', preserve = true,
    areas = DEFAULT_AREAS, selection = null, parentId = null, promptMode = 'guided' } = input;
  if (!['guided', 'custom'].includes(promptMode)) throw new Error('提示词模式无效。');
  if (!PRESETS.some(p => p.id === operation)) throw new Error('请选择有效的精修功能。');
  if (!STYLES.some(s => s.id === style)) throw new Error('请选择有效的修图风格。');
  if (!['light', 'balanced', 'rich'].includes(strength)) throw new Error('请选择有效的厚涂程度。');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 6000) throw new Error('提示词需要 1–6000 个字。');
  if (typeof preserve !== 'boolean') throw new Error('保留角色设置无效。');
  if (!Array.isArray(areas) || areas.length > AREAS.length || areas.some(id => !DEFAULT_AREAS.includes(id))) throw new Error('精修部位设置无效。');
  if (promptMode === 'guided' && ['full-body','portrait-polish'].includes(operation) && !areas.length) throw new Error('请至少选择一个人物精修部位。');
  if (parentId !== null && (typeof parentId !== 'string' || !/^[a-f0-9-]{36}$/.test(parentId))) throw new Error('上一版作品标识无效。');
  let rect = null;
  if (selection !== null) {
    const { x, y, width, height } = selection;
    if (![x,y,width,height].every(v => typeof v === 'number' && Number.isFinite(v)) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) throw new Error('局部选区超出原图，请重新选择。');
    rect = { x, y, width, height };
  }
  const portrait=operation==='portrait-polish'?portraitOptions(input.portrait):null;
  if(portrait&&!areas.some(id=>portrait.levels[id]>0))throw Error('请至少开启一个部位的细化等级。');
  return { operation, style, prompt: prompt.trim(), strength, preserve, areas: [...new Set(areas)], selection: rect, parentId, promptMode,portrait };
}

export function paintingPrompt(input) {
  const { operation, style, prompt, strength, preserve, areas, selection, promptMode,portrait } = normalizeEditOptions(input);
  const framing = selection ? '图1是待编辑的局部裁片，图2是完整原图，仅用作人物身份、配色与光影参考。只返回图1范围的局部编辑结果，保持图1的取景与长宽比，不要返回图2的整幅画面；结果将由网站合回原图。' : '图1是编辑目标。保留原图完整画幅和长宽比，不擅自改成头像特写，不补画画外身体。';
  if (promptMode === 'custom') return ['请使用内置图片编辑工具执行一次编辑，返回真实图片。', framing, `用户自定义完整指令：\n${prompt}`].join('\n');
  const levels = {
    light: '轻度精修；若使用厚涂风格，仅做轻度厚涂，尽量贴近原图。',
    balanced: '适中精修；若使用厚涂风格，色块与笔触适度可见。',
    rich: '较强精修；若使用厚涂风格，增强色块塑形与笔触，仍保持所选画风。',
  };
  const preset = PRESETS.find(p => p.id === operation);
  return ['请使用内置图片编辑工具执行一次编辑，返回真实图片。',
    framing,
    `当前功能：${preset.name}。${preset.instruction}`,
    ['full-body','portrait-polish'].includes(operation) ? '本次要精修的可见部位：\n' + AREAS.filter(a => areas.includes(a.id)).map(a => a.instruction).join('\n') : '只修改此功能对应的内容，不顺带重画其他部位。',
    portrait?portraitInstructions(portrait,areas):'',
    STYLES.find(s => s.id === style).instruction, levels[strength],
    '风格与精修只应用到本次功能对应的内容或已选人物部位，不顺带重画未要求修改的区域。',
    operation === 'background' ? '清理背景时保留人物边缘，尤其是发丝、手指与饰品轮廓。' : '默认保留背景、场景与完整取景，除非用户补充描述明确要求改变。',
    preserve ? '保持角色身份、五官辨识度、发色、服装、姿态和原图构图。' : '允许在保持主题和所选画风的前提下调整细节。',
    `用户补充描述：${prompt}`,
    '避免塑料感、过度磨皮、浓重油画肌理和夸张光影。不添加文字或水印。'].join('\n');
}

export function decodeImage(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('请先上传图片。');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('请上传 PNG、JPG 或 WebP 图片。');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 12 * 1024 * 1024 || bytes.length < 12) throw new Error('图片大小需在 12 MB 以内。');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('图片内容与文件格式不符，请换一张图片。');
  return { bytes, extension: match[1] === 'jpeg' ? 'jpg' : match[1] };
}
