import React, { useState } from 'react';
import { Card, CardBody, Chip, Image, Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/react';
import { ZoomIn, Globe } from 'lucide-react';
import type { Environment } from '../../../services/environments';

interface EnvironmentsTabProps {
  environments: Environment[];
  isLoading?: boolean;
}

const openAssetEditTab = (env: Environment) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'environment',
      assetId: env.id,
      assetName: env.name,
      initialData: {
        id: env.id,
        name: env.name,
        description: env.description || '',
        timeOfDay: env.time_of_day || '',
        weather: env.weather || '',
        lighting: env.lighting || '',
        mood: env.mood || '',
        terrainType: env.terrain_type || '',
        project_id: env.project_id,
        image_url: env.image_url,
        image_back_url: env.image_back_url,
        generation_status: env.generation_status,
      },
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

const EnvironmentsTab: React.FC<EnvironmentsTabProps> = ({
  environments,
  isLoading,
}) => {
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部环境 ({environments.length})
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500 mb-2" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : environments.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">🌍</span>
          <p className="text-sm">暂无任何环境</p>
          <p className="text-xs mt-1">请先到资产管理中创建环境</p>
        </div>
      ) : (
        environments.map((env) => {
          const statusText = STATUS_TEXT[env.generation_status] || env.generation_status;
          const statusClass = STATUS_CLASS[env.generation_status] || 'bg-slate-600/30 text-slate-300';
          const hasFront = !!env.image_url;
          const hasBack = !!env.image_back_url;

          return (
            <Card
              key={env.id}
              className="border transition-colors hover:border-sky-500/30 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              onDoubleClick={() => openAssetEditTab(env)}
              isPressable
            >
              <CardBody className="p-3">
                <div className="flex items-start gap-3 h-[88px]">
                  {/* 图片缩略图 */}
                  <div className="shrink-0 relative">
                    {env.image_url ? (
                      <div className="relative group">
                        <Image
                          src={env.image_url}
                          alt={env.name}
                          removeWrapper
                          className="w-14 h-14 object-cover rounded-lg border border-slate-700/50 cursor-zoom-in"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage({ url: env.image_url!, name: env.name });
                          }}
                        />
                        {hasBack && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-sky-500/80 rounded-full flex items-center justify-center">
                            <span className="text-[8px] text-white font-bold">B</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <ZoomIn className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-slate-600 flex items-center justify-center bg-slate-800/40">
                        <Globe className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {env.name}
                    </p>
                    {env.description && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                        {env.description}
                      </p>
                    )}

                    {/* 属性标签 */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {env.time_of_day && (
                        <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-300 h-5 text-[10px]">
                          {env.time_of_day}
                        </Chip>
                      )}
                      {env.weather && (
                        <Chip size="sm" variant="flat" className="bg-sky-500/10 text-sky-300 h-5 text-[10px]">
                          {env.weather}
                        </Chip>
                      )}
                      {env.lighting && (
                        <Chip size="sm" variant="flat" className="bg-yellow-500/10 text-yellow-300 h-5 text-[10px]">
                          {env.lighting}
                        </Chip>
                      )}
                      {env.mood && (
                        <Chip size="sm" variant="flat" className="bg-purple-500/10 text-purple-300 h-5 text-[10px]">
                          {env.mood}
                        </Chip>
                      )}
                      <Chip size="sm" variant="flat" className={`h-5 text-[10px] ${statusClass}`}>
                        {statusText}
                      </Chip>
                    </div>

                    {/* 提示：双击打开编辑 */}
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                      双击卡片在右侧编辑
                    </p>
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

export default EnvironmentsTab;
