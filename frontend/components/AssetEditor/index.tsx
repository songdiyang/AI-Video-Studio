import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Textarea, Select, SelectItem } from '@heroui/react';
import { FileText, Layers, Image as ImageIcon, Camera, Wand2, Trash2 } from 'lucide-react';
import ContentEditorPanel, { type EmbeddedEditorProps, type EditorSessionHandle, type EditorSaveStatus } from '../ContentEditorPanel';
import AssetSceneRelations from '../AssetSceneRelations';
import AIModelSelector from '../AIModelSelector';
import { updateCharacter, updateScene, updateProp, updatePropStyleConfig, updateCharacterUseReferenceImages } from '../../services/assets';
import { updateScript } from '../../services/scripts';
import { updateCostume, fetchCostume, COSTUME_CATEGORIES } from '../../services/costumes';
import { updateEnvironment, generateEnvironmentImage, deleteEnvironment, getEnvironment, listEnvironments, type Environment } from '../../services/environments';
import { updateBuilding, generateBuildingImage, deleteBuilding, getBuilding, listBuildings, type Building } from '../../services/buildings';
import { updateStudio, getStudio, type StudioDetail, attachEnvironmentToStudio, detachEnvironmentFromStudio,
  attachBuildingToStudio, detachBuildingFromStudio, setStudioEnvironmentView, setStudioBuildingView, generateStudioNineGrid } from '../../services/studios';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { usePreview } from '../PreviewProvider';
import CharacterStateEditor from '../../views/AssetsManager/AssetModel/CharacterStateEditor';
import ReferenceImageManager from '../../views/AssetsManager/AssetModel/ReferenceImageManager';
import PropStyleConfigPanel from '../../views/AssetsManager/AssetModel/PropStyleConfig';
import { useAIModels } from '../../hooks/useAIModels';
import { StoryboardScene } from '../../views/StoryBoard/useSceneManager';
import { ResourceDraft, ASSET_FIELDS, normalizeAsset, assetSavedData, pickResourceFields, type ResourceData } from './resourceDraft';
import { ASSET_FIELD_CLASS_NAMES, ASSET_SELECT_CLASS_NAMES } from './fieldStyles';
import { useResourceDraft } from './useResourceDraft';

export interface AssetEditorProps extends EmbeddedEditorProps {
  tabId: string;
  assetType: string;
  initialData?: any;
  onClose: () => void;
  scenes?: StoryboardScene[];
  onSelectScene?: (sceneId: number) => void;
  onSaved?: (data: any) => void;
}
const LABELS: Record<string, string> = { character: '角色', scene: '场景', studio: '影棚', prop: '道具',
  costume: '服装', environment: '环境', building: '建筑', script: '剧本' };

