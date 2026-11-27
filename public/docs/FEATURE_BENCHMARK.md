# 逐功能实图对照

用同一张图对照已知参考，改一项设置后再跑。将调参阶段与独立验收写在同一清单里，避免把试过的图算入 98 分通过数。分析、工作流和导出用实际输入及预期输出检查，图像功能用实图比较。

## 清单与运行

```powershell
node scripts/project-node.mjs scripts/feature-benchmark-gate.mjs list
node scripts/project-node.mjs scripts/feature-benchmark-gate.mjs check data/private-regression/feature-cases.json local.super-resolution
```

`list` 从提示词注册表、本机人物工具和工作流能力读取覆盖范围。每项显示 `operation` 和有序 `criteria`。省略末尾的功能 ID 会检查整个清单。退出码 0 表示所选范围通过。退出码 1 表示未通过或资料不齐。

清单顶层含字符串 `revision` 和数组 `cases`。每轮用独立的候选版本，比如提交号和配方名组合。每条案例填写以下字段。

- `operation` 从清单取值。 `caseId` 指向唯一拍摄原片或工作流，重裁、重编码后保持同一编号。
- `partition` 使用 `calibration`、`diagnostic` 或 `held-out`。用于选词、选模型或调参的照片登记为 `calibration`。仅可定性审阅的录屏、模拟流程和受控下采样可登记为 `diagnostic`。两类均可追踪结果，均不贡献通过数。
- `artifacts` 保存相对清单目录的文件路径。至少有 `input`。独立验收同时填 `reference`、`baseline` 和 `candidate`。工具从实际文件计算摘要，拒绝目录外文件。分析和流程允许使用实际 JSON 或导出清单。
- 独立验收填 `kind` 为 `positive` 或 `negative`。 `source.basis` 记录出处和配对凭据。图像正例还要填写 `source.url` 和经核实的 `source.sameShot`，并记录参考功能步骤及有无其他编辑。反例可用应保持的输入作为预期结果。
- `receipt.engine` 和 `receipt.evidence` 指明实际运行的模型或本机引擎，以及对应回执或版本。 `reviewer` 和 `notes` 记录由谁核对、哪里匹配、哪里仍有差距。
- `baselineScores` 和 `candidateScores` 按功能清单的 `criteria` 顺序填写 0–100 分。 `protected` 表示原图、保护区域或既定流程不变量是否通过。

每项独立验收至少两张不同正例和一张反例。单条审核项目等权平均，满 98 分且不变量通过才计入通过。主体蒙版的重合度和边缘一致度分别达到 98。独立案例失败或证据不合格，本轮该功能仍待复测。脚本校验材料、去重与判定门槛。纯厚涂仍须通过 [专项验收](../../PROMPT_LAB.md#四类各-5-张的验收进度)。

## 首轮实图

- **本机超分**。从作者的两张高分辨率照片下采样，再用真实 Real-ESRGAN 对比普通插值、40/75/100 档和保色开关。花朵从 75 档到 100 档时，边缘误差从 27.861 降到 27.750。复杂纹理在 100 档反而达到 32.307，40 档从 30.507 降到 29.400。4K 的实际交付尺寸为 4096 × 3072。下采样属于诊断，强度尚无统一默认值。[照片出处](https://timseizinger.github.io/BokehliciousProjectPage/)
- **中性灰**。公开同图对照用前臂和两颊固定区域评估。局部笔触调整后，8 位平均明度差从宽笔触的 8.15 降到 7.74。选定外部区域的变动像素从 1,152 降到 0，2,607 个保护像素未动。这是调参对照。[原图与修后](https://phlearn.com/tutorial/simple-dodge-and-burn-photoshop/)
- **高低频与中性灰结合**。近景示例的大笔触版本使明度差升至 11.55，回收笔触后为 3.39。原图在选区内与教程修后的差只有 0.27，适合检查过修。单项效果与 98 分仍待独立素材。[肤质原图与修后](https://phlearn.com/tutorial/skin-retouching-basics-photoshop/)

真实样本、评分清单、对照图和回执均放在 F 盘本机私有目录。源码提交只公开方法、出处和去标识摘要。

## 第二轮实图

- **参考色匹配已更新**。单独运行匹配时，若尺寸比例和明暗布局都能对应，使用三通道曲线匹配同一画面，压住两端并保留黑白锚点。不同构图回到全局统计匹配。相同统计或强度为 0 时输出原像素。已有预设保存的参数可照旧重放。
- **同图前后复测**。按匹配强度 70% 使用作者发布的网页前后图。六张不同的照片均降低 RGB 平均绝对误差。混光人像由 5.061 降到 2.751，街景由 13.993 降到 10.705，新取的 Camera Raw 人像由 10.381 降到 5.921，日落由 6.000 降到 3.552。混光人像与夜景的明度误差分别从 1.014 到 1.533、8.510 到 9.152，存在回退。不同裁切版本和网页重复照片不增加独立验收计数。作者参考包含独立白平衡、曲线或局部曝光，本轮仅验证参考色工具的效果。[混光人像](https://phlearn.com/tutorial/correct-white-balance-in-photoshop/) · [街景](https://phlearn.com/tutorial/white-balance-photoshop/) · [Camera Raw 调色](https://phlearn.com/tutorial/how-to-color-grade-in-photoshop-using-camera-raw/) · [日落](https://phlearn.com/tutorial/sunset-coloring-light-lr/)
- **扩图回贴**。重放两个既有生成回执，用 12、24、40 像素羽化比较接缝。比例正常样例的梯度误差分别为 1.143、1.098、1.093，三档对原图区均零改动。保留 24 像素，避免把几乎相同的测量当成可见改进。另一例生成画幅偏差 37.4%，继续要求复核。该试验无独立同图修后。

上述误差仅供版本对照。各项正式 98 分验收仍待独立案例。

## 第三轮实图

- **照片配方旋转和翻转**。新建或编辑变换时先顺时针旋转，再按输出画面水平或垂直翻转。历史配方缺少坐标系字段时沿用原轴。用独立坐标映射验证 90° 后水平翻转及 270° 后垂直翻转，两张不同原照都达到 100% RGBA 一致。第三张无操作反例逐像素保持。该变换项目的验收通过。[场照样本](https://phlearn.com/tutorial/remove-debris-trash-photoshop/) · [海滩样本](https://phlearn.com/tutorial/generative-fill-vs-clone-stamp-vs-healing-brush/) · [建筑样本](https://phlearn.com/tutorial/clean-up-photos-four-photoshop/)
- **高质量 JPEG**。照片配方和图层工程从质量 95 开始保留完整色度（4:4:4）。质量 94 及以下仍采用 4:2:0。同为质量 95，三张照片的高饱和区域 RGB 误差分别从 4.907 降至 1.915、4.115 降至 2.215、3.270 降至 2.082。样例文件大约增大 30–38%。本轮实图用于诊断，导出项仍待正式验收。
- **纹理取样**。新笔触连接相邻坐标，取样接近图像边缘时逐渐停止，避免重复铺满边界像素。旧笔触可按原设置重放。天空细线同一笔触的局部明度差从 65.089 降到 9.194，另选笔刷半径和取样点后为 3.783。另一张墙面管线在原取样点下从 34.464 降到 15.041，换用同图较干净的墙面后为 5.976。两张的主体保护检查区零变化。对照是指定线段，作者的修后还有其他编辑，未计独立通过。[天空细线](https://phlearn.com/tutorial/remove-power-lines-photoshop/) · [墙面管线](https://phlearn.com/tutorial/30-days-photoshop-day-11/)
