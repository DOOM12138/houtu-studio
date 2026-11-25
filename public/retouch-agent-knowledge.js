// Original procedural summaries; no copied video, transcript, artwork or paid lesson.
export const AGENT_KNOWLEDGE_VERSION='tutorial-methods-2026-11-26-v1';
export const AGENT_TUTORIALS=[
 {id:'cos-light-direction',title:'乐色Lesir：场照后期暗调调色＋修脸DLC',url:'https://www.bilibili.com/video/BV175dnBfEHk/',evidence:'公开可播放约300秒的40、140、250秒画面及其中可见字幕；不是完整逐字转录',rules:['先看全身与场地光向，再放大检查面部。','人物面部体积应服从原有光影，不另造相反的主光。','暗调保留人物辨识与衣料层次，不能只压黑整张。']},
 {id:'composite-harmony',title:'Adobe／Aaron Nace：Blend subjects seamlessly using Harmonize',url:'https://www.adobe.com/learn/photoshop/web/blend-subjects-with-harmonize',evidence:'官方完整公开字幕与播放器示例画面；时间点以官方字幕章节为准',rules:['0:29 非破坏编辑与主体蒙版，保留原始图像。','1:20 把主体的高光、阴影和色温统一到背景。','1:57 景深与空间层次需一致。','3:15 叠加内容应随衣料明暗融入，不能成为浮贴平面。']},
];
export const AGENT_ART_RULES=['身份、发型、服装设计和画面取景优先保留。','未勾选的厚涂、身材、特效、合成、调色和超分不得执行。','先清理和人物细化，再做合成；最终影调与细节检查之后才超分交付。','肤色、光向、接触阴影、透视、景深、噪声和材质需要连续。','参考图仅提供指定角色的审美依据，不复制其他人物、文字、水印或标志。','既有成功结果作为检查点；主动重新生成必须建立新分支。'];
export const AGENT_METHODS=AGENT_TUTORIALS.flatMap(source=>source.rules.map(rule=>source.id+'：'+rule));
