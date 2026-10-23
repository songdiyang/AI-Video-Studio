/**
 * 欢迎页（Qoder / IDEA 风格）
 * ──────────────────────────────────────────────────────────────
 * 工程入口从左侧「我的工程」面板迁移到这里：
 *  - 品牌标题 + 设置入口
 *  - 左侧：打开工程文件夹 / 新建工程 / 打开 .jzp 工程包
 *  - 右侧：最近工程列表（名称 + 所在目录）
 *  - 新建工程：IDEA 风格对话框（模板 + 名称 + 保存位置），创建后立即打开空白工程
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@heroui/react';
import {
  FolderPlus, FolderOpen, FileArchive, BookOpen, Film, PenLine, Clapperboard, Music,
  Loader2, Download, Trash2, Settings as SettingsIcon,
} from 'lucide-react';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { mapLocalProject } from '../../services/projects';
import {
  createProject,
  importProjectPackage,
  openProject,
  listProjects,
  registerProject,
  deleteProject,
  exportProjectPackage,
  saveFile,
  getEffectiveProjectsRoot,
  selectDirectory,
  selectFile,
  isTauri,
  type ProjectMetadata,
} from '../../services/localApi';

const RECENT_LIMIT = 6;

/** 取工程路径的所在目录（最近工程列表右侧展示） */
function dirOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const { switchProject, currentProject } = useWorkbench();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { confirm } = useConfirm();
  const w = t.welcome;

  const [recent, setRecent] = useState<ProjectMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllRecent, setShowAllRecent] = useState(false);
  // 正在打包导出的工程路径 / 正在删除的工程 id
  const [exportingPath, setExportingPath] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 新建工程对话框
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const activate = useCallback((meta: ProjectMetadata) => {
    const project = mapLocalProject(meta);
    switchProject(project);
    localStorage.setItem('nanostory_last_project_id', String(project.id));
    navigate('/');
  }, [switchProject, navigate]);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      setRecent(await listProjects());
    } catch (err) {
      console.warn('[Welcome] 加载最近工程失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  /** 打开最近工程 */
  const handleOpenRecent = async (meta: ProjectMetadata) => {
    if (!meta.path) {
      showToast(w.openFailed, 'error');
      return;
    }
    try {
      activate(await openProject(meta.path));
    } catch (err: any) {
      showToast(err?.message || w.openFailed, 'error');
      void loadRecent();
    }
  };

  /** 打开工程文件夹（含 project.json 的工作区） */
  const handleOpenFolder = async () => {
    if (!isTauri()) {
      showToast(w.desktopOnly, 'warning');
      return;
    }
    const dir = await selectDirectory(w.openFolderTitle);
    if (!dir) return;
    try {
      activate(await registerProject(dir));
    } catch (err: any) {
      showToast(err?.message || w.openFailed, 'error');
    }
  };

  /** 打开 .jzp 工程包 */
  const handleOpenPackage = async () => {
    if (!isTauri()) {
      showToast(w.desktopOnly, 'warning');
      return;
    }
    const path = await selectFile(w.openPackageTitle, [
      { name: w.packageFilter, extensions: ['jzp'] },
    ]);
    if (!path) return;
    try {
      activate(await importProjectPackage(path));
    } catch (err: any) {
      showToast(err?.message || w.openFailed, 'error');
    }
  };

  /** 导出最近工程为 .jzp 工程包 */
  const handleExportJzp = async (meta: ProjectMetadata) => {
    if (!meta.path || exportingPath) return;
    if (!isTauri()) {
      showToast(w.desktopOnly, 'warning');
      return;
    }
    const dest = await saveFile(
      t.frame.projects.exportJzpTitle,
      `${meta.name || '工程'}.jzp`,
      [{ name: w.packageFilter, extensions: ['jzp'] }],
    );
    if (!dest) return;
    setExportingPath(meta.path);
    try {
      const saved = await exportProjectPackage(meta.path, dest);
      showToast(t.frame.projects.exportJzpSuccess.replace('{path}', saved), 'success');
    } catch (err: any) {
      showToast(err?.message || t.frame.projects.exportJzpFailed, 'error');
    } finally {
      setExportingPath(null);
    }
  };

  /** 删除工程（解除注册并从磁盘删除文件夹），可用导出的 .jzp 重新导入 */
  const handleDeleteProject = async (meta: ProjectMetadata) => {
    if (!meta.path || deletingId) return;
    const ok = await confirm({
      title: w.deleteTitle,
      message: w.deleteMessage.replace('{name}', meta.name || '未命名'),
      confirmText: w.deleteConfirm,
      type: 'warning',
    });
    if (!ok) return;
    setDeletingId(meta.id);
    try {
      await deleteProject(meta.path, true);
      showToast(w.deleteSuccess, 'success');
      await loadRecent();
    } catch (err: any) {
      showToast(err?.message || w.deleteFailed, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  /** 打开设置：优先进工作台以「设置」标签页打开；无工程时进入应用级标签容器 */
  const handleOpenSettings = useCallback(async () => {
    // 一次性标记：PreviewEditor 水合完成后读取并激活设置标签
    localStorage.setItem('pending_open_settings', '1');

    if (currentProject) {
      navigate('/');
      return;
    }
    if (recent.length > 0) {
      const recentPath = recent[0]?.path;
      if (recentPath) {
        try {
          activate(await openProject(recentPath));
          return;
        } catch {
          // 打开最近工程失败：改用应用级设置标签
        }
      }
    }
    localStorage.removeItem('pending_open_settings');
    navigate('/app-tabs');
  }, [activate, currentProject, navigate, recent]);

  /** 打开新建工程对话框并预填默认位置 */
  const openCreate = async () => {
    setName('');
    setCreateError(null);
    setCreateOpen(true);
    try {
      setLocation(await getEffectiveProjectsRoot());
    } catch {
      setLocation('');
    }
  };

  const handleBrowseLocation = async () => {
    const dir = await selectDirectory(w.location);
    if (dir) setLocation(dir);
  };

  const handleCreate = async () => {
    const value = name.trim();
    if (!value || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const meta = await createProject({
        name: value,
        project_type: 'comic_drama',
        parent_dir: location.trim() || null,
      });
      setCreateOpen(false);
      activate(meta);
    } catch (err: any) {
      setCreateError(err?.message || w.createFailed);
    } finally {
      setCreating(false);
    }
  };

  const templates = [
    { key: 'comic_drama', label: w.comicDrama, icon: Film, available: true },
    { key: 'manga', label: t.settings.about.comicWorkbench, icon: BookOpen, available: false },
    { key: 'novel', label: t.settings.about.novelWorkbench, icon: PenLine, available: false },
    { key: 'short_video', label: t.settings.about.shortVideoWorkbench, icon: Clapperboard, available: false },
    { key: 'music', label: t.settings.about.musicWorkbench, icon: Music, available: false },
  ];

  const visibleRecent = showAllRecent ? recent : recent.slice(0, RECENT_LIMIT);

  return (
    <div className="h-full min-h-0 overflow-auto bg-(--bg-app) text-(--text-primary)">
      <div className="mx-auto flex min-h-full w-full max-w-250 flex-col justify-center px-10 py-16">
        {/* 品牌 + 设置 */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[34px] leading-tight font-semibold tracking-tight">AI Video Studio</h1>
            <p className="mt-2 text-sm text-(--text-secondary)">{w.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => { void handleOpenSettings(); }}
            className="mt-1.5 shrink-0 text-sm text-(--accent) hover:underline"
          >
            {w.settings}
          </button>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-16">
          {/* 主操作 */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => { void openCreate(); }}
              className="group flex w-full items-center gap-4 rounded-md bg-(--bg-card) px-5 py-4.5 text-left transition-colors hover:bg-(--bg-card-hover)"
            >
              <FolderPlus className="w-5 h-5 shrink-0 text-(--text-secondary) group-hover:text-(--text-primary)" />
              <span className="text-[15px] font-medium">{w.newProject}</span>
            </button>
            <button
              type="button"
              onClick={() => { void handleOpenFolder(); }}
              className="group flex w-full items-center gap-4 rounded-md bg-(--bg-card) px-5 py-4.5 text-left transition-colors hover:bg-(--bg-card-hover)"
            >
              <FolderOpen className="w-5 h-5 shrink-0 text-(--text-secondary) group-hover:text-(--text-primary)" />
              <span className="text-[15px] font-medium">{w.openFolder}</span>
            </button>
            <button
              type="button"
              onClick={() => { void handleOpenPackage(); }}
              className="group flex w-full items-center gap-4 rounded-md bg-(--bg-card) px-5 py-4.5 text-left transition-colors hover:bg-(--bg-card-hover)"
            >
              <FileArchive className="w-5 h-5 shrink-0 text-(--text-secondary) group-hover:text-(--text-primary)" />
              <span className="text-[15px] font-medium">{w.openPackage}</span>
            </button>
          </div>

          {/* 最近工程 */}
          <section className="min-w-0">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[13px] text-(--text-secondary)">{w.recent}</h2>
              {recent.length > RECENT_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllRecent((v) => !v)}
                  className="text-xs text-(--accent) hover:underline"
                >
                  {showAllRecent ? w.recentLess : w.recentMore}
                </button>
              )}
            </div>

            <div className="mt-1">
              {loading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-(--text-muted)">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t.common.loading}
                </div>
              ) : recent.length === 0 ? (
                <div className="py-4">
                  <p className="text-sm text-(--text-secondary)">{w.empty}</p>
                  <p className="mt-1 text-xs text-(--text-muted)">{w.emptyHint}</p>
                </div>
              ) : (
                visibleRecent.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-center gap-2 border-b border-(--border-color)/40 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => { void handleOpenRecent(item); }}
                      className="flex min-w-0 flex-1 items-baseline justify-between gap-6 py-2.5 text-left"
                      title={item.path}
                    >
                      <span className="min-w-0 truncate text-sm group-hover:text-(--accent)">
                        {item.name || '未命名'}
                      </span>
                      <span className="max-w-[52%] shrink-0 truncate text-xs text-(--text-muted)">
                        {item.path ? dirOf(item.path) : ''}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => { void handleExportJzp(item); }}
                        disabled={!!exportingPath}
                        className="rounded-md p-1.5 text-(--text-muted) hover:bg-white/5 hover:text-(--text-primary) disabled:opacity-40"
                        title={w.exportPackage}
                        aria-label={w.exportPackage}
                      >
                        {exportingPath === item.path
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleDeleteProject(item); }}
                        disabled={!!deletingId}
                        className="rounded-md p-1.5 text-(--text-muted) hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                        title={w.deleteProject}
                        aria-label={w.deleteProject}
                      >
                        {deletingId === item.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* IDEA 风格新建工程对话框 */}
      <Modal
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        size="4xl"
        scrollBehavior="inside"
        isDismissable={!creating}
        classNames={{
          base: 'bg-(--bg-card) border border-(--border-color) shadow-[0_24px_64px_rgba(0,0,0,0.6)]',
          header: 'px-6 pt-5 pb-3 border-b border-(--border-color)',
          body: 'p-0',
          footer: 'px-6 py-4 border-t border-(--border-color)',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-0.5">
                <span className="text-base font-bold text-(--text-primary)">{w.newTitle}</span>
                <span className="text-xs font-normal text-(--text-muted)">{w.newSubtitle}</span>
              </ModalHeader>
              <ModalBody>
                <div className="flex min-h-85">
                  {/* 左侧模板 */}
                  <div className="w-56 shrink-0 border-r border-(--border-color) p-3">
                    <p className="px-2 pb-2 text-[11px] uppercase tracking-wider text-(--text-muted)">{w.templates}</p>
                    <div className="space-y-0.5">
                      {templates.map((tpl) => {
                        const Icon = tpl.icon;
                        return (
                          <div
                            key={tpl.key}
                            className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm ${
                              tpl.available
                                ? 'bg-(--accent)/10 text-(--accent) font-medium'
                                : 'text-(--text-muted) opacity-50'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{tpl.label}</span>
                            {!tpl.available && (
                              <span className="ml-auto text-[10px]">{w.comingSoon}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 右侧表单 */}
                  <div className="flex-1 min-w-0 p-5 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-(--text-secondary) mb-1.5">{w.name}</label>
                      <Input
                        autoFocus
                        size="sm"
                        variant="flat"
                        placeholder={w.namePlaceholder}
                        value={name}
                        onValueChange={setName}
                        isDisabled={creating}
                        classNames={{
                          inputWrapper: 'bg-(--bg-input) border border-(--border-color) data-[hover=true]:bg-(--bg-input) data-[focus=true]:border-(--accent)',
                          input: 'text-sm text-(--text-primary) placeholder:text-(--text-muted)',
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-(--text-secondary) mb-1.5">{w.location}</label>
                      <div className="flex items-center gap-2">
                        <Input
                          size="sm"
                          variant="flat"
                          value={location}
                          onValueChange={setLocation}
                          isDisabled={creating}
                          classNames={{
                            inputWrapper: 'bg-(--bg-input) border border-(--border-color) data-[hover=true]:bg-(--bg-input) data-[focus=true]:border-(--accent)',
                            input: 'text-sm text-(--text-primary) placeholder:text-(--text-muted)',
                          }}
                        />
                        <Button size="sm" variant="flat" isDisabled={creating} onPress={() => { void handleBrowseLocation(); }}>
                          <FolderOpen className="w-3.5 h-3.5" />
                          {w.browse}
                        </Button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-(--text-muted)">{w.locationHint}</p>
                    </div>
                    {createError && <p className="text-xs text-red-400">{createError}</p>}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" isDisabled={creating} onPress={onClose} className="text-(--text-secondary)">
                  {w.cancel}
                </Button>
                <Button
                  color="primary"
                  isDisabled={!name.trim() || creating}
                  isLoading={creating}
                  onPress={() => { void handleCreate(); }}
                  className="min-w-24"
                >
                  {creating ? w.creating : w.create}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Welcome;
