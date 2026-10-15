/**
 * 镜头语言类型定义
 * 专业影视镜头参数系统
 */

// ============ 基础枚举类型 ============

/** 景别 - Shot Size */
export type ShotSize = 
  | 'extreme_close_up'  // 大特写
  | 'close_up'          // 特写
  | 'medium_close_up'   // 中近景
  | 'medium_shot'       // 中景
  | 'medium_long_shot'  // 中全景
  | 'long_shot'         // 全景
  | 'extreme_long_shot'; // 大远景

/** 机位高度 - Camera Height */
export type CameraHeight = 
  | 'eye_level'   // 平视
  | 'low_angle'   // 仰拍
  | 'high_angle'  // 俯拍
  | 'bird_eye'    // 鸟瞰
  | 'worm_eye'       // 虫视
  | 'pov'            // 主观视角（第一人称）
  | 'dutch_angle'    // 荷兰角（倾斜镜头）
  | 'over_shoulder'; // 过肩镜头

/** 镜头运动 - Camera Movement */
export type CameraMovement = 
  | 'static'  // 固定
  | 'push'    // 推
  | 'pull'    // 拉
  | 'pan'     // 摇
  | 'tilt'    // 升降
  | 'track'   // 移
  | 'dolly'   // 跟
  | 'zoom'        // 变焦
  | 'orbit'       // 360度环绕
  | 'dolly_zoom'  // 希区柯克变焦（Dolly Zoom / Vertigo Effect）
  | 'crane'       // 升降臂
  | 'handheld'    // 手持
  | 'steadicam'   // 稳定器
  | 'whip_pan';   // 甩镜

/** 镜头类型 - Lens Type (deprecated: 请使用 FocalLength) */
export type LensType = 
  | 'wide'       // 广角
  | 'standard'   // 标准
  | 'telephoto'  // 长焦
  | 'macro'      // 微距
  | 'fisheye';   // 鱼眼

/** 焦距类型 - Focal Length */
export type FocalLength = 
  | 'ultra_wide'   // 超广角 14-24mm
  | 'wide'         // 广角 24-35mm
  | 'standard'     // 标准 35-50mm
  | 'portrait'     // 人像 85-135mm
  | 'telephoto'    // 长焦 200mm+
  | 'macro';       // 微距

/** 摄像机距离 - Camera Distance */
export type CameraDistance = 
  | 'extreme_close'  // 极近
  | 'close'          // 近距
  | 'medium'         // 中距
  | 'far'            // 远距
  | 'extreme_far';   // 极远

/** 光线方向 - Lighting Direction */
export type LightingDirection = 
  | 'front'        // 正面光
  | 'side'         // 侧面光
  | 'back'         // 背光/逆光
  | 'top'          // 顶光
  | 'bottom'       // 底光
  | 'rim'          // 轮廓光
  | 'three_point'  // 三点布光
  | 'natural';     // 自然光方向

/** 光线质量 - Lighting Quality */
export type LightingQuality = 
  | 'hard'       // 硬光
  | 'soft'       // 软光
  | 'diffused'   // 散射光
  | 'specular'   // 镜面反射光
  | 'ambient'    // 环境光
  | 'dappled';   // 斑驳光

/** 光线色温 - Lighting Color */
export type LightingColor = 
  | 'warm'         // 暖色调 3000K-4000K
  | 'cool'         // 冷色调 6500K-10000K
  | 'neutral'      // 中性色温 5000K-5500K
  | 'golden_hour'  // 黄金时段
  | 'blue_hour'    // 蓝调时刻
  | 'moonlight'    // 月光
  | 'neon'         // 霓虹
  | 'mixed';       // 混合色温

/** 光线对比度 - Lighting Intensity */
export type LightingIntensity = 
  | 'high_key'      // 高调
  | 'low_key'       // 低调
  | 'high_contrast' // 高对比
  | 'low_contrast'  // 低对比
  | 'silhouette';   // 剪影

