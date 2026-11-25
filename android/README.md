# 安卓单机版

APK 在手机内部运行图片工作台，不连接电脑。照片、预设、官方客户端登录和工作流只保存在本应用私有目录。AI 图片编辑需要联网并由手机独立登录 ChatGPT；本地调色、蒙版、档案和超分不要求电脑。

当前目标为 Android 10+ 64 位 ARM 手机；另构建 x86_64 用于隔离测试。图片库及 ONNX 推理采用 WASM，移动 Node 24.22.1 来自锁定的 nodejs-mobile 社区适配；该依赖的发布标记为 Prerelease。实际兼容、性能、登录和出图按设备测试记录，不把编译完成当作通过。

开发工具为 Node.js 25、Python 3.11、JDK 21、Android SDK 36 / build-tools 36.0.0。运行 `node scripts/project-node.mjs scripts/build-android.mjs --abi arm64-v8a --sdk SDK目录 --jdk JDK目录`。下载放项目 `.cache/`，长期签名放私有 `data/android-signing/`，输出放 `release/`；不提交私钥、APK、照片或登录文件。

本地首次构建产生本项目专用签名；不要清除 `data/android-signing/`，它决定已安装用户能否继续升级。后续安装更新必须沿用该签名；CI 正式发布使用专用 Actions secrets，测试 APK 使用隔离签名。应用内更新核对 GitHub 来源、SHA-256、包名、版本和当前签名，再由系统确认。

`runtime-lock.json` 固定运行时来源及 SHA-256；`node-package-lock.json` 固定 JS 依赖。APK 仅取源码、公开模型、运行库和许可证，不导入当前电脑的 data、defaults、账号、照片或提示词私库。手机本机 HTTP 仅监听 127.0.0.1，每次进程启动随机密钥保护所有资源。

官方开源 Codex 0.172.0 按 `codex-source.json` 固定的源码提交，为 Android/Bionic 编译。平台补丁只处理 Android 不支持的桌面依赖和 OpenSSL；不替换认证、模型或图片工具，不关闭 SELinux/seccomp。两种 ABI 的持久归档包含补丁、最终 Cargo.lock、LICENSE、NOTICE，并同时固定 CI 产物、归档和 ELF 摘要。来源见 `codex-build-artifacts.json` 与 GitHub 的 `android-runtime-v0.172.0-r1` 预发布；这是构建依赖，不是可安装应用。构建过程不依赖会过期的 Actions artifact。

APK 使用 Android 系统证书，原生代理仅供私有客户端连接所需的官方域名；浏览器登录在手机系统浏览器完成。应用不读取 Cindy 或其他应用的凭据。系统自动备份与设备迁移均排除应用私有目录；要迁移作品，使用照片项目备份导出，账号在新设备重新登录。

与桌面版相比，外部平台参考目前通过手机浏览器和系统照片选择器导入，不读取其他应用的 Cookie。Windows 程序打包与安装更新不在安卓工作台执行。

验证回执与尚未覆盖的场景见 [VALIDATION.md](VALIDATION.md)。当前已通过 Android 16 x86_64 隔离模拟器验证；ARM64 已做打包、签名和运行库静态校验，尚无 ARM64 真机回执。官方登录入口启动与取消已验证，真实账号完成登录、取模及图片效果尚未验收。
