export const PRODUCT_IDENTITY={name:'厚涂小站',purpose:'自研综合修图工作台',summary:'本机图层与人物编辑、精细调色、原创AI修图、可恢复工作流和Agent，在同一套图片与版本系统中协作。',implementation:'运行不依赖 Photoshop、Lightroom、像素蛋糕、耀或幻象的软件本体。界面、编辑流程、提示词编排与调度由本项目实现；底层公开组件与模型保留来源和许可。'};
export const CAPABILITY_GROUPS=[
 {id:'layers',name:'图层与合成',direction:'PS式工作场景',url:'/layers/',items:[
  {name:'本机图层工程',status:'ready',description:'最多24个图片、文字、调色层；顺序、显隐、锁定、透明度、13种混合方式，保存后仍可逐层编辑。'},
  {name:'变换与独立蒙版',status:'ready',description:'移动、缩放、旋转、翻转，画笔增减、矩形、椭圆、反相与柔边；可上传蒙版或用本机人物分割后修正。'},
  {name:'完整尺寸交付',status:'ready',description:'PNG、JPEG、WebP成片与可编辑工程文件；保存预览和完整尺寸成片分开。'},
  {name:'PSD／智能对象／通道',status:'planned',description:'完整PSD双向互通、智能对象与专业通道系统尚未实现，当前采用本软件原生工程格式。'}]},
 {id:'color',name:'调色与蒙版',direction:'LR式调色流程',url:'/color/',items:[
  {name:'曝光与色彩',status:'ready',description:'白平衡、影调、RGB曲线、8色HSL、颜色分级、暗调／亮调／电影风格与独立局部蒙版。'},
  {name:'预设与参考色彩',status:'ready',description:'保存、分享、导入预设，参考图匹配和全局CUBE导出；批量项目同步已选全局参数。'},
  {name:'RAW与高位深',status:'partial',description:'LibRaw本机显影，原片与16位母版保留；后续编辑为8位sRGB，不是完整无损RAW管线。'},
  {name:'印刷与镜头标定',status:'planned',description:'CMYK、打印软打样、相机标定与完整镜头配置文件仍需专用实现。'}]},
 {id:'portrait',name:'本机人物修图',direction:'高效人像工作台',url:'/portrait/',items:[
  {name:'人物与衣料修整',status:'ready',description:'平滑推拉、收缩膨胀、纹理取样、平滑、加深减淡与恢复；操作和保护区可撤销、保存重开。'},
  {name:'高低频与中性灰',status:'ready',description:'低频匀色／取样、高频纹理取样／柔化；独立50%灰层柔光加深、减淡与擦除。支持检查视图、笔触撤销及原尺寸保存，后续成片仍为8位sRGB。'},
  {name:'语义自动美颜',status:'partial',description:'本机可识别部分人物／面部区域，手动工具处理真实像素；没有商业专有一键美颜引擎或确定厘米数的调整。'}]},
 {id:'ai',name:'AI人物、厚涂与场照',direction:'耀／幻象同类创作方向',url:'/ai/',items:[
  {name:'75项原创AI任务',status:'ready',description:'人物与部位细化、衣褶、假发、眼妆、瘦腹、去路人灯架、原场馆净场、特效、参考迁移和3D质感图片。'},
  {name:'AI扩展画布',status:'ready',description:'按方向或四边独立比例扩展，常用画幅、尺寸与原图位置预览；保护完整原图区域，保存准备／生成／合成尝试。实际生成需要已登录账号。'},
  {name:'自然与厚涂1–10',status:'ready',description:'保留原画风、自然摄影、二次元及真人COS厚涂；参考图角色、提示词版本与实际模型分别记录。'},
  {name:'真实效果验收',status:'partial',description:'已有实图与反例记录，仍有待改进项；同类任务入口不代表商业模型、速度或审美效果完全一致。'},
  {name:'独立AI实现边界',status:'partial',description:'不包含对方私有提示词、LoRA、模型或PS原生生成填充。本站使用独立ChatGPT登录下实际可用的能力。'}]},
 {id:'workflow',name:'照片项目与工作流',direction:'选片、同步和交付',url:'/studio/',items:[
  {name:'批量选片与同步',status:'ready',description:'最多200张、单图最高100MB；文件名／星级／状态筛选、排序、快捷选片、批量评分标记及整次撤销，配方和已选参数同步。'},
  {name:'逐步检查点与中途恢复',status:'ready',description:'每步输入、产物、错误和历次尝试可见；全自动、半自动和手动，中间新分支不重跑已确认生成。'},
  {name:'跨板块带图',status:'ready',description:'完整尺寸结果、步骤／Agent／历史快照按确切尝试接续；复制链接保留来源，原图和历史保留，切换不自动出图。'},
  {name:'批量局部蒙版',status:'partial',description:'可同步全局参数，专属人物／手绘蒙版需逐图分析或修正，不能把某张脸的固定选区盲目复制给整组照片。'}]},
 {id:'agent',name:'Agent与模型调度',direction:'本地与云端协作',url:'/studio/',items:[
  {name:'按场景自动精修',status:'ready',description:'逐图分析场照、棚拍、外景和虚构角色候选，按依据找图、修人物和调色。厚涂、小特效分别勾选，线索不足或资料不匹配时按可见造型工作。'},
  {name:'可检查的修图Agent',status:'ready',description:'按勾选功能读图、找参考、规划、修整、检查与交付；调度和跑图模型独立选择，未勾选的步骤不执行。'},
  {name:'按真实硬件路由',status:'ready',description:'低配或未知条件走云端；满足条件时按需准备公开本地视觉Agent，验证GPU驻留后参与分析和检查。'},
  {name:'模型来源与训练',status:'partial',description:'使用公开模型及原创提示编排；没有把模型蒸馏、基础权重训练或全功能真实画质验收冒充已完成。'}]},
 {id:'delivery',name:'独立运行与更新',direction:'自研软件交付',url:'/server/',items:[
  {name:'Windows与独立安卓',status:'ready',description:'Windows EXE／安装包，手机内前后端独立运行；数据留在程序／应用私有目录，其他电脑独立登录。'},
  {name:'日志、历史与公开更新',status:'ready',description:'脱敏日志ZIP、版本档案、Git回退，GitHub稳定包检查、校验与用户自行更新。'},
  {name:'本机4K超分',status:'ready',description:'Real-ESRGAN公开专用模型与图块缓存；超过原生倍率部分明确标为插值。'},
  {name:'相机联机／真实3D模型',status:'planned',description:'联机拍摄、专业AI闭眼选片与真实GLB／OBJ网格尚未实现；现有3D功能输出质感图片。'}]}
];
