/**
 * 工作台上下文
 * 提供当前项目类型、工作台配置的全局访问
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Project, fetchProject, fetchLocalProjects } from '../services/projects';
import { grantProjectScope } from '../services/localApi';
import {
  getWindowProjectPath,
  isDetachedProjectWindow,
  rememberProjectId,
  setWindowProjectPath,
  claimProjectWindow,
  claimProjectWindowOrCloseSelf,
} from '../services/windowProject';
import { setActiveProject, flushAll } from '../services/localStore';
import { setLongTaskActiveProject } from '../services/longTasks';
import { checkImportedMemories, resolveImportedMemories } from '../services/agentMemory';
import { useConfirm } from './ConfirmContext';
import { ProjectType, WorkbenchTab, isValidProjectType, mapLegacyProjectType } from '../types/projectTypes';
import { 
  WorkbenchState, 
  createInitialWorkbenchState, 
  updateWorkbenchStateForProject,
  saveLastActiveTab,
  getWorkbenchTabs
} from '../components/DynamicWorkbench/workbenchConfig';

// ==================== 接口定义 ====================

interface WorkbenchContextValue {
  // 当前项目
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  
  // 工作台状态
  workbenchState: WorkbenchState;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // 工作台配置
  tabs: WorkbenchTab[];
  projectType: ProjectType;
  
  // 项目切换
  switchProject: (project: Project) => void;
  
  // 加载状态
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // ===== VSCode 式布局：左侧面板 =====
  /** 左侧栏当前激活的活动 id（projects/teams/extensions/scenes/resources/outline…），null 表示收起 */
  leftSidebarTab: string | null;
  /** 设置左侧栏激活活动（再次点击同一 id 传入 null 可收起） */
  setLeftSidebarTab: (tab: string | null) => void;
  /** 左侧栏是否展开 */
  leftSidebarOpen: boolean;

  // ===== 未保存状态管理 =====
  /** 是否有未保存的更改 */
  hasUnsavedChanges: boolean;
  /** 标记为有未保存更改 */
  markAsDirty: () => void;
  /** 标记为已保存 */
  markAsSaved: () => void;
  /** 是否启用自动保存 */
  autoSaveEnabled: boolean;
  /** 切换自动保存 */
  toggleAutoSave: () => void;
}

// ==================== Context 创建 ====================

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

// ==================== Provider 组件 ====================

interface WorkbenchProviderProps {
  children: React.ReactNode;
  initialProject?: Project | null;
}

const LAST_PROJECT_KEY = 'nanostory_last_project_id';

