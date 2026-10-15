import React, { useState, useMemo } from 'react';
import {
  Button, Chip, Tooltip, Badge, Tabs, Tab
} from '@heroui/react';
import {
  MessageSquare, Image, Video, Wrench, Brain, Star,
  Zap, Eye, ToggleLeft, ToggleRight, Trash2, Edit3,
  Sparkles, Bot, Camera, Mic, Palette, Volume2
} from 'lucide-react';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useToast } from '../../../contexts/ToastContext';
import { getAdminAuthHeaders } from '../../../services/auth';

// ============================================================
// 类型定义
// ============================================================
export interface V2Model {
  id: number;
  name: string;
  provider_id: number;
  model_id: string;
  provider: string;
  provider_display_name?: string;
  capabilities: string[];
  metadata?: {
    description?: string;
    max_tokens?: number;
    context_window?: number;
    [key: string]: any;
  };
  pricing?: {
    input?: number;
    output?: number;
    currency?: string;
  };
  quality_score: number;
  is_recommended: number;
  is_active: number;
  is_discovered: number;
  adapter_name: string;
  created_at: string;
  updated_at: string;
  _source?: string;
}

interface ModelCatalogProps {
  models: V2Model[];
  onRefresh: () => void;
  onEdit: (model: V2Model) => void;
  onTest: (model: V2Model) => void;
}

// ============================================================
// 能力标签配置
// ============================================================
const CAPABILITY_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  chat: { icon: <MessageSquare size={12} />, label: '对话', color: 'primary' },
  vision: { icon: <Eye size={12} />, label: '视觉', color: 'secondary' },
  image_gen: { icon: <Image size={12} />, label: '生图', color: 'success' },
  video_gen: { icon: <Video size={12} />, label: '生视频', color: 'warning' },
  audio_gen: { icon: <Mic size={12} />, label: '生声音', color: 'danger' },
  tool_calling: { icon: <Wrench size={12} />, label: '工具', color: 'default' },
  reasoning: { icon: <Brain size={12} />, label: '推理', color: 'primary' },
  code: { icon: <Sparkles size={12} />, label: '代码', color: 'secondary' },
};

const CATEGORY_TABS = [
  { key: 'all', label: '全部', icon: <Bot size={14} /> },
  { key: 'chat', label: '对话', icon: <MessageSquare size={14} /> },
  { key: 'vision', label: '视觉', icon: <Camera size={14} /> },
  { key: 'image_gen', label: '生图', icon: <Palette size={14} /> },
  { key: 'video_gen', label: '生视频', icon: <Video size={14} /> },
  { key: 'audio_gen', label: '生声音', icon: <Volume2 size={14} /> },
];

