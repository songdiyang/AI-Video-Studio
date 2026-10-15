/**
 * 导演助手 - 专业术语常量和类型定义
 * 
 * 包含三大类别：
 * 1. 光线参数（Lighting）
 * 2. 镜头参数（Camera）
 * 3. 空气感参数（Atmosphere）
 */

// ============================================================
// 类型定义
// ============================================================

export interface LightingParams {
  direction: string;      // 光线方向
  quality: string;        // 光线质量
  color: string;          // 光线色彩
  intensity: string;      // 光线强度
}

export interface CameraParams {
  focalLength: string;    // 焦距
  movement: string;       // 镜头运动
  depthOfField: string;   // 景深
  composition: string;    // 构图方式
  angle: string;          // 拍摄角度
}

export interface AtmosphereParams {
  mood: string;           // 氛围营造
  texture: string;        // 质感表现
  colorGrade: string;     // 调色风格
  visualStyle: string;    // 视觉风格
}

export interface DirectorParams {
  lighting: LightingParams;
  camera: CameraParams;
  atmosphere: AtmosphereParams;
  customNotes?: string;   // 自定义导演备注
}

// ============================================================
// 光线参数选项
// ============================================================

export const LIGHTING_DIRECTION_OPTIONS = [
  { value: 'front', label: '正面光', desc: '光源从摄像机方向照射，减少阴影，画面平坦明亮' },
  { value: 'side', label: '侧面光', desc: '光源从侧面照射，强调轮廓和立体感' },
  { value: 'back', label: '背光/逆光', desc: '光源从主体背后照射，形成剪影效果或光晕' },
  { value: 'top', label: '顶光', desc: '光源从上方照射，产生强烈阴影，常用于神秘氛围' },
  { value: 'bottom', label: '底光', desc: '光源从下方照射，营造恐怖或超自然感' },
  { value: 'rim', label: '轮廓光', desc: '从侧后方照射，勾勒主体边缘' },
  { value: 'three_point', label: '三点布光', desc: '主光、辅光、轮廓光的经典组合' },
  { value: 'natural', label: '自然光', desc: '模拟自然环境光照，柔和真实' },
];

export const LIGHTING_QUALITY_OPTIONS = [
  { value: 'hard', label: '硬光', desc: '明确的阴影边缘，戏剧性强' },
  { value: 'soft', label: '软光', desc: '柔和的阴影过渡，温和舒适' },
  { value: 'diffused', label: '散射光', desc: '均匀分布，无明显方向性' },
  { value: 'specular', label: '镜面反射光', desc: '高光点明显，有光泽感' },
  { value: 'ambient', label: '环境光', desc: '整体基础照明，无明确方向' },
  { value: 'dappled', label: '斑驳光', desc: '透过树叶等产生的不均匀光斑' },
];

export const LIGHTING_COLOR_OPTIONS = [
  { value: 'warm', label: '暖色调', desc: '橙黄色系，温馨舒适感（3000K-4000K）' },
  { value: 'cool', label: '冷色调', desc: '蓝色系，冷峻科技感（6500K-10000K）' },
  { value: 'neutral', label: '中性色温', desc: '自然白光，真实还原（5000K-5500K）' },
  { value: 'golden_hour', label: '黄金时段', desc: '日出日落时的金色光线' },
  { value: 'blue_hour', label: '蓝调时刻', desc: '黎明或黄昏后的蓝色调' },
  { value: 'moonlight', label: '月光', desc: '清冷的银蓝色调' },
  { value: 'neon', label: '霓虹', desc: '多彩人工光源，赛博朋克风格' },
  { value: 'mixed', label: '混合色温', desc: '冷暖光源混合，形成对比' },
];

export const LIGHTING_INTENSITY_OPTIONS = [
  { value: 'high_key', label: '高调', desc: '整体明亮，阴影少，轻快乐观' },
  { value: 'low_key', label: '低调', desc: '大面积阴影，戏剧性强，神秘紧张' },
  { value: 'high_contrast', label: '高对比', desc: '明暗对比强烈，视觉冲击力强' },
  { value: 'low_contrast', label: '低对比', desc: '明暗过渡柔和，朦胧梦幻' },
  { value: 'silhouette', label: '剪影', desc: '主体完全逆光，仅见轮廓' },
];

// ============================================================
// 镜头参数选项
// ============================================================

