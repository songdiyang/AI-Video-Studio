/**
 * 漫画工作台
 * 包含剧本/脚本、页面布局、绘图工具三个功能模块
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Spinner, Button, Input, Textarea } from '@heroui/react';
import { Plus, FileText, LayoutGrid, Paintbrush, ChevronLeft, ChevronRight, Trash2, Copy, Eye } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAuthToken } from '../../services/auth';
import { Project, fetchProject } from '../../services/projects';
import { MangaPage, PanelLayout } from '../../types/projectTypes';
import { useAIModels } from '../../hooks/useAIModels';

// 懒加载子组件
const PageLayout = lazy(() => import('./PageLayout'));
const DrawingTools = lazy(() => import('./DrawingTools'));

// ==================== 类型定义 ====================

interface MangaWorkbenchProps {
  projectId: number;
  activeTab: string;
}

interface Episode {
  number: number;
  title: string;
  pageCount: number;
}

// ==================== 加载占位组件 ====================

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[300px]">
    <Spinner size="lg" color="primary" />
  </div>
);

// ==================== 剧本/脚本面板 ====================

interface MangaScriptPanelProps {
  projectId: number;
  currentEpisode: number;
  onEpisodeChange: (episode: number) => void;
}

const MangaScriptPanel: React.FC<MangaScriptPanelProps> = ({
  projectId,
  currentEpisode,
  onEpisodeChange,
}) => {
  const { showToast } = useToast();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载集数列表
  useEffect(() => {
    const loadEpisodes = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${projectId}/manga/episodes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setEpisodes(data.episodes || [{ number: 1, title: '第1话', pageCount: 0 }]);
        } else {
          // 默认第1话
          setEpisodes([{ number: 1, title: '第1话', pageCount: 0 }]);
        }
      } catch {
        setEpisodes([{ number: 1, title: '第1话', pageCount: 0 }]);
      }
    };
    loadEpisodes();
  }, [projectId]);

  // 加载当前集的脚本
  useEffect(() => {
    const loadScript = async () => {
      setLoading(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${projectId}/manga/scripts/${currentEpisode}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setScript(data.content || '');
        } else {
          setScript('');
        }
      } catch {
        setScript('');
      } finally {
        setLoading(false);
      }
    };
    loadScript();
  }, [projectId, currentEpisode]);

  // 保存脚本
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/projects/${projectId}/manga/scripts/${currentEpisode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: script }),
      });
      if (res.ok) {
        showToast('保存成功', 'success');
      }
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 添加新话
  const handleAddEpisode = () => {
    const newEpisode = {
      number: episodes.length + 1,
      title: `第${episodes.length + 1}话`,
      pageCount: 0,
    };
    setEpisodes([...episodes, newEpisode]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={currentEpisode}
            onChange={(e) => onEpisodeChange(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)]"
          >
            {episodes.map((ep) => (
              <option key={ep.number} value={ep.number}>
                {ep.title} ({ep.pageCount}页)
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="flat"
            startContent={<Plus className="w-4 h-4" />}
            onPress={handleAddEpisode}
          >
            添加新话
          </Button>
        </div>
        <Button
          size="sm"
          color="primary"
          isLoading={saving}
          onPress={handleSave}
        >
          保存脚本
        </Button>
      </div>

      {/* 脚本编辑区 */}
      <div className="flex-1 p-4 overflow-hidden">
        {loading ? (
          <LoadingFallback />
        ) : (
          <div className="h-full flex flex-col gap-4">
            <div className="text-sm text-[var(--text-muted)]">
              漫画脚本/分镜草案 - 描述每一页的内容、对话和分格布局
            </div>
            <Textarea
              value={script}
              onValueChange={setScript}
              placeholder={`第1页：
[分格1] 场景描述...
角色A：对话内容...

[分格2] 动作描述...
角色B：对话内容...

---
第2页：
...`}
              minRows={20}
              classNames={{
                base: "flex-1",
                input: "h-full bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono text-sm",
                inputWrapper: "h-full bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40"
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const MangaWorkbench: React.FC<MangaWorkbenchProps> = ({ projectId, activeTab }) => {
  const { showToast } = useToast();
  
  // 项目和页面状态
  const [project, setProject] = useState<Project | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState<MangaPage[]>([]);
  const [loading, setLoading] = useState(true);
  
  // AI 模型配置
  const { models, selected, isConfigured, getModelsByType } = useAIModels(projectId);

  // 加载项目数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const projectData = await fetchProject(projectId);
        setProject(projectData);
        
        // 加载页面列表
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${projectId}/manga/pages?episode=${currentEpisode}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setPages(data.pages || []);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId, currentEpisode]);

  // 处理集数切换
  const handleEpisodeChange = useCallback((episode: number) => {
    setCurrentEpisode(episode);
    setCurrentPage(1);
  }, []);

  // 处理页面切换
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // 加载中
  if (loading && !project) {
    return <LoadingFallback />;
  }

  // 根据 activeTab 渲染不同的工作台内容
  const renderContent = () => {
    switch (activeTab) {
      case 'script':
        return (
          <MangaScriptPanel
            projectId={projectId}
            currentEpisode={currentEpisode}
            onEpisodeChange={handleEpisodeChange}
          />
        );
        
      case 'layout':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <PageLayout
              projectId={projectId}
              episodeNumber={currentEpisode}
              pages={pages}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              onPagesUpdate={setPages}
            />
          </Suspense>
        );
        
      case 'drawing':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <DrawingTools
              projectId={projectId}
              episodeNumber={currentEpisode}
              pageNumber={currentPage}
              page={pages.find(p => p.page_number === currentPage)}
              models={models}
              imageModel={selected.image || ''}
            />
          </Suspense>
        );
        
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--text-muted)]">未知的工作台标签</p>
          </div>
        );
    }
  };

  return (
    <div className="h-full">
      {renderContent()}
    </div>
  );
};

export default MangaWorkbench;
