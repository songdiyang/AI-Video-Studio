# 提示词模板库 (Prompt Templates)

## 角色白底三视图示例

### 白膜设计图 (Character Design Sheet — 单张三视角)

```
anime style, cel-shaded, clean linework, character design reference sheet, turnaround, front view side view back view, same character, full body, female character wearing plain pure white sleeveless tank top and plain pure white short shorts, standardized base model outfit, no logos no patterns, no accessories, no jewelry, no equipment, no footwear, bare arms and legs visible, clean body silhouette, teenage girl with short black bob haircut and large brown eyes, fair skin, slim athletic build, neutral natural expression, simple clean white background, professional character sheet layout, even soft lighting
```

### 独立正面视图

```
anime style, cel-shaded, clean linework, single character, solo, one person, full body, standing pose, front view, eye-level shot, facing directly at the camera, standing upright with relaxed natural posture, arms at sides, feet shoulder-width apart, looking straight ahead, female character wearing plain pure white sleeveless tank top and plain pure white short shorts, standardized base model outfit, no logos no patterns, no accessories, no equipment, no footwear, bare arms and legs visible, clean body silhouette, natural skin tone, teenage girl with short black bob haircut and large brown eyes, fair skin, slim athletic build, neutral natural expression, simple clean white background, even soft lighting
```

### 独立侧面视图

```
anime style, cel-shaded, clean linework, single character, solo, one person, full body, standing pose, side view, profile shot, turned 90 degrees to the right, standing upright, showing full side profile silhouette, arms naturally at sides, match the character from the front reference image exactly, same short black bob haircut and brown eyes, same fair skin and slim athletic build, same pure white sleeveless tank top and pure white short shorts, same standardized base model outfit, no accessories, no equipment, no footwear, bare arms and legs visible, neutral natural expression, simple clean white background, even soft lighting
```

### 独立背面视图

```
anime style, cel-shaded, clean linework, single character, solo, one person, full body, standing pose, back view, rear shot, facing completely away from the camera, standing upright, showing back of head and hair details, match the character from the front reference image exactly, same short black bob haircut, same fair skin and slim athletic build, same pure white sleeveless tank top and pure white short shorts, same standardized base model outfit, no accessories, no equipment, no footwear, bare arms and legs visible, neutral natural expression, simple clean white background, even soft lighting
```

---

## 图片模型提示词示例

### 真人实拍 - 正向提示词

```
single image, single scene, one unified viewpoint,
A medium shot of a middle-aged male detective in a dimly lit interrogation room,
natural window light casting diagonal shadows across his weathered face,
aged 45-50, short graying hair, five o'clock shadow, tired but sharp eyes,
wearing a dark blue jacket with slight wear at the elbows over a white shirt,
seated at a metal table, hands resting on a worn case file,
concrete walls with peeling paint, single hanging bulb casting warm light,
shot on 50mm lens, f/2.8, shallow depth of field with background slightly blurred,
composition following rule of thirds, subject positioned left of frame looking right,
warm tungsten color temperature with cool shadows, cinematic color grading,
emotion compound: 60% fatigue + 30% determination + 10% frustration,
visible pores and fine lines on forehead, slight oil sheen on nose bridge,
jacket fabric shows subtle weave texture under direct light,
metal table surface has scratched matte finish with condensation ring from coffee cup,
one single frame, NOT split screen, NOT side by side, NOT comparison, NOT multiple panels,
no text, no subtitles, no captions, no watermark, no letters, no words, no written text in any language
```

### 真人实拍 - 反向提示词 (Negative Prompt)

```
卡通, 动漫, 插画, 3D渲染, 绘画, 素描, 低质量, 模糊, 变形, 扭曲, 多余肢体, 多余手指, 水印, 文字, 签名, 日期, 边框, 拼贴, 分屏, 对比图, 多面板, 曝光过度, 曝光不足, 颜色溢出, 噪点过多, JPEG伪影, 笑容, 开心, 明亮, 户外, 自然光, 蓝天, 植物
```

### 动漫动画 - 正向提示词

```
single image, single scene, one unified viewpoint,
anime style, cel-shaded, clean linework,
a female high school student standing on a rooftop at sunset,
medium shot, golden hour lighting with warm orange and pink sky gradient,
long black hair tied in twin tails with red ribbons, swaying gently in breeze,
serious expression with eyes slightly narrowed, subtle blush on cheeks,
wearing a dark blue sailor-style school uniform with white collar and red bow,
pleated navy skirt, white knee-high socks, brown loafers,
one hand holding the railing, the other clutching a letter to her chest,
chain-link fence in foreground slightly out of focus, city skyline in background,
composition using rule of thirds, subject centered with sky filling upper two-thirds,
color palette: warm oranges and pinks dominant, navy blue as contrast,
rim lighting from setting sun creating golden edge on hair and shoulders,
clean flat colors with subtle cel-shading gradients, no texture mapping,
one single frame, NOT split screen, NOT side by side, NOT comparison, NOT multiple panels,
no text, no subtitles, no captions, no watermark, no letters, no words, no written text in any language
```

### 动漫动画 - 反向提示词

```
写实, 真人, 照片, 摄影, 3D, 厚涂, 复杂纹理, 过度细节, 低质量, 模糊, 变形, 崩坏, 骨骼扭曲, 多余肢体, 比例失调, 水印, 文字, 签名, 边框, 拼贴, 分屏, 笑容, 开心, 明亮室内光
```

---

## 视频模型提示词示例

### 真人实拍 - 自由运动模式

