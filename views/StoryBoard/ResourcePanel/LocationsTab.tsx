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
}

const LocationsTab: React.FC<LocationsTabProps> = ({ scenes, activeSceneIds, onPreview, onGenerateImage }) => {
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>全部场景 ({scenes.length})</span>
        <Button size="sm" variant="light" style={{ color: 'var(--text-muted)' }} startContent={<Plus className="w-3 h-3" />}>
          添加
        </Button>
      </div>
      {scenes.map((scene) => {
        const isGenerating = activeSceneIds.includes(String(scene.id));
        const hasImage = !!scene.image_url;
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
            {/* 缩略图区域 */}
            {hasImage ? (
              <div
                className="relative w-full h-32 rounded-lg overflow-hidden mb-3 group cursor-pointer"
                onClick={() => setPreviewImage({ url: scene.image_url!, name: scene.name })}
              >
                <img
                  src={scene.image_url!}
                  alt={scene.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
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
                    setPreviewImage({ url: scene.image_url!, name: scene.name });
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
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LocationsTab;
