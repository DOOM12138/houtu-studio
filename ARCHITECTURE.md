# 前后端与运行边界

本项目是个人本机图片工作台，当前版本 1.16.0。默认一个进程在 127.0.0.1:4317 同时托管静态页面与 JSON API。它不是公网多用户服务。

## 前端

- public/：人物精修主页面、提示词编辑、部位工具、二次精修、版本与局部蒙版操作。
- frontend/：调色与蒙版、特效与合成、工作流管理；engine.js 为共享调色引擎，masks.js 处理分割及蒙版，Web Worker 负责计算。
- scripts/frontend.mjs：独立开发前端，默认 4319；同源代理连接 BACKEND_URL 指定的本机后端，避免将 API 开放给任意来源。

## 后端

- server.mjs：本机 HTTP 路由、会话与 CSRF、精修任务、图片和产物交接、打包入口。
- backend/：工作流持久化、调色预设、公开参考检索、创作合成、多图视觉分析、小红书独立浏览器、人物检查与精修来源链。
- lib/：官方 Codex 客户端桥接、图片裁切与蒙版合成、提示词模板、平台进程与原子文件操作、项目临时环境。
- models/：MediaPipe 多类分割模型、来源、模型卡及许可，供浏览器离线自动蒙版使用。

## 私有数据和发布

- data/：独立 ChatGPT 登录、小红书浏览器 profile、照片、工作流、生成图、提示词和预设；仅本机保存，不进入 Git 或常规软件包。
- tmp/、.cache/：项目所在盘的临时目录与缓存。runtime/、node_modules/ 是本机环境，不进入源码仓库。
- scripts/build-portable.mjs：按白名单打包；release/ 存 ZIP，archive/ 存迁移归档，backups/ 存私有备份，这些均不进入 Git。
- launcher.mjs：启动、识别已有实例及停止服务；scripts/install.ps1 默认在解压目录部署，也可显式指定其他目录。

工作流保存每次尝试和检查点；失败从相应步骤继续，已保存的 AI 原始出图可单独重新合成。付费模型能力和本机计算明确分开，隔离适配器只用于流程测试。

Git 初始基线为当前 1.7.0；更早版本 ZIP 是本机归档，不伪装成此前不存在的 Git 历史。后续每次更新从此基线建立提交和标签。使用方式见 README.md、DEPLOY.md，回退见 GIT_WORKFLOW.md。

模型边界：public/model-picker.js 为三页共享选择器，public/model-options.js 校验模型ID。GET /api/models 从本应用独立客户端读取目录；lib/codex.mjs 对显式选择校验并传入线程和回合。任务保存所选与实际模型，创作缓存纳入所选模型，默认工作流保存首次实际模型以固定重试。主模型和服务侧绘图引擎分别说明。

本机服务器：backend/accounts.mjs记录官方客户端确认的账号标识，backend/library.mjs从所有工作流尝试与旧任务构建图片索引，frontend/server.html和server.js提供本机管理页。私有账号档案、可重建索引与按需缩略图在data/library；官方授权继续在data/codex，图片仍在原有jobs/workflows目录，不重复搬运原图。账号快照在实际AI调用边界捕获，重试检查原账号；仅本机计算不调用账号。

场照与次元：public/scene-options.js提供经过校验的任务参数与自研指令，scene-ui.js管理设置，subject-mask.js处理最大居中连通主体估计、原尺寸蒙版与增减画笔。用户预览为白色保留，发送后台时反色为黑色保留，以复用lib/images.mjs保护合成。compose-only替换保存为独立compositionMaskAsset覆盖，不修改source的原始蒙版或重放AI调用。

平滑瘦腹：public/belly-options.js校验独立力度、衣料与过渡参数，生成衣褶／轮廓／背景几何约束。局部prepare使用任务特定的上下文比例并把smoothing曲线保存到region；finishEditImage读取已保存的曲线执行宽smoothstep羽化。其他工具未设置smoothing时保持原行为。

## 照片项目与配方（1.13）

`backend/studio.mjs`管理选片、项目与持久队列；`studio-recipe.mjs`验证最多12个有序步骤；`local-image.mjs`执行确定性图像处理；`studio-archive.mjs`生成成片包和私有项目备份。`frontend/studio.html`与`studio.js`通过`/api/studio/`交互。pipeline节点依次依赖前一步，每个AI节点通过进程内适配器调用独立retouch子工作流，保存稳定请求键、子任务编号、账号和实际模型。全局互斥覆盖AI、流程和档案操作。

项目在`data/studio/projects/`，配方库在`data/studio/recipes.json`，下载文件在`data/studio/exports/`。运行状态重启后转为中断，不自行继续；匹配的已完成子任务直接取回。新配方版本复用相同的已完成前缀。PNG/JPEG/WebP导出和本机中值滤波、锐化、全局色彩不调用AI。

JSON备份内嵌有SHA-256校验的素材；上限140MB原始素材，上传容器上限210MB。恢复先校验所有素材与关联，再分配新ID，保留旧项目。授权目录、浏览器会话和可执行子任务不随备份迁移；历史AI输出可看，重新生成需明确开新版本。原有data格式和老工作流不迁移覆盖。

