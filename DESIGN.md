---
name: 厚涂小站
description: 本机二次元厚涂工作台的现有界面记录
colors:
  primary: "#a44e31"
  primary-hover: "#8b3c24"
  primary-soft: "#f5e8df"
  background: "#f6f4ef"
  surface: "#fffefa"
  canvas: "#eeece6"
  ink: "#302e29"
  muted: "#686159"
  line: "#ddd8ce"
  dark-background: "#211f1c"
  dark-surface: "#2b2824"
  dark-canvas: "#25231f"
  dark-ink: "#f0e9df"
  dark-muted: "#b8aea1"
  dark-line: "#4b453d"
  dark-primary: "#e3a081"
typography:
  headline:
    fontFamily: "Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "27px"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontSize: "12px"
rounded:
  micro: "4px"
  small-segment: "5px"
  numeric-input: "6px"
  select: "8px"
  panel: "14px"
  control: "9px"
  segment: "7px"
spacing:
  small: "7px"
  medium: "14px"
  large: "22px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
    height: "46px"
---

# Design System: 厚涂小站

## Overview

记录已实现的中文图片编辑工作台，模式为 Operate。以图片和操作为主，默认轻厚涂、保留动漫感。此记录来自现有代码及浏览器截图，不代表用户批准了独立视觉设计稿。

## Colors

暖纸色底面、朱褐色操作与选中状态。深色模式沿用暖中性色，主操作使用较浅的暖色。成功与失败只在反馈中使用语义色。

## Typography

使用本机中文界面字体。常规正文 14px，辅助和控件文字最低 12px；窄屏标题为 23px。等待时间使用等宽数字。

## Layout

内容最大宽度 1640px。桌面增加 176px 工具栏，图片区与 288px 设置区分列，原图和结果各占一半；1250px 以下工具栏缩为 156px、设置区缩为 264px。
1100px 以下工具栏移到上方并默认折叠；820px 以下预览和设置转为上下排列；480px 以下使用紧凑手机排版，三档强度并排；370px 以下隐藏品牌副文案及本机标签。
1500px 以上图片预览增高。已在 1440px、390px、320px 验证无横向溢出。

## Elevation & Depth

主体通过表面色与单线边框分区，不使用卡片阴影。仅滑动对比分界线使用轻量投影保持可见。

## Shapes

面板使用柔和圆角，控件使用较小圆角。选项通过边框、浅底色与单选状态共同表达选中。

## Components

- 主按钮明确标注“开始厚涂”，缺少原图或账号时禁用。生成中提供停止操作。
- 上传前展示真实空状态；上传后才显示图片元素，不提供伪造的厚涂示例。
- 默认提示词已填入折叠区域，可修改、恢复。
- 图片完成后开放滑动对比和真实文件下载。
- 三种画风使用原生选择框；完整人物的八个部位使用常规复选框。
- 左侧工具库可按类别、关键词筛选；选中工具用既有主色浅底强调。
- 局部选区是覆盖在原图实际显示区域上的矩形线框，也能用百分比输入框精确设置。选区外像素由后端合成保留。
- 下载和“继续精修”放在预览公共底栏，在并排、单图和滑动对比模式都可使用。
- 提示词编辑器位于工作台上方，默认展开。桌面为文本编辑与模板库两列，820px 以下上下排列。自定义模式明确说明不追加工具和画风指令，相关设置禁用；选择工具可回到辅助模式。
- 下方打包区提供模板包含选项、打包进度和下载；账号、照片、作品与日志不在分发包中。
- 有清晰键盘焦点；主题可切换，尊重减少动态效果设置。

## Do's and Don'ts

- 保持中文标签与常见图片编辑操作。
- 保留错误、未登录和等待状态的明确说明。
- 不把测试上传图、滤镜或空白结果标成 AI 生成作品。
- 不将账号登录成功等同于实际图片能力已验证。

## 1.8 风格与程度

修图风格用原生选择框分为「非厚涂精修」和「厚涂风格」。厚涂模式在精修力度上方显示1–10级原生滑块、实时数字读数及本级说明，默认2/10；非厚涂模式显示关闭厚涂的说明。两种强度独立，滑块支持键盘，完整自定义模式隐藏并禁用附加风格控制。沿用现有暖色与深色主题，并检查320px设置面板。
