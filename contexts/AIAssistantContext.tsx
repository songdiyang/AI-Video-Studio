/**
 * AI 助手全局上下文
 * ──────────────────────────────────────────────────────────────
 * 为了避免"工作台侧频繁变化的 scenes/frame 触发 Layout / StoryBoard 全量重渲染"，
 * 本模块拆成三个 Context：
 *
 *  1) AIAssistantUIContext      —— 轻量 UI 状态（isOpen/projectId/toggle...）
 *                                   Layout/顶栏按钮等顶层组件仅订阅它。
 *
 *  2) AIAssistantDataContext    —— 注册的重数据（currentFrame/scenes/onAction）
 *                                   仅 AIAssistantPanel 订阅，Panel 关闭时不卸载数据。
 *
 *  3) AIAssistantSettersContext —— 稳定 setter（setFrame/setScenes/setOnAction/clearContext）
 *                                   工作台（如 StoryBoard）只订阅它，永远稳定，
 *                                   从而避免 dataValue 变化导致 StoryBoard 全量重渲染。
 *
 * 对外 API 保持兼容：
 *   - useAIAssistant()                  ： UI + Data + Setters 合并视图（便于已有调用点）
 *   - useAIAssistantUI()                ： 仅 UI 视图（推荐给 Layout 等顶层组件）
 *   - useAIAssistantData()              ： 仅 Data 视图（推荐给 Panel）
 *   - useAIAssistantSetters()           ： 仅 Setter 视图（推荐给数据注册方）
 *   - useAIAssistantWorkbenchContext()  ： 工作台侧注册便捷 Hook（内部只订阅 Setter）
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { useWorkbench } from './WorkbenchContext';

// ─── Types ──────────────────────────────────────────────────────────
export interface AIAssistantFrameContext {
  id: number;
  index?: number;
  first_frame_url?: string;
  last_frame_url?: string;
  video_url?: string;
  scene_description?: string;
}

export interface AIAssistantSceneSummary {
  id: number;
  index: number;
  description?: string;
}

export type AIAssistantAction = (action: string, params: any) => void;

export interface AIAssistantUIContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  projectId: number | null;
}

export interface AIAssistantDataContextValue {
  currentFrame: AIAssistantFrameContext | null;
  scenes: AIAssistantSceneSummary[];
  onAction: AIAssistantAction | null;
}

export interface AIAssistantSettersContextValue {
  setFrame: (frame: AIAssistantFrameContext | null) => void;
  setScenes: (scenes: AIAssistantSceneSummary[]) => void;
  setOnAction: (handler: AIAssistantAction | null) => void;
  clearContext: () => void;
}

// 兼容旧 API 的合并视图
export interface AIAssistantContextValue
  extends AIAssistantUIContextValue,
    AIAssistantDataContextValue,
    AIAssistantSettersContextValue {}

const AIAssistantUIContext = createContext<AIAssistantUIContextValue | null>(null);
const AIAssistantDataContext = createContext<AIAssistantDataContextValue | null>(null);
const AIAssistantSettersContext = createContext<AIAssistantSettersContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────
interface AIAssistantProviderProps {
  children: React.ReactNode;
}

export const AIAssistantProvider: React.FC<AIAssistantProviderProps> = ({ children }) => {
  const { currentProject } = useWorkbench();
  const projectId = currentProject?.id ?? null;

  // —— UI 状态 —— 仅影响 Layout / Toggle 按钮 / Drawer 容器
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const uiValue = useMemo<AIAssistantUIContextValue>(
    () => ({ isOpen, open, close, toggle, projectId }),
    [isOpen, open, close, toggle, projectId],
  );

  // —— Data 状态 —— 仅影响 AIAssistantPanel
  const [currentFrame, setCurrentFrame] = useState<AIAssistantFrameContext | null>(null);
  const [scenes, setScenesState] = useState<AIAssistantSceneSummary[]>([]);
  const onActionRef = useRef<AIAssistantAction | null>(null);
  const [onActionVersion, setOnActionVersion] = useState(0);

  const setFrame = useCallback((frame: AIAssistantFrameContext | null) => {
    // 浅比较，内容相同则跳过，避免无意义的 Context value 重建
    setCurrentFrame((prev) => {
      if (prev === frame) return prev;
      if (
        prev &&
        frame &&
        prev.id === frame.id &&
        prev.index === frame.index &&
        prev.first_frame_url === frame.first_frame_url &&
        prev.last_frame_url === frame.last_frame_url &&
        prev.video_url === frame.video_url &&
        prev.scene_description === frame.scene_description
      ) {
        return prev;
      }
      return frame;
    });
  }, []);

  const setScenes = useCallback((next: AIAssistantSceneSummary[]) => {
    setScenesState((prev) => {
      if (prev === next) return prev;
      if (prev.length === next.length) {
        let same = true;
        for (let i = 0; i < prev.length; i++) {
          const a = prev[i];
          const b = next[i];
          if (a.id !== b.id || a.index !== b.index || a.description !== b.description) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, []);

  const setOnAction = useCallback((handler: AIAssistantAction | null) => {
    const prev = onActionRef.current;
    onActionRef.current = handler;
    // 只在 null ↔ 非 null 切换时才 bump version，避免同一函数引用的频繁更新
    // 导致 Provider state 抖动（Panel 调用时走 ref，永远拿到最新 handler）
    if ((prev === null) !== (handler === null)) {
      setOnActionVersion((v) => v + 1);
    }
  }, []);

  const clearContext = useCallback(() => {
    setCurrentFrame(null);
    setScenesState([]);
    if (onActionRef.current !== null) {
      onActionRef.current = null;
      setOnActionVersion((v) => v + 1);
    }
  }, []);

  // 切换项目时自动清理
  useEffect(() => {
    setCurrentFrame(null);
    setScenesState([]);
    if (onActionRef.current !== null) {
      onActionRef.current = null;
      setOnActionVersion((v) => v + 1);
    }
  }, [projectId]);

  // 稳定的 onAction 包装：Panel 调用时总是读取最新 ref
  const onAction: AIAssistantAction | null = useMemo(() => {
    if (!onActionRef.current) return null;
    return (action: string, params: any) => {
      onActionRef.current?.(action, params);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionVersion]);

  const dataValue = useMemo<AIAssistantDataContextValue>(
    () => ({ currentFrame, scenes, onAction }),
    [currentFrame, scenes, onAction],
  );

  // setter 永远稳定，settersValue 永不变化，订阅方不会因此重渲染
  const settersValue = useMemo<AIAssistantSettersContextValue>(
    () => ({ setFrame, setScenes, setOnAction, clearContext }),
    [setFrame, setScenes, setOnAction, clearContext],
  );

  return (
    <AIAssistantUIContext.Provider value={uiValue}>
      <AIAssistantSettersContext.Provider value={settersValue}>
        <AIAssistantDataContext.Provider value={dataValue}>
          {children}
        </AIAssistantDataContext.Provider>
      </AIAssistantSettersContext.Provider>
    </AIAssistantUIContext.Provider>
  );
};

// ─── Hooks ──────────────────────────────────────────────────────────
export function useAIAssistantUI(): AIAssistantUIContextValue {
  const ctx = useContext(AIAssistantUIContext);
  if (!ctx) throw new Error('useAIAssistantUI must be used within an AIAssistantProvider');
  return ctx;
}

export function useAIAssistantData(): AIAssistantDataContextValue {
  const ctx = useContext(AIAssistantDataContext);
  if (!ctx) throw new Error('useAIAssistantData must be used within an AIAssistantProvider');
  return ctx;
}

export function useAIAssistantSetters(): AIAssistantSettersContextValue {
  const ctx = useContext(AIAssistantSettersContext);
  if (!ctx) throw new Error('useAIAssistantSetters must be used within an AIAssistantProvider');
  return ctx;
}

/**
 * 兼容旧 API：合并 UI + Data + Setters 视图。
 * 注：订阅此 Hook 的组件会因为 data 频繁变化而重渲染；
 * 顶层组件（如 Layout）建议改用 useAIAssistantUI，
 * 数据注册方（如 StoryBoard）建议改用 useAIAssistantSetters。
 */
