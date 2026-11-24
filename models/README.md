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

## 面部与手部范围（1.14）

随包增加Google MediaPipe Face Landmarker和Hand Landmarker Full的官方未修改float16任务包，均为Apache-2.0，全文见LICENSE.txt。它们估算面部／手部关键点，用于限定编辑范围，没有身份识别功能，不是图像生成器，也没有由本项目训练或蒸馏。

- `face_landmarker.task`：3,758,596 bytes，SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`。
- 来源：https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- 模型／许可：https://huggingface.co/litert-community/MediaPipe-FaceLandmarker
- 官方说明：https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- `hand_landmarker.task`：7,819,105 bytes，SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`。
- 来源：https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- 模型／许可：https://huggingface.co/litert-community/MediaPipe-HandLandmarker-Full
- 官方说明：https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker

本机CPU推理，头小、妆造遮挡、动漫脸、背身和复杂手势可能识别失败；小脸会尝试上半身裁片定位。不能可靠定位时需手工选区或蒙版，不把失败当作允许整图重画。手绘范围与自动范围都可检查，透明像素按黑色保护处理。
