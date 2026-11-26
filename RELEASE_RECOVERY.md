# 发布失败与跟进

Draft 只表示草稿。GitHub 自动附带的 Source code ZIP／tar.gz 不含运行环境，不能当成 Windows 安装包或 APK。当前正式版本的交付必须同时满足：发布流程成功、Release 为非草稿、正确版本的 Setup、Windows ZIP、两种 APK、SHA-256 清单共五个附件完整，且校验值和长期安卓签名匹配。历史版本按当时格式核对；完整目录和已加的状态标记见 [RELEASE_STATUS.md](RELEASE_STATUS.md)。

## 历史草稿

- **1.22.0**：Windows 打包无法加载 Authenticode 安全模块；[e026faf](https://github.com/DOOM12138/houtu-studio/commit/e026faf) 修复 PowerShell 模块路径继承，不降低签名检查，由1.22.1完成交付。
- **1.23.0、1.23.1**：发布运行被取消，未形成公开安装包，直接取消原因尚无证据确认；已有1.23.2交付。原先仅有 Git 标签，现补为中止草稿档案，不伪造安装包或成功状态。
- **1.29.0**：Android 沙箱拒绝硬链接，工作流复用素材失败。[9f9d9a1](https://github.com/DOOM12138/houtu-studio/commit/9f9d9a1) 为手机使用独占复制并保留内容校验；最终由 [1.29.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.29.2) 完成交付。
- **1.29.1**：后台刷新替换正在按压的按钮、对比画面未完成渲染便断言、半自动节点结束但父队列尚未结算等时序问题分别修复；一次冷启动 WebView 重连返回空对象，日志只确认了异常，不能把重跑通过当作该单次故障根因已证实。[8ed5a93](https://github.com/DOOM12138/houtu-studio/commit/8ed5a93)、[a391432](https://github.com/DOOM12138/houtu-studio/commit/a391432) 后由 [1.29.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.29.2) 完整发布。
- **1.32.0**：模拟器宿主缺 Playwright Android 触控驱动，新增的真实底栏点击无法执行。[3a023ae](https://github.com/DOOM12138/houtu-studio/commit/3a023ae) 明确安装锁定依赖版本的驱动；由 [1.32.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.32.2) 完成验证与交付。
- **1.32.1**：设备测试已经给出 PASS，但常驻 UiAutomator 驱动未结束，收尾挂住。[2063f45](https://github.com/DOOM12138/houtu-studio/commit/2063f45) 增加有界等待和失败回执，[812256b](https://github.com/DOOM12138/houtu-studio/commit/812256b) 停止测试拥有的驱动进程后关闭连接；1.32.2 保留了驱动停止、设备关闭和冷启动回执。

1.30.0、1.31.0、1.32.2 均有公开的五个安装／校验附件，不应与这些草稿混为一谈。1.31.0 首次运行另遇到 Ubuntu 宿主下载可选 CUDA 运行库的 NuGet 网络超时，同一提交重跑通过。现在只对 Android 模拟器宿主的 `npm ci` 设置 `ONNXRUNTIME_NODE_INSTALL=skip`，跳过未使用的额外 CUDA EP 下载；Windows 安装与发布依赖不改，APK 内的 ONNX WASM 实际推理和 4K 测试继续执行。

1.26.0 首次中断后第二次尝试成功；1.27.0 首次 `gh release create` 遇到 GitHub HTTP 500，后续用同一提交完成本机恢复发布；1.31.0 网络失败后重跑成功，三版均标“已恢复”，实际附件与已有SHA清单已核对。1.23.2 的部分 Windows 精简包缺绘图组件、1.24.0 的自动更新缓存调度延迟，分别标“已知问题”，后续在1.24及1.24.1修复。这些状态不与“未完成交付”混同。

模拟器宿主的安装修正已通过[实际Android设备任务](https://github.com/DOOM12138/houtu-studio/actions/runs/45755250825)：APK内ONNX推理、4096长边本机超分、文字图层保存及驱动关闭均继续执行并通过。

## 后续排查规则

1. 先核对当前尝试、失败 job、日志和最终发布状态；不要把旧失败尝试当作仍未交付，也不要把编译成功当作已发布。
2. 网络／下载失败最多对失败 job 做有限重试；功能断言失败先复现并修复，保留失败回执，不跳过或放宽测试。
3. 已公开版本不原地替换，修复递增补丁版本。旧标签与历史不强推、不删除；中止草稿应标明失败和替代版本。
4. 真实图片效果、账号登录及 ARM 真机验收与隔离模拟器结果分开记录，未知保持未知。
5. 标记发布状态时保留安装附件：未完成交付标“发布失败／已中止”，后续补发或重试成功标“已恢复”，已发布但有确认的运行缺陷标“已知问题”。更新状态目录；没有失败证据的源码标签不标失败。
6. 按标签查询Release返回404时，须与完整Release清单及Release编号交叉核对，不直接判定不存在。状态注释用独立标记块保留原说明；改标题／说明后复核附件编号、大小和摘要未变。

## 本机自动跟进

维护电脑可在 Cindy 中绑定“厚涂小站发布跟进与修复”到原对话，每15分钟运行前置检查。`scripts/schedule-checks/check.mjs` 仅使用原有 GitHub CLI 登录读取本仓库发布状态，先核对维护账号；没有新版本、失败或不完整交付时以 exit 2 跳过，不启动模型。新稳定版只核验并更新目录，取消记录只核实标注，尊重有意取消。前置检查只写项目 `tmp/release-followup/` 中的待处理指针，不复制授权、图片和私有日志。`--self-test` 在隔离数据上检查放行、跳过、去重和状态分类，不连接GitHub。

新故障交由原对话按现有授权复现、修复、测试和发版。成功回执写入该目录的 `handled.json` 后才停止重复处理；需要用户介入时暂停跟进并说明原因。用户正在修图或有草稿时保留正在运行的程序，修复在项目盘隔离工作树中进行。此机制需要维护电脑和 Cindy 在线，不是安装到其他用户电脑的强制后台服务。
