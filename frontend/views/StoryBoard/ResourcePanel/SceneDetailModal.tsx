import React, { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Chip, Textarea } from '@heroui/react';
import { MapPin, Wand2, Loader2, Sparkles, ChevronDown, ChevronUp, Pencil, Cloud, Building2 } from 'lucide-react';
import { getAuthToken } from '../../../services/auth';
import { generateSceneImagePrompt } from '../../../services/assets';
import SceneElementsPanel from './SceneElementsPanel';
import type { Environment } from '../../../services/environments';
import type { Building } from '../../../services/buildings';

interface Scene {
  id: number;
  name: string;
  description?: string;
  environment?: string;
  lighting?: string;
  mood?: string;
  image_url?: string;
  reverse_image_url?: string;
  generation_prompt?: string;
  reverse_generation_prompt?: string;
  tags?: string;
  source?: string;
  generation_status?: string;
  studio_id?: number | null;
  studio_name?: string | null;
  _environment?: Environment | null;
  _buildings?: Building[];
}

interface SceneDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  scene: Scene | null;
  onGenerateImage?: (sceneId: number, imageModel: string, options?: { customPromptA?: string; customPromptB?: string }) => Promise<void>;
  isGenerating?: boolean;
  imageModel?: string;
  /** 文本模型名称，用于调用提示词生成接口 */
  textModel?: string;
}

