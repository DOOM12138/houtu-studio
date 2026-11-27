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

## 第四轮实图

- **图层蒙版边缘通过 98 分验收**。新版在素材像素网格上应用蒙版，再缩放 RGBA。对三个不同透明素材和一个无蒙版反例，alpha 与可见色和独立参考一致。企鹅和雕像的边缘可见色误差分别从 8.588、4.478 降至 0，超过 2 个 8 位等级的边缘像素从 559、535 降至 0。最近邻路径在雕像上导致更明显的边缘误差，未采用。旧工程的已保存成片为旧版本记录，新导出使用新版渲染器。[透明色轮](https://commons.wikimedia.org/wiki/File:Hue_alpha.png) · [企鹅](https://commons.wikimedia.org/wiki/File:Tux.png) · [雕像](https://commons.wikimedia.org/wiki/File:Plato_(transparent).png) · [无蒙版反例](https://commons.wikimedia.org/wiki/File:Hi_definition_apple_cartoon_with_transparent_background.png)
- **ORF／MRW 实拍导入**。旧版在读取原片文件头时拒绝两例。新版通过 LibRaw 完成奥林巴斯 C5050Z 的 1926 × 2576 和美能达 DiMAGE A1 的 2568 × 1928 本机显影。相机／自动白平衡分别建立尝试，8 位编辑图和 16 位母版已实际读取。原片哈希一致。这里记录相机格式恢复和显影行为，未用相机内嵌 JPEG 作为 98 分色彩真值。[Olympus RAW 样本](https://rawsamples.ch/index.php/en/olympus) · [Minolta RAW 样本](https://rawsamples.ch/index.php/en/minolta)

## 第五轮实图

- **照片配方无损 WebP 通过 98 分验收**。质量 100 使用与图层导出一致的无损编码。透明骰子、几维鸟和 PNG 反例的可见 RGB、所有透明度及尺寸均与参考一致，三例 100 分。旧版质量 100 未发生 alpha 失真，但可见 RGB 分别有 145,907 和 271,629 个像素变化。新版为零，文件分别比旧版大约 49% 和 76%，两张仍小于原 PNG。全透明处隐藏 RGB 无视觉贡献，未纳入可见色评分。质量 90 保留较小的有损输出。[透明骰子](https://commons.wikimedia.org/wiki/File:PNG_transparency_demonstration_1.png) · [几维鸟](https://commons.wikimedia.org/wiki/File:Kiwi_bird_transparent_background.png) · [羽片 PNG](https://commons.wikimedia.org/wiki/File:Feather_flight_Furnarius_rufus_OpenTaxa.png)
- **局部调色蒙版**。新笔触计算一次线段覆盖，沿同一路径的 2 点和 21 点画法完全一致。旧版两组素材分别有 39,700 和 33,321 个蒙版像素受采样点密度影响，新版均为 0。保持已保存旧笔触的回放。像素验证限定于蒙版，调色审美仍待独立验收。
- **中性灰加深／减淡／擦除**。稀疏点由连续线段覆盖，白羽和暗色羽毛两组的误差像素分别从 21,438 和 38,148 降到 0，满强度擦除后中心还原。此处以固定笔触参考检验连续性，不计入人物塑形的正式通过数。[白羽家鹅](https://commons.wikimedia.org/wiki/File:Domestic_goose.png)

## 第六轮实图

- **线性与径向渐变蒙版通过 98 分独立验收**。新增渐变以画布像素为坐标。径向蒙版在宽幅和竖幅仍为圆形，45° 线性渐变沿画面角度变化。宽幅和竖幅径向蒙版的平均灰阶误差由 58.763、49.722 降到 0。两组斜渐变最大差 1 个灰阶，平均差低于 0.003。两张不同正例和一张方幅反例均超过 99.99。旧工程和无几何版本的预设沿用原坐标规则，新增预设保存新规则。[帝王蝶](https://specimen.gallery/specimen_assets/14) · [月面照片](https://science.nasa.gov/photojournal/nearside-of-earths-moon-as-seen-by-the-clementine-spacecraft/)
- **高低频四支笔**。新增高低频笔触连续跨越图块。两张不同实图各复测低频匀色、低频取样、高频取样和高频柔化。旧版同一笔画由 2 点改为 85 点时，有 11,691–43,080 个图像像素变化，新版八次均为 0。保护区、alpha 和笔触以外保持原样。半透明餐具另外验证了 16,111 个半透明像素和 150,428 个全透明像素的 alpha，均无变化。这是笔触实际行为检查，各项修图审美仍待独立验收。[透明餐具](https://commons.wikimedia.org/wiki/File:Plasticware_-_isolated.png)

## 第七轮实图

- **跨模块图片交接通过 98 分验收**。横幅方向 6 的 JPEG 显示尺寸从旧回执的 1200 × 1800 修正为 1800 × 1200。竖幅方向 7 的 JPEG 从 1800 × 1200 修正为 1200 × 1800。新建及历史交接回执均使用正向显示尺寸。目标编辑器的图片字节、独立 EXIF 坐标映射与来源步骤一致。两张实拍和一张无方向标记反例均为 100 分。对照所示旧预览为按旧宽高模拟。[EXIF 样片与许可](https://github.com/recurser/exif-orientation-examples) · [无旋转对照](https://science.nasa.gov/photojournal/east-limb-view-of-earths-moon-as-seen-by-the-clementine-spacecraft/)
- **批量 ZIP 交付通过 98 分验收**。针对长中文名、重复选择、旧扩展名与实际格式不同、Windows 保留名进行实包解压检查。超长名保留正确后缀，JPEG 和 WebP 条目按实际 MIME 命名。重复选择的对照由 3 张改为 2 张，两个预期成片均保持原 SHA-256。正常 PNG 反例保留名称和字节。两组正例和反例均为 100 分。该轮与第五轮共用导出类目，分别验证合包和画质。[Windows 文件命名规则](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)

## 第八轮实图

- **本机超分保色与透明度**。v2 不再让全透明像素的隐藏 RGB 进入模型；在保色模式下对每个像素的三个通道应用同一个有界明度偏移。卡西尼和叶片实测中，隐藏色影响的可见像素分别从 210,371 和 107,341 降到 0。卡西尼单通道截断导致的通道差从 2,601 降到 0，透明度逐像素一致。保留 0% 细节的不透明图反例。土星可见区域没有增强，仅作诊断。v1 配方继续执行原算法，两个版本的图块缓存各自校验。[卡西尼](https://commons.wikimedia.org/wiki/File:Cassini_Transparent.png) · [叶片](https://commons.wikimedia.org/wiki/File:Sonchus_oleraceus_leaf.png) · [不透明反例](https://developers.google.com/speed/webp/gallery1)
- **创作合成的透明主体蒙版**。蒙版先以黑色为底将透明度折算成灰度覆盖，再对齐画幅。换背景、特效保护和自动摆放共用读取规则。卡西尼、土星两张实图的换背景误差分别从 268,887、385,700 像素降到 0，特效保护误差分别从 1,545、2,044 降到 0。不透明灰度蒙版反例保持原样。[土星透明素材](https://commons.wikimedia.org/wiki/File:Saturn_transparent.png)

两项均通过各自的 98 分门槛。超分重建的纹理观感继续按实拍高清参考另行验收。

## 第九轮实图

- **平滑推拉**。沿真实笔触线段连续累积带羽化的位移，消除同轨迹的采样点密度差。同一条横向拖动用 2 点和 81 点重放时，旧版藤编与包豪斯窗格分别有 62,716、64,777 个像素不同，新版均为 0。新版与独立数值积分参考逐像素一致，完全保护区和笔触外未改动。[藤编](https://commons.wikimedia.org/wiki/File:Basketwork_wicker_basket_close_up.jpg) · [包豪斯立面](https://commons.wikimedia.org/wiki/File:Fassade_des_Bauhausgeb%C3%A4des,_Dessau_2019.jpg)
- **保护与擦除保护**。新笔触按连续距离生成覆盖，两种实图的保护与部分擦除均与独立几何蒙版一致。旧保护笔疏密差异最多 38,541 个像素，新版为 0。单画布的新增高低频和中性灰笔触也显式保存连续模式。
- **恢复原图**。新笔触连续恢复原像素，并同步擦除同区域的中性灰编辑。两种实图中线漏恢复的像素由 486、434 降到 0，新图与独立灰层参考一致。格纹布料用作无操作反例。[格纹布料](https://commons.wikimedia.org/wiki/File:Tartan_cloth_closeup.jpg)

本轮四项各包含两个正例与一个反例，12 组均达 100 分。已保存并缺少连续标记的笔触继续使用原算法。分数衡量笔触覆盖、位移和像素恢复，面部及身材塑形的审美仍待同人像对照。

## 第十轮实图

- **局部收缩、局部膨胀和平滑推拉**。新笔触逐轴减弱靠近画框时的位移，保护笔和旧项目按原有规则重放。百叶窗左缘与楼梯下缘两张照片中，收缩的越界内侧采样数分别从 3,022、3,003 降至 0，推拉从 43,222、42,919 降至 0。膨胀的画框像素与参考不一致数从 437、434 降至 0。[阿灵顿百叶窗](https://commons.wikimedia.org/wiki/File:Window_shutters_-_Arlington%2C_MA_-_60.jpg) · [维多利亚州立图书馆楼梯](https://commons.wikimedia.org/wiki/File:Spiral_staircase_State_Library_of_Victoria_20180724-003.jpg)
- **对照与验收**。内区用玄武岩柱核对，三种笔触均正常生效，优化前后逐像素一致。使用独立坐标与像素插值作为参考，推拉用数值积分。两张边缘正例及一张内区反例按三种工具共九组，均为 100 分。完全保护区、笔触范围外和保存重放均逐像素通过。这组实图衡量画框几何和纹理过渡，脸型和衣褶的审美仍需真人样张验收。[巨人堤道玄武岩柱](https://commons.wikimedia.org/wiki/File:Giant%27s_Causeway_Basalt_Columns.jpg)
