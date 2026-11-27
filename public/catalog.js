// Original task instructions, informed by public feature descriptions; not vendor prompts.
import {EXTENDED_TOOLS} from './feature-expansion.js';
import {PAINT_LEVEL_MAX} from './paint-profile.js';
export const STYLES = [
  { id: 'anime', painting: true, name: '二次元厚涂', description: '动漫造型、连贯明暗与干净轮廓', instruction: '二次元数字厚涂风格。以连贯中间调、核心阴影和环境反光表现体积，沿原结构收干净边缘，保留材质和动漫角色辨识度。' },
  { id: 'cos', painting: true, name: 'COS 质感厚涂', description: '可辨的二次元眼妆、面部体积与发束，保留真人摄影感', instruction: 'COS人像质感厚涂，保留原图真人身份、面部结构与摄影空间感，在妆容、眼睛、假发和服装上加入细腻的二次元厚涂处理；不要把真人完全变成平面卡通，也不要过度美颜。' },
  { id: 'natural', painting: false, name: '保留原画风（非厚涂）', description: '照片保留照片感，插画保留原有画风，不加厚涂', instruction: '非厚涂模式：保留原图既有媒介、真实程度、线条和画风，只修整本次选择的细节。不增加绘画笔触、厚涂色块或油画肌理，不将照片卡通化，不重绘已有插画风格。' },
  { id: 'photo', painting: false, name: '自然摄影精修（非厚涂）', description: '保留摄影光感和真实纹理，适合真人与 COS 照片', instruction: '非厚涂摄影精修：保持原照片的真人身份、镜头透视、真实肤质、发丝和织物纹理，克制整理瑕疵、妆面与光影，不增加绘画笔触或厚涂色块，不做卡通化、插画化或塑料磨皮。' },
];

export const AREAS = [
  { id: 'face', name: '面部五官', instruction: '细化面部体积和五官衔接，保留原本脸型、神态与身份，不换脸。' },
  { id: 'eyes', name: '眼睛细节', instruction: '整理虹膜、眼睑、睫毛与眼神光，保持眼型、瞳色、视线方向和左右协调，不放大眼睛。' },
  { id: 'hair', name: '头发假发', instruction: '整理发束走向、发际线与碎发，用疏密有序的发束表现厚度，保留原发型与发色。' },
  { id: 'skin', name: '皮肤肤色', instruction: '统一脸、颈部、手臂和可见腿部的肤色与明暗，修整突兀瑕疵，保留皮肤或原画的自然纹理，不一味提白。' },
  { id: 'hands', name: '手部肢体', instruction: '检查可见手指、手腕、手臂和腿部的衔接与结构，只修正明显异常，不改变姿势、身体比例或肢体数量。' },
  { id: 'outfit', name: '服装褶皱', instruction: '整理不合理的服装褶皱、接缝和轮廓，让褶皱顺应材质、姿势、重力与实际受力点。保留合理松量和必要压褶，腰头到衣摆连续衔接；保持印花、格纹、拉链、纽扣、版型、覆盖范围与配色，不把衣服抹平、拉花或融化。' },
  { id: 'accessories', name: '饰品材质', instruction: '细化原有饰品、发饰与道具结构，区分布料、皮革、金属和宝石的质感，不新增或删除配件。' },
  { id: 'light', name: '全身光影', instruction: '统一人物从头到脚可见区域的光源方向、冷暖、阴影软硬与环境反光，使人物与原背景自然协调。' },
];
export const DEFAULT_AREAS = AREAS.map(area => area.id);

