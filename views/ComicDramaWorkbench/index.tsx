/**
 * 漫剧工作台
 * 整合剧本生成、分镜设计、视频合成三个功能模块
 */

import React, { useState, useEffect, useCallback, Suspense, lazy, useMemo } from 'react';
import { Spinner } from '@heroui/react';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAuthToken } from '../../services/auth';
import { Project, fetchProject } from '../../services/projects';
import { AIModel } from '../../components/AIModelSelector';
import { useAIModels } from '../../hooks/useAIModels';
import { PanelGroup } from '../../components/PanelGroup';
import ResizablePanel from '../../components/ResizablePanel';

// 懒加载子组件
const StoryBoard = lazy(() => import('../StoryBoard'));
const VideoComposition = lazy(() => import('../VideoComposition'));

// ==================== 类型定义 ====================

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
  content?: string;
}

interface ComicDramaWorkbenchProps {
  projectId: number;
  activeTab: string;
}

// ==================== 加载占位组件 ====================

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[300px]">
    <Spinner size="lg" color="primary" />
  </div>
);

// ==================== 剧本面板组件 ====================

interface ScriptPanelProps {
  projectId: number;
  scripts: Script[];
  currentScriptId: number | null;
  currentEpisode: number;
  onScriptChange: (scriptId: number, episode: number) => void;
  onScriptsUpdate: () => void;
}

const ScriptPanel: React.FC<ScriptPanelProps> = ({
  projectId,
  scripts,
  currentScriptId,
  currentEpisode,
  onScriptChange,
  onScriptsUpdate,
}) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  // 加载剧本内容
  useEffect(() => {
    if (!currentScriptId) return;
    
    const loadScript = async () => {
      setLoading(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/scripts/${currentScriptId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setContent(data.script?.content || data.content || '');
        }
      } catch (error) {
        console.error('加载剧本失败:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadScript();
  }, [currentScriptId]);

  return (
    <div className="h-full flex flex-col">
      {/* 集数选择器 */}
      <div className="p-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {'选择集数'}
          </span>
          <select
            value={currentEpisode}
            onChange={(e) => {
              const episode = Number(e.target.value);
              const script = scripts.find(s => s.episode_number === episode);
              if (script) {
                onScriptChange(script.id, episode);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)]"
          >
            {scripts.map((script) => (
              <option key={script.id} value={script.episode_number}>
                第 {script.episode_number} 集 - {script.title || '未命名'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 剧本内容 */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <LoadingFallback />
        ) : (
          <div className="prose prose-invert max-w-none">
            {content ? (
              <pre className="whitespace-pre-wrap text-sm text-[var(--text-primary)] font-sans">
                {content}
              </pre>
            ) : (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <p>{'暂无剧本内容'}</p>
                <p className="text-sm mt-2">{'使用AI生成剧本或手动编写'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const ComicDramaWorkbench: React.FC<ComicDramaWorkbenchProps> = ({ projectId, activeTab }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  
  // 项目和剧本状态
  const [project, setProject] = useState<Project | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // AI 模型配置
  const { models, selected, isConfigured } = useAIModels(projectId);
  
  // 加载项目和剧本数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // 加载项目
        const projectData = await fetchProject(projectId);
        setProject(projectData);
        
        // 加载剧本列表
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${projectId}/scripts`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (res.ok) {
          const data = await res.json();
          const scriptList = data.scripts || [];
          setScripts(scriptList);
          
          // 设置第一个剧本为当前剧本
          if (scriptList.length > 0) {
            setCurrentScriptId(scriptList[0].id);
            setCurrentEpisode(scriptList[0].episode_number);
          }
        }
      } catch (error) {
        console.error('加载数据失败:', error);
        showToast('加载数据失败', 'error');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [projectId, showToast]);
  
  // 处理剧本切换
  const handleScriptChange = useCallback((scriptId: number, episode: number) => {
    setCurrentScriptId(scriptId);
    setCurrentEpisode(episode);
  }, []);
  
  // 刷新剧本列表
  const refreshScripts = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/projects/${projectId}/scripts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (res.ok) {
        const data = await res.json();
        setScripts(data.scripts || []);
      }
    } catch (error) {
      console.error('刷新剧本失败:', error);
    }
  }, [projectId]);
  
  // 加载中状态
  if (loading) {
    return <LoadingFallback />;
  }
  
  // 根据 activeTab 渲染不同的工作台内容
  const renderContent = () => {
    switch (activeTab) {
      case 'script':
        return (
          <PanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={50} minSize={30}>
              <ScriptPanel
                projectId={projectId}
                scripts={scripts}
                currentScriptId={currentScriptId}
                currentEpisode={currentEpisode}
                onScriptChange={handleScriptChange}
                onScriptsUpdate={refreshScripts}
              />
            </ResizablePanel>
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
                <p>剧本预览区域</p>
              </div>
            </ResizablePanel>
          </PanelGroup>
        );
        
      case 'storyboard':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <StoryBoard
              scriptId={currentScriptId}
              projectId={projectId}
              episodeNumber={currentEpisode}
              scripts={scripts}
              models={models}
              textModel={selected.text || ''}
              imageModel={selected.image || ''}
              videoModel={selected.video || ''}
              onEpisodeChange={handleScriptChange}
            />
          </Suspense>
        );
        
      case 'composition':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <VideoComposition
              projectId={projectId}
              projectName={project?.name}
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

export default ComicDramaWorkbench;
