# 可选本地视觉Agent

权重不进入Windows安装包或APK。仅在显卡和内存合格、启用硬件路由时，按需准备在项目的`data/local-agent/`；运行时缓存放`.cache/local-agent/`，不使用用户系统盘模型目录。手机当前自动采用云端AI。

模型：Qwen3-VL 4B / 8B，Q4_K_M，Apache-2.0。Ollama官方模型清单的SHA-256锁定于`backend/agent-hardware.mjs`，模型层由Ollama校验，清单版本改变时拒绝自动加载。不是本站训练或蒸馏的模型。

- https://ollama.com/library/qwen3-vl:4b
- https://ollama.com/library/qwen3-vl:8b
- https://registry.ollama.ai/v2/library/qwen3-vl/manifests/4b
- https://registry.ollama.ai/v2/library/qwen3-vl/manifests/8b
- https://github.com/QwenLM/Qwen3-VL

运行时：官方Ollama v0.40.18，MIT，按GitHub资产SHA-256验证，不注册全局服务、不借用其他应用的模型进程或账号。GPU驻留检查通过后才将照片交给本地模型。Ollama及模型原始许可、声明随下载包保留。

https://github.com/ollama/ollama/releases/tag/v0.40.18
https://docs.ollama.com/windows
https://docs.ollama.com/gpu
