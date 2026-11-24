# 前后端与运行边界

本项目是个人本机图片工作台，当前版本 1.12.0。默认一个进程在 127.0.0.1:4317 同时托管静态页面与 JSON API。它不是公网多用户服务。

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
