# 公开资料与实现边界

核对日期：2026-11-24。下面是功能调研依据，不是本网站取得商业产品源码或模型的证明。

## 1.5 平台登录与3D范围

- 小红书官方授权范围：https://openaccount.xiaohongshu.com/docs/scope 。账号基础资料授权不等于笔记内容读取／素材授权。本站采用独立官网浏览器会话，不声称集成了未开通的笔记API。
- 小红书授权接入：https://openaccount.xiaohongshu.com/docs/quick-start 。正式OAuth需应用注册／审核等条件，本站不内嵌不存在的app_secret。
- TripoSR官方仓库：https://github.com/VAST-AI-Research/TripoSR 。真实网格方案需要独立Python／PyTorch及模型环境；本站当前“2D转3D”为生成式3D质感PNG，不是TripoSR或真实GLB／OBJ功能。

## 耀 AI

- https://vip.yao-ai.top/ ：通过浏览器读取其功能展示，包含人像精修、厚涂、发丝/衣服飘动、服装相关处理、摄影打光与环境清理等；页面称部分能力使用独家训练的 LoRA。
- https://yaohub.fun/ ：搜索索引中的耀 AI 人像与 COS 工作流说明；本次直接页面访问失败，未将其未读取的动态内容当作已核实事实。
- 官网链接的使用说明为飞书文档；本次未获取其中的私有提示词或软件实现。

## 幻象 AI

- https://www.hueyingai.cn/about ：COS 人像后期的产品介绍。
- https://www.hueyingai.cn/logs ：人物精修、厚涂妆感、发丝、眼睛等功能与更新记录，区分较自然和较强的厚涂处理。
- https://www.hueyingai.cn/tutorials ：官方公开教程目录。
- https://www.pixcakeai.com/guide/230427 ：平台公开的工具目录，包含幻象的发丝、眼睛、妆感及光影相关工具。
- https://wiki.pixcakeai.com/ai-toolbox/huanxiang-cos/houtu-yanjing ：平台对眼部效果及选区使用的说明。

## 源码与提示词检索结果

检索了产品名和精确官网域名。GitHub 精确域名代码检索没有结果，宽泛“幻象＋厚涂”检索出现同词但无法确认属于该产品的项目。未找到能确认由这两款产品作者公开、且带有可复用许可的源码或完整提示词库；不能把“可本地部署”理解为开源。

本网站没有下载破解安装包、反编译商业软件或复用第三方未授权代码。所有功能指令由本项目原创编写，公开在 `public/catalog.js`，通过 `lib/painting.mjs` 组合。局部裁片、合成与版本保留是本项目自己的实现。

## 1.14 公开功能扩充与实图迭代

2026-11-25复核：[耀AI公开功能展示](https://vip.yao-ai.top/?collab=KVAJNEC2J9)列有流体／粒子特效、服装与动作迁移、2D转3D全图／局部、提取、溶图、FUFU、纯色棚和雪景等；[绘影／幻象更新日志](https://www.hueyingai.cn/logs)最近公开条目为v3.3.9（2026-11-17），含PS原生生成填充；不能把其首页较旧版本或私有引擎当作本站实现。任务方向与边界见FEATURE_PARITY.md。

原创任务扩充保存在public/feature-expansion.js，保守审美约束与任务版本在public/prompt-contract.js；提示词注册及真实样例判定在lib/prompt-registry.mjs。没有复制商业提示词或模型。首轮75项及4项定向复试使用Cindy原生图片编辑、指定openai/gpt-image-2；这是该入口的实际试图，不能替代本站独立官方登录实测。

真实COS样片来自[PxHere照片432394](https://pxhere.com/en/photo/432394)，页面标注CC0，照片已有Beryl Chan署名。原图及改图仅保存在本机私有目录；局部合成保留选区外包括署名的像素。其余全身与插画试图为原创生成的成人虚构素材，未声称是真实人物摄影或商业工具出图。

新增MediaPipe面部与手部官方模型，来源、Apache-2.0许可、哈希和适用限制见models/README.md。公开模型卡来自Google官方说明链接的LiteRT Community发布页。权重未修改，不是自训／蒸馏的修图网络。

## 与原产品的区别

官网功能与本网站工具不是同一模型或算法的等价保证。本网站复用用户登录后可用的 ChatGPT 图片能力，提供人物任务、区域、风格和强度控制。实际人物身份保持、手部修复、发丝和服装质感，需要用具体原图验证。

## 1.9 模型选择

- 官方客户端模型列表和线程请求：https://learn.chatgpt.com/docs/app-server 。使用model/list分页与model字段；还通过当前安装的0.172.0客户端生成类型定义，在F盘临时目录核对协议。
- 内置绘图边界：https://learn.chatgpt.com/docs/image-generation 。主模型选择与服务内置图片引擎不同，不将Images API型号列作订阅接口的任意可选绘图模型。

## 1.11 场照清场与次元方向

- 用户明确：需要保留主体的干净漫展场照，不是白棚或透明PNG。
- 官方工具箱：https://www.pixcakeai.com/guide/230427 。可确认场照清场、消除灯架、飘发、发丝与光影特效等公开功能，以及细节保护层／效果层的高层操作方向。未获得商业私有模型、完整提示词、内部参数或源码；本站为自研实现，不宣称同效果复刻。
- 官方COS工具集合：https://wiki.pixcakeai.com/ai-toolbox/huanxiang-cos 。用于确认功能范围。
- 场馆灯阵实景观察：https://www.jfdaily.com/news/detail?id=958292 ，图片 https://images.shobserver.com/img/2025/08/03/l_CB20250803150913010083.jpg 。仅作为场照背景人群、柔光箱、摄影支架与地面杂物的研究参考，未放入源码或软件包，也未作为虚构AI效果展示。

## 1.15 真人COS前后对照研究

- 用户提供的白发COS原图／修后截图，仅作本机目标说明；不随源码和便携包分发。
- https://www.hueyingai.cn/ ：实际研究厚涂眼睛与皮肤、发束、场馆清场和体态前后对照。只学习可观察效果，不取得商业提示词、权重或引擎。
- https://wiki.pixcakeai.com/guide/9403.html ：实际对照祛瑕、眼袋／卧蚕。https://wiki.pixcakeai.com/guide/9416.html ：衣褶与重力褶皱对照。
- https://vip.yao-ai.top/?collab=KVAJNEC2J9 ：厚涂、服装迁移和连续水流前后示例，用于识别本项目低变化、断续光带等问题。
- https://www.pexels.com/license/ 与 https://www.pexels.com/terms-of-service/ ：新增真人测试照片的来源许可；照片5587981（Polina Tankilevitch）、31419542（Hoàng Tiến Anh）、37206371（TBD Tuyên）、11388574（Диана Дунаева）、30175874（Alina Chernii）。测试文件、摄影师与原始链接保存在私有素材清单，不进入公开包。

公开案例只证明其展示的具体结果；本项目仍需在自己的模型入口执行和审阅。图片原始标识和署名不作为去除目标。
