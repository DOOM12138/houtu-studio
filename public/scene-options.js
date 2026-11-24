export const SCENE_OPERATIONS=['remove-people','remove-equipment','clear-background','hair-lift','hair-glow','dimension-effects'];
export const CLEANUP_OPERATIONS=['remove-people','remove-equipment','clear-background'];
export const DIMENSION_EFFECTS=[{id:'glow',name:'氛围轮廓光',instruction:'在主体后侧与背景加入协调的轮廓辉光和少量光晕，不遮挡五官。'},{id:'lightning',name:'雷电能量',instruction:'在主体周围和背景安排有空间层次的雷电与能量光丝，避开面部，保留手持道具与轮廓。'},{id:'fire',name:'火焰与火星',instruction:'加入装饰性的幻想火焰、余烬和光照反射，不表现人物被烧伤，不改变肤色和服装设计。'},{id:'feathers',name:'飘浮羽毛',instruction:'加入少量有前后景层次、方向统一的飘浮羽毛，前景轻虚化，不遮挡人物五官或主道具。'},{id:'particles',name:'次元光粒',instruction:'加入细腻的漂浮光粒和空间光斑，疏密有序，不把人物淹没在粒子里。'}];
export const isSceneOperation=operation=>SCENE_OPERATIONS.includes(operation);
export const isCleanupOperation=operation=>CLEANUP_OPERATIONS.includes(operation);
export function sceneOptions(input,operation){
 if(!isSceneOperation(operation))return null;
 input??={};if(typeof input!=='object'||Array.isArray(input))throw Error('场照与次元设置无效。');
 const subject=input.subject??'',people=input.people??'bystanders',tone=input.tone??'keep',effect=input.effect??'glow',intensity=input.intensity??3,protectSubject=input.protectSubject??(isCleanupOperation(operation)||operation==='dimension-effects');
 if(typeof subject!=='string'||subject.length>500)throw Error('主体说明请控制在500字以内。');
 if(!['bystanders','selection'].includes(people))throw Error('请选择有效的路人清理范围。');
 if(!['keep','bright','dark'].includes(tone))throw Error('请选择有效的场照明暗。');
 if(!DIMENSION_EFFECTS.some(value=>value.id===effect))throw Error('请选择有效的次元特效。');
 if(!Number.isInteger(intensity)||intensity<1||intensity>10)throw Error('次元程度需为1–10的整数。');
 if(typeof protectSubject!=='boolean')throw Error('主体保护设置无效。');
 return {subject:subject.trim(),people,tone,effect,intensity,protectSubject};
}
export function sceneInstructions(operation,input){
 const scene=sceneOptions(input,operation),cleanup=isCleanupOperation(operation);
 const subject=scene.subject?'保留主体说明：'+scene.subject:'优先保留原图前景、构图中心或最显著的COS主角；不能确定谁是主体时，不擅自清除可能的主角。多人同行主角由补充描述指定。';
 const task={
  'remove-people':'仅移除背景路人、围观者和无关摄影师，保留主体及其同伴（如有明确指定）。自然补回人物遮挡的地面、墙面和原场馆纹理，不留下肢体、倒影、人形残影或重复纹理。',
  'remove-equipment':'仅移除摄影灯架、三脚架、柔光箱、反光板支架、摄影箱包和地面电线等拍摄穿帮。保留人物手持武器、法杖、长柄伞、服装支撑与角色道具，不把所有杆状物误删。被遮挡处按原有地面、墙面与透视补齐。',
  'clear-background':'执行漫展场照原地净场：保留COS主角，清除背景路人、摄影灯架、柔光箱、反光板、箱包、凳子与散落杂物，补成整洁自然的原场馆。延续原地面、基础墙面与空间透视，简化抢眼展牌、护栏和杂乱隔断，使背景干净有层次，保留合理的接触阴影和地面反光。',
  'hair-lift':'只调整主角原有发梢与少量发束的飘动和反重力方向，保留发型主体、发色、发饰和长度，不增出触手式头发、不挡五官，不改变人物姿态。',
  'hair-glow':'只为原有发丝边缘增加顺着现场光源的细腻辉光和通透感，保留发型、发色与发束结构，不把整片头发涂成发光塑料，不改变五官或背景构图。',
  'dimension-effects':DIMENSION_EFFECTS.find(value=>value.id===scene.effect).instruction,
 }[operation];
 const tone={keep:'沿用原有曝光、色调和光源关系，不额外套全局滤镜。',bright:'场景采用协调的明调，背景干净通透，保留高光层次，不把地面与墙面刷成纯白。',dark:'场景采用克制的暗调，适度压暗背景杂乱感，仍保留场馆空间与地面层次，不替换为纯黑底。'}[scene.tone];
 return [subject,task,operation==='remove-people'&&scene.people==='selection'?'本次只清除明确编辑选区内的无关人物；保留选区外全部内容。':'',tone,
  cleanup?'这是场照背景清理，不是人物精修或画风转换。保留人物原有摄影质感、脸型、表情、皮肤纹理、发色、服装与道具；不添加厚涂、卡通化、白棚底、透明底或新场景。':`次元程度 ${scene.intensity}/10：${scene.intensity<=3?'少量、细腻、克制':scene.intensity<=6?'清楚可见、层次协调':'鲜明有张力，但不遮挡五官与人物轮廓'}；只调节本次指定效果，不改变角色身份、脸型、姿势或服装设计。`,
  scene.protectSubject?'本机合成可按主体保护蒙版回贴原图细节，优先完成允许编辑的背景或区域；不要为了绕过保护而改变主体的位置、轮廓和取景。':'未启用像素蒙版保护，仍需按上述约束保留人物身份；不要随意重绘未要求修改的部位。',
  '保留原图完整取景和长宽比，不裁成头像，不补画画外身体，不添加文字或水印。'].filter(Boolean).join('\n');
}
