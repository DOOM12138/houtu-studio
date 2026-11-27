import {MAX_IMAGE_UPLOAD_BYTES,MAX_IMAGE_BASE64_CHARS,IMAGE_UPLOAD_MESSAGE} from '../public/upload-limits.js';
import {isBellyOperation,bellyOptions,bellyInstructions,bellyCropInstructions} from '../public/belly-options.js';
import {isSceneOperation,isCleanupOperation,sceneOptions,sceneInstructions} from '../public/scene-options.js';
import {normalizeModel} from '../public/model-options.js';
import { PRESETS, STYLES, AREAS, DEFAULT_AREAS, PAINT_LEVELS, normalizePaintLevel } from '../public/catalog.js';
import {portraitOptions,portraitInstructions} from '../public/portrait-options.js';
import {COS_PAINT_LEVELS,PAINT_EDIT_BRIEF,PAINT_SURFACE_GUARD,PAINT_DISTANCE_GUARD,PAINT_FOUR_PHOTO_GUARD,PAINT_FOUR_SCULPT,PAINT_EIGHT_SCULPT,PAINT_EIGHT_FACE_FINISH,referenceGuideInstruction} from '../public/paint-profile.js';
import {DEFAULT_EDIT_BRIEF,featureDefault,aestheticContract,taskOptions,PROMPT_VERSION} from '../public/prompt-contract.js';
export const DEFAULT_PROMPT=DEFAULT_EDIT_BRIEF;
export {PROMPT_VERSION};

export function normalizeEditOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('修图设置无效。');
  const { operation = 'full-body', style = PRESETS.find(p=>p.id===operation)?.style||(isSceneOperation(operation)||isBellyOperation(operation)?'natural':'anime'), prompt = featureDefault(PRESETS.find(p=>p.id===operation)), strength = 'light', preserve = true,
    areas = DEFAULT_AREAS, selection = null, parentId = null, promptMode = 'guided' } = input;
  if (!['guided', 'custom'].includes(promptMode)) throw new Error('提示词模式无效。');
  if (!PRESETS.some(p => p.id === operation)) throw new Error('请选择有效的精修功能。');
  if (!STYLES.some(s => s.id === style)) throw new Error('请选择有效的修图风格。');
  if (!['light', 'balanced', 'rich'].includes(strength)) throw new Error('请选择有效的精修力度。');
  const paintLevel = normalizePaintLevel(input.paintLevel, strength);
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
  const tool=PRESETS.find(p=>p.id===operation);if(tool.fullFrame&&rect)throw Error('此功能需要完整画布，请取消局部选区。');const task=taskOptions(input.task);
  const portrait=operation==='portrait-polish'?portraitOptions(input.portrait):null;
  if(portrait&&!areas.some(id=>portrait.levels[id]>0))throw Error('请至少开启一个部位的细化等级。');
  const scene=sceneOptions(input.scene,operation),belly=bellyOptions(input.belly,operation);
  return { operation, style:isBellyOperation(operation)?'natural':style, scene, belly, model:normalizeModel(input.model), prompt: prompt.trim(), strength, paintLevel, preserve:isBellyOperation(operation)?true:preserve, areas: [...new Set(areas)], selection: rect, parentId, promptMode,portrait,task };
}

