/**
 * 自动分镜处理器
 * 调用文本模型将剧本内容拆分为分镜镜头列表
 * 同时输出角色和场景信息，减少重复 AI 调用
 * 
 * input:  { scriptContent, scriptTitle, textModel }
 * output: { scenes, characters, locations, count, totalDuration }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { filterNonCharacters } = require('../../../utils/characterFilter');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible } = require('../../../utils/washBody');
const { getStoryboardDurationConfig } = require('../../../durationConfigService');
const { queryAll } = require('../../../dbHelper');

// 默认值（当数据库配置不可用时回退使用）
const DEFAULT_MIN_TOTAL_DURATION = 60;
const DEFAULT_MAX_TOTAL_DURATION = 180;
const DEFAULT_SCENE_DURATION = 2;
const DEFAULT_TOLERANCE = 2; // 偏差容忍值（秒）

/**
 * 从分镜描述中提取角色名称
 * 使用严格的模式匹配中文人名，避免误识别
 * @param {string} description - 分镜描述文本
 * @param {Set} knownCharacters - 已知角色名集合
 * @returns {string[]} 提取到的角色名数组
 */
function extractCharactersFromDescription(description, knownCharacters = new Set()) {
  if (!description) return [];
  
  const extracted = new Set();
  
  // 1. 从已知角色列表中精确匹配（优先级最高）
  for (const char of knownCharacters) {
    if (char && char.length >= 2 && description.includes(char)) {
      extracted.add(char);
    }
  }
  
  // 2. 只提取已知角色，不再使用模糊匹配
  // 原因：模糊匹配会将"清晨""黑板上""表情心不"等非人名误识为角色
  // AI 在生成分镜时已经明确指定了 characters 数组，无需从 description 中重新提取
  
  return Array.from(extracted);
}

/**
 * 检查是否为有效的中文人名
 * 中文人名特征：
 * - 通常为 2-3 个字，偶尔 4 个字（复姓）
 * - 第一个字通常是常见姓氏
 * - 不应该是常见词汇、动词、形容词等
 */
function isValidChineseName(word) {
  if (!word || word.length < 2 || word.length > 4) return false;
  
  // 检查是否在常见非人名词汇列表中
  if (isCommonWord(word)) return false;
  
  // 检查第一个字是否是常见姓氏（可选的加强验证）
  const commonSurnames = '王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杉戴夏锡汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段章钱汤尹黎易常武乔贺赖龚文';
  const firstChar = word.charAt(0);
  
  // 如果第一个字是常见姓氏，更可能是人名
  if (commonSurnames.includes(firstChar)) {
    return true;
  }
  
  // 对于非常见姓氏开头的，需要更严格的检查
  // 检查是否以常见非人名前缀/后缀结尾
  if (hasInvalidNamePattern(word)) {
    return false;
  }
  
  return false; // 默认不认为是人名，除非有常见姓氏
}

/**
 * 检查是否包含无效的人名模式
 */
function hasInvalidNamePattern(word) {
  // 以这些词开头的不太可能是人名
  const invalidPrefixes = [
    '教室', '客厅', '卧室', '街道', '大街', '小巷', '广场', '公园',
    '清晨', '晚上', '下午', '上午', '晚间', '白天', '夜晚', '黄昏',
    '黑板', '白板', '桌子', '椅子', '沙发', '窗帘', '窗户', '门口',
    '表情', '动作', '眼神', '脸上', '手上', '脚下', '身上', '头上',
    '快速', '慢慢', '突然', '逐渐', '立即', '正在', '已经', '尚未',
    '今天', '明天', '昨天', '现在', '此时', '当时', '那时', '这时',
    '距离', '朝向', '向着', '对着', '背对', '面对', '侧身',
    '学生', '同学', '老师', '父亲', '母亲', '爸爸', '妈妈', '哥哥', '姐姐',
    '流声', '似乎', '不稳', '但刺', '一阵',
    '纸条', '信封', '铅笔', '书本', '本子', '笔记',
    '抬头', '低头', '点头', '摇头', '转头', '回头',
    '广播', '声音', '电影', '电视', '手机', '电脑',
    '无聊', '焦虑', '担心', '期待', '愤怒', '快乐',
  ];
  
  // 以这些词结尾的不太可能是人名
  const invalidSuffixes = [
    '上', '下', '里', '外', '中', '前', '后', '左', '右', '旁',
    '时', '间', '处', '边', '面',
    '们', '着', '了', '过', '完', '掉',
    '声', '色', '光', '影', '水', '火',
    '意', '地', '的', '得', '来', '去',
    '高考', '考试', '答案', '纸张',
  ];
  
  for (const prefix of invalidPrefixes) {
    if (word.startsWith(prefix)) return true;
  }
  
  for (const suffix of invalidSuffixes) {
    if (word.endsWith(suffix)) return true;
  }
  
  return false;
}

