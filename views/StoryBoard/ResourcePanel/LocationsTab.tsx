import React, { useState } from 'react';
import { Card, CardBody, Button } from '@heroui/react';
import { Plus, Image, Eye, Loader2, X, ZoomIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResourceItem } from './types';
import { Scene } from './useSceneData';

interface LocationsTabProps {
  scenes: Scene[];
  activeSceneIds: string[];
  onPreview: (resource: ResourceItem) => void;
  onGenerateImage: (scene: Scene) => void;
  onCreate?: () => void;
}

const LocationsTab: React.FC<LocationsTabProps> = ({ scenes, activeSceneIds, onPreview, onGenerateImage, onCreate }) => {
  const [previewImage, setPreviewImage] = useState<{ url: string; reverseUrl?: string; name: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>全部场景 ({scenes.length})</span>
        <Button
          size="sm"
          variant="light"
          style={{ color: 'var(--text-muted)' }}
          startContent={<Plus className="w-3 h-3" />}
          onPress={onCreate}
          isDisabled={!onCreate}
        >
          新建
        </Button>
      </div>
      {scenes.length === 0 && (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">📍</span>
          <p className="text-sm">暂无场景</p>
          <p className="text-xs mt-1">生成分镜后自动提取，或点击右上角"新建"手动添加</p>
        </div>
      )}
      {scenes.map((scene) => {
        const isGenerating = activeSceneIds.includes(String(scene.id));
        const hasImage = !!scene.image_url;
        const hasReverseImage = !!scene.reverse_image_url;
        return (
        <Card
          key={scene.id}
          className="border transition-colors cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <CardBody className="p-3">
            {/* 缩略图区域 - A面和B面 */}
            {hasImage ? (
              <div className="flex gap-2 mb-3">
                {/* A面图片 */}
                <div
                  className="relative flex-1 h-32 rounded-lg overflow-hidden group cursor-pointer"
                  onClick={() => setPreviewImage({ url: scene.image_url!, reverseUrl: scene.reverse_image_url || undefined, name: scene.name })}
                >
                  <img
                    src={scene.image_url!}
                    alt={`${scene.name} A面`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">A面</span>
                </div>
                {/* B面图片 */}
                {hasReverseImage ? (
                  <div
                    className="relative flex-1 h-32 rounded-lg overflow-hidden group cursor-pointer"
                    onClick={() => setPreviewImage({ url: scene.image_url!, reverseUrl: scene.reverse_image_url!, name: scene.name })}
                  >
                    <img
                      src={scene.reverse_image_url!}
                      alt={`${scene.name} B面`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">B面</span>
                  </div>
                ) : (
                  <div
                    className="relative flex-1 h-32 rounded-lg overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>B面未生成</span>
                  </div>
                )}
              </div>
            ) : isGenerating ? (
              <div
                className="w-full h-24 rounded-lg mb-3 flex flex-col items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>场景图生成中...</span>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded flex items-center justify-center border shrink-0"
                style={{
                  backgroundColor: hasImage ? 'var(--success-bg, rgba(34,197,94,0.1))' : 'rgba(168,85,247,0.1)',
                  borderColor: hasImage ? 'rgba(34,197,94,0.2)' : 'rgba(168,85,247,0.2)',
                }}
              >
                <span className="text-base">{hasImage ? '✅' : '📍'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{scene.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {isGenerating ? '场景图生成中...' : hasImage ? '已生成场景图' : '点击生成场景图'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <Button
                size="sm"
                variant="flat"
                className="flex-1 text-xs font-medium"
                style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: 'rgb(168,85,247)' }}
                startContent={isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />}
                onPress={() => onGenerateImage(scene)}
                isDisabled={isGenerating}
              >
                {isGenerating ? '生成中...' : hasImage ? '重新生成' : '生成图'}
              </Button>
              <Button
                size="sm"
                variant="flat"
                className="flex-1 text-xs font-medium"
                style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'rgb(59,130,246)' }}
                startContent={<Eye className="w-3 h-3" />}
                onPress={() => {
                  if (hasImage) {
                    setPreviewImage({ url: scene.image_url!, reverseUrl: scene.reverse_image_url || undefined, name: scene.name });
                  } else {
                    onPreview({ name: scene.name });
                  }
                }}
              >
                预览
              </Button>
            </div>
          </CardBody>
        </Card>
      )})}

      {/* 图片预览 Lightbox */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between w-full mb-3 px-1">
                <span className="text-sm font-medium text-white/90">{previewImage.name}</span>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className={`flex ${previewImage.reverseUrl ? 'gap-4' : ''}`}>
                <div className="flex flex-col items-center">
                  <img
                    src={previewImage.url}
                    alt={`${previewImage.name} A面`}
                    className="max-w-full max-h-[75vh] rounded-lg shadow-2xl object-contain"
                  />
                  {previewImage.reverseUrl && (
                    <span className="mt-2 text-xs text-white/70 bg-white/10 px-2 py-0.5 rounded">A面（正打）</span>
                  )}
                </div>
                {previewImage.reverseUrl && (
                  <div className="flex flex-col items-center">
                    <img
                      src={previewImage.reverseUrl}
                      alt={`${previewImage.name} B面`}
                      className="max-w-full max-h-[75vh] rounded-lg shadow-2xl object-contain"
                    />
                    <span className="mt-2 text-xs text-white/70 bg-white/10 px-2 py-0.5 rounded">B面（反打）</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LocationsTab;
