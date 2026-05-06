import React, { useState, useEffect } from 'react';
import { Card, CardBody, Button, Chip, Image, Modal, ModalContent, ModalHeader, ModalBody, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Tooltip } from '@heroui/react';
import { Edit2, Trash2, Mountain, Wand2, Plus, Clock, Grid3X3, ChevronDown, ChevronUp, Globe, ScanSearch, ZoomIn } from 'lucide-react';
import { Environment, parseTerrainTypes, recognizeEnvironmentTerrain } from '../../services/environments';
import { EnvironmentVariant, createEnvironmentVariant, deleteEnvironmentVariant, generateVariantFaces, FACE_DEFS } from '../../services/environmentVariants';
import FaceSphereViewer from '../../components/FaceSphereViewer';

interface EnvironmentListProps {
  environments: Environment[];
  onEdit: (env: Environment) => void;
  onDelete: (id: number) => void;
  onGenerateImage: (env: Environment, mode?: 'front' | 'back' | 'both') => Promise<void>;
  onUpdateEnvironment?: (env: Environment) => void;
  selectedImageModel?: string;
  selectedTextModel?: string;
}

// 预设时间状态
const TIME_PRESETS = [
  { label: '白天', value: '白天', weather: '晴朗', lighting: '自然光' },
  { label: '黄昏', value: '黄昏', weather: '晴朗', lighting: '暖色调' },
  { label: '夜晚', value: '夜晚', weather: '晴朗', lighting: '夜景灯光' },
  { label: '黎明', value: '黎明', weather: '晴朗', lighting: '散射光' },
  { label: '阴天白天', value: '白天', weather: '阴天', lighting: '散射光' },
  { label: '雨夜', value: '夜晚', weather: '雨天', lighting: '冷色调' },
];