function corePaintingPrompt(input) {
  const { operation, style, prompt, strength, paintLevel, preserve, areas, selection, promptMode,portrait,scene,belly,task:taskConfig } = normalizeEditOptions(input);
  const tool=PRESETS.find(p=>p.id===operation),specifiedTarget=taskConfig.target?'允许编辑范围：'+taskConfig.target:'';let framing = selection ? '图1是待编辑的局部裁片，图2只供核对身份、配色与光向。返回图1裁片，保持其取景和长宽比，保留边界曝光、白平衡、透视及纹理连续性，确保回贴无亮边、暗边和色差。指定光效只作用于指定范围。' : '图1是编辑目标。保留原图完整画幅和长宽比，不擅自改成头像特写，不补画画外身体。';
  if (promptMode === 'custom') return ['请使用内置图片编辑工具执行一次编辑，返回真实图片。', framing, `用户自定义完整指令：\n${prompt}`].join('\n');
  if(tool.output==='outpaint')framing='图1是已经增加画布的编辑目标；只填新增边缘，保持图1画幅，不重画原图核心矩形。'+(input.expansion?JSON.stringify(Object.fromEntries(['left','right','top','bottom','width','height','originalWidth','originalHeight'].map(k=>[k,input.expansion[k]]))):'扩图方向和比例由网站准备。');if(tool.id.endsWith('-extract'))framing='图1是物品/服装的来源照片，返回独立纯底参考图，不需要保留原场照构图。';const selectedPainting=STYLES.find(s=>s.id===style)?.painting&&!isCleanupOperation(operation)&&!isBellyOperation(operation)&&!tool.changes?.includes('medium'),photoGuard=selectedPainting&&paintLevel===4?PAINT_FOUR_PHOTO_GUARD+' '+PAINT_FOUR_SCULPT:selectedPainting&&paintLevel===8?PAINT_EIGHT_SCULPT+' '+PAINT_EIGHT_FACE_FINISH:'';
  const paintInstructions=(style==='cos'&&!photoGuard?COS_PAINT_LEVELS[paintLevel-1].instruction:PAINT_LEVELS[paintLevel-1].instruction+PAINT_SURFACE_GUARD)+PAINT_DISTANCE_GUARD;
  const editBrief=selectedPainting&&!photoGuard&&prompt===DEFAULT_EDIT_BRIEF?PAINT_EDIT_BRIEF:prompt,contract=aestheticContract(tool,{painting:selectedPainting});
  if(tool.extended){const task=taskOptions(input.task),chosen=STYLES.find(s=>s.id===style);return ['请使用内置图片编辑工具执行一次编辑，返回真实图片。',framing,photoGuard,`当前功能：${tool.name}。${!selectedPainting&&tool.nonPaintingInstruction?tool.nonPaintingInstruction:tool.instruction}`,`本次程度 ${task.level}/10：低档轻柔、适度处理明确问题，高档仍须保持自然。`,task.target?'指定部位或元素：'+task.target:'未指定具体部位时保守处理，不猜测隐藏结构。',tool.referenceRole?'附加参考图仅用于'+({outfit:'服装款式',pose:'姿态和重心',palette:'冷暖配色',element:'指定元素',makeup:'妆色画法',scene:'场景空间'}[tool.referenceRole])+'，不得照搬参考人物身份。':'',scene?.subject?'要保留的主角：'+scene.subject:'',scene?.protectSubject?'人物像素保护已开启，主要效果安排在允许编辑区域。':'',!photoGuard&&!tool.changes?.includes('medium')?(chosen.painting&&!selectedPainting?'保持原画风和原有媒介。':chosen.instruction):'',selectedPainting?paintInstructions:'',contract,`用户补充描述：${editBrief}`].filter(Boolean).join('\n');}
  if(isBellyOperation(operation)){const preset=PRESETS.find(p=>p.id===operation);return ['请使用内置图片编辑工具执行一次编辑，返回真实图片。',framing,specifiedTarget,contract,`当前功能：${preset.name}。${preset.instruction}`,bellyInstructions(belly),bellyCropInstructions(input.region),selection?'选区外将由本机保持原图；在允许范围内连贯修整腰腹与衣服，上下边界平滑接回原图，不挪动人物或改变取景。':'由图中实际腰腹位置定位；不修改无关人物或区域。',`用户补充描述：${editBrief}`,'不添加文字或水印。'].join('\n');}
  if(isSceneOperation(operation)){const preset=PRESETS.find(p=>p.id===operation),chosen=STYLES.find(s=>s.id===style);return ['请使用内置图片编辑工具执行一次编辑，返回真实图片。',framing,specifiedTarget,photoGuard,contract,`当前功能：${preset.name}。${preset.instruction}`,sceneInstructions(operation,scene),!photoGuard&&!isCleanupOperation(operation)?chosen.instruction:'',!isCleanupOperation(operation)&&chosen.painting?paintInstructions:'',`用户补充描述：${editBrief}`].filter(Boolean).join('\n');}
  const levels = {
    light: '精修力度：轻柔，仅修整明显瑕疵，尽量保留本次不必改动的细节；此力度不控制厚涂程度。',
    balanced: '精修力度：适中，协调本次部位的结构、纹理与光影；此力度不控制厚涂程度。',
    rich: '精修力度：细致，深入整理本次明确选择的细节，仍保留身份和自然质感；此力度不控制厚涂程度。',
  };
  const preset = PRESETS.find(p => p.id === operation);
  const selectedStyle = STYLES.find(s => s.id === style);
  const task = !selectedStyle.painting && preset.nonPaintingInstruction ? `当前功能：保留原风格精修。${preset.nonPaintingInstruction}` : `当前功能：${preset.name}。${photoGuard&&['anime-paint','cos-paint'].includes(operation)?'沿用原片媒介，按可见结构整理局部明暗和材质。':preset.instruction}`;
  return ['请使用内置图片编辑工具执行一次编辑，返回真实图片。',
    framing,
    specifiedTarget,
    photoGuard,
    contract,
    task,
    ['full-body','portrait-polish'].includes(operation) ? '本次要精修的可见部位：\n' + AREAS.filter(a => areas.includes(a.id)).map(a => a.instruction).join('\n') : '只修改此功能对应的内容，不顺带重画其他部位。',
    portrait?portraitInstructions(portrait,areas):'',
    photoGuard?'':selectedStyle.instruction, levels[strength],
    selectedStyle.painting ? paintInstructions : '已关闭厚涂表现，保存的厚涂等级在本模式下不参与生成。',
    operation === 'background' ? '清理背景时保留人物边缘，尤其是发丝、手指与饰品轮廓。' : '默认保留背景、场景与完整取景，除非用户补充描述明确要求改变。',
    preserve ? '保持角色身份、五官辨识度、发色、服装、姿态和原图构图。' : '允许在保持主题和所选画风的前提下调整细节。',
    `用户补充描述：${editBrief}`,
  ].filter(Boolean).join('\n');
}

