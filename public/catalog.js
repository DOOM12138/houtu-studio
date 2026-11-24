// Original task instructions, informed by public feature descriptions; not vendor prompts.
export const STYLES = [
  { id: 'anime', painting: true, name: '二次元厚涂', description: '动漫感、柔和色块与自然笔触', instruction: '二次元数字厚涂风格，保持动漫角色辨识度，用干净的色块与柔和明暗塑造体积，弱化生硬线稿，笔触顺应形体，不转为写实油画或塑料3D。' },
  { id: 'cos', painting: true, name: 'COS 质感厚涂', description: '保留真人与服装质感，细化角色妆造', instruction: 'COS人像质感厚涂，保留原图真人身份、面部结构与摄影空间感，在妆容、眼睛、假发和服装上加入细腻的二次元厚涂处理；不要把真人完全变成平面卡通，也不要过度美颜。' },
  { id: 'natural', painting: false, name: '保留原画风（非厚涂）', description: '照片保留照片感，插画保留原有画风，不加厚涂', instruction: '非厚涂模式：保留原图既有媒介、真实程度、线条和画风，只修整本次选择的细节。不增加绘画笔触、厚涂色块或油画肌理，不将照片卡通化，不重绘已有插画风格。' },
  { id: 'photo', painting: false, name: '自然摄影精修（非厚涂）', description: '保留摄影光感和真实纹理，适合真人与 COS 照片', instruction: '非厚涂摄影精修：保持原照片的真人身份、镜头透视、真实肤质、发丝和织物纹理，克制整理瑕疵、妆面与光影，不增加绘画笔触或厚涂色块，不做卡通化、插画化或塑料磨皮。' },
];

export const AREAS = [
  { id: 'face', name: '面部五官', instruction: '细化面部体积和五官衔接，保留原本脸型、神态与身份，不换脸。' },
  { id: 'eyes', name: '眼睛细节', instruction: '整理虹膜、眼睑、睫毛与眼神光，保持眼型、瞳色、视线方向和左右协调，不放大眼睛。' },
  { id: 'hair', name: '头发假发', instruction: '整理发束走向、发际线与碎发，用疏密有序的发束表现厚度，保留原发型与发色。' },
  { id: 'skin', name: '皮肤肤色', instruction: '统一脸、颈部、手臂和可见腿部的肤色与明暗，修整突兀瑕疵，保留皮肤或原画的自然纹理，不一味提白。' },
  { id: 'hands', name: '手部肢体', instruction: '检查可见手指、手腕、手臂和腿部的衔接与结构，只修正明显异常，不改变姿势、身体比例或肢体数量。' },
  { id: 'outfit', name: '服装褶皱', instruction: '整理不合理的服装褶皱、接缝和轮廓，让褶皱顺应姿势与重力，保留设计、图案、覆盖范围与配色。' },
  { id: 'accessories', name: '饰品材质', instruction: '细化原有饰品、发饰与道具结构，区分布料、皮革、金属和宝石的质感，不新增或删除配件。' },
  { id: 'light', name: '全身光影', instruction: '统一人物从头到脚可见区域的光源方向、冷暖、阴影软硬与环境反光，使人物与原背景自然协调。' },
];
export const DEFAULT_AREAS = AREAS.map(area => area.id);

export const PRESETS = [
  {id:'portrait-polish',name:'人物二次精修',group:'人物精修',short:'沿用成品，细化人物',description:'在已有成品上细化五官、皮肤、发丝、手部与服装，保持当前风格；可用人物蒙版严格保护背景。',style:'natural',instruction:'在当前成品上进行保守的人物细化，保留已经完成的构图、风格、背景、调色和合成，只修整本轮明确选择的部位。'},
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
  { id: 'custom', name: '自定义修图', group: '画面与风格', short: '直接写想修改的地方', description: '用补充描述说明修改目标；可先在原图画局部选区。', instruction: '根据用户的补充描述执行具体图像编辑，保持未要求改变的内容、构图和人物身份。' },
];

// Retouch intensity and painterly style intensity are independent controls.
export const PAINT_LEVELS = [
  {level:1,name:'微量润色',description:'几乎贴近原图，只轻微整理明暗交界。',instruction:'厚涂程度1/10：微量润色，几乎完全贴近原图；只在已选部位轻微柔化明暗交界，不形成明显笔触或大片重绘。'},
  {level:2,name:'轻度厚涂',description:'细腻轻柔，只带少量厚涂感。',instruction:'厚涂程度2/10：轻度厚涂，保留大部分原有纹理与边缘，只用少量柔和色块整理局部体积，笔触尽量不显眼。'},
  {level:3,name:'轻柔塑形',description:'柔和塑造体积，保留原有细节。',instruction:'厚涂程度3/10：轻柔厚涂，适度整合零碎明暗，以细腻短笔触表现局部体积，保留原有细节和主要线条。'},
  {level:4,name:'柔和厚涂',description:'色块逐渐可见，边缘仍细腻。',instruction:'厚涂程度4/10：柔和厚涂，让小面积色块与形体转折清楚可见，轻度归纳纹理和线条，保持柔和、细腻的边缘。'},
  {level:5,name:'适中厚涂',description:'色块与笔触均衡，厚涂感明确。',instruction:'厚涂程度5/10：适中厚涂，以中等面积色块统一人物明暗，笔触可辨且顺应形体，在原有细节与绘画概括之间保持均衡。'},
  {level:6,name:'加强塑形',description:'体积更鲜明，笔触更容易辨认。',instruction:'厚涂程度6/10：加强厚涂塑形，适度合并次要纹理，增强中间调和体积转折，清楚呈现随形笔触，但保留五官与服饰关键细节。'},
  {level:7,name:'清晰笔触',description:'绘画语言更强，边缘有虚实变化。',instruction:'厚涂程度7/10：较强厚涂，以明显但有序的随形笔触重组已选部位，归纳零碎细节，增强边缘虚实与色块层次，不改人物结构。'},
  {level:8,name:'浓郁厚涂',description:'大色块塑形，保留身份与造型。',instruction:'厚涂程度8/10：浓郁厚涂，以较大色块塑造体积，明显概括原纹理，保留必要的精细五官、发型、服饰图案和身份特征。'},
  {level:9,name:'强厚涂',description:'大幅强化笔触，画面更加概括。',instruction:'厚涂程度9/10：强厚涂，明显强化绘画笔触、色块重组和软硬边对比，大幅概括非关键纹理，仍严格保留人物身份、姿态和设计。'},
  {level:10,name:'完整厚涂',description:'所选区域充分厚涂化，不改构图与身份。',instruction:'厚涂程度10/10：在本次允许修改的区域充分厚涂化，以完整统一的色块和笔触重构表面表现，绘画感最强；只改变表现语言，不改变身份、五官结构、姿态、服装设计或未选区域。'},
];
export function normalizePaintLevel(value, strength = 'light') {
  const level = value === undefined ? ({light:2,balanced:5,rich:8}[strength] ?? 2) : value;
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('厚涂程度需为1–10的整数。');
  return level;
}
