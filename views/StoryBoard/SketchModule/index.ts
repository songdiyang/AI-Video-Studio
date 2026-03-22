// SketchModule 桶导出文件
// 提供统一的模块入口，便于外部导入

// 组件导出
export { default as SketchEditor } from './components/SketchEditor';
export { default as SketchUploader } from './components/SketchUploader';
export { default as SketchToolbar } from './components/SketchToolbar';
export { default as SketchTypeSelector } from './components/SketchTypeSelector';
export { default as SketchPanel } from './components/SketchPanel';
export { default as ControlStrengthSlider } from './components/ControlStrengthSlider';
export { default as SketchPreview } from './components/SketchPreview';
export { default as SketchManager } from './components/SketchManager';

// 组件 Props 类型导出
export type { SketchEditorProps } from './components/SketchEditor';
export type { SketchPreviewProps } from './components/SketchPreview';
export type { SketchManagerProps } from './components/SketchManager';

// Hooks 导出
export { useSketchEditor } from './hooks/useSketchEditor';
export { useSketchManager } from './hooks/useSketchManager';

// Hook 类型导出
export type { 
  SketchType, 
  BackgroundType,
  SketchEditorState,
  UseSketchEditorReturn 
} from './hooks/useSketchEditor';

export type {
  SketchStoryboard,
  SketchStatusFilter,
  SketchViewMode,
  UseSketchManagerOptions,
  UseSketchManagerReturn
} from './hooks/useSketchManager';

// 类型导出
export * from './types/sketch';

// 工具导出
export * from './utils/sketchExport';