export const PRESETS = [
  {id:'portrait-polish',name:'人物二次精修',group:'人物精修',short:'沿用成品，细化人物',description:'在已有成品上细化五官、皮肤、发丝、手部与服装，保持当前风格；可用人物蒙版严格保护背景。',style:'natural',instruction:'在当前成品上进行保守的人物细化，保留已经完成的构图、风格、背景、调色和合成，只修整本轮明确选择的部位。'},
  {id:'smooth-belly',name:'平滑瘦肚子',group:'人物精修',short:'自然收腹，衣褶顺势衔接',description:'轻柔修整腹部鼓起，平滑衔接腰侧与衣摆，同时考虑衣料松量、印花接缝和背景直线。',style:'natural',instruction:'只做自然平滑的腰腹收整，并协调服装褶皱与轮廓过渡。'},
  { id: 'full-body', name: '整个人物精修', group: '人物精修', short: '从五官到服装，整体协调', description: '精修原图中完整可见的人物，可分别选择五官、头发、皮肤、手部、服装和全身光影。', instruction: '对原图中完整可见的人物进行协调精修，覆盖已选的人物部位。保持全身或半身的原始取景，不把结果裁成头像，不补画画外身体，不改变头身比例、姿态或身体轮廓。' },
  { id: 'face', name: '面部精修', group: '人物精修', short: '五官衔接与面部体积', description: '整理面部结构与明暗，保留脸型、表情和人物身份。', instruction: AREAS[0].instruction },
  { id: 'eyes', name: '眼睛精修', group: '人物精修', short: '虹膜、睫毛与眼神光', description: '细化眼部层次与眼神，保留原眼型、瞳色和视线。', instruction: AREAS[1].instruction },
  { id: 'hair', name: '发丝整理', group: '人物精修', short: '发束与假发走向', description: '清理杂乱碎发与假发边缘，细化发束，不改变发型与发色。', instruction: AREAS[2].instruction },
  { id: 'makeup', name: '妆容整理', group: '人物精修', short: '眼妆、唇妆与角色气质', description: '协调妆容层次，可用补充描述指定妆容；默认不重塑五官。', instruction: '整理角色原有眼妆、眉妆、腮红与唇妆的边缘和层次，让妆面与角色及光线协调；默认不加浓重妆容、不改变脸型，只有补充描述明确指定时才调整妆容。' },
  { id: 'skin', name: '肤色统一', group: '人物精修', short: '脸、颈、手臂与腿部', description: '统一可见皮肤的色彩与光感，保留自然质感和原本肤色。', instruction: AREAS[3].instruction },
  { id: 'hands', name: '手部与肢体', group: '人物精修', short: '修整手指与衔接', description: '修正明显的手指、关节与肢体衔接问题，不改变动作和比例。', instruction: AREAS[4].instruction },
  { id: 'outfit', name: '服装整理', group: '造型细节', short: '褶皱、接缝与轮廓', description: '修整不合理褶皱与接缝，保留原有服装设计与遮盖范围。', instruction: AREAS[5].instruction },
  { id: 'materials', name: '材质精修', group: '造型细节', short: '布料、皮革与金属', description: '区分服装与道具的材料质感，减少糊成一片或塑料化。', instruction: '细化人物原有服装和道具的材质，区分织物纤维、皮革反光、金属高光和透明材质的层次；保留款式、纹样和真实材质类别，不凭空加纹理。' },
  { id: 'accessories', name: '饰品与道具', group: '造型细节', short: '发饰、首饰与小道具', description: '整理角色原有配件的结构、边缘与反光，保留数量和设计。', instruction: AREAS[6].instruction },
  { id: 'hair-flow', name: '发丝飘动', group: '造型细节', short: '自然风感，不换发型', description: '给少量发梢增加自然风感，避免遮挡五官或改变头发长度。', instruction: '仅让原有头发的少量发梢与散发呈现轻微自然风感，保持发型主体、长度、发饰和发色，避开五官，不添加大幅飘带或夸张发量。' },
  { id: 'lighting', name: '人物光影', group: '画面与风格', short: '从头到脚统一光感', description: '统一人物与环境的光源、色温和反光，不增加戏剧性光束。', instruction: AREAS[7].instruction },
  { id: 'background', name: '背景清理', group: '画面与风格', short: '清理干扰，保留人物', description: '移除背景明显干扰物；想移除具体物体时，先画选区并补充说明。', instruction: '清理背景中明显干扰主体的小物件与杂乱细节，按周围环境自然补全，不改变人物、发丝、服装、原有场景类型和整体透视。不要擅自换成纯白背景或另一个场景。' },
  { id: 'anime-paint', nonPaintingInstruction: '保留原有媒介、线条与画风，协调本次选择的人物细节和明暗，不做画风转换。', name: '二次元厚涂', group: '画面与风格', short: '柔和色块与手绘笔触', description: '统一画面的二次元厚涂语言，保持完整构图与角色辨识度。', style: 'anime', instruction: '将画面统一为干净自然的二次元数字厚涂，重点表现人物的体积、柔和色块和顺应形体的笔触；保留原始完整取景与角色特征。' },
  { id: 'cos-paint', nonPaintingInstruction: '细化COS原照片的妆造、假发、眼部、服装和饰品，保留真人身份、摄影光感和真实纹理，不做画风转换。', name: 'COS 质感厚涂', group: '画面与风格', short: '角色妆造与真人质感', description: '针对 COS 照片细化假发、妆容和服装，同时保留真人身份。', style: 'cos', instruction: '针对COS照片精修角色妆造、假发、眼部、服装和饰品，保留真人身份与摄影光感，将厚涂细节融入原照片，不把人物重新设计成另一个角色。' },
  {"id":"remove-people","name":"去人物／路人","group":"场照与次元","short":"保留主角，清理背景人群","description":"去除背景路人和无关摄影师，保留COS主角与指定同伴；可框选需要清除的人。","style":"natural","instruction":"保留原场地，自然清除背景路人。"},
  {"id":"remove-equipment","name":"去灯架","group":"场照与次元","short":"灯架、柔光箱与拍摄穿帮","description":"清理摄影灯架、支架、箱包与电线，保留人物的武器、长柄伞和角色道具。","style":"natural","instruction":"移除拍摄器材穿帮并自然补回原地面和墙面。"},
  {"id":"clear-background","name":"清空背景／场照净场","group":"场照与次元","short":"保留主角，现场背景干净清空","description":"清理漫展背景中的路人、灯架和杂物，保留原场地空间、地面与光线；不换白底或透明底。","style":"natural","instruction":"保留主体，在原场馆完成背景净场。"},
  {"id":"hair-lift","name":"反重力发丝","group":"场照与次元","short":"自然飘发与次元动势","description":"调整原有发梢和少量发束的动势，保留发型、发色与五官。","style":"natural","instruction":"仅为原有发丝增加合理的飘动与反重力表现。"},
  {"id":"hair-glow","name":"发丝辉光","group":"场照与次元","short":"沿光源增强发丝边缘","description":"让原有发丝边缘更通透，保持发型和瞳色，不把头发改成发光塑料。","style":"natural","instruction":"细化原发丝的边缘辉光和光源衔接。"},
  {"id":"dimension-effects","name":"次元氛围特效","group":"场照与次元","short":"轮廓光、雷电、火星与羽毛","description":"按人物与现场光线添加次元效果，程度1–10可调，可用主体保护保留原人物细节。","style":"natural","instruction":"在保留人物与现场构图的基础上加入所选次元特效。"},
  ...EXTENDED_TOOLS,
  { id: 'custom', name: '自定义修图', group: '画面与风格', short: '直接写想修改的地方', description: '用补充描述说明修改目标；可先在原图画局部选区。', instruction: '根据用户的补充描述执行具体图像编辑，保持未要求改变的内容、构图和人物身份。' },
];

