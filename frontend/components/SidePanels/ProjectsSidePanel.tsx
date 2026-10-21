/**
 * 我的工程 - 左侧边栏紧凑面板
 * ──────────────────────────────────────────────────────────────
 * 本地优先：桌面端工程 = 磁盘文件夹（含 .jzp 清单），由 Rust 注册表管理；
 * 云端（后端 API）工程作为只读入口合并展示。
 * 完整管理功能保留在 /projects 页面（底部入口跳转）。
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FolderOpen, RefreshCw, Loader2, Settings2, Plus, X, Monitor, Cloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Project, fetchProjects } from '../../services/projects';
import {
  createProject,
  openProject,
  deleteProject,
  getEffectiveProjectsRoot,
} from '../../services/localApi';
import { PROJECT_TYPES } from '../../types/projectTypes';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface ProjectsSidePanelProps {
  /** 打开项目后回调（用于关闭侧边栏面板） */
  onOpenProject?: () => void;
}

const ProjectsSidePanel: React.FC<ProjectsSidePanelProps> = ({ onOpenProject }) => {
  const navigate = useNavigate();
  const { currentProject, switchProject } = useWorkbench();
  const { confirm } = useConfirm();
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  // 新建工程表单（工程仅支持漫剧一种类型，不再提供种类选择；保存位置统一在「设置」中配置）
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProjects();
      // 本地工程排前，其后按最近修改排序
      setProjects([...data].sort((a, b) => {
        const aLocal = a.source === 'local' ? 1 : 0;
        const bLocal = b.source === 'local' ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;
        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
      }));
    } catch (err: any) {
      setProjects([]); // 加载失败时清掉旧列表，避免移除后残留
      setError(err?.message || t.frame.projects.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return projects;
    return projects.filter(p =>
      p.name?.toLowerCase().includes(kw) || p.description?.toLowerCase().includes(kw)
    );
  }, [projects, keyword]);

  const handleOpen = async (project: Project) => {
    if (project.source === 'local' && project.local_path) {
      try {
        await openProject(project.local_path); // 校验清单 + 更新最近打开
      } catch (err) {
        console.warn('[ProjectsSidePanel] 打开本地工程失败:', err);
      }
    }
    switchProject(project);
    localStorage.setItem('nanostory_last_project_id', String(project.id));
    onOpenProject?.();
    navigate('/');
  };

  /** 注销本地工程（不删除磁盘文件） */
  const handleRemoveLocal = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (!project.local_path) return;
    const ok = await confirm({
      title: t.frame.projects.removeTitle,
      message: t.frame.projects.removeMessage.replace('{name}', project.name),
      confirmText: t.frame.projects.remove,
      type: 'warning',
    });
    if (!ok) return;
    await deleteProject(project.local_path, false);
    loadProjects();
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const root = await getEffectiveProjectsRoot();
      await createProject({
        name,
        project_type: 'comic_drama',
        parent_dir: root && !root.includes('模拟') ? root : null,
      });
      setShowCreate(false);
      setNewName('');
      await loadProjects();
    } catch (err: any) {
      setCreateError(err?.message || t.frame.projects.createFailed);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 搜索 + 新建 + 刷新 */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 shrink-0">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t.frame.projects.searchPlaceholder}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md bg-[var(--bg-input)] border border-(--border-color) text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-(--accent)"
        />
        <button
          onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
          className={`p-1.5 rounded-md transition-colors ${showCreate ? 'bg-(--accent)/15 text-(--accent)' : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'}`}
          title={t.frame.projects.newTitle}
        >
          {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={loadProjects}
          disabled={loading}
          className="p-1.5 rounded-md text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors disabled:opacity-50"
          title={t.frame.projects.refreshTitle}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 新建工程表单 */}
      {showCreate && (
        <div className="mx-2 mb-1.5 p-2 rounded-md border border-(--border-color) bg-(--bg-card) space-y-1.5 shrink-0">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={t.frame.projects.namePlaceholder}
            autoFocus
            className="w-full px-2 py-1 text-xs rounded-md bg-(--bg-input) border border-(--border-color) text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-(--accent)"
          />
          {createError && <p className="text-[10px] text-red-400">{createError}</p>}
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setShowCreate(false)}
              className="px-2 py-1 text-xs rounded-md text-(--text-muted) hover:bg-white/5"
            >
              {t.frame.projects.cancel}
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="px-2.5 py-1 text-xs rounded-md bg-(--accent) text-white disabled:opacity-50 flex items-center gap-1"
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              {t.frame.projects.create}
            </button>
          </div>
        </div>
      )}

      {/* 工程列表 */}
      <div className="flex-1 overflow-y-auto px-1 pb-1 min-h-0">
        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-(--text-muted)">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t.frame.projects.loading}
          </div>
        ) : filtered.length === 0 ? (
          /* 无工程 / 服务未连接：统一显示"当前没有工程"空态，连接失败时附提示与重试 */
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center text-(--text-muted)">
            <FolderOpen className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">{t.frame.projects.empty}</p>
            {error ? (
              <>
                <p className="mt-1 text-[10px] leading-relaxed opacity-80">
                  {t.frame.projects.serverUnreachable}
                </p>
                <button onClick={loadProjects} className="mt-2 text-xs text-(--accent) hover:underline">
                  {t.frame.projects.retry}
                </button>
              </>
            ) : (
              <p className="mt-1 text-[10px] opacity-80">
                {keyword
                  ? t.frame.projects.noMatch
                  : t.frame.projects.clickPlusToStart}
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((project) => {
              const typeMeta = PROJECT_TYPES[project.type];
              const isActive = currentProject?.id === project.id;
              const isLocal = project.source === 'local';
              return (
                <li key={`${project.source || 'cloud'}-${project.id}`} className="group relative">
                  <button
                    onClick={() => handleOpen(project)}
                    className={`w-full flex items-center gap-2 pr-7 pl-2 py-1.5 rounded-md text-left transition-colors ${
                      isActive
                        ? 'bg-(--accent)/15 text-(--accent)'
                        : 'text-(--text-primary) hover:bg-(--bg-card-hover)'
                    }`}
                    title={isLocal ? project.local_path || project.description || project.name : `${project.name} (${t.frame.projects.cloudProject})`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 bg-linear-to-br ${typeMeta?.color || 'from-blue-500 to-cyan-500'}`}
                    />
                    <span className="flex-1 truncate text-xs font-medium">{project.name}</span>
                    {isLocal ? (
                      <Monitor className="w-3 h-3 shrink-0 text-(--text-muted)" aria-label={t.frame.projects.localProject} />
                    ) : (
                      <Cloud className="w-3 h-3 shrink-0 text-(--text-muted)" aria-label={t.frame.projects.cloudProject} />
                    )}
                  </button>
                  {isLocal && (
                    <button
                      onClick={(e) => handleRemoveLocal(e, project)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all"
                      title={t.frame.projects.removeHint}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 底部：跳转到完整管理页 */}
      <div className="shrink-0 border-t border-[var(--border-color)] px-2 py-1.5">
        <button
          onClick={() => navigate('/projects')}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-white/5 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {t.frame.projects.manageAll}
        </button>
      </div>
    </div>
  );
};

export default ProjectsSidePanel;