/**
 * 检查是否为常见非人名词汇（大幅扩充）
 */
function isCommonWord(word) {
  const commonWords = new Set([
    // 连接词/副词
    '然后', '之后', '之前', '不过', '如果', '虽然', '但是', '因为', '所以',
    '已经', '正在', '还是', '一个', '这个', '那个', '什么', '这样', '那样',
    '怎么', '怎样', '为什么', '为何', '何时', '何地', '何人',
    '我们', '他们', '她们', '你们', '自己', '大家', '各自', '彼此',
    '这里', '那里', '哪里', '时候', '地方', '事情', '东西', '问题', '结果',
    '开始', '结束', '继续', '一边', '同时', '首先', '接着', '随后', '最后',
    '然而', '于是', '并且', '而且', '只是', '只有', '就是', '也是',
    '一定', '一般', '一起', '一直', '一点', '一下', '一些', '一样',
    
    // 时间相关
    '清晨', '早晨', '上午', '中午', '下午', '晚上', '夜晚', '半夜',
    '白天', '黄昏', '日落', '日出', '深夜', '凌晨', '拂晓', '黎明',
    '今天', '明天', '昨天', '后天', '前天', '现在', '当时', '此时',
    '那时', '这时', '很久', '一会', '片刻', '瞬间', '刚才', '马上',
    
    // 地点/场景
    '教室', '客厅', '卧室', '厅堂', '走廊', '楼梯', '操场', '食堂',
    '街道', '大街', '小巷', '广场', '公园', '商店', '超市', '医院',
    '室内', '室外', '屋内', '屋外', '地上', '天上', '树上', '桌上',
    '壁上', '墙上', '门口', '窗口', '床上', '椅子', '桌子', '沙发',
    '海边', '山上', '桥上', '路上', '车上', '船上', '飞机',
    '墙角', '墟角', '门后', '窗前', '床头', '桌边',
    
    // 物品/道具
    '黑板', '白板', '窗帘', '窗户', '大门', '小门', '电灯', '电视',
    '手机', '电脑', '书本', '笔记', '纸张', '纸条', '铅笔', '粉笔',
    '杆子', '食物', '餐具', '茶杯', '水杯', '雨伞', '行李',
    '广播', '小说', '电影', '图片', '照片', '报纸', '杂志',
    
    // 身体部位
    '左手', '右手', '双手', '双脚', '双眼', '嘴唇', '眉头', '额头',
    '肩膀', '后背', '腰部', '膈部', '脸部', '脸上', '眼中', '眼里',
    '手上', '手中', '手里', '脚下', '脚边', '身上', '身边', '身后',
    '头上', '头顶', '心中', '心里', '脑中', '脑海',
    
    // 镜头/画面术语
    '表情', '动作', '场景', '画面', '镜头', '角度', '光线', '背景',
    '前景', '特写', '远景', '近景', '中景', '全景', '仰拍', '俑拍',
    '左侧', '右侧', '上方', '下方', '前方', '后方', '周围', '中央',
    '旁边', '对面', '侧面', '正面', '背面', '侧身',
    '切换', '转场', '淡入', '淡出', '推近', '拉远', '平移', '跳切',
    
    // 情绪/状态
    '冷淡', '紧张', '平静', '激动', '惊讶', '愤怒', '悲伤', '快乐',
    '忧虑', '焦虑', '担心', '期待', '失望', '满足', '兴奋', '沮丧',
    '无聊', '寂寞', '孤独', '疲惫', '困倦', '精神', '振奋', '淈弱',
    '认真', '专注', '分心', '恐惧', '害怕', '勇敢', '胆怯', '自信',
    
    // 动作/行为
    '抬头', '低头', '点头', '摇头', '转头', '回头', '仰头', '埋头',
    '开口', '张嘴', '闭嘴', '喘气', '叹气', '伸手', '缩手', '挥手',
    '抬手', '举手', '放手', '抱拳', '挤眼', '眨眼', '闭眼', '睁眼',
    '起身', '转身', '俑身', '直身', '弯腰', '下蹲', '站起', '坐下',
    '走过', '走来', '跑咄', '传递', '接过', '递给', '拿起', '放下',
    '快速', '缓慢', '慢慢', '突然', '逐渐', '立即', '即刻', '最终',
    // 学校相关
    '学生', '同学', '老师', '校长', '主任', '班级', '年级', '课程',
    '高考', '考试', '作业', '课本', '习题', '答案', '试卷', '成绩',
    '距离', '还有', '年后', '天后', '下课', '上课', '放学', '放假',
    
    // 家庭称谓
    '父亲', '母亲', '爸爸', '妈妈', '哥哥', '姐姐', '弟弟', '妹妹',
    '爷爷', '奶奶', '外公', '外婆', '叔叔', '姑姑', '舅舅', '姨妈',
    // 程度/形容
    '简单', '复杂', '重要', '关键', '主要', '其他', '全部', '部分',
    '对比', '明暗', '色调', '氛围', '情绪', '强度', '微弱', '中等',
    '持续', '间歇', '完全', '严重', '轻微', '明显', '模糊', '清晰',
    '很大', '很小', '很多', '很少', '非常', '十分', '特别', '格外',
    
    // 其他常见误识别词
    '流声', '似乎', '不稳', '但刺', '一阵', '阵阵', '一块', '一起',
    '走过', '发出', '传来', '响起', '收到', '带着', '看到', '听到',
    '间或', '或者', '还有', '而是', '而且', '并且', '因此', '所以',
    '随着', '跟着', '带着', '含着', '拿着', '拿起', '放下', '继续',
    '但集', '心不', '同学有', '敲地', '维持', '活地', '纸条',
    '快递', '快速递', '慢递', '传给', '递给',
  ]);
  return commonWords.has(word);
}

