# 安卓单机版（开发中）

APK 在手机内部运行图片工作台，不连接电脑。照片、预设、官方客户端登录和工作流只保存在本应用私有目录。AI 图片编辑需要联网并由手机独立登录 ChatGPT；本地调色、蒙版、档案和超分不要求电脑。

当前目标为 Android 10+ 64 位 ARM 手机；另构建 x86_64 用于隔离测试。图片库及 ONNX 推理采用 WASM，移动 Node 24.22.1 来自锁定的 nodejs-mobile 社区适配；该依赖的发布标记为 Prerelease。实际兼容、性能、登录和出图按设备测试记录，不把编译完成当作通过。

开发工具为 Node.js 25、Python 3.11、JDK 21、Android SDK 36 / build-tools 36.0.0。运行 `node scripts/project-node.mjs scripts/build-android.mjs --abi arm64-v8a --sdk SDK目录 --jdk JDK目录`。所有下载与签名材料放项目 `.cache/`，输出放 `release/`；不提交私钥、APK、照片或登录文件。

本地首次构建产生本项目专用签名。后续安装更新必须沿用该签名；CI 正式发布使用专用 Actions secrets，测试 APK 使用隔离签名。应用内更新核对 GitHub 来源、SHA-256、包名、版本和当前签名，再由系统确认。

`runtime-lock.json` 固定运行时来源及 SHA-256；`node-package-lock.json` 固定 JS 依赖。APK 仅取源码、公开模型、运行库和许可证，不导入当前电脑的 data、defaults、账号、照片或提示词私库。手机本机 HTTP 仅监听 127.0.0.1，每次进程启动随机密钥保护所有资源。

与桌面版相比，外部平台参考目前通过手机浏览器和系统照片选择器导入，不读取其他应用的 Cookie。Windows 程序打包与安装更新不在安卓工作台执行。
