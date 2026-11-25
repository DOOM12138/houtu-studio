# Agent本机主体分割

MediaPipe Selfie Segmentation 的 ONNX Community 转换版本，用于Windows与Android服务端的轻量CPU/WASM主体蒙版。不是自行训练或蒸馏的模型，不能保证识别所有COS服装、发丝、遮挡或二次元角色。

- 发布者与许可：<https://huggingface.co/onnx-community/mediapipe_selfie_segmentation>，模型卡声明Apache-2.0；沿用上级models/LICENSE.txt。
- 固定版本：`be49485c8e027524be38591817fc5cd31bd9d00e`。
- 来源：`onnx/model.onnx`，462352字节；SHA256：`3241ac4ad8aa35bdaf33946776db29f7c283a413aa0b0dacb9483594b4531aad`。
- 输入：float32 `[1,3,256,256]`，RGB除255，不进行均值／方差归一化；输出`alphas [1,1,256,256]`。
- 原模型卡：<https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf>。

蒙版是模型估计，不确定时暂停等待确认；不以几何形状或模拟数据冒充真实分割。第三方样例与教程视频不随软件发布。