/**
 * 分镜时长校验与调整
 * @param {Array} scenes 分镜数组
 * @param {number} minDuration 最小总时长
 * @param {number} maxDuration 最大总时长
 * @param {number} tolerance 偏差容忍值（秒）
 * @returns {{ scenes: Array, totalDuration: number, adjusted: boolean, needsRegeneration: boolean }}
 */
function adjustSceneDurations(scenes, minDuration, maxDuration, tolerance = 2) {
  if (!scenes || scenes.length === 0) return { scenes: [], totalDuration: 0, adjusted: false, needsRegeneration: false };
  
  // 第1步：计算当前总时长
  let totalDuration = scenes.reduce((sum, s) => sum + (s.duration || DEFAULT_SCENE_DURATION), 0);
  console.log('[StoryboardGen] 原始总时长:', totalDuration, '秒, 允许范围:', minDuration, '-', maxDuration, '秒, 容忍偏差:', tolerance, '秒');
  
  // 第2步：检查是否在合理范围内
  if (totalDuration >= minDuration && totalDuration <= maxDuration) {
    console.log('[StoryboardGen] 时长在合理范围内，无需调整');
    return { scenes, totalDuration, adjusted: false, needsRegeneration: false };
  }
  
  // 第3步：计算偏差量
  let deviation = 0;
  if (totalDuration < minDuration) {
    deviation = minDuration - totalDuration;
  } else if (totalDuration > maxDuration) {
    deviation = totalDuration - maxDuration;
  }
  
  console.log('[StoryboardGen] 时长偏差:', deviation, '秒');
  
  // 第4步：判断偏差大小
  if (deviation > tolerance) {
    // 严重超出范围 - 需要重新生成
    console.log('[StoryboardGen] 时长严重超出范围（偏差', deviation, '秒 > 容忍值', tolerance, '秒），需要重新生成');
    return { scenes, totalDuration, adjusted: false, needsRegeneration: true };
  }
  
  // 第5步：偏差在容忍范围内，按比例缩放调整
  console.log('[StoryboardGen] 偏差在容忍范围内，执行比例缩放调整');
  
  let targetDuration;
  if (totalDuration < minDuration) {
    targetDuration = minDuration;
  } else {
    targetDuration = maxDuration;
  }
  
  const scaleFactor = targetDuration / totalDuration;
  scenes = scenes.map(s => ({
    ...s,
    duration: Math.max(1, Math.round((s.duration || DEFAULT_SCENE_DURATION) * scaleFactor))
  }));
  
  // 重新计算调整后的总时长
  totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  
  // 如果四舍五入后总时长仍有微小差异，在最长的分镜上补偿
  const diff = targetDuration - totalDuration;
  if (diff !== 0 && scenes.length > 0) {
    let maxIdx = 0;
    let maxDur = scenes[0].duration;
    for (let i = 1; i < scenes.length; i++) {
      if (scenes[i].duration > maxDur) {
        maxDur = scenes[i].duration;
        maxIdx = i;
      }
    }
    const newDur = scenes[maxIdx].duration + diff;
    if (newDur >= 1) {
      scenes[maxIdx] = { ...scenes[maxIdx], duration: newDur };
      totalDuration = targetDuration;
    }
  }
  
  console.log('[StoryboardGen] 比例缩放调整后总时长:', totalDuration, '秒');
  return { scenes, totalDuration, adjusted: true, needsRegeneration: false };
}