export function WorkbenchProvider({ children, initialProject = null }: WorkbenchProviderProps) {
  // 当前项目
  const [currentProject, setCurrentProject] = useState<Project | null>(initialProject);

  // 加载状态
  const [isLoading, setIsLoading] = useState(true);

  const { confirm } = useConfirm();

  // ===== VSCode 式布局：左侧面板 =====
  // 持久化激活的活动 id，默认收起（null）
  const [leftSidebarTab, setLeftSidebarTabState] = useState<string | null>(() => {
    try { return localStorage.getItem('vscode_left_sidebar_tab'); } catch { return null; }
  });
  const setLeftSidebarTab = useCallback((tab: string | null) => {
    setLeftSidebarTabState(tab);
    try {
      if (tab) localStorage.setItem('vscode_left_sidebar_tab', tab);
      else localStorage.removeItem('vscode_left_sidebar_tab');
    } catch { /* 忽略 */ }
  }, []);
  const leftSidebarOpen = leftSidebarTab !== null;

  // ===== 未保存状态管理 =====
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try { return localStorage.getItem('vscode_auto_save') === '1'; } catch { return true; }
  });
  
  const markAsDirty = useCallback(() => setHasUnsavedChanges(true), []);
  const markAsSaved = useCallback(() => setHasUnsavedChanges(false), []);
  const toggleAutoSave = useCallback(() => {
    setAutoSaveEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('vscode_auto_save', next ? '1' : '0'); } catch { /* 忽略 */ }
      return next;
    });
  }, []);
  
  // 从项目获取有效的项目类型
  const getValidProjectType = useCallback((project: Project | null): ProjectType => {
    if (!project) return 'comic_drama';
    const type = project.type;
    if (isValidProjectType(type)) {
      return type;
    }
    return mapLegacyProjectType(type);
  }, []);
  
  // 工作台状态
  const [workbenchState, setWorkbenchState] = useState<WorkbenchState>(() => {
    const projectType = getValidProjectType(initialProject);
    return createInitialWorkbenchState(initialProject?.id || null, projectType);
  });

  // 初始化：独立窗口按 URL 绑定的工程加载；主窗口恢复上次打开的工程
  useEffect(() => {
    const initializeProject = async () => {
      const windowPath = getWindowProjectPath();
      if (isDetachedProjectWindow()) {
        if (windowPath) {
          try {
            const local = await fetchLocalProjects();
            const hit = local.find((p) => p.local_path === windowPath);
            if (hit) {
              if (hit.local_path) {
                await grantProjectScope(hit.local_path);
                // 同一工程只允许一个窗口：已被其它窗口打开时聚焦原窗口并关闭本窗口
                if (!(await claimProjectWindowOrCloseSelf(hit.local_path))) {
                  setIsLoading(false);
                  return;
                }
              }
              setCurrentProject(hit);
              setIsLoading(false);
              return;
            }
            console.warn('[Workbench] 独立窗口绑定的工程不存在:', windowPath);
          } catch (e) {
            console.warn('[Workbench] 独立窗口加载工程失败:', e);
          }
        }
        // 独立窗口不继承主窗口的「上次工程」：未绑定工程时停在欢迎页
        setCurrentProject(null);
        setIsLoading(false);
        return;
      }

      try {
        const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
        
        if (lastProjectId) {
          // 尝试加载上次的项目
          try {
            const project = await fetchProject(parseInt(lastProjectId));
            if (project) {
              // 恢复上次工程时补授权 media/ 目录（幂等）：冷启动不走 open_project，
              // 无此步工程内已落地素材会因 asset 协议无权限而裂图
              if (project.local_path) {
                await grantProjectScope(project.local_path);
                // 主窗口也登记工程占用，作为“原先的窗口优先”的依据
                void claimProjectWindow(project.local_path);
              }
              setCurrentProject(project);
              setIsLoading(false);
              return;
            }
          } catch (e) {
            // 上次项目已不存在，清除记录
            console.warn('上次项目已不存在，将加载最近的项目');
            localStorage.removeItem(LAST_PROJECT_KEY);
          }
        }
        
        // 没有上次打开记录：进入欢迎页，不再自动打开最近工程
        setCurrentProject(null);
        localStorage.removeItem(LAST_PROJECT_KEY);
      } catch (error) {
        console.error('加载项目失败:', error);
        localStorage.removeItem(LAST_PROJECT_KEY);
      }
      setIsLoading(false);
    };

    initializeProject();
  }, []);
  
  // 当项目变化时更新工作台状态
  useEffect(() => {
    if (currentProject) {
      const projectType = getValidProjectType(currentProject);
      setWorkbenchState(prevState => 
        updateWorkbenchStateForProject(prevState, currentProject.id, projectType)
      );
    } else {
      setWorkbenchState(createInitialWorkbenchState(null, 'comic_drama'));
    }
  }, [currentProject, getValidProjectType]);

  // 离线模式：同步"当前活动本地工程"给数据层/路由拦截器，切换前落盘待写数据
  useEffect(() => {
    void flushAll();
    if (currentProject && currentProject.source === 'local') {
      setActiveProject({ id: currentProject.id, local_path: currentProject.local_path });
    } else {
      setActiveProject(null);
    }
    // 长任务注册表按工程隔离：切换工程后智能体只能看到本工程的任务
    setLongTaskActiveProject(currentProject?.id ?? null);
  }, [currentProject]);

  // 外部工程包（.jzp）携带的记忆：首次打开该工程时提示用户决定启用或停用，
  // 防止外部提示词经工程包静默注入每次对话（package.rs 导入时打 imported/reviewed 标记）
  useEffect(() => {
    const path = currentProject?.local_path;
    if (!path || currentProject.source !== 'local') return;
    let disposed = false;
    void (async () => {
      const count = await checkImportedMemories(path);
      if (disposed || count == null) return;
      const keep = await confirm({
        title: '导入的工程携带外部记忆',
        message: `该工程包含 ${count} 条来自外部工程包的记忆，会在每次 AI 对话时自动注入上下文。\n\n保留启用，还是全部停用？停用不删除数据，之后可在 AI 助手的「记忆」面板中逐条启用。`,
        confirmText: '保留启用',
        cancelText: '全部停用',
        type: 'warning',
      });
      if (disposed) return;
      await resolveImportedMemories(path, keep);
    })();
    return () => { disposed = true; };
    // confirm 来自 context，引用稳定（useCallback 空依赖）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, confirm]);
  
  // 设置活动标签页
  const setActiveTab = useCallback((tab: string) => {
    setWorkbenchState(prevState => {
      // 保存到本地存储
      if (prevState.projectId) {
        saveLastActiveTab(prevState.projectId, tab);
      }
      return {
        ...prevState,
        activeTab: tab,
      };
    });
  }, []);
  
  // 切换项目
  const switchProject = useCallback((project: Project) => {
    const projectType = getValidProjectType(project);
    setCurrentProject(project);
    rememberProjectId(project.id);
    if (isDetachedProjectWindow()) {
      // 独立窗口只在自身 URL 记录工程，刷新后仍停留在此工程
      setWindowProjectPath(project.local_path ?? null);
      // 该工程已在其它窗口打开：聚焦原窗口并关闭本窗口（原先的优先）
      if (project.local_path) void claimProjectWindowOrCloseSelf(project.local_path);
    } else if (project.local_path) {
      void claimProjectWindow(project.local_path);
    }
    setWorkbenchState(prevState => 
      updateWorkbenchStateForProject(prevState, project.id, projectType)
    );
  }, [getValidProjectType]);
  
  // 计算标签页列表
  const tabs = useMemo(() => workbenchState.tabs, [workbenchState.tabs]);
  
  // 计算当前项目类型
  const projectType = useMemo(() => workbenchState.projectType, [workbenchState.projectType]);
  
  // 计算当前活动标签页
  const activeTab = useMemo(() => workbenchState.activeTab, [workbenchState.activeTab]);
  
  // Context 值
  const contextValue = useMemo<WorkbenchContextValue>(() => ({
    currentProject,
    setCurrentProject,
    workbenchState,
    activeTab,
    setActiveTab,
    tabs,
    projectType,
    switchProject,
    isLoading,
    setIsLoading,
    leftSidebarTab,
    setLeftSidebarTab,
    leftSidebarOpen,
    hasUnsavedChanges,
    markAsDirty,
    markAsSaved,
    autoSaveEnabled,
    toggleAutoSave,
  }), [
    currentProject,
    workbenchState,
    activeTab,
    setActiveTab,
    tabs,
    projectType,
    switchProject,
    isLoading,
    leftSidebarTab,
    setLeftSidebarTab,
    leftSidebarOpen,
    hasUnsavedChanges,
    markAsDirty,
    markAsSaved,
    autoSaveEnabled,
    toggleAutoSave,
  ]);
  
  return (
    <WorkbenchContext.Provider value={contextValue}>
      {children}
    </WorkbenchContext.Provider>
  );
}

// ==================== Hook ====================

/**
 * 使用工作台上下文
 */
export function useWorkbench(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error('useWorkbench must be used within a WorkbenchProvider');
  }
  return context;
}

/**
 * 使用工作台标签页
 */
export function useWorkbenchTabs() {
  const { tabs, activeTab, setActiveTab, projectType } = useWorkbench();
  return { tabs, activeTab, setActiveTab, projectType };
}

/**
 * 使用当前项目
 */
export function useCurrentProject() {
  const { currentProject, setCurrentProject, switchProject, isLoading, setIsLoading } = useWorkbench();
  return { currentProject, setCurrentProject, switchProject, isLoading, setIsLoading };
}

export default WorkbenchContext;
