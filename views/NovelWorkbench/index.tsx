/**
 * 小说工作台
 * 包含大纲规划、章节管理、文本编辑三个功能模块
 */

import React, { useState, useEffect, useCallback, Suspense, lazy, useMemo } from 'react';
import { Spinner } from '@heroui/react';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAuthToken } from '../../services/auth';
import { Project, fetchProject } from '../../services/projects';
import { NovelChapter, NovelOutline } from '../../types/projectTypes';
import { useAIModels } from '../../hooks/useAIModels';

// 懒加载子组件
const OutlinePlanner = lazy(() => import('./OutlinePlanner'));
const ChapterManager = lazy(() => import('./ChapterManager'));
const TextEditor = lazy(() => import('./TextEditor'));

// ==================== 类型定义 ====================

interface NovelWorkbenchProps {
  projectId: number;
  activeTab: string;
}

// ==================== 加载占位组件 ====================

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[300px]">
    <Spinner size="lg" color="primary" />
  </div>
);

// ==================== 主组件 ====================

const NovelWorkbench: React.FC<NovelWorkbenchProps> = ({ projectId, activeTab }) => {
  const { showToast } = useToast();
  
  // 状态
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<NovelChapter[]>([]);
  const [outlines, setOutlines] = useState<NovelOutline[]>([]);
  const [currentChapterId, setCurrentChapterId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  // AI 模型配置（对齐漫剧工作台模式）
  const { models, selected, isConfigured, loading: modelsLoading } = useAIModels(projectId);

  // 加载项目数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const projectData = await fetchProject(projectId);
        setProject(projectData);
        
        const token = getAuthToken();
        
        // 加载章节列表
        const chaptersRes = await fetch(`/api/projects/${projectId}/novel/chapters`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (chaptersRes.ok) {
          const data = await chaptersRes.json();
          const chapterList = data.chapters || [];
          setChapters(chapterList);
          if (chapterList.length > 0) {
            setCurrentChapterId(chapterList[0].id);
          }
        }
        
        // 加载大纲
        const outlinesRes = await fetch(`/api/projects/${projectId}/novel/outlines`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (outlinesRes.ok) {
          const data = await outlinesRes.json();
          setOutlines(data.outlines || []);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId]);

  // 刷新章节
  const refreshChapters = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/projects/${projectId}/novel/chapters`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setChapters(data.chapters || []);
      }
    } catch (error) {
      console.error('刷新章节失败:', error);
    }
  }, [projectId]);

  // 刷新大纲
  const refreshOutlines = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/projects/${projectId}/novel/outlines`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setOutlines(data.outlines || []);
      }
    } catch (error) {
      console.error('刷新大纲失败:', error);
    }
  }, [projectId]);

  // 选择章节
  const handleSelectChapter = useCallback((chapterId: number) => {
    setCurrentChapterId(chapterId);
  }, []);

  // 加载中
  if (loading && !project) {
    return <LoadingFallback />;
  }

  // 获取当前章节
  const currentChapter = chapters.find(c => c.id === currentChapterId);

  // 根据 activeTab 渲染不同的工作台内容
  const renderContent = () => {
    switch (activeTab) {
      case 'outline':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <OutlinePlanner
              projectId={projectId}
              outlines={outlines}
              onOutlinesChange={setOutlines}
              onRefresh={refreshOutlines}
              models={models}
              textModel={selected.text || ''}
            />
          </Suspense>
        );
        
      case 'chapters':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ChapterManager
              projectId={projectId}
              chapters={chapters}
              currentChapterId={currentChapterId}
              onChaptersChange={setChapters}
              onSelectChapter={handleSelectChapter}
              onRefresh={refreshChapters}
              models={models}
              textModel={selected.text || ''}
            />
          </Suspense>
        );
        
      case 'editor':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <TextEditor
              projectId={projectId}
              chapter={currentChapter}
              chapters={chapters}
              onChapterChange={handleSelectChapter}
              onSave={refreshChapters}
              models={models}
              textModel={selected.text || ''}
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

export default NovelWorkbench;