/** 每个对象独立会话，旧请求即使稍后返回也不能写入后来选中的对象。 */
const AssetEditor: React.FC<AssetEditorProps> = props => (
  <AssetEditorSession key={`${props.initialData?.project_id ?? ''}:${props.assetType}:${props.initialData?.id ?? props.tabId}`} {...props} />
);
const AssetEditorSession: React.FC<AssetEditorProps> = ({ tabId, assetType, initialData, onClose, scenes = [],
  onSelectScene, onSaved, editorPortalTarget, onRegisterEditor }) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { openPreview } = usePreview();
  const assetId = Number(initialData?.id ?? tabId.split('-').at(-1));
  const embedded = editorPortalTarget !== undefined;
  const kind = LABELS[assetType] || '资源';
  const [activeTab, setActiveTab] = useState('content');
  const [session] = useState(() => new ResourceDraft(
    { ...normalizeAsset(assetType, initialData), id: assetId, project_id: initialData?.project_id },
    ASSET_FIELDS[assetType] || [],
    async (patch, snapshot) => {
      if (!Number.isFinite(assetId) || assetId <= 0) throw new Error('无法解析资源 ID');
      if (!snapshot.name?.trim()) throw new Error(`${kind}名称不能为空`);
      let result: ResourceData | undefined;
      switch (assetType) {
        case 'character': result = await updateCharacter(assetId, patch); break;
        case 'scene':
          // 旧接口使用 value || existing，不能把未落库的清空误报为成功。
          if (Object.values(patch).some(value => value === '')) throw new Error('旧场景接口暂不支持清空字段；草稿已保留，请修改后重试');
          result = await updateScene(assetId, patch); break;
        case 'studio': result = await updateStudio(assetId, patch); break;
        case 'prop': {
          const { style_config, ...basic } = patch;
          if (Object.keys(basic).length) result = await updateProp(assetId, basic);
          if (style_config !== undefined) {
            await updatePropStyleConfig(assetId, style_config);
            result = { ...result, style_config };
          }
          break;
        }
        case 'costume': {
          // 旧服装 PUT 是全量替换：媒体只来自刚读取的服务端记录，绝不取草稿/旧闭包。
          const latest = await fetchCostume(assetId);
          if (latest.generation_status === 'generating') throw new Error('服装生成中，为保护新图片请完成后重试保存');
          result = await updateCostume(assetId, {
            ...pickResourceFields(latest, ASSET_FIELDS.costume), ...patch,
            image_url: latest.image_url, front_view_url: latest.front_view_url,
            side_view_url: latest.side_view_url, back_view_url: latest.back_view_url,
          });
          break;
        }
        case 'environment': result = await updateEnvironment(assetId, patch); break;
        case 'building': result = await updateBuilding(assetId, patch); break;
        case 'script': await updateScript(assetId, snapshot.name, snapshot.content || ''); result = pickResourceFields(snapshot, ASSET_FIELDS.script); break;
        default: throw new Error('暂不支持该资源类型');
      }
      return normalizeAsset(assetType, result);
    },
  ));
  const formData = useResourceDraft(session, data => onSaved?.(assetSavedData(assetType, data)));
  const { models, selected, setSelected } = useAIModels(formData.project_id || null);
  const alive = useRef(true);
  const callbacks = useRef({ onSaved, onClose, onSelectScene });
  callbacks.current = { onSaved, onClose, onSelectScene };
  const [studioDetail, setStudioDetail] = useState<StudioDetail | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [generationError, setGenerationError] = useState('');
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propPollSequence = useRef(0);
  const refreshSequence = useRef(0);
  const stateEditor = useRef<EditorSessionHandle | null>(null);
  const [stateStatus, setStateStatus] = useState<EditorSaveStatus>('idle');
  const [stateTitle, setStateTitle] = useState('');
  const [stateFieldsTarget, setStateFieldsTarget] = useState<HTMLDivElement | null>(null);
  const [stateActionsTarget, setStateActionsTarget] = useState<HTMLDivElement | null>(null);
  const registerStateEditor = useCallback((handle: EditorSessionHandle | null) => { stateEditor.current = handle; }, []);
  const stateStatusChange = useCallback((status: EditorSaveStatus, title: string) => { setStateStatus(status); setStateTitle(title); }, []);
  const flushAsset = useCallback(() => session.flush(), [session]);
  const flushRef = useRef<Promise<boolean> | null>(null);
  const flush = useCallback((): Promise<boolean> => {
    if (flushRef.current) return flushRef.current;
    flushRef.current = (async () => {
      if (!(await flushAsset())) return false;
      if (stateEditor.current && !(await stateEditor.current.flush())) return false;
      // 子状态保存期间角色本体仍可输入，离开前再次排空。
      return flushAsset();
    })().finally(() => { flushRef.current = null; });
    return flushRef.current;
  }, [flushAsset]);
  useEffect(() => { onRegisterEditor?.({ flush }); return () => onRegisterEditor?.(null); }, [onRegisterEditor, flush]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; propPollSequence.current++; if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, []);
  useEffect(() => { if (initialData) session.receive(normalizeAsset(assetType, initialData)); }, [initialData, assetType, session]);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const checkpoint = session.revision;
    try {
      let data: ResourceData | undefined;
      if (assetType === 'environment') data = await getEnvironment(assetId);
      else if (assetType === 'building') data = await getBuilding(assetId);
      else if (assetType === 'costume') data = await fetchCostume(assetId);
      else if (assetType === 'scene' || assetType === 'studio') {
        const detail = await getStudio(assetId);
        if (!alive.current || sequence !== refreshSequence.current) return;
        if (!detail?.studio || !Array.isArray(detail.buildings)) throw new Error('影棚组装数据不完整，请重试加载');
        setStudioDetail(detail);
        // scene 和 studio 并非同一保存模型，不能回填另一实体的内容字段。
        if (assetType === 'studio') data = detail.studio;
      }
      if (!alive.current || sequence !== refreshSequence.current) return;
      if (data) session.receive(normalizeAsset(assetType, data), checkpoint);
      setLoadError('');
    } catch (error: any) { if (alive.current && sequence === refreshSequence.current) setLoadError(error.message || '加载资源详情失败'); }
  }, [assetId, assetType, session]);
  useEffect(() => {
    void refresh();
    if ((assetType === 'scene' || assetType === 'studio') && formData.project_id) {
      Promise.all([listEnvironments(formData.project_id), listBuildings(formData.project_id)]).then(([envs, blds]) => {
        if (alive.current) { setEnvironments(envs); setBuildings(blds); }
      }).catch(error => { if (alive.current) setLoadError(error.message); });
    }
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.[`${assetType}Id`] === assetId) void refresh();
    };
    const eventName = `${assetType}:updated`;
    window.addEventListener(eventName, handleUpdated);
    return () => window.removeEventListener(eventName, handleUpdated);
  }, [assetId, assetType, formData.project_id, refresh]);

  const runOperation = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      if (!(await flush()) || !alive.current) return;
      await operation();
    } catch (error: any) { if (alive.current) showToast(error.message || '操作失败', 'error'); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const assemblyOperation = (operation: () => Promise<void>) => runOperation(async () => { await operation(); await refresh(); });
  const publishMedia = (data: ResourceData) => {
    if (!alive.current) return;
    session.media(data);
    // 不把正在编辑的未保存名称回传成已保存内容。
    if (!session.dirty) callbacks.current.onSaved?.(assetSavedData(assetType, session.data));
  };
  const pollProp = (attempt = 0, sequence = ++propPollSequence.current) => {
    if (!alive.current) return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    void (async () => {
      try {
        const response = await fetch(`/api/props/${assetId}/generation-status`);
        if (!response.ok) throw new Error('查询道具生成状态失败');
        const data = await response.json();
        if (!alive.current || sequence !== propPollSequence.current) return;
        publishMedia({ generation_status: data.status, ...(data.imageUrl ? { image_url: data.imageUrl } : {}) });
        if (data.status === 'failed') throw new Error('道具设定图生成失败，请重试');
        if (data.status === 'completed') { setGenerationError(''); return; }
        if (data.status !== 'generating') return;
        if (attempt >= 60) throw new Error('生成状态查询超时，请刷新状态后重试');
        pollTimer.current = setTimeout(() => pollProp(attempt + 1, sequence), 3000);
      } catch (error: any) { if (alive.current && sequence === propPollSequence.current) setGenerationError(error.message); }
    })();
  };
  const generate = (view?: string) => runOperation(async () => {
    if (!selected.image) throw new Error('请先选择图像生成模型');
    if (session.data.generation_status === 'generating' || studioDetail?.studio.nine_grid_generation_status === 'generating') return;
    setGenerationError('');
    try {
      const params = { imageModel: selected.image, textModel: selected.text || undefined };
      if (assetType === 'environment') await generateEnvironmentImage(assetId, { ...params, mode: view as 'front' | 'back' | 'both' });
      else if (assetType === 'building') await generateBuildingImage(assetId, { ...params, viewType: view as 'exterior' | 'interior' | 'both' });
      else if (assetType === 'scene' || assetType === 'studio') {
        if (!studioDetail || (!studioDetail.environment && !studioDetail.buildings.length)) throw new Error('请先绑定环境或关联建筑');
        await generateStudioNineGrid(studioDetail.studio.id, params);
        if (alive.current) setStudioDetail(prev => prev ? { ...prev, studio: { ...prev.studio, nine_grid_generation_status: 'generating' } } : prev);
      } else if (assetType === 'prop') {
        const response = await fetch(`/api/props/${assetId}/generate-image`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...params, styleConfig: session.data.style_config || {} }),
        });
        if (!response.ok) { const data = await response.json(); throw new Error(data.message || '启动生成失败'); }
      }
      if (!alive.current) return;
      if (assetType !== 'scene' && assetType !== 'studio') publishMedia({ generation_status: 'generating' });
      showToast('生成任务已启动', 'success');
      if (assetType === 'prop') pollProp(); else await refresh();
    } catch (error: any) { if (alive.current) setGenerationError(error.message || '生成失败，请重试'); }
  });
  const deleteAsset = () => runOperation(async () => {
    const ok = await confirm({ title: `删除${kind}`, message: `确定删除「${session.data.name}」？此操作不可撤销。`, type: 'danger', confirmText: '删除' });
    if (!ok || !alive.current) return;
    if (assetType === 'environment') await deleteEnvironment(assetId); else await deleteBuilding(assetId);
    if (!alive.current) return;
    window.dispatchEvent(new CustomEvent(`${assetType}:deleted`, { detail: { [`${assetType}Id`]: assetId } }));
    callbacks.current.onClose();
  });
  const switchTab = async (tab: string) => { if (tab === activeTab) return; if (await flush() && alive.current) setActiveTab(tab); };
  const field = (key: string, label: string, multiline = false) => (
    <div key={key} className={multiline ? 'content-editor-field content-editor-full-width' : 'content-editor-field'}>
      {multiline ? <Textarea size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label={label} value={formData[key] ?? ''} onValueChange={value => session.edit({ [key]: value })} minRows={3} />
        : <Input size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label={label} value={formData[key] ?? ''} onValueChange={value => session.edit({ [key]: value })} />}
    </div>
  );
  const selectField = (key: string, label: string, options: [string, string][]) => (
    <Select size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_SELECT_CLASS_NAMES} className="content-editor-field" label={label} selectedKeys={formData[key] ? [formData[key]] : []}
      onSelectionChange={keys => { const value = Array.from(keys)[0]; if (value != null) session.edit({ [key]: value }); }}>
      {options.map(([value, text]) => <SelectItem key={value} textValue={text}>{text}</SelectItem>)}
    </Select>
  );
  const renderProperties = () => (
    <div className="content-editor-fields">
      {assetType === 'character' && field('personality', '性格')}
      {assetType === 'scene' && <>{field('environment', '环境')}{field('lighting', '光线')}{field('mood', '氛围')}</>}
      {assetType === 'prop' && <>{selectField('prop_type', '道具类型', [['held', '手持道具'], ['permanent', '永久道具'], ['interactive', '交互道具']])}{field('category', '道具分类')}
        <div className="content-editor-full-width resource-editor-prop-style"><PropStyleConfigPanel value={typeof formData.style_config === 'object' ? formData.style_config || {} : {}} onChange={value => session.edit({ style_config: value })} /></div></>}
      {assetType === 'costume' && <>{selectField('category', '服装分类', COSTUME_CATEGORIES.map(c => [c, c]))}
        {selectField('gender', '适用性别', [['male', '男性'], ['female', '女性'], ['unisex', '通用']])}</>}
      {assetType === 'environment' && <>{field('timeOfDay', '时间')}{field('weather', '天气')}{field('lighting', '光照')}{field('mood', '氛围')}{field('terrainType', '地貌类型')}</>}
      {assetType === 'building' && <>{selectField('interiorExterior', '内外景', [['interior', '室内'], ['exterior', '室外'], ['both', '室内外']])}{field('structureType', '结构类型')}</>}
      {ASSET_FIELDS[assetType]?.includes('tags') && field('tags', '标签（逗号分隔）')}
    </div>
  );
  const renderAssembly = () => {
    if (!studioDetail) return <p>影棚组装信息尚未加载。<Button size="sm" onPress={() => { void refresh(); }}>重试加载</Button></p>;
    const env = studioDetail.environment;
    const studioId = studioDetail.studio.id;
    return <div className="content-editor-fields">
      <div className="content-editor-field space-y-2"><h4>环境绑定</h4>
        {env ? <><p>{env.name}</p><div className="flex flex-wrap gap-2">
          {(['front', 'back'] as const).map(view => <Button key={view} size="sm" variant={studioDetail.studio.environment_view === view ? 'solid' : 'flat'}
            isDisabled={busy || !(view === 'front' ? env.image_url : env.image_back_url)} onPress={() => { void assemblyOperation(() => setStudioEnvironmentView(studioId, view)); }}>{view === 'front' ? '正面' : '背面'}</Button>)}
          <Button size="sm" isDisabled={busy} onPress={() => { void assemblyOperation(() => detachEnvironmentFromStudio(studioId)); }}>解绑环境</Button></div></>
          : <Select label="选择环境" selectedKeys={[]} isDisabled={busy} onSelectionChange={keys => { const id = Number(Array.from(keys)[0]); if (id) void assemblyOperation(() => attachEnvironmentToStudio(studioId, id)); }}>
            {environments.map(item => <SelectItem key={String(item.id)} textValue={item.name}>{item.name}</SelectItem>)}</Select>}
      </div>
      <div className="content-editor-field space-y-2"><h4>建筑关联</h4>
        {studioDetail.buildings.map(item => <div key={item.id} className="space-y-1"><p>{item.name}</p><div className="flex flex-wrap gap-2">
          {(['exterior', 'interior'] as const).map(view => <Button key={view} size="sm" variant={item.building_view === view ? 'solid' : 'flat'}
            isDisabled={busy || !(view === 'exterior' ? item.exterior_image_url : item.interior_image_url)} onPress={() => { void assemblyOperation(() => setStudioBuildingView(studioId, item.id, view)); }}>{view === 'exterior' ? '外景' : '内景'}</Button>)}
          <Button size="sm" isDisabled={busy} onPress={() => { void assemblyOperation(() => detachBuildingFromStudio(studioId, item.id)); }}>移除建筑</Button></div></div>)}
        <Select label="添加建筑" selectedKeys={[]} isDisabled={busy} onSelectionChange={keys => { const id = Number(Array.from(keys)[0]); if (id) void assemblyOperation(() => attachBuildingToStudio(studioId, id)); }}>
          {buildings.filter(item => !studioDetail.buildings.some(b => b.id === item.id)).map(item => <SelectItem key={String(item.id)} textValue={item.name}>{item.name}</SelectItem>)}</Select>
      </div>
    </div>;
  };
  const tabs = [{ id: 'content', label: '内容', icon: <FileText size={13} /> }];
  if (!['script', 'studio'].includes(assetType)) tabs.push({ id: 'properties', label: '属性', icon: <Layers size={13} /> });
  if (assetType === 'costume') tabs.push({ id: 'prompts', label: '提示词', icon: <Wand2 size={13} /> });
  if (assetType === 'character') tabs.push({ id: 'states', label: '角色状态', icon: <Layers size={13} /> });
  if (assetType === 'scene' || assetType === 'studio') tabs.push({ id: 'assembly', label: '组装', icon: <Layers size={13} /> });
  if (assetType === 'character' || assetType === 'prop') tabs.push({ id: 'references', label: '参考图', icon: <ImageIcon size={13} /> });
  if (assetType !== 'script') tabs.push({ id: 'scenes', label: '关联分镜', icon: <Camera size={13} /> });
  const canGenerate = ['prop', 'environment', 'building', 'scene', 'studio'].includes(assetType);
  const generating = formData.generation_status === 'generating' || studioDetail?.studio.nine_grid_generation_status === 'generating';
  const generationButton = (label: string, view?: string) => <Button key={label} size="sm" startContent={<Wand2 size={13} />} isDisabled={busy || generating || !selected.image} onPress={() => { void generate(view); }}>{label}</Button>;
  const actions = <>
    <div ref={setStateActionsTarget} hidden={activeTab !== 'states'} />
    {canGenerate && <>
      <div style={{ width: 160 }}><AIModelSelector label="图像模型" models={models} selectedModel={selected.image} onModelChange={model => setSelected('image', model)} filterType="IMAGE" size="sm" /></div>
      <div style={{ width: 160 }}><AIModelSelector label="文本模型" models={models} selectedModel={selected.text} onModelChange={model => setSelected('text', model)} filterType="TEXT" size="sm" /></div>
      {assetType === 'prop' && generationButton('生成道具设定图')}
      {assetType === 'environment' && <>{generationButton('生成环境正面图', 'front')}{generationButton('生成环境背面图', 'back')}{generationButton('生成环境双面图', 'both')}</>}
      {assetType === 'building' && <>{generationButton('生成建筑室外图', 'exterior')}{generationButton('生成建筑室内图', 'interior')}{generationButton('生成建筑双面图', 'both')}</>}
      {(assetType === 'scene' || assetType === 'studio') && generationButton('生成九宫组装图')}
      <Button size="sm" variant="light" onPress={() => { if (assetType === 'prop') pollProp(); else void refresh(); }}>刷新生成状态</Button>
    </>}
    {(assetType === 'environment' || assetType === 'building') && <Button size="sm" color="danger" variant="light" isDisabled={busy || generating} startContent={<Trash2 size={13} />} onPress={() => { void deleteAsset(); }}>删除{kind}</Button>}
  </>;
  const status = session.status === 'error' || stateStatus === 'error' ? 'error' : session.status === 'saving' || stateStatus === 'saving' ? 'saving'
    : session.dirty || stateStatus === 'dirty' ? 'dirty' : session.status === 'saved' || stateStatus === 'saved' ? 'saved' : 'idle';
  const panel = <ContentEditorPanel title={activeTab === 'states' ? `${formData.name || '未命名'} · ${stateTitle || '角色状态'}` : formData.name || '未命名'} kind={kind}
    tabs={tabs} activeTab={activeTab} onTabChange={tab => { void switchTab(tab); }} status={status} onSave={flush} actions={actions}>
    <style>{'@container content-editor (max-width: 639px) { .resource-editor-prop-style .grid-cols-2 { grid-template-columns: minmax(0, 1fr); } }'}</style>
    {session.error && <p role="alert" className="text-danger text-xs mb-2">{session.error}；草稿已保留，可重试保存。</p>}
    {stateStatus === 'error' && activeTab !== 'states' && <p role="alert" className="text-danger text-xs mb-2">角色状态「{stateTitle}」保存失败，草稿已保留。<Button size="sm" onPress={() => setActiveTab('states')}>查看状态草稿</Button></p>}
    {generationError && <p role="alert" className="text-danger text-xs mb-2">{generationError}</p>}
    {activeTab === 'content' && <div className="content-editor-fields">{field('name', assetType === 'script' ? '剧本标题' : '名称')}{field(assetType === 'script' ? 'content' : 'description', assetType === 'script' ? '剧本正文' : '描述', true)}</div>}
    {activeTab === 'properties' && renderProperties()}
    {activeTab === 'prompts' && <div className="content-editor-fields">{field('outfit_prompt', '服装提示词', true)}</div>}
    <div ref={setStateFieldsTarget} hidden={activeTab !== 'states'} />
    {activeTab === 'assembly' && renderAssembly()}
    {activeTab === 'references' && (assetType === 'character' || assetType === 'prop') && <ReferenceImageManager assetType={assetType} assetId={assetId}
      showGlobalToggle={assetType === 'character'} globalEnabled={formData.use_reference_images !== false}
      onGlobalEnabledChange={enabled => { void runOperation(async () => { await updateCharacterUseReferenceImages(assetId, enabled); publishMedia({ use_reference_images: enabled }); }); }} />}
    {activeTab === 'scenes' && <AssetSceneRelations scenes={scenes} assetType={assetType} assetId={assetId} assetName={formData.name || ''}
      onSelectScene={id => { void flush().then(ok => { if (!ok || !alive.current) return; if (callbacks.current.onSelectScene) callbacks.current.onSelectScene(id); else window.dispatchEvent(new CustomEvent('openSceneTab', { detail: { sceneId: id } })); }); }} />}
  </ContentEditorPanel>;
  const images: [string, string][] = (assetType === 'environment' ? [['image_url', '环境正面'], ['image_back_url', '环境背面']]
    : assetType === 'building' ? [['exterior_image_url', '建筑室外'], ['interior_image_url', '建筑室内']]
    : [['image_url', '设定图'], ['front_view_url', '正面'], ['side_view_url', '侧面'], ['back_view_url', '背面']]) as [string, string][];
  const previews = images.filter(([key]) => formData[key]).map(([key, label]) => ({ src: formData[key] as string, alt: `${formData.name} · ${label}` }));
  if (studioDetail?.studio.nine_grid_image_url) previews.unshift({ src: studioDetail.studio.nine_grid_image_url, alt: `${formData.name} · 九宫组装图` });
  if (!previews.length && formData.cover_image_url) previews.push({ src: formData.cover_image_url, alt: formData.name });
  return <div className="flex flex-col h-full min-h-0 bg-(--bg-app) text-(--text-primary)">
    {!embedded && <header className="flex justify-between p-3 border-b border-(--border-color)"><span>{formData.name || '未命名'} · {kind}</span><Button size="sm" onPress={() => { void flush().then(ok => { if (ok && alive.current) callbacks.current.onClose(); }); }}>保存并关闭</Button></header>}
    <div className={embedded ? 'flex-1 min-h-0 overflow-auto p-3' : 'shrink-0 max-h-[45%] overflow-auto p-3'}>
      {loadError && <p role="alert" className="text-warning text-xs">{loadError}<Button size="sm" onPress={() => { void refresh(); }}>重试加载</Button></p>}
      {assetType === 'character' ? <CharacterStateEditor characterId={assetId} projectId={formData.project_id || null}
        editorPortalTarget={stateFieldsTarget} actionsPortalTarget={stateActionsTarget} onRegisterEditor={registerStateEditor}
        onEditorStatusChange={stateStatusChange} beforeGenerate={flushAsset}
        onStateActivated={state => publishMedia({ image_url: state.image_url || state.front_view_url || session.data.image_url })} />
        : assetType === 'script' ? <article className="whitespace-pre-wrap text-sm text-(--text-secondary)">{formData.content || '暂无剧本内容'}</article>
          : previews.length ? <div className="flex flex-wrap gap-3 justify-center">{previews.map((slide, index) => <button type="button" key={`${slide.src}:${index}`} className="min-w-0 rounded-xl overflow-hidden bg-(--bg-card) shadow-sm" onClick={() => openPreview(previews, index)}>
            <img src={slide.src} alt={slide.alt} className="max-h-72 max-w-full object-contain" /><p className="text-xs p-1">{slide.alt}</p></button>)}</div>
            : <div className="min-h-40 flex flex-col items-center justify-center text-(--text-muted)"><ImageIcon size={32} /><p className="text-xs mt-2">暂无{kind}预览图</p>{assetType === 'costume' && <p className="text-xs">可在资源面板生成服装设定图</p>}</div>}
      {generating && <p role="status" className="text-xs text-(--accent) mt-2">图片生成中，可刷新查看状态</p>}
    </div>
    {embedded ? (editorPortalTarget ? createPortal(panel, editorPortalTarget) : null) : <div className="flex-1 min-h-0">{panel}</div>}
  </div>;
};
export default AssetEditor;
