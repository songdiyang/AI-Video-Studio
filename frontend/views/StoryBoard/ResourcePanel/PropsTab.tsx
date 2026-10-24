import React, { useState, useEffect } from 'react';
import { Card, CardBody, Tooltip } from '@heroui/react';
import { Wand2, X, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { PropItem } from './types';

const openAssetEditTab = (prop: PropItem) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'prop',
      assetId: prop.id,
      assetName: prop.name,
      initialData: prop,
    }
  }));
};

interface PropsTabProps {
  props: PropItem[];
  imageModel?: string;
  imageAspectRatio?: string;
  /** 右键删除回调 */
  onDelete?: (prop: PropItem) => void;
}

/** 道具资源行（无头像单行紧凑）：与角色行同一套密度与交互语言。 */
const PropsTab: React.FC<PropsTabProps> = ({ props, imageModel, imageAspectRatio, onDelete }) => {
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; prop: PropItem } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, prop: PropItem) => {
    e.preventDefault();
    if (!onDelete) return;
    setContextMenu({ x: e.clientX, y: e.clientY, prop });
  };

  const handleGenerate = async (prop: PropItem) => {
    if (!prop.id || generatingIds.has(prop.id)) return;

    setGeneratingIds(prev => new Set(prev).add(prop.id));
    try {
      const response = await fetch(`/api/props/${prop.id}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageModel: imageModel || undefined,
          aspectRatio: imageAspectRatio || undefined,
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '启动生成失败');
      }

      // 广播事件通知刷新
      window.dispatchEvent(new CustomEvent('prop:generationStarted', {
        detail: { propId: prop.id }
      }));
    } catch (error: any) {
      console.error('[PropsTab] 生成失败:', error);
      alert('生成失败: ' + error.message);
      // 失败后从本地 generatingIds 中移除
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(prop.id);
        return next;
      });
    }
  };

  const handleCancel = async (prop: PropItem) => {
    if (!prop.id) return;
    try {
      const response = await fetch(`/api/props/${prop.id}/cancel-generation`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '取消失败');
      }
      // 广播事件通知刷新
      window.dispatchEvent(new CustomEvent('prop:generationCancelled', {
        detail: { propId: prop.id }
      }));
    } catch (error: any) {
      console.error('[PropsTab] 取消失败:', error);
      alert('取消失败: ' + error.message);
    }
  };

  const isGenerating = (prop: PropItem) =>
    generatingIds.has(prop.id) || prop.generation_status === 'generating';

  return (
    <div className="space-y-1">
      {props.map((prop) => {
        const generating = isGenerating(prop);
        const completed = prop.generation_status === 'completed';
        const failed = prop.generation_status === 'failed';
        return (
          <Card
            key={`${prop.id}-${prop.name}`}
            className="group w-full rounded-lg border border-(--border-color) bg-(--bg-card) shadow-none transition-colors hover:border-(--accent)/30 hover:bg-(--bg-card-hover)"
            onDoubleClick={() => openAssetEditTab(prop)}
            onContextMenu={(e) => handleContextMenu(e, prop)}
          >
            <CardBody className="px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <h4 className="min-w-0 truncate text-[13px] font-semibold text-(--text-primary)">{prop.name}</h4>
                {prop.prop_type && (
                  <span className="shrink-0 text-[10px] text-(--text-muted)">
                    {prop.prop_type === 'permanent' ? '永久' : '交互'}
                  </span>
                )}
                {generating ? (
                  <Tooltip content="道具图生成中">
                    <span className="shrink-0 inline-flex">
                      <Loader2 className="h-3 w-3 animate-spin text-(--accent)" />
                    </span>
                  </Tooltip>
                ) : completed ? (
                  <Tooltip content="道具图已生成">
                    <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                  </Tooltip>
                ) : failed ? (
                  <Tooltip content="上次生成失败，可重试">
                    <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-red-400/80" />
                  </Tooltip>
                ) : null}
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  {prop.id > 0 && !completed && (
                    generating ? (
                      <Tooltip content="取消生成">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleCancel(prop); }}
                          className="rounded p-1 text-(--text-muted) transition-colors duration-150 hover:bg-white/5 hover:text-red-400 active:bg-white/10"
                          title="取消生成"
                          aria-label="取消生成"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    ) : (
                      <Tooltip content="生成道具图">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleGenerate(prop); }}
                          className="rounded p-1 text-(--text-muted) opacity-0 transition-opacity duration-150 hover:bg-white/5 hover:text-(--text-primary) active:bg-white/10 group-hover:opacity-100 focus-visible:opacity-100"
                          title="生成道具图"
                          aria-label="生成道具图"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    )
                  )}
                </div>
              </div>
            </CardBody>
          </Card>
        );
      })}
      {props.length === 0 && (
        <div className="text-center py-6 text-(--text-muted)">
          <p className="text-xs">暂无道具</p>
          <p className="text-[10px] mt-1 opacity-70">在资产库中手动创建道具</p>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[var(--bg-nav)] border border-[var(--border-color)] rounded-lg shadow-lg py-1 min-w-[140px] select-none"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-(--text-primary) hover:bg-white/5 transition-colors"
            onClick={() => {
              openAssetEditTab(contextMenu.prop);
              setContextMenu(null);
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 text-(--text-muted)" />
            打开详情
          </button>

          {onDelete && (
            <>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={() => {
                  onDelete(contextMenu.prop);
                  setContextMenu(null);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除道具
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PropsTab;
