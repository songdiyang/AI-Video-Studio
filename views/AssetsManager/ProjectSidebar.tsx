/**
 * 资产管理左侧边栏 - 项目快速切换
 */

import React, { useState, useCallback } from 'react';
import { FolderOpen, Package, X, ChevronRight, ChevronDown, Users, FileText, Tag, MapPin, BookOpen } from 'lucide-react';
import type { Project } from '../../services/projects';
import { fetchCharactersByProject, fetchProps } from '../../services/assets';
import { fetchCostumes } from '../../services/costumes';
import { listStudios } from '../../services/studios';
import { fetchScriptLibrary } from '../../services/scripts';

interface ProjectSidebarProps {
  projects: Project[];
  selectedProject: string;
  activeTab?: string;
  onSelectProject: (projectId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onSelectResourceType?: (projectId: string, tabType: string) => void;
  onSelectAsset?: (tabType: string, asset: any) => void;
  onEditAsset?: (tabType: string, asset: any) => void;
  onClose?: () => void;
}

const RESOURCE_TYPES: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'characters', label: '角色', icon: <Users className="w-3.5 h-3.5" /> },
  { key: 'props', label: '道具', icon: <FileText className="w-3.5 h-3.5" /> },
  { key: 'costumes', label: '服装', icon: <Tag className="w-3.5 h-3.5" /> },
  { key: 'studios', label: '影棚', icon: <MapPin className="w-3.5 h-3.5" /> },
  { key: 'scripts', label: '剧本', icon: <BookOpen className="w-3.5 h-3.5" /> },
];

function getAssetName(asset: any, typeKey: string): string {
  if (typeKey === 'scripts') return asset.title || '未命名剧本';
  return asset.name || '未命名';
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  selectedProject,
  activeTab,
  onSelectProject,
  onOpenProject,
  onSelectResourceType,
  onSelectAsset,
  onEditAsset,
  onClose
}) => {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [typeAssets, setTypeAssets] = useState<Record<string, any[]>>({});
  const [loadingTypes, setLoadingTypes] = useState<Set<string>>(new Set());
  const [selectedAssetKey, setSelectedAssetKey] = useState<string>('');

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const loadTypeAssets = useCallback(async (projectId: string, typeKey: string) => {
    const cacheKey = `${projectId}_${typeKey}`;
    if (typeAssets[cacheKey]) return;
    setLoadingTypes(prev => new Set(prev).add(cacheKey));
    try {
      let assets: any[] = [];
      const pid = Number(projectId);
      switch (typeKey) {
        case 'characters':
          assets = await fetchCharactersByProject(pid);
          break;
        case 'props':
          assets = (await fetchProps()).filter((p: any) => String(p.project_id) === projectId);
          break;
        case 'costumes':
          assets = await fetchCostumes(pid);
          break;
        case 'studios':
          assets = await listStudios(pid);
          break;
        case 'scripts':
          assets = (await fetchScriptLibrary('all')).filter((s: any) => String(s.project_id) === projectId);
          break;
      }
      setTypeAssets(prev => ({ ...prev, [cacheKey]: assets }));
    } catch (err) {
      console.error('[ProjectSidebar] load assets failed:', err);
    } finally {
      setLoadingTypes(prev => {
        const next = new Set(prev);
        next.delete(cacheKey);
        return next;
      });
    }
  }, [typeAssets]);

  const toggleType = (projectId: string, typeKey: string) => {
    const cacheKey = `${projectId}_${typeKey}`;
    const isExpanded = expandedTypes.has(cacheKey);
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (isExpanded) {
        next.delete(cacheKey);
      } else {
        next.add(cacheKey);
      }
      return next;
    });
    if (!isExpanded) {
      loadTypeAssets(projectId, typeKey);
    }
    onSelectResourceType?.(projectId, typeKey);
  };

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

        {/* 项目列表（树结构） */}
        {projects.map(project => {
          const projectIdStr = String(project.id);
          const isSelected = selectedProject === projectIdStr;
          const isProjectExpanded = expandedProjects.has(projectIdStr);
          return (
            <div key={project.id}>
              {/* 项目节点 */}
              <div className="flex items-center">
                <button
                  onClick={() => toggleProject(projectIdStr)}
                  className="p-1 rounded hover:bg-(--bg-hover) transition-colors text-(--text-muted) shrink-0"
                  title={isProjectExpanded ? '折叠' : '展开'}
                >
                  {isProjectExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => onSelectProject(projectIdStr)}
                  onDoubleClick={() => onOpenProject?.(projectIdStr)}
                  className={`flex-1 flex items-center gap-2 px-2 py-2 rounded-lg transition-all text-left select-none ${
                    isSelected && !onSelectResourceType
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/40'
                      : 'text-(--text-secondary) hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400 border border-transparent'
                  }`}
                  title={`单击选中，双击打开：${project.name}`}
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium truncate">{project.name}</span>
                </button>
              </div>

              {/* 资源类型子节点 */}
              {isProjectExpanded && (
                <div className="ml-6 mt-1 space-y-0.5">
                  {RESOURCE_TYPES.map(rt => {
                    const cacheKey = `${projectIdStr}_${rt.key}`;
                    const isTypeExpanded = expandedTypes.has(cacheKey);
                    const assets = typeAssets[cacheKey] || [];
                    const isLoading = loadingTypes.has(cacheKey);
                    const isTypeActive = selectedProject === projectIdStr && activeTab === rt.key;
                    return (
                      <div key={rt.key}>
                        <button
                          onClick={() => toggleType(projectIdStr, rt.key)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-left border border-transparent ${
                            isTypeActive
                              ? 'bg-(--accent)/15 text-(--accent-light) border border-(--accent)/20'
                              : 'text-(--text-muted) hover:bg-(--accent)/5 hover:text-(--text-secondary)'
                          }`}
                        >
                          {isTypeExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {rt.icon}
                          <span className="text-xs">{rt.label}</span>
                          {assets.length > 0 && (
                            <span className="text-[10px] text-(--text-muted) ml-auto">({assets.length})</span>
                          )}
                        </button>

                        {/* 资产列表 */}
                        {isTypeExpanded && (
                          <div className="ml-5 mt-0.5 space-y-0.5">
                            {isLoading && (
                              <div className="px-3 py-1 text-[10px] text-(--text-muted)">加载中...</div>
                            )}
                            {!isLoading && assets.length === 0 && (
                              <div className="px-3 py-1 text-[10px] text-(--text-muted)">暂无资产</div>
                            )}
                            {assets.map(asset => {
                              const assetKey = `${projectIdStr}_${rt.key}_${asset.id}`;
                              const isAssetSelected = selectedAssetKey === assetKey;
                              return (
                                <div
                                  key={asset.id}
                                  className={`px-3 py-1 rounded text-[11px] cursor-pointer truncate select-none transition-colors ${
                                    isAssetSelected
                                      ? 'bg-(--accent)/15 text-(--accent-light) border border-(--accent)/20'
                                      : 'text-(--text-secondary) hover:bg-(--accent)/5 hover:text-(--text-primary)'
                                  }`}
                                  onClick={() => {
                                    setSelectedAssetKey(assetKey);
                                    onSelectAsset?.(rt.key, asset);
                                  }}
                                  onDoubleClick={() => onEditAsset?.(rt.key, asset)}
                                  title={`单击选中，双击编辑：${getAssetName(asset, rt.key)}`}
                                >
                                  {getAssetName(asset, rt.key)}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
