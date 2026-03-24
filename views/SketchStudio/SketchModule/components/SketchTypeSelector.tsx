import React from 'react';
import { Pencil, Film, PenTool } from 'lucide-react';
import { SketchType } from '../hooks/useSketchEditor';

interface SketchTypeOption {
  type: SketchType;
  icon: React.ReactNode;
  name: string;
  description: string;
}

const sketchTypes: SketchTypeOption[] = [
  {
    type: 'stick_figure',
    icon: <Pencil className="w-5 h-5" />,
    name: '火柴人草稿',
    description: '几笔勾出人物动作和镜头机位'
  },
  {
    type: 'storyboard_sketch',
    icon: <Film className="w-5 h-5" />,
    name: '分镜草图',
    description: '定好人物站位、景别和构图'
  },
  {
    type: 'detailed_lineart',
    icon: <PenTool className="w-5 h-5" />,
    name: '精细线稿',
    description: '五官、服装、场景元素精确定义'
  }
];

interface SketchTypeSelectorProps {
  value: SketchType;
  onChange: (type: SketchType) => void;
  /** 紧凑模式：用于工具栏内显示 */
  compact?: boolean;
}

const SketchTypeSelector: React.FC<SketchTypeSelectorProps> = ({
  value,
  onChange,
  compact = false
}) => {
  if (compact) {
    // 紧凑模式：下拉选择风格
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">草图类型:</span>
        <div className="flex gap-1">
          {sketchTypes.map((option) => (
            <button
              key={option.type}
              onClick={() => onChange(option.type)}
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all
                ${value === option.type
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-app)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                }
              `}
              title={option.description}
            >
              {option.icon}
              <span className="hidden sm:inline">{option.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 完整模式：卡片式选择
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--text-secondary)]">
        选择草图类型
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {sketchTypes.map((option) => (
          <button
            key={option.type}
            onClick={() => onChange(option.type)}
            className={`
              relative p-4 rounded-lg border transition-all text-left
              ${value === option.type
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/30'
                : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
              }
            `}
          >
            {/* 选中指示器 */}
            {value === option.type && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--accent)]" />
            )}

            <div className={`
              w-10 h-10 rounded-lg flex items-center justify-center mb-3
              ${value === option.type
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
              }
            `}>
              {option.icon}
            </div>

            <h4 className={`
              text-sm font-medium mb-1
              ${value === option.type ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}
            `}>
              {option.name}
            </h4>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {option.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SketchTypeSelector;
