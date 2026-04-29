import React, { useEffect, useState, useCallback } from 'react';
import { Button, Chip, Image, Spinner } from '@heroui/react';
import { Sparkles, Image as ImageIcon, Trash2, RefreshCw, Hammer, Mountain, Layers } from 'lucide-react';
import {
  listSceneElementLinks,
  removeSceneElementLink,
  extractSceneElements,
  generateSceneElementImage,
  SceneElementLink,
} from '../../../services/sceneElements';

interface SceneElementsPanelProps {
  sceneId: number;
  imageModel?: string;
  textModel?: string;
  /** 刷新场景数据（比如父组件需要同步任务栏等） */
  onDataChanged?: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  pending: '未生成',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-slate-600/30 text-slate-300',
  generating: 'bg-blue-500/10 text-blue-300',
  completed: 'bg-emerald-500/10 text-emerald-300',
  failed: 'bg-red-500/10 text-red-300',
};

const SceneElementsPanel: React.FC<SceneElementsPanelProps> = ({
  sceneId,
  imageModel,
  textModel,
  onDataChanged,
}) => {
  const [links, setLinks] = useState<SceneElementLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>('');

  const load = useCallback(async () => {
    if (!sceneId) return;
    setLoading(true);
    setError('');
    try {
      const data = await listSceneElementLinks(sceneId);
      setLinks(data);
    } catch (err: any) {
      setError(err?.message || '加载场景元素失败');
    } finally {
      setLoading(false);
    }
  }, [sceneId]);

  useEffect(() => {
    load();
    // 有生成中任务时，定时轮询
    const hasActive = links.some(l => l.generation_status === 'generating');
    if (!hasActive) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, links.length]);

  const handleExtract = async () => {
    if (!textModel) {
      setError('请先选择文本模型');
      return;
    }
    setExtracting(true);
    setError('');
    try {
      await extractSceneElements(sceneId, { textModel });
      // 抽取是异步任务，等任务完成后列表会自动刷新；轻微延迟一次刷新提升体感
      setTimeout(load, 2000);
      onDataChanged?.();
    } catch (err: any) {
      setError(err?.message || '启动元素抽取失败');
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerate = async (elementId: number) => {
    if (!imageModel) {
      setError('请先选择图像模型');
      return;
    }
    setError('');
    setGeneratingIds(prev => new Set(prev).add(elementId));
    try {
      await generateSceneElementImage(elementId, { imageModel, textModel });
      onDataChanged?.();
      // 启动后立刻刷新一次，让状态变 generating
      await load();
    } catch (err: any) {
      setError(err?.message || '启动元素图片生成失败');
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(elementId);
        return next;
      });
    }
  };

  const handleGenerateAll = async () => {
    if (!imageModel) {
      setError('请先选择图像模型');
      return;
    }
    const pendingLinks = links.filter(l => l.generation_status !== 'completed' && l.generation_status !== 'generating');
    for (const l of pendingLinks) {
      await handleGenerate(l.id);
    }
  };

  const handleRemove = async (elementId: number) => {
    setError('');
    try {
      await removeSceneElementLink(sceneId, elementId);
      await load();
    } catch (err: any) {
      setError(err?.message || '解除关联失败');
    }
  };

  const total = links.length;
  const completed = links.filter(l => l.generation_status === 'completed').length;
  const hasAnyPending = links.some(l =>
    l.generation_status === 'pending' || l.generation_status === 'failed'
  );

  return (
    <div className="bg-amber-500/5 rounded-lg p-4 border border-amber-500/20">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          场景元素（影棚）
          <span className="text-xs text-slate-500 font-normal">
            {total > 0 ? `${completed}/${total} 已生成` : '尚未建立'}
          </span>
        </h4>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            startContent={extracting ? <Spinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
            isDisabled={extracting || !textModel}
            onPress={handleExtract}
          >
            {extracting ? '抽取中...' : total > 0 ? '重新抽取' : 'AI 抽取元素'}
          </Button>
          {hasAnyPending && (
            <Button
              size="sm"
              variant="flat"
              color="primary"
              startContent={<RefreshCw className="w-3.5 h-3.5" />}
              isDisabled={!imageModel || generatingIds.size > 0}
              onPress={handleGenerateAll}
            >
              一键生成全部
            </Button>
          )}
        </div>
      </div>

      {!textModel && (
        <p className="text-xs text-amber-500 mb-2">
          AI 抽取需要文本模型，请先在 AI 模型面板选择
        </p>
      )}
      {!imageModel && (
        <p className="text-xs text-amber-500 mb-2">
          生成元素图片需要图像模型，请先在 AI 模型面板选择
        </p>
      )}
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {loading && !links.length ? (
        <div className="py-6 text-center text-slate-500 text-sm">
          <Spinner size="sm" /> 加载中...
        </div>
      ) : links.length === 0 ? (
        <div className="py-6 text-center text-slate-500 text-sm border border-dashed border-slate-600/40 rounded">
          暂无元素。点击「AI 抽取元素」从场景描述中提取建筑/场景元素清单。
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {links.map((l) => {
            const CatIcon = l.category === 'building' ? Hammer : Mountain;
            const catLabel = l.category === 'building' ? '建筑' : '场景';
            const statusText = STATUS_TEXT[l.generation_status] || l.generation_status;
            const statusClass = STATUS_CLASS[l.generation_status] || 'bg-slate-600/30 text-slate-300';
            const isGenerating = l.generation_status === 'generating' || generatingIds.has(l.id);
            return (
              <div
                key={l.id}
                className="bg-slate-800/60 rounded-md border border-slate-700/50 p-2 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  {l.image_url ? (
                    <Image
                      src={l.image_url}
                      alt={l.name}
                      removeWrapper
                      className="w-14 h-14 object-cover rounded border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded border border-dashed border-slate-600 flex items-center justify-center text-slate-500 shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">{l.name}</div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <Chip
                        size="sm"
                        variant="flat"
                        startContent={<CatIcon className="w-3 h-3" />}
                        className="bg-slate-700/40 text-slate-300 text-[10px] h-5"
                      >
                        {catLabel}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="flat"
                        className={`text-[10px] h-5 ${statusClass}`}
                      >
                        {statusText}
                      </Chip>
                    </div>
                    {l.position_hint && (
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                        位置：{l.position_hint}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    className="h-6 min-w-0 px-2 text-xs flex-1"
                    startContent={isGenerating ? <Spinner size="sm" /> : <Sparkles className="w-3 h-3" />}
                    isDisabled={!imageModel || isGenerating}
                    onPress={() => handleGenerate(l.id)}
                  >
                    {l.generation_status === 'completed' ? '重新生成' : '生成'}
                  </Button>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    className="h-6 w-6 min-w-0 bg-red-500/10 text-red-400"
                    onPress={() => handleRemove(l.id)}
                    title="解除关联"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > 0 && (
        <p className="text-[11px] text-slate-500 mt-3">
          提示：生成场景全景图时，已完成的元素图片会自动作为参考图注入，保证拼接后风格与形态一致。
        </p>
      )}
    </div>
  );
};

export default SceneElementsPanel;
