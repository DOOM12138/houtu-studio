# 本地人物分割模型

Google MediaPipe Selfie Multiclass 256×256，官方未修改的 float32 权重；本项目没有自行训练或蒸馏模型。

- 权重来源：https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
- SHA-256：`c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0`
- 大小：16,371,837 bytes
- 官方模型卡：https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf
- 模型卡已随包保存，许可 Apache-2.0，全文见 LICENSE.txt。
- 分类：背景、头发、身体皮肤、面部皮肤、服装、其他饰品。没有身份识别功能。
- 仅在浏览器本机推理；运行依赖随包携带的 @mediapipe/tasks-vision 0.10.32，首次使用也不需要下载模型。

模型主要针对真人素材，动漫、复杂遮挡、细发丝、透明饰品和逆光可能分错。不是像素级完美抠图；用蒙版叠加检查，再用画笔增减修正。这里不把自动分割作为专业抠图精度承诺。曲线等精确调色是确定性像素计算，与模型预测分开。