export const CAMERA_FOCAL_LENGTH_OPTIONS = [
  { value: 'ultra_wide', label: '超广角', desc: '14-24mm，夸张透视，宏大场景' },
  { value: 'wide', label: '广角', desc: '24-35mm，环境交代，空间感强' },
  { value: 'standard', label: '标准', desc: '35-50mm，接近人眼视角，自然真实' },
  { value: 'portrait', label: '人像', desc: '85-135mm，压缩背景，虚化优美' },
  { value: 'telephoto', label: '长焦', desc: '200mm+，压缩空间感，孤立主体' },
  { value: 'macro', label: '微距', desc: '超近距离拍摄，细节放大' },
];

export const CAMERA_MOVEMENT_OPTIONS = [
  { value: 'static', label: '静止', desc: '固定机位，稳定观察' },
  { value: 'push', label: '推', desc: '向主体靠近，强调、聚焦注意力' },
  { value: 'pull', label: '拉', desc: '远离主体，揭示环境、扩大视野' },
  { value: 'pan', label: '摇', desc: '水平旋转，跟随动作或展示环境' },
  { value: 'tilt', label: '俯仰', desc: '垂直旋转，展示高度或引导视线' },
  { value: 'track', label: '跟', desc: '平行移动跟随主体' },
  { value: 'dolly', label: '移', desc: '向前/后移动整个机位' },
  { value: 'zoom', label: '变焦', desc: '变焦推拉，不移动机位' },
  { value: 'crane', label: '升降', desc: '垂直升降，改变视角高度' },
  { value: 'handheld', label: '手持', desc: '轻微抖动，真实感、临场感' },
  { value: 'steadicam', label: '稳定器', desc: '流畅移动，电影感' },
  { value: 'orbit', label: '环绕', desc: '围绕主体360°移动' },
  { value: 'dolly_zoom', label: '希区柯克变焦', desc: '推拉+反向变焦，空间扭曲' },
  { value: 'whip_pan', label: '甩镜', desc: '快速摇摄产生模糊，转场常用' },
];

export const CAMERA_DOF_OPTIONS = [
  { value: 'shallow', label: '浅景深', desc: '仅主体清晰，背景虚化，聚焦注意力' },
  { value: 'medium', label: '中景深', desc: '主体和部分背景清晰' },
  { value: 'deep', label: '深景深', desc: '全画面清晰，展示完整环境' },
  { value: 'rack_focus', label: '焦点转移', desc: '焦点从一处移到另一处' },
  { value: 'split_diopter', label: '分屏对焦', desc: '前后景同时清晰的特殊效果' },
];

export const CAMERA_COMPOSITION_OPTIONS = [
  { value: 'rule_of_thirds', label: '三分法', desc: '主体置于三分线交点，平衡美观' },
  { value: 'center', label: '中心构图', desc: '主体居中，对称稳定' },
  { value: 'symmetry', label: '对称构图', desc: '左右或上下对称，正式庄重' },
  { value: 'leading_lines', label: '引导线', desc: '利用线条引导视线至主体' },
  { value: 'frame_within_frame', label: '框中框', desc: '利用前景元素框住主体' },
  { value: 'diagonal', label: '对角线', desc: '沿对角线布置，动感活力' },
  { value: 'golden_ratio', label: '黄金分割', desc: '1:1.618比例，和谐自然' },
  { value: 'negative_space', label: '负空间', desc: '大面积留白，突出主体' },
  { value: 'fill_frame', label: '填满画面', desc: '主体占满画面，细节冲击' },
];

export const CAMERA_ANGLE_OPTIONS = [
  { value: 'eye_level', label: '平视', desc: '与主体视线平齐，客观自然' },
  { value: 'high_angle', label: '俯视', desc: '从上往下拍，主体显得渺小、脆弱' },
  { value: 'low_angle', label: '仰视', desc: '从下往上拍，主体显得强大、威严' },
  { value: 'birds_eye', label: '鸟瞰', desc: '极端俯视，几乎垂直向下' },
  { value: 'worms_eye', label: '虫视', desc: '极端仰视，几乎贴地' },
  { value: 'dutch_angle', label: '荷兰角', desc: '倾斜镜头，不安定、紧张感' },
  { value: 'over_shoulder', label: '过肩镜头', desc: '从角色肩膀后方拍摄，对话常用' },
  { value: 'pov', label: '主观视角', desc: '模拟角色视角，代入感强' },
];