// ============================================================
// 组件
// ============================================================
const ModelCatalog: React.FC<ModelCatalogProps> = ({ models, onRefresh, onEdit, onTest }) => {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 过滤模型
  const filteredModels = useMemo(() => {
    let result = models;

    // 按能力过滤
    if (activeTab !== 'all') {
      result = result.filter(m => m.capabilities?.includes(activeTab));
    }

    // 按搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.model_id.toLowerCase().includes(q) ||
        m.provider?.toLowerCase().includes(q)
      );
    }

    // 排序：推荐优先，然后质量分
    return result.sort((a, b) => {
      if (a.is_recommended !== b.is_recommended) {
        return (b.is_recommended || 0) - (a.is_recommended || 0);
      }
      return (b.quality_score || 0) - (a.quality_score || 0);
    });
  }, [models, activeTab, searchQuery]);

  // 删除模型
  const handleDelete = async (model: V2Model) => {
    const confirmed = await confirm({
      title: '确认删除',
      message: `确定要删除模型 "${model.name}" 吗？此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/ai-models-v2/${model.id}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });

      if (response.ok) {
        showToast('模型删除成功', 'success');
        onRefresh();
      } else {
        showToast('删除失败', 'error');
      }
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  // 切换激活状态
  const handleToggleActive = async (model: V2Model) => {
    try {
      const response = await fetch(`/api/admin/ai-models-v2/${model.id}`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...model,
          is_active: model.is_active ? 0 : 1,
        }),
      });

      if (response.ok) {
        showToast(model.is_active ? '模型已停用' : '模型已启用', 'success');
        onRefresh();
      }
    } catch (error) {
      showToast('操作失败', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="搜索模型名称、ID、平台..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-default-100 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <svg className="absolute left-3 top-2.5 text-default-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <span className="text-xs text-default-500">
          共 {filteredModels.length} 个模型
        </span>
      </div>

      {/* 分类标签 */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key))}
        size="sm"
        variant="underlined"
        classNames={{
          tabList: 'gap-4',
        }}
      >
        {CATEGORY_TABS.map(tab => (
          <Tab
            key={tab.key}
            title={
              <div className="flex items-center gap-1.5">
                {tab.icon}
                <span>{tab.label}</span>
                <Badge size="sm" variant="flat" color="default">
                  {tab.key === 'all'
                    ? models.length
                    : models.filter(m => m.capabilities?.includes(tab.key)).length
                  }
                </Badge>
              </div>
            }
          />
        ))}
      </Tabs>

      {/* 模型卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModels.map(model => (
          <ModelCatalogCard
            key={model.id}
            model={model}
            onEdit={() => onEdit(model)}
            onTest={() => onTest(model)}
            onDelete={() => handleDelete(model)}
            onToggleActive={() => handleToggleActive(model)}
          />
        ))}
      </div>

      {filteredModels.length === 0 && (
        <div className="text-center py-16 text-default-400">
          <Bot size={48} className="mx-auto mb-3 opacity-40" />
          <p>暂无模型</p>
          <p className="text-sm mt-1">使用「智能发现」或手动添加模型</p>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 单个模型卡片
// ============================================================
const ModelCatalogCard: React.FC<{
  model: V2Model;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}> = ({ model, onEdit, onTest, onDelete, onToggleActive }) => {
  const caps = model.capabilities || [];
  const isActive = !!model.is_active;

  return (
    <div className={`relative rounded-xl border p-4 transition-all hover:shadow-md ${
      isActive
        ? 'bg-content1 border-default-200'
        : 'bg-default-50 border-default-100 opacity-70'
    }`}>
      {/* 推荐标记 */}
      {model.is_recommended ? (
        <div className="absolute -top-2 -right-2">
          <Tooltip content="推荐模型">
            <div className="bg-warning text-warning-foreground rounded-full p-1 shadow-sm">
              <Star size={14} fill="currentColor" />
            </div>
          </Tooltip>
        </div>
      ) : null}

      {/* 头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">{model.name}</h3>
            {model.is_discovered ? (
              <Chip size="sm" variant="flat" color="success" className="text-[10px]">
                自动发现
              </Chip>
            ) : null}
          </div>
          <p className="text-xs text-default-500 mt-0.5 truncate">
            {model.provider_display_name || model.provider} · {model.model_id}
          </p>
        </div>
      </div>

      {/* 能力标签 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {caps.slice(0, 4).map(cap => {
          const config = CAPABILITY_CONFIG[cap];
          if (!config) return null;
          return (
            <Chip
              key={cap}
              size="sm"
              variant="flat"
              color={config.color as any}
              className="text-[10px] h-5"
              startContent={config.icon}
            >
              {config.label}
            </Chip>
          );
        })}
        {caps.length > 4 && (
          <Chip size="sm" variant="flat" className="text-[10px] h-5">
            +{caps.length - 4}
          </Chip>
        )}
      </div>

      {/* 元信息 */}
      <div className="space-y-1 mb-3">
        {model.metadata?.max_tokens ? (
          <div className="flex justify-between text-xs">
            <span className="text-default-500">最大 Token</span>
            <span>{model.metadata.max_tokens?.toLocaleString?.() || model.metadata.max_tokens}</span>
          </div>
        ) : null}
        {model.pricing?.input ? (
          <div className="flex justify-between text-xs">
            <span className="text-default-500">输入价格</span>
            <span>¥{model.pricing.input}/M tokens</span>
          </div>
        ) : null}
        {model.quality_score ? (
          <div className="flex justify-between text-xs">
            <span className="text-default-500">质量评分</span>
            <span className="text-warning">{'★'.repeat(Math.round(model.quality_score / 2))}</span>
          </div>
        ) : null}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 pt-3 border-t border-default-100">
        <Tooltip content="测试">
          <Button isIconOnly size="sm" variant="light" onPress={onTest}>
            <Zap size={14} />
          </Button>
        </Tooltip>
        <Tooltip content="编辑">
          <Button isIconOnly size="sm" variant="light" onPress={onEdit}>
            <Edit3 size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={isActive ? '停用' : '启用'}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color={isActive ? 'success' : 'default'}
            onPress={onToggleActive}
          >
            {isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          </Button>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip content="删除">
          <Button isIconOnly size="sm" variant="light" color="danger" onPress={onDelete}>
            <Trash2 size={14} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default ModelCatalog;
