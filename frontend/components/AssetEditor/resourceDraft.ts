// 仅供资源及角色状态编辑使用；不持有媒体生成逻辑或跨编辑器全局状态。
export type ResourceSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type ResourceData = Record<string, any>;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const ASSET_FIELDS: Record<string, readonly string[]> = {
  character: ['name', 'description', 'personality', 'tags'],
  scene: ['name', 'description', 'environment', 'lighting', 'mood', 'tags'],
  studio: ['name', 'description'],
  prop: ['name', 'description', 'prop_type', 'category', 'tags', 'style_config'],
  costume: ['name', 'description', 'category', 'gender', 'outfit_prompt', 'tags'],
  environment: ['name', 'description', 'timeOfDay', 'weather', 'lighting', 'mood', 'terrainType'],
  building: ['name', 'description', 'interiorExterior', 'structureType'],
  script: ['name', 'content'],
};
export const STATE_FIELDS = ['name', 'description', 'appearance', 'outfit', 'age_stage', 'hairstyle',
  'accessories', 'body_elements', 'held_props', 'state_category', 'tags', 'costume_id', 'voice_config'] as const;
const ALIASES: Record<string, Record<string, string>> = {
  environment: { timeOfDay: 'time_of_day', terrainType: 'terrain_type' },
  building: { interiorExterior: 'interior_exterior', structureType: 'structure_type' },
};
export function normalizeAsset(type: string, source: ResourceData = {}): ResourceData {
  const data = { ...source };
  for (const [camel, snake] of Object.entries(ALIASES[type] || {})) {
    if (Object.hasOwn(source, snake)) data[camel] = source[snake];
  }
  if (type === 'prop' && typeof data.style_config === 'string') {
    try { data.style_config = JSON.parse(data.style_config); } catch { /* 保留未知原值，未修改时不写回 */ }
  }
  return data;
}
export function assetSavedData(type: string, data: ResourceData): ResourceData {
  const result = { ...data };
  for (const [camel, snake] of Object.entries(ALIASES[type] || {})) {
    if (Object.hasOwn(data, camel)) result[snake] = data[camel];
  }
  return result;
}
export function pickResourceFields(data: ResourceData, fields: readonly string[]): ResourceData {
  return Object.fromEntries(fields.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
}
export function normalizeState(source: ResourceData): ResourceData {
  const data: ResourceData = { ...source, body_elements: source.body_elements || '' };
  if (typeof data.voice_config === 'string') {
    try { data.voice_config = JSON.parse(data.voice_config); } catch { /* 不清空无法解析的已有配置 */ }
  }
  return data;
}
export function statePayload(data: ResourceData): ResourceData {
  const result = pickResourceFields(data, STATE_FIELDS);
  if (!result.name?.trim()) throw new Error('状态名称不能为空');
  result.name = result.name.trim();
  const cats = [];
  if (result.costume_id || result.outfit) cats.push('costume');
  if (result.body_elements) cats.push('effect');
  result.state_category = cats.length ? cats : ['daily'];
  if (Array.isArray(result.tags)) result.tags = JSON.stringify(result.tags);
  else if (typeof result.tags !== 'string') result.tags = '[]';
  return result;
}

/** 单对象单草稿：同一在途 Promise 串行排空后续输入，失败不清空草稿。 */
export class ResourceDraft {
  data: ResourceData;
  status: ResourceSaveStatus = 'idle';
  error = '';
  revision = 0;
  private baseline: ResourceData;
  private versions: Record<string, number> = {};
  private pending: Promise<boolean> | null = null;
  onChange?: () => void;
  onSaved?: (data: ResourceData) => void;
  constructor(
    initial: ResourceData,
    readonly fields: readonly string[],
    private write: (payload: ResourceData, snapshot: ResourceData) => Promise<ResourceData | void>,
  ) {
    this.data = { ...initial };
    this.baseline = pickResourceFields(initial, fields);
  }
  get dirty() { return !equal(pickResourceFields(this.data, this.fields), this.baseline); }
  edit(patch: ResourceData) {
    const allowed = pickResourceFields(patch, this.fields);
    for (const [key, value] of Object.entries(allowed)) {
      if (!equal(this.data[key], value)) this.versions[key] = ++this.revision;
    }
    this.data = { ...this.data, ...allowed };
    if (this.status !== 'saving' && this.status !== 'error') this.status = this.dirty ? 'dirty' : 'idle';
    this.onChange?.();
  }
  /** 同目标父级回传只补缺失字段；详情请求用发起时的 revision 防止覆盖新输入。 */
  receive(incoming: ResourceData, checkpoint?: number) {
    const next = { ...this.data };
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined || key === 'id' || key === 'project_id' || key === 'character_id') continue;
      if (this.fields.includes(key)) {
        const untouched = (this.versions[key] || 0) === 0;
        const fresh = checkpoint !== undefined && checkpoint === this.revision && !this.pending && equal(this.data[key], this.baseline[key]);
        if (!(fresh || (untouched && !Object.hasOwn(this.data, key)))) continue;
        this.baseline[key] = value;
      }
      next[key] = value;
    }
    this.data = next;
    this.onChange?.();
  }
  /** 专用媒体操作的结果只更新非表单字段。 */
  media(patch: ResourceData) {
    this.data = { ...this.data, ...Object.fromEntries(Object.entries(patch).filter(([key, value]) =>
      value !== undefined && !this.fields.includes(key) && !['id', 'project_id', 'character_id'].includes(key))) };
    this.onChange?.();
  }
  flush = (): Promise<boolean> => {
    if (this.pending) return this.pending;
    if (!this.dirty) {
      if (this.status === 'error') { this.status = 'idle'; this.error = ''; this.onChange?.(); }
      return Promise.resolve(true);
    }
    // 微任务启动，保证同步抛错与重入 flush 也共享同一 Promise。
    this.pending = Promise.resolve().then(async () => {
      this.status = 'saving';
      this.onChange?.();
      try {
        while (this.dirty) {
          const snapshot = { ...this.data };
          const values = pickResourceFields(snapshot, this.fields);
          const versions = { ...this.versions };
          const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => !equal(value, this.baseline[key])));
          const response = await this.write(changed, snapshot);
          const accepted = { ...values };
          // 仅接受白名单回包；媒体、关联、未知数据不通过普通保存回灌。
          for (const key of this.fields) {
            if (response && response[key] !== undefined) accepted[key] = response[key];
          }
          // 新建状态仅在服务端成功后接受其 ID，其余标识始终来自会话。
          if (!this.data.id && response && response.id) this.data = { ...this.data, id: response.id };
          const next = { ...this.data };
          for (const key of this.fields) {
            if (accepted[key] !== undefined && this.versions[key] === versions[key]) next[key] = accepted[key];
          }
          this.baseline = accepted;
          this.data = next;
          this.error = '';
          this.onChange?.();
          this.onSaved?.({ ...this.data, ...accepted });
        }
        this.status = 'saved';
        return true;
      } catch (error) {
        this.status = 'error';
        this.error = error instanceof Error ? error.message : '保存失败，请重试';
        return false;
      } finally {
        this.pending = null;
        this.onChange?.();
      }
    });
    return this.pending;
  };
}