// Retouch intensity and painterly style intensity are independent controls.
export const PAINT_LEVELS = [
 {level:1,name:'微量润色',description:'轻微过渡，贴近原图。',instruction:'厚涂程度1/10：只轻微整理局部明暗交界，保留原有边缘与细节。'},
 {level:2,name:'轻度厚涂',description:'细腻轻柔，带少量体积。',instruction:'厚涂程度2/10：轻度厚涂，轻柔整理小范围明暗，保留大部分线条与原纹理。'},
 {level:3,name:'轻柔塑形',description:'结构柔和，细节仍清楚。',instruction:'厚涂程度3/10：适度整合零碎明暗，按形体塑造面部转折，保留主要线条。'},
 {level:4,name:'柔和厚涂',description:'深浅层次清楚，边缘细腻。',instruction:'厚涂程度4/10：增强中间调与局部阴影的层次，暗面保留反光，边缘按原结构收束。'},
 {level:5,name:'细腻厚涂',description:'塑形更明确，材质清晰。',instruction:'厚涂程度5/10：统一选区受光，清楚区分肤质、发束与衣料，靠明暗转折形成厚涂体积。'},
 {level:6,name:'深层厚涂',description:'体积更深，细节和边缘干净。',instruction:'厚涂程度6/10：用更深的中间调、核心阴影与环境反光塑造面部、发束和衣料体积。强化眼妆和原有材质的层次，保持关键五官、纹样、接缝和现场光向。'},
 {level:7,name:'鲜明塑形',description:'面部体积与主发束层次鲜明。',instruction:'厚涂程度7/10：沿原光向强化眼窝、鼻颊和主发束的转折，保留原眼型、眼妆设计与细纹。'},
 {level:8,name:'强质感厚涂',description:'明显颊鼻体积、眼神和分束高光。',instruction:'厚涂程度8/10：层次清楚的颊鼻塑形、清晰眼神与收束的发束反光，原有材质和光影仍可辨。'},
];
export function normalizePaintLevel(value, strength = 'light') {
  const level = value === undefined ? ({light:2,balanced:5,rich:6}[strength] ?? 2) : value;
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('厚涂程度需为1–10的整数。');
  return Math.min(level,PAINT_LEVEL_MAX);
}
