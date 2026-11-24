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
