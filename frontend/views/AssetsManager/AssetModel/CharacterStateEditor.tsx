import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem, Chip } from '@heroui/react';
import { Plus, Edit2, Trash2, Star, Copy, RefreshCw, Shirt, Image as ImageIcon, Wand2, AlertTriangle, Layers3 } from 'lucide-react';
import { type Character, type CharacterState, type StateCategory, type TagGroup, STATE_CATEGORIES, AGE_STAGES,
  fetchCharacter, fetchCharacterStates, createCharacterState, updateCharacterState, deleteCharacterState,
  deleteCharacterStateBaseModelImage, activateCharacterState, duplicateCharacterState, generateCharacterStateViews } from '../../../services/assets';
import { useToast } from '../../../contexts/ToastContext';
import { usePreview } from '../../../components/PreviewProvider';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useAIModels } from '../../../hooks/useAIModels';
import AIModelSelector from '../../../components/AIModelSelector';
import { type EmbeddedEditorProps, type EditorSaveStatus } from '../../../components/ContentEditorPanel';
import '../../../components/ContentEditorPanel/styles.css';
import { ResourceDraft, STATE_FIELDS, normalizeState, statePayload, pickResourceFields, type ResourceData } from '../../../components/AssetEditor/resourceDraft';
import { ASSET_FIELD_CLASS_NAMES, ASSET_SELECT_CLASS_NAMES } from '../../../components/AssetEditor/fieldStyles';
import { useResourceDraft } from '../../../components/AssetEditor/useResourceDraft';
import { generateCostumeViews, fetchCharacterCostumes, type Costume } from '../../../services/costumes';

export interface CharacterStateEditorProps extends EmbeddedEditorProps {
  characterId: number | null;
  disabled?: boolean;
  onStateActivated?: (state: CharacterState) => void;
  projectId?: number | null;
  tagGroups?: TagGroup[];
  onTagGroupsChange?: () => void;
  formData?: any;
  setFormData?: (data: any) => void;
  /** 资源编辑器的固定 actions 槽；undefined 时保留独立操作栏。 */
  actionsPortalTarget?: HTMLElement | null;
  beforeGenerate?: () => Promise<boolean>;
  onEditorStatusChange?: (status: EditorSaveStatus, title: string) => void;
}
function categories(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const data = JSON.parse(value); if (Array.isArray(data)) return data; } catch { /* 兼容旧单值 */ } return [value]; }
  return ['daily'];
}
function tags(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  try { const data = JSON.parse(String(value || '[]')); return Array.isArray(data) ? data : []; } catch { return []; }
}
const STATUS_TEXT: Record<string, string> = { idle: '就绪', dirty: '未保存', saving: '保存中', saved: '已保存', error: '保存失败',
  pending: '待生成', generating: '生成中', completed: '已生成', failed: '生成失败' };
/** 图片生成状态独立命名：idle 表示尚未生成，而非“就绪”。 */
const GENERATION_STATUS_TEXT: Record<string, string> = { idle: '未生成', pending: '待生成', generating: '生成中', completed: '已生成', failed: '生成失败' };

