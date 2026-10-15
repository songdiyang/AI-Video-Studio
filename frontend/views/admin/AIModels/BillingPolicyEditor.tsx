import React, { useState, useEffect, useMemo } from 'react';
import { Button, Input, Select, SelectItem } from '@heroui/react';
import { Plus, Trash2, DollarSign, TrendingDown, Gift, AlertTriangle, Layers } from 'lucide-react';

interface BillingComponent {
  type: string;
  unit: string;
  price: number;
}

interface BillingTier {
  threshold: number;
  discount_rate: number;
  name?: string;
}

interface BillingAddon {
  name: string;
  price: number;
  unit: string;
  quantity?: number;
}

interface BillingDiscount {
  name: string;
  type: 'percentage' | 'fixed';
  rate: number;
}

interface BillingOverage {
  threshold: number;
  rate: number;
}

interface BillingPolicy {
  currency?: string;
  charge_on_failure?: boolean;
  base_fee?: number;
  components?: BillingComponent[];
  tiers?: BillingTier[];
  addons?: BillingAddon[];
  discounts?: BillingDiscount[];
  overage?: BillingOverage;
}

interface BillingPolicyEditorProps {
  value: string;
  onChange: (val: string) => void;
}

const COMPONENT_TYPES = [
  { value: 'input_tokens', label: '输入 Tokens' },
  { value: 'output_tokens', label: '输出 Tokens' },
  { value: 'total_tokens', label: '总 Tokens' },
  { value: 'duration_seconds', label: '时长(秒)' },
  { value: 'request_count', label: '请求次数' },
  { value: 'item_count', label: '生成数量' }
];

const UNITS = [
  { value: 'per_million_tokens', label: '每百万' },
  { value: 'per_token', label: '每 Token' },
  { value: 'per_second', label: '每秒' },
  { value: 'per_request', label: '每次' },
  { value: 'per_item', label: '每个' }
];

