import {createHash} from 'node:crypto';
import {PRESETS} from '../public/catalog.js';
import {PROMPT_VERSION,UNIVERSAL_CHECKS} from '../public/prompt-contract.js';
const legacy={
 'portrait-polish':['二次细化保留既有成品','选定部位程度独立'], 'smooth-belly':['衣褶印花和腰线顺势衔接','背景不被拉弯'], 'full-body':['完整取景保留','可见部位整体协调'],face:['身份和骨相保留','五官衔接自然'],eyes:['瞳孔眼型视线不变','虹膜睫毛不浮夸'],hair:['发束走向自然','发型发色固定'],makeup:['原妆容细化','唇线眼线干净'],skin:['面颈手臂肤色协调','合理毛孔和体积保留'],hands:['手指数量与关节正确','不改姿势与肢体数'],outfit:['褶皱遵循材质重力','纹样接缝覆盖保留'],materials:['皮革织物金属区分','不凭空换材质'],accessories:['饰品数量设计不变','材质边缘可辨'],'hair-flow':['发梢风感轻柔','不换发型或遮脸'],lighting:['人物与场景同一光场','不额外添加夸张光束'],background:['原场景透视保留','杂物移除处自然补全'],'anime-paint':['角色身份及构图不变','厚涂程度与选择一致'],'cos-paint':['真人身份保留','摄影与轻厚涂自然协调'],'remove-people':['主角及同伴保留','背景路人自然移除'],'remove-equipment':['角色道具不误删','灯架电线自然消除'],'clear-background':['保留原场馆而非白棚','净场无重复纹理'],'hair-lift':['发丝受力顺势','发饰与五官保留'],'hair-glow':['辉光响应原光源','无生硬白描边'],'dimension-effects':['效果与选择和程度一致','五官道具不被遮盖'],custom:['按用户原文执行','不擅自叠加预设风格'],
};
export function registerPrompt(tool){
 const criteria=tool.checks||legacy[tool.id];if(!criteria||criteria.length<2||criteria.some(s=>typeof s!=='string'||s.length<4))throw Error('新AI功能必须登记任务验收标准：'+tool.id);
 return {id:tool.id,name:tool.name,group:tool.group,version:tool.promptRevision||PROMPT_VERSION,referenceRole:tool.referenceRole||null,output:tool.output||'image',criteria:[...criteria,...(tool.changes?.includes('medium')?['角色设计、配色、姿态保留','指定新媒介可辨，各类材质区分清楚','局部任务之外保留原媒介','光照透视和接触关系可信，无多肢或新增品牌']:tool.id.endsWith('-extract')?['原物设计、比例、纹样与可见材质保留','无虚构背面、裸体、透明棋盘或品牌文字']:UNIVERSAL_CHECKS)],cases:[{id:'visible-task',goal:criteria[0],source:'相关部位清楚可见，固定原图并比较每版输出'},{id:'invariant-negative',goal:'部位不可见或已自然时不凭空补画；未选区域、身份与设计保持',source:'含遮挡、画外部位或闭嘴的反例'}],method:'实际原图＋精确编译词＋实际出图逐项目视/视觉评估；模拟Bridge只验证接线'};
}
export const PROMPT_SPECS=PRESETS.map(registerPrompt);
export const ANALYSIS_SPECS=[
 {id:'agent.hardware-inspect',version:'agent-hardware-v1',criteria:['实际图片由记录中的本地视觉Agent或云端分析','只观察勾选任务，不虚构真人身份或不可见部位','原始输入、GPU验证和失败回退有真实回执']},
 {id:'agent.hardware-plan',version:'agent-hardware-v1',criteria:['本地路线确实调用视觉语言模型而非规则冒充','所选功能与预算完整校验，不增加未勾选修图','保留所有有序实际输入和模型清单版本']},
 {id:'agent.hardware-check',version:'agent-hardware-v1',criteria:['本地视觉Agent作真实语义检查并接受云端复核','重大或矛盾结果不能自动通过','低配与未知GPU条件下不调用本地模型']},
 {id:'agent.cloud-mask',kind:'image',version:'agent-cloud-models-v1',criteria:['与原图位置比例对齐的白色主体黑色背景','保护完整人物与服装头发，不含路人灯架','输出后用云端实际对照检查；不可靠时等待确认']},
 {id:'agent.cloud-upscale',kind:'image',version:'agent-cloud-models-v1',criteria:['增强细节而不改变身份服装场景和原色','原生生成尺寸与交付尺寸分开记录','普通插值不冒充原生4K或专用本地神经超分']},
 {id:'agent.mask-check',version:'agent-cloud-models-v1',criteria:['真实原图与云端实际蒙版对齐','完整保护主角且排除背景','边缘与覆盖不可靠时暂停确认，不冒充精确抠图']},
 {id:'agent.inspect',version:'retouch-agent-v1',criteria:['观察对应当前原图与勾选项','不识别真人身份，不虚构不可见部位','检索词描述人物服装光影且用途明确']},
 {id:'agent.plan',version:'retouch-agent-v1',criteria:['未勾选功能不进入执行节点','所选媒介和厚涂程度一致','参考角色与实际图片对应，许可不明不直接合成','每步具体提示词与跑图预算可执行']},
 {id:'agent.check',version:'retouch-agent-v1',criteria:['比较实际原图和当前成品','身份光向色温纹理接缝逐项给依据','不把未执行修复说成通过','仅建议所选范围，重大问题等待确认而非循环跑图']},
 {id:'studio.plan',version:'studio-director-v1',criteria:['每张照片与参考用途准确对应','本机处理优先、AI步骤不超预算','未选身材或厚涂不自动增加','保护蒙版和参考缺失时标出待补输入','逐张保留规划模型回执、提示词与独立配方；规划不调用跑图']},
 {id:'portrait.audit',criteria:['八部位观察齐全','不可见部位关掉','建议与当前成品对应']},
 {id:'color.advice',version:'2026.11.25-tone-advice-r1',criteria:['所选暗调亮调或电影取向一致，保留高光和暗部层次','数值在本机引擎范围内','肤色与整体审美有具体依据','不称为RAW或LR色温']},
 {id:'creative.brief',criteria:['实际人物背景角色对应','检索词与角色有关']},
 {id:'creative.reverse',criteria:['图像角色编号正确','参考选择理由与真实图对应','提示词可编辑且不偷换身份']},
 {id:'creative.material-search',criteria:['关键词与当前场景对应','失败可恢复并保留来源']},
 {id:'creative.image',criteria:['按输入角色使用多图','透视光照遮挡协调','原始图及素材来源保留']},
].map(s=>({...s,kind:s.kind||(s.id==='creative.image'?'image':'analysis'),version:s.version||PROMPT_VERSION,method:s.kind==='image'||s.id==='creative.image'?'真实出图与参考对照':'真实图片输入＋结构字段和视觉对应检查'}));
export function requireAnalysisSpec(id){const spec=ANALYSIS_SPECS.find(s=>s.id===id);if(!spec)throw Error('新AI分析必须先登记提示词与实图验收标准：'+id);return spec;}
export const promptHash=prompt=>createHash('sha256').update(prompt).digest('hex');
export function evaluationValue(input){
 const spec=PROMPT_SPECS.find(s=>s.id===input.operation)||ANALYSIS_SPECS.find(s=>s.id===input.operation);if(!spec)throw Error('评估功能未注册。');if(!['pass','partial','fail'].includes(input.verdict))throw Error('请选择通过、部分通过或未通过。');if(typeof input.notes!=='string'||input.notes.trim().length<8)throw Error('请填写具体观察，至少8个字。');
 return {operation:spec.id,version:String(input.version||PROMPT_VERSION).slice(0,80),promptHash:String(input.promptHash||'').slice(0,64),verdict:input.verdict,notes:input.notes.trim().slice(0,3000),caseId:['visible-task','invariant-negative'].includes(input.caseId)?input.caseId:'visible-task',style:String(input.style||'natural').slice(0,30),paintLevel:Number(input.paintLevel)||2,reviewer:input.reviewer==='agent'?'Cindy视觉审阅（非人工）':'用户人工审阅',created:Date.now()};
}