/** 光源类型 - Lighting Source */
export type LightingSource = 
  | 'natural_daylight'  // 自然日光
  | 'moonlight'         // 月光
  | 'overcast'          // 阴天散射
  | 'golden_hour'       // 黄金时段
  | 'blue_hour'         // 蓝调时刻
  | 'led'               // LED灯
  | 'spotlight'         // 聚光灯
  | 'softbox'           // 柔光箱
  | 'practical'         // 实用光源（台灯、蜡烛等）
  | 'mixed';            // 混合光源

/** 景深 - Depth of Field */
export type DepthOfField = 
  | 'shallow'  // 浅景深
  | 'medium'   // 中等
  | 'deep';    // 深景深

/** 光影氛围 - Lighting Mood */
export type LightingMood = 
  | 'high_key'      // 高调
  | 'low_key'       // 低调
  | 'chiaroscuro'   // 明暗对比
  | 'silhouette'    // 剪影
  | 'backlit';      // 逆光

/** 构图法则 - Composition Rule */
export type CompositionRule = 
  | 'rule_of_thirds'   // 三分法
  | 'center'           // 中心构图
  | 'symmetry'         // 对称
  | 'leading_lines'    // 引导线
  | 'frame_in_frame';  // 框中框

/** 轴线位置 - Axis Position */
export type AxisPosition = 
  | 'left'     // 左侧
  | 'right'    // 右侧
  | 'on_axis'; // 轴线上

/** 屏幕方向 - Screen Direction */
export type ScreenDirection = 
  | 'left_to_right'       // 左→右
  | 'right_to_left'       // 右→左
  | 'towards_camera'      // 朝向镜头
  | 'away_from_camera';   // 远离镜头

/** 转场类型 - Transition Type */
export type TransitionType = 
  | 'cut'         // 硬切
  | 'fade'        // 淡入淡出
  | 'dissolve'    // 叠化
  | 'wipe'        // 划像
  | 'match_cut';  // 匹配剪辑

/** 蒙太奇类型 - Montage Type */
export type MontageType = 
  | 'narrative'      // 叙事蒙太奇：连续镜头按时间顺序讲述故事
  | 'expressive'     // 表现蒙太奇：通过镜头对比表达情感和思想
  | 'cross_cutting'  // 交叉蒙太奇：两个或多个场景交替出现
  | 'metaphorical'   // 隐喻蒙太奇：通过镜头组合产生象征意义
  | 'accumulative';  // 积累蒙太奇：重复类似镜头强化主题

// ============ 镜头语言完整接口 ============

export interface ShotLanguage {
  /** 景别 */
  shotSize?: ShotSize;
  /** 机位高度 */
  cameraHeight?: CameraHeight;
  /** 镜头运动 */
  cameraMovement?: CameraMovement;
  /** 镜头类型 (deprecated: 请使用 focalLength) */
  lensType?: LensType;
  /** 焦距类型 */
  focalLength?: FocalLength;
  /** 具体焦距mm值（如 24, 35, 50, 85, 135, 200） */
  focalLengthMm?: number;
  /** 摄像机距离 */
  cameraDistance?: CameraDistance;
  /** 焦点位置描述 */
  focusPoint?: string;
  /** 景深 */
  depthOfField?: DepthOfField;
  /** 光影氛围 (deprecated: 请使用 lightingIntensity) */
  lightingMood?: LightingMood;
  /** 光线方向 */
  lightingDirection?: LightingDirection;
  /** 光线质量 */
  lightingQuality?: LightingQuality;
  /** 光线色温 */
  lightingColor?: LightingColor;
  /** 光线对比度 */
  lightingIntensity?: LightingIntensity;
  /** 光源类型 */
  lightingSource?: LightingSource;
  /** 构图法则 */
  compositionRule?: CompositionRule;
  /** 轴线位置 */
  axisPosition?: AxisPosition;
  /** 屏幕方向 */
  screenDirection?: ScreenDirection;
  /** 镜头时长（秒） */
  shotDuration?: number;
  /** 转场类型 */
  transitionType?: TransitionType;
  /** 蒙太奇类型 */
  montageType?: MontageType;
  /** 主观视角角色名（当 cameraHeight === 'pov' 时生效） */
  povCharacter?: string;
}

