import React, { useState, useEffect } from 'react';
import { Card, CardBody, Chip, Button, Image } from '@heroui/react';
import { Sparkles, Loader2, ZoomIn, Shirt, Trash2, ExternalLink } from 'lucide-react';
import type { Costume } from '../../../services/costumes';

interface CostumesTabProps {
  costumes: Costume[];
  isLoading?: boolean;
  imageModel?: string;
  textModel?: string;
  onGenerateViews?: (costume: Costume) => void;
  /** 右键删除回调 */
  onDelete?: (costume: Costume) => void;
}

const genderLabelMap: Record<string, string> = {
  male: '男装',
  female: '女装',
  unisex: '通用',
};

const genderColorMap: Record<string, string> = {
  male: 'bg-blue-500/10 text-blue-300',
  female: 'bg-pink-500/10 text-pink-300',
  unisex: 'bg-purple-500/10 text-purple-300',
};

const openAssetEditTab = (costume: Costume) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'costume',
      assetId: costume.id,
      assetName: costume.name,
      initialData: costume,
    }
  }));
};

const STATUS_TEXT: Record<string, string> = {
  pending: '待生成',
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

const CostumesTab: React.FC<CostumesTabProps> = ({
  costumes,
  isLoading,
  imageModel,
  textModel,
  onGenerateViews,
  onDelete,
}) => {
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; costume: Costume } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, costume: Costume) => {
    e.preventDefault();
    if (!onDelete) return;
    setContextMenu({ x: e.clientX, y: e.clientY, costume });
  };

  const handleGenerate = async (costume: Costume) => {
    if (!onGenerateViews) return;
    setGeneratingIds(prev => new Set(prev).add(costume.id));
    try {
      await onGenerateViews(costume);
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(costume.id);
        return next;
      });
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部服装 ({costumes.length})
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mb-2" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : costumes.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">👔</span>
          <p className="text-sm">暂无任何服装</p>
          <p className="text-xs mt-1">请先到资产管理中创建服装</p>
        </div>
      ) : (
        costumes.map((costume) => {
          const isGenerating = generatingIds.has(costume.id) || costume.generation_status === 'generating';
          const statusText = STATUS_TEXT[costume.generation_status || 'pending'] || costume.generation_status;
          const statusClass = STATUS_CLASS[costume.generation_status || 'pending'] || 'bg-slate-600/30 text-slate-300';
          const hasImage = !!costume.image_url;

          return (
            <Card
              key={costume.id}
              className="border transition-colors hover:border-pink-500/30 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              onDoubleClick={() => openAssetEditTab(costume)}
              onContextMenu={(e) => handleContextMenu(e, costume)}
              isPressable
            >
              <CardBody className="p-3">
                <div className="flex items-start gap-3 h-[88px]">
                  {/* 图片缩略图 */}
                  <div className="shrink-0 relative">
                    {hasImage ? (
                      <div className="relative group">
                        <Image
                          src={costume.image_url}
                          alt={costume.name}
                          removeWrapper
                          className="w-14 h-14 object-cover rounded-lg border border-slate-700/50 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAssetEditTab(costume);
                          }}
                        />
                        <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <ZoomIn className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-slate-600 flex items-center justify-center bg-slate-800/40">
                        <Shirt className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {costume.name}
                    </p>
                    {costume.description && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                        {costume.description}
                      </p>
                    )}

                    {/* 属性标签 */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {costume.category && (
                        <Chip size="sm" variant="flat" className="bg-rose-500/10 text-rose-300 h-5 text-[10px]">
                          {costume.category}
                        </Chip>
                      )}
                      {costume.gender && (
                        <Chip size="sm" variant="flat" className={`${genderColorMap[costume.gender] || 'bg-slate-500/10 text-slate-300'} h-5 text-[10px]`}>
                          {genderLabelMap[costume.gender] || costume.gender}
                        </Chip>
                      )}
                      <Chip size="sm" variant="flat" className={`h-5 text-[10px] ${statusClass}`}>
                        {statusText}
                      </Chip>
                    </div>

                    {/* 生成按钮 */}
                    <div className="flex gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="flat"
                        className="h-6 min-w-0 px-2 text-[10px] bg-pink-500/10 text-pink-400 hover:bg-pink-500/20"
                        startContent={isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        isDisabled={!imageModel || isGenerating}
                        onPress={() => handleGenerate(costume)}
                      >
                        {hasImage ? '重新生成' : '生成设定图'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-(--bg-card) border border-(--border-color) rounded-lg shadow-xl py-1.5 min-w-[180px] select-none"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 打开 */}
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-(--text-primary) hover:bg-(--accent)/10 flex items-center gap-2.5 transition-colors"
            onClick={() => {
              openAssetEditTab(contextMenu.costume);
              setContextMenu(null);
            }}
          >
            <ExternalLink className="w-4 h-4 text-pink-400" />
            打开详情
          </button>

          {/* 分割线 */}
          {onDelete && <div className="my-1 border-t border-(--border-color)" />}

          {/* 删除 */}
          {onDelete && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                onDelete(contextMenu.costume);
                setContextMenu(null);
              }}
            >
              <Trash2 className="w-4 h-4" />
              删除服装
            </button>
          )}

          {/* 底部快捷栏 */}
          <div className="mt-1.5 pt-1.5 border-t border-(--border-color) px-2 pb-1">
            <div className="flex items-center justify-around">
              <button
                className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-(--accent)/10 transition-colors"
                onClick={() => { openAssetEditTab(contextMenu.costume); setContextMenu(null); }}
                title="打开"
              >
                <ExternalLink className="w-4 h-4 text-pink-400" />
                <span className="text-[10px] text-(--text-muted)">打开</span>
              </button>
              {onDelete && (
                <button
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-red-500/10 transition-colors"
                  onClick={() => { onDelete(contextMenu.costume); setContextMenu(null); }}
                  title="删除"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span className="text-[10px] text-red-400">删除</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostumesTab;
