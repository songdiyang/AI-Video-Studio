import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Textarea, Tabs, Tab, Chip, Image, Spinner,
} from '@heroui/react';
import { Box, Plus, X, Film, Hammer, Mountain, Cloud, Building2, LayoutGrid, Wand2 } from 'lucide-react';
import {
  StudioDetail,
  getStudio, createStudio, updateStudio,
  attachEnvironmentToStudio, detachEnvironmentFromStudio,
  attachBuildingToStudio, detachBuildingFromStudio,
  attachElementToStudio, detachElementFromStudio,
  setStudioEnvironmentView, setStudioBuildingView,
  generateStudioNineGrid,
} from '../../../services/studios';
import {
  listEnvironments, Environment,
  generateEnvironmentImage,
} from '../../../services/environments';
import {
  listBuildings, Building,
  generateBuildingImage,
} from '../../../services/buildings';
import { listSceneElements, SceneElement } from '../../../services/sceneElements';
import { useToast } from '../../../contexts/ToastContext';
import { useAIModels } from '../../../hooks/useAIModels';

interface StudioModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  studioId: number | null;
  projectId: number | null;
  onSaved: () => void;
}

const StudioModal: React.FC<StudioModalProps> = ({
  isOpen, onOpenChange, editMode, studioId, projectId, onSaved,
}) => {
  const { showToast } = useToast();
  const { selected: aiSelected } = useAIModels(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 生成状态
  const [generatingBuildingView, setGeneratingBuildingView] = useState<Record<number, { interior?: boolean; exterior?: boolean }>>({});
  const [generatingNineGrid, setGeneratingNineGrid] = useState(false);
  const [generatingEnvView, setGeneratingEnvView] = useState<{ front?: boolean; back?: boolean }>({});

  // 基础信息
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');

  // 详情
  const [detail, setDetail] = useState<StudioDetail | null>(null);

  // 候选池
  const [projectEnvironments, setProjectEnvironments] = useState<Environment[]>([]);
  const [projectBuildings, setProjectBuildings] = useState<Building[]>([]);
  const [projectElements, setProjectElements] = useState<SceneElement[]>([]);

  const loadAll = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      let resolvedProjectId = projectId;

      if (editMode && studioId) {
        const d = await getStudio(studioId);
        setDetail(d);
        setName(d.studio.name);
        setDescription(d.studio.description || '');
        setCoverImageUrl(d.studio.cover_image_url || '');
        // 编辑模式：以影棚自身的 project_id 为准（父级可能传 null）
        if (!resolvedProjectId && d.studio.project_id) {
          resolvedProjectId = d.studio.project_id;
        }
      } else {
        setDetail(null);
        setName('');
        setDescription('');
        setCoverImageUrl('');
      }

      if (resolvedProjectId) {
        const [envs, builds, elements] = await Promise.all([
          listEnvironments(resolvedProjectId),
          listBuildings(resolvedProjectId),
          listSceneElements({ projectId: resolvedProjectId }),
        ]);
        setProjectEnvironments(envs);
        setProjectBuildings(builds);
        setProjectElements(elements);
      } else {
        setProjectEnvironments([]);
        setProjectBuildings([]);
        setProjectElements([]);
      }
    } catch (err: any) {
      console.error('[StudioModal] load failed:', err);
      showToast(err?.message || '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [isOpen, editMode, studioId, projectId, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveBasic = async () => {
    if (!name.trim()) {
      showToast('请填写影棚名称', 'warning');
      return;
    }
    if (!editMode && !projectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editMode && studioId) {
        await updateStudio(studioId, {
          name: name.trim(),
          description: description || null,
          coverImageUrl: coverImageUrl || null,
        });
        showToast('影棚已更新', 'success');
      } else if (projectId) {
        const created = await createStudio({
          projectId,
          name: name.trim(),
          description: description || undefined,
          coverImageUrl: coverImageUrl || undefined,
        });
        showToast(`影棚「${created.name}」已创建`, 'success');
      }
      onSaved();
      onOpenChange();
    } catch (err: any) {
      console.error('[StudioModal] save failed:', err);
      showToast(err?.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ===== 环境 1:1 =====
  const handleAttachEnvironment = async (environmentId: number) => {
    if (!studioId) return;
    try {
      await attachEnvironmentToStudio(studioId, environmentId);
      showToast('环境已设置', 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '设置失败', 'error');
    }
  };
  const handleDetachEnvironment = async () => {
    if (!studioId) return;
    try {
      await detachEnvironmentFromStudio(studioId);
      showToast('环境已移除', 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '移除失败', 'error');
    }
  };

  // ===== 建筑 1:N =====
  const handleAttachBuilding = async (buildingId: number) => {
    if (!studioId) return;
    try {
      await attachBuildingToStudio(studioId, buildingId);
      showToast('建筑已关联', 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '关联失败', 'error');
    }
  };
  const handleDetachBuilding = async (buildingId: number) => {
    if (!studioId) return;
    try {
      await detachBuildingFromStudio(studioId, buildingId);
      showToast('建筑已解除', 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '解除失败', 'error');
    }
  };

  // ===== 视图偏好切换（组装图选面） =====
  const handleSetEnvView = async (view: 'front' | 'back') => {
    if (!studioId || !detail?.environment) return;
    try {
      await setStudioEnvironmentView(studioId, view);
      showToast(`已切换为环境${view === 'back' ? '背面' : '正面'}`, 'success');
      loadAll();
    } catch (err: any) {
      showToast(err?.message || '切换环境面失败', 'error');
    }
  };
  const handleSetBuildingView = async (buildingId: number, view: 'exterior' | 'interior') => {
    if (!studioId) return;
    try {
      await setStudioBuildingView(studioId, buildingId, view);
      showToast(`已切换为建筑${view === 'interior' ? '内景' : '外景'}`, 'success');
      loadAll();
    } catch (err: any) {
      showToast(err?.message || '切换建筑视图失败', 'error');
    }
  };

  // ===== 九宫组装图生成 =====
  const handleGenerateNineGrid = async () => {
    if (!studioId) return;
    const imageModel = aiSelected?.image;
    if (!imageModel) {
      showToast('请先在 AI 模型配置中选择图像模型', 'error');
      return;
    }
    if (!detail?.environment && !detail?.buildings?.length) {
      showToast('影棚至少需要绑定环境或关联建筑其一，才能生成九宫组装图', 'warning');
      return;
    }
    setGeneratingNineGrid(true);
    try {
      await generateStudioNineGrid(studioId, {
        imageModel,
        textModel: aiSelected?.text || undefined,
      });
      showToast('九宫组装图生成已启动', 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '启动生成失败', 'error');
    } finally {
      setGeneratingNineGrid(false);
    }
  };

  // ===== 元素 M:N =====
  const handleAttachElement = async (elementId: number) => {
    if (!studioId) return;
    try {
      await attachElementToStudio(studioId, elementId);
      showToast('元素已关联', 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '关联失败', 'error');
    }
  };
  const handleDetachElement = async (elementId: number) => {
    if (!studioId) return;
    try {
      await detachElementFromStudio(studioId, elementId);
      showToast('元素已解除', 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '解除失败', 'error');
    }
  };

  // ===== 环境图生成 =====
  const handleGenerateEnvImage = async (mode: 'front' | 'back') => {
    if (!currentEnv) return;
    const imageModel = aiSelected?.image;
    if (!imageModel) {
      showToast('请先在 AI 模型配置中选择图像模型', 'error');
      return;
    }
    setGeneratingEnvView(prev => ({ ...prev, [mode]: true }));
    try {
      await generateEnvironmentImage(currentEnv.id, {
        imageModel,
        textModel: aiSelected?.text || undefined,
        mode,
      });
      showToast(`环境${mode === 'back' ? '背面' : '正面'}图生成已启动`, 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '生成失败', 'error');
    } finally {
      setGeneratingEnvView(prev => ({ ...prev, [mode]: false }));
    }
  };

  // ===== 建筑视图生成 =====
  const handleGenerateBuildingView = async (buildingId: number, viewType: 'interior' | 'exterior') => {
    const imageModel = aiSelected?.image;
    if (!imageModel) {
      showToast('请先在 AI 模型配置中选择图像模型', 'error');
      return;
    }
    setGeneratingBuildingView(prev => ({
      ...prev,
      [buildingId]: { ...prev[buildingId], [viewType]: true }
    }));
    try {
      await generateBuildingImage(buildingId, {
        imageModel,
        textModel: aiSelected?.text || undefined,
        viewType,
      });
      showToast(`${viewType === 'interior' ? '室内' : '室外'}图生成已启动`, 'success');
      loadAll();
      onSaved();
    } catch (err: any) {
      showToast(err?.message || '生成失败', 'error');
    } finally {
      setGeneratingBuildingView(prev => ({
        ...prev,
        [buildingId]: { ...prev[buildingId], [viewType]: false }
      }));
    }
  };

  // 候选池过滤
  const currentEnv = detail?.environment || null;
  const studioBuildingIds = new Set((detail?.buildings || []).map(b => b.id));
  const studioElementIds = new Set((detail?.elements || []).map(e => e.id));
  const availableBuildings = projectBuildings.filter(b => !studioBuildingIds.has(b.id));
  const availableElements = projectElements.filter(e => !studioElementIds.has(e.id));

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        base: 'bg-(--bg-card)',
        backdrop: 'bg-black/40 backdrop-blur-sm',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <Film className="w-5 h-5 text-(--accent)" />
              {editMode ? '编辑影棚' : '新建影棚'}
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 基础信息 */}
                  <div className="space-y-3">
                    <Input
                      label="影棚名称"
                      placeholder="如：蜜糖草地小屋"
                      value={name}
                      onValueChange={setName}
                      isRequired
                    />
                    <Textarea
                      label="描述"
                      placeholder="影棚的氛围、功能定位、故事背景..."
                      value={description}
                      onValueChange={setDescription}
                      minRows={2}
                      maxRows={5}
                    />
                  </div>

                  {editMode && studioId ? (
                    <Tabs
                      classNames={{
                        tabList: 'bg-(--bg-app) border border-(--border-color)',
                        tab: 'text-(--text-muted) data-[selected=true]:text-(--accent-light)',
                        cursor: 'bg-(--accent)',
                      }}
                    >
                      {/* ===== 环境 Tab ===== */}
                      <Tab
                        key="environment"
                        title={
                          <div className="flex items-center gap-2">
                            <Cloud className="w-4 h-4" />
                            <span>环境 ({currentEnv ? 1 : 0})</span>
                          </div>
                        }
                      >
                        <div className="mt-4 space-y-4">
                          <div>
                            <div className="text-xs text-(--text-muted) mb-2">当前环境（1:1）</div>
                            {currentEnv ? (
                              <>
                                <div className="flex items-center gap-3 p-2 rounded-md bg-(--bg-app) border border-(--border-color)">
                                  {currentEnv.image_url ? (
                                    <Image
                                      src={currentEnv.image_url}
                                      alt={currentEnv.name}
                                      removeWrapper
                                      className="w-12 h-12 object-cover rounded shrink-0"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0">
                                      <Cloud className="w-5 h-5" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-(--text-primary) truncate">{currentEnv.name}</div>
                                    <div className="text-[11px] text-(--text-muted) truncate">
                                      {currentEnv.description || '无描述'}
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    isIconOnly
                                    variant="light"
                                    onPress={handleDetachEnvironment}
                                    className="hover:bg-red-500/10"
                                    title="移除环境"
                                  >
                                    <X className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>

                                {/* 组装图采用哪一面 + 生成按钮 */}
                                {(() => {
                                  const envView = detail?.studio?.environment_view === 'back' ? 'back' : 'front';
                                  const hasFront = !!currentEnv.image_url;
                                  const hasBack = !!currentEnv.image_back_url;
                                  const isGenFront = !!generatingEnvView.front;
                                  const isGenBack = !!generatingEnvView.back;
                                  return (
                                    <div className="mt-2 p-2 rounded-md bg-(--bg-app) border border-(--border-color)">
                                      <div className="text-[11px] text-(--text-muted) mb-2 flex items-center gap-1">
                                        <LayoutGrid className="w-3 h-3" />
                                        组装图采用此环境的哪一面
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {/* 正面 */}
                                        <div className="flex-1 flex flex-col gap-1">
                                          <button
                                            type="button"
                                            disabled={!hasFront}
                                            onClick={() => handleSetEnvView('front')}
                                            className={`w-full flex items-center gap-2 p-1.5 rounded border transition ${
                                              envView === 'front'
                                                ? 'border-(--accent) bg-(--accent)/10 ring-1 ring-(--accent)'
                                                : 'border-(--border-color) hover:bg-(--bg-input)'
                                            } ${!hasFront ? 'opacity-40 cursor-not-allowed' : ''}`}
                                          >
                                            {hasFront ? (
                                              <img src={currentEnv.image_url || ''} alt="正面" className="w-10 h-10 object-cover rounded" />
                                            ) : (
                                              <div className="w-10 h-10 rounded bg-(--bg-input) flex items-center justify-center text-[10px] text-(--text-muted)">
                                                无
                                              </div>
                                            )}
                                            <div className="flex flex-col items-start">
                                              <span className="text-xs text-(--text-primary)">正面</span>
                                              {envView === 'front' && <span className="text-[10px] text-(--accent)">✓ 已选</span>}
                                            </div>
                                          </button>
                                          <Button
                                            size="sm"
                                            variant="flat"
                                            color={hasFront ? 'default' : 'primary'}
                                            isLoading={isGenFront}
                                            isDisabled={isGenFront || isGenBack}
                                            onPress={() => handleGenerateEnvImage('front')}
                                            startContent={!isGenFront ? <Wand2 className="w-3 h-3" /> : undefined}
                                            className="w-full text-[11px] h-7"
                                          >
                                            {hasFront ? '重新生成正面' : '生成正面'}
                                          </Button>
                                        </div>
                                        {/* 背面 */}
                                        <div className="flex-1 flex flex-col gap-1">
                                          <button
                                            type="button"
                                            disabled={!hasBack}
                                            onClick={() => handleSetEnvView('back')}
                                            className={`w-full flex items-center gap-2 p-1.5 rounded border transition ${
                                              envView === 'back'
                                                ? 'border-(--accent) bg-(--accent)/10 ring-1 ring-(--accent)'
                                                : 'border-(--border-color) hover:bg-(--bg-input)'
                                            } ${!hasBack ? 'opacity-40 cursor-not-allowed' : ''}`}
                                          >
                                            {hasBack ? (
                                              <img src={currentEnv.image_back_url || ''} alt="背面" className="w-10 h-10 object-cover rounded" />
                                            ) : (
                                              <div className="w-10 h-10 rounded bg-(--bg-input) flex items-center justify-center text-[10px] text-(--text-muted)">
                                                无
                                              </div>
                                            )}
                                            <div className="flex flex-col items-start">
                                              <span className="text-xs text-(--text-primary)">背面</span>
                                              {envView === 'back' && <span className="text-[10px] text-(--accent)">✓ 已选</span>}
                                            </div>
                                          </button>
                                          <Button
                                            size="sm"
                                            variant="flat"
                                            color={hasBack ? 'default' : 'primary'}
                                            isLoading={isGenBack}
                                            isDisabled={isGenFront || isGenBack}
                                            onPress={() => handleGenerateEnvImage('back')}
                                            startContent={!isGenBack ? <Wand2 className="w-3 h-3" /> : undefined}
                                            className="w-full text-[11px] h-7"
                                          >
                                            {hasBack ? '重新生成背面' : '生成背面'}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </>
                            ) : (
                              <div className="text-xs text-(--text-muted)">尚未设置环境</div>
                            )}
                          </div>

                          {/* 九宫组装图（独立区块，不依赖环境绑定） */}
                          <div className="p-2 rounded-md bg-(--bg-app) border border-(--border-color)">
                            <div className="text-xs text-(--text-muted) mb-2 flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <LayoutGrid className="w-3 h-3" />
                                九宫组装图（3×3 九机位视角）
                              </span>
                              <Button
                                size="sm"
                                variant="flat"
                                color="primary"
                                className="h-6 text-[11px]"
                                isLoading={generatingNineGrid || detail?.studio?.nine_grid_generation_status === 'generating'}
                                onPress={handleGenerateNineGrid}
                                isDisabled={!detail?.environment && !detail?.buildings?.length}
                              >
                                {detail?.studio?.nine_grid_image_url ? '重新生成' : '生成九宫图'}
                              </Button>
                            </div>
                            {detail?.studio?.nine_grid_image_url ? (
                              <img
                                src={detail.studio.nine_grid_image_url}
                                alt="九宫组装图"
                                className="w-full rounded border border-(--border-color) object-contain"
                              />
                            ) : detail?.studio?.nine_grid_generation_status === 'generating' ? (
                              <div className="text-xs text-(--text-muted)">生成中…</div>
                            ) : detail?.studio?.nine_grid_generation_status === 'failed' ? (
                              <div className="text-xs text-red-400">上次生成失败，可重试</div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">
                                {(detail?.environment || detail?.buildings?.length)
                                  ? '尚未生成，点击右上角按钮启动'
                                  : '需先绑定环境或关联至少 1 座建筑'}
                              </div>
                            )}
                          </div>

                          {/* 影棚全景图入口已移除 —— 统一由"九宫组装图"承担影棚可视化 */}

                          <div>
                            <div className="text-xs text-(--text-muted) mb-2">项目内可选环境</div>
                            {projectEnvironments.length ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {projectEnvironments.map(env => (
                                  <div
                                    key={env.id}
                                    className="flex items-center gap-3 p-2 rounded-md bg-(--bg-app) border border-(--border-color)"
                                  >
                                    {env.image_url ? (
                                      <Image
                                        src={env.image_url}
                                        alt={env.name}
                                        removeWrapper
                                        className="w-12 h-12 object-cover rounded shrink-0"
                                      />
                                    ) : (
                                      <div className="w-12 h-12 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0">
                                        <Cloud className="w-5 h-5" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-(--text-primary) truncate">{env.name}</div>
                                      <div className="text-[11px] text-(--text-muted) truncate">
                                        {env.description || '无描述'}
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="flat"
                                      color={currentEnv?.id === env.id ? 'default' : 'primary'}
                                      startContent={<Plus className="w-3 h-3" />}
                                      onPress={() => handleAttachEnvironment(env.id)}
                                      isDisabled={currentEnv?.id === env.id}
                                    >
                                      {currentEnv?.id === env.id ? '已选' : '设为环境'}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">项目内没有可选环境，请先到资产页新建</div>
                            )}
                          </div>
                        </div>
                      </Tab>

                      {/* ===== 建筑 Tab ===== */}
                      <Tab
                        key="buildings"
                        title={
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            <span>建筑 ({detail?.buildings?.length || 0})</span>
                          </div>
                        }
                      >
                        <div className="mt-4 space-y-4">
                          <div>
                            <div className="text-xs text-(--text-muted) mb-2">已关联建筑</div>
                            {detail?.buildings?.length ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {detail.buildings.map(b => {
                                  // 影棚组装时允许自由选择生成室内或室外视图
                                  const canInterior = true;
                                  const canExterior = true;
                                  const genState = generatingBuildingView[b.id] || {};
                                  const bView = (b as any).building_view === 'interior' ? 'interior' : 'exterior';
                                  const bHasExterior = !!b.exterior_image_url;
                                  const bHasInterior = !!b.interior_image_url;
                                  return (
                                    <div
                                      key={b.id}
                                      className="p-2 rounded-md bg-(--bg-app) border border-(--border-color) space-y-2"
                                    >
                                      <div className="flex items-center gap-3">
                                        {b.image_url ? (
                                          <Image
                                            src={b.image_url}
                                            alt={b.name}
                                            removeWrapper
                                            className="w-12 h-12 object-cover rounded shrink-0"
                                          />
                                        ) : (
                                          <div className="w-12 h-12 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0">
                                            <Building2 className="w-5 h-5" />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm text-(--text-primary) truncate">{b.name}</div>
                                          <div className="text-[11px] text-(--text-muted) truncate">
                                            {b.description || '无描述'}
                                          </div>
                                        </div>
                                        <Button
                                          size="sm"
                                          isIconOnly
                                          variant="light"
                                          onPress={() => handleDetachBuilding(b.id)}
                                          className="hover:bg-red-500/10"
                                          title="解除建筑"
                                        >
                                          <X className="w-4 h-4 text-red-500" />
                                        </Button>
                                      </div>

                                      {/* 组装视图（外/内）选择 —— 决定九宫图用哪张参考 */}
                                      <div className="flex items-center gap-2 pl-1">
                                        <div className="text-[10px] text-(--text-muted) flex items-center gap-1 shrink-0">
                                          <LayoutGrid className="w-3 h-3" />
                                          组装用：
                                        </div>
                                        <Chip
                                          size="sm"
                                          variant={bView === 'exterior' ? 'solid' : 'flat'}
                                          color={bView === 'exterior' ? 'primary' : 'default'}
                                          className={`cursor-pointer text-[10px] ${!bHasExterior ? 'opacity-40' : ''}`}
                                          onClick={() => bHasExterior && handleSetBuildingView(b.id, 'exterior')}
                                        >
                                          外景{bView === 'exterior' ? ' ✓' : ''}
                                        </Chip>
                                        <Chip
                                          size="sm"
                                          variant={bView === 'interior' ? 'solid' : 'flat'}
                                          color={bView === 'interior' ? 'primary' : 'default'}
                                          className={`cursor-pointer text-[10px] ${!bHasInterior ? 'opacity-40' : ''}`}
                                          onClick={() => bHasInterior && handleSetBuildingView(b.id, 'interior')}
                                        >
                                          内景{bView === 'interior' ? ' ✓' : ''}
                                        </Chip>
                                      </div>

                                      {/* 室内/室外视图 */}
                                      <div className="flex items-center gap-2">
                                        {canInterior && (
                                          <div className="flex items-center gap-1.5 flex-1">
                                            {b.interior_image_url ? (
                                              <Image
                                                src={b.interior_image_url}
                                                alt="室内"
                                                removeWrapper
                                                className="w-8 h-8 object-cover rounded shrink-0"
                                              />
                                            ) : (
                                              <div className="w-8 h-8 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0 text-[10px]">
                                                内
                                              </div>
                                            )}
                                            <Button
                                              size="sm"
                                              variant="flat"
                                              color="primary"
                                              className="h-6 text-[10px] px-2"
                                              isLoading={genState.interior}
                                              onPress={() => handleGenerateBuildingView(b.id, 'interior')}
                                            >
                                              {b.interior_image_url ? '重新生成室内' : '生成室内'}
                                            </Button>
                                          </div>
                                        )}
                                        {canExterior && (
                                          <div className="flex items-center gap-1.5 flex-1">
                                            {b.exterior_image_url ? (
                                              <Image
                                                src={b.exterior_image_url}
                                                alt="室外"
                                                removeWrapper
                                                className="w-8 h-8 object-cover rounded shrink-0"
                                              />
                                            ) : (
                                              <div className="w-8 h-8 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0 text-[10px]">
                                                外
                                              </div>
                                            )}
                                            <Button
                                              size="sm"
                                              variant="flat"
                                              color="primary"
                                              className="h-6 text-[10px] px-2"
                                              isLoading={genState.exterior}
                                              onPress={() => handleGenerateBuildingView(b.id, 'exterior')}
                                            >
                                              {b.exterior_image_url ? '重新生成室外' : '生成室外'}
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">尚未关联任何建筑</div>
                            )}
                          </div>

                          <div>
                            <div className="text-xs text-(--text-muted) mb-2">项目内所有建筑</div>
                            {projectBuildings.length ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {projectBuildings.map(b => {
                                  const isLinked = studioBuildingIds.has(b.id);
                                  return (
                                    <div
                                      key={b.id}
                                      className={`flex items-center gap-3 p-2 rounded-md bg-(--bg-app) border border-(--border-color) ${isLinked ? 'opacity-60' : ''}`}
                                    >
                                      {b.image_url ? (
                                        <Image
                                          src={b.image_url}
                                          alt={b.name}
                                          removeWrapper
                                          className="w-12 h-12 object-cover rounded shrink-0"
                                        />
                                      ) : (
                                        <div className="w-12 h-12 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0">
                                          <Building2 className="w-5 h-5" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm text-(--text-primary) truncate">{b.name}</div>
                                        <div className="text-[11px] text-(--text-muted) truncate">
                                          {b.description || '无描述'}
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="flat"
                                        color={isLinked ? 'default' : 'primary'}
                                        startContent={!isLinked ? <Plus className="w-3 h-3" /> : undefined}
                                        onPress={() => handleAttachBuilding(b.id)}
                                        isDisabled={isLinked}
                                      >
                                        {isLinked ? '已关联' : '关联'}
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">项目内没有建筑，请先到资产页新建</div>
                            )}
                          </div>
                        </div>
                      </Tab>

                      {/* ===== 元素 Tab ===== */}
                      <Tab
                        key="elements"
                        title={
                          <div className="flex items-center gap-2">
                            <Box className="w-4 h-4" />
                            <span>影棚元素 ({detail?.elements?.length || 0})</span>
                          </div>
                        }
                      >
                        <div className="mt-4 space-y-4">
                          <div>
                            <div className="text-xs text-(--text-muted) mb-2">本影棚已含元素</div>
                            {detail?.elements?.length ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {detail.elements.map(e => {
                                  const Icon = e.category === 'building' ? Hammer : Mountain;
                                  return (
                                    <div
                                      key={e.id}
                                      className="flex items-center gap-3 p-2 rounded-md bg-(--bg-app) border border-(--border-color)"
                                    >
                                      {e.image_url ? (
                                        <Image
                                          src={e.image_url}
                                          alt={e.name}
                                          removeWrapper
                                          className="w-12 h-12 object-cover rounded shrink-0"
                                        />
                                      ) : (
                                        <div className="w-12 h-12 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0">
                                          <Icon className="w-5 h-5" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm text-(--text-primary) truncate flex items-center gap-2">
                                          {e.name}
                                          <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-500 text-[10px]">
                                            {e.category === 'building' ? '建筑' : '影棚'}
                                          </Chip>
                                        </div>
                                        <div className="text-[11px] text-(--text-muted) truncate">
                                          {e.description || '无描述'}
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        isIconOnly
                                        variant="light"
                                        onPress={() => handleDetachElement(e.id)}
                                        className="hover:bg-red-500/10"
                                        title="解除关联"
                                      >
                                        <X className="w-4 h-4 text-red-500" />
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">尚未关联任何元素</div>
                            )}
                          </div>

                          <div>
                            <div className="text-xs text-(--text-muted) mb-2">项目内可关联元素</div>
                            {availableElements.length ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {availableElements.map(e => {
                                  const Icon = e.category === 'building' ? Hammer : Mountain;
                                  return (
                                    <div
                                      key={e.id}
                                      className="flex items-center gap-3 p-2 rounded-md bg-(--bg-app) border border-(--border-color)"
                                    >
                                      {e.image_url ? (
                                        <Image
                                          src={e.image_url}
                                          alt={e.name}
                                          removeWrapper
                                          className="w-12 h-12 object-cover rounded shrink-0"
                                        />
                                      ) : (
                                        <div className="w-12 h-12 rounded bg-(--bg-input) flex items-center justify-center text-(--text-muted) shrink-0">
                                          <Icon className="w-5 h-5" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm text-(--text-primary) truncate flex items-center gap-2">
                                          {e.name}
                                          <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-500 text-[10px]">
                                            {e.category === 'building' ? '建筑' : '影棚'}
                                          </Chip>
                                        </div>
                                        <div className="text-[11px] text-(--text-muted) truncate">
                                          {e.description || '无描述'}
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="flat"
                                        color="primary"
                                        startContent={<Plus className="w-3 h-3" />}
                                        onPress={() => handleAttachElement(e.id)}
                                      >
                                        关联
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">项目内没有可关联元素</div>
                            )}
                          </div>
                        </div>
                      </Tab>
                    </Tabs>
                  ) : (
                    <div className="text-xs text-(--text-muted) pt-2">
                      提示：保存后即可在下方管理影棚的环境、建筑与元素。
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                关闭
              </Button>
              <Button
                color="primary"
                onPress={handleSaveBasic}
                isLoading={saving}
                isDisabled={!name.trim() || saving}
              >
                {editMode ? '保存修改' : '创建'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default StudioModal;
