/**
 * 资产管理左侧边栏 - 项目快速切换
 */

import React from 'react';
import { FolderOpen, Package, X } from 'lucide-react';
import type { Project } from '../../services/projects';

interface ProjectSidebarProps {
  projects: Project[];
  selectedProject: string;
  onSelectProject: (projectId: string) => void;
  onClose?: () => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  selectedProject,
  onSelectProject,
  onClose
}) => {
  return (
    <div className="w-64 h-full bg-(--bg-card) border-r border-(--border-color) flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-(--border-color)">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-(--accent)" />
          <h3 className="font-semibold text-(--text-primary)">项目列表</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-(--bg-hover) transition-colors"
          >
            <X className="w-4 h-4 text-(--text-muted)" />
          </button>
        )}
      </div>

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* 全部项目 */}
        <button
          onClick={() => onSelectProject('all')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
            selectedProject === 'all'
              ? 'bg-(--accent)/15 text-(--accent-light) border border-(--accent)/30'
              : 'text-(--text-secondary) hover:bg-(--bg-hover) border border-transparent'
          }`}
        >
          <Package className="w-4 h-4" />
          <span className="text-sm font-medium">全部项目</span>
        </button>

        {/* 未使用素材 */}
        <button
          onClick={() => onSelectProject('unused')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
            selectedProject === 'unused'
              ? 'bg-(--accent)/15 text-(--accent-light) border border-(--accent)/30'
              : 'text-(--text-secondary) hover:bg-(--bg-hover) border border-transparent'
          }`}
        >
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">未使用素材</span>
        </button>

        {/* 分隔线 */}
        <div className="my-2 border-t border-(--border-color)" />

        {/* 项目列表 */}
        {projects.map(project => {
          const isSelected = selectedProject === String(project.id);
          return (
            <button
              key={project.id}
              onClick={() => onSelectProject(String(project.id))}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                isSelected
                  ? 'bg-(--accent)/15 text-(--accent-light) border border-(--accent)/30'
                  : 'text-(--text-secondary) hover:bg-(--bg-hover) border border-transparent'
              }`}
              title={project.name}
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium truncate">{project.name}</span>
            </button>
          );
        })}

        {/* 空状态 */}
        {projects.length === 0 && (
          <div className="text-center py-8 text-(--text-muted)">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">暂无项目</p>
          </div>
        )}
      </div>

      {/* 底部统计 */}
      <div className="p-3 border-t border-(--border-color) text-xs text-(--text-muted) text-center">
        共 {projects.length} 个项目
      </div>
    </div>
  );
};

export default ProjectSidebar;
