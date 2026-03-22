// Re-export from new SketchModule location for backward compatibility
// 此文件仅为兼容旧的导入路径，新代码请直接从 '../SketchModule' 导入

import SketchEditor from '../SketchModule/components/SketchEditor';
export default SketchEditor;

// 导出子组件，方便外部单独使用
export { default as SketchTypeSelector } from '../SketchModule/components/SketchTypeSelector';
export { default as SketchToolbar } from '../SketchModule/components/SketchToolbar';
export { default as SketchUploader } from '../SketchModule/components/SketchUploader';
export { useSketchEditor } from '../SketchModule/hooks/useSketchEditor';
export type { SketchType, BackgroundType } from '../SketchModule/hooks/useSketchEditor';
