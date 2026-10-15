/**
 * useAIModels - 全局 AI 模型管理 Hook
 * 
 * 负责加载所有可用模型，按类型分类管理选中状态。
 * 绑定 projectId，启动时从后端加载已保存的选择，变更时自动保存。
 * 在 ScriptStudio 顶层使用，通过 props 传递给子组件。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AIModel } from '../components/AIModelSelector';
import { getAuthToken } from '../services/auth';

export interface AIModelSelection {
  text: string;
  image: string;
  video: string;
  audio: string;
  multimodal: string;
}

const EMPTY_SELECTION: AIModelSelection = { text: '', image: '', video: '', audio: '', multimodal: '' };

// category 名称（后端 ai_model_configs.category）到 key 的映射
const CATEGORY_TO_KEY: Record<string, keyof AIModelSelection> = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  MULTIMODAL: 'multimodal'
};

export interface UseAIModelsReturn {
  models: AIModel[];
  selected: AIModelSelection;
  setSelected: (type: keyof AIModelSelection, modelName: string) => void;
  isConfigured: (type: keyof AIModelSelection) => boolean;
  getModelsByType: (type: string) => AIModel[];
  loading: boolean;
}

// 为未选择的类型设置默认模型（第一个可用模型）
function applyDefaultModels(selection: AIModelSelection, models: AIModel[]): AIModelSelection {
  const result = { ...selection };
  
  for (const [category, key] of Object.entries(CATEGORY_TO_KEY)) {
    if (!result[key]) {
      // 找到该类型的第一个可用模型
      const firstModel = models.find(m => (m.type || m.category || '').toUpperCase() === category);
      if (firstModel) {
        result[key] = firstModel.name;
      }
    }
  }
  
  return result;
}

export function useAIModels(projectId: number | null | undefined): UseAIModelsReturn {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelectedState] = useState<AIModelSelection>({ ...EMPTY_SELECTION });
  const initializedRef = useRef(false);
  const savingRef = useRef(false);

  // 1. 加载所有可用模型
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch('/api/ai-models', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          setModels(data.models || []);
        }
      } catch (err) {
        console.error('[useAIModels] 加载模型列表失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchModels();
  }, []);

  // 2. 加载项目已保存的模型选择
  useEffect(() => {
    if (!projectId) {
      setSelectedState({ ...EMPTY_SELECTION });
      initializedRef.current = false;
      return;
    }

    initializedRef.current = false;
    const fetchSaved = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${projectId}/models`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          const saved = data.useModels || {};
          // 后端存的 key 是 category 大写（TEXT/IMAGE/VIDEO/AUDIO/MULTIMODAL），转为小写 key
          const restored: AIModelSelection = { ...EMPTY_SELECTION };
          for (const [cat, modelName] of Object.entries(saved)) {
            const key = CATEGORY_TO_KEY[cat.toUpperCase()];
            if (key && typeof modelName === 'string') {
              restored[key] = modelName;
            }
          }
          // 加载完成后立即应用默认值
          const withDefaults = applyDefaultModels(restored, models);
          setSelectedState(withDefaults);
        }
      } catch (err) {
        console.error('[useAIModels] 加载已保存模型失败:', err);
      } finally {
        // 标记初始化完成，之后的 setSelected 才触发保存
        setTimeout(() => { initializedRef.current = true; }, 100);
      }
    };
    fetchSaved();
  }, [projectId, models]);

  // 3. 当 models 加载完成且 selected 有空值时，自动设置默认模型
  useEffect(() => {
    if (loading || models.length === 0) return;

    setSelectedState(prev => {
      const withDefaults = applyDefaultModels(prev, models);
      // 只有当有变化时才更新状态
      const hasChange = Object.keys(CATEGORY_TO_KEY).some(
        cat => !prev[CATEGORY_TO_KEY[cat]] && withDefaults[CATEGORY_TO_KEY[cat]]
      );
      return hasChange ? withDefaults : prev;
    });
  }, [models, loading]);

  // 4. 保存到后端（防抖）
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveToBackend = useCallback((newSelected: AIModelSelection) => {
    if (!projectId || !initializedRef.current || savingRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      savingRef.current = true;
      try {
        const token = getAuthToken();
        // 转为后端格式：category 大写作为 key
        const useModels: Record<string, string> = {};
        for (const [key, cat] of Object.entries({ text: 'TEXT', image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO', multimodal: 'MULTIMODAL' })) {
          const val = newSelected[key as keyof AIModelSelection];
          if (val) useModels[cat] = val;
        }
        await fetch(`/api/projects/${projectId}/models`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ useModels })
        });
      } catch (err) {
        console.error('[useAIModels] 保存模型配置失败:', err);
      } finally {
        savingRef.current = false;
      }
    }, 500);
  }, [projectId]);

  // 5. 设置选中模型（同时触发保存）
  const setSelected = useCallback((type: keyof AIModelSelection, modelName: string) => {
    setSelectedState(prev => {
      const next = { ...prev, [type]: modelName };
      saveToBackend(next);
      return next;
    });
  }, [saveToBackend]);

  const isConfigured = useCallback((type: keyof AIModelSelection) => {
    return !!selected[type];
  }, [selected]);

  const getModelsByType = useCallback((type: string) => {
    return models.filter(m => (m.type || '').toUpperCase() === type.toUpperCase());
  }, [models]);

  return {
    models,
    selected,
    setSelected,
    isConfigured,
    getModelsByType,
    loading
  };
}
