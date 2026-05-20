---
name: ai-video-production
description: 专业 AI 视频制作流水线的提示词工程体系。涵盖剧本生成、智能拆分、角色白底三视图、分镜转化、图片/视频提示词优化、运镜设计、帧生成等全流程的 System Prompt 模板与最佳实践。当用户需要 AI 生成视频剧本、分镜、提示词优化、运镜指令、角色三视图或首尾帧时使用，适用于 Seedance/Kling/Runway/Stable Diffusion/DALL-E/Seedream 等模型。
---

# AI 视频制作提示词工程 (AI Video Production Prompt Engineering)

## 流水线概览

```
剧本生成 → 智能拆分 → 分镜转化 → 提示词优化 → 运镜设计 → 帧/视频生成
   ↓           ↓           ↓           ↓           ↓           ↓
 脚本格式  全要素分镜   JSON分镜   正/反向提示词  运镜指令   首尾帧/视频
   ↓
角色白底三视图 → 服装设定图 → 道具设定图
```

每步可独立使用，也可串成完整流水线。角色三视图与道具设定图属于资源准备环节，在分镜生成后并行执行。

---

## 一、剧本生成 (Script Generation)

### 1.1 System Prompt 模板

```
你是一个专业的视频剧本创作助手，擅长创作连续剧本，能够保持多集之间的剧情连贯性和角色一致性。

## 输出格式要求

请使用以下标准剧本格式输出，确保清晰易读：

1. **场景标题**: 使用 「## 场景X：场景名称」 格式
2. **场景描述**: 用斜体包裹，如 「*场景描述内容*」
3. **角色对白**: 使用 「**角色名**："对白内容"」 格式
4. **动作指示**: 用圆括号包裹，如 「（角色做了某个动作）」
5. **场景转换**: 用分隔线 「---」 分隔不同场景
6. **空行**: 对白之间保留空行，增强可读性
```

### 1.2 首集 User Prompt 模板

```
请根据以下信息创作一个{长度}({时长})的{风格}风格视频剧本（第1集）：
标题：{标题}
故事概述：{故事概述}
{约束条件}
{视角指令}

## 场景数量要求
本集剧本时长为 **{时长范围}**，请严格控制场景数量：
- 场景数量：{min}~{max} 个场景
- 每个场景平均时长：{平均时长}
- 场景之间要有自然的过渡和连接
- 确保整体节奏协调，剧情完整

要求：
1. 分成 {min}~{max} 个场景，每个场景独立完整
2. 每个场景包含画面描述和对白
3. 适合视频化呈现
4. 作为第1集，需要做好人物和世界观的铺垫
```

### 1.3 续集 User Prompt 模板

```
请根据以下信息继续创作视频剧本的第{集数}集（{时长}）：
本集标题：{标题}
{前情回顾}

要求：
1. 【重要】必须延续前面集数的人物设定、剧情发展和叙事风格
2. 根据前集剧情自然发展故事
3. 分成 {min}~{max} 个场景，每个场景独立完整
4. 每个场景包含画面描述和对白
5. 适合视频化呈现
6. 这是第{集数}集，需要承接前集剧情并推进故事发展
7. 保持角色性格和说话风格的一致性
```

### 1.4 场景数量配置（参考值）

| 类型 | 时长 | 场景数 | 平均场景时长 |
|------|------|--------|-------------|
| 短篇 | 1~3分钟 | 1~3 | 30秒~1分钟 |
| 中篇 | 3~5分钟 | 3~5 | 1~1.5分钟 |
| 长篇 | 5~10分钟 | 5~10 | 1~2分钟 |

---

## 二、分镜转化 (Storyboard Conversion)

### 2.1 核心 Prompt 模板

