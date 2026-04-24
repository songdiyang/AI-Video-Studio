/**
 * 积木编程类型定义
 * 可视化分镜编辑器的核心类型
 */

// ============ 积木块类型枚举 ============

export type BlockType =
  | 'text'            // 自然语言输入
  | 'shot_size'       // 镜头类型（景别）
  | 'camera_angle'    // 镜头角度
  | 'movement'        // 运镜方式
  | 'lens_type'       // 镜头类型
  | 'depth_of_field'  // 景深
  | 'lighting_mood'   // 光影氛围
  | 'character'       // 角色选择
  | 'character_attr'  // 角色属性
  | 'character_pos'   // 角色位置
  | 'scene'           // 场景选择
  | 'environment'     // 环境参数
  | 'action'          // 动作类型
  | 'duration'        // 动作时长
  | 'effect'          // 动作效果
  | 'reference_image'; // 参考图片

// 积木块分类
export type BlockCategory =
  | 'text'       // 文本
  | 'shot'       // 镜头
  | 'character'  // 角色
  | 'scene'      // 场景
  | 'action'     // 动作
  | 'reference'; // 参考

// ============ 积木块基础接口 ============

export interface BlockBase {
  id: string;
  type: BlockType;
  category: BlockCategory;
  position: { x: number; y: number };
  data: BlockData;
}

// 积木块数据联合类型
export type BlockData =
  | TextBlockData
  | ShotSizeBlockData
  | CameraAngleBlockData
  | MovementBlockData
  | LensTypeBlockData
  | DepthOfFieldBlockData
  | LightingMoodBlockData
  | CharacterBlockData
  | CharacterAttrBlockData
  | CharacterPosBlockData
  | SceneBlockData
  | EnvironmentBlockData
  | ActionBlockData
  | DurationBlockData
  | EffectBlockData
  | ReferenceImageBlockData;

// ============ 各类积木块数据接口 ============

export interface TextBlockData {
  text: string;
}

export interface ShotSizeBlockData {
  value: 'extreme_close_up' | 'close_up' | 'medium_close_up' | 'medium_shot' | 'medium_long_shot' | 'long_shot' | 'extreme_long_shot';
}

export interface CameraAngleBlockData {
  value: 'eye_level' | 'low_angle' | 'high_angle' | 'bird_eye' | 'worm_eye';
}

export interface MovementBlockData {
  value: 'static' | 'push' | 'pull' | 'pan' | 'tilt' | 'track' | 'dolly' | 'zoom';
}

export interface LensTypeBlockData {
  value: 'wide' | 'standard' | 'telephoto' | 'macro' | 'fisheye';
}

export interface DepthOfFieldBlockData {
  value: 'shallow' | 'medium' | 'deep';
}

export interface LightingMoodBlockData {
  value: 'high_key' | 'low_key' | 'chiaroscuro' | 'silhouette' | 'backlit';
}

export interface CharacterBlockData {
  characterId: number;
  characterName: string;
}

export interface CharacterAttrBlockData {
  expression: string;
  action: string;
  costume?: string;
}

export interface CharacterPosBlockData {
  horizontal: 'left' | 'center' | 'right';
  vertical: 'foreground' | 'middle' | 'background';
}

export interface SceneBlockData {
  sceneId: number;
  sceneName: string;
}

export interface EnvironmentBlockData {
  lighting: 'natural' | 'artificial' | 'mixed';
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy';
  atmosphere: 'bright' | 'dark' | 'warm' | 'cool' | 'dramatic' | 'soft';
}

export interface ActionBlockData {
  type: 'walk' | 'run' | 'talk' | 'fight' | 'sit' | 'stand' | 'gesture' | 'custom';
  customType?: string;
}

export interface DurationBlockData {
  seconds: number;
}

export interface EffectBlockData {
  visual: boolean;
  sound: boolean;
  particle?: string;
}

export interface ReferenceImageBlockData {
  imageUrl: string;
  source: 'scene' | 'frame' | 'upload';
  description?: string;
}