export function decodeImage(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('请先上传图片。');
  const match = /^data:image\/(png|jpeg|webp);base64,/.exec(dataUrl.slice(0,40));
  if (!match) throw new Error('请上传 PNG、JPG 或 WebP 图片。');
  const encoded=dataUrl.slice(match[0].length),oversized=()=>Object.assign(Error(IMAGE_UPLOAD_MESSAGE),{status:413});
  if(encoded.length>MAX_IMAGE_BASE64_CHARS)throw oversized();
  const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0,body=encoded.slice(0,encoded.length-padding);
  if(!body.length||/[^A-Za-z0-9+/]/.test(body)||encoded.length-body.length>2)throw Error('请上传 PNG、JPG 或 WebP 图片。');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_IMAGE_UPLOAD_BYTES) throw oversized();
  if (bytes.length < 12) throw new Error('图片文件无效。');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('图片内容与文件格式不符，请换一张图片。');
  return { bytes, extension: match[1] === 'jpeg' ? 'jpg' : match[1] };
}

// Explicit local goals take precedence over a tool's broader capability description.
export function paintingPrompt(input){const prompt=corePaintingPrompt(input),options=normalizeEditOptions(input);if(options.promptMode==='custom'||!options.task?.target)return prompt;return prompt+'\n最终编辑范围：'+options.task.target+'。以上功能说明仅作参考，不把指定目标扩大为整轮美化；未点名的部位与细节保持原样。';}