export function useAIAssistant(): AIAssistantContextValue {
  const ui = useAIAssistantUI();
  const data = useAIAssistantData();
  const setters = useAIAssistantSetters();
  return { ...ui, ...data, ...setters };
}

/**
 * 工作台侧注册当前分镜 / 场景列表 / 动作回调。
 *
 * 实现要点（避免重渲染风暴）：
 *  - 仅订阅 useAIAssistantSetters（永远稳定的 setter 集合），
 *    不订阅 useAIAssistantData，因此 data 变化不会让调用方重渲染。
 *  - onAction 通过 ref 缓存最新值，effect 只在 mount / null↔非null 切换时触发 setOnAction，
 *    避免调用方每次 render 产生的新 onAction 引用引发级联更新。
 *  - scenes/frame 的 setter 内部做了浅比较，即使传入每次 render 的新数组/对象引用也不会触发 state 更新。
 */
export function useAIAssistantWorkbenchContext(params: {
  frame?: AIAssistantFrameContext | null;
  scenes?: AIAssistantSceneSummary[];
  onAction?: AIAssistantAction | null;
}) {
  const { setFrame, setScenes, setOnAction } = useAIAssistantSetters();
  const { frame, scenes, onAction } = params;

  useEffect(() => {
    setFrame(frame ?? null);
  }, [frame, setFrame]);

  useEffect(() => {
    setScenes(scenes ?? []);
  }, [scenes, setScenes]);

  // 通过 ref 缓存最新 onAction，注册一个稳定 wrapper
  const onActionRef = useRef<AIAssistantAction | null>(onAction ?? null);
  useEffect(() => {
    onActionRef.current = onAction ?? null;
  }, [onAction]);

  // 只在 "是否有 onAction" 的状态切换时注册/反注册
  const hasOnAction = !!onAction;
  useEffect(() => {
    if (!hasOnAction) {
      setOnAction(null);
      return;
    }
    const wrapper: AIAssistantAction = (action, p) => {
      onActionRef.current?.(action, p);
    };
    setOnAction(wrapper);
    return () => setOnAction(null);
  }, [hasOnAction, setOnAction]);
}

export default AIAssistantUIContext;