// ============ 选项配置类型 ============

export interface ShotLanguageOption {
  value: string;
  label: string;
  description: string;
  icon?: string;
}

export interface ShotLanguageOptions {
  shotSize: ShotLanguageOption[];
  cameraHeight: ShotLanguageOption[];
  cameraMovement: ShotLanguageOption[];
  lensType: ShotLanguageOption[];
  focalLength: ShotLanguageOption[];
  cameraDistance: ShotLanguageOption[];
  depthOfField: ShotLanguageOption[];
  lightingMood: ShotLanguageOption[];
  lightingDirection: ShotLanguageOption[];
  lightingQuality: ShotLanguageOption[];
  lightingColor: ShotLanguageOption[];
  lightingIntensity: ShotLanguageOption[];
  lightingSource: ShotLanguageOption[];
  compositionRule: ShotLanguageOption[];
  axisPosition: ShotLanguageOption[];
  screenDirection: ShotLanguageOption[];
  transitionType: ShotLanguageOption[];
  montageType: ShotLanguageOption[];
}

// ============ 轴线检查相关类型 ============

export interface AxisIssue {
  /** 问题类型 */
  type: 'axis_violation' | 'direction_mismatch' | 'continuity_error';
  /** 严重程度 */
  severity: 'error' | 'warning' | 'info';
  /** 起始分镜ID */
  fromStoryboardId: number;
  /** 目标分镜ID */
  toStoryboardId: number;
  /** 起始分镜序号 */
  fromIndex: number;
  /** 目标分镜序号 */
  toIndex: number;
  /** 问题描述 */
  message: string;
  /** 改进建议 */
  suggestion: string;
}

export interface AxisCheckResult {
  success: boolean;
  scriptId: number;
  totalScenes: number;
  issues: AxisIssue[];
  issueCount: number;
}

// ============ API 响应类型 ============

export interface ShotLanguageResponse {
  success: boolean;
  storyboardId: number;
  shotLanguage: ShotLanguage;
}

export interface ShotLanguageUpdateResponse {
  success: boolean;
  message: string;
  storyboardId: number;
  updates: Partial<ShotLanguage>;
}

export interface ShotLanguageOptionsResponse {
  success: boolean;
  options: ShotLanguageOptions;
}

// ============ 快捷预设 ============

export interface ShotPreset {
  id: string;
  name: string;
  description: string;
  shotLanguage: ShotLanguage;
  category: 'dialogue' | 'action' | 'emotion' | 'establishing' | 'custom';
}

