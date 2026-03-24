/**
 * 动态工作台容器组件
 * 根据项目类型动态渲染工作台标签页和内容
 */

import React, { Suspense, lazy, useMemo, useCallback, useState, useEffect } from 'react';
import { Tabs, Tab, Spinner } from '@heroui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkbench, useWorkbenchTabs } from '../../contexts/WorkbenchContext';
import { Project, fetchProjects } from '../../services/projects';
import { ProjectType, PROJECT_TYPES, WorkbenchTab } from '../../types/projectTypes';
import { getIcon } from './workbenchConfig';
import { useLanguage } from '../../contexts/LanguageContext';
import ProjectSelector from '../ProjectSelector';

// 上次选择的项目ID存储键
const LAST_PROJECT_KEY = 'nanostory_last_project_id';

// ==================== 懒加载组件 ====================

// 漫剧工作台 - 直接使用完整的 ScriptStudio（自带标签页管理）
const ScriptStudio = lazy(() => import('../../views/ScriptStudio'));

// 漫画工作台组件
const MangaWorkbench = lazy(() => import('../../views/MangaWorkbench'));

// 短视频工作台组件
const ShortVideoWorkbench = lazy(() => import('../../views/ShortVideoWorkbench'));

// 小说工作台组件
const NovelWorkbench = lazy(() => import('../../views/NovelWorkbench'));

// ==================== 加载占位组件 ====================

const WorkbenchLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" color="primary" />
      <p className="text-sm text-[var(--text-muted)]">加载工作台...</p>
    </div>
  </div>
);

// ==================== 空状态组件 ====================

interface EmptyStateProps {
  onCreateProject?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onCreateProject }) => {
  const { t } = useLanguage();
  
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8">
      <div className="w-24 h-24 rounded-full bg-[var(--bg-card)] flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        {((t as unknown as Record<string, Record<string, string>>).workbench)?.noProject || '暂无项目'}
      </h3>
      <p className="text-sm text-[var(--text-muted)] text-center max-w-md mb-6">
        {((t as unknown as Record<string, Record<string, string>>).workbench)?.selectProject || '选择一个现有项目或创建新项目开始您的创作之旅'}
      </p>
      {onCreateProject && (
        <button
          onClick={onCreateProject}
          className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] text-white font-medium shadow-lg hover:shadow-[var(--accent-glow)] transition-all"
        >
          {t.quickStart?.createProject || '创建新项目'}
        </button>
      )}
    </div>
  );
};

// ==================== 工作台内容渲染器 ====================

interface WorkbenchContentProps {
  projectType: ProjectType;
  projectId: number;
  activeTab: string;
}

const WorkbenchContent: React.FC<WorkbenchContentProps> = ({ projectType, projectId, activeTab }) => {
  // 漫剧类型直接使用完整的 ScriptStudio（自带标签页和项目管理）
  if (projectType === 'comic_drama') {
    return (
      <Suspense fallback={<WorkbenchLoadingFallback />}>
        <ScriptStudio />
      </Suspense>
    );
  }

  // 其他类型：根据项目类型渲染对应的工作台
  const WorkbenchComponent = useMemo(() => {
    switch (projectType) {
      case 'manga':
        return MangaWorkbench;
      case 'short_video':
        return ShortVideoWorkbench;
      case 'novel':
        return NovelWorkbench;
      default:
        return MangaWorkbench;
    }
  }, [projectType]);

  return (
    <Suspense fallback={<WorkbenchLoadingFallback />}>
      <WorkbenchComponent projectId={projectId} activeTab={activeTab} />
    </Suspense>
  );
};

// ==================== 工作台标签栏 ====================

interface WorkbenchTabBarProps {
  tabs: WorkbenchTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  projectType: ProjectType;
}

