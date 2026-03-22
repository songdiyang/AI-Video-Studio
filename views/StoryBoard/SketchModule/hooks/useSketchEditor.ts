import { useState, useCallback } from 'react';
import { getAuthToken } from '../../../../services/auth';
import { saveSketchData as saveSketchDataApi } from '../../../../services/storyboards';

export type SketchType = 'stick_figure' | 'storyboard_sketch' | 'detailed_lineart';
export type BackgroundType = 'white' | 'transparent';

export interface SketchEditorState {
  sketchType: SketchType;
  controlStrength: number;
  showBackground: boolean;
  backgroundType: BackgroundType;
  saving: boolean;
}

export interface UseSketchEditorReturn extends SketchEditorState {
  setSketchType: (type: SketchType) => void;
  setControlStrength: (strength: number) => void;
  toggleBackground: () => void;
  setBackgroundType: (type: BackgroundType) => void;
  setSaving: (saving: boolean) => void;
  exportAndUpload: (
    blob: Blob,
    storyboardId: number,
    sketchType: SketchType,
    controlStrength: number
  ) => Promise<string>;
  saveSketchData: (storyboardId: number, data: unknown) => Promise<void>;
}

/**
 * 管理草图编辑器的所有状态
 */
export function useSketchEditor(): UseSketchEditorReturn {
  const [sketchType, setSketchType] = useState<SketchType>('storyboard_sketch');
  const [controlStrength, setControlStrength] = useState(0.85);
  const [showBackground, setShowBackground] = useState(true);
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('white');
  const [saving, setSaving] = useState(false);

  const toggleBackground = useCallback(() => {
    setShowBackground(prev => !prev);
  }, []);

  /**
   * 导出 PNG 并上传到服务器
   * @returns 上传后的草图 URL
   */
  const exportAndUpload = useCallback(async (
    blob: Blob,
    storyboardId: number,
    sketchTypeParam: SketchType,
    controlStrengthParam: number
  ): Promise<string> => {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append('sketch', blob, 'sketch.png');
    formData.append('sketch_type', sketchTypeParam);
    formData.append('control_strength', controlStrengthParam.toString());

    const response = await fetch(`/api/storyboards/${storyboardId}/sketch`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || '上传草图失败');
    }

    const result = await response.json();
    return result.sketchUrl;
  }, []);

  /**
   * 保存 Excalidraw 矢量数据（用于回显编辑）
   * 复用 services/storyboards.ts 中的 saveSketchData 函数
   */
  const saveSketchData = useCallback(async (
    storyboardId: number,
    data: unknown
  ): Promise<void> => {
    await saveSketchDataApi(storyboardId, data as object);
  }, []);

  return {
    sketchType,
    controlStrength,
    showBackground,
    backgroundType,
    saving,
    setSketchType,
    setControlStrength,
    toggleBackground,
    setBackgroundType,
    setSaving,
    exportAndUpload,
    saveSketchData
  };
}