/** 导演常用镜头预设（已升级为专业摄像机+打光参数） */
export const DEFAULT_SHOT_PRESETS: ShotPreset[] = [
  {
    id: 'dialogue_standard',
    name: '标准对话',
    description: '50mm标准镜头 + 三点布光，适合一般对话场景',
    category: 'dialogue',
    shotLanguage: {
      shotSize: 'medium_shot',
      cameraHeight: 'eye_level',
      cameraMovement: 'static',
      focalLength: 'standard',
      focalLengthMm: 50,
      cameraDistance: 'medium',
      depthOfField: 'medium',
      compositionRule: 'rule_of_thirds',
      lightingDirection: 'three_point',
      lightingQuality: 'soft',
      lightingColor: 'neutral',
      lightingIntensity: 'low_contrast',
      lightingSource: 'led',
    },
  },
  {
    id: 'dialogue_intimate',
    name: '亲密对话',
    description: '85mm人像镜头 + 暖色软光，强调情绪交流',
    category: 'dialogue',
    shotLanguage: {
      shotSize: 'close_up',
      cameraHeight: 'eye_level',
      cameraMovement: 'static',
      focalLength: 'portrait',
      focalLengthMm: 85,
      cameraDistance: 'close',
      depthOfField: 'shallow',
      compositionRule: 'center',
      lightingDirection: 'front',
      lightingQuality: 'soft',
      lightingColor: 'warm',
      lightingIntensity: 'low_contrast',
      lightingSource: 'softbox',
    },
  },
  {
    id: 'action_dynamic',
    name: '动感动作',
    description: '28mm广角 + 手持跟拍，展现肢体动作',
    category: 'action',
    shotLanguage: {
      shotSize: 'medium_long_shot',
      cameraHeight: 'eye_level',
      cameraMovement: 'dolly',
      focalLength: 'wide',
      focalLengthMm: 28,
      cameraDistance: 'medium',
      depthOfField: 'deep',
      compositionRule: 'leading_lines',
      lightingDirection: 'natural',
      lightingQuality: 'hard',
      lightingColor: 'neutral',
      lightingIntensity: 'high_contrast',
      lightingSource: 'natural_daylight',
    },
  },
  {
    id: 'emotion_intense',
    name: '强烈情绪',
    description: '50mm标准 + 侧光高对比，强化情绪冲击',
    category: 'emotion',
    shotLanguage: {
      shotSize: 'close_up',
      cameraHeight: 'low_angle',
      cameraMovement: 'push',
      focalLength: 'standard',
      focalLengthMm: 50,
      cameraDistance: 'close',
      depthOfField: 'shallow',
      lightingDirection: 'side',
      lightingQuality: 'hard',
      lightingColor: 'cool',
      lightingIntensity: 'high_contrast',
      lightingSource: 'spotlight',
      compositionRule: 'center',
    },
  },
  {
    id: 'establishing_wide',
    name: '环境 establishing',
    description: '18mm超广角 + 自然光，展现场景全貌',
    category: 'establishing',
    shotLanguage: {
      shotSize: 'extreme_long_shot',
      cameraHeight: 'bird_eye',
      cameraMovement: 'static',
      focalLength: 'ultra_wide',
      focalLengthMm: 18,
      cameraDistance: 'extreme_far',
      depthOfField: 'deep',
      compositionRule: 'symmetry',
      lightingDirection: 'natural',
      lightingQuality: 'diffused',
      lightingColor: 'neutral',
      lightingIntensity: 'low_contrast',
      lightingSource: 'natural_daylight',
    },
  },
  {
    id: 'suspense_mystery',
    name: '悬疑神秘',
    description: '85mm人像 + 低调硬光，营造神秘感',
    category: 'emotion',
    shotLanguage: {
      shotSize: 'medium_shot',
      cameraHeight: 'eye_level',
      cameraMovement: 'static',
      focalLength: 'portrait',
      focalLengthMm: 85,
      cameraDistance: 'medium',
      depthOfField: 'shallow',
      lightingDirection: 'side',
      lightingQuality: 'hard',
      lightingColor: 'cool',
      lightingIntensity: 'low_key',
      lightingSource: 'spotlight',
      compositionRule: 'rule_of_thirds',
    },
  },
];

// ============ 新增选项常量（摄像机 + 打光） ============

/** 焦距类型选项 */
export const FOCAL_LENGTH_OPTIONS: ShotLanguageOption[] = [
  { value: 'ultra_wide', label: '超广角', description: '14-24mm，夸张透视，宏大场景' },
  { value: 'wide', label: '广角', description: '24-35mm，环境交代，空间感强' },
  { value: 'standard', label: '标准', description: '35-50mm，接近人眼视角，自然真实' },
  { value: 'portrait', label: '人像', description: '85-135mm，压缩背景，虚化优美' },
  { value: 'telephoto', label: '长焦', description: '200mm+，压缩空间感，孤立主体' },
  { value: 'macro', label: '微距', description: '超近距离拍摄，细节放大' },
];