const BillingPolicyEditor: React.FC<BillingPolicyEditorProps> = ({ value, onChange }) => {
  const policy = useMemo<BillingPolicy>(() => {
    try {
      const parsed = JSON.parse(value || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, [value]);

  const [baseFee, setBaseFee] = useState<number>(policy.base_fee || 0);
  const [components, setComponents] = useState<BillingComponent[]>(policy.components || []);
  const [tiers, setTiers] = useState<BillingTier[]>(policy.tiers || []);
  const [addons, setAddons] = useState<BillingAddon[]>(policy.addons || []);
  const [discounts, setDiscounts] = useState<BillingDiscount[]>(policy.discounts || []);
  const [overage, setOverage] = useState<BillingOverage>(policy.overage || { threshold: 0, rate: 1 });

  // 同步外部 value 变化
  useEffect(() => {
    try {
      const parsed = JSON.parse(value || '{}');
      if (parsed && typeof parsed === 'object') {
        setBaseFee(parsed.base_fee || 0);
        setComponents(parsed.components || []);
        setTiers(parsed.tiers || []);
        setAddons(parsed.addons || []);
        setDiscounts(parsed.discounts || []);
        setOverage(parsed.overage || { threshold: 0, rate: 1 });
      }
    } catch { /* ignore */ }
  }, [value]);

  const emit = (updates: Partial<BillingPolicy>) => {
    const next: BillingPolicy = {
      currency: 'CNY',
      charge_on_failure: false,
      base_fee: baseFee,
      components,
      tiers,
      addons,
      discounts,
      overage,
      ...updates
    };
    // 清理空数组和默认值
    if (!next.base_fee) delete next.base_fee;
    if (!next.components?.length) delete next.components;
    if (!next.tiers?.length) delete next.tiers;
    if (!next.addons?.length) delete next.addons;
    if (!next.discounts?.length) delete next.discounts;
    if (!next.overage?.threshold) delete next.overage;
    onChange(JSON.stringify(next, null, 2));
  };

  // ============ 用量费用 ============
  const addComponent = () => {
    const next = [...components, { type: 'total_tokens', unit: 'per_million_tokens', price: 0 }];
    setComponents(next);
    emit({ components: next });
  };
  const updateComponent = (i: number, field: keyof BillingComponent, val: any) => {
    const next = components.map((c, idx) => idx === i ? { ...c, [field]: field === 'price' ? parseFloat(val) || 0 : val } : c);
    setComponents(next);
    emit({ components: next });
  };
  const removeComponent = (i: number) => {
    const next = components.filter((_, idx) => idx !== i);
    setComponents(next);
    emit({ components: next });
  };

  // ============ 阶梯折扣 ============
  const addTier = () => {
    const next = [...tiers, { threshold: 1000000, discount_rate: 0.9, name: '' }];
    setTiers(next);
    emit({ tiers: next });
  };
  const updateTier = (i: number, field: keyof BillingTier, val: any) => {
    const next = tiers.map((t, idx) => idx === i ? { ...t, [field]: field === 'name' ? val : parseFloat(val) || 0 } : t);
    setTiers(next);
    emit({ tiers: next });
  };
  const removeTier = (i: number) => {
    const next = tiers.filter((_, idx) => idx !== i);
    setTiers(next);
    emit({ tiers: next });
  };

  // ============ 附加服务 ============
  const addAddon = () => {
    const next = [...addons, { name: '', price: 0, unit: 'per_item', quantity: 1 }];
    setAddons(next);
    emit({ addons: next });
  };
  const updateAddon = (i: number, field: keyof BillingAddon, val: any) => {
    const next = addons.map((a, idx) => idx === i ? { ...a, [field]: field === 'name' || field === 'unit' ? val : parseFloat(val) || 0 } : a);
    setAddons(next);
    emit({ addons: next });
  };
  const removeAddon = (i: number) => {
    const next = addons.filter((_, idx) => idx !== i);
    setAddons(next);
    emit({ addons: next });
  };

  // ============ 优惠折扣 ============
  const addDiscount = () => {
    const next: BillingDiscount[] = [...discounts, { name: '', type: 'percentage', rate: 0.1 }];
    setDiscounts(next);
    emit({ discounts: next });
  };
  const updateDiscount = (i: number, field: keyof BillingDiscount, val: any) => {
    const next = discounts.map((d, idx) => idx === i ? { ...d, [field]: field === 'name' || field === 'type' ? val : parseFloat(val) || 0 } : d);
    setDiscounts(next);
    emit({ discounts: next });
  };
  const removeDiscount = (i: number) => {
    const next = discounts.filter((_, idx) => idx !== i);
    setDiscounts(next);
    emit({ discounts: next });
  };

  // ============ 超额附加费 ============
  const updateOverage = (field: keyof BillingOverage, val: string) => {
    const next = { ...overage, [field]: parseFloat(val) || 0 };
    setOverage(next);
    emit({ overage: next });
  };

  return (
    <div className="space-y-6">
      {/* 基础费用 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-[var(--accent)]" />
          基础费用
        </h4>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-muted)]">每次调用固定费用</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-[var(--text-muted)]">¥</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={baseFee}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                setBaseFee(v);
                emit({ base_fee: v });
              }}
              className="w-24 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* 用量费用 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-[var(--accent)]" />
          用量费用
          <span className="text-xs text-[var(--text-muted)] font-normal">按实际使用量计价</span>
        </h4>
        <div className="space-y-2">
          {components.map((comp, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={comp.type}
                onChange={(e) => updateComponent(i, 'type', e.target.value)}
                className="h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none"
              >
                {COMPONENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select
                value={comp.unit}
                onChange={(e) => updateComponent(i, 'unit', e.target.value)}
                className="h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none"
              >
                {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-sm text-[var(--text-muted)]">¥</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={comp.price}
                  onChange={(e) => updateComponent(i, 'price', e.target.value)}
                  className="w-full h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <button
                onClick={() => removeComponent(i)}
                className="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-color)]"
            startContent={<Plus className="w-3.5 h-3.5" />}
            onPress={addComponent}
          >
            添加计费项
          </Button>
        </div>
      </div>

      {/* 阶梯/分级折扣 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <TrendingDown className="w-4 h-4 text-emerald-400" />
          阶梯/分级折扣
          <span className="text-xs text-[var(--text-muted)] font-normal">用量达到阈值后享受折扣</span>
        </h4>
        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="折扣名称（可选）"
                value={tier.name || ''}
                onChange={(e) => updateTier(i, 'name', e.target.value)}
                className="w-32 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-muted)] shrink-0">≥</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={tier.threshold}
                onChange={(e) => updateTier(i, 'threshold', e.target.value)}
                className="w-28 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-muted)] shrink-0">用量后</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={tier.discount_rate}
                onChange={(e) => updateTier(i, 'discount_rate', e.target.value)}
                className="w-20 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-muted)] shrink-0">折</span>
              <button
                onClick={() => removeTier(i)}
                className="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-color)]"
            startContent={<Plus className="w-3.5 h-3.5" />}
            onPress={addTier}
          >
            添加阶梯折扣
          </Button>
        </div>
      </div>

      {/* 附加服务 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-purple-400" />
          附加服务
          <span className="text-xs text-[var(--text-muted)] font-normal">额外增值服务费用</span>
        </h4>
        <div className="space-y-2">
          {addons.map((addon, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="服务名称"
                value={addon.name}
                onChange={(e) => updateAddon(i, 'name', e.target.value)}
                className="flex-1 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-muted)]">¥</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={addon.price}
                onChange={(e) => updateAddon(i, 'price', e.target.value)}
                className="w-20 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-muted)]">x</span>
              <input
                type="number"
                min={1}
                value={addon.quantity || 1}
                onChange={(e) => updateAddon(i, 'quantity', e.target.value)}
                className="w-16 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={() => removeAddon(i)}
                className="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-color)]"
            startContent={<Plus className="w-3.5 h-3.5" />}
            onPress={addAddon}
          >
            添加附加服务
          </Button>
        </div>
      </div>

      {/* 优惠/折扣 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <Gift className="w-4 h-4 text-pink-400" />
          优惠/折扣
          <span className="text-xs text-[var(--text-muted)] font-normal">从总费用中扣减</span>
        </h4>
        <div className="space-y-2">
          {discounts.map((discount, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="折扣名称"
                value={discount.name}
                onChange={(e) => updateDiscount(i, 'name', e.target.value)}
                className="flex-1 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <select
                value={discount.type}
                onChange={(e) => updateDiscount(i, 'type', e.target.value)}
                className="h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none"
              >
                <option value="percentage">百分比</option>
                <option value="fixed">固定金额</option>
              </select>
              <span className="text-sm text-[var(--text-muted)]">{discount.type === 'percentage' ? '' : '¥'}</span>
              <input
                type="number"
                min={0}
                step={discount.type === 'percentage' ? 0.05 : 0.01}
                max={discount.type === 'percentage' ? 1 : undefined}
                value={discount.rate}
                onChange={(e) => updateDiscount(i, 'rate', e.target.value)}
                className="w-20 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-muted)] shrink-0">{discount.type === 'percentage' ? '%' : ''}</span>
              <button
                onClick={() => removeDiscount(i)}
                className="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-color)]"
            startContent={<Plus className="w-3.5 h-3.5" />}
            onPress={addDiscount}
          >
            添加优惠折扣
          </Button>
        </div>
      </div>

      {/* 超额附加费 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          超额附加费
          <span className="text-xs text-[var(--text-muted)] font-normal">用量超过阈值后额外收费</span>
        </h4>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-muted)]">当用量超过</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={overage.threshold}
            onChange={(e) => updateOverage('threshold', e.target.value)}
            className="w-28 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text-muted)]">时，超额部分按</span>
          <input
            type="number"
            min={1}
            step={0.5}
            value={overage.rate}
            onChange={(e) => updateOverage('rate', e.target.value)}
            className="w-16 h-8 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text-muted)]">倍计价</span>
        </div>
      </div>
    </div>
  );
};

export default BillingPolicyEditor;