// ============================================================
// 空气感参数选项
// ============================================================

export const ATMOSPHERE_MOOD_OPTIONS = [
  { value: 'tense', label: '紧张', desc: '压抑的气氛，危机即将爆发' },
  { value: 'warm', label: '温馨', desc: '温暖舒适，家庭或亲密场景' },
  { value: 'mysterious', label: '神秘', desc: '未知的、引人好奇的氛围' },
  { value: 'dreamy', label: '梦幻', desc: '朦胧虚幻，如梦似幻' },
  { value: 'melancholic', label: '忧郁', desc: '淡淡的悲伤，怀旧感' },
  { value: 'romantic', label: '浪漫', desc: '爱情、诗意的氛围' },
  { value: 'horror', label: '恐怖', desc: '令人恐惧、不安' },
  { value: 'epic', label: '史诗', desc: '宏大壮阔，英雄气概' },
  { value: 'serene', label: '宁静', desc: '平和安详，心灵平静' },
  { value: 'chaotic', label: '混乱', desc: '纷乱紧急，信息过载' },
  { value: 'hopeful', label: '希望', desc: '积极向上，光明前景' },
  { value: 'despair', label: '绝望', desc: '无助黑暗，压迫感强' },
];

export const ATMOSPHERE_TEXTURE_OPTIONS = [
  { value: 'realistic', label: '现实主义', desc: '真实还原，纪录片风格' },
  { value: 'surrealistic', label: '超现实主义', desc: '扭曲现实，梦境逻辑' },
  { value: 'cinematic', label: '电影感', desc: '高制作价值，商业电影质感' },
  { value: 'documentary', label: '纪录片', desc: '真实粗粝，手持风格' },
  { value: 'stylized', label: '风格化', desc: '独特美学，高度设计感' },
  { value: 'gritty', label: '粗粝', desc: '粗糙质感，街头风格' },
  { value: 'polished', label: '精致', desc: '高度打磨，完美无瑕' },
  { value: 'vintage', label: '复古', desc: '老式胶片质感，怀旧' },
];

export const ATMOSPHERE_COLOR_GRADE_OPTIONS = [
  { value: 'natural', label: '自然', desc: '色彩还原真实，无明显调色' },
  { value: 'desaturated', label: '去饱和', desc: '色彩淡雅，接近黑白' },
  { value: 'vibrant', label: '鲜艳', desc: '高饱和度，色彩明亮' },
  { value: 'teal_orange', label: '青橙对比', desc: '好莱坞经典调色' },
  { value: 'monochrome', label: '单色调', desc: '以单一色系为主' },
  { value: 'cross_processed', label: '交叉冲洗', desc: '偏色效果，复古潮流' },
  { value: 'bleach_bypass', label: '漂白绕过', desc: '低饱和高对比，金属感' },
  { value: 'noir', label: '黑色电影', desc: '黑白或低饱和，高对比' },
];

export const ATMOSPHERE_VISUAL_STYLE_OPTIONS = [
  { value: '动漫', label: '动漫', desc: '日式动画风格' },
  { value: '照片级', label: '照片级', desc: '极度真实的渲染' },
  { value: '绘画感', label: '绘画感', desc: '油画或水彩质感' },
  { value: '漫画', label: '漫画', desc: '线条明确，分格风格' },
  { value: '极简', label: '极简', desc: '简洁元素，留白多' },
  { value: '表现主义', label: '表现主义', desc: '扭曲夸张，情感外化' },
  { value: '赛博朋克', label: '赛博朋克', desc: '霓虹、科技、暗黑未来' },
  { value: '奇幻', label: '奇幻', desc: '魔法世界，瑰丽色彩' },
  { value: '蒸汽朋克', label: '蒸汽朋克', desc: '维多利亚+蒸汽机械' },
];

// ============================================================
// 默认值和工具函数
// ============================================================

export const DEFAULT_DIRECTOR_PARAMS: DirectorParams = {
  lighting: {
    direction: 'natural',
    quality: 'soft',
    color: 'neutral',
    intensity: 'low_contrast',
  },
  camera: {
    focalLength: 'standard',
    movement: 'static',
    depthOfField: 'medium',
    composition: 'rule_of_thirds',
    angle: 'eye_level',
  },
  atmosphere: {
    mood: 'serene',
    texture: 'cinematic',
    colorGrade: 'natural',
    visualStyle: 'anime',
  },
  customNotes: '',
};