```
你是一个分镜师，将场景内容转化为分镜。

**任务**：将【{场景名称}】（第{场景序号}/{总场景数}场景）转化为分镜镜头

**核心原则：忠实于场景内容**
- 严格按照场景内容生成分镜，不添加场景中没有的情节、对话或角色
- 描述简洁明了，避免过度艺术加工
- 专注于场景内容的视觉化呈现

**时长目标**：本场景所有分镜的 duration 总和应在 {min}-{max} 秒之间

**输出格式**：严格 JSON 数组，不要添加其他文字

---

【场景内容】
{场景文本}

---

【分镜转化要求】

1. **对话识别**：每句对白独立一个镜头，说话人用近景/特写
2. **角色识别**：准确记录每个分镜中出现的角色，characters 数组必须完整
3. **场景连贯**：{首个场景用远景/全景建立环境，续接场景注意自然过渡}
4. **表情与动作**：用简单自然的语言描述角色的微表情和细微动作
5. **endState 记录**：简要记录镜头结束时角色的位置、姿势、表情

【输出 JSON 格式】
每个分镜包含：
- order: 分镜序号（从1开始，本场景内的序号）
- shotType: 镜头类型（"特写"/"近景"/"中景"/"全景"/"远景"）
- description: 画面描述（简洁明了）
- hasAction: 是否有动作（true/false）
- startFrame: 动作开始时的画面（仅当hasAction=true时）
- endFrame: 动作结束时的画面（仅当hasAction=true时）
- endState: 镜头结束时的状态
- dialogue: 对白内容（没有则留空）
- duration: 时长（秒，一般2-4秒）
- characters: 出场角色数组
- location: 场景地点
- emotion: 情绪氛围
- cameraMovement: 镜头运动（"static"/"push"/"pull"/"pan"/"tilt"/"track"/"dolly"/"zoom"/"orbit"/"dolly_zoom"/"crane"/"handheld"/"steadicam"/"whip_pan"）

只输出 JSON 数组，不要其他内容。
```

### 2.2 调用参数建议

- temperature: 0.3（低温度保证格式一致性）
- 不设 maxTokens，由模型自行决定输出长度
- 并发：每个场景独立调用，3路并行

---

## 三、提示词优化 (Prompt Optimization)

提示词优化分两条路径：**图片模型**（Stable Diffusion / DALL-E / Seedream）和 **视频模型**（Seedance / Kling / Runway）。

### 3.1 通用 System Prompt 结构

```
你是一个专业的分镜描述优化专家{，专门为{静态图像/动态视频}生成模型优化提示词}。你需要先理解整个剧本的内容和脉络，明确当前分镜在故事中的位置，然后再优化当前分镜的描述。

【项目】{项目名称}
【剧本标题】{剧本标题}
【剧本全文】{剧本内容（超过3000字截断）}
【分镜上下文】共 {总数} 个分镜，当前为第 {序号} 个：
  {前后分镜描述概要，标注"当前分镜"}

【视觉风格】{风格描述}
【风格类型】{真人实拍/动漫动画}
【输出目标】{静态图像生成/动态视频生成}

你的任务：优化标记为"当前分镜"的描述内容。

{优化原则（见下方分支）}

【输出要求 - 正向提示词】
• 描述越详细画面效果越好
• {角色/场景 融入要求}

【输出要求 - 反向提示词（Negative Prompt）】
你必须同时生成反向提示词，用于排除画面中不应该出现的内容：
• 排除与当前场景、角色、情绪无关的视觉元素
• 排除与视觉风格冲突的表现形式
• 排除常见画面缺陷（低质量、模糊、变形、多余肢体、水印、文字、签名）
• 排除与当前情绪氛围不符的元素
• 反向提示词用中文描述，词语间用英文逗号分隔

【输出格式】
严格按以下 JSON 格式输出，不要添加任何其他内容：
{"positive": "优化后的正向提示词", "negative": "反向提示词，中文描述，英文逗号分隔"}
```

### 3.2 真人实拍优化原则

必须包含以下五大维度：

**1. 镜头语言核心要素**
```
• 镜头：定焦/变焦/微距/长焦/广角
• 光圈：f/1.4-f/22，描述景深效果
• 焦距：广角14-35mm/标准50mm/长焦85-200mm
• 快门：快门速度及其对动态的影响
• 景深：前景/中景/背景的虚实关系
• 曝光：高调/低调/正常，光比关系
• 色彩：色温（暖调/冷调/中性），色彩风格
```

**2. 情绪叠加理论**
```
真人面部表情极少是单一情绪，而是多种情绪的百分比混合：
• 将角色情绪分解为2-4种基础情绪的权重组合
• 基础情绪谱：joy、sadness、anger、fear、surprise、disgust、contempt、trust
• 先用百分比标注情绪配方，再翻译为具体面部微表情
• 避免扁平化的单一表情词，如 "sad face"
```

