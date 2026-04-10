/**
 * 积木块注册表
 * 管理所有积木块的定义和配置
 */

import {
  BlockType,
  BlockCategory,
  BlockDefinition,
  BlockData,
  BlockOption,
} from '../types/blockTypes';

// ============ 积木块颜色配置 ============

export const BLOCK_COLORS: Record<BlockCategory, { bg: string; border: string; text: string }> = {
  text: { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700' },
  shot: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-700' },
  character: { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-700' },
  scene: { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-700' },
  action: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-700' },
  reference: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-700' },
};

// ============ 积木块选项配置 ============

export const BLOCK_OPTIONS: Record<string, BlockOption[]> = {
  shotSize: [
    { value: 'extreme_close_up', label: '超近景', description: '聚焦细节，如眼睛、手指', icon: '👁️' },
    { value: 'close_up', label: '近景', description: '面部表情，情感表达', icon: '😊' },
    { value: 'medium_close_up', label: '中近景', description: '头部和肩部', icon: '👤' },
    { value: 'medium_shot', label: '中景', description: '上半身，常用对话镜头', icon: '🧍' },
    { value: 'medium_long_shot', label: '中远景', description: '大部分身体', icon: '🚶' },
    { value: 'long_shot', label: '全景', description: '完整人物', icon: '🏞️' },
    { value: 'extreme_long_shot', label: '超远景', description: '宏大场面', icon: '🌄' },
  ],
  cameraAngle: [
    { value: 'eye_level', label: '平视', description: '自然、平等的视角', icon: '➡️' },
    { value: 'low_angle', label: '仰视', description: '使人物显得高大、威严', icon: '⬆️' },
    { value: 'high_angle', label: '俯视', description: '使人物显得渺小、脆弱', icon: '⬇️' },
    { value: 'bird_eye', label: '鸟瞰', description: '从上方俯瞰全局', icon: '🦅' },
    { value: 'worm_eye', label: '虫视', description: '从下方仰视', icon: '🐛' },
  ],
  movement: [
    { value: 'static', label: '固定', description: '镜头保持不动', icon: '📷' },
    { value: 'push', label: '推', description: '逐渐放大', icon: '🔍' },
    { value: 'pull', label: '拉', description: '逐渐缩小', icon: '🔎' },
    { value: 'pan', label: '摇', description: '镜头左右转动', icon: '↔️' },
    { value: 'tilt', label: '升降', description: '镜头上下转动', icon: '↕️' },
    { value: 'track', label: '移', description: '镜头平行移动', icon: '➡️' },
    { value: 'dolly', label: '跟', description: '跟随主体移动', icon: '🏃' },
    { value: 'zoom', label: '变焦', description: '改变焦距', icon: '🔭' },
  ],
  lensType: [
    { value: 'wide', label: '广角', description: '视野宽广，有透视变形', icon: '📐' },
    { value: 'standard', label: '标准', description: '接近人眼视角', icon: '👁️' },
    { value: 'telephoto', label: '长焦', description: '压缩空间，背景虚化', icon: '🔭' },
    { value: 'macro', label: '微距', description: '拍摄特写细节', icon: '🔬' },
    { value: 'fisheye', label: '鱼眼', description: '超广角，强烈变形', icon: '🐟' },
  ],
  depthOfField: [
    { value: 'shallow', label: '浅景深', description: '背景虚化，突出主体', icon: '🌸' },
    { value: 'medium', label: '中等', description: '适度虚化', icon: '⚖️' },
    { value: 'deep', label: '深景深', description: '前后景都清晰', icon: '🏔️' },
  ],
  lightingMood: [
    { value: 'high_key', label: '高调', description: '明亮、轻快', icon: '☀️' },
    { value: 'low_key', label: '低调', description: '暗沉、神秘', icon: '🌑' },
    { value: 'chiaroscuro', label: '明暗对比', description: '强烈光影对比', icon: '🎭' },
    { value: 'silhouette', label: '剪影', description: '轮廓光效果', icon: '👤' },
    { value: 'backlit', label: '逆光', description: '背光效果', icon: '✨' },
  ],
  actionType: [
    { value: 'walk', label: '行走', description: '步行移动', icon: '🚶' },
    { value: 'run', label: '奔跑', description: '快速移动', icon: '🏃' },
    { value: 'talk', label: '对话', description: '说话交流', icon: '💬' },
    { value: 'fight', label: '战斗', description: '打斗动作', icon: '⚔️' },
    { value: 'sit', label: '坐下', description: '坐姿', icon: '🪑' },
    { value: 'stand', label: '站立', description: '站姿', icon: '🧍' },
    { value: 'gesture', label: '手势', description: '手部动作', icon: '👋' },
    { value: 'custom', label: '自定义', description: '其他动作', icon: '✏️' },
  ],
  characterPosition: [
    { value: 'left', label: '左侧', description: '画面左侧', icon: '⬅️' },
    { value: 'center', label: '中央', description: '画面中央', icon: '⏺️' },
    { value: 'right', label: '右侧', description: '画面右侧', icon: '➡️' },
  ],
  verticalPosition: [
    { value: 'foreground', label: '前景', description: '靠近镜头', icon: '👤' },
    { value: 'middle', label: '中景', description: '画面中间', icon: '🧍' },
    { value: 'background', label: '背景', description: '远离镜头', icon: '🏔️' },
  ],
  lighting: [
    { value: 'natural', label: '自然光', description: '日光、月光等', icon: '☀️' },
    { value: 'artificial', label: '人工光', description: '灯光、烛光等', icon: '💡' },
    { value: 'mixed', label: '混合光', description: '自然+人工', icon: '🌓' },
  ],
  atmosphere: [
    { value: 'bright', label: '明亮', description: '阳光充足', icon: '☀️' },
    { value: 'dark', label: '暗调', description: '光线昏暗', icon: '🌑' },
    { value: 'warm', label: '暖色', description: '温暖色调', icon: '🔥' },
    { value: 'cool', label: '冷色', description: '冷色调', icon: '❄️' },
    { value: 'dramatic', label: '戏剧性', description: '强烈对比', icon: '🎭' },
    { value: 'soft', label: '柔和', description: '柔光效果', icon: '☁️' },
  ],
};

// ============ 积木块定义注册表 ============

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  text: {
    type: 'text',
    category: 'text',
    label: '文本描述',
    description: '用自然语言描述分镜内容',
    icon: '📝',
    color: 'bg-slate-100',
    defaultData: { text: '' },
    renderConfig: {
      width: 280,
      height: 80,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  shot_size: {
    type: 'shot_size',
    category: 'shot',
    label: '镜头景别',
    description: '选择画面大小和景别',
    icon: '📷',
    color: 'bg-blue-100',
    defaultData: { value: 'medium_shot' },
    renderConfig: {
      width: 200,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  camera_angle: {
    type: 'camera_angle',
    category: 'shot',
    label: '镜头角度',
    description: '选择摄像机高度和角度',
    icon: '📐',
    color: 'bg-blue-100',
    defaultData: { value: 'eye_level' },
    renderConfig: {
      width: 200,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  movement: {
    type: 'movement',
    category: 'shot',
    label: '运镜方式',
    description: '选择镜头运动方式',
    icon: '🎬',
    color: 'bg-blue-100',
    defaultData: { value: 'static' },
    renderConfig: {
      width: 200,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  lens_type: {
    type: 'lens_type',
    category: 'shot',
    label: '镜头类型',
    description: '选择使用的镜头类型',
    icon: '🔭',
    color: 'bg-blue-100',
    defaultData: { value: 'standard' },
    renderConfig: {
      width: 200,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  depth_of_field: {
    type: 'depth_of_field',
    category: 'shot',
    label: '景深',
    description: '设置景深效果',
    icon: '🌸',
    color: 'bg-blue-100',
    defaultData: { value: 'medium' },
    renderConfig: {
      width: 180,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  lighting_mood: {
    type: 'lighting_mood',
    category: 'shot',
    label: '光影氛围',
    description: '设置光影效果',
    icon: '💡',
    color: 'bg-blue-100',
    defaultData: { value: 'high_key' },
    renderConfig: {
      width: 200,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  character: {
    type: 'character',
    category: 'character',
    label: '角色',
    description: '选择场景中的角色',
    icon: '👤',
    color: 'bg-rose-100',
    defaultData: { characterId: 0, characterName: '' },
    renderConfig: {
      width: 220,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  character_attr: {
    type: 'character_attr',
    category: 'character',
    label: '角色属性',
    description: '设置角色的表情和动作',
    icon: '🎭',
    color: 'bg-rose-100',
    defaultData: { expression: '', action: '' },
    renderConfig: {
      width: 240,
      height: 100,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  character_pos: {
    type: 'character_pos',
    category: 'character',
    label: '角色位置',
    description: '设置角色在画面中的位置',
    icon: '📍',
    color: 'bg-rose-100',
    defaultData: { horizontal: 'center', vertical: 'middle' },
    renderConfig: {
      width: 220,
      height: 80,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  scene: {
    type: 'scene',
    category: 'scene',
    label: '场景',
    description: '选择拍摄场景',
    icon: '🏞️',
    color: 'bg-emerald-100',
    defaultData: { sceneId: 0, sceneName: '' },
    renderConfig: {
      width: 220,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  environment: {
    type: 'environment',
    category: 'scene',
    label: '环境参数',
    description: '设置光线、天气、氛围',
    icon: '🌤️',
    color: 'bg-emerald-100',
    defaultData: { lighting: 'natural', atmosphere: 'bright' },
    renderConfig: {
      width: 240,
      height: 100,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  action: {
    type: 'action',
    category: 'action',
    label: '动作',
    description: '选择动作类型',
    icon: '🏃',
    color: 'bg-amber-100',
    defaultData: { type: 'walk' },
    renderConfig: {
      width: 200,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  duration: {
    type: 'duration',
    category: 'action',
    label: '时长',
    description: '设置动作持续时间',
    icon: '⏱️',
    color: 'bg-amber-100',
    defaultData: { seconds: 3 },
    renderConfig: {
      width: 160,
      height: 60,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  effect: {
    type: 'effect',
    category: 'action',
    label: '效果',
    description: '添加特效和音效',
    icon: '✨',
    color: 'bg-amber-100',
    defaultData: { visual: false, sound: false },
    renderConfig: {
      width: 180,
      height: 80,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
  reference_image: {
    type: 'reference_image',
    category: 'reference',
    label: '参考图',
    description: '引用图片作为参考',
    icon: '🖼️',
    color: 'bg-purple-100',
    defaultData: { imageUrl: '', source: 'upload', description: '' },
    renderConfig: {
      width: 200,
      height: 120,
      showLabel: true,
      showIcon: true,
      editable: true,
    },
  },
};

// ============ 工具函数 ============

/**
 * 获取积木块定义
 */
export function getBlockDefinition(type: BlockType): BlockDefinition {
  return BLOCK_DEFINITIONS[type];
}

/**
 * 获取积木块默认数据
 */
export function getBlockDefaultData(type: BlockType): BlockData {
  return BLOCK_DEFINITIONS[type].defaultData;
}

/**
 * 获取分类下的所有积木类型
 */
export function getBlockTypesByCategory(category: BlockCategory): BlockType[] {
  return Object.entries(BLOCK_DEFINITIONS)
    .filter(([_, def]) => def.category === category)
    .map(([type, _]) => type as BlockType);
}

/**
 * 获取所有积木分类
 */
export function getBlockCategories(): { key: BlockCategory; label: string; icon: string }[] {
  return [
    { key: 'text', label: '文本', icon: '📝' },
    { key: 'shot', label: '镜头', icon: '📷' },
    { key: 'character', label: '角色', icon: '👤' },
    { key: 'scene', label: '场景', icon: '🏞️' },
    { key: 'action', label: '动作', icon: '🏃' },
    { key: 'reference', label: '参考', icon: '🖼️' },
  ];
}

/**
 * 生成唯一ID
 */
export function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成连接ID
 */
export function generateConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取选项标签
 */
export function getOptionLabel(options: BlockOption[], value: string): string {
  return options.find(opt => opt.value === value)?.label || value;
}

/**
 * 获取选项描述
 */
export function getOptionDescription(options: BlockOption[], value: string): string {
  return options.find(opt => opt.value === value)?.description || '';
}
