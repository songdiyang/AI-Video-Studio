import React, { useState, useEffect } from 'react';
import { Button, Select, SelectItem, Checkbox, Input } from '@heroui/react';
import { Search, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { getAdminAuthHeaders } from '../../../services/auth';
import { useToast } from '../../../contexts/ToastContext';

interface ModelProvider {
  id: number;
  name: string;
  display_name: string;
}

interface DiscoveredModel {
  name: string;
  model_id: string;
  description: string;
  category: string;
  input_price_per_million: number;
  output_price_per_million: number;
  provider_id: number;
  provider_name: string;
}

interface ModelDiscoveryPanelProps {
  category: string;
  providers: ModelProvider[];
  onSuccess?: () => void;
  onCategoryChange?: (category: string) => void;
}

const categoryLabels: Record<string, string> = {
  TEXT: '文本模型',
  IMAGE: '图像生成',
  VIDEO: '视频生成',
  AUDIO: '音频模型',
  MULTIMODAL: '多模态',
  '3D': '3D 生成',
};

const ModelDiscoveryPanel: React.FC<ModelDiscoveryPanelProps> = ({
  category,
  providers,
  onSuccess,
  onCategoryChange
}) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(category);
  const [discovering, setDiscovering] = useState(false);
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const { showToast } = useToast();

  // 同步外部 category 变化
  useEffect(() => {
    setSelectedCategory(category);
  }, [category]);

  // 发现模型
  const handleDiscover = async () => {
    if (!selectedProvider) {
      showToast('请先选择厂商平台', 'warning');
      return;
    }

    setDiscovering(true);
    setModels([]);
    setSelectedModels(new Set());

    try {
      const response = await fetch('/api/admin/ai-models/discover', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ providerId: parseInt(selectedProvider), category: selectedCategory })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '发现模型失败');
      }

      if (data.models && data.models.length > 0) {
        setModels(data.models);
        // 默认全选
        setSelectedModels(new Set(data.models.map((_, i: number) => i)));
        showToast(`发现 ${data.models.length} 个模型`, 'success');
      } else {
        showToast('该平台暂无可用的此类模型', 'info');
      }
    } catch (error: any) {
      console.error('发现模型失败:', error);
      showToast(error.message || '发现模型失败', 'error');
    } finally {
      setDiscovering(false);
    }
  };

  // 切换选中
  const toggleModel = (index: number) => {
    const next = new Set(selectedModels);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedModels(next);
  };

  // 全选/取消全选
  const toggleAll = () => {
    if (selectedModels.size === models.length) {
      setSelectedModels(new Set());
    } else {
      setSelectedModels(new Set(models.map((_, i) => i)));
    }
  };

  // 批量接入
  const handleImport = async () => {
    if (selectedModels.size === 0) {
      showToast('请至少选择一个模型', 'warning');
      return;
    }

    const toImport = Array.from(selectedModels).map(i => models[i]);

    setImporting(true);
    try {
      const response = await fetch('/api/admin/ai-models/batch', {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ models: toImport })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '批量接入失败');
      }

      showToast(`成功接入 ${data.created} 个模型${data.errors?.length > 0 ? `，${data.errors.length} 个失败` : ''}`,
        data.errors?.length > 0 ? 'warning' : 'success'
      );

      if (data.created > 0) {
        setModels([]);
        setSelectedModels(new Set());
        onSuccess?.();
      }
    } catch (error: any) {
      console.error('批量接入失败:', error);
      showToast(error.message || '批量接入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  const providerName = providers.find(p => String(p.id) === selectedProvider)?.display_name || '';

  return (
    <div className="space-y-4">
      {/* 选择平台 + 模型类型 + 发现按钮 */}
      <div className="flex items-center gap-3">
        <Select
          label="选择厂商"
          placeholder="选择已配置的平台"
          selectedKeys={selectedProvider ? [selectedProvider] : []}
          onChange={(e) => setSelectedProvider(e.target.value)}
          className="flex-1"
          classNames={{
            trigger: "bg-[var(--bg-card)] border-[var(--border-color)]",
            label: "text-[var(--text-secondary)]"
          }}
        >
          {providers.map(p => (
            <SelectItem key={String(p.id)}>{p.display_name || p.name}</SelectItem>
          ))}
        </Select>
        <Input
          label="模型类型"
          placeholder="输入类型，如 TEXT, 3D"
          value={selectedCategory}
          onChange={(e) => {
            const newCat = e.target.value.toUpperCase();
            setSelectedCategory(newCat);
            onCategoryChange?.(newCat);
          }}
          className="w-48 shrink-0"
          classNames={{
            input: "bg-[var(--bg-card)] border-[var(--border-color)]",
            label: "text-[var(--text-secondary)]"
          }}
        />
        <Button
          className="bg-[var(--accent)] text-white font-medium shrink-0"
          startContent={discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          onPress={handleDiscover}
          isDisabled={discovering || !selectedProvider}
        >
          {discovering ? '发现中...' : '发现模型'}
        </Button>
      </div>

      {/* 模型列表 */}
      {models.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                isSelected={selectedModels.size === models.length}
                onValueChange={toggleAll}
                size="sm"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                全选 ({selectedModels.size}/{models.length})
              </span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              {providerName} · {categoryLabels[selectedCategory] || selectedCategory}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {models.map((model, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedModels.has(index)
                    ? 'bg-[var(--accent)]/5 border-[var(--accent)]/30'
                    : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--accent)]/20'
                }`}
                onClick={() => toggleModel(index)}
              >
                <Checkbox
                  isSelected={selectedModels.has(index)}
                  onValueChange={() => toggleModel(index)}
                  size="sm"
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)] text-sm">{model.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] font-mono">
                      {model.model_id}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    {model.description}
                  </p>
                  {(model.input_price_per_million > 0 || model.output_price_per_million > 0) && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      价格: ¥{model.input_price_per_million}/百万输入 · ¥{model.output_price_per_million}/百万输出
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            className="w-full bg-[var(--accent)] text-white font-medium"
            startContent={importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            onPress={handleImport}
            isDisabled={importing || selectedModels.size === 0}
          >
            {importing ? '接入中...' : `接入选中模型 (${selectedModels.size})`}
          </Button>
        </div>
      )}

      {/* 空状态提示 */}
      {!discovering && models.length === 0 && selectedProvider && (
        <div className="text-center py-6 text-[var(--text-muted)] text-sm">
          点击「发现模型」获取 {providerName} 的 {categoryLabels[selectedCategory] || selectedCategory} 列表
        </div>
      )}
    </div>
  );
};

export default ModelDiscoveryPanel;