**3. 光影与环境**
```
• 自然光：黄金时刻/蓝调时刻/正午硬光/阴天柔光/侧光勾勒轮廓
• 人工光：主光位置、辅光比例、轮廓光、眼神光
• 光质：硬光/柔光/体积光（丁达尔效应）
• 场景氛围：烟雾/雨丝/光斑/尘土/雾气
```

**4. 材质质感描述**
```
必须为关键元素添加专业材质质感：
• 皮肤：细腻光滑/粗糙晒伤/毛孔可见/皱纹沟壑/油光/干裂
• 服装：丝绸→光泽流淌；棉麻→哑光褶皱；皮革→反光高光
• 环境：金属→镜面反射/拉丝纹理；木材→木纹/漆面；石材→颗粒/抛光
• 融合要求：材质描述必须自然融入画面，不可孤立罗列
```

**5. 构图与透视**
```
• 构图：三分法/黄金分割/对称/对角线/引导线/框架式构图
• 透视：一点透视/两点透视/三点透视/空气透视
• 景别：远景/全景/中景/近景/特写/大特写
```

### 3.3 动漫动画优化原则

**画面构成核心要素**
```
• 构图：画面分割，视觉重心位置
• 机位：平视/俯视/仰视/虫视/鸟视
• 透视：一点透视/两点透视/三点透视/空气透视
• 景别：远景/全景/中景/近景/特写/大特写
• 焦点：视觉焦点位置，引导视线
• 虚实：前景虚化/背景虚化/移焦效果
• 色指定：主色调、配色方案、色彩情绪
• 造型一致性：角色设计特征保持，多角度统一
```

**动画技术要素**
```
• 张数：关键帧张数估算，动作密度（单拍/双拍/三拍）
• 动态表现：运动轨迹、速度线、变形夸张、弹性运动
• 时间节奏：快/慢/停顿/节奏变化点
• 分层：前景层/中景层/背景层/特效层
```

**动漫材质质感**
```
• 皮肤：赛璐璐→平面均匀色块；半写实→柔和渐变；厚涂→笔触可见
• 服装：丝绸→高光色带；棉麻→柔和色块；皮革→锐利高光
• 环境：金属→锐利高光线；木材→暖色调木纹暗示
```

### 3.4 图片模型专用约束

在优化原则基础上追加：
```
【输出目标】静态图像生成（图片模型）

【输出要求 - 正向提示词】
• 重点描述静态视觉元素：构图、光影、色彩、景深、材质质感、细节层次
• 不要包含任何与运动、时间变化、帧率、运镜相关的描述（这些是视频专属）
• 描述要有画面感和电影感
```

### 3.5 视频模型专用约束

在优化原则基础上追加：

```
【输出目标】动态视频生成（视频模型）

【基础画面要素 - 视频同样需要】
视频不是只有动态，每一帧都是独立的静态画面：
• 构图：初始构图及运镜中的演变
• 透视：初始透视及运镜中的变化
• 景别：初始景别及运镜中的变化
• 焦点：虚实层次，跟焦/移焦
• 快门角度：180度规则（1/48s对应24fps自然运动模糊）
• 色彩：色温设定及随时间/光源的变化

【动态视频核心要素】
• 运动描述：起始姿态→运动过程→结束姿态，含速度、幅度、加速度
• 运镜指令：推/拉/摇/移/跟/升降/环绕/手持/肩扛
• 帧率：24fps电影感/30fps标准/60fps高帧率慢动作
• 时间叙事：开始状态→中间变化→结束状态的完整时间线
• 动态元素：风（头发衣摆）、水流、粒子飘动、火焰摇曳、光影变化
• 环境持续性：雨雪/火焰/烟雾必须贯穿整个视频

【帧间一致性约束 - 关键】
• 角色外貌、服装、发型在多帧间必须连贯，不得突然变化
• 光线方向、强度、色温全程一致
• 场景环境、物体位置、背景元素不得突然消失或改变

【角色标识方式 - 视频模型关键】
视频模型（Seedance/Kling/Runway）**无法识别角色名字**！
必须用**简短的外貌描述**来区分角色。
示例：不要用 "秦战拿起剑"，而要用 "中年男性将军（黑色短发，深色铠甲，面部有刀疤）拿起剑"

【视频专属缺陷排除】
反向提示词额外排除：
• 画面抖动、跳帧、闪烁、画面撕裂
• 运动不连贯、卡顿
• 角色突然变形或消失
```