/** 焦距类型对应的默认mm值 */
export const FOCAL_LENGTH_DEFAULT_MM: Record<FocalLength, number> = {
  ultra_wide: 18,
  wide: 28,
  standard: 50,
  portrait: 85,
  telephoto: 200,
  macro: 100,
};

/** 焦距类型对应的mm范围 */
export const FOCAL_LENGTH_RANGE: Record<FocalLength, [number, number]> = {
  ultra_wide: [14, 24],
  wide: [24, 35],
  standard: [35, 50],
  portrait: [85, 135],
  telephoto: [200, 400],
  macro: [50, 200],
};

/** 摄像机距离选项 */
export const CAMERA_DISTANCE_OPTIONS: ShotLanguageOption[] = [
  { value: 'extreme_close', label: '极近', description: '极近距离，微距或大特写' },
  { value: 'close', label: '近距', description: '近距离，特写或近景' },
  { value: 'medium', label: '中距', description: '中等距离，中景' },
  { value: 'far', label: '远距', description: '较远距离，全景' },
  { value: 'extreme_far', label: '极远', description: '极远距离，远景或大远景' },
];

/** 光线方向选项 */
export const LIGHTING_DIRECTION_OPTIONS: ShotLanguageOption[] = [
  { value: 'front', label: '正面光', description: '光源从摄像机方向照射，减少阴影' },
  { value: 'side', label: '侧面光', description: '光源从侧面照射，强调轮廓和立体感' },
  { value: 'back', label: '背光/逆光', description: '光源从主体背后照射，形成剪影或光晕' },
  { value: 'top', label: '顶光', description: '光源从上方照射，产生强烈阴影' },
  { value: 'bottom', label: '底光', description: '光源从下方照射，营造恐怖或超自然感' },
  { value: 'rim', label: '轮廓光', description: '从侧后方照射，勾勒主体边缘' },
  { value: 'three_point', label: '三点布光', description: '主光、辅光、轮廓光的经典组合' },
  { value: 'natural', label: '自然光', description: '模拟自然环境光照，柔和真实' },
];

/** 光线质量选项 */
export const LIGHTING_QUALITY_OPTIONS: ShotLanguageOption[] = [
  { value: 'hard', label: '硬光', description: '明确的阴影边缘，戏剧性强' },
  { value: 'soft', label: '软光', description: '柔和的阴影过渡，温和舒适' },
  { value: 'diffused', label: '散射光', description: '均匀分布，无明显方向性' },
  { value: 'specular', label: '镜面反射光', description: '高光点明显，有光泽感' },
  { value: 'ambient', label: '环境光', description: '整体基础照明，无明确方向' },
  { value: 'dappled', label: '斑驳光', description: '透过树叶等产生的不均匀光斑' },
];

/** 光线色温选项 */
export const LIGHTING_COLOR_OPTIONS: ShotLanguageOption[] = [
  { value: 'warm', label: '暖色调', description: '橙黄色系，温馨舒适感 (3000K-4000K)' },
  { value: 'cool', label: '冷色调', description: '蓝色系，冷峻科技感 (6500K-10000K)' },
  { value: 'neutral', label: '中性色温', description: '自然白光，真实还原 (5000K-5500K)' },
  { value: 'golden_hour', label: '黄金时段', description: '日出日落时的金色光线' },
  { value: 'blue_hour', label: '蓝调时刻', description: '黎明或黄昏后的蓝色调' },
  { value: 'moonlight', label: '月光', description: '清冷的银蓝色调' },
  { value: 'neon', label: '霓虹', description: '多彩人工光源，赛博朋克风格' },
  { value: 'mixed', label: '混合色温', description: '冷暖光源混合，形成对比' },
];

