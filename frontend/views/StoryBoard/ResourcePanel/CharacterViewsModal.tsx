import React, { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tooltip, Textarea } from '@heroui/react';
import { Layers, Wand2, ZoomIn, Palette, ImageIcon, Power, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { ResourceItem } from './types';
import { usePreview } from '../../../components/PreviewProvider';
import { generateCharacterImagePrompt } from '../../../services/assets';

interface CharacterViewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedResource: ResourceItem | null;
  isGenerating: boolean;
  generatedPrompts: any;
  onGenerate: (charName: string, imageModel: string, textModel: string, aspectRatio: string, characterId?: number, mode?: 'style' | 'views' | 'all', customPrompts?: { customPromptFront?: string; customPromptSide?: string; customPromptBack?: string }) => void;
  characterId?: number;
  imageModel: string;
  textModel: string;
  imageAspectRatio: string;
  /** 是否使用参考图 */
  useReferenceImages?: boolean;
  /** 参考图数量 */
  referenceImageCount?: number;
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
  imageAspectRatio,
  useReferenceImages = true,
  referenceImageCount = 0
}) => {

  const { openPreview } = usePreview();

  // 提示词编辑状态
  const [promptFront, setPromptFront] = useState('');
  const [promptSide, setPromptSide] = useState('');
  const [promptBack, setPromptBack] = useState('');
  const [promptsExpanded, setPromptsExpanded] = useState(false);
  // AI 生成/优化提示词的 loading 状态
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [optimizingView, setOptimizingView] = useState<'front' | 'side' | 'back' | ''>('');

  // 当角色切换时初始化提示词
  useEffect(() => {
    if (selectedResource) {
      // 从 selectedResource 读取已有的提示词（如果 API 返回了的话）
      setPromptFront((selectedResource as any).generationPromptFront || '');
      setPromptSide((selectedResource as any).generationPromptSide || '');
      setPromptBack((selectedResource as any).generationPromptBack || '');
      setPromptsExpanded(false);
    }
  }, [selectedResource?.name]);

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

  /** AI 生成全部提示词（首次或重新生成） */
  const handleGeneratePrompt = async () => {
    if (!characterId || !textModel) return;
    setGeneratingPrompt(true);
    try {
      const result = await generateCharacterImagePrompt(characterId, {
        textModel,
        views: 'all',
      });
      if (result.promptFront) setPromptFront(result.promptFront);
      if (result.promptSide) setPromptSide(result.promptSide);
      if (result.promptBack) setPromptBack(result.promptBack);
      setPromptsExpanded(true);
    } catch (error: any) {
      console.error('生成角色提示词失败:', error);
    } finally {
      setGeneratingPrompt(false);
    }
  };

  /** AI 优化指定视图的提示词 */
  const handleOptimizePrompt = async (view: 'front' | 'side' | 'back') => {
    if (!characterId || !textModel) return;
    setOptimizingView(view);
    try {
      const basePromptFront = view === 'front' ? promptFront : promptFront;
      const basePromptSide = view === 'side' ? promptSide : promptSide;
      const basePromptBack = view === 'back' ? promptBack : promptBack;
      const result = await generateCharacterImagePrompt(characterId, {
        textModel,
        views: view,
        basePromptFront: view === 'front' ? basePromptFront : undefined,
        basePromptSide: view === 'side' ? basePromptSide : undefined,
        basePromptBack: view === 'back' ? basePromptBack : undefined,
      });
      if (view === 'front' && result.promptFront) setPromptFront(result.promptFront);
      if (view === 'side' && result.promptSide) setPromptSide(result.promptSide);
      if (view === 'back' && result.promptBack) setPromptBack(result.promptBack);
    } catch (error: any) {
      console.error('优化角色提示词失败:', error);
    } finally {
      setOptimizingView('');
    }
  };

  /** 生成图片：如果还没有提示词，先自动生成提示词让用户确认 */
  const handleGenerateWithPrompts = async (mode: 'style' | 'views' | 'all') => {
    // 根据模式判断需要哪些提示词
    const needFront = mode === 'style' || mode === 'all';
    const needSideBack = mode === 'views' || mode === 'all';
    const hasNeededPrompt = needFront
      ? (needSideBack ? (promptFront.trim() && promptSide.trim() && promptBack.trim()) : promptFront.trim())
      : (promptSide.trim() && promptBack.trim());

    // 如果还没有对应提示词，先自动生成
    if (!hasNeededPrompt && characterId && textModel) {
      setGeneratingPrompt(true);
      try {
        const viewsToGenerate = mode === 'style' ? 'front' : mode === 'views' ? 'all' : 'all';
        const result = await generateCharacterImagePrompt(characterId, {
          textModel,
          views: viewsToGenerate,
        });
        if (result.promptFront) setPromptFront(result.promptFront);
        if (result.promptSide) setPromptSide(result.promptSide);
        if (result.promptBack) setPromptBack(result.promptBack);
        setPromptsExpanded(true);
        // 提示词生成后不自动发起图片生成，等用户确认/编辑后再点
        return;
      } catch (error) {
        console.error('自动生成角色提示词失败:', error);
        // 提示词生成失败时，仍然允许走后端自动生成流程
      } finally {
        setGeneratingPrompt(false);
      }
    }

    // 已有提示词，直接生成图片
    const customPrompts: { customPromptFront?: string; customPromptSide?: string; customPromptBack?: string } = {};
    if (promptFront.trim()) customPrompts.customPromptFront = promptFront.trim();
    if (promptSide.trim()) customPrompts.customPromptSide = promptSide.trim();
    if (promptBack.trim()) customPrompts.customPromptBack = promptBack.trim();
    onGenerate(selectedResource?.name || '', imageModel, textModel, imageAspectRatio, characterId, mode, customPrompts);
  };

  const hasAnyPrompt = promptFront.trim() || promptSide.trim() || promptBack.trim();
  const busy = isGenerating || generatingPrompt || !!optimizingView;

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50">
        {(onCloseModal) => (
          <>
            <ModalHeader className="text-slate-100 font-bold">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-400" />
                  角色三视图 - {selectedResource?.name}
                </div>
                {/* 参考图使用状态 */}
                <Tooltip 
                  content={useReferenceImages 
                    ? `使用参考图生成（${referenceImageCount}张）` 
                    : '不使用参考图，仅基于角色描述生成'}
                >
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${
                    useReferenceImages 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    <ImageIcon className="w-3.5 h-3.5" />
                    <Power className={`w-3 h-3 ${useReferenceImages ? 'text-green-400' : 'text-slate-500'}`} />
                    <span>{useReferenceImages ? '参考图已启用' : '参考图已禁用'}</span>
                    {useReferenceImages && referenceImageCount > 0 && (
                      <span className="bg-green-500/30 px-1.5 py-0.5 rounded">
                        {referenceImageCount}张
                      </span>
                    )}
                  </div>
                </Tooltip>
              </div>
            </ModalHeader>
            <ModalBody>
              {/* 已生成的三视图 */}
              {selectedResource && (selectedResource?.frontViewUrl || selectedResource?.sideViewUrl || selectedResource?.backViewUrl || isGenerating) && (
                <div className="mb-4">
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

              {/* ========= 提示词区域 ========= */}
              <div className="mb-4">
                {/* 标题栏 + 生成/展开按钮 */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    提示词
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="flat"
                      className="text-purple-300 bg-purple-500/10"
                      startContent={<Wand2 className="w-3.5 h-3.5" />}
                      onPress={handleGeneratePrompt}
                      isLoading={generatingPrompt}
                      isDisabled={!textModel || busy}
                    >
                      {hasAnyPrompt ? '重新生成提示词' : 'AI 生成提示词'}
                    </Button>
                    {hasAnyPrompt && (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        className="text-slate-400"
                        onPress={() => setPromptsExpanded(!promptsExpanded)}
                      >
                        {promptsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>

                {/* 折叠态：只显示提示词摘要 */}
                {hasAnyPrompt && !promptsExpanded && (
                  <div className="space-y-2">
                    {promptFront.trim() && (
                      <div className="bg-slate-800/60 rounded p-2 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-purple-400">正面提示词</span>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            className="w-6 h-4 min-w-0 text-slate-400 hover:text-purple-300"
                            onPress={() => handleOptimizePrompt('front')}
                            isDisabled={!textModel || busy}
                          >
                            <Sparkles className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2">{promptFront}</p>
                      </div>
                    )}
                    {promptSide.trim() && (
                      <div className="bg-slate-800/60 rounded p-2 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-blue-400">侧面提示词</span>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            className="w-6 h-4 min-w-0 text-slate-400 hover:text-blue-300"
                            onPress={() => handleOptimizePrompt('side')}
                            isDisabled={!textModel || busy}
                          >
                            <Sparkles className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2">{promptSide}</p>
                      </div>
                    )}
                    {promptBack.trim() && (
                      <div className="bg-slate-800/60 rounded p-2 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-amber-400">背面提示词</span>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            className="w-6 h-4 min-w-0 text-slate-400 hover:text-amber-300"
                            onPress={() => handleOptimizePrompt('back')}
                            isDisabled={!textModel || busy}
                          >
                            <Sparkles className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2">{promptBack}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 展开态：可编辑 textarea */}
                {hasAnyPrompt && promptsExpanded && (
                  <div className="space-y-3">
                    {/* 正面提示词 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-purple-400">正面提示词</span>
                        <Button
                          size="sm"
                          variant="flat"
                          className="text-purple-300 bg-purple-500/10 h-6 text-xs px-2"
                          startContent={(optimizingView === 'front') ? undefined : <Sparkles className="w-3 h-3" />}
                          onPress={() => handleOptimizePrompt('front')}
                          isLoading={optimizingView === 'front'}
                          isDisabled={!textModel || busy}
                        >
                          AI 优化
                        </Button>
                      </div>
                      <Textarea
                        value={promptFront}
                        onValueChange={setPromptFront}
                        minRows={2}
                        maxRows={6}
                        classNames={{
                          input: 'text-xs text-slate-300',
                          inputWrapper: 'bg-slate-800/60 border-slate-700/50'
                        }}
                      />
                    </div>

                    {/* 侧面提示词 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-blue-400">侧面提示词</span>
                        <Button
                          size="sm"
                          variant="flat"
                          className="text-blue-300 bg-blue-500/10 h-6 text-xs px-2"
                          startContent={(optimizingView === 'side') ? undefined : <Sparkles className="w-3 h-3" />}
                          onPress={() => handleOptimizePrompt('side')}
                          isLoading={optimizingView === 'side'}
                          isDisabled={!textModel || busy}
                        >
                          AI 优化
                        </Button>
                      </div>
                      <Textarea
                        value={promptSide}
                        onValueChange={setPromptSide}
                        minRows={2}
                        maxRows={6}
                        classNames={{
                          input: 'text-xs text-slate-300',
                          inputWrapper: 'bg-slate-800/60 border-slate-700/50'
                        }}
                      />
                    </div>

                    {/* 背面提示词 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-amber-400">背面提示词</span>
                        <Button
                          size="sm"
                          variant="flat"
                          className="text-amber-300 bg-amber-500/10 h-6 text-xs px-2"
                          startContent={(optimizingView === 'back') ? undefined : <Sparkles className="w-3 h-3" />}
                          onPress={() => handleOptimizePrompt('back')}
                          isLoading={optimizingView === 'back'}
                          isDisabled={!textModel || busy}
                        >
                          AI 优化
                        </Button>
                      </div>
                      <Textarea
                        value={promptBack}
                        onValueChange={setPromptBack}
                        minRows={2}
                        maxRows={6}
                        classNames={{
                          input: 'text-xs text-slate-300',
                          inputWrapper: 'bg-slate-800/60 border-slate-700/50'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 模型信息 */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">
                  {!selectedResource?.frontViewUrl ? '第一步：生成风格图' : (!selectedResource?.sideViewUrl || !selectedResource?.backViewUrl) ? '第二步：生成侧面/背面' : '重新生成'}
                </h3>
                {!selectedResource?.frontViewUrl && !hasAnyPrompt && (
                  <p className="text-xs text-slate-500 mb-2">建议先生成提示词，确认后再生图以提高精度</p>
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
                onPress={() => handleGenerateWithPrompts('style')}
                isLoading={isGenerating}
                isDisabled={!imageModel || !imageAspectRatio || busy}
              >
                {selectedResource?.frontViewUrl ? '重新生成风格图' : '生成风格图'}
              </Button>
              {/* 生成三视图（侧面+背面）- 正面已存在时显示 */}
              {selectedResource?.frontViewUrl && (
                <Button 
                  className="bg-linear-to-r from-purple-500 to-violet-600 text-white font-semibold shadow-lg shadow-purple-500/20"
                  startContent={<Wand2 className="w-4 h-4" />}
                  onPress={() => handleGenerateWithPrompts('views')}
                  isLoading={isGenerating}
                  isDisabled={!imageModel || !imageAspectRatio || busy}
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