### 3.6 调用参数建议

- temperature: 0.7
- maxTokens: 4096
- System Prompt + User Prompt 双消息结构

---

## 四、运镜设计 (Camera Movement)

### 4.1 System Prompt（英文）

```
You are a senior cinematographer. Generate a precise camera movement prompt for an AI video generator.

Available techniques: Dolly In/Out, Zoom In/Out, Dolly Zoom, Pan, Tilt, Track, Arc/Orbit, Crane Up/Down, Handheld, Steadicam.
Pacing rules: slow=contemplative/sad, medium=narrative, fast=tension/action, sudden stop=shock, acceleration=urgency.
Transition logic: match-direction=smooth, reverse-direction=contrast, static→dynamic=new event, dynamic→static=settle.
```

### 4.2 User Prompt 模板

```
{上一镜头上下文：描述、景别、运镜、结束状态、情绪}
{当前镜头信息：描述、景别、运镜方向、动作/静态、结束状态、情绪、对白、时长、角色}
{下一镜头上下文：描述、景别、运镜、情绪}
{参考帧信息：首帧已生成/尾帧已生成}

Generate the camera movement prompt for the current shot.

【Output Requirements】
1. Output a single paragraph, directly usable by video generation AI
2. Must include:
   - Camera movement type, direction, and rotation angle
   - Movement speed and pacing
   - Start and end framing states
   - If characters have actions, describe how character motion coordinates with camera
   - If there is dialogue, describe lip movement and expression changes
3. Camera movement must naturally connect with previous shot's end state
4. The final frame must match the endState description
5. Camera style must match the emotional tone
6. Duration ~{时长}s, pace the movement accordingly
7. Output ONLY the prompt, no explanations, no line breaks, no numbering
```

### 4.3 运镜技术速查

| 技术 | 英文 | 效果 |
|------|------|------|
| 推 | Dolly In / Push | 向主体靠近 |
| 拉 | Dolly Out / Pull | 远离主体 |
| 摇 | Pan | 水平旋转 |
| 移 | Tilt | 垂直旋转 |
| 跟 | Track | 跟随主体移动 |
| 升降 | Crane Up/Down | 垂直升降 |
| 环绕 | Arc / Orbit | 围绕主体旋转 |
| 希区柯克 | Dolly Zoom | 推拉+变焦反向 |
| 手持 | Handheld | 呼吸感抖动 |
| 稳定器 | Steadicam | 平滑跟随 |

---

## 五、帧生成 (Frame Generation)

### 5.1 核心 Prompt 模板

```
你是一个专业的图片生成提示词专家。你的任务是描述一个完全静止的画面瞬间。

【核心规则】
- 你要生成的提示词描述的是一张静态图片，不是动画、不是视频、不是分镜对比
- 画面中只有一个场景、一个视角、一个时间点
- 绝对不能在提示词中出现以下概念：before/after、transition、sequence、comparison、split、side by side、multiple panels、diptych、collage
- 不要使用暗示运动过程的动词（如 rising, turning, reaching），只用描述静止姿态的词（如 seated, standing, holding）

【首尾帧差异化核心原则 - 极其重要】
你正在生成的是{首帧/尾帧}的提示词。
- 首帧必须展示动作发生前的起始状态，角色处于初始位置和姿势
- 尾帧必须展示动作完成后的最终状态，角色已到达终点位置和最终姿势
- 首帧和尾帧之间的差异必须是显而易见的：仅凭看这两张图片就能推断出中间发生了什么动作
- 差异维度：位置变化、姿势变化、朝向变化、手持物品变化、表情变化
- 至少两个维度必须有明显变化，不能让两帧看起来几乎相同

【内容安全规则 - 必须遵守】
- 所有内容必须健康、正面、适合全年龄观看
- 避免任何可能被误判为敏感的描述
- 人物表情和动作应自然、得体
- 服装描述应简洁，避免过度细节
- 场景应积极向上，避免暴力、恐怖、阴暗

请根据以下信息，生成这个瞬间的图片提示词：

分镜描述：{描述}
{角色信息、场景信息、视觉风格、前镜头状态等上下文}

要求：
1. 【最重要 - 动作分解】先分析所有动作，提取动作{发生前/完成后}的静止姿态
2. 【姿态精确】明确描述角色此刻的具体姿势、肢体位置、身体朝向
3. 【首尾帧差异化】确保两帧之间有显而易见的差异
4. 【细节保留】角色外貌细节（发色、发型、瞳色、服装）必须逐项写出
5. 【细节保留】场景环境细节（建筑、物品、光源、色调）必须写入
6. 镜头类型决定构图
7. 有角色时与参考图一致，无角色时绝对不能出现人物
8. 提示词开头必须加 "single image, single scene, one unified viewpoint,"
9. 末尾必须加 ", one single frame, NOT split screen, NOT side by side, NOT comparison, NOT multiple panels"
10. 【禁止文字】提示词中必须包含 "no text, no subtitles, no captions, no watermark, no letters, no words, no written text in any language"
```

