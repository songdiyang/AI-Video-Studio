/**
 * 动态工作台容器组件
 * 根据项目类型动态渲染工作台标签页和内容
 */

import React, { Suspense, lazy, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Tabs, Tab, Spinner } from '@heroui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkbench, useWorkbenchTabs } from '../../contexts/WorkbenchContext';
import { Project } from '../../services/projects';
import { ProjectType, PROJECT_TYPES, WorkbenchTab } from '../../types/projectTypes';
import { getIcon } from './workbenchConfig';
import { useLanguage } from '../../contexts/LanguageContext';
import ProjectSelector from '../ProjectSelector';



// ==================== 懒加载组件 ====================

// 漫剧工作台 - 直接使用完整的 ScriptStudio（自带标签页管理）
const ScriptStudio = lazy(() => import('../../views/ScriptStudio'));

// ==================== 加载占位组件 ====================

const WorkbenchLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-100">
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" color="primary" />
      <p className="text-sm text-(--text-muted)">加载工作台...</p>
    </div>
  </div>
);

// ==================== 工作台内容渲染器 ====================

interface WorkbenchContentProps {
  projectType: ProjectType;
  projectId: number;
  activeTab: string;
}

const WorkbenchContent: React.FC<WorkbenchContentProps> = ({ projectType }) => {
  // 当前仅支持漫剧类型，直接使用完整的 ScriptStudio（自带标签页和项目管理）
  if (projectType === 'comic_drama') {
    return (
      <Suspense fallback={<WorkbenchLoadingFallback />}>
        <ScriptStudio />
      </Suspense>
    );
  }

  return <WorkbenchLoadingFallback />;
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
    <div className="flex items-center gap-4 px-6 py-3 border-b border-(--border-color) bg-(--bg-nav) shrink-0 overflow-x-auto">
      {/* 项目类型标识 */}
      <div className="flex items-center gap-2 pr-4 border-r border-(--border-color)">
        <div className={`w-8 h-8 rounded-lg bg-linear-to-br ${PROJECT_TYPES[projectType].color} flex items-center justify-center`}>
          {(() => {
            const IconComponent = getIcon(PROJECT_TYPES[projectType].icon);
            return <IconComponent className="w-4 h-4 text-white" />;
          })()}
        </div>
        <span className="text-sm font-medium text-(--text-secondary)">
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
          cursor: "w-full bg-linear-to-r from-(--accent) to-(--accent-light) h-0.5 shadow-[0_0_10px_var(--accent-glow)]",
          tab: "max-w-fit px-0 h-10 data-[hover-unselected=true]:opacity-80",
          tabContent: "group-data-[selected=true]:text-(--accent-light) group-data-[selected=false]:text-(--text-muted) font-medium transition-colors"
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
  // 处理标签页切换
  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
  }, [setActiveTab]);
  
  // 加载中：等待 Workbench 恢复上次工程，避免首屏误跳欢迎页
  if (isLoading) {
    return <WorkbenchLoadingFallback />;
  }

  // 没有项目：进入欢迎页（工程入口已从左侧面板迁移到欢迎页）
  if (!currentProject) {
    return <Navigate to="/welcome" replace />;
  }

  // 漫剧类型直接渲染 ScriptStudio（自带标签页），不显示 DynamicWorkbench 的标签栏
  if (projectType === 'comic_drama') {
    return (
      <div className="h-full bg-(--bg-app)">
        <WorkbenchContent
          projectType={projectType}
          projectId={currentProject.id}
          activeTab={activeTab}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-(--bg-app)">
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
            transition={{ duration: 0.1, ease: 'easeInOut' }}
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
