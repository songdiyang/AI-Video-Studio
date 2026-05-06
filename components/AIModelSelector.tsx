import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { Coins } from 'lucide-react';
import { summarizeCapabilityOptions } from '../utils/modelCapabilities';

export interface AIModel {
  id?: number;
  name: string;
  provider: string;
  type: string;
  category?: string;
  description?: string;
  isActive?: boolean;
  priceConfig?: unknown;
  priceSummary?: string;
  supportedAspectRatios?: unknown;
  supportedDurations?: unknown;
  supportedResolutions?: unknown;
  supports_tool_calling?: boolean;
}

interface AIModelSelectorProps {
  label?: string;
  description?: string;
  placeholder?: string;
  models: AIModel[];
  selectedModel: string;
  onModelChange: (modelName: string) => void;
  filterType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MULTIMODAL';
  size?: 'sm' | 'md' | 'lg';
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
}

const AIModelSelector: React.FC<AIModelSelectorProps> = ({
  label = 'AI 模型',
  description,
  placeholder = '请选择模型',
  models,
  selectedModel,
  onModelChange,
  filterType,
  size = 'md',
  isDisabled = false,
  isRequired = false,
  className = ''
}) => {
  const getPriceText = (model?: AIModel) => model?.priceSummary || '';

  // 根据类型过滤模型 - 使用 category 字段（后端返回的字段名）
  const filteredModels = React.useMemo(() => {
    // 如果 models 为空，返回空数组
    if (!models || models.length === 0) {
      return [];
    }
    
    const filtered = filterType
      ? models.filter(m => {
          const modelType = (m.type || m.category)?.toUpperCase();
          return modelType === filterType.toUpperCase();
        })
      : models;
    
    // 按模型名称去重（防止后端返回重复数据）
    const uniqueMap = new Map<string, AIModel>();
    filtered.forEach(m => {
      if (!uniqueMap.has(m.name)) {
        uniqueMap.set(m.name, m);
      }
    });
    
    return Array.from(uniqueMap.values());
  }, [models, filterType]);

  // 获取选中模型的详细信息
  // 确保 selectedModel 在 filteredModels 中存在，否则清空
  const selectedModelInfo = filteredModels.length > 0 && filteredModels.find(m => m.name === selectedModel);
  
  // 如果 selectedModel 不在列表中，触发 onChange 清空它
  React.useEffect(() => {
    if (selectedModel && filteredModels.length > 0 && !selectedModelInfo) {
      // selectedModel 不在选项中，清空它
      onModelChange('');
    }
  }, [selectedModel, filteredModels, selectedModelInfo, onModelChange]);

  // 动态生成描述（已简化：不再显示冗长的模型信息）
  const dynamicDescription = description || placeholder;

  return (
    <Select
      label={label}
      placeholder={placeholder}
      selectedKeys={selectedModel ? [selectedModel] : []}
      onChange={(e) => onModelChange(e.target.value)}
      size={size as "sm" | "md" | "lg"}
      isDisabled={isDisabled}
      isRequired={isRequired}
      description={dynamicDescription}
      classNames={{
        trigger: `bg-slate-800/60 border border-slate-600/50 text-slate-100 font-semibold hover:border-blue-500/50 shadow-sm ${className}`,
        label: "text-slate-400 font-medium",
        value: "text-slate-100 font-semibold",
        selectorIcon: "text-slate-400"
      }}
      popoverProps={{
        classNames: {
          content: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-lg"
        }
      }}
      renderValue={(items) => {
        const item = items[0];
        if (!item) return null;

        const model = filteredModels.find(m => m.name === item.textValue);
        if (!model) return item.textValue;

        return (
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="font-semibold truncate">{model.name}</span>
            {getPriceText(model) && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-linear-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded shrink-0">
                <Coins className="w-3 h-3 text-amber-400" />
                <span className="text-xs font-medium text-amber-300 whitespace-nowrap">
                  {getPriceText(model)}
                </span>
              </div>
            )}
          </div>
        );
      }}
    >
      {filteredModels.map((model) => (
        <SelectItem
          key={model.name}
          className="text-slate-200 hover:bg-slate-800/80 data-[hover=true]:bg-slate-800/80"
          textValue={model.name}
        >
          <div className="flex items-center justify-between gap-3 py-1">
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-semibold text-slate-100">{model.name}</span>
              {/* 精简描述：只显示第一句或截断到60字符 */}
              {model.description && (
                <span className="text-xs text-slate-400 truncate" title={model.description}>
                  {model.description.split('|')[0].trim().slice(0, 60)}
                  {model.description.length > 60 ? '...' : ''}
                </span>
              )}
            </div>
            {getPriceText(model) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-linear-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-md shrink-0">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-amber-300 whitespace-nowrap">
                  {getPriceText(model)}
                </span>
              </div>
            )}
          </div>
        </SelectItem>
      ))}
    </Select>
  );
};

export default AIModelSelector;