// ============ 积木块定义接口 ============

export interface BlockDefinition {
  type: BlockType;
  category: BlockCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
  defaultData: BlockData;
  renderConfig: BlockRenderConfig;
}

export interface BlockRenderConfig {
  width: number;
  height: number;
  showLabel: boolean;
  showIcon: boolean;
  editable: boolean;
  inputs?: BlockInputConfig[];
  outputs?: BlockOutputConfig[];
}

export interface BlockInputConfig {
  id: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean';
  options?: { value: string; label: string }[];
}

export interface BlockOutputConfig {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
}

// ============ 连接相关类型 ============

export interface BlockConnection {
  id: string;
  fromBlockId: string;
  fromOutputId: string;
  toBlockId: string;
  toInputId: string;
}

// ============ 编辑器状态 ============

export interface BlockEditorState {
  blocks: Block[];
  connections: BlockConnection[];
  selectedBlockId: string | null;
  draggedBlockId: string | null;
  generatedPrompt: string;
  isDirty: boolean;
}

export type Block = BlockBase;

// ============ 编辑器属性 ============

export interface DialogueLine {
  character: string;
  line: string;
}

export interface BlockEditorProps {
  storyboardId: number;
  initialBlocks?: Block[];
  initialConnections?: BlockConnection[];
  onChange?: (state: BlockEditorState) => void;
  onSave?: (state: BlockEditorState) => boolean | Promise<boolean>;
  projectId?: number;
  scriptId?: number;
  characters?: ProjectCharacter[] | string[];
  scenes?: ProjectScene[];
  availableFrames?: { startFrame?: string; endFrame?: string };
  dialogue?: string;
  dialogues?: DialogueLine[];
  onUpdateDialogues?: (dialogues: DialogueLine[]) => Promise<boolean>;
  voiceover?: string;
  onUpdateVoiceover?: (voiceover: string) => Promise<boolean>;
  negativePrompt?: string;
  onUpdateNegativePrompt?: (negativePrompt: string) => Promise<boolean>;
  promptMode?: 'image' | 'video';
  basePrompt?: string;
}

export interface ProjectCharacter {
  id: number;
  name: string;
  avatar?: string;
  description?: string;
}

export interface ProjectScene {
  id: number;
  name: string;
  image?: string;
  description?: string;
}

// ============ 提示词生成相关 ============

export interface PromptTemplate {
  type: BlockType;
  template: string;
  priority: number;
}

export interface GeneratedPrompt {
  text: string;
  blocks: Block[];
  metadata: {
    shotLanguage: Record<string, unknown>;
    characters: number[];
    scenes: number[];
    duration: number;
  };
}

// ============ 拖拽相关类型 ============

export interface DragItem {
  type: 'palette-block' | 'canvas-block' | 'reference-image';
  blockType?: BlockType;
  blockId?: string;
  offset?: { x: number; y: number };
  imageUrl?: string;
  source?: 'scene' | 'frame' | 'upload';
}

export interface DragReferenceImage {
  type: 'reference-image';
  imageUrl: string;
  source: 'scene' | 'frame';
}

export interface DropResult {
  x: number;
  y: number;
  blockType?: BlockType;
  blockId?: string;
}

// ============ 积木块选项配置 ============

export interface BlockOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface BlockOptionsConfig {
  shotSize: BlockOption[];
  cameraAngle: BlockOption[];
  movement: BlockOption[];
  lensType: BlockOption[];
  depthOfField: BlockOption[];
  lightingMood: BlockOption[];
  actionType: BlockOption[];
  characterPosition: BlockOption[];
  environment: BlockOption[];
}

// ============ 预设模板 ============

export interface BlockPreset {
  id: string;
  name: string;
  description: string;
  category: 'dialogue' | 'action' | 'emotion' | 'establishing' | 'custom';
  blocks: Block[];
  connections: BlockConnection[];
}