/** 项目/角色身份固定，所有异步加载与生成只回写自己的会话。 */
const CharacterStateEditor: React.FC<CharacterStateEditorProps> = props => <CharacterStateSession key={`${props.projectId ?? ''}:${props.characterId ?? ''}`} {...props} />;
const CharacterStateSession: React.FC<CharacterStateEditorProps> = ({ characterId, disabled = false, projectId = null,
  onStateActivated, editorPortalTarget, actionsPortalTarget, onRegisterEditor, beforeGenerate, onEditorStatusChange }) => {
  const embedded = editorPortalTarget !== undefined;
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { openPreview } = usePreview();
  const { models, selected, setSelected } = useAIModels(projectId);
  const [states, setStates] = useState<CharacterState[]>([]);
  const statesRef = useRef(states); statesRef.current = states;
  const savedVersion = useRef(0);
  const savedStates = useRef(new Map<number, { version: number; data: CharacterState }>());
  const [character, setCharacter] = useState<Character | null>(null);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeCategory, setActiveCategory] = useState<StateCategory | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const newRef = useRef(false);
  const alive = useRef(true);
  const loadSequence = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const generationLocks = useRef(new Set<string>());
  const [generationBusy, setGenerationBusy] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const operationLock = useRef(false);
  const [generationErrors, setGenerationErrors] = useState<Record<number, string>>({});
  const callbacks = useRef({ beforeGenerate, onStateActivated, onEditorStatusChange });
  callbacks.current = { beforeGenerate, onStateActivated, onEditorStatusChange };
  const [equipOpen, setEquipOpen] = useState(false);
  const [equipStateId, setEquipStateId] = useState<number | null>(null);
  const [projectProps, setProjectProps] = useState<Array<{ id: number; name: string; image_url?: string }>>([]);
  const [selectedPropId, setSelectedPropId] = useState('');
  const [handPosition, setHandPosition] = useState('right');
  const [usageMode, setUsageMode] = useState('hold');
  const [analyzingVoice, setAnalyzingVoice] = useState(false);
  const voiceLock = useRef(false);

  const makeDraft = (initial: ResourceData, creating = false) => {
    const session = new ResourceDraft(creating ? {} : normalizeState(initial), STATE_FIELDS, async (_patch, snapshot) => {
      if (!characterId) throw new Error('请先保存角色');
      // 状态与角色本体分别保存，媒体和 equipped_props 等关联数据不进入此白名单。
      const payload = statePayload(snapshot);
      const saved = snapshot.id ? await updateCharacterState(characterId, snapshot.id, payload)
        : await createCharacterState(characterId, payload);
      // 旧接口可能忽略 costume_id，不能把未落库的选择回灌成 null 并误报成功。
      // 创建已成功时先保留 ID，重试只更新该状态，避免重复创建。
      if (!snapshot.id && saved.id) session.data = { ...session.data, id: saved.id };
      if ((saved.costume_id || null) !== (payload.costume_id || null)) {
        throw new Error('服务端未保存服装关联；请选择原服装（新状态可清除选择并使用自定义描述）后重试');
      }
      return normalizeState(saved);
    });
    if (creating) session.data = normalizeState(initial);
    return session;
  };
  const [draft, setDraft] = useState(() => makeDraft({}));
  const draftRef = useRef(draft); draftRef.current = draft;
  const data = useResourceDraft(draft, saved => {
    if (!alive.current) return;
    const value = { ...saved, character_id: characterId } as CharacterState;
    savedStates.current.set(value.id, { version: ++savedVersion.current, data: value });
    const next = statesRef.current.some(state => state.id === value.id)
      ? statesRef.current.map(state => state.id === value.id ? { ...state, ...value } : state) : [...statesRef.current, value];
    statesRef.current = next; setStates(next);
    if (value.id) { newRef.current = false; setIsNew(false); }
  });
  const flush = useCallback(() => draftRef.current.flush(), []);
  useEffect(() => { onRegisterEditor?.({ flush }); return () => onRegisterEditor?.(null); }, [onRegisterEditor, flush]);
  useEffect(() => { callbacks.current.onEditorStatusChange?.(draft.status, data.name || (isNew ? '新建状态' : '角色状态')); }, [draft.status, data.name, isNew]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; timers.current.forEach(clearTimeout); timers.current.clear(); };
  }, []);

  // 轮询/刷新晚于保存返回时，列表也必须保留已保存的字段，否则再选回来仍会丢稿。
  const acceptRows = (rows: CharacterState[], checkpoint: number) => {
    const next = rows.map(row => {
      const saved = savedStates.current.get(row.id);
      return saved && saved.version > checkpoint ? { ...row, ...pickResourceFields(saved.data, STATE_FIELDS) } as CharacterState : row;
    });
    savedStates.current.forEach(saved => {
      if (saved.version > checkpoint && !next.some(row => row.id === saved.data.id)) next.push(saved.data);
    });
    statesRef.current = next; setStates(next);
    return next;
  };
  const loadStates = useCallback(async () => {
    if (!characterId) return;
    const sequence = ++loadSequence.current;
    const target = draftRef.current;
    const checkpoint = target.revision;
    const savedCheckpoint = savedVersion.current;
    setLoading(true);
    try {
      const [ch, fetched, wardrobe] = await Promise.all([fetchCharacter(characterId), fetchCharacterStates(characterId), fetchCharacterCostumes(characterId)]);
      if (!alive.current || sequence !== loadSequence.current) return;
      const rows = acceptRows(fetched, savedCheckpoint);
      setCharacter(ch); setCostumes(wardrobe.costumes || []); setLoadError('');
      if (!draftRef.current.data.id && !newRef.current) {
        const first = rows.find(state => state.is_base_model) || rows[0];
        if (first) { const next = makeDraft(first); draftRef.current = next; setDraft(next); }
      } else if (target === draftRef.current) {
        const current = rows.find(state => state.id === target.data.id);
        if (current) target.receive(normalizeState(current), checkpoint);
      }
    } catch (error: any) { if (alive.current && sequence === loadSequence.current) setLoadError(error.message || '加载角色状态失败'); }
    finally { if (alive.current && sequence === loadSequence.current) setLoading(false); }
  }, [characterId]);
  useEffect(() => { void loadStates(); }, [loadStates]);
  const base = states.find(state => state.is_base_model);
  // 白膜三视图齐全才算基础层就绪：设定图/单张白膜图只能作为参考，不能直接派生状态。
  const baseReady = !!(base?.front_view_url && base?.side_view_url && base?.back_view_url);
  const hasBaseState = Boolean(base);
  // 资源侧卡片优先展示角色设定图（characters.image_url）；状态页只认角色状态媒体，
  // 因此在尚未建立白膜时需要一个“角色设定图”回退展示，避免两边视觉不一致。
  const characterImage = character?.image_url || character?.base_model_image_url || character?.concept_image_url || '';

  // 内部选状态、关闭弹窗、复制/激活前都等待同一个 flush；失败不切走。
  const selectState = async (state: CharacterState, open = false) => {
    if (!(await flush()) || !alive.current) return;
    if (draftRef.current.data.id !== state.id) {
      const next = makeDraft(statesRef.current.find(item => item.id === state.id) || state);
      draftRef.current = next; setDraft(next);
    }
    newRef.current = false; setIsNew(false);
    if (open && !embedded) setModalOpen(true);
  };
  const createFromBase = async () => {
    if (disabled || !baseReady || !(await flush()) || !alive.current) return;
    const latestBase = statesRef.current.find(state => state.is_base_model);
    const next = makeDraft({ character_id: characterId, project_id: projectId, name: '', description: '',
      appearance: latestBase?.appearance || character?.appearance || '', outfit: latestBase?.outfit || '', age_stage: latestBase?.age_stage || '',
      hairstyle: latestBase?.hairstyle || '', accessories: latestBase?.accessories || '', held_props: '', body_elements: latestBase?.body_elements || '',
      state_category: ['daily'], tags: '[]', costume_id: null, voice_config: null }, true);
    newRef.current = true; setIsNew(true); draftRef.current = next; setDraft(next);
    if (!embedded) setModalOpen(true);
  };
  const closeEditor = async () => { if (await flush() && alive.current) setModalOpen(false); };

  /**
   * 3ds Max 式生产流程：角色设定图只是参考，白膜三视图才是基础网格。
   * 没有白膜状态时先创建白膜状态并立即启动三视图生成；
   * 不把设定图直接当作白膜，也不在白膜三视图完成前开放派生状态的编辑。
   */
  const generateBaseThreeViews = async () => {
    if (disabled || !characterId || operationBusy || generationBusy) return;
    if (!selected.image) { showToast('请先选择图像生成模型', 'warning'); return; }
    await runOperation(async () => {
      let baseState = statesRef.current.find(state => state.is_base_model);
      if (!baseState) {
        const created = await createCharacterState(characterId, {
          // 本地路由依赖 project_id 定位工程文档
          ...(projectId ? { project_id: projectId } : {}),
          name: '白膜',
          description: character?.base_appearance || character?.appearance || character?.description || '',
          appearance: character?.base_appearance || character?.appearance || '',
          outfit: character?.outfit_appearance || '',
          is_base_model: true,
          is_active: false,
          image_url: characterImage,
          front_view_url: character?.front_view_url || '',
          side_view_url: character?.side_view_url || '',
          back_view_url: character?.back_view_url || '',
          state_category: 'daily',
          tags: '[]',
          generation_status: 'idle',
        } as any);
        baseState = created;
        statesRef.current = [...statesRef.current, created];
        setStates(statesRef.current);
        const next = makeDraft(created);
        draftRef.current = next; setDraft(next);
        newRef.current = false; setIsNew(false);
      }
      await generateViews(baseState.id!);
    });
  };
  const runOperation = async (operation: () => Promise<void>) => {
    if (operationLock.current || disabled) return;
    operationLock.current = true; setOperationBusy(true);
    try { if (!(await flush()) || !alive.current) return; await operation(); }
    catch (error: any) { if (alive.current) showToast(error.message || '操作失败', 'error'); }
    finally { operationLock.current = false; if (alive.current) setOperationBusy(false); }
  };
  const activate = (state: CharacterState) => runOperation(async () => {
    if (state.is_active) return;
    const updated = await activateCharacterState(characterId!, state.id);
    if (!alive.current) return;
    callbacks.current.onStateActivated?.(updated); await loadStates();
    showToast(`已切换到「${updated.name}」状态`, 'success');
  });
  const duplicate = (state: CharacterState) => runOperation(async () => { await duplicateCharacterState(characterId!, state.id); await loadStates(); });
  const removeState = (state: CharacterState) => runOperation(async () => {
    if (state.is_base_model) throw new Error('基础白膜状态不可删除');
    if (!(await confirm({ title: '删除状态', message: `确定删除「${state.name}」及其参考图？`, type: 'danger', confirmText: '删除' })) || !alive.current) return;
    await deleteCharacterState(characterId!, state.id);
    if (!alive.current) return;
    savedStates.current.delete(state.id);
    if (draftRef.current.data.id === state.id) { const next = makeDraft({}); draftRef.current = next; setDraft(next); }
    await loadStates();
  });
  const deleteViews = (state: CharacterState) => runOperation(async () => {
    if (state.generation_status === 'generating') return;
    if (state.is_base_model) await deleteCharacterStateBaseModelImage(characterId!, state.id);
    else await updateCharacterState(characterId!, state.id, { front_view_url: '', side_view_url: '', back_view_url: '', image_url: '', generation_status: 'idle' });
    if (!alive.current) return;
    // 删除图片是独立、明确的媒体操作，不属于表单保存。
    if (draftRef.current.data.id === state.id) draftRef.current.media({ image_url: '', front_view_url: '', side_view_url: '', back_view_url: '', generation_status: 'idle' });
    await loadStates();
  });
  const finishGeneration = (key: string) => {
    generationLocks.current.delete(key);
    if (alive.current) setGenerationBusy(generationLocks.current.size > 0);
  };
  const schedule = (fn: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); if (alive.current) fn(); }, delay);
    timers.current.add(timer);
  };
  const pollGeneration = async (stateId: number, key: string, attempt = 0) => {
    if (!alive.current) return;
    const savedCheckpoint = savedVersion.current;
    try {
      const fetched = await fetchCharacterStates(characterId!);
      if (!alive.current) return;
      const rows = acceptRows(fetched, savedCheckpoint);
      const state = rows.find(item => item.id === stateId);
      if (state) {
        statesRef.current = statesRef.current.map(item => item.id === stateId ? { ...item, ...state } : item);
        setStates(statesRef.current);
      }
      if (state && draftRef.current.data.id === stateId) draftRef.current.media(state);
      if (state?.generation_status === 'completed') { finishGeneration(key); showToast('角色状态图片生成完成', 'success'); return; }
      if (state?.generation_status === 'failed') throw new Error('角色状态图片生成失败，请重试');
      if (attempt >= 60) throw new Error('生成超时，请刷新状态后重试');
      schedule(() => { void pollGeneration(stateId, key, attempt + 1); }, 5000);
    } catch (error: any) {
      if (alive.current) setGenerationErrors(prev => ({ ...prev, [stateId]: error.message }));
      finishGeneration(key);
    }
  };
  const generateViews = async (stateId: number, view?: 'front' | 'side' | 'back') => {
    const key = `state:${stateId}`;
    if (disabled || generationLocks.current.has(key)) return;
    generationLocks.current.add(key); setGenerationBusy(true);
    let started = false;
    try {
      // 先存角色本体，再排空当前状态；不能把父级复合 flush 传进来形成递归。
      if (callbacks.current.beforeGenerate && !(await callbacks.current.beforeGenerate())) return;
      if (!(await flush()) || !alive.current) return;
      if (!selected.image) throw new Error('请先选择图像生成模型');
      const state = draftRef.current.data.id === stateId ? draftRef.current.data : statesRef.current.find(item => item.id === stateId);
      if (!state) throw new Error('请先保存状态');
      if (state.generation_status === 'generating') return;
      if (!state.is_base_model && !baseReady) throw new Error('请先生成白膜角色设定图');
      // 保留原有服装/道具就绪校验，由现有生成接口返回 COSTUME_NOT_READY / PROPS_NOT_READY。
      setGenerationErrors(prev => ({ ...prev, [stateId]: '' }));
      const hasViews = !!(state.front_view_url || state.side_view_url || state.back_view_url);
      await generateCharacterStateViews(characterId!, stateId, { imageModel: selected.image, textModel: selected.text || undefined,
        regenerateOnly: view ? [view] : !state.is_base_model && hasViews ? ['front', 'side', 'back'] : undefined });
      started = true;
      if (!alive.current) return;
      setStates(prev => prev.map(item => item.id === stateId ? { ...item, generation_status: 'generating' } : item));
      if (draftRef.current.data.id === stateId) draftRef.current.media({ generation_status: 'generating' });
      showToast(state.is_base_model ? '白膜设定图生成任务已启动' : '三视图生成任务已启动', 'success');
      void pollGeneration(stateId, key);
    } catch (error: any) {
      if (alive.current) {
        setGenerationErrors(prev => ({ ...prev, [stateId]: error.message || '生成失败，请重试' }));
        showToast(error.message || '生成失败', ['COSTUME_NOT_READY', 'PROPS_NOT_READY'].includes(error.code) ? 'warning' : 'error');
      }
    } finally { if (!started) finishGeneration(key); }
  };
  const generateCostume = async (costumeId: number) => {
    const key = `costume:${costumeId}`;
    if (generationLocks.current.has(key) || disabled) return;
    generationLocks.current.add(key); setGenerationBusy(true);
    try {
      if (callbacks.current.beforeGenerate && !(await callbacks.current.beforeGenerate())) return;
      if (!(await flush()) || !alive.current) return;
      if (!selected.image) throw new Error('请先选择图像生成模型');
      await generateCostumeViews(costumeId, { imageModel: selected.image, textModel: selected.text || undefined });
      if (!alive.current) return;
      setCostumes(prev => prev.map(item => item.id === costumeId ? { ...item, generation_status: 'generating' } : item));
      showToast('关联服装设定图生成已启动', 'success');
      await loadStates();
    } catch (error: any) { if (alive.current) showToast(error.message || '服装生成失败', 'error'); }
    finally { finishGeneration(key); }
  };
  const openEquip = (state: CharacterState) => runOperation(async () => {
    const targetProject = character?.project_id || projectId;
    if (!targetProject) throw new Error('角色未绑定项目，无法加载道具');
    const response = await fetch(`/api/props/project/${targetProject}`);
    if (!response.ok) throw new Error('加载项目道具失败');
    const result = await response.json();
    if (!alive.current) return;
    const used = new Set(state.equipped_props?.map(item => item.prop_id) || []);
    setProjectProps((result.props || []).filter((item: any) => !used.has(item.id)));
    setEquipStateId(state.id); setSelectedPropId(''); setHandPosition('right'); setUsageMode('hold'); setEquipOpen(true);
  });
  const equipProp = () => runOperation(async () => {
    if (!equipStateId || !selectedPropId) return;
    const response = await fetch(`/api/characters/${characterId}/states/${equipStateId}/props`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propId: Number(selectedPropId), handPosition, usageMode }),
    });
    if (!response.ok) { const result = await response.json(); throw new Error(result.message || '叠加道具失败'); }
    if (alive.current) setEquipOpen(false);
    await loadStates();
  });
  const unequipProp = (stateId: number, propId: number) => runOperation(async () => {
    const response = await fetch(`/api/characters/${characterId}/states/${stateId}/props/${propId}`, { method: 'DELETE'});
    if (!response.ok) { const result = await response.json(); throw new Error(result.message || '解绑道具失败'); }
    await loadStates();
  });
  const analyzeVoice = async () => {
    if (voiceLock.current || disabled) return;
    voiceLock.current = true; setAnalyzingVoice(true);
    const target = draftRef.current;
    try {
      if (callbacks.current.beforeGenerate && !(await callbacks.current.beforeGenerate())) return;
      if (!(await target.flush()) || !alive.current) return;
      if (!selected.text || !character) throw new Error('请先选择文本模型并加载角色');
      const revision = target.revision;
      const response = await fetch(`/api/characters/${characterId}/states/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'voice', description: target.data.description || '', characterName: character.name,
          characterAppearance: target.data.appearance || character.appearance || '', textModel: selected.text }),
      });
      if (!response.ok) throw new Error('音色分析失败');
      const result = await response.json();
      if (!alive.current || target !== draftRef.current || revision !== target.revision) return;
      const voice = result.tags || result.voice || result;
      if (!voice || typeof voice !== 'object') throw new Error('音色数据格式异常');
      target.edit({ voice_config: { ...(typeof target.data.voice_config === 'object' ? target.data.voice_config : {}),
        voice_description: voice.voice_description || '', gender: voice.gender || 'neutral',
        age_group: voice.age_group || 'young', language: voice.language || 'zh-CN', emotion: voice.emotion || 'neutral',
        style: voice.style || 'gentle', speed: typeof voice.speed === 'number' ? voice.speed : 1,
        pitch: typeof voice.pitch === 'number' ? voice.pitch : 0, volume: typeof voice.volume === 'number' ? voice.volume : 1,
        dialect: voice.dialect || '', seedance_prompt: voice.seedance_prompt || '' } });
    } catch (error: any) { if (alive.current) showToast(error.message || '音色分析失败', 'error'); }
    finally { voiceLock.current = false; if (alive.current) setAnalyzingVoice(false); }
  };

  const current = (data.id ? { ...states.find(item => item.id === data.id), ...data } : data) as CharacterState;
  const currentCostume = costumes.find(item => item.id === data.costume_id);
  const selectedGenerating = current.generation_status === 'generating' || generationLocks.current.has(`state:${current.id}`);
  const editField = (key: string, label: string, multiline = false) => <div key={key} className={multiline ? 'content-editor-field content-editor-full-width' : 'content-editor-field'}>
    {multiline ? <Textarea size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label={label} value={data[key] || ''} onValueChange={value => draft.edit({ [key]: value })} minRows={2} isDisabled={disabled} />
      : <Input size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label={label} value={data[key] || ''} onValueChange={value => draft.edit({ [key]: value })} isDisabled={disabled || (key === 'name' && current.is_base_model)} />}
  </div>;
  const voice = data.voice_config && typeof data.voice_config === 'object' ? data.voice_config : {};
  const editVoice = (key: string, value: unknown) => draft.edit({ voice_config: { ...(draft.data.voice_config || {}), [key]: value } });
  const voiceSelect = (key: string, label: string, options: [string, string][]) => <Select key={key} size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_SELECT_CLASS_NAMES} label={label} selectedKeys={voice[key] ? [voice[key]] : []} isDisabled={disabled}
    onSelectionChange={keys => { const value = Array.from(keys)[0]; if (value != null) editVoice(key, value); }}>
    {options.map(([value, text]) => <SelectItem key={value} textValue={text}>{text}</SelectItem>)}</Select>;
  const fields = <div className="space-y-3 text-(--text-primary)">
    {draft.error && <p role="alert" className="text-danger text-xs">{draft.error}；草稿已保留，请重试。</p>}
    {data.id || isNew ? <>
      {/* 状态身份摘要：名称、当前/白膜/草稿标记与保存状态集中在一行 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--border-color) bg-(--bg-card)/55 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--accent)/10 text-(--accent)">
          <Layers3 size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-(--text-muted)">{current.is_base_model ? '白膜' : '状态'}</span>
            <strong className="truncate text-sm font-semibold">{data.name || '新建状态'}</strong>
            {current.is_active && <span className="rounded-full bg-(--accent)/10 px-1.5 py-0.5 text-[10px] text-(--accent)">当前</span>}
            {current.is_base_model && <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400/90">白膜</span>}
            {isNew && !data.id && <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-400">未保存</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-(--text-muted)">状态属性独立保存，不写入角色本体<span className="mx-1 opacity-40">·</span>修改后 2 秒自动保存</p>
        </div>
        <span role="status" className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          draft.status === 'error' ? 'bg-red-500/10 text-red-400'
            : draft.status === 'saving' ? 'bg-(--accent)/10 text-(--accent)'
              : draft.status === 'dirty' ? 'bg-amber-500/10 text-amber-400'
                : draft.status === 'saved' ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-(--bg-input) text-(--text-muted)'
        }`}>{STATUS_TEXT[draft.status]}</span>
      </div>
      <div className="content-editor-fields">
      {editField('name', '状态名称')}
      <div className="content-editor-field"><span className="text-xs">自动分类：</span>{(data.costume_id || data.outfit) ? <Chip size="sm">服装变化</Chip> : null}{data.body_elements ? <Chip size="sm">效果状态</Chip> : null}{!data.costume_id && !data.outfit && !data.body_elements && <Chip size="sm">日常状态</Chip>}</div>
      {editField('description', '状态描述', true)}{editField('appearance', '外貌特征', true)}
      {editField('body_elements', current.is_base_model ? '身体元素（纹身、疤痕等）' : '效果 / 附加描述', true)}
      {!current.is_base_model && <>
        <div className="content-editor-full-width space-y-2"><h5 className="text-xs">服装（沿用角色已关联的服装）</h5>
          <div className="flex gap-2 overflow-x-auto">{costumes.map(costume => <button type="button" key={costume.id} disabled={disabled}
            className={`shrink-0 w-20 rounded-lg p-1 border ${data.costume_id === costume.id ? 'border-(--accent)' : 'border-(--border-color)'}`}
            onClick={() => draft.edit({ costume_id: costume.id, outfit: costume.outfit_prompt || costume.name })}>
            {costume.image_url ? <img src={costume.image_url} alt={costume.name} className="w-full h-14 object-contain" /> : <Shirt size={24} />}
            <span className="text-xs">{costume.name}</span></button>)}</div>
          {data.costume_id ? <div className="flex items-center gap-2"><span className="text-xs">已选：{currentCostume?.name || data.outfit} · {STATUS_TEXT[currentCostume?.generation_status || 'pending']}</span>
            <Button size="sm" isDisabled={disabled} onPress={() => draft.edit({ costume_id: null, outfit: '' })}>清除服装</Button></div> : editField('outfit', '自定义服装描述')}
          {!costumes.length && <p className="text-xs text-(--text-muted)">暂无关联服装，可填写自定义描述。</p>}
        </div>
        <Select size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_SELECT_CLASS_NAMES} label="年龄阶段" selectedKeys={data.age_stage ? [data.age_stage] : []} isDisabled={disabled} onSelectionChange={keys => draft.edit({ age_stage: Array.from(keys)[0] || '' })}>
          {AGE_STAGES.map(age => <SelectItem key={age} textValue={age}>{age}</SelectItem>)}</Select>
        {editField('hairstyle', '发型')}{editField('accessories', '配饰')}{editField('held_props', '手持道具描述')}
        <div className="content-editor-full-width space-y-2"><h5 className="text-xs">已叠加道具</h5><div className="flex flex-wrap gap-2">
          {current.equipped_props?.map(prop => <Chip key={prop.prop_id} size="sm" onClose={disabled ? undefined : () => { void unequipProp(current.id, prop.prop_id); }}
            onClick={() => { if (prop.image_url) openPreview([{ src: prop.image_url, alt: prop.name }], 0); }}>{prop.name}</Chip>)}
          <Button size="sm" isDisabled={disabled || !current.id || operationBusy} startContent={<Plus size={12} />} onPress={() => { void openEquip(current); }}>叠加道具</Button></div>
          <p className="text-xs text-(--text-muted)">生成需要白膜、关联服装和道具参考图就绪；失败不会自动启动其他付费生成。</p>
        </div>
        <details className="content-editor-full-width"><summary className="text-xs cursor-pointer">角色音色配置</summary><div className="content-editor-fields mt-2">
          <Input size="sm" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label="音色描述" value={voice.voice_description || ''} onValueChange={value => editVoice('voice_description', value)} isDisabled={disabled} />
          {voiceSelect('gender', '性别', [['male', '男性'], ['female', '女性'], ['neutral', '中性']])}
          {voiceSelect('age_group', '年龄段', [['child', '儿童'], ['teen', '少年'], ['young', '青年'], ['middle', '中年'], ['elder', '老年']])}
          <Input size="sm" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label="语言" value={voice.language || ''} onValueChange={value => editVoice('language', value)} isDisabled={disabled} />
          {voiceSelect('emotion', '情感基调', [['neutral', '平静'], ['cheerful', '欢快'], ['sad', '悲伤'], ['angry', '愤怒'], ['excited', '兴奋'], ['calm', '沉稳'], ['shy', '害羞'], ['brave', '勇敢']])}
          {voiceSelect('style', '声音风格', [['gentle', '温柔'], ['lively', '活泼'], ['serious', '严肃'], ['playful', '俏皮'], ['elegant', '优雅'], ['rough', '粗犷'], ['soft', '柔和']])}
          {([{ key: 'speed', label: '语速', min: 0.5, max: 2, step: 0.1 }, { key: 'pitch', label: '音高', min: -10, max: 10, step: 1 }, { key: 'volume', label: '音量', min: 0.5, max: 2, step: 0.1 }]).map(item =>
            <Input key={item.key} size="sm" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label={item.label} type="number" min={item.min} max={item.max} step={item.step} isDisabled={disabled} value={String(voice[item.key] ?? (item.key === 'pitch' ? 0 : 1))}
              onValueChange={value => { const number = Number(value); if (Number.isFinite(number)) editVoice(item.key, Math.max(item.min, Math.min(item.max, number))); }} />)}
          <Input size="sm" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label="Seedance 英文音色提示词" value={voice.seedance_prompt || ''} onValueChange={value => editVoice('seedance_prompt', value)} isDisabled={disabled} />
        </div></details>
      </>}
      <Input className="content-editor-full-width" size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_FIELD_CLASS_NAMES} label="状态标签（逗号分隔）" value={tags(data.tags).join(',')} isDisabled={disabled} onValueChange={value => draft.edit({ tags: JSON.stringify(value.split(/[,，]/)) })} />
      <p className="content-editor-full-width text-xs text-(--text-muted)">{current.is_base_model ? '白膜生成沿用角色参考图页中的图片。身体元素会保留在白膜中。' : '状态三视图自动使用白膜作为参考。'} 修改后 2 秒自动保存。</p>
    </div>
    </> : (
      <div className="flex min-h-80 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-xl border border-dashed border-(--border-color) bg-(--bg-card)/40 px-5 py-7 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-(--accent)/10 text-(--accent)">
            <Layers3 size={18} />
          </div>
          <h5 className="mt-3 text-sm font-medium">{baseReady ? '选择一个角色状态' : '先生成白膜三视图'}</h5>
          <p className="mt-1 text-xs leading-relaxed text-(--text-muted)">
            {baseReady
              ? '从状态列表选择要编辑的状态，或基于白膜创建一个新状态。状态属性独立保存，不影响角色本体。'
              : '角色设定图只是参考，白膜三视图才是基础层。白膜三视图完成后再添加服装、道具与状态属性，组合成拍摄所需造型。'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {baseReady ? (
              <Button size="sm" color="primary" startContent={<Plus size={13} />} isDisabled={disabled || operationBusy} onPress={() => { void createFromBase(); }}>基于白膜新建</Button>
            ) : (
              <Button size="sm" color="primary" startContent={<Wand2 size={13} />} isDisabled={disabled || operationBusy || generationBusy || !selected.image} onPress={() => { void generateBaseThreeViews(); }}>生成白膜三视图</Button>
            )}
            <Button size="sm" variant="flat" startContent={<RefreshCw size={13} />} isLoading={loading} onPress={() => { void loadStates(); }}>刷新状态</Button>
          </div>
          {!baseReady && !selected.image && <p className="mt-3 text-[11px] text-amber-400/80">请先在底部选择图像生成模型。</p>}
        </div>
      </div>
    )}
  </div>;
  const generateCurrent = async () => {
    const target = draftRef.current;
    if (await target.flush() && alive.current && target.data.id) await generateViews(target.data.id);
  };
  const actions = !disabled ? <div className="flex flex-wrap items-center gap-2">
    <div className="w-47.5 min-w-37.5 shrink-0"><AIModelSelector label="文本分析模型" models={models} selectedModel={selected.text} onModelChange={model => setSelected('text', model)} filterType="TEXT" size="sm" /></div>
    <div className="w-47.5 min-w-37.5 shrink-0"><AIModelSelector label="图像生成模型" models={models} selectedModel={selected.image} onModelChange={model => setSelected('image', model)} filterType="IMAGE" size="sm" /></div>
    <Button size="sm" color="primary" isDisabled={!selected.image || generationBusy || selectedGenerating || (!data.id && !isNew)} startContent={<Wand2 size={13} />} onPress={() => { void generateCurrent(); }}>{current.is_base_model ? '生成白膜设定图' : '生成状态三视图'}</Button>
    {!current.is_base_model && current.id && (['front', 'side', 'back'] as const).map(view => <Button key={view} size="sm" isDisabled={!selected.image || generationBusy || selectedGenerating}
      onPress={() => { void generateViews(current.id, view); }}>重新生成{view === 'front' ? '正面' : view === 'side' ? '侧面' : '背面'}</Button>)}
    {currentCostume && !['completed', 'generating'].includes(currentCostume.generation_status || '') && <Button size="sm" isDisabled={!selected.image || generationBusy} onPress={() => { void generateCostume(currentCostume.id); }}>生成关联服装设定图</Button>}
    {!current.is_base_model && <Button size="sm" variant="flat" isDisabled={!selected.text || analyzingVoice || (!data.id && !isNew)} startContent={<Wand2 size={13} />} onPress={() => { void analyzeVoice(); }}>AI分析音色</Button>}
    {actionsPortalTarget === undefined && <Button size="sm" isDisabled={draft.status === 'saving'} onPress={() => { void flush(); }}>{draft.status === 'error' ? '重试保存状态' : '保存状态'}</Button>}
  </div> : null;
  const stateOperations = (state: CharacterState) => <div className="flex flex-wrap gap-1">
    <Button size="sm" isDisabled={disabled || operationBusy} startContent={<Edit2 size={12} />} onPress={() => { void selectState(state, true); }}>编辑{state.is_base_model ? '白膜' : '状态'}</Button>
    {!state.is_active && <Button size="sm" isDisabled={disabled || operationBusy} startContent={<Star size={12} />} onPress={() => { void activate(state); }}>设为当前</Button>}
    {!state.is_base_model && <><Button size="sm" isDisabled={disabled || operationBusy} startContent={<Copy size={12} />} onPress={() => { void duplicate(state); }}>复制</Button>
      <Button size="sm" isDisabled={disabled || operationBusy || state.generation_status === 'generating'} color="danger" variant="light" startContent={<Trash2 size={12} />} onPress={() => { void removeState(state); }}>删除状态</Button></>}
  </div>;
  const preview = (state: CharacterState) => {
    const slides = ([['image_url', '设定图'], ['front_view_url', '正面'], ['side_view_url', '侧面'], ['back_view_url', '背面']] as const)
      .filter(([key]) => state[key]).map(([key, label]) => ({ src: state[key], alt: `${state.name} · ${label}` }));
    // 状态尚无媒体时回退到角色设定图：资源侧与角色页使用同一张视觉基准，
    // 同时明确标注它还不是白膜/状态三视图。
    if (!slides.length && characterImage) {
      return <div className="space-y-2">
        <div className="flex justify-center">
          <button type="button" onClick={() => openPreview([{ src: characterImage, alt: `${character?.name || '角色'} · 设定图` }], 0)} className="rounded-lg overflow-hidden bg-(--bg-card) shadow-sm">
            <img src={characterImage} alt={`${character?.name || '角色'} · 设定图`} className="max-h-64 max-w-full object-contain" />
          </button>
        </div>
        <p className="text-center text-[11px] text-(--text-muted)">{state.id ? '当前状态暂无三视图，显示角色设定图参考' : '角色设定图 · 仅作参考，白膜三视图尚未生成'}</p>
        {!baseReady && <>
          <p className="text-center text-[11px] leading-relaxed text-(--text-muted)">白膜是基础网格；状态 = 白膜基础 + 服装 + 道具 + 状态属性</p>
          <div className="flex justify-center">
            <Button size="sm" variant="flat" startContent={<Wand2 size={12} />} isDisabled={disabled || operationBusy || generationBusy || !selected.image} onPress={() => { void generateBaseThreeViews(); }}>生成白膜三视图</Button>
          </div>
        </>}
      </div>;
    }
    const generation = state.generation_status || 'idle';
    const generationTone = generation === 'completed' ? 'text-emerald-400 bg-emerald-500/10'
      : generation === 'failed' ? 'text-red-400 bg-red-500/10'
        : generation === 'generating' ? 'text-(--accent) bg-(--accent)/10'
          : 'text-(--text-muted) bg-(--bg-input)';
    return <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-2">{slides.length ? slides.map((slide, index) => <button key={`${slide.src}:${index}`} type="button" onClick={() => openPreview(slides, index)} className="rounded-lg overflow-hidden bg-(--bg-card) shadow-sm">
        <img src={slide.src} alt={slide.alt} className="max-h-64 max-w-full object-contain" /><span className="text-xs">{slide.alt}</span></button>) : <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-(--border-color) text-(--text-muted)"><ImageIcon size={26} className="opacity-40" /><p className="text-xs">{!state.id ? '请先选择或新建角色状态' : `暂无「${state.name}」预览图`}</p>{state.id && <p className="text-[11px] opacity-70">生成状态三视图后在此预览</p>}</div>}</div>
      {state.id && <p role="status" className="text-center"><span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] ${generationTone}`}>{GENERATION_STATUS_TEXT[generation]}</span></p>}
      {generationErrors[state.id] && <p role="alert" className="text-danger text-xs">{generationErrors[state.id]}</p>}
      {slides.length > 0 && !disabled && <Button size="sm" color="danger" variant="light" isDisabled={operationBusy || state.generation_status === 'generating'} onPress={() => { void deleteViews(state); }}>{state.is_base_model ? '删除白膜设定图' : '删除状态三视图'}</Button>}
    </div>;
  };
  const filtered = [...states].filter(state => activeCategory === 'all' || categories(state.state_category).includes(activeCategory))
    .sort((a, b) => Number(!!b.is_base_model) - Number(!!a.is_base_model) || (a.sort_order || 0) - (b.sort_order || 0));
  if (!characterId) return <p className="text-xs text-(--text-muted)">请先保存角色后管理状态。</p>;
  return <div className={embedded ? 'flex h-full min-h-0 flex-col gap-2.5 text-(--text-primary)' : 'space-y-2.5 text-(--text-primary)'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <h4 className="text-sm font-medium">角色状态</h4>
        <span className="truncate text-[11px] text-(--text-muted)">{character?.name || ''}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" isDisabled={disabled || !baseReady || operationBusy} startContent={<Plus size={12} />} onPress={() => { void createFromBase(); }}>基于白膜新建</Button>
        <Button size="sm" variant="light" isLoading={loading} onPress={() => { void loadStates(); }}>刷新状态</Button>
      </div>
    </div>
    {!baseReady && <div className="flex items-start gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-400/90">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{hasBaseState ? '白膜三视图未完成。请先补齐白膜正/侧/背面，再添加服装、道具与状态属性。' : '角色设定图仅作参考。请先生成白膜三视图，再添加服装、道具与状态属性，组合成拍摄所需造型。'}</span>
    </div>}
    {loadError && <p role="alert" className="text-xs text-danger">{loadError}（可刷新重试）</p>}
    {embedded ? <>
      <div className="grid grid-cols-1 gap-3 md:min-h-0 md:flex-1 md:grid-cols-[minmax(210px,270px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <Select size="sm" variant="flat" labelPlacement="outside" classNames={ASSET_SELECT_CLASS_NAMES} label="状态" className="w-full" selectedKeys={data.id ? [String(data.id)] : []}
            onSelectionChange={keys => { const state = states.find(item => item.id === Number(Array.from(keys)[0])); if (state) void selectState(state); }}>
            {states.map(state => <SelectItem key={String(state.id)} textValue={state.name}>{state.is_base_model ? '白膜 · ' : ''}{state.name}</SelectItem>)}
          </Select>
          {current.id && <div className="flex flex-wrap gap-1.5">{stateOperations(current)}</div>}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-(--text-muted)">
            <span>{states.length} 个状态</span>
            {current.is_active && <span className="rounded bg-(--accent)/10 px-1.5 py-0.5 text-(--accent)">当前</span>}
            {current.is_base_model && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400/80">白膜</span>}
          </div>
          {!states.length && <p className="text-[11px] text-(--text-muted)">暂无状态</p>}
        </div>
        <div className="min-h-45 rounded-lg border border-(--border-color) bg-black/10 p-2.5 md:h-full md:min-h-0 md:overflow-auto">
          {preview(current)}
        </div>
      </div>
      {editorPortalTarget ? createPortal(fields, editorPortalTarget) : null}
      {actionsPortalTarget ? createPortal(actions, actionsPortalTarget) : actionsPortalTarget === undefined ? actions : null}
    </> : <>
      <div className="flex flex-wrap gap-2">{(['all', ...STATE_CATEGORIES.map(item => item.key)] as const).map(category => <Button key={category} size="sm" variant={activeCategory === category ? 'solid' : 'flat'}
        onPress={() => setActiveCategory(category)}>{category === 'all' ? '全部' : STATE_CATEGORIES.find(item => item.key === category)?.label} ({states.filter(item => category === 'all' || categories(item.state_category).includes(category)).length})</Button>)}</div>
      {filtered.map(state => <section key={state.id} className="rounded-xl p-3 border border-(--border-color) bg-(--bg-elevated) space-y-2">
        <button type="button" className="w-full text-left text-sm font-medium" onClick={() => setExpanded(prev => { const next = new Set(prev); if (next.has(state.id)) next.delete(state.id); else next.add(state.id); return next; })}>
          {state.is_base_model ? '★ 白膜 · ' : ''}{state.name}{state.is_active ? ' · 当前状态' : ''}</button>
        {stateOperations(state)}
        {expanded.has(state.id) && <>{preview(state)}<p className="text-xs whitespace-pre-wrap">{[state.description, state.age_stage, state.costume_outfit_prompt || state.outfit, state.hairstyle, state.accessories, state.body_elements].filter(Boolean).join('；')}</p>
          <div className="flex flex-wrap gap-2">{tags(state.tags).map((tag, i) => <Chip size="sm" key={`${tag}:${i}`}>{tag}</Chip>)}</div></>}
      </section>)}
      {!filtered.length && !loading && <p className="text-xs">暂无角色状态。</p>}
      {!modalOpen && <div className="sticky bottom-0 bg-(--bg-card) p-2"><p className="text-xs mb-1">正在编辑：{data.name || '请选择状态'} · {STATUS_TEXT[draft.status]}</p>{actions}</div>}
      <Modal isOpen={modalOpen} onOpenChange={open => { if (!open) void closeEditor(); }} size="5xl" scrollBehavior="inside" isDismissable={false}>
        <ModalContent><ModalHeader>{current.is_base_model ? '调整白膜状态' : isNew ? '新建状态' : `编辑状态 · ${data.name}`}</ModalHeader>
          <ModalBody style={{ containerType: 'inline-size', containerName: 'content-editor' }}>{fields}</ModalBody><ModalFooter className="flex-wrap">{actions}<Button size="sm" onPress={() => { void closeEditor(); }}>保存并关闭</Button></ModalFooter>
        </ModalContent>
      </Modal>
    </>}
    <Modal isOpen={equipOpen} onOpenChange={setEquipOpen} size="md"><ModalContent>
      <ModalHeader>叠加道具 · {states.find(state => state.id === equipStateId)?.name}</ModalHeader><ModalBody className="space-y-3">
        {!projectProps.length && <p className="text-xs">当前项目没有可用道具，请先在资源管理中创建。</p>}
        <Select label="选择道具" selectedKeys={selectedPropId ? [selectedPropId] : []} onSelectionChange={keys => setSelectedPropId(String(Array.from(keys)[0] || ''))}>
          {projectProps.map(prop => <SelectItem key={String(prop.id)} textValue={prop.name}>{prop.name}</SelectItem>)}</Select>
        <Select label="手持位置" selectedKeys={[handPosition]} onSelectionChange={keys => setHandPosition(String(Array.from(keys)[0] || 'right'))}>
          {[['right', '右手'], ['left', '左手'], ['both', '双手'], ['back', '背后'], ['waist', '腰间']].map(([value, label]) => <SelectItem key={value} textValue={label}>{label}</SelectItem>)}</Select>
        <Select label="持握方式" selectedKeys={[usageMode]} onSelectionChange={keys => setUsageMode(String(Array.from(keys)[0] || 'hold'))}>
          {[['hold', '持握'], ['wear', '佩戴'], ['carry', '背负'], ['ground', '放置']].map(([value, label]) => <SelectItem key={value} textValue={label}>{label}</SelectItem>)}</Select>
      </ModalBody><ModalFooter><Button variant="light" isDisabled={operationBusy} onPress={() => setEquipOpen(false)}>取消</Button><Button color="primary" isDisabled={!selectedPropId || operationBusy} onPress={() => { void equipProp(); }}>确认叠加</Button></ModalFooter>
    </ModalContent></Modal>
  </div>;
};
export default CharacterStateEditor;
