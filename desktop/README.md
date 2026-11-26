# Windows 桌面版与安装包

厚涂小站 1.22 使用自有 WinForms EXE 窗口与 Microsoft WebView2，显示原有修图工作台。Node、官方开源 Codex 独立 app-server、图像库和模型随软件分发；目标电脑无需安装 Node、Python 或 Cindy。WebView2 已存在时直接使用；缺少时由用户点击安装随包的微软签名引导程序，需要网络。构建 SDK 不等于浏览器运行时。

优先下载 `houtu-studio-版本-Windows-x64-Setup.exe`，选择可写的数据盘目录安装。默认优先使用安装器所在的数据盘；从系统盘运行时优先选择 F 或 D，只有没有其他合适盘时才采用当前用户程序目录。本机开发、构建和验收全部在 F:/厚涂小站，测试安装使用该目录下的空白 tmp 子目录。

Windows 客户端将日志 ZIP、照片成片和工作流附件保存至安装目录的 `data/exports`。底栏显示保存结果，可点「打开导出目录」。本机验收可在 `test/windows-installer.mjs` 的安装包参数后加 `--private-fixture`，用私有回归样张检查 PNG 和 JPEG。公共构建只使用合成样张。

安装后桌面与开始菜单打开 `runtime/HoutuStudio.exe`。原有 `启动网站.cmd` 也优先打开独立窗口；服务器专用入口仍保留。关闭空闲窗口会停止由该窗口启动的本机服务；处理任务时关闭窗口会留在托盘，双击可返回。托盘“退出程序”在处理任务时明确询问是否中断。登录和外部平台页面在系统浏览器打开；宿主窗口只加载已核对实例的本机来源，没有通用文件执行桥。

照片、预设、工作流、客户端授权、窗口浏览数据及下载目录都在安装目录的 data 下。重装与覆盖升级保留 data；卸载只按安装时的文件清单移除程序、快捷方式和注册项，保留 data、缓存及备份。源码目录有 .git 时应使用 Git 更新，安装器拒绝覆盖。

## 体积与依赖

Windows 发布使用官方 Codex 0.172.0 同版本独立 app-server 和 code-mode host，按 desktop/runtime-lock.json 核对归档与 EXE 的 SHA-256，代替完整命令行套件；图像工具与认证协议保持原样。Node 源码开发环境仍可回退到 npm 客户端，Android 显式指定它自己的原生客户端。运行库、模型及其许可保留，不以删除必要模型来缩小体积。

Setup 使用 NSIS 的 LZMA 压缩；ZIP 为兼容旧客户端的便携与更新格式。宿主、WebView2 DLL 和独立客户端全部在现有 runtime 白名单内，旧客户端可验证更新 ZIP；新宿主会在运行库替换前退出，独立更新进程验证新版服务后恢复窗口。回退保留当前私人数据。

1.22是首个桌面宿主版本。要回到1.21或更早的浏览器版，请从GitHub下载对应便携包；桌面宿主会在改动文件前阻止这类自动回退，避免留下失效的EXE快捷方式。后续桌面版本仍使用同一套程序回退与资料保留流程。

SDK、NSIS 编译器与下载缓存只放 .cache/desktop。微软 WebView2 引导程序每次构建核对 Authenticode 发布者与签名；自有 EXE/Setup 尚无商业代码签名，下载需使用本项目 GitHub Release 的 SHA-256 回执。软件本身免费，无站内收费。

## 构建与验收

源码构建需要 Windows x64、.NET Framework C# 编译器、Node 和 Python。执行 `npm run build:desktop` 生成 runtime 中的宿主；便携构建可重用已核对版本与哈希的运行库，已安装用户再次打包不要求开发 SDK。制作 Setup 时将已解包并通过清单校验的 ZIP 目录传给 `scripts/build-installer.mjs --payload 目录`。

- `test/windows-installer.mjs 安装包`：空白目录实际安装、原生窗口渲染、覆盖重装与卸载保留资料；使用 TESTMODE 隔离系统快捷方式和注册项。
- `test/desktop-update.mjs 已验证解包目录`：启动真实宿主、释放运行库、独立替换、重启窗口与保留私人测试文件。
- `npm run test:updates`：网站更新、程序回退、失败恢复与私人数据保留。
- `test/portable-smoke.mjs ZIP`：不依赖系统 Node 的部署、原生图像处理、实际本机4K及再次打包。

上述检查不输入真实账号凭据、不调用 AI 出图。真实账号和图片效果的验证边界继续适用。

运行时与安全依据：[微软分发说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)、[微软宿主安全说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security)、[NSIS 官方分发](https://nsis.sourceforge.io/Download)、[官方 Codex 0.172.0](https://github.com/openai/codex/releases/tag/rust-v0.172.0)。


1.24起，完整包必须包含runtime/codex-code-mode-host.exe（0.172.0），并在desktop-build.json和更新清单中校验；它是代码模式主模型调用绘图等内置工具的必要执行组件。1.23精简包漏带该文件的情况会导致主模型有回复而无图片。新包补齐组件，开始生成前先检查；不通过时提示修复组件，不要求重新登录。新增V8／ICU等许可在vendor-licenses/code-mode-host。
