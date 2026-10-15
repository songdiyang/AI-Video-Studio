/**
 * 世界观编辑器组件
 * 编辑世界观、AI生成世界观
 */

import React, { useState, useEffect } from 'react';
import { Button, Textarea, Input, Card, CardBody, Progress } from '@heroui/react';
import { Wand2, Save, Globe, BookOpen, Sparkles } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { getAuthToken } from '../../../services/auth';
import { AIModel } from '../../../components/AIModelSelector';

// ==================== 类型定义 ====================

interface WorldViewEditorProps {
  projectId: number;
  models: AIModel[];
  textModel: string;
}

interface NovelProject {
  id: number;
  project_id: number;
  world_view?: string;
  plot_summary?: string;
  genre?: string;
  target_word_count?: number;
  stats?: {
    total_chapters: number;
    total_words: number;
  };
}

// ==================== 主组件 ====================

const WorldViewEditor: React.FC<WorldViewEditorProps> = ({ 
  projectId, 
  models, 
  textModel 
}) => {
  const { showToast } = useToast();
  const [project, setProject] = useState<NovelProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // 表单数据
  const [formData, setFormData] = useState({
    world_view: '',
    plot_summary: '',
    genre: '',
    target_word_count: 100000,
  });

  // 加载项目数据
  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setFormData({
          world_view: data.world_view || '',
          plot_summary: data.plot_summary || '',
          genre: data.genre || '',
          target_word_count: data.target_word_count || 100000,
        });
      }
    } catch (error) {
      console.error('加载项目失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 保存项目配置
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast('保存成功', 'success');
      } else {
        throw new Error('保存失败');
      }
    } catch (error: any) {
      showToast(error.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // AI生成世界观
  const handleGenerateWorldView = async () => {
    setGenerating(true);
    setProgress(10);
    
    try {
      const token = getAuthToken();
      
      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 80));
      }, 1000);

      const res = await fetch(`/api/novels/${projectId}/worldview/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          modelName: textModel,
          description: formData.plot_summary,
          genre: formData.genre,
        }),
      });

      clearInterval(progressInterval);
      setProgress(90);

      if (res.ok) {
        const data = await res.json();
        setFormData(prev => ({ ...prev, world_view: data.world_view }));
        setProgress(100);
        showToast('世界观生成成功', 'success');
      } else {
        const error = await res.json();
        throw new Error(error.message || '生成失败');
      }
    } catch (error: any) {
      showToast(error.message || '生成失败', 'error');
    } finally {
      setTimeout(() => {
        setGenerating(false);
        setProgress(0);
      }, 500);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-nav)]">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-primary)]">世界观与设定</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="flat"
            startContent={<Wand2 className="w-4 h-4" />}
            isLoading={generating}
            onPress={handleGenerateWorldView}
          >
            AI生成世界观
          </Button>
          <Button
            color="primary"
            startContent={<Save className="w-4 h-4" />}
            isLoading={saving}
            onPress={handleSave}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 生成进度 */}
      {generating && (
        <div className="px-4 py-2 bg-[var(--bg-card)] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-[var(--accent)] animate-pulse" />
            <span className="text-sm text-[var(--text-secondary)]">AI正在生成世界观...</span>
          </div>
          <Progress value={progress} className="mt-2" size="sm" color="primary" />
        </div>
      )}

      {/* 编辑区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 基本信息卡片 */}
          <Card className="bg-[var(--bg-card)] border-[var(--border-color)]">
            <CardBody className="space-y-4">
              <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[var(--accent)]" />
                基本信息
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="小说类型"
                  placeholder="如：玄幻、都市、科幻、历史..."
                  value={formData.genre}
                  onValueChange={(val) => setFormData({ ...formData, genre: val })}
                />
                <Input
                  label="目标字数"
                  type="number"
                  placeholder="100000"
                  value={formData.target_word_count.toString()}
                  onValueChange={(val) => setFormData({ ...formData, target_word_count: parseInt(val) || 0 })}
                  endContent={<span className="text-sm text-[var(--text-muted)]">字</span>}
                />
              </div>

              <Textarea
                label="剧情概要"
                placeholder="简要描述小说的主要剧情走向..."
                value={formData.plot_summary}
                onValueChange={(val) => setFormData({ ...formData, plot_summary: val })}
                minRows={3}
              />
            </CardBody>
          </Card>

          {/* 世界观卡片 */}
          <Card className="bg-[var(--bg-card)] border-[var(--border-color)]">
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[var(--accent)]" />
                  世界观设定
                </h3>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Wand2 className="w-4 h-4" />}
                  isLoading={generating}
                  onPress={handleGenerateWorldView}
                >
                  重新生成
                </Button>
              </div>

              <Textarea
                placeholder="详细描述小说的世界观，包括时代背景、地理环境、社会结构、文化习俗、特殊设定等..."
                value={formData.world_view}
                onValueChange={(val) => setFormData({ ...formData, world_view: val })}
                minRows={15}
                classNames={{
                  input: "font-mono text-sm leading-relaxed",
                }}
              />

              <div className="text-xs text-[var(--text-muted)]">
                提示：可以使用Markdown格式编辑。点击"AI生成世界观"按钮，系统将根据小说类型和剧情概要自动生成世界观设定。
              </div>
            </CardBody>
          </Card>

          {/* 统计信息 */}
          {project?.stats && (
            <Card className="bg-[var(--bg-card)] border-[var(--border-color)]">
              <CardBody>
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">项目统计</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-[var(--bg-input)] rounded-lg">
                    <div className="text-2xl font-bold text-[var(--accent)]">{project.stats.total_chapters || 0}</div>
                    <div className="text-xs text-[var(--text-muted)]">总章节</div>
                  </div>
                  <div className="text-center p-3 bg-[var(--bg-input)] rounded-lg">
                    <div className="text-2xl font-bold text-[var(--accent)]">{(project.stats.total_words || 0).toLocaleString()}</div>
                    <div className="text-xs text-[var(--text-muted)]">总字数</div>
                  </div>
                  <div className="text-center p-3 bg-[var(--bg-input)] rounded-lg">
                    <div className="text-2xl font-bold text-[var(--accent)]">
                      {formData.target_word_count > 0 
                        ? Math.round(((project.stats.total_words || 0) / formData.target_word_count) * 100) 
                        : 0}%
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">完成度</div>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorldViewEditor;
