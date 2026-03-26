export interface ModelCapabilityOption {
  value: string;
  label: string;
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
      label: rawLabel || (type === 'duration' ? `${normalizedValue} 秒` : normalizedValue)
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