### 5.2 动作类型分析（决定单帧 vs 首尾帧）

| 动作级别 | 策略 | 说明 |
|---------|------|------|
| 空镜头 | 单帧 | 无角色，场景过场 |
| 大幅动作 | 单帧 | 自由运动，不用尾帧限制 |
| 中幅动作 | 单帧 | 自由运动模式 |
| 小幅动作 | 首尾帧 | 强约束，需要精确控制结束姿态 |

---

## 六、角色白底三视图 (Character Three-View Turnaround)

### 6.1 生成模式

| 模式 | 说明 | aspectRatio |
|------|------|-------------|
| 设计图模式 (design_sheet) | 单图展示正面/侧面/背面三视角 turnaround | 16:9 |
| 独立三视图 (three_views) | 分别生成正面/侧面/背面三张独立图 | 3:4 |

### 6.2 白膜模式 (Base Model)

白膜模式是角色生成的基础——类似游戏建模的 base mesh，穿着统一标准化占位着装（纯白背心 + 纯白短裤），作为后续叠加服装和配饰的纯净基准。

**白膜着装约束（关键）**：
```
male character wearing plain pure white sleeveless tank top and plain pure white short shorts,
standardized base model outfit, no logos no patterns no text no prints,
no accessories, no jewelry, no equipment, no footwear,
bare arms and legs visible, clean body silhouette, natural skin tone,
game engine base mesh style
```

**白膜规则**：
- 严禁穿着任何其他服装（裙子、外套、披风、长裤、盔甲等）
- 严禁添加装饰品（首饰、帽子、眼镜、发饰、徽章等）
- 严禁添加装备（武器、背包、道具、腰带、挂件等）
- 严禁添加鞋子袜子，手臂和腿部必须裸露可见
- 保留面部特征（脸型、眼睛、鼻子、嘴巴）和发型发色
- 保留体型比例（身高、体型、肤色）

### 6.3 设计图模式 Prompt 模板

```
你是一个专业的角色设计图提示词专家。你的任务是生成用于 AI 绘图的「角色设定图 / Character Design Reference Sheet」提示词。

核心要求（必须严格遵守）：
1. 提示词必须用英文输出，逗号分隔的关键词格式
2. 【关键】这是一张角色设定图（Character Design Reference Sheet），需要在同一张图上展示同一角色的正面、侧面、背面三个视角的全身立绘，类似游戏角色的 turnaround reference sheet
3. 必须包含：character design reference sheet, turnaround, front view, side view, back view, same character, full body, simple clean white background, professional character sheet layout
4. 【画风一致性】角色的绘制风格必须严格匹配下方「风格要求」。提示词的前几个关键词必须是风格描述词
5. 【白膜模式】角色必须穿着统一的标准化白膜着装：纯白色无花纹贴身背心 + 纯白色短裤
6. 绝对不要加入任何场景、背景元素、故事情节
7. 保持中性自然表情
8. 长度控制在 100-180 个单词

请为以下角色生成角色设定图的提示词：

★ 风格要求（最优先）：{风格}
角色名称：{角色名}
外貌特征：{外貌}
角色描述：{描述}

请直接输出英文提示词，不要包含任何解释。
```

### 6.4 独立三视图 Prompt 模板（单视角）

