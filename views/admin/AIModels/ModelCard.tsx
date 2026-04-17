import React from 'react';
import { Card, CardBody, Button, Chip } from '@heroui/react';
import { Cpu, Edit, Trash2, Play } from 'lucide-react';
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
    <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm hover:shadow-md hover:shadow-blue-500/5 transition-shadow">
      <CardBody className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
              <Cpu className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">{model.name}</h3>
              <p className="text-sm text-slate-500">{model.provider}</p>
            </div>
          </div>
          <Chip 
            size="sm" 
            className={model.is_active ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'bg-slate-700/50 text-slate-500 font-medium'}
          >
            {model.is_active ? '启用' : '禁用'}
          </Chip>
        </div>
        
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">分类</span>
            <Chip size="sm" className={getCategoryColor(model.category)}>
              {model.category}
            </Chip>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">价格</span>
            <span className="font-medium text-slate-200 text-right max-w-[16rem] truncate" title={model.priceSummary || '计费配置错误'}>
              {model.priceSummary || '计费配置错误'}
            </span>
          </div>
          {model.custom_handler && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Handler</span>
              <Chip size="sm" className="bg-amber-500/10 text-amber-400">
                {model.custom_handler}
              </Chip>
            </div>
          )}
          {model.billing_handler && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">计费</span>
              <Chip size="sm" className="bg-cyan-500/10 text-cyan-400">
                {model.billing_handler}
              </Chip>
            </div>
          )}
          {model.description && (
            <div className="text-xs text-slate-500 mt-2 line-clamp-2">
              {model.description}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-green-500/10 text-green-400 hover:bg-green-500/20 font-medium"
            startContent={<Play className="w-4 h-4" />}
            onPress={() => onTest(model)}
          >
            调试
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 font-medium"
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