/**
 * 后处理分镜数据，确保角色列表完整
 * @param {Array} scenes - AI 生成的分镜数组
 * @returns {Array} 修复后的分镜数组
 */
function postProcessScenes(scenes) {
  if (!scenes || scenes.length === 0) return scenes;
  
  // 第一遍：收集所有已知角色
  const allKnownCharacters = new Set();
  scenes.forEach(scene => {
    if (Array.isArray(scene.characters)) {
      scene.characters.forEach(c => allKnownCharacters.add(c));
    }
  });
  console.log('[StoryboardGen] 已知角色列表:', Array.from(allKnownCharacters));
  
  // 第二遍：从 description 中提取遗漏的角色
  let fixedCount = 0;
  scenes = scenes.map((scene, idx) => {
    const originalChars = new Set(scene.characters || []);
    
    // 从多个字段提取角色
    const textsToCheck = [
      scene.description,
      scene.startFrame,
      scene.endFrame,
      scene.endState
    ].filter(Boolean).join(' ');
    
    const extractedChars = extractCharactersFromDescription(textsToCheck, allKnownCharacters);
    
    // 合并角色列表
    const mergedChars = new Set([...originalChars, ...extractedChars]);
    
    // 如果发现新角色，记录日志
    const newChars = extractedChars.filter(c => !originalChars.has(c));
    if (newChars.length > 0) {
      console.log(`[StoryboardGen] 分镜 ${idx + 1} 补充角色:`, newChars);
      fixedCount++;
      // 将新发现的角色添加到全局已知列表
      newChars.forEach(c => allKnownCharacters.add(c));
    }
    
    return {
      ...scene,
      characters: filterNonCharacters(Array.from(mergedChars)),
      // 确保 duration 有默认值
      duration: scene.duration || DEFAULT_SCENE_DURATION
    };
  });
  
  console.log(`[StoryboardGen] 角色修复完成，共修复 ${fixedCount} 个分镜`);
  
  return scenes;
}

/**
 * 尝试部分解析 JSON 数组
 * 当 AI 返回的 JSON 不完整时，提取已完成的元素
 * @param {string} jsonStr - 原始 JSON 字符串
 * @returns {Array} 解析出的分镜数组
 */
function tryPartialParse(jsonStr) {
  const scenes = [];
  
  // 查找数组开始
  const arrayStart = jsonStr.indexOf('[');
  if (arrayStart === -1) return scenes;
  
  let content = jsonStr.slice(arrayStart + 1);
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    // 处理转义字符
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    
    // 处理字符串
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    // 处理对象边界
    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        // 找到一个完整的对象
        const objectStr = content.slice(objectStart, i + 1);
        try {
          const obj = JSON.parse(objectStr);
          // 验证是否是有效的分镜对象
          if (obj && typeof obj.order === 'number' && typeof obj.description === 'string') {
            scenes.push(obj);
          }
        } catch (e) {
          // 忽略解析失败的对象
        }
        objectStart = -1;
      }
    }
  }
  
  return scenes;
}