const EnvironmentList: React.FC<EnvironmentListProps> = ({
  environments,
  onEdit,
  onDelete,
  onGenerateImage,
  onUpdateEnvironment,
  selectedImageModel,
  selectedTextModel,
}) => {
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [generatingVariantIds, setGeneratingVariantIds] = useState<Set<number>>(new Set());
  const [recognizingIds, setRecognizingIds] = useState<Set<number>>(new Set());
        const [creatingVariantForEnv, setCreatingVariantForEnv] = useState<number | null>(null);
    const [expandedFaceVariantId, setExpandedFaceVariantId] = useState<number | null>(null);
    const [facePreviewUrl, setFacePreviewUrl] = useState<string | null>(null);
    const [facePreviewLabel, setFacePreviewLabel] = useState<string>('');
    const [spherePreviewVariant, setSpherePreviewVariant] = useState<EnvironmentVariant | null>(null);
    const [spherePreviewEnv, setSpherePreviewEnv] = useState<Environment | null>(null);
    const [sphereReady, setSphereReady] = useState(false);
    const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

  // 球体预览 Modal 延迟渲染
  useEffect(() => {
    if (spherePreviewVariant) {
      setSphereReady(false);
      const timer = setTimeout(() => {
        setSphereReady(true);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setSphereReady(false);
    }
  }, [spherePreviewVariant]);

  const handleGenerate = async (env: Environment, mode: 'front' | 'back' | 'both' = 'both') => {
    setGeneratingIds((prev) => new Set(prev).add(env.id));
    try {
      await onGenerateImage(env, mode);
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(env.id);
        return next;
      });
    }
  };

  // 创建时间变体
  const handleCreateVariant = async (envId: number, preset: typeof TIME_PRESETS[number]) => {
    setCreatingVariantForEnv(null);
    try {
      await createEnvironmentVariant({
        environmentId: envId,
        timeOfDay: preset.value,
        weather: preset.weather,
        lighting: preset.lighting,
      });
      // 通知父组件刷新数据
      onGenerateImage({ id: envId } as Environment).catch(() => {});
    } catch (err: any) {
      console.error('[EnvList] 创建时间变体失败:', err);
    }
  };

  // 为变体生成8方位场景图
  const handleGenerateVariantFaces = async (variant: EnvironmentVariant) => {
    if (!selectedImageModel) return;
    setGeneratingVariantIds((prev) => new Set(prev).add(variant.id));
    try {
      await generateVariantFaces(variant.id, {
        imageModel: selectedImageModel,
        textModel: selectedTextModel || undefined,
      });
    } finally {
      setGeneratingVariantIds((prev) => {
        const next = new Set(prev);
        next.delete(variant.id);
        return next;
      });
    }
  };

  // 删除变体
  const handleDeleteVariant = async (variantId: number) => {
    try {
      await deleteEnvironmentVariant(variantId);
    } catch (err: any) {
      console.error('[EnvList] 删除变体失败:', err);
    }
  };

  // 识别地貌类型
  const handleRecognizeTerrain = async (env: Environment, onUpdate?: (env: Environment) => void) => {
    if (!env.id) return;
    setRecognizingIds((prev) => new Set(prev).add(env.id));
    try {
      const result = await recognizeEnvironmentTerrain(env.id);
      console.log('[EnvList] 地貌识别结果:', result);
      // 如果有 onUpdate 回调，通知父组件刷新
      if (onUpdate && result.terrainTypes.length > 0) {
        onUpdate({ ...env, terrain_type: result.terrainTypes.join(',') });
      }
    } catch (err: any) {
      console.error('[EnvList] 地貌识别失败:', err);
    } finally {
      setRecognizingIds((prev) => {
        const next = new Set(prev);
        next.delete(env.id);
        return next;
      });
    }
  };

  if (!environments.length) {
    return (
      <div className="mt-10 text-center text-(--text-muted)">
        <p>暂无环境。点击右上角"新建环境"创建，如草地、沙地、溪流等场景基底。</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 items-stretch">
        {environments.map((env) => {
          const isGenerating = generatingIds.has(env.id) || env.generation_status === 'generating';
          const hasImage = !!env.image_url;

          return (
            <Card
              key={env.id}
              className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow group"
              classNames={{ base: 'h-full', body: 'h-full' }}
            >
              <CardBody className="p-0 flex flex-col h-full relative">
                                {/* 封面：环境参考图 */}
                <div className="relative w-full h-40 bg-linear-to-br from-(--accent)/10 to-(--accent)/5 overflow-hidden">
                  {env.image_url ? (
                    <Image
                      src={env.image_url}
                      alt={env.name}
                      removeWrapper
                      className="w-full h-full object-cover transition-opacity"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-(--text-muted)">
                      <Mountain className="w-12 h-12 opacity-40" />
                    </div>
                  )}

                  {/* 封面角标：生成中 */}
                  {isGenerating && (
                    <div className="absolute top-2 left-2 bg-black/60 rounded-md px-2 py-0.5 flex items-center gap-1 z-10">
                      <Wand2 className="w-3 h-3 text-white animate-spin" />
                      <span className="text-white text-[10px] font-medium">生成中…</span>
                    </div>
                  )}

                  {/* Hover 预览层：有图才能预览 */}
                  {hasImage && (
                    <button
                      type="button"
                      onClick={() => setImagePreview({ url: env.image_url!, title: `${env.name} · 正面` })}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 cursor-zoom-in focus:outline-none"
                      title="查看大图"
                    >
                      <div className="flex items-center gap-1.5 text-white text-xs">
                        <ZoomIn className="w-4 h-4" />查看大图
                      </div>
                    </button>
                  )}
                </div>

                {/* 正面 + 背面并排预览（仅预览；生成入口在编辑环境中） */}
                <div className="flex gap-1 px-2 pt-2">
                  {/* 正面格 */}
                  <Tooltip content={env.image_url ? '点击查看正面大图' : '点击"编辑"按钮在弹窗中生成环境图'} size="sm" placement="top">
                    <button
                      type="button"
                      onClick={() => {
                        if (env.image_url) {
                          setImagePreview({ url: env.image_url, title: `${env.name} · 正面` });
                        } else {
                          onEdit(env);
                        }
                      }}
                      className="flex-1 relative group/front cursor-pointer focus:outline-none"
                    >
                      {env.image_url ? (
                        <Image
                          src={env.image_url}
                          alt={`${env.name} · 正面`}
                          removeWrapper
                          className="w-full h-16 object-cover rounded border border-(--border-color)"
                        />
                      ) : (
                        <div className="w-full h-16 rounded bg-(--bg-input) flex items-center justify-center text-[10px] text-(--text-muted) border border-(--border-color) border-dashed group-hover/front:border-(--accent) group-hover/front:text-(--accent) transition-colors">
                          正面未生成
                        </div>
                      )}
                      <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded pointer-events-none">正面</span>
                      {env.image_url && (
                        <span className="absolute inset-0 bg-black/40 rounded flex items-center justify-center opacity-0 group-hover/front:opacity-100 transition-opacity text-white text-[10px]">
                          <ZoomIn className="w-3 h-3 mr-1" />查看大图
                        </span>
                      )}
                    </button>
                  </Tooltip>
                  {/* 背面格 */}
                  <Tooltip content={env.image_back_url ? '点击查看背面大图' : '点击"编辑"按钮在弹窗中生成环境图'} size="sm" placement="top">
                    <button
                      type="button"
                      onClick={() => {
                        if (env.image_back_url) {
                          setImagePreview({ url: env.image_back_url, title: `${env.name} · 背面` });
                        } else {
                          onEdit(env);
                        }
                      }}
                      className="flex-1 relative group/back cursor-pointer focus:outline-none"
                    >
                      {env.image_back_url ? (
                        <Image
                          src={env.image_back_url}
                          alt={`${env.name} · 背面`}
                          removeWrapper
                          className="w-full h-16 object-cover rounded border border-(--border-color)"
                        />
                      ) : (
                        <div className="w-full h-16 rounded bg-(--bg-input) flex items-center justify-center text-[10px] text-(--text-muted) border border-(--border-color) border-dashed group-hover/back:border-(--accent) group-hover/back:text-(--accent) transition-colors">
                          背面未生成
                        </div>
                      )}
                      <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded pointer-events-none">背面</span>
                      {env.image_back_url && (
                        <span className="absolute inset-0 bg-black/40 rounded flex items-center justify-center opacity-0 group-hover/back:opacity-100 transition-opacity text-white text-[10px]">
                          <ZoomIn className="w-3 h-3 mr-1" />查看大图
                        </span>
                      )}
                    </button>
                  </Tooltip>
                </div>

                {/* 内容 */}
                <div className="p-4 flex flex-col gap-3 flex-1 transition-opacity">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-(--text-primary) truncate">
                      {env.name}
                    </h3>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onEdit(env)}
                        className="hover:bg-(--accent)/10"
                        title="编辑环境"
                      >
                        <Edit2 className="w-4 h-4 text-(--text-secondary)" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onDelete(env.id)}
                        className="hover:bg-red-500/10"
                        title="删除环境"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-(--text-secondary) line-clamp-2">
                    {env.description || '未填写描述'}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-auto">
                    {env.time_of_day && (
                      <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-500 font-medium">
                        {env.time_of_day}
                      </Chip>
                    )}
                    {env.weather && (
                      <Chip size="sm" variant="flat" className="bg-sky-500/10 text-sky-500 font-medium">
                        {env.weather}
                      </Chip>
                    )}
                    {/* 地貌类型标签 */}
                    {(() => {
                      const terrainTypes = parseTerrainTypes(env);
                      if (terrainTypes.length === 0) return null;
                      return terrainTypes.map((type) => (
                        <Chip
                          key={type}
                          size="sm"
                          variant="flat"
                          className="bg-emerald-500/10 text-emerald-500 font-medium"
                        >
                          {type}
                        </Chip>
                      ));
                    })()}
                  </div>

                  {/* 环境图状态 + 识别地貌（生成入口在编辑环境中） */}
                  <div className="flex items-center gap-2 pt-1">
                    {hasImage ? (
                      <Chip size="sm" variant="flat" className="bg-green-500/10 text-green-500 font-medium">
                        已生成环境图
                      </Chip>
                    ) : (
                      <Chip size="sm" variant="flat" className="bg-(--bg-input) text-(--text-muted) font-medium">
                        未生成
                      </Chip>
                    )}
                    {/* 识别地貌按钮 */}
                    <Tooltip content="AI识别地貌类型" size="sm">
                      <Button
                        size="sm"
                        variant="light"
                        className="h-6 w-6 min-w-0 p-0"
                        isLoading={recognizingIds.has(env.id)}
                        onPress={() => handleRecognizeTerrain(env, onUpdateEnvironment)}
                      >
                        {!recognizingIds.has(env.id) && <ScanSearch className="w-3 h-3 text-emerald-500" />}
                      </Button>
                    </Tooltip>
                  </div>

                  {/* 时间变体区 */}
                  <div className="pt-2 border-t border-(--border-color) mt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-(--text-muted) font-medium">时间变体</span>
                      <Dropdown
                        isOpen={creatingVariantForEnv === env.id}
                        onOpenChange={(open) => setCreatingVariantForEnv(open ? env.id : null)}
                      >
                        <DropdownTrigger>
                          <Button
                            size="sm"
                            variant="light"
                            className="h-5 text-[10px] px-1.5 min-w-0 text-(--accent)"
                            startContent={<Plus className="w-3 h-3" />}
                          >
                            添加
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                          aria-label="选择时间状态"
                          onAction={(key) => {
                            const preset = TIME_PRESETS[Number(key)];
                            if (preset) handleCreateVariant(env.id, preset);
                          }}
                        >
                          {TIME_PRESETS.map((p, idx) => (
                            <DropdownItem key={idx} startContent={<Clock className="w-3 h-3" />}>
                              {p.label}
                            </DropdownItem>
                          ))}
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                                        {env.variants && env.variants.length > 0 ? (
                      <div className="space-y-1.5">
                        {env.variants.map((v) => {
                          const faces = v.faces as Record<string, string> | null;
                          const facesCount = faces ? Object.keys(faces).length : 0;
                          const isExpanded = expandedFaceVariantId === v.id;
                          const isGeneratingVariant = generatingVariantIds.has(v.id);

                          return (
                            <div key={v.id} className="rounded-md bg-(--bg-app) border border-(--border-color) overflow-hidden">
                              {/* 变体主行 */}
                              <div className="flex items-center gap-1.5 p-1.5">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-500 font-medium h-4 text-[10px] px-1">
                                      {v.time_of_day}
                                    </Chip>
                                    {v.weather && (
                                      <Chip size="sm" variant="flat" className="bg-sky-500/10 text-sky-500 font-medium h-4 text-[10px] px-1">
                                        {v.weather}
                                      </Chip>
                                    )}
                                    {facesCount > 0 && (
                                      <Chip size="sm" variant="flat" className="bg-violet-500/10 text-violet-500 font-medium h-4 text-[10px] px-1">
                                        {facesCount}方位
                                      </Chip>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {v.generation_status === 'generating' && (
                                      <span className="text-[9px] text-blue-500 ml-0.5">生成中…</span>
                                    )}
                                  </div>
                                </div>
                                                                <div className="flex gap-0.5 shrink-0">
                                  {/* 8方位场景图生成 */}
                                  <Tooltip content={facesCount > 0 ? '重新生成8方位场景图' : '生成8方位场景图'} size="sm">
                                    <Button
                                      size="sm"
                                      variant="light"
                                      className="h-5 w-5 min-w-0 p-0"
                                      isLoading={isGeneratingVariant}
                                      onPress={() => handleGenerateVariantFaces(v)}
                                    >
                                      {!isGeneratingVariant && <Grid3X3 className="w-3 h-3 text-violet-500" />}
                                    </Button>
                                  </Tooltip>
                                  {/* 球体预览 */}
                                  {facesCount > 0 && (
                                    <Tooltip content="球体预览" size="sm">
                                      <Button
                                        size="sm"
                                        variant="light"
                                        className="h-5 w-5 min-w-0 p-0"
                                        onPress={() => { setSpherePreviewEnv(env); setSpherePreviewVariant(v); }}
                                      >
                                        <Globe className="w-3 h-3 text-emerald-500" />
                                      </Button>
                                    </Tooltip>
                                  )}
                                  {/* 展开/收起场景图 */}
                                  {facesCount > 0 && (
                                    <Button
                                      size="sm"
                                      variant="light"
                                      className="h-5 w-5 min-w-0 p-0"
                                      onPress={() => setExpandedFaceVariantId(isExpanded ? null : v.id)}
                                    >
                                      {isExpanded
                                        ? <ChevronUp className="w-3 h-3 text-(--text-muted)" />
                                        : <ChevronDown className="w-3 h-3 text-(--text-muted)" />
                                      }
                                    </Button>
                                  )}
                                  {/* 删除变体 */}
                                  <Button
                                    size="sm"
                                    variant="light"
                                    className="h-5 w-5 min-w-0 p-0"
                                    onPress={() => handleDeleteVariant(v.id)}
                                    title="删除变体"
                                  >
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                  </Button>
                                </div>
                              </div>

                              {/* 8方位场景图网格（展开时显示） */}
                              {isExpanded && faces && facesCount > 0 && (
                                <div className="px-2 pb-2 pt-1 border-t border-(--border-color)">
                                  <div className="grid grid-cols-4 gap-1">
                                    {FACE_DEFS.map((fd) => {
                                      const url = faces[fd.key];
                                      return (
                                        <div key={fd.key} className="relative group/face">
                                          {url ? (
                                            <Image
                                              src={url}
                                              alt={fd.label}
                                              removeWrapper
                                              className="w-full aspect-square object-cover rounded cursor-pointer border border-(--border-color)"
                                              onClick={() => {
                                                setFacePreviewUrl(url);
                                                setFacePreviewLabel(`${v.time_of_day} · ${fd.label}`);
                                              }}
                                            />
                                          ) : (
                                            <div className="w-full aspect-square rounded bg-(--bg-input) flex items-center justify-center border border-(--border-color)">
                                              <span className="text-[8px] text-(--text-muted)">{fd.label}</span>
                                            </div>
                                          )}
                                          {/* 方位标签 */}
                                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white text-center py-0.5 rounded-b truncate">
                                            {fd.label}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* 一键生成场景图按钮 */}
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    color="secondary"
                                    className="mt-1.5 h-6 text-[10px] w-full"
                                    isLoading={isGeneratingVariant}
                                    onPress={() => handleGenerateVariantFaces(v)}
                                    startContent={!isGeneratingVariant ? <Grid3X3 className="w-3 h-3" /> : undefined}
                                  >
                                    {isGeneratingVariant ? '场景图生成中…' : (facesCount >= 8 ? '重新生成8方位场景图' : '生成8方位场景图')}
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-(--text-muted)">点击"添加"创建白天/夜晚等时间变体</p>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* 8方位场景图预览 Modal */}
      <Modal
        isOpen={!!facePreviewUrl}
        onClose={() => { setFacePreviewUrl(null); setFacePreviewLabel(''); }}
        size="4xl"
        classNames={{ base: 'bg-black border-none', wrapper: 'items-center' }}
        hideCloseButton
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center justify-between bg-black/80 text-white border-b border-white/10 shrink-0">
                <span>{facePreviewLabel}</span>
                <Button
                  size="sm"
                  variant="light"
                  className="text-white"
                  onPress={() => { setFacePreviewUrl(null); setFacePreviewLabel(''); }}
                >
                  关闭
                </Button>
              </ModalHeader>
              <ModalBody className="p-2 flex items-center justify-center" style={{ maxHeight: '80vh' }}>
                {facePreviewUrl && (
                  <Image
                    src={facePreviewUrl}
                    alt={facePreviewLabel}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 正面/背面单图大图预览 Modal */}
      <Modal
        isOpen={!!imagePreview}
        onClose={() => setImagePreview(null)}
        size="4xl"
        classNames={{ base: 'bg-black border-none', wrapper: 'items-center' }}
        hideCloseButton
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center justify-between bg-black/80 text-white border-b border-white/10 shrink-0">
                <span>{imagePreview?.title || ''}</span>
                <Button
                  size="sm"
                  variant="light"
                  className="text-white"
                  onPress={() => setImagePreview(null)}
                >
                  关闭
                </Button>
              </ModalHeader>
              <ModalBody className="p-2 flex items-center justify-center" style={{ maxHeight: '80vh' }}>
                {imagePreview && (
                  <Image
                    src={imagePreview.url}
                    alt={imagePreview.title}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 8方位球体预览 Modal */}
      <Modal
        isOpen={!!spherePreviewVariant}
        onClose={() => { setSpherePreviewVariant(null); setSpherePreviewEnv(null); }}
        size="5xl"
        classNames={{ base: 'bg-black border-none', wrapper: 'items-center' }}
        hideCloseButton
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center justify-between bg-black/80 text-white border-b border-white/10 shrink-0">
                <span>{spherePreviewEnv?.name || ''}（{spherePreviewVariant?.time_of_day}）— 8方位球体预览</span>
                <Button
                  size="sm"
                  variant="light"
                  className="text-white"
                  onPress={() => { setSpherePreviewVariant(null); setSpherePreviewEnv(null); }}
                >
                  关闭
                </Button>
              </ModalHeader>
              <ModalBody className="p-0 overflow-hidden flex-none" style={{ height: 500, width: '100%' }}>
                {sphereReady && spherePreviewVariant?.faces && (
                  <FaceSphereViewer
                    faces={spherePreviewVariant.faces as Record<string, string>}
                    autoRotateSpeed={0.02}
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default EnvironmentList;
