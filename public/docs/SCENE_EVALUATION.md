# 场景与角色识别 · 小样本校准

原始素材和大图仅留本机。先按发布者信息登记来源、作品角色与环境，再移除文件名、元数据和画外标题提示。两位独立的 Cindy 视觉评估实例只收到匿名图片和同一套结构化提示，逐图给出回答。下表是通过本版本置信规则之后的输出；“场照”等来源标签有时依赖图外信息。封面样本没有视频时间戳。

|样本|出处场景|输出场景|出处标注的角色|输出角色候选|来源|
|---|---|---|---|---|---|
|教程低清裁片 1|场照|场景未定|玛修|未确定|[原始页面](https://www.bilibili.com/video/BV1JeU3YFEEi/) 1:05|
|教程低清裁片 2|场照|场景未定|芙宁娜|未确定|[原始页面](https://www.bilibili.com/video/BV12HvsetE3z/) 0:35|
|教程低清裁片 3|外景|外景|—|未确定|[原始页面](https://www.bilibili.com/video/BV1fLht69Enx/) 0:10|
|教程低清裁片 4|后期合成|场景未定|—|未确定|[原始页面](https://www.bilibili.com/video/BV1CRmEB5Eir/) 24:10|
|教程低清裁片 5|场景不可确定|场景未定|—|未确定|[原始页面](https://www.bilibili.com/video/BV1q4411g7DM/) 0:11|
|教程低清裁片 6|棚拍|场景未定|银狼|未确定|[原始页面](https://www.bilibili.com/video/BV1iT5EzhEHF/)|
|独立公开照片 7|棚拍|棚拍|—|未确定|[原始页面](https://commons.wikimedia.org/wiki/File:Photographic_studio_setup.jpg)|
|独立公开照片 8|场照|场景未定|Hatsune Miku|初音未来|[原始页面](https://commons.wikimedia.org/wiki/File:Cosplayer_of_Hatsune_Miku_at_FF30_20170729c.jpg)|
|独立公开照片 9|外景|外景|—|未确定|[原始页面](https://commons.wikimedia.org/wiki/File:Josh_Liljenquist_serious_portrait_at_Firemen%27s_Park,_2026.jpg)|
|独立公开照片 10|场照|场照|Link|林克|[原始页面](https://commons.wikimedia.org/wiki/File:Cosplay_Link_TP_P1680560.jpg)|
|独立公开照片 11|场景未定|场景未定|Link / Princess Zelda|未确定|[原始页面](https://commons.wikimedia.org/wiki/File:The_Legend_of_Zelda_Skyward_Sword_Cosplay.jpg)|

第一组 6 张低清裁片，4 张有明确来源场景，其中只给出 1 张外景判断，其余 3 张返回场景未定。另 2 张合成或线索不足的图均保留未知。作者有标注的 3 张角色均未报出名字。

第二组 5 张公开照片，4 张有明确场景标签，给出 3 张一致的分类，另 1 张保留未知。第 5 张只见铺地，场景判断为未知。两张单角色正例分别给出初音未来、林克；双人照片未给出单个主角名。高低清两组都没有把不明人物断言成一个已知角色。

样本是针对典型情况选取的小样本，不能推导总体准确率。以上是提示词和置信规则校准，未通过本站真实登录账号运行生成，也未检测实际成片质量或 GPU 模型准确率。全链路回归使用隔离模型回执，另行实测了公开图库的搜索、下载、图片解码与角色条目的作品核对。
