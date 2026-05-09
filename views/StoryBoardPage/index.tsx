/**
 * StoryBoardPage - 分镜工作台独立页面
 *
 * 入口：/storyboard?scriptId=xxx（从"我的资产 > 剧本"卡片跳转而来）
 * 职责：按 scriptId 加载项目与 scripts 列表，并包装 StoryBoard 组件
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Spinner } from '@heroui/react';
import { ArrowLeft, Bot } from 'lucide-react';
import StoryBoard from '../StoryBoard';
import AIModelConfigModal from '../../components/AIModelConfigModal';
import { useAIModels } from '../../hooks/useAIModels';
import { useToast } from '../../contexts/ToastContext';
import { getAuthToken } from '../../services/auth';
import { fetchProject, Project } from '../../services/projects';
import { fetchScriptLibrary } from '../../services/scripts';
import { useDisclosure } from '@heroui/react';

interface ScriptRow {
  id: number;
  project_id: number | null;
  episode_number: number;
  title: string;
  content: string;
  status: string;
}

const StoryBoardPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const scriptIdParam = searchParams.get('scriptId');
  const scriptId = scriptIdParam ? Number(scriptIdParam) : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<number>(1);

  const aiModels = useAIModels(project?.id);
  const {
    isOpen: isModelConfigOpen,
    onOpen: openModelConfig,
    onOpenChange: onModelConfigChange,
  } = useDisclosure();

  // 处理从资源管理页面跳转过来的待编辑资产
  useEffect(() => {
    const pending = sessionStorage.getItem('pendingAssetEdit');
    if (pending) {
      try {
        const { assetType, assetId, assetName, initialData } = JSON.parse(pending);
        // 延迟派发事件，确保 PreviewEditor 已挂载
        const timer = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('openAssetEditTab', {
            detail: { assetType, assetId, assetName, initialData }
          }));
          sessionStorage.removeItem('pendingAssetEdit');
        }, 500);
        return () => clearTimeout(timer);
      } catch {
        sessionStorage.removeItem('pendingAssetEdit');
      }
    }
  }, []);

  // 初始化：根据 scriptId 加载目标剧本 → 定位项目 → 加载项目所有剧本
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!scriptId) {
        setError('缺少 scriptId 参数');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        // 1) 从剧本库中定位目标剧本
        const library = await fetchScriptLibrary('all');
        const script = library.find((s) => s.id === scriptId);
        if (!script) {
          throw new Error('剧本不存在或无权限访问');
        }
        if (!script.project_id) {
          throw new Error('该剧本未绑定到项目，请先在资产库绑定后再生成分镜');
        }
        if (cancelled) return;

        // 2) 加载项目信息
        const projectData = await fetchProject(script.project_id);
        if (cancelled) return;
        setProject(projectData);

        // 3) 加载该项目的所有剧本
        const listRes = await fetch(`/api/projects/${script.project_id}/scripts`, {
          headers,
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const list: ScriptRow[] = listData.scripts || [];
          if (cancelled) return;
          setScripts(list);
        } else {
          setScripts([script as unknown as ScriptRow]);
        }

        setCurrentScriptId(script.id);
        setCurrentEpisode(script.episode_number || 1);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || '加载失败');
          showToast(e?.message || '加载分镜失败', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [scriptId, showToast]);

  const projectSettings = useMemo(() => {
    try {
      const s = project?.settings_json ? JSON.parse(project.settings_json) : {};
      return {
        imageAspectRatio: s.imageAspectRatio || undefined,
        imageResolution: s.imageResolution || undefined,
        videoAspectRatio: s.videoAspectRatio || undefined,
        videoResolution: s.videoResolution || undefined,
      };
    } catch {
      return undefined;
    }
  }, [project]);

  const handleEpisodeChange = useCallback((ep: number, sid: number) => {
    setCurrentEpisode(ep);
    setCurrentScriptId(sid);
  }, []);

  const handleCreateNextEpisode = useCallback(async () => {
    if (!project) return;
    const token = getAuthToken();
    const maxEp = scripts.reduce((m, s) => Math.max(m, s.episode_number || 0), 0);
    const nextEp = maxEp + 1;
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: project.id,
          episodeNumber: nextEp,
          title: `第${nextEp}集`,
          content: '',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '新建下一集失败');
      }
      const data = await res.json();
      const newId = data.scriptId || data.id;
      // 重新拉剧本列表
      const listRes = await fetch(`/api/projects/${project.id}/scripts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        setScripts(listData.scripts || []);
      }
      if (newId) {
        setCurrentScriptId(newId);
        setCurrentEpisode(nextEp);
      }
      showToast(`已新建第${nextEp}集`, 'success');
    } catch (e: any) {
      showToast(e?.message || '新建下一集失败', 'error');
    }
  }, [project, scripts, showToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" color="primary" />
          <p className="text-sm text-(--text-muted)">加载分镜工作台...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <p className="text-base text-(--text-secondary)">{error || '加载失败'}</p>
        <Button
          variant="flat"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => navigate('/assets')}
        >
          返回我的资产
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-(--border-color) bg-(--bg-nav)">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="flat"
            startContent={<ArrowLeft className="w-4 h-4" />}
            onPress={() => navigate('/assets')}
          >
            返回剧本库
          </Button>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-(--text-primary)">
              {project.name} · 分镜工作台
            </span>
            <span className="text-xs text-(--text-muted)">
              当前剧本：{scripts.find((s) => s.id === currentScriptId)?.title || `第${currentEpisode}集`}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="flat"
          startContent={<Bot className="w-4 h-4" />}
          onPress={openModelConfig}
        >
          模型选择
        </Button>
      </div>

      {/* StoryBoard 主体 */}
      <div className="flex-1 overflow-hidden">
        <StoryBoard
          scriptId={currentScriptId}
          projectId={project.id}
          episodeNumber={currentEpisode}
          scripts={scripts as any}
          models={aiModels.models}
          textModel={aiModels.selected.text}
          imageModel={aiModels.selected.image}
          videoModel={aiModels.selected.video}
          onEpisodeChange={handleEpisodeChange}
          onCreateNextEpisode={handleCreateNextEpisode}
          projectSettings={projectSettings}
        />
      </div>

      {/* AI 模型配置弹窗 */}
      <AIModelConfigModal
        isOpen={isModelConfigOpen}
        onOpenChange={onModelConfigChange}
        models={aiModels.models}
        selected={aiModels.selected}
        onSelect={aiModels.setSelected}
      />
    </div>
  );
};

export default StoryBoardPage;