/** 光线对比度选项 */
export const LIGHTING_INTENSITY_OPTIONS: ShotLanguageOption[] = [
  { value: 'high_key', label: '高调', description: '整体明亮，阴影少，轻快乐观' },
  { value: 'low_key', label: '低调', description: '大面积阴影，戏剧性强，神秘紧张' },
  { value: 'high_contrast', label: '高对比', description: '明暗对比强烈，视觉冲击力强' },
  { value: 'low_contrast', label: '低对比', description: '明暗过渡柔和，朦胧梦幻' },
  { value: 'silhouette', label: '剪影', description: '主体完全逆光，仅见轮廓' },
];

/** 光源类型选项（分两大类：自然光 / 人工光） */
export const LIGHTING_SOURCE_OPTIONS: ShotLanguageOption[] = [
  { value: 'natural_daylight', label: '自然日光', description: '晴天直射阳光' },
  { value: 'overcast', label: '阴天散射', description: '云层散射的柔和自然光' },
  { value: 'golden_hour', label: '黄金时段', description: '日出日落时的温暖光线' },
  { value: 'blue_hour', label: '蓝调时刻', description: '黎明或黄昏后的蓝色光线' },
  { value: 'moonlight', label: '月光', description: '夜晚月光照明' },
  { value: 'led', label: 'LED灯', description: 'LED面板灯，现代常用' },
  { value: 'spotlight', label: '聚光灯', description: '定向强光，突出主体' },
  { value: 'softbox', label: '柔光箱', description: '大面积柔和均匀光照' },
  { value: 'practical', label: '实用光源', description: '台灯、蜡烛、火把等场景内光源' },
  { value: 'mixed', label: '混合光源', description: '自然光+人工光组合' },
];

/** 自然光光源列表（用于前端分组展示） */
export const NATURAL_LIGHT_SOURCES = ['natural_daylight', 'overcast', 'golden_hour', 'blue_hour', 'moonlight'] as const;

/** 人工光光源列表（用于前端分组展示） */
export const ARTIFICIAL_LIGHT_SOURCES = ['led', 'spotlight', 'softbox', 'practical', 'mixed'] as const;

/** 蒙太奇类型选项 */
export const MONTAGE_TYPE_OPTIONS: ShotLanguageOption[] = [
  { value: 'narrative', label: '叙事蒙太奇', description: '连续镜头按时间顺序讲述故事' },
  { value: 'expressive', label: '表现蒙太奇', description: '通过镜头对比表达情感和思想' },
  { value: 'cross_cutting', label: '交叉蒙太奇', description: '两个或多个场景交替出现' },
  { value: 'metaphorical', label: '隐喻蒙太奇', description: '通过镜头组合产生象征意义' },
  { value: 'accumulative', label: '积累蒙太奇', description: '重复类似镜头强化主题' },
];

// ============ 辅助函数 ============

/** 获取景别的中文名称 */
export function getShotSizeLabel(size?: ShotSize | string): string {
  const labels: Record<ShotSize, string> = {
    extreme_close_up: '大特写',
    close_up: '特写',
    medium_close_up: '中近景',
    medium_shot: '中景',
    medium_long_shot: '中全景',
    long_shot: '全景',
    extreme_long_shot: '大远景',
  };
  // 如果传入的是中文标签，直接返回（兼容旧数据）
  if (!size) return '';
  // 检查是否是中文标签
  if (['大特写', '特写', '中近景', '中景', '中全景', '全景', '大远景', '远景'].includes(size)) {
    return size === '远景' ? '全景' : size; // "远景"映射到"全景"
  }
  return labels[size as ShotSize] || size;
}

