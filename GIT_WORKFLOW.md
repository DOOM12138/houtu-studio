# 在 F 盘更新和回退

公开仓库：https://github.com/DOOM12138/houtu-studio

此电脑主目录为 F:/厚涂小站。打开此目录的 Cindy 项目，或双击 开发终端.cmd。不要在旧 C 盘会话目录继续开发。其他电脑可以将仓库放在自己选择的数据盘；一键部署默认留在解压目录。

## 开发与提交

1. 在项目目录执行 git status，保留并理解已有改动。工作区干净后使用 git fetch origin，再执行 git pull --ff-only。
2. 用 git switch -c feature/功能名 建分支，完成修改；npm ci 安装锁定依赖，npm run check 和 npm test 验证。界面改动补跑相关 UI 流程。
3. 用 git add 明确暂存文件，用 git diff --cached --stat 和 git diff --cached 检查内容；不得加入账号、照片、data、缓存、归档和发布 ZIP。
4. git commit -m "描述结果"，再 git push -u origin 分支名。已发布的改动通过后续提交修复，不覆盖公开历史。
5. 稳定版本使用带说明的标签，例如 git tag -a v1.7.1 -m "版本说明"，再 git push origin v1.7.1。

main 为已发布基线；功能分支验证后合入 main 再推送。不要直接用未验证版本覆盖正在运行的网站。

## 查看旧版本

先双击 停止网站.cmd；确认 git status 干净，并将私有 data/ 复制到项目盘的 backups/。然后 git switch -c review/v1.7.0 v1.7.0。检查依赖变化后执行 npm ci，再启动测试。返回使用 git switch main。

## 撤销已发布更新

停止网站，保留私有数据备份，确认工作区干净；使用 git log --oneline 找到需要撤销的提交，执行 git revert 提交号。若撤销多个有依赖的提交，按从新到旧逐个处理。检查冲突、完成验证后 git push。

需要把源码整体恢复到某个标签时，先建立回退分支；仅在确认没有未提交改动后执行 git restore --source=v1.7.0 --staged --worktree -- .，检查差异、测试并建立新的回退提交。不要使用 reset --hard 或强推改写已公开历史。

Git 只管理源码。切换版本不会把 data/ 的工作流格式回退，旧程序未必理解新版数据；涉及格式迁移时使用该版本专用的私有备份。不得使用 git clean -fdx 清理项目。

## 新电脑

安装 Git 和 Node.js（当前验证环境为 Node 25），在数据盘执行 git clone https://github.com/DOOM12138/houtu-studio.git，再进入目录、打开 开发终端.cmd、执行 npm ci 和 npm start。无需开发环境时使用完整 Windows x64 便携包；目标电脑独立登录 ChatGPT，不复制其他电脑的登录资料。


## 公开版本与自行更新

公开仓库：https://github.com/DOOM12138/houtu-studio

完整安装包与更新说明：https://github.com/DOOM12138/houtu-studio/releases/latest

1.17 起，打开「本机服务器 → 版本与更新」或双击「检查更新.cmd」。自动检查只获取版本信息，网站运行时会提示新版本；关闭网站后不发送系统通知。也可关闭自动检查。无需 GitHub 账号。

便携版：先下载并校验，然后保存其他网页中的修改，完成或暂停修图、分析、登录及打包任务，再点击「重启并安装更新」。下载支持继续；校验不通过不会安装。程序与 data 安装前备份至本机 backups/software-updates；data 保留原位。启动失败会尝试恢复原程序，也可在此页回退上次升级。回退不恢复旧 data，当前照片、账号、预设与工作流会保留。意外中断可双击根目录「恢复上次更新.cmd」。备份可能较大，确认不再需要回退后自行归档。

源码目录（含 .git）或未完整部署运行环境的目录显示版本提示，但请继续按 GIT_WORKFLOW.md 使用 Git 更新；不会自动覆盖源码。旧于 1.17 的便携版第一次需手动下载新包，停止旧网站，备份 data，再把 data 放入新包目录。GitHub 自动生成的 Source code ZIP 不含便携运行环境，请下载 Windows-x64 ZIP。

维护者：修改版本号与 CHANGELOG，完成检查并提交后推送 v版本号 标签。GitHub Actions 会校验、打包、上传到草稿，确认 ZIP 与 SHA256 文件齐全后才公开发布。失败的草稿不会成为客户端最新稳定版；已公开版本不原地替换，修复请递增版本。分叉发布需同步修改 lib/distribution.mjs 中的更新仓库。

1.21起同一次发版还需通过安卓隔离设备检查，再生成两种架构的签名APK与Windows ZIP；全部附件核对后才公开。安卓运行库从 runtime-lock.json 中的持久版本获取，不依赖短期CI产物。维护者的长期安卓签名在私有 data/android-signing 和专用发布 secrets；清缓存与项目分享均不包含签名，也不要重新生成它。

安卓代码回退同样使用 git revert，之后递增软件版本重新发布。系统常规安装不支持降低应用版本号；Git 回退只回退代码，不回退手机里的照片、工作流或账号数据。Android构建、依赖、签名与验证边界见 android/README.md。
