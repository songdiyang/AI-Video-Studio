/**
 * 工作台上下文
 * 提供当前项目类型、工作台配置的全局访问
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Project, fetchProject, fetchProjects } from '../services/projects';
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

  // 初始化：自动加载上次打开的项目
  useEffect(() => {
    const initializeProject = async () => {
      try {
        const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
        
        if (lastProjectId) {
          // 尝试加载上次的项目
          try {
            const project = await fetchProject(parseInt(lastProjectId));
            if (project) {
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
        
        // 没有上次记录或已不存在，尝试加载最近的项目
        const projects = await fetchProjects();
        if (projects && projects.length > 0) {
          const recentProject = projects.sort((a: Project, b: Project) => 
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )[0];
          setCurrentProject(recentProject);
          localStorage.setItem(LAST_PROJECT_KEY, recentProject.id.toString());
        } else {
          setCurrentProject(null);
          localStorage.removeItem(LAST_PROJECT_KEY);
        }
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
    localStorage.setItem(LAST_PROJECT_KEY, project.id.toString());
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
  }), [
    currentProject,
    workbenchState,
    activeTab,
    setActiveTab,
    tabs,
    projectType,
    switchProject,
    isLoading,
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
