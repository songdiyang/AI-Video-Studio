// 草图类型枚举 - 与 SketchTypeSelector 中的三种类型保持一致
export type SketchType = 'stick_figure' | 'storyboard_sketch' | 'detailed_lineart';

// 背景类型
export type BackgroundType = 'white' | 'transparent';

// 预处理器类型
export type SketchPreprocessor = 'scribble' | 'canny' | 'lineart';

// 草图数据接口
export interface SketchData {
  id?: string;
  type: SketchType;
  excalidrawData: any;
  controlStrength: number;
  preprocessor: SketchPreprocessor;
  version: number;
  thumbnailUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 草图保存请求
export interface SaveSketchRequest {
  sketchData: any;
  sketchType?: SketchType;
  controlStrength?: number;
  preprocessor?: SketchPreprocessor;
}

// 草图历史记录
export interface SketchHistoryEntry {
  id: string;
  version: number;
  sketchData: any;
  createdAt: string;
}

// 草图编辑器状态接口
export interface SketchEditorState {
  sketchType: SketchType;
  controlStrength: number;
  showBackground: boolean;
  backgroundType: BackgroundType;
  saving: boolean;
}

// 默认控制参数
export const DEFAULT_CONTROL_STRENGTH = 0.85;
export const MIN_CONTROL_STRENGTH = 0;
export const MAX_CONTROL_STRENGTH = 1;
export const CONTROL_STRENGTH_STEP = 0.05;

export const SKETCH_TYPE_DEFAULTS: Record<SketchType, { preprocessor: SketchPreprocessor; controlStrength: number }> = {
  stick_figure: { preprocessor: 'scribble', controlStrength: 0.7 },
  storyboard_sketch: { preprocessor: 'scribble', controlStrength: 0.85 },
  detailed_lineart: { preprocessor: 'lineart', controlStrength: 0.9 },
};

// 草图类型配置
export interface SketchTypeConfig {
  value: SketchType;
  label: string;
  description: string;
  icon: string;  // lucide-react 图标名
  preprocessor: SketchPreprocessor;
  defaultControlStrength: number;
}

// 草图类型完整配置映射
export const SKETCH_TYPE_CONFIGS: Record<SketchType, SketchTypeConfig> = {
  stick_figure: {
    value: 'stick_figure',
    label: '火柴人草稿',
    description: '几笔勾出人物动作和镜头机位',
    icon: 'Pencil',
    preprocessor: 'scribble',
    defaultControlStrength: 0.7,
  },
  storyboard_sketch: {
    value: 'storyboard_sketch',
    label: '分镜草图',
    description: '定好人物站位、景别和构图',
    icon: 'Film',
    preprocessor: 'scribble',
    defaultControlStrength: 0.85,
  },
  detailed_lineart: {
    value: 'detailed_lineart',
    label: '精细线稿',
    description: '五官、服装、场景元素精确定义',
    icon: 'PenTool',
    preprocessor: 'lineart',
    defaultControlStrength: 0.9,
  },
};

// 控制强度预设类型
export type ControlStrengthPreset = 'weak' | 'medium' | 'strong' | 'custom';

// 控制强度预设配置
export interface ControlStrengthPresetConfig {
  label: string;
  value: number;
  description: string;
}

// 控制强度预设值映射
export const CONTROL_STRENGTH_PRESETS: Record<Exclude<ControlStrengthPreset, 'custom'>, ControlStrengthPresetConfig> = {
  weak: {
    label: '弱',
    value: 0.3,
    description: '保留更多AI创意空间',
  },
  medium: {
    label: '中',
    value: 0.6,
    description: '平衡草图参考与AI创意',
  },
  strong: {
    label: '强',
    value: 0.85,
    description: '严格遵循草图轮廓',
  },
};
