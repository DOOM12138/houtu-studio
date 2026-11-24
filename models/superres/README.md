# 本机超分模型

这里的两个 ONNX 文件来自 Real-ESRGAN 官方预训练权重，不是本站训练或蒸馏的新模型。模型结构及权重版权：2021 Xintao Wang；BSD-3-Clause 全文见 LICENSE.txt。

- general-x4v3-dn50.onnx：34层卷积的 SRVGGNetCompact，真人／COS／一般照片。官方 general 与 weak-denoise 权重各50%，对应官方默认降噪强度0.5。
- animevideov3.onnx：18层卷积的 SRVGGNetCompact，二次元线条和色块。
- 输入 RGB float32 NCHW 0–1；输出 RGB float32，宽高各4倍；opset17。逐文件、上游权重 SHA-256 和源地址见 manifest.json。

结构来源固定至 Real-ESRGAN a4abfb2979a7bbff3f69f58f58ae324608821e27 的 srvgg_arch.py。转换工具 scripts/convert-superres.py 按相同 Conv/PReLU/PixelShuffle/nearest-residual 运算构造图；限定反序列化对象和官方权重哈希，不执行第三方 pickle 代码。转换构建环境：Python3.11、numpy2.4.2、onnx1.20.1。运行网站无需 Python、PyTorch 或显卡。

运行时使用 onnxruntime-node1.31.1 CPU，独立子进程、默认最多4线程。图块外扩24/40像素保留模型完整感受野，输出在统一全局采样网格重采样，再整体处理细节与色彩，避免独立缩放图块造成接缝。默认仅融合高频亮度细节，保留大尺度明暗及色调；透明边缘保守处理，alpha单独保留。

4K是最长边4096px；另可选3840px UHD长边、2048与8192。保持比例，不强裁16:9。原生模型4倍，超过4倍部分为尺寸插值并明确提示；原图已达到目标时保留原尺寸。0%细节强度明确记录为仅尺寸放大，不声称运行了模型。最大4000万像素、单成片110MB。

模型和引擎身份随配方、输出报告和历史尝试保存。改变推理、采样或融合算法须升 public/superres-options.js 的 SR_VERSION；新模型应使用新ID，不能覆盖旧哈希冒充同一版本。历史身份归一化时保留，执行不兼容的旧配方必须明确建立当前模型的新版本。

超分作为照片项目的 upscale 步骤，导出为独立步骤。完成图块保存在 data/studio/superres-cache/照片编号 下，以输入哈希、模型哈希、算法版本、目标尺寸和图块几何校验。暂停和失败清理本次完整临时输入／输出副本，保留已验证图块和小型诊断。退出网站会停止本机子进程；关闭网页不会停止后台。进程崩溃留下的 runs 目录可在网站停止后归档，原图与成片仍在工作流assets中。

项目备份包含原图、历史、成片及模型身份，不包含模型二进制和推理图块缓存；跨电脑恢复后可下载既有成片，未完成超分需使用内置模型重新计算缺失图块。旧于1.19的程序不认识upscale步骤，回退程序仍保留数据；新步骤请回到1.19或更新版继续。

数值验证：test/fixtures/superres-parity.json 是独立NumPy实现的合成输入参考；不是用户照片。模型真实CPU的尺寸、alpha、图块边界、暂停复用及管线测试在test/super-resolution.test.mjs和test/superres-pipeline.test.mjs。真人、插画实图及4K反例只保存在本机私有data/superres-evaluations，不进公开仓库或发布包。

上游：https://github.com/xinntao/Real-ESRGAN 。运行库及随附Windows DLL的许可分别在vendor-licenses/onnxruntime-1.31.1、directml-1.15.4、dxc-1.8.2502.8；DirectML二进制并非MIT，保留微软软件许可条款。网站选择CPU执行，无需CUDA。
