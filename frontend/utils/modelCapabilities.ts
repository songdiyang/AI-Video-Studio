export interface ModelCapabilityOption {
  value: string;
  label: string;
}

/**
 * 任务槽位 → 可胜任的模型类型（大写 category）静态映射。
 * 多模态大模型同样能执行纯文本任务（剧本生成、分镜拆分、提示词优化等），
 * 因此文本槽位接受 TEXT 与 MULTIMODAL；未知槽位保守回退为自身类型。
 */
export const TASK_SLOT_MODEL_TYPES: Record<string, string[]> = {
  TEXT: ['TEXT', 'MULTIMODAL'],
  IMAGE: ['IMAGE'],
  VIDEO: ['VIDEO'],
  AUDIO: ['AUDIO'],
  MULTIMODAL: ['MULTIMODAL'],
};

/** 获取某任务槽位可接受的模型类型集合（大小写不敏感）。 */
export function getModelTypesForSlot(slot: string): string[] {
  const key = (slot || '').toUpperCase();
  return TASK_SLOT_MODEL_TYPES[key] || [key];
}

/** 判断某模型类型能否用于该任务槽位。 */
export function isModelTypeAllowedForSlot(modelType: string, slot: string): boolean {
  const mt = (modelType || '').toUpperCase();
  return getModelTypesForSlot(slot).some(t => t.toUpperCase() === mt);
}

/** 模型的类型字段形态（type/category 任一）。 */
interface TypedModelLike {
  type?: string | null;
  category?: string | null;
  name?: string | null;
}

/** 筛选能胜任某任务槽位的模型，按 name 去重并保持槽位能力集合的优先级顺序。 */
export function filterModelsForTaskSlot<T extends TypedModelLike>(models: T[], slot: string): T[] {
  const allowed = getModelTypesForSlot(slot);
  const seen = new Set<string>();
  return allowed.flatMap(t =>
    models.filter(m => {
      if ((m.type || m.category || '').toUpperCase() !== t) return false;
      const key = m.name || '';
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    })
  );
}

type RawCapabilityOption =
  | string
  | number
  | {
      value?: string | number | null;
      label?: string | null;
      name?: string | null;
    };

function toArray(value: unknown): RawCapabilityOption[] {
  return Array.isArray(value) ? (value as RawCapabilityOption[]) : [];
}

const RESOLUTION_LABELS: Record<string, string> = {
  '512': '0.5K',
  '720': '720p',
  '1024': '1K',
  '1080': '1080p',
  '1536': '1.5K',
  '2048': '2K',
  '2560': '2.5K',
  '3072': '3K',
  '4096': '4K',
};

function formatDefaultLabel(value: string, type: string): string {
  if (type === 'duration') return `${value} \u79D2`;
  if (type === 'resolution') return RESOLUTION_LABELS[value] || `${value}px`;
  return value;
}

export function normalizeCapabilityOptions(
  value: unknown,
  type: 'aspectRatio' | 'duration' | 'resolution'
): ModelCapabilityOption[] {
  const seen = new Set<string>();
  const normalized: ModelCapabilityOption[] = [];

  for (const item of toArray(value)) {
    let rawValue: string | number | null | undefined;
    let rawLabel: string | null | undefined;

    if (typeof item === 'string' || typeof item === 'number') {
      rawValue = item;
    } else if (item && typeof item === 'object') {
      rawValue = item.value ?? item.name;
      rawLabel = item.label ?? null;
    }

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      continue;
    }

    const normalizedValue = String(rawValue);
    if (seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    normalized.push({
      value: normalizedValue,
      label: rawLabel || formatDefaultLabel(normalizedValue, type)
    });
  }

  return normalized;
}

export function summarizeCapabilityOptions(
  value: unknown,
  type: 'aspectRatio' | 'duration' | 'resolution'
): string {
  const options = normalizeCapabilityOptions(value, type);
  if (options.length === 0) {
    return '未配置';
  }

  return options.map((option) => option.label).join(' / ');
}