/** 获取景别的视觉表示（用于缩略图） */
export function getShotSizeVisual(size?: ShotSize | string): string {
  const visuals: Record<ShotSize, string> = {
    extreme_close_up: '👁️',
    close_up: '😊',
    medium_close_up: '👤',
    medium_shot: '🧍',
    medium_long_shot: '🚶',
    long_shot: '🏞️',
    extreme_long_shot: '🌄',
  };
  // 中文标签到英文值的映射
  const labelToValue: Record<string, ShotSize> = {
    '大特写': 'extreme_close_up',
    '特写': 'close_up',
    '中近景': 'medium_close_up',
    '中景': 'medium_shot',
    '中全景': 'medium_long_shot',
    '全景': 'long_shot',
    '大远景': 'extreme_long_shot',
    '远景': 'long_shot', // 兼容旧数据
  };
  if (!size) return '';
  // 如果是中文标签，转换为英文值
  const normalizedSize = labelToValue[size] || (size as ShotSize);
  return visuals[normalizedSize] || '';
}

/** 检查两个分镜是否越轴 */
export function isAxisViolation(
  currentAxis?: AxisPosition,
  nextAxis?: AxisPosition
): boolean {
  if (!currentAxis || !nextAxis) return false;
  if (currentAxis === 'on_axis' || nextAxis === 'on_axis') return false;
  return currentAxis !== nextAxis;
}

/** 计算镜头时长建议（基于描述长度） */
export function suggestShotDuration(description: string): number {
  // 基础时长2秒
  let duration = 2;
  
  // 根据字数增加时长（每秒约3-4个字）
  const charCount = description.length;
  if (charCount > 0) {
    duration += Math.ceil(charCount / 3.5);
  }
  
  // 限制在2-10秒之间
  return Math.max(2, Math.min(10, duration));
}

/** 旧 lensType 到新 focalLength 的映射 */
const LENS_TYPE_TO_FOCAL_LENGTH: Record<string, FocalLength> = {
  wide: 'wide',
  standard: 'standard',
  telephoto: 'telephoto',
  macro: 'macro',
  fisheye: 'ultra_wide',
};

/** 旧 lightingMood 到新 lightingIntensity 的映射 */
const LIGHTING_MOOD_TO_INTENSITY: Record<string, LightingIntensity> = {
  high_key: 'high_key',
  low_key: 'low_key',
  chiaroscuro: 'high_contrast',
  silhouette: 'silhouette',
  backlit: 'low_key',
};

/**
 * 将旧版 ShotLanguage 字段迁移到新版
 * - lensType -> focalLength + focalLengthMm
 * - lightingMood -> lightingIntensity
 */
export function migrateShotLanguage(values: ShotLanguage): ShotLanguage {
  const migrated = { ...values };

  // 迁移 lensType -> focalLength
  if (!migrated.focalLength && migrated.lensType) {
    migrated.focalLength = LENS_TYPE_TO_FOCAL_LENGTH[migrated.lensType] || 'standard';
  }
  if (!migrated.focalLengthMm && migrated.focalLength) {
    migrated.focalLengthMm = FOCAL_LENGTH_DEFAULT_MM[migrated.focalLength];
  }

  // 迁移 lightingMood -> lightingIntensity
  if (!migrated.lightingIntensity && migrated.lightingMood) {
    migrated.lightingIntensity = LIGHTING_MOOD_TO_INTENSITY[migrated.lightingMood] || 'low_contrast';
  }

  return migrated;
}

/**
 * 获取焦距类型的中文名称
 */
export function getFocalLengthLabel(fl?: FocalLength): string {
  const labels: Record<FocalLength, string> = {
    ultra_wide: '超广角',
    wide: '广角',
    standard: '标准',
    portrait: '人像',
    telephoto: '长焦',
    macro: '微距',
  };
  return fl ? labels[fl] : '';
}

/**
 * 获取摄像机距离的中文名称
 */
export function getCameraDistanceLabel(cd?: CameraDistance): string {
  const labels: Record<CameraDistance, string> = {
    extreme_close: '极近',
    close: '近距',
    medium: '中距',
    far: '远距',
    extreme_far: '极远',
  };
  return cd ? labels[cd] : '';
}
