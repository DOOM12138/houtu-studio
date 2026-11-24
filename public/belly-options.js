export const isBellyOperation=operation=>operation==='smooth-belly';
export function bellyOptions(input,operation){
 if(!isBellyOperation(operation))return null;input??={};
 if(typeof input!=='object'||Array.isArray(input))throw Error('瘦腹设置无效。');
 const level=input.level??2,fabric=input.fabric??'auto',transition=input.transition??'wide',scope=input.scope??'belly';
 if(!Number.isInteger(level)||level<1||level>10)throw Error('瘦腹力度需为1–10的整数。');
 if(!['auto','fitted','loose','structured'].includes(fabric))throw Error('请选择有效的衣料类型。');
 if(!['smooth','wide'].includes(transition))throw Error('请选择有效的腹部过渡方式。');
 if(!['belly','waist-belly'].includes(scope))throw Error('请选择有效的瘦腹范围。');
 return {level,fabric,transition,scope};
}
export function bellyInstructions(input){
 const value=bellyOptions(input,'smooth-belly');
 const fabric={auto:'先判断腹部是皮肤、贴身面料、宽松衣料还是硬挺服装，尊重实际材质与版型，再修整突兀的腰腹鼓起。',fitted:'贴身衣料随身体适度回收，保留腹部自然体积与必要张力；褶皱从腰头、接缝、纽扣和受力点连续展开，不把面料抹平或拉成橡皮。',loose:'宽松服装保留合理松量、空气感与悬垂，不强迫衣料贴肉；只收整不自然的鼓包，腰腹到衣摆的褶皱应顺着重力与姿势衔接。',structured:'硬挺制服、腰封、皮革或甲胄保留结构厚度和既定版型；不把设计中的立体体积误当腹部赘余，不将硬材料拉软压扁，只微调合理可改变的腰腹贴合。'}[value.fabric];
 return [
  `瘦腹力度 ${value.level}/10：${value.level<=3?'轻柔收整，尽量贴近原图':value.level<=6?'适度收整腹部鼓起，保持自然比例':'更明显但仍自然的收腹，不塑造成极端细腰'}。力度是模型编辑偏好，不是固定腰围厘米数或缩窄百分比。`,
  value.scope==='belly'?'本轮仅平滑收整腹部，不主动瘦胸、削臀、缩肩、拉长腿或整体缩窄人物。':'协调腹部与必要的腰侧连接，胸围、臀型、肩宽、骨盆和四肢比例保持，不把整个人等比拉窄。',
  value.transition==='wide'?'采用较宽的平滑过渡，从上腹、腰侧到下腹及髋上自然渐变，避免局部向内凹陷、硬折边、锯齿轮廓或突兀沙漏腰。':'采用连续柔和的自然过渡，腰腹轮廓圆顺，保留呼吸感和真实体积，不做局部尖锐内推。',
  fabric,
  '腹部已经自然平整时保持合理体积，只协调明显不顺的衣褶，不强行内凹，也不新增未要求的腹肌或身体特征。',
  '同步考虑服装褶皱、腰线、腰带、衣摆与侧缝：上腹到下腹的褶皱疏密和受力方向应连续，坐姿与弯腰处保留合理压褶，不抹掉全部真实衣褶，不凭空制造新褶皱。',
  '保持印花、格纹、条纹、文字、刺绣、纽扣、拉链与接缝的设计和数量，调整后连贯对齐，不拉花、不融化、不把腰带或拉链拧弯，不改变服装覆盖范围。',
  '手或手臂贴在腰腹时，保持手指、手腕和肢体衔接，不将手一起拉瘦、截断或复制；脸型、五官、表情、身份和原姿态保持。',
  '保持人物后方的门框、墙缝、栏杆、地砖及背景直线连续，不随着腹部内推而弯曲或出现波纹，阴影和反光顺应原光源。',
  '保留原图摄影或插画媒介、皮肤与衣料质感，只执行本轮腰腹修整，不附加厚涂、卡通化、换装或全身重塑。',
 ].join('\n');
}
export function bellyRegionOptions(input){const value=bellyOptions(input,'smooth-belly');return {contextRatio:value.transition==='wide'?.32:.24,smoothing:{featherRatio:value.transition==='wide'?.16:.09,maxFeather:128,curve:'smoothstep'}};}

export function bellyCropInstructions(region){
 if(!region)return '';
 const edit=region.edit,values=[region.left,region.top,region.width,region.height,edit?.left,edit?.top,edit?.width,edit?.height];
 if(!values.every(Number.isFinite)||region.width<=0||region.height<=0||edit.width<=0||edit.height<=0)throw Error('瘦腹编辑范围无效。');
 const percent=value=>(value*100).toFixed(1);
 return '图1中的实际编辑矩形约为：左 '+percent((region.left-edit.left)/edit.width)+'%、上 '+percent((region.top-edit.top)/edit.height)+'%、宽 '+percent(region.width/edit.width)+'%、高 '+percent(region.height/edit.height)+'%。外侧只作上下文，不改写。腹部变化集中在这个矩形中部，靠近矩形边缘逐渐回到输入的位置；保持过渡带衣褶方向、格纹和文字的图案相位连续对齐，不移动边缘接缝。仍返回完整图1，网站会取实际编辑范围合回原图。';
}
