import React, { useState } from 'react';
import { Card, CardBody, Button, Chip } from '@heroui/react';
import { Sparkles, Loader2, Wand2, X } from 'lucide-react';
import { PropItem } from './types';
import { getAuthToken } from '../../../services/auth';

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
  isExtracting?: boolean;
  onExtractFromScript?: () => void;
  imageModel?: string;
}

const PropsTab: React.FC<PropsTabProps> = ({ props, isExtracting, onExtractFromScript, imageModel }) => {
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());

  const handleGenerate = async (prop: PropItem) => {
    if (!prop.id || generatingIds.has(prop.id)) return;

    setGeneratingIds(prev => new Set(prev).add(prop.id));
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/props/${prop.id}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          imageModel: imageModel || undefined,
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
      const token = getAuthToken();
      const response = await fetch(`/api/props/${prop.id}/cancel-generation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
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
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-300">全部道具 ({props.length})</span>
        {onExtractFromScript && (
          <Button
            size="sm"
            variant="flat"
            className="h-7 px-2 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            startContent={isExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            onPress={onExtractFromScript}
            isDisabled={isExtracting}
          >
            {isExtracting ? '提取中...' : '从剧本提取'}
          </Button>
        )}
      </div>
      {props.map((prop) => (
        <Card key={`${prop.id}-${prop.name}`} className="bg-slate-800/60 border border-slate-700/50 hover:border-emerald-500/30 transition-colors cursor-pointer" onDoubleClick={() => openAssetEditTab(prop)}>
          <CardBody className="p-3">
            <div className="flex items-center justify-between h-[56px]">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100 truncate">{prop.name}</p>
                <div className="flex gap-1 mt-1">
                  {prop.prop_type && (
                    <Chip size="sm" variant="flat" className={prop.prop_type === 'permanent' ? 'bg-blue-500/10 text-blue-400 text-[10px]' : 'bg-cyan-500/10 text-cyan-400 text-[10px]'}>
                      {prop.prop_type === 'permanent' ? '永久' : '交互'}
                    </Chip>
                  )}
                  {prop.generation_status && (
                    <Chip size="sm" variant="flat" className={prop.generation_status === 'completed' ? 'bg-green-500/10 text-green-400 text-[10px]' : 'bg-amber-500/10 text-amber-400 text-[10px]'}>
                      {prop.generation_status === 'completed' ? '已生成' : prop.generation_status === 'generating' ? '生成中' : '待生成'}
                    </Chip>
                  )}
                </div>
              </div>
              {prop.id > 0 && prop.generation_status !== 'completed' && (
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {isGenerating(prop) ? (
                    <Button
                      size="sm"
                      variant="flat"
                      className="h-6 px-2 text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      startContent={<X className="w-3 h-3" />}
                      onPress={() => handleCancel(prop)}
                    >
                      取消
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="flat"
                      className="h-6 px-2 text-[10px] bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                      startContent={<Wand2 className="w-3 h-3" />}
                      onPress={() => handleGenerate(prop)}
                    >
                      生成
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      ))}
      {props.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <p className="text-sm">暂无道具</p>
          <p className="text-xs mt-1">分镜中添加道具或点击「从剧本提取」</p>
        </div>
      )}
    </div>
  );
};

export default PropsTab;