```
你是一个专业的角色设计图提示词专家。你的任务是生成用于 AI 绘图的单个角色参考图提示词。

核心要求（必须严格遵守）：
1. 提示词必须用英文输出，逗号分隔的关键词格式
2. 【最重要】画面中只能有一个角色，绝对不能出现多个人物、多个角度、多个姿势。禁止使用 "character sheet"、"reference sheet"、"turnaround"、"multiple views"、"multiple poses" 等会导致多人物的关键词
3. 必须包含：single character, solo, one person, simple clean background, full body, standing pose, even soft lighting
4. 【画风一致性】提示词前几个关键词必须是风格描述词
5. {白膜模式则：必须穿着纯白色无花纹贴身背心 + 纯白色短裤 / 否则：必须包含完整外貌特征（服装、发型、体型、配饰、肤色）}
6. 绝对不要加入任何场景、背景元素、故事情节
7. 保持中性自然表情
8. 长度控制在 80-150 个单词

视角要求：{front view/side view/back view}, {对应姿态描述}
```

### 6.5 三视图姿态规范

| 视图 | 英文姿态描述 |
|------|------------|
| 正面 | front view, eye-level shot, facing directly at the camera, standing upright with relaxed natural posture, arms at sides, feet shoulder-width apart, looking straight ahead |
| 侧面 | side view, profile shot, turned 90 degrees to the right, full body, standing upright, showing full side profile silhouette, arms naturally at sides |
| 背面 | back view, rear shot, facing completely away from the camera, standing upright, showing back of head, hair, and clothing details |

### 6.6 侧面/背面一致性约束

```
【最关键 - 一致性约束】这是与正面图同一角色的{侧面/背面}视图：
- 发型和发色：必须与正面图完全相同
- 服装款式：必须与正面图完全相同
- 服装细节：袖子状态、领口、腰带、配饰等必须一致
- 体型和肤色：必须一致
- 提示词中必须逐项重复正面图的外貌特征描述
```

### 6.7 有参考图时的简化提示词

当已有白膜设定图作为参考时，跳过 LLM 翻译，直接输出英文关键词：

```
match the character face and body identity from the reference image exactly,
preserve all facial features face shape eye shape eye color skin tone body proportions from reference image,
keep the same character identity,
{wearing: 服装描述 / 白膜模式: male/female character wearing plain pure white sleeveless tank top and plain pure white short shorts},
character design reference sheet style, {风格},
single character, solo, one person, full body,
{视角姿态},
simple clean background, even soft lighting, neutral natural expression
```

### 6.8 调用参数建议

- temperature: 正面 0.7，侧面/背面 0.3（降低发挥空间）
- maxTokens: 2048
- 设计图 aspectRatio: 16:9
- 三视图 aspectRatio: 3:4

---

## 七、智能拆分 (Intelligent Splitting)

智能拆分是一条聚合工作流，将剧本一口气拆分为完整的分镜场景，并自动提取角色、场景、道具、影棚等全要素。它包含 6 个步骤：

```
剧本 → ① 分镜生成 → ② 保存&聚合 → ③ 角色提取 → ④ 环境分析
                                    ↓ 并行            ⑤ 影棚组装
                                                    ⑥ 角色三视图批量生成
```

### 7.1 步骤 ①：分镜生成 Prompt（核心）

```
你是一个分镜师，将剧本内容转化为分镜。

**核心原则：忠实于剧本**
- 严格按照剧本内容生成分镜，不添加剧本中没有的情节、对话或角色
- 描述简洁明了，避免过度艺术加工
- 专注于剧本内容的视觉化呈现

**时长目标**：所有分镜的 duration 总和应在 {min}-{max} 秒之间

**输出格式**：严格 JSON 数组，不要添加其他文字

---

【剧本内容】
{剧本全文}

---

{角色外观特征表（含白膜体貌 + 默认服装 + 默认手持道具）}

【分镜转化要求】

1. **对话识别**：每句对白独立一个镜头，说话人用近景/特写，可穿插听者反应镜头
2. **角色识别**：准确记录每个分镜中出现的角色，characters 数组必须包含 description 中提到的所有角色名
3. **道具识别（两级）**：
   - 场景级道具（props 数组）：画面里的非随身道具
   - 角色级手持道具（characterStates[].heldProps）：角色手里/身上携带的物品
4. **角色服装与手持道具识别（characterStates 数组）**：
   - 每个出场角色输出 {character, outfit, heldProps}
   - 剧情未明确变化时沿用角色外观特征表里的默认值
5. **场景转换**：新场景先用远景/全景建立环境
6. **表情与动作**：用简单自然语言描述微表情和细微动作
7. **endState 记录**：镜头结束时角色的位置、姿势、表情

【输出 JSON 格式】
每个分镜包含：
- order, shotType, description, hasAction, startFrame, endFrame
- endState, dialogue, dialogues, duration, characters
- characterStates: [{character, outfit, heldProps}]
- props: ["场景道具名"]
- location: 具体地点名（2-12字中文）
- environment: 具体自然环境名（2-8字中文）
- buildings: ["建筑名"]
- timeOfDay: "白天"/"夜晚"/"正午"/"黄昏"/"黎明"/"深夜"
- weather: "晴天"/"阴天"/"雨天"/"雪天"/"雾天"/"多云"
- emotion, cameraMovement

只输出 JSON 数组，不要其他内容。
```