## 回贴融合与诊断（1.16.0）

`lib/seam.mjs`提供纯本机颜色校准与边界融合，`lib/images.mjs`供精修、保护蒙版与创作局部清理共用。外围样本需足够、多侧覆盖、非透明且不过曝；各通道具备足够方差、相关系数≥0.985、拟合残差≤4.5及受限增益/偏置才采用整体校准。结构改变、平坦上下文和证据不足时跳过全局匹配。边缘场在小网格求受限平滑修正，深处固定为零，颜色调整不扩散到内部和保护区。蒙版采用预乘RGBA替换；黑色区域与相同像素直接保留，白色内核按编辑结果替换。

每次compose输出保存composition.method与stages诊断，job快照也持久化，较大颜色或取景比例差及无完整内核的过窄区域仅提示复核。保护蒙版缩放时投影原始黑色单元的完整覆盖范围，防止插值意外解锁；色差指标在实际成品上测量，不将保护区内部未显示的AI差异计为接缝。重启和工作流只重合成复用rawAsset、原图及蒙版，无需账号出图。照片项目明确恢复到旧算法节点时，自动调用本机重合成后再接下游；历史成品不自行覆盖。

### DEBUG REPORT

- Symptom: 局部修图可能偏色，保护蒙版或回贴矩形边缘突兀。
- Root cause: 原先主要使用最多16像素线性羽化；没有上下文色调校准，硬蒙版直接混合，透明通道未按预乘颜色处理。
- Fix: lib/seam.mjs与lib/images.mjs增加有条件的上下文拟合、受限边界修正、平滑过渡及透明度；server.mjs记录诊断，backend/studio.mjs复用旧任务原始图升级合成。
- Evidence: 110项自动测试通过；桌面/320px场照保护编辑、关保护恢复原AI图、瘦腹与完整精修浏览器流程通过。3686400像素合成在本机示例约233ms；4000万像素近全幅裁片的隔离压力检查约2.2秒、峰值常驻内存714MiB（测试限制Sharp缓存32MiB）；色差指标仅代表测试夹具，不代表真实人物评分。
- Regression test: test/seam.test.mjs覆盖纹理色差、内部主动修改、选区外/保护区RGBA、灰蒙版、透明边缘、图像外框、比例提醒与重启复用；test/studio.test.mjs覆盖旧版合成仅重算而不再调用AI。
- Status: DONE，算法与工作流已验证；真实照片和AI画质仍需实际素材验收，不作零色差保证。

理论参考：[Poisson Image Editing](https://www.cs.jhu.edu/~misha/Fall07/Papers/Perez03.pdf)与[OpenCV seamless cloning](https://docs.opencv.org/4.x/df/da0/group__photo__clone.html)。这里实现的是有限过渡带内的平滑颜色修正，不是OpenCV完整克隆算子的移植。

## 1.14 提示词、部位与证据

public/feature-expansion.js 定义扩充任务，prompt-contract.js 组合任务不变量；lib/prompt-registry.mjs 将75项图像和6类分析／创作流程登记标准与版本。backend/target-vision.mjs 在独立无登录浏览器运行随包MediaPipe分割、面部与手部模型，target-masks.js 输出可编辑范围；不进行身份识别。结果可手工增减。

backend/feature-images.mjs 负责参考解码、扩图画布和输出尺寸。backend/prompt-lab.mjs 保存私有实图与观察，job-evidence.mjs 从不可变检查点绑定实际请求；生成尝试编号和合成尝试编号分别记录，过期审阅票据拒绝保存。外部来源标为填写者声明。data/prompt-lab 和 data/prompt-evaluations 不发布；公开的prompt-history.js只有历史文字结论。

## 1.15 参考研究与调用记录

paint-profile.js定义COS独立档位与默认融合，reference-curriculum.js提供所有任务的正反例计划和公开研究来源。edit-scope.mjs只计算本机建议范围；用户检查后仍走原有裁片＋全图上下文流程。evaluation-coverage.mjs按真实原图哈希去重，并在相同输入指令下区分有回执的模型。trial-journal.mjs只读私有Cindy试图日志，区分已生成、结果未知和未提交；不连接Host凭据、不替网站静默发起调用。

## 1.16 三类影调

frontend/tonal-looks.js定义三类九款原创参数、强度插值、原图明度／高光余量适配和目标影调分析指令；tone-controls.js负责选择与来源。全局参数进入既有engine.js，预览、原尺寸导出和LUT使用相同变换。tone元数据与全局参数绑定，手动修改后解除活动风格；预设分享保留固化参数与可恢复强度，不包含参考照片。

照片项目在每张原图执行前解析look选择，gradeProcess报告实际settings和tone，写入步骤产物；旧配方look缺失时行为保持。三个本机配方追加在原有编号后面。公开参考读取继续使用HTTPS域名白名单、公共IPv4绑定及逐跳重定向检查。
