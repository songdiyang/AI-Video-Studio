import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Textarea, Tabs, Tab, Chip, Image, Spinner,
} from '@heroui/react';
import { Box, Plus, X, Film, Hammer, Mountain, Cloud, Building2 } from 'lucide-react';
import {
  StudioDetail,
  getStudio, createStudio, updateStudio,
  attachEnvironmentToStudio, detachEnvironmentFromStudio,
  attachBuildingToStudio, detachBuildingFromStudio,
  attachElementToStudio, detachElementFromStudio,
} from '../../../services/studios';
import { listEnvironments, Environment } from '../../../services/environments';
import { listBuildings, Building } from '../../../services/buildings';
import { listSceneElements, SceneElement } from '../../../services/sceneElements';
import { useToast } from '../../../contexts/ToastContext';

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
      if (editMode && studioId) {
        const d = await getStudio(studioId);
        setDetail(d);
        setName(d.studio.name);
        setDescription(d.studio.description || '');
        setCoverImageUrl(d.studio.cover_image_url || '');
      } else {
        setDetail(null);
        setName('');
        setDescription('');
        setCoverImageUrl('');
      }

      if (projectId) {
        const [envs, builds, elements] = await Promise.all([
          listEnvironments(projectId),
          listBuildings(projectId),
          listSceneElements({ projectId }),
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
                            ) : (
                              <div className="text-xs text-(--text-muted)">尚未设置环境</div>
                            )}
                          </div>

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
                                {detail.buildings.map(b => (
                                  <div
                                    key={b.id}
                                    className="flex items-center gap-3 p-2 rounded-md bg-(--bg-app) border border-(--border-color)"
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
                                      isIconOnly
                                      variant="light"
                                      onPress={() => handleDetachBuilding(b.id)}
                                      className="hover:bg-red-500/10"
                                      title="解除建筑"
                                    >
                                      <X className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">尚未关联任何建筑</div>
                            )}
                          </div>

                          <div>
                            <div className="text-xs text-(--text-muted) mb-2">项目内可关联建筑</div>
                            {availableBuildings.length ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {availableBuildings.map(b => (
                                  <div
                                    key={b.id}
                                    className="flex items-center gap-3 p-2 rounded-md bg-(--bg-app) border border-(--border-color)"
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
                                      color="primary"
                                      startContent={<Plus className="w-3 h-3" />}
                                      onPress={() => handleAttachBuilding(b.id)}
                                    >
                                      关联
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-(--text-muted)">项目内没有可关联建筑</div>
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