const WorkbenchTabBar: React.FC<WorkbenchTabBarProps> = ({ tabs, activeTab, onTabChange, projectType }) => {
  const { t } = useLanguage();
  
  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
      {/* 项目类型标识 */}
      <div className="flex items-center gap-2 pr-4 border-r border-[var(--border-color)]">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${PROJECT_TYPES[projectType].color} flex items-center justify-center`}>
          {(() => {
            const IconComponent = getIcon(PROJECT_TYPES[projectType].icon);
            return <IconComponent className="w-4 h-4 text-white" />;
          })()}
        </div>
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {((t as unknown as Record<string, Record<string, string>>).workbench)?.[projectType] || PROJECT_TYPES[projectType].name}
        </span>
      </div>
      
      {/* 标签页 */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => onTabChange(key as string)}
        variant="underlined"
        classNames={{
          tabList: "gap-6 w-full relative p-0 border-b-0",
          cursor: "w-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] h-0.5 shadow-[0_0_10px_var(--accent-glow)]",
          tab: "max-w-fit px-0 h-10 data-[hover-unselected=true]:opacity-80",
          tabContent: "group-data-[selected=true]:text-[var(--accent-light)] group-data-[selected=false]:text-[var(--text-muted)] font-medium transition-colors"
        }}
      >
        {tabs.map((tab) => {
          const IconComponent = getIcon(tab.icon);
          return (
            <Tab
              key={tab.key}
              title={
                <div className="flex items-center gap-2">
                  <IconComponent className="w-4 h-4" />
                  <span>{((t as unknown as Record<string, Record<string, Record<string, string>>>).workbench)?.[`${projectType}Tabs`]?.[tab.key] || tab.label}</span>
                </div>
              }
            />
          );
        })}
      </Tabs>
    </div>
  );
};

// ==================== 主组件 ====================

interface DynamicWorkbenchProps {
  onProjectSelect?: (project: Project) => void;
  onCreateProject?: () => void;
}

const DynamicWorkbench: React.FC<DynamicWorkbenchProps> = ({ 
  onProjectSelect,
  onCreateProject 
}) => {
  const { currentProject, projectType, isLoading, setCurrentProject, setIsLoading } = useWorkbench();
  const { tabs, activeTab, setActiveTab } = useWorkbenchTabs();
  const [isInitializing, setIsInitializing] = useState(false);
  
  // 处理标签页切换
  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
  }, [setActiveTab]);
  
  // 从 localStorage 加载上次选择的项目
  useEffect(() => {
    const loadLastProject = async () => {
      // 如果已经有当前项目，不需要加载
      if (currentProject) return;
      
      const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
      if (!lastProjectId) return;
      
      const projectId = parseInt(lastProjectId, 10);
      if (isNaN(projectId)) return;
      
      setIsInitializing(true);
      setIsLoading(true);
      
      try {
        // 获取所有项目列表，找到对应的项目
        const projects = await fetchProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (project) {
          setCurrentProject(project);
        } else {
          // 如果找不到项目（可能已被删除），清除 localStorage
          localStorage.removeItem(LAST_PROJECT_KEY);
        }
      } catch (error) {
        console.error('加载上次选择的项目失败:', error);
      } finally {
        setIsInitializing(false);
        setIsLoading(false);
      }
    };
    
    loadLastProject();
  }, [currentProject, setCurrentProject, setIsLoading]);
  
  // 如果没有项目且正在初始化，显示加载状态
  if (!currentProject && isInitializing) {
    return <WorkbenchLoadingFallback />;
  }
  
  // 如果没有项目，显示空状态
  if (!currentProject) {
    return <EmptyState onCreateProject={onCreateProject} />;
  }
  
  // 如果正在加载
  if (isLoading) {
    return <WorkbenchLoadingFallback />;
  }

  // 漫剧类型直接渲染 ScriptStudio（自带标签页），不显示 DynamicWorkbench 的标签栏
  if (projectType === 'comic_drama') {
    return (
      <div className="h-full bg-[var(--bg-app)]">
        <WorkbenchContent
          projectType={projectType}
          projectId={currentProject.id}
          activeTab={activeTab}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      {/* 标签栏 */}
      <WorkbenchTabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        projectType={projectType}
      />
      
      {/* 工作台内容 */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentProject.id}-${activeTab}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="h-full"
          >
            <WorkbenchContent
              projectType={projectType}
              projectId={currentProject.id}
              activeTab={activeTab}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DynamicWorkbench;