```json
{
  "videoPrompt": "a middle-aged male detective with short graying hair and tired eyes, wearing a dark blue jacket, slowly pushes back from a metal table in a dim interrogation room, his chair scraping against concrete floor as he stands, gaze fixed on the door ahead, warm overhead bulb casting moving shadows as he crosses the room, slight stagger in his step showing fatigue, composition starts as wide shot showing full room and transitions to medium shot framing his determined face, steady handheld camera following at eye level, 24fps cinematic motion, warm tungsten lighting with gradual cool shift as he moves away from the light source, 4 seconds duration",
  "negative": "卡通, 动漫, 插画, 3D渲染, 低质量, 模糊, 变形, 画面抖动, 跳帧, 闪烁, 画面撕裂, 运动不连贯, 卡顿, 角色突然变形, 角色消失, 水印, 文字, 笑容, 明亮, 户外"
}
```

### 真人实拍 - 强约束模式（首尾帧）

```json
{
  "videoStartPrompt": "a young man in a black hoodie, hood partially up revealing messy dark hair and tired eyes, crouched behind a stack of wooden crates in a rain-soaked alley, one hand braced against the wet brick wall, neon sign reflection flickering in puddles at his feet, medium shot, static camera",
  "videoEndPrompt": "the same young man now sprinting down the rain-soaked alley away from camera, black hoodie billowing behind, arms pumping, neon reflections streaking across wet pavement, wide shot, camera pulling back slightly as he gains distance, rain increasing in intensity",
  "negative": "卡通, 动漫, 插画, 低质量, 模糊, 画面抖动, 跳帧, 闪烁, 撕裂, 卡顿, 变形, 水印, 文字, 明亮, 阳光, 晴天"
}
```

---

## 运镜提示词示例

### 对话场景
```
Slow dolly in from medium shot to close-up over 3 seconds, starting with the detective seated at metal table with file case visible, gradually closing distance to frame only his weathered face and tired eyes, steady pace matching the contemplative mood, subtle handheld micro-movements for natural breathing effect, final frame tightly focused on his eyes showing the moment of realization
```

### 动作场景
```
Fast tracking shot following the suspect sprinting through narrow alley at eye level, camera pushing forward at running pace with slight vertical bounce simulating chase perspective, panning slightly right to follow his sudden turn around corner, rapid whip pan to reveal dead end, sudden deceleration to static as he skids to a stop, 2 second duration, handheld style with controlled shake for urgency
```

---

## 帧生成提示词示例

### 首帧（动作开始前）

```
single image, single scene, one unified viewpoint,
a detective in a dim interrogation room, seated upright at a metal table mid-motion of opening a case file folder,
both hands on the folder edges, folder partially open revealing document corners,
medium shot, 35mm lens, tungsten light from single overhead bulb creating harsh shadows,
tired but focused expression, 70% concentration + 30% anticipation,
one single frame, NOT split screen, NOT side by side, NOT comparison, NOT multiple panels,
no text, no subtitles, no captions, no watermark, no letters, no words, no written text in any language
```

### 尾帧（动作完成后）

```
single image, single scene, one unified viewpoint,
a detective in a dim interrogation room, now standing behind the metal table, leaning forward with both palms flat on the table surface,
the opened case file spread across the table with documents and photographs visible,
medium shot, 35mm lens, same tungsten lighting, shadows now shifted to behind him as he stands closer to the light,
intense expression, 80% determination + 20% shock, eyes wide, mouth slightly open as if mid-gasp,
one single frame, NOT split screen, NOT side by side, NOT comparison, NOT multiple panels,
no text, no subtitles, no captions, no watermark, no letters, no words, no written text in any language
```

> **差异化检查**：首帧 → 角色坐着开文件夹；尾帧 → 角色站着双手撑桌，文件已摊开。位置、姿势、表情三个维度均有明显变化。✅

---

## 智能拆分输出示例

### 分镜 JSON 输出片段

```json
[
  {
    "order": 1,
    "shotType": "全景",
    "description": "早晨的客厅，阳光从窗帘缝隙透入，穿白色T恤、牛仔裤的小明坐在沙发上看手机",
    "hasAction": false,
    "endState": "小明坐在沙发上，手持手机，表情平静",
    "dialogue": "",
    "dialogues": [],
    "duration": 2,
    "characters": ["小明"],
    "characterStates": [{"character": "小明", "outfit": "白色T恤、牛仔裤", "heldProps": "手机"}],
    "props": [],
    "location": "客厅",
    "environment": "客厅",
    "buildings": [],
    "timeOfDay": "白天",
    "weather": "晴天",
    "emotion": "平静",
    "cameraMovement": "static"
  },
  {
    "order": 2,
    "shotType": "近景",
    "description": "小明抬头看向门口，眉头微皱",
    "hasAction": true,
    "startFrame": "小明低头看手机",
    "endFrame": "小明抬头，眉头微皱，望向门口",
    "endState": "小明坐在沙发上，抬头望向门口，眉头微皱",
    "dialogue": "",
    "dialogues": [],
    "duration": 2,
    "characters": ["小明"],
    "characterStates": [{"character": "小明", "outfit": "白色T恤、牛仔裤", "heldProps": "手机"}],
    "props": [],
    "location": "客厅",
    "environment": "客厅",
    "buildings": [],
    "timeOfDay": "白天",
    "weather": "晴天",
    "emotion": "疑惑",
    "cameraMovement": "static"
  }
]
```

### 剧本拆集输出示例

```json
[
  {"episodeNumber": 1, "title": "雨夜的不速之客", "startMarker": "深秋的雨夜，街道上空无一人，只有", "endMarker": "门铃响了。"},
  {"episodeNumber": 2, "title": "尘封的档案", "startMarker": "李明打开门，门外站着一个全身湿透的", "endMarker": "两人陷入沉默。"},
  {"episodeNumber": 3, "title": "真相大白", "startMarker": "第二天清晨，李明带着档案袋来到", "endMarker": "窗外的雨终于停了。"}
]
```
