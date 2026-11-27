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

