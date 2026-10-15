/**
 * 我的工程 - 左侧边栏紧凑面板
 * ──────────────────────────────────────────────────────────────
 * 本地优先：桌面端工程 = 磁盘文件夹（含 .jzp 清单），由 Rust 注册表管理；
 * 云端（后端 API）工程作为只读入口合并展示。
 * 完整管理功能保留在 /projects 页面（底部入口跳转）。
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FolderOpen, RefreshCw, Loader2, Settings2, Plus, X, Monitor, Cloud, FolderInput } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Project, fetchProjects } from '../../services/projects';
import {
  isTauri,
  createProject,
  openProject,
  deleteProject,
  getDefaultProjectsRoot,
  selectDirectory,
} from '../../services/localApi';
import { PROJECT_TYPES, ProjectType } from '../../types/projectTypes';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface ProjectsSidePanelProps {
  /** 打开项目后回调（用于关闭侧边栏面板） */
  onOpenProject?: () => void;
}

const ProjectsSidePanel: React.FC<ProjectsSidePanelProps> = ({ onOpenProject }) => {
  const navigate = useNavigate();
  const { currentProject, switchProject } = useWorkbench();
  const { confirm } = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  // 新建工程表单
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProjectType>('comic_drama');
  const [parentDir, setParentDir] = useState<string>('');
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
      setError(err?.message || '加载项目失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 打开表单时预填默认工程根目录
  useEffect(() => {
    if (showCreate && !parentDir) {
      getDefaultProjectsRoot().then((dir) => setParentDir(dir)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate]);

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
      title: '移除工程',
      message: `从列表中移除「${project.name}」？\n磁盘上的工程文件夹不会被删除，可随时重新注册。`,
      confirmText: '移除',
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
      await createProject({
        name,
        project_type: newType,
        parent_dir: parentDir && !parentDir.includes('模拟') ? parentDir : null,
      });
      setShowCreate(false);
      setNewName('');
      await loadProjects();
    } catch (err: any) {
      setCreateError(err?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleBrowseDir = async () => {
    const dir = await selectDirectory('选择工程保存位置');
    if (dir) setParentDir(dir);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 搜索 + 新建 + 刷新 */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 shrink-0">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索工程..."
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
          className={`p-1.5 rounded-md transition-colors ${showCreate ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'}`}
          title="新建工程（保存到本地文件夹）"
        >
          {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={loadProjects}
          disabled={loading}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors disabled:opacity-50"
          title="刷新列表"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 新建工程表单 */}
      {showCreate && (
        <div className="mx-2 mb-1.5 p-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] space-y-1.5 shrink-0">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="工程名称 *"
            autoFocus
            className="w-full px-2 py-1 text-xs rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as ProjectType)}
            className="w-full px-2 py-1 text-xs rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {Object.values(PROJECT_TYPES).map(t => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
          {isTauri() && (
            <div className="flex items-center gap-1">
              <span
                className="flex-1 min-w-0 px-2 py-1 text-[10px] rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)] truncate"
                title={parentDir}
              >
                {parentDir || '文档\\AI-Video-Studio作品'}
              </span>
              <button
                onClick={handleBrowseDir}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-white/5"
                title="浏览其他位置"
              >
                <FolderInput className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {createError && <p className="text-[10px] text-red-400">{createError}</p>}
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setShowCreate(false)}
              className="px-2 py-1 text-xs rounded-md text-[var(--text-muted)] hover:bg-white/5"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="px-2.5 py-1 text-xs rounded-md bg-[var(--accent)] text-white disabled:opacity-50 flex items-center gap-1"
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              创建
            </button>
          </div>
        </div>
      )}

      {/* 工程列表 */}
      <div className="flex-1 overflow-y-auto px-1 pb-1 min-h-0">
        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          /* 无工程 / 服务未连接：统一显示"当前没有工程"空态，连接失败时附提示与重试 */
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center text-[var(--text-muted)]">
            <FolderOpen className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">当前没有工程</p>
            {error ? (
              <>
                <p className="mt-1 text-[10px] leading-relaxed opacity-80">
                  无法连接服务器（后端 API 服务未启动），启动后点击重试
                </p>
                <button onClick={loadProjects} className="mt-2 text-xs text-[var(--accent)] hover:underline">
                  重试
                </button>
              </>
            ) : (
              <p className="mt-1 text-[10px] opacity-80">
                {keyword
                  ? '没有匹配的工程，换个关键字试试'
                  : '点击上方「+」新建本地工程即可开始'}
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
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                    title={isLocal ? project.local_path || project.description || project.name : `${project.name}（云端工程）`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 bg-gradient-to-br ${typeMeta?.color || 'from-blue-500 to-cyan-500'}`}
                    />
                    <span className="flex-1 truncate text-xs font-medium">{project.name}</span>
                    {isLocal ? (
                      <Monitor className="w-3 h-3 shrink-0 text-[var(--text-muted)]" aria-label="本地工程" />
                    ) : (
                      <Cloud className="w-3 h-3 shrink-0 text-[var(--text-muted)]" aria-label="云端工程" />
                    )}
                  </button>
                  {isLocal && (
                    <button
                      onClick={(e) => handleRemoveLocal(e, project)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all"
                      title="从列表移除（不删除磁盘文件）"
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
          管理全部项目
        </button>
      </div>
    </div>
  );
};

export default ProjectsSidePanel;
