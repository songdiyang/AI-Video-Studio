import React from 'react';
import { Card, CardBody, Button, Chip } from '@heroui/react';
import { Cpu, Edit, Trash2, Play, Zap } from 'lucide-react';
import { AIModel } from './types';

interface ModelCardProps {
  model: AIModel;
  onEdit: (model: AIModel) => void;
  onDelete: (modelId: number) => void;
  onTest: (model: AIModel) => void;
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    TEXT: 'bg-blue-500/10 text-blue-400',
    IMAGE: 'bg-purple-500/10 text-purple-400',
    VIDEO: 'bg-pink-500/10 text-pink-400',
    AUDIO: 'bg-emerald-500/10 text-emerald-400',
    MULTIMODAL: 'bg-teal-500/10 text-teal-400'
  };
  return colors[category] || 'bg-slate-700/50 text-slate-400';
};

const ModelCard: React.FC<ModelCardProps> = ({ model, onEdit, onDelete, onTest }) => {
  return (
    <Card className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm hover:shadow-md hover:shadow-[var(--accent)]/5 transition-shadow">
      <CardBody className="p-5">
        {/* 头部：图标 + 名称 + 状态 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${model.provider_id && model.model_id ? 'bg-[var(--accent)]/10' : 'bg-[var(--accent)]/5'}`}>
              {model.provider_id && model.model_id ? (
                <Zap className="w-5 h-5 text-[var(--accent)]" />
              ) : (
                <Cpu className="w-5 h-5 text-[var(--text-muted)]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[var(--text-primary)] truncate">{model.name}</h3>
                {model.provider_id && model.model_id && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-medium shrink-0">
                    <Zap className="w-3 h-3" />
                    适配层
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text-muted)] truncate">
                {model.provider}
                {model.model_id && (
                  <span className="text-[var(--accent)] ml-1">/ {model.model_id}</span>
                )}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
            model.is_active 
              ? 'bg-emerald-500/10 text-emerald-400' 
              : 'bg-[var(--border-color)] text-[var(--text-muted)]'
          }`}>
            {model.is_active ? '启用' : '禁用'}
          </span>
        </div>
        
        {/* 信息行 */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-[var(--text-muted)]">分类</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(model.category)}`}>
              {model.category}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-[var(--text-muted)]">价格</span>
            <span className="font-medium text-[var(--text-primary)] text-right max-w-[14rem] truncate text-xs" title={model.priceSummary || '计费配置错误'}>
              {model.priceSummary || '计费配置错误'}
            </span>
          </div>
          {model.custom_handler && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-muted)]">Handler</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400">
                {model.custom_handler}
              </span>
            </div>
          )}
          {model.billing_handler && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-muted)]">计费</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-500/10 text-cyan-400">
                {model.billing_handler}
              </span>
            </div>
          )}
          {model.description && (
            <div className="text-xs text-[var(--text-muted)] mt-2 line-clamp-2">
              {model.description}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 font-medium"
            startContent={<Play className="w-4 h-4" />}
            onPress={() => onTest(model)}
          >
            调试
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-color)] font-medium"
            startContent={<Edit className="w-4 h-4" />}
            onPress={() => onEdit(model)}
          >
            编辑
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium min-w-0 px-3"
            onPress={() => onDelete(model.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default ModelCard;
