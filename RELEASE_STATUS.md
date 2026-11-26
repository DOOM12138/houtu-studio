# 全部版本发布状态

核查日期：2026-11-26。最新完整验证版：[v1.38.0](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.38.0)。

现有36条应用Release中，29条已公开、7条发布失败／中止；已公开版本中另标3条恢复交付、4条已知运行问题。另有6个历史源码标签和1条安卓构建依赖。具体原因和后续跟进规则见 [RELEASE_RECOVERY.md](RELEASE_RECOVERY.md)，机器可读目录见 [RELEASE_STATUS.json](RELEASE_STATUS.json)。

核查覆盖发布状态、现存工作流尝试、附件清单，以及已提供的SHA清单与GitHub附件摘要；仅最新版本另核对实际Windows安装、安卓模拟器及本机更新回执。旧版并未逐个重新安装或重做AI画质验收。草稿仅维护者可见，失败版本原有Git标签和运行记录保留。

## 发布失败／已中止

- **v1.32.1 · 发布中止·已被替代**：功能测试已PASS，常驻测试驱动收尾未退出，后续修复。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45735671520)；[替代／恢复版 v1.32.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.32.2)。
- **v1.32.0 · 发布失败·已中止**：模拟器宿主缺少Playwright安卓触控驱动，已补齐。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45734215845)；[替代／恢复版 v1.32.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.32.2)。
- **v1.29.1 · 发布失败·已中止**：WebView重连异常、画面渲染等待与队列时序失败；后续版本修复交付。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45693770781)；[替代／恢复版 v1.29.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.29.2)。
- **v1.29.0 · 发布失败·已中止**：Android沙箱拒绝硬链接，素材复用改用独占复制。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45689881021)；[替代／恢复版 v1.29.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.29.2)。
- **v1.23.1 · 发布中止·原因待核实**：运行被取消，直接取消原因未证实，后续已有交付。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45580415228)；[替代／恢复版 v1.23.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.23.2)。
- **v1.23.0 · 发布中止·原因待核实**：运行被取消，直接取消原因未证实，后续已有交付。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45580076544)；[替代／恢复版 v1.23.2](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.23.2)。
- **v1.22.0 · 发布失败·已中止**：Windows PowerShell安全模块路径导致打包失败，后续修复。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45556228988)；[替代／恢复版 v1.22.1](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.22.1)。

## 中断或失败后已恢复

- **v1.31.0 · 重试后已恢复**：NuGet下载可选CUDA组件网络失败，重跑成功；测试宿主安装已加固。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45722872866)；[替代／恢复版 v1.31.0](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.31.0)。
- **v1.27.0 · 发布已恢复**：GitHub创建Release返回HTTP500，随后同提交本机恢复发布并验证。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45645379331)；[替代／恢复版 v1.27.0](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.27.0)。
- **v1.26.0 · 中断后已恢复**：首次取消，第二次成功；现有附件和校验清单完整。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45618762939)；[替代／恢复版 v1.26.0](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.26.0)。

## 发布成功但有已知运行问题

- **v1.34.0 · 已知问题·扩图原图视角**：扩边占位底图曾被当成原图显示或复用；工作流保留的原始素材未删除，[v1.35.0](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.35.0)已验证修复。旧安装附件保留。
- **v1.33.0 · 已知问题·图层蒙版**：部分上传／人物蒙版在预览及缩放时可能失败或错位；[v1.34.0](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.34.0)已验证修复，原安装附件保留。
- **v1.24.0 · 已知问题·后续已修复**：自动检查更新可能多等一轮，1.24.1修复缓存到期调度。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45600624881)；[替代／恢复版 v1.24.1](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.24.1)。
- **v1.23.2 · 已知问题·建议升级**：部分Windows精简包缺绘图组件，1.24起补齐。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45581959351)；[替代／恢复版 v1.24.0](https://github.com/DOOM12138/houtu-studio/releases/tag/v1.24.0)。

## 其余已公开版本

- **v1.38.0 · 发布成功**：5个发布附件。单画布支持 RAW 的 V-Log 灰片、标准 sRGB 切换与 .cube LUT。真实 GH5 原片、松下 LUT、Windows 安装和安卓独立运行已验证。[运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45837215794)。
- **v1.37.0 · 发布成功**：5个发布附件。单画布右栏可切换全自动与半自动；半自动可从75项功能中勾选并逐步确认。Windows实际安装与安卓独立入口通过验证。[运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45828482024)。
- **v1.36.0 · 发布成功**：5个发布附件。三类场景自动精修、角色候选和参考来源，七组教程各五支；Windows实际安装与安卓独立入口通过验证。[运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45811061807)。
- **v1.35.0 · 发布成功**：5个发布附件；高低频与中性灰的安卓独立保存、扩图预览、Windows实际安装及资料保留检查通过。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45786096954)。
- **v1.32.2 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45738695633)。
- **v1.30.0 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45715953559)。
- **v1.29.2 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45697966031)。
- **v1.28.0 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45661346769)。
- **v1.26.1 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45629135942)。
- **v1.25.0 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45610443479)。
- **v1.24.1 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45603253367)。
- **v1.22.1 · 发布成功**：5个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45558260907)。
- **v1.21.0 · 发布成功**：4个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45548978662)。
- **v1.20.0 · 发布成功**：2个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45518287236)。
- **v1.19.0 · 发布成功**：2个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45505349087)。
- **v1.18.0 · 发布成功**：2个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45492921028)。
- **v1.17.0 · 发布成功**：2个发布附件。 [运行记录](https://github.com/DOOM12138/houtu-studio/actions/runs/45487041575)。
- **v1.16.0 · 发布成功**：2个发布附件。 按当期格式发布，无现存release.yml回执。
- **v1.15.0 · 发布成功**：2个发布附件。 按当期格式发布，无现存release.yml回执。
- **v1.14.0 · 发布成功**：2个发布附件。 按当期格式发布，无现存release.yml回执。
- **v1.13.1 · 发布成功**：1个发布附件。 按当期格式发布，无现存release.yml回执。
- **v1.13.0 · 发布成功**：1个发布附件。 按当期格式发布，无现存release.yml回执。

## 历史格式与构建依赖

- v1.13.0、v1.13.1当期只提供Windows ZIP，没有SHA清单；v1.14–1.20为ZIP与SHA，v1.21为含两种APK的四件套，v1.22起增加Setup安装器。均按当时格式核对。
- v1.10.0、v1.11.0、v1.12.0、v1.7.0、v1.8.0、v1.9.0 是历史源码标签，没有公开Release或现存失败回执，因此未标发布失败。
- `android-runtime-v0.172.0-r1` 是安卓编译依赖，不是可安装应用。两个运行库归档均与SHA256SUMS一致；独立manifest.json的GitHub摘要也已验证，应用构建继续按runtime-lock固定归档哈希。

本次14个有异常历史的Release已加醒目标题及说明，已公开安装附件保持原样。
