import React, { useState } from 'react';
import { Card, CardBody, Chip, Button, Image, Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/react';
import { Sparkles, Loader2, ZoomIn, Shirt } from 'lucide-react';
import type { Costume } from '../../../services/costumes';

interface CostumesTabProps {
  costumes: Costume[];
  isLoading?: boolean;
  imageModel?: string;
  textModel?: string;
  onGenerateViews?: (costume: Costume) => void;
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
}) => {
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

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
                          className="w-14 h-14 object-cover rounded-lg border border-slate-700/50 cursor-zoom-in"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage({ url: costume.image_url, name: costume.name });
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


      {/* 图片预览弹窗 */}
      <Modal isOpen={!!previewImage} onOpenChange={() => setPreviewImage(null)} size="xl">
        <ModalContent className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50">
          <ModalHeader className="text-slate-100 font-bold">
            {previewImage?.name}
          </ModalHeader>
          <ModalBody className="p-2 flex items-center justify-center">
            {previewImage?.url && (
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default CostumesTab;