// 超时包装函数
function withTimeout(promise, ms, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

// AI 调用超时时间（默认 120 秒，比 WorkflowExecutor 的 TASK_TIMEOUT 短，给后处理留余量）
const AI_CALL_TIMEOUT = parseInt(process.env.STORYBOARD_AI_TIMEOUT, 10) || 120000;

async function handleStoryboardGeneration(inputParams, onProgress) {
  const { scriptContent, scriptTitle, textModel: modelName, projectId, think } = inputParams;

  if (!scriptContent || scriptContent.trim() === '') {
    throw new Error('剧本内容为空，无法生成分镜');
  }

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }

  if (onProgress) onProgress(10);

  // 从数据库读取时长配置
  let durationConfig;
  try {
    durationConfig = await getStoryboardDurationConfig();
  } catch (e) {
    console.warn('[StoryboardGen] 获取时长配置失败，使用默认值:', e.message);
    durationConfig = {
      minDuration: DEFAULT_MIN_TOTAL_DURATION,
      maxDuration: DEFAULT_MAX_TOTAL_DURATION,
      tolerance: DEFAULT_TOLERANCE
    };
  }

  // 查询项目中已有的角色及外观特征（如果有）
  let characterAppearanceSection = '';
  if (projectId) {
    try {
      const existingChars = await queryAll(
        `SELECT name, appearance, description FROM characters WHERE project_id = ? AND appearance IS NOT NULL AND appearance != ''`,
        [projectId]
      );
      if (existingChars.length > 0) {
        const charLines = existingChars.map(c =>
          `- ${c.name}：${c.appearance}${c.description ? `（${c.description}）` : ''}`
        ).join('\n');
        characterAppearanceSection = `

**【项目角色外观特征表】**
以下是本项目中已定义的角色及其固定外观特征，在生成分镜描述时：
- 每次提到角色时，必须在 description 中包含该角色的关键外观特征（如发型、服装等），而不是仅写角色名
- 例如：不要写"小明走进房间"，而要写"穿黑色西装的短发男生走进房间"或"小明（穿黑色西装的短发男生）走进房间"
- characters 数组中仍然使用角色名
${charLines}
`;
        console.log(`[StoryboardGen] 已注入 ${existingChars.length} 个角色外观特征`);
      }
    } catch (e) {
      console.warn('[StoryboardGen] 查询角色外观失败（忽略）:', e.message);
    }
  }

  const fullPrompt = `你是一个分镜师，将剧本内容转化为分镜。

**核心原则：忠实于剧本**
- 严格按照剧本内容生成分镜，不添加剧本中没有的情节、对话或角色
- 描述简洁明了，避免过度艺术加工
- 专注于剧本内容的视觉化呈现

**时长目标**：所有分镜的 duration 总和应在 ${durationConfig.minDuration}-${durationConfig.maxDuration} 秒之间

**输出格式**：严格 JSON 数组，不要添加其他文字

---

【剧本内容】
${scriptContent}

---
${characterAppearanceSection}
【分镜转化要求】

1. **对话识别**：
   - 每句对白独立一个镜头
   - 说话人用近景/特写
   - 可穿插听者反应镜头

2. **角色识别**：
   - 准确记录每个分镜中出现的角色
   - characters 数组必须包含 description 中提到的所有角色名
   - 空镜头（无角色）的 characters 为空数组 []
   - 【重要】characters 只填写有具体名字的角色，不要填写泛称群体如"人群"、"路人"、"群众"、"众人"、"行人"、"观众"、"围观者"、"士兵"、"村民"等

3. **道具识别**：
   - 识别画面中的重要道具（如手机、书本、传单、钥匙等）
   - props 数组记录画面中出现的道具名称
   - 只记录剧情相关的重要道具，忽略背景装饰

4. **场景转换**：
   - 切换到新场景时，先用远景/全景建立环境
   - 明确记录 location 字段

5. **表情与动作**：
   - 用简单自然的语言描述角色的微表情和细微动作
   - 例如：「眉头微皱」「嘴角上扬」「眉头轻轻一挑」
   - 有动作的镜头 hasAction=true，并填写 startFrame 和 endFrame

6. **画面描述**：
   - description 简洁描述画面内容，包含角色位置和动作
   - 不需要复杂的光影、色调、景深等艺术描述
   - 保持朴实简单的风格

7. **endState 记录**：
   - 简要记录镜头结束时角色的位置、姿势、表情
   - 确保相邻镜头状态连贯

【输出 JSON 格式】
每个分镜包含：
- order: 分镜序号（从1开始）
- shotType: 镜头类型（"特写"/"近景"/"中景"/"全景"/"远景"）
- description: 画面描述（简洁明了，描述画面内容）
- hasAction: 是否有动作（true/false）
- startFrame: 动作开始时的画面（仅当hasAction=true时）
- endFrame: 动作结束时的画面（仅当hasAction=true时）
- endState: 镜头结束时的状态（角色位置、姿势、表情）
- dialogue: 对白内容（没有则留空）
- dialogues: 结构化对白数组，格式为 [{"character": "角色名", "line": "台词内容"}]，多人对话时按说话顺序排列。没有对白则为空数组 []
- duration: 时长（秒，一般2-4秒）
- characters: 出场角色数组（【重要】必须包含 description 中的所有角色名）
- props: 画面中的重要道具数组（如 ["手机", "传单", "书本"]）
- location: 场景地点
- emotion: 情绪氛围
- cameraMovement: 镜头运动（"static"/"push"/"pull"/"pan"/"tilt"/"track"/"dolly"/"zoom"/"orbit"/"dolly_zoom"/"crane"/"handheld"/"steadicam"/"whip_pan"）

[示例】
[
  {"order": 1, "shotType": "全景", "description": "早晨的客厅，阳光从窗帘缝隙透入，小明坐在沙发上看手机", "hasAction": false, "endState": "小明坐在沙发上，手持手机，表情平静", "dialogue": "", "duration": 2, "characters": ["小明"], "props": ["手机"], "location": "客厅", "emotion": "平静", "cameraMovement": "static"},
  {"order": 2, "shotType": "近景", "description": "小明抬头看向门口，眉头微皱", "hasAction": true, "startFrame": "小明低头看手机", "endFrame": "小明抬头，眉头微皱，望向门口", "endState": "小明坐在沙发上，抬头望向门口，眉头微皱", "dialogue": "", "duration": 2, "characters": ["小明"], "props": [], "location": "客厅", "emotion": "疑惑", "cameraMovement": "static"},
  {"order": 3, "shotType": "近景", "description": "小明开口说话", "hasAction": false, "endState": "小明坐在沙发上，面向门口", "dialogue": "谁在门外？", "duration": 2, "characters": ["小明"], "props": [], "location": "客厅", "emotion": "疑惑", "cameraMovement": "static"}
]

只输出 JSON 数组，不要其他内容。`;

  const result = await withTimeout(
    handleBaseTextModelCall({
      prompt: fullPrompt,
      textModel: modelName,
      maxTokens: 8192,
      temperature: 0.3,
      think
    }, onProgress),
    AI_CALL_TIMEOUT,
    `分镜生成 AI 调用超时（${Math.round(AI_CALL_TIMEOUT / 1000)}秒），请稍后重试`
  );

  if (onProgress) onProgress(80);

  // 解析 AI 返回的 JSON（优化后的容错流程）
  let scenes = [];
  try {
    console.log('[StoryboardGen] 响应总长度:', result.content.length, '字符');

    // 1. 统一清洗：去 think 标签 + 提取代码块 + 去不可见字符
    let jsonStr = stripThinkTags(result.content);
    jsonStr = extractCodeBlock(jsonStr);
    jsonStr = stripInvisible(jsonStr).trim();

    // 2. 尝试直接解析
    try {
      scenes = JSON.parse(jsonStr);
      console.log('[StoryboardGen] ✅ 直接解析成功，共', scenes.length, '个分镜');
    } catch (directParseError) {
      // 2.5 尝试提取 JSON 片段
      const extracted = extractJSON(jsonStr);
      if (extracted) {
        try {
          scenes = JSON.parse(extracted);
          console.log('[StoryboardGen] ✅ 提取 JSON 片段解析成功，共', scenes.length, '个分镜');
        } catch (_) { /* 继续往下 fallback */ }
      }

      if (!Array.isArray(scenes) || scenes.length === 0) {
        // 3. jsonrepair 库修复
        console.log('[StoryboardGen] 直接解析失败，使用 jsonrepair 修复...');
        try {
          const { jsonrepair } = await import('jsonrepair');
          const repaired = jsonrepair(jsonStr);
          scenes = JSON.parse(repaired);
          console.log('[StoryboardGen] ✅ jsonrepair 修复成功，共', scenes.length, '个分镜');
        } catch (repairLibError) {
          console.error('[StoryboardGen] ❌ jsonrepair 修复失败:', repairLibError.message);

          // 4. 尝试部分解析：提取已完成的分镜（替代60秒AI修复）
          console.log('[StoryboardGen] 🔧 尝试部分解析...');
          const partialScenes = tryPartialParse(jsonStr);
          
          if (partialScenes.length >= 3) {
            // 至少解析出3个分镜才接受
            scenes = partialScenes;
            console.log('[StoryboardGen] ✅ 部分解析成功，共', scenes.length, '个分镜');
          } else {
            // 部分解析也失败，抛出原始错误
            throw new Error('分镜 JSON 解析失败: ' + directParseError.message);
          }
        }
      }
    }
  } catch (parseError) {
    console.error('[StoryboardGen] 解析分镜 JSON 失败:', parseError);
    console.error('[StoryboardGen] 完整响应内容:', result.content);
    throw new Error('分镜解析失败: ' + parseError.message);
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('AI 未返回有效的分镜数据');
  }

  // 后处理：修复角色列表遗漏
  scenes = postProcessScenes(scenes);

  // 时长校验与调整（支持重试）
  let durationResult = adjustSceneDurations(
    scenes, 
    durationConfig.minDuration, 
    durationConfig.maxDuration, 
    durationConfig.tolerance
  );

  // 如果需要重新生成（严重超出范围），最多重试1次
  if (durationResult.needsRegeneration) {
    console.log('[StoryboardGen] 时长严重超出范围，触发重新生成（第1次重试）');
    if (onProgress) {
      onProgress({ message: '分镜时长不符合要求，正在重新生成...' });
    }
    
    try {
      const retryResult = await withTimeout(
        handleBaseTextModelCall({
          prompt: fullPrompt,
          textModel: modelName,
          maxTokens: 8192,
          temperature: 0.3,
          think
        }, onProgress),
        AI_CALL_TIMEOUT,
        `分镜重试生成 AI 调用超时（${Math.round(AI_CALL_TIMEOUT / 1000)}秒）`
      );

      let retryJsonStr = stripThinkTags(retryResult.content);
      retryJsonStr = extractCodeBlock(retryJsonStr);
      retryJsonStr = stripInvisible(retryJsonStr).trim();
      
      let retryScenes = [];
      try {
        retryScenes = JSON.parse(retryJsonStr);
      } catch (_) {
        try {
          const { jsonrepair } = await import('jsonrepair');
          retryScenes = JSON.parse(jsonrepair(retryJsonStr));
        } catch (_) { /* 重试解析失败 */ }
      }

      if (Array.isArray(retryScenes) && retryScenes.length > 0) {
        retryScenes = postProcessScenes(retryScenes);
        durationResult = adjustSceneDurations(
          retryScenes,
          durationConfig.minDuration,
          durationConfig.maxDuration,
          durationConfig.tolerance
        );
        console.log('[StoryboardGen] 重试生成完成，时长:', durationResult.totalDuration, '秒');
      }
    } catch (retryError) {
      console.warn('[StoryboardGen] 重试生成失败:', retryError.message);
    }
    
    // 如果重试后仍然超出范围，降级为强制比例缩放
    if (durationResult.needsRegeneration) {
      console.log('[StoryboardGen] 重试后仍超出范围，强制比例缩放');
      const forcedResult = adjustSceneDurations(
        durationResult.scenes,
        durationConfig.minDuration,
        durationConfig.maxDuration,
        Infinity  // tolerance设为无穷大，强制走比例缩放逻辑
      );
      durationResult = forcedResult;
    }
  }

  scenes = durationResult.scenes;
  const totalDuration = durationResult.totalDuration;

  if (onProgress) onProgress(100);

  // 收集所有角色、场景和道具
  const allCharacters = [...new Set(scenes.flatMap(s => s.characters || []))];
  const allLocations = [...new Set(scenes.map(s => s.location).filter(Boolean))];
  const allProps = [...new Set(scenes.flatMap(s => s.props || []))];

  console.log('[StoryboardGen] 最终统计 - 分镜:', scenes.length, '角色:', allCharacters.length, '场景:', allLocations.length, '道具:', allProps.length, '总时长:', totalDuration, '秒');

  return {
    scenes,
    characters: allCharacters,
    locations: allLocations,
    props: allProps,
    count: scenes.length,
    totalDuration,
    tokens: result.tokens || 0,
    provider: result._model?.provider || 'unknown'
  };
}

module.exports = handleStoryboardGeneration;
