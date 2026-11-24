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

## 与原产品的区别

官网功能与本网站工具不是同一模型或算法的等价保证。本网站复用用户登录后可用的 ChatGPT 图片能力，提供人物任务、区域、风格和强度控制。实际人物身份保持、手部修复、发丝和服装质感，需要用具体原图验证。

## 1.9 模型选择

- 官方客户端模型列表和线程请求：https://learn.chatgpt.com/docs/app-server 。使用model/list分页与model字段；还通过当前安装的0.172.0客户端生成类型定义，在F盘临时目录核对协议。
- 内置绘图边界：https://learn.chatgpt.com/docs/image-generation 。主模型选择与服务内置图片引擎不同，不将Images API型号列作订阅接口的任意可选绘图模型。