const SceneDetailModal: React.FC<SceneDetailModalProps> = ({
  isOpen,
  onClose,
  scene,
  onGenerateImage,
  isGenerating = false,
  imageModel = '',
  textModel = ''
}) => {
  const [generating, setGenerating] = useState(false);
  // 提示词编辑状态
  const [promptA, setPromptA] = useState('');
  const [promptB, setPromptB] = useState('');
  const [promptsExpanded, setPromptsExpanded] = useState(false);
  // AI 生成/优化提示词的 loading 状态
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [optimizingFace, setOptimizingFace] = useState<'A' | 'B' | ''>('');

  // 当 scene 变化时，从数据库已存字段初始化提示词
  useEffect(() => {
    if (scene) {
      setPromptA(scene.generation_prompt || '');
      setPromptB(scene.reverse_generation_prompt || '');
      setPromptsExpanded(false);
    }
  }, [scene?.id, scene?.generation_prompt, scene?.reverse_generation_prompt]);

  if (!scene) return null;

  const handleGenerateImage = async () => {
    if (!onGenerateImage || !scene.id) return;
    
    // 如果还没有提示词，先自动生成提示词，让用户确认后再生成图片
    if (!promptA.trim() && !promptB.trim() && textModel) {
      setGeneratingPrompt(true);
      try {
        const result = await generateSceneImagePrompt(scene.id, {
          textModel,
          face: 'both',
        });
        if (result.promptA) setPromptA(result.promptA);
        if (result.promptB) setPromptB(result.promptB);
        setPromptsExpanded(true);
        // 生成完提示词后不自动发起图片生成，等用户确认/编辑后再点
        return;
      } catch (error) {
        console.error('自动生成场景提示词失败:', error);
        // 提示词生成失败时，仍然允许走后端自动生成流程
      } finally {
        setGeneratingPrompt(false);
      }
    }
    
    setGenerating(true);
    try {
      const options: { customPromptA?: string; customPromptB?: string } = {};
      if (promptA.trim()) options.customPromptA = promptA.trim();
      if (promptB.trim()) options.customPromptB = promptB.trim();
      await onGenerateImage(scene.id, imageModel, options);
    } catch (error) {
      console.error('生成场景图片失败:', error);
    } finally {
      setGenerating(false);
    }
  };

  /** AI 生成提示词（首次或重新生成） */
  const handleGeneratePrompt = async () => {
    if (!scene.id || !textModel) return;
    setGeneratingPrompt(true);
    try {
      const result = await generateSceneImagePrompt(scene.id, {
        textModel,
        face: 'both',
        // 不传 basePrompt → 首次生成
      });
      if (result.promptA) setPromptA(result.promptA);
      if (result.promptB) setPromptB(result.promptB);
      setPromptsExpanded(true);
    } catch (error: any) {
      console.error('生成场景提示词失败:', error);
    } finally {
      setGeneratingPrompt(false);
    }
  };

  /** AI 优化指定面的提示词 */
  const handleOptimizePrompt = async (face: 'A' | 'B') => {
    if (!scene.id || !textModel) return;
    setOptimizingFace(face);
    try {
      const basePromptA = face === 'A' ? promptA : promptA;
      const basePromptB = face === 'B' ? promptB : promptB;
      const result = await generateSceneImagePrompt(scene.id, {
        textModel,
        face,
        basePromptA: face === 'A' ? basePromptA : undefined,
        basePromptB: face === 'B' ? basePromptB : undefined,
      });
      if (face === 'A' && result.promptA) setPromptA(result.promptA);
      if (face === 'B' && result.promptB) setPromptB(result.promptB);
    } catch (error: any) {
      console.error('优化场景提示词失败:', error);
    } finally {
      setOptimizingFace('');
    }
  };

  const tags = scene.tags ? scene.tags.split(',').filter(t => t.trim()) : [];
  const hasAnyPrompt = promptA.trim() || promptB.trim();
  const busy = generating || isGenerating || generatingPrompt || !!optimizingFace;
  // 是否处于"提示词已就绪，等待用户确认后生成图片"状态
  const promptReady = hasAnyPrompt;

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50">
        {(onCloseModal) => (
          <>
            <ModalHeader className="flex items-center gap-3 border-b border-slate-700/50 pb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
                <MapPin className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-100">{scene.name}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {scene.studio_name && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-violet-500/10 text-violet-300"
                      title="所属影棚"
                    >
                      🎬 {scene.studio_name}
                    </Chip>
                  )}
                  {scene.source && (
                    <Chip size="sm" variant="flat" className="bg-slate-700/50 text-slate-400">
                      {scene.source === 'ai_extracted' ? 'AI提取' : '本地'}
                    </Chip>
                  )}
                  {scene.generation_status && (
                    <Chip 
                      size="sm" 
                      variant="flat" 
                      className={
                        isGenerating ? 'bg-amber-500/10 text-amber-400' :
                        scene.generation_status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                        scene.generation_status === 'processing' ? 'bg-amber-500/10 text-amber-400' :
                        scene.generation_status === 'failed' ? 'bg-red-500/10 text-red-400' :
                        'bg-slate-700/50 text-slate-400'
                      }
                    >
                      {isGenerating ? '生成中' :
                       scene.generation_status === 'completed' ? '已生成' :
                       scene.generation_status === 'processing' ? '生成中' :
                       scene.generation_status === 'failed' ? '生成失败' :
                       '待生成'}
                    </Chip>
                  )}
                </div>
              </div>
            </ModalHeader>

            <ModalBody className="py-6">
              <div className="space-y-6">
                {/* 场景图片 */}
                {scene.image_url && (
                  <div className="flex justify-center">
                    <div className="w-full max-w-2xl bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50">
                      <img 
                        src={scene.image_url} 
                        alt={scene.name} 
                        className="w-full h-auto object-cover" 
                      />
                      {/* 图片下方展示生成提示词 */}
                      {(promptA || scene.generation_prompt) && (
                        <div className="p-3 border-t border-slate-700/40 space-y-2">
                          {(promptA || scene.generation_prompt) && (
                            <div>
                              <span className="text-xs font-medium text-emerald-400">A 面提示词</span>
                              <p className="text-xs text-slate-300 leading-relaxed mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-all">
                                {promptA || scene.generation_prompt}
                              </p>
                            </div>
                          )}
                          {(promptB || scene.reverse_generation_prompt) && (
                            <div>
                              <span className="text-xs font-medium text-blue-400">B 面提示词</span>
                              <p className="text-xs text-slate-300 leading-relaxed mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-all">
                                {promptB || scene.reverse_generation_prompt}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 环境 / 建筑摘要 */}
                {(scene._environment || (scene._buildings && scene._buildings.length > 0)) && (
                  <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/50 space-y-3">
                    <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                      <span className="w-1 h-4 bg-sky-500 rounded"></span>
                      影棚组件
                    </h4>
                    {scene._environment && (
                      <div className="flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="text-xs text-slate-400">环境</span>
                        <Chip size="sm" variant="flat" className="bg-sky-500/10 text-sky-300">
                          {scene._environment.name}
                        </Chip>
                      </div>
                    )}
                    {scene._buildings && scene._buildings.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-xs text-slate-400 pt-0.5">建筑</span>
                        <div className="flex flex-wrap gap-1.5">
                          {scene._buildings.map((b) => (
                            <Chip key={b.id} size="sm" variant="flat" className="bg-amber-500/10 text-amber-300">
                              {b.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 场景描述 */}
                {scene.description && (
                  <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/50">
                    <h4 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-slate-500 rounded"></span>
                      影棚描述
                    </h4>
                    <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {scene.description}
                    </p>
                  </div>
                )}

                {/* 环境描述 */}
                {scene.environment && (
                  <div className="bg-emerald-500/5 rounded-lg p-4 border border-emerald-500/20">
                    <h4 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-green-500 rounded"></span>
                      环境描述
                    </h4>
                    <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {scene.environment}
                    </p>
                  </div>
                )}

                {/* 光照描述 */}
                {scene.lighting && (
                  <div className="bg-amber-500/5 rounded-lg p-4 border border-amber-500/20">
                    <h4 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-yellow-500 rounded"></span>
                      光照描述
                    </h4>
                    <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {scene.lighting}
                    </p>
                  </div>
                )}

                {/* 氛围描述 */}
                {scene.mood && (
                  <div className="bg-purple-500/5 rounded-lg p-4 border border-purple-500/20">
                    <h4 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-purple-500 rounded"></span>
                      氛围描述
                    </h4>
                    <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {scene.mood}
                    </p>
                  </div>
                )}

                {/* 标签 */}
                {tags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-300 mb-2">标签</h4>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag, index) => (
                        <Chip key={index} size="sm" variant="flat" className="bg-slate-700/50 text-slate-400">
                          {tag.trim()}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {/* ========== 场景元素（影棚） ========== */}
                {scene.id && (
                  <SceneElementsPanel
                    sceneId={scene.id}
                    imageModel={imageModel}
                    textModel={textModel}
                  />
                )}

                {/* ========== 图片生成 & 提示词编辑区 ========== */}
                {onGenerateImage && (
                  <div className="bg-blue-500/5 rounded-lg p-4 border border-blue-500/20">
                    <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-blue-400" />
                      生成影棚图片
                    </h4>
                    <div className="space-y-3">
                      {imageModel ? (
                        <p className="text-sm text-slate-500">使用图片模型：<span className="font-medium text-slate-300">{imageModel}</span></p>
                      ) : (
                        <p className="text-sm text-amber-600">请先点击右上角「AI 模型」按钮选择图片模型</p>
                      )}

                      {/* 提示词折叠面板 */}
                      <div className="rounded-lg border border-slate-700/40 overflow-hidden">
                        {/* 折叠头部 */}
                        <button
                          type="button"
                          className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/60 hover:bg-slate-800/80 transition-colors"
                          onClick={() => setPromptsExpanded(!promptsExpanded)}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Pencil className="w-3.5 h-3.5 text-blue-400" />
                            影棚图像提示词
                            {hasAnyPrompt && (
                              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                已编辑
                              </span>
                            )}
                          </span>
                          {promptsExpanded
                            ? <ChevronUp className="w-4 h-4 text-slate-400" />
                            : <ChevronDown className="w-4 h-4 text-slate-400" />
                          }
                        </button>

                        {/* 提示词内容（展开时） */}
                        {promptsExpanded && (
                          <div className="p-3 space-y-3 bg-slate-800/30">
                            {/* A 面提示词 */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                  A 面（正打）
                                </span>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  className="h-6 min-w-0 px-2 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                                  startContent={optimizingFace === 'A' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                  onPress={() => handleOptimizePrompt('A')}
                                  isDisabled={busy || !textModel}
                                >
                                  {optimizingFace === 'A' ? '优化中...' : promptA ? 'AI 优化' : 'AI 生成'}
                                </Button>
                              </div>
                              <Textarea
                                value={promptA}
                                onValueChange={setPromptA}
                                placeholder="A 面图像提示词（英文，可手动编写或点击 AI 生成）"
                                minRows={3}
                                maxRows={6}
                                size="sm"
                                classNames={{
                                  inputWrapper: 'bg-slate-800/60 border-slate-700/50 text-slate-300 text-xs',
                                  input: 'text-xs'
                                }}
                              />
                            </div>

                            {/* B 面提示词 */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                                  B 面（反打）
                                </span>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  className="h-6 min-w-0 px-2 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                                  startContent={optimizingFace === 'B' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                  onPress={() => handleOptimizePrompt('B')}
                                  isDisabled={busy || !textModel}
                                >
                                  {optimizingFace === 'B' ? '优化中...' : promptB ? 'AI 优化' : 'AI 生成'}
                                </Button>
                              </div>
                              <Textarea
                                value={promptB}
                                onValueChange={setPromptB}
                                placeholder="B 面图像提示词（英文，可手动编写或点击 AI 生成）"
                                minRows={3}
                                maxRows={6}
                                size="sm"
                                classNames={{
                                  inputWrapper: 'bg-slate-800/60 border-slate-700/50 text-slate-300 text-xs',
                                  input: 'text-xs'
                                }}
                              />
                            </div>

                            {!textModel && (
                              <p className="text-xs text-amber-500">请先选择文本模型以使用 AI 生成/优化提示词</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 快捷操作：AI 一键生成双面提示词 */}
                      {!hasAnyPrompt && textModel && (
                        <Button
                          size="sm"
                          variant="flat"
                          className="w-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                          startContent={generatingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          onPress={handleGeneratePrompt}
                          isDisabled={busy}
                        >
                          {generatingPrompt ? 'AI 生成提示词中...' : 'AI 生成提示词'}
                        </Button>
                      )}

                      {!textModel && !hasAnyPrompt && (
                        <p className="text-xs text-amber-500 text-center">请先选择文本模型，生成图片前将自动为您生成影棚提示词</p>
                      )}

                      {/* 最终：生成场景图片 */}
                      <Button
                        color="primary"
                        size="sm"
                        startContent={
                          generating || isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> :
                          generatingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> :
                          <Wand2 className="w-4 h-4" />
                        }
                        onPress={handleGenerateImage}
                        isDisabled={generating || isGenerating || !imageModel}
                        className="w-full"
                      >
                        {generating || isGenerating ? '生成图片中...' :
                         generatingPrompt ? '生成提示词中...' :
                         promptReady ? '确认提示词并生成图片' :
                         '生成影棚图片'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ModalBody>

            <ModalFooter className="border-t border-slate-700/50">
              <Button color="default" variant="light" onPress={onCloseModal}>
                关闭
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default SceneDetailModal;