### 7.2 步骤 ②：保存与聚合

- 保存所有分镜到 storyboards 表
- 从分镜 variables 自动聚合 scenes、studios、studio_states、props、storyboard_props

### 7.3 步骤 ③：角色提取

AI 从分镜内容中自动提取角色名称、外貌、性格描述，写入 characters 表，并创建默认 costume 和 character_state。

### 7.4 步骤 ④：环境连续性分析

AI 分析前后分镜的环境变化，在分镜 variables_json 中标记 sceneState（scene_continuity / scene_change / new_scene），供帧生成时判断是否需要切换背景/场景。

### 7.5 步骤 ⑤：影棚组装

从分镜中提取建筑和环境元素，组装为可复用的 studio 资源。

### 7.6 步骤 ⑥：角色白膜批量生成

为新创建的角色的默认状态自动生成白膜设定图（三视图）。

### 7.7 剧本拆集（scriptSplit）

当用户上传长文本剧本需要自动拆分为多集时使用：

```
你是一个专业的剧本编辑，任务是将一篇长文本剧本拆分为多集。

## 严格规则（必须遵守）

1. **绝对不能增加、删除、修改用户的任何文字**，拆分后每集拼接必须与原文完全一致
2. 拆分点必须选在自然的场景切换、时间跳跃、段落间隙处
3. 每集约 {分钟} 分钟（约 {字数} 字），可浮动 ±2 分钟
4. 优先在剧情高潮、转折点、悬念处结束一集
5. 如果某段情节连贯不可分割，宁可超出字数范围也不要强行拆断

## 输出要求

请输出一个 JSON 数组，每项包含：
- "episodeNumber": 集号（从1开始）
- "title": 根据本集内容概括的标题（10字以内）
- "startMarker": 本集开头原文的前20个字（用于定位）
- "endMarker": 本集结尾原文的后20个字（用于定位）

只输出 JSON 数组，不要输出其他内容。
```

### 7.8 智能拆分调用参数

- temperature: 0.3（低温度保证格式一致）
- maxTokens: 8192
- 并发：步骤 ②③ 依赖 ①，步骤 ④⑤ 与 ③ 可并行

---

## 八、完整流水线集成示例

### 输入
```
标题：《雨夜追踪》
风格：悬疑推理
长度：短篇（1-3分钟）
角色：刑警李明（中年男性，短发，深蓝夹克）、嫌疑人张某（年轻男性，黑色连帽衫）
```

### 步骤
1. **剧本生成** → 输出 Markdown 格式剧本（3个场景）
2. **分镜转化** → 每个场景转化为 JSON 分镜数组
3. **提示词优化**（图片/视频）→ 每个分镜生成 positive + negative prompt
4. **运镜设计** → 每个分镜生成运镜指令
5. **帧生成** → 分析动作类型，生成首帧/尾帧 prompt
6. **调用生图/生视频模型** → 传入优化后的 prompt

### 调用参数总结

| 步骤 | temperature | maxTokens | 输出格式 |
|------|------------|-----------|---------|
| 剧本生成 | 0.9 | 8192 | Markdown |
| 分镜转化 | 0.3 | 不限 | JSON 数组 |
| 提示词优化 | 0.7 | 4096 | JSON {positive, negative} |
| 运镜设计 | 0.6 | 4096 | 纯文本段落 |
| 帧生成 | 0.7 | 不限 | 纯文本 prompt |

---

## 九、更多提示词模板

完整的正/反向提示词示例和高级场景模板，见 [templates.md](templates.md)。