/**
 * 获取选项的标签
 */
export function getOptionLabel(options: Array<{value: string; label: string}>, value: string): string {
  const option = options.find(o => o.value === value);
  return option ? option.label : value;
}

/**
 * 将导演参数转换为可读文本
 */
export function directorParamsToText(params: DirectorParams): string {
  const lines: string[] = [];
  
  // 光线
  lines.push(`【光线】${getOptionLabel(LIGHTING_DIRECTION_OPTIONS, params.lighting.direction)}、${getOptionLabel(LIGHTING_QUALITY_OPTIONS, params.lighting.quality)}、${getOptionLabel(LIGHTING_COLOR_OPTIONS, params.lighting.color)}、${getOptionLabel(LIGHTING_INTENSITY_OPTIONS, params.lighting.intensity)}`);
  
  // 镜头
  lines.push(`【镜头】${getOptionLabel(CAMERA_FOCAL_LENGTH_OPTIONS, params.camera.focalLength)}、${getOptionLabel(CAMERA_MOVEMENT_OPTIONS, params.camera.movement)}、${getOptionLabel(CAMERA_DOF_OPTIONS, params.camera.depthOfField)}、${getOptionLabel(CAMERA_COMPOSITION_OPTIONS, params.camera.composition)}、${getOptionLabel(CAMERA_ANGLE_OPTIONS, params.camera.angle)}`);
  
  // 氛围
  lines.push(`【氛围】${getOptionLabel(ATMOSPHERE_MOOD_OPTIONS, params.atmosphere.mood)}、${getOptionLabel(ATMOSPHERE_TEXTURE_OPTIONS, params.atmosphere.texture)}、${getOptionLabel(ATMOSPHERE_COLOR_GRADE_OPTIONS, params.atmosphere.colorGrade)}、${getOptionLabel(ATMOSPHERE_VISUAL_STYLE_OPTIONS, params.atmosphere.visualStyle)}`);
  
  if (params.customNotes) {
    lines.push(`【备注】${params.customNotes}`);
  }
  
  return lines.join('\n');
}

/**
 * 将导演参数转换为中文提示词
 */
export function directorParamsToPrompt(params: DirectorParams): string {
  const parts: string[] = [];
  
  // 光线
  const lighting = params.lighting;
  parts.push(`${getOptionLabel(LIGHTING_DIRECTION_OPTIONS, lighting.direction)}光`);
  parts.push(`${getOptionLabel(LIGHTING_QUALITY_OPTIONS, lighting.quality)}光质`);
  parts.push(`${getOptionLabel(LIGHTING_COLOR_OPTIONS, lighting.color)}色温`);
  parts.push(`${getOptionLabel(LIGHTING_INTENSITY_OPTIONS, lighting.intensity)}光照`);
  
  // 镜头
  const camera = params.camera;
  parts.push(`${getOptionLabel(CAMERA_FOCAL_LENGTH_OPTIONS, camera.focalLength)}镜头`);
  if (camera.movement !== 'static') {
    parts.push(`${getOptionLabel(CAMERA_MOVEMENT_OPTIONS, camera.movement)}运镜`);
  }
  parts.push(`${getOptionLabel(CAMERA_DOF_OPTIONS, camera.depthOfField)}景深`);
  parts.push(`${getOptionLabel(CAMERA_COMPOSITION_OPTIONS, camera.composition)}构图`);
  parts.push(`${getOptionLabel(CAMERA_ANGLE_OPTIONS, camera.angle)}视角`);
  
  // 氛围
  const atmosphere = params.atmosphere;
  parts.push(`${getOptionLabel(ATMOSPHERE_MOOD_OPTIONS, atmosphere.mood)}情绪`);
  parts.push(`${getOptionLabel(ATMOSPHERE_TEXTURE_OPTIONS, atmosphere.texture)}质感`);
  parts.push(`${getOptionLabel(ATMOSPHERE_COLOR_GRADE_OPTIONS, atmosphere.colorGrade)}调色`);
  parts.push(`${atmosphere.visualStyle}视觉风格`);
  
  return parts.join(', ');
}
