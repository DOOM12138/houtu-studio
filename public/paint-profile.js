// Calibrated visual targets, not an opacity percentage or a model-weight setting.
export const PAINT_PROFILE_VERSION='2026.11.27-paint-r7';
export const PAINT_LEVEL_MAX=6;
export const PAINT_SURFACE_GUARD='靠连贯的深浅层次、体积转折和分材质受光增强厚涂。收干净眼线、发缘与衣褶，阴影保留反光和纹理，禁止涂鸦、乱线、粗糙刷痕、碎色斑和硬切的大片色块。';
export const PAINT_EDIT_BRIEF='保留原人物身份、角色设计和摄影光源，在已选部位完成所选档位可辨识的二次元厚涂塑形：眼妆与眼神、面部明暗体积、成束假发各有层次，脸颈光色连贯；不以单纯磨皮或几乎不变代替风格任务。';
const goals=[
 ['近看润色','近看能辨认眼线边缘或一处明暗交界的整理，摄影感占主导。'],
 ['轻量妆造','近看可见眼妆或一组发束的层次，保留大部分原纹理。'],
 ['轻柔塑形','眼妆与面部明暗塑形同时可辨，零碎妆面反光更连贯。'],
 ['清晰眼神','缩图可见眼神与面颊体积的改善，主要发束有深浅穿插。'],
 ['均衡厚涂','眼妆、鼻唇、面部体积与主要发束形成统一效果，厚涂明确且仍为真人。'],
 ['深层质感','眼妆和鼻颊明暗转折更深、更立体，假发有成束深浅和有控制的高光；肤质、织物和金属各有纹理，与真人摄影空间连贯。'],
];
export const COS_PAINT_LEVELS=goals.map(([name,description],i)=>({level:i+1,name,description,instruction:`真人COS厚涂程度${i+1}/10：${description}眼睛位置、视线、瞳色、脸部骨相与表情保留，通过眼线、睫毛、虹膜层次、眼睑阴影和面部明暗塑造眼神与鼻唇；不复制参考人物，不画成另一张脸。假发按原发型归纳大中小发束，配饰与衣装设计保留。${PAINT_SURFACE_GUARD}不以全图提白、油亮塑料皮或粗厚油画笔触替代这些变化。`}));
export function defaultSourceRetention(){return 0;}
export function referenceGuideInstruction(style,{custom=false}={}){return '效果参考只约束本任务的表面表现、细节质量和前后变化方向；图1始终是编辑对象与人物身份来源。只有本功能明确允许的衣装、姿态、配色或场景可以迁移，其余服从原图。成对示例的before只解释问题，after只解释目标，不复制参考人物、文字、水印。用户说明与本次功能范围优先。'+(custom?'':(['cos','anime'].includes(style)?'厚涂表现执行所选档位，不能退化为磨皮。':'当前为非厚涂任务时，只借用所需边缘、光色或材质特征，不带入参考图的厚涂肌理、卡通脸或骨相。'));}
