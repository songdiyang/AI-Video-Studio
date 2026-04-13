import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { Layers, Wand2, ZoomIn, Palette } from 'lucide-react';
import { ResourceItem } from './types';
import { usePreview } from '../../../components/PreviewProvider';

interface CharacterViewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedResource: ResourceItem | null;
  isGenerating: boolean;
  generatedPrompts: any;
  onGenerate: (charName: string, imageModel: string, textModel: string, aspectRatio: string, characterId?: number, mode?: 'style' | 'views' | 'all') => void;
  characterId?: number;
  imageModel: string;
  textModel: string;
  imageAspectRatio: string;
}

const CharacterViewsModal: React.FC<CharacterViewsModalProps> = ({
  isOpen,
  onClose,
  selectedResource,
  isGenerating,
  generatedPrompts,
  onGenerate,
  characterId,
  imageModel,
  textModel,
  imageAspectRatio
}) => {

  const { openPreview } = usePreview();

  // 构建三视图 slides
  const openViewPreview = (startIndex: number) => {
    const slides: { src: string; alt?: string }[] = [];
    const views = [
      { url: selectedResource?.frontViewUrl, label: '正面视图' },
      { url: selectedResource?.sideViewUrl, label: '侧面视图' },
      { url: selectedResource?.backViewUrl, label: '背面视图' },
    ];
    views.forEach(v => {
      if (v.url) slides.push({ src: v.url, alt: v.label });
    });
    if (slides.length > 0) {
      openPreview(slides, Math.min(startIndex, slides.length - 1));
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} size="2xl">
      <ModalContent className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50">
        {(onCloseModal) => (
          <>
            <ModalHeader className="text-slate-100 font-bold">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-400" />
                角色三视图 - {selectedResource?.name}
              </div>
            </ModalHeader>
            <ModalBody>
              {selectedResource && (selectedResource?.frontViewUrl || selectedResource?.sideViewUrl || selectedResource?.backViewUrl || isGenerating) && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">已生成的三视图</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {/* 正面视图 */}
                    <div className="border border-slate-700/50 rounded-lg p-2">
                      <p className="text-xs text-slate-400 mb-2">正面视图</p>
                      {selectedResource?.frontViewUrl ? (
                        <div className="relative group cursor-pointer" onClick={() => openViewPreview(0)}>
                          <img src={selectedResource.frontViewUrl} alt="正面视图" className="w-full h-48 object-cover rounded" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-slate-800/60 rounded flex items-center justify-center text-slate-500 text-sm">
                          {isGenerating || selectedResource?.generationStatus === 'generating' ? '生成中...' : '未生成'}
                        </div>
                      )}
                    </div>
                    
                    {/* 侧面视图 */}
                    <div className="border border-slate-700/50 rounded-lg p-2">
                      <p className="text-xs text-slate-400 mb-2">侧面视图</p>
                      {selectedResource?.sideViewUrl ? (
                        <div className="relative group cursor-pointer" onClick={() => openViewPreview(1)}>
                          <img src={selectedResource.sideViewUrl} alt="侧面视图" className="w-full h-48 object-cover rounded" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-slate-800/60 rounded flex items-center justify-center text-slate-500 text-sm">
                          {isGenerating || selectedResource?.generationStatus === 'generating' ? '生成中...' : '未生成'}
                        </div>
                      )}
                    </div>
                    
                    {/* 背面视图 */}
                    <div className="border border-slate-700/50 rounded-lg p-2">
                      <p className="text-xs text-slate-400 mb-2">背面视图</p>
                      {selectedResource?.backViewUrl ? (
                        <div className="relative group cursor-pointer" onClick={() => openViewPreview(2)}>
                          <img src={selectedResource.backViewUrl} alt="背面视图" className="w-full h-48 object-cover rounded" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-slate-800/60 rounded flex items-center justify-center text-slate-500 text-sm">
                          {isGenerating || selectedResource?.generationStatus === 'generating' ? '生成中...' : '未生成'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 模型信息 */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">
                  {!selectedResource?.frontViewUrl ? '第一步：生成风格图' : (!selectedResource?.sideViewUrl || !selectedResource?.backViewUrl) ? '第二步：生成侧面/背面' : '重新生成'}
                </h3>
                {!selectedResource?.frontViewUrl && (
                  <p className="text-xs text-slate-500 mb-2">先生成一张风格正确的正面图，确认满意后再生成侧面和背面</p>
                )}
                {imageModel ? (
                  <p className="text-sm text-slate-500">使用图片模型：<span className="font-medium text-slate-300">{imageModel}</span></p>
                ) : (
                  <p className="text-sm text-amber-600">暂无可用的图片生成模型，请在右上角「AI 模型」中配置</p>
                )}
                {imageAspectRatio ? (
                  <p className="text-sm text-slate-500 mt-1">图片比例：<span className="font-medium text-slate-300">{imageAspectRatio}</span></p>
                ) : (
                  <p className="text-sm text-amber-600 mt-1">当前图片模型未配置可用长宽比</p>
                )}
              </div>

              {isGenerating ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-4 border-purple-500 mb-4"></div>
                    <p className="text-slate-400">正在生成三视图...</p>
                  </div>
                </div>
              ) : generatedPrompts ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500 mb-4">
                    以下是生成的三视图提示词，可用于 AI 绘图工具（如 Stable Diffusion、Midjourney）
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-800/60 rounded-lg p-4">
                      <div className="w-full h-32 bg-slate-700/50 rounded-lg mb-3 flex items-center justify-center">
                        <span className="text-4xl">👤</span>
                      </div>
                      <h4 className="font-bold text-slate-100 mb-2">正面</h4>
                      <p className="text-xs text-slate-400 line-clamp-3">{generatedPrompts.front}</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-lg p-4">
                      <div className="w-full h-32 bg-slate-700/50 rounded-lg mb-3 flex items-center justify-center">
                        <span className="text-4xl">👤</span>
                      </div>
                      <h4 className="font-bold text-slate-100 mb-2">侧面</h4>
                      <p className="text-xs text-slate-400 line-clamp-3">{generatedPrompts.side}</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-lg p-4">
                      <div className="w-full h-32 bg-slate-700/50 rounded-lg mb-3 flex items-center justify-center">
                        <span className="text-4xl">👤</span>
                      </div>
                      <h4 className="font-bold text-slate-100 mb-2">背面</h4>
                      <p className="text-xs text-slate-400 line-clamp-3">{generatedPrompts.back}</p>
                    </div>
                  </div>
                  <div className="bg-purple-500/10 rounded-lg p-4 mt-4 border border-purple-500/20">
                    <h4 className="font-bold text-purple-300 mb-2">完整设计稿提示词</h4>
                    <p className="text-sm text-purple-400">{generatedPrompts.characterSheet}</p>
                  </div>
                </div>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onCloseModal}>关闭</Button>
              {/* 生成/重新生成风格图（正面） */}
              <Button 
                variant={selectedResource?.frontViewUrl ? 'bordered' : 'solid'}
                className={selectedResource?.frontViewUrl
                  ? 'border-purple-500/40 text-purple-300 hover:bg-purple-500/10'
                  : 'bg-linear-to-r from-purple-500 to-violet-600 text-white font-semibold shadow-lg shadow-purple-500/20'
                }
                startContent={<Palette className="w-4 h-4" />}
                onPress={() => onGenerate(selectedResource?.name || '', imageModel, textModel, imageAspectRatio, characterId, 'style')}
                isLoading={isGenerating}
                isDisabled={!imageModel || !imageAspectRatio || isGenerating}
              >
                {selectedResource?.frontViewUrl ? '重新生成风格图' : '生成风格图'}
              </Button>
              {/* 生成三视图（侧面+背面）- 正面已存在时显示 */}
              {selectedResource?.frontViewUrl && (
                <Button 
                  className="bg-linear-to-r from-purple-500 to-violet-600 text-white font-semibold shadow-lg shadow-purple-500/20"
                  startContent={<Wand2 className="w-4 h-4" />}
                  onPress={() => onGenerate(selectedResource?.name || '', imageModel, textModel, imageAspectRatio, characterId, 'views')}
                  isLoading={isGenerating}
                  isDisabled={!imageModel || !imageAspectRatio || isGenerating}
                >
                  {(selectedResource?.sideViewUrl && selectedResource?.backViewUrl) ? '重新生成三视图' : '生成三视图'}
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default CharacterViewsModal;
