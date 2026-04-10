/**
 * 道具样式配置组件
 * 
 * 提供参数化控制界面，让用户配置道具的材质、颜色、尺寸等属性
 */
import React from 'react';
import { Select, SelectItem, Input, Divider } from '@heroui/react';
import { Palette, Box, Sparkles, Clock } from 'lucide-react';

// 道具样式配置接口
export interface PropStyleConfig {
  material?: string;        // 材质
  primaryColor?: string;    // 主色调
  secondaryColor?: string;  // 辅助色
  texture?: string;         // 纹理
  size?: string;            // 尺寸
  condition?: string;       // 状态/新旧
  style?: string;           // 风格
  era?: string;             // 年代
  details?: string;         // 额外细节描述
}

interface PropStyleConfigPanelProps {
  value: PropStyleConfig;
  onChange: (config: PropStyleConfig) => void;
  disabled?: boolean;
}

// 预设选项
const MATERIAL_OPTIONS = [
  { value: 'metal', label: '金属', desc: '光泽金属质感' },
  { value: 'wood', label: '木质', desc: '天然木材纹理' },
  { value: 'plastic', label: '塑料', desc: '现代塑料材质' },
  { value: 'glass', label: '玻璃', desc: '透明或半透明' },
  { value: 'fabric', label: '布料', desc: '柔软织物' },
  { value: 'leather', label: '皮革', desc: '真皮或仿皮' },
  { value: 'ceramic', label: '陶瓷', desc: '光滑瓷器' },
  { value: 'stone', label: '石材', desc: '大理石/花岗岩' },
  { value: 'paper', label: '纸质', desc: '纸张/纸板' },
  { value: 'mixed', label: '混合材质', desc: '多种材料组合' },
];

const TEXTURE_OPTIONS = [
  { value: 'smooth', label: '光滑', desc: '表面光滑无纹理' },
  { value: 'matte', label: '磨砂', desc: '哑光质感' },
  { value: 'glossy', label: '镜面', desc: '高光反射' },
  { value: 'rough', label: '粗糙', desc: '不规则表面' },
  { value: 'textured', label: '纹理', desc: '明显的表面纹理' },
  { value: 'weathered', label: '风化', desc: '自然老化痕迹' },
];

const SIZE_OPTIONS = [
  { value: 'tiny', label: '微小', desc: '可放在手掌中' },
  { value: 'small', label: '小型', desc: '手持大小' },
  { value: 'medium', label: '中型', desc: '桌面摆放' },
  { value: 'large', label: '大型', desc: '需要空间摆放' },
];

const CONDITION_OPTIONS = [
  { value: 'pristine', label: '全新', desc: '崭新完美' },
  { value: 'good', label: '良好', desc: '正常使用痕迹' },
  { value: 'worn', label: '磨损', desc: '明显使用痕迹' },
  { value: 'aged', label: '老旧', desc: '岁月感十足' },
  { value: 'damaged', label: '损坏', desc: '有破损痕迹' },
  { value: 'antique', label: '古董', desc: '珍贵复古感' },
];

const STYLE_OPTIONS = [
  { value: 'modern', label: '现代', desc: '简洁当代设计' },
  { value: 'vintage', label: '复古', desc: '怀旧风格' },
  { value: 'minimalist', label: '极简', desc: '简约设计' },
  { value: 'ornate', label: '华丽', desc: '精致装饰' },
  { value: 'industrial', label: '工业', desc: '工业美学' },
  { value: 'rustic', label: '质朴', desc: '乡村风格' },
  { value: 'futuristic', label: '未来', desc: '科幻风格' },
  { value: 'traditional', label: '传统', desc: '经典风格' },
];

const ERA_OPTIONS = [
  { value: 'contemporary', label: '当代', desc: '现代时期' },
  { value: '1990s', label: '90年代', desc: '90年代风格' },
  { value: '1980s', label: '80年代', desc: '80年代风格' },
  { value: '1970s', label: '70年代', desc: '70年代风格' },
  { value: 'mid-century', label: '世纪中期', desc: '50-60年代' },
  { value: 'victorian', label: '维多利亚', desc: '19世纪风格' },
  { value: 'ancient', label: '古代', desc: '历史久远' },
];

const COLOR_PRESETS = [
  { value: 'red', label: '红色' },
  { value: 'orange', label: '橙色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
  { value: 'pink', label: '粉色' },
  { value: 'brown', label: '棕色' },
  { value: 'black', label: '黑色' },
  { value: 'white', label: '白色' },
  { value: 'gray', label: '灰色' },
  { value: 'gold', label: '金色' },
  { value: 'silver', label: '银色' },
  { value: 'bronze', label: '青铜色' },
];

const PropStyleConfigPanel: React.FC<PropStyleConfigPanelProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const updateConfig = (key: keyof PropStyleConfig, val: string) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div className="space-y-4">
      {/* 材质和纹理 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Box className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-foreground">材质与纹理</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="材质"
            size="sm"
            selectedKeys={value.material ? [value.material] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('material', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {MATERIAL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  <span className="text-xs text-foreground-400">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </Select>

          <Select
            label="纹理"
            size="sm"
            selectedKeys={value.texture ? [value.texture] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('texture', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {TEXTURE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  <span className="text-xs text-foreground-400">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>

      <Divider className="bg-divider" />

      {/* 颜色 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">颜色配置</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="主色调"
            size="sm"
            selectedKeys={value.primaryColor ? [value.primaryColor] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('primaryColor', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {COLOR_PRESETS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            label="辅助色"
            size="sm"
            selectedKeys={value.secondaryColor ? [value.secondaryColor] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('secondaryColor', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {COLOR_PRESETS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>

      <Divider className="bg-divider" />

      {/* 尺寸和状态 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-foreground">尺寸与状态</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="相对尺寸"
            size="sm"
            selectedKeys={value.size ? [value.size] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('size', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {SIZE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  <span className="text-xs text-foreground-400">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </Select>

          <Select
            label="新旧状态"
            size="sm"
            selectedKeys={value.condition ? [value.condition] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('condition', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {CONDITION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  <span className="text-xs text-foreground-400">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>

      <Divider className="bg-divider" />

      {/* 风格和年代 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-foreground">风格与年代</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="设计风格"
            size="sm"
            selectedKeys={value.style ? [value.style] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('style', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {STYLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  <span className="text-xs text-foreground-400">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </Select>

          <Select
            label="年代风格"
            size="sm"
            selectedKeys={value.era ? [value.era] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              if (selected) updateConfig('era', selected);
            }}
            isDisabled={disabled}
            classNames={{
              trigger: 'bg-content2 border-divider',
              popoverContent: 'bg-content1',
            }}
          >
            {ERA_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} textValue={opt.label}>
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  <span className="text-xs text-foreground-400">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>

      <Divider className="bg-divider" />

      {/* 额外细节 */}
      <div>
        <Input
          label="额外细节描述"
          placeholder="描述道具的特殊细节或独特特征..."
          value={value.details || ''}
          onValueChange={(val) => updateConfig('details', val)}
          isDisabled={disabled}
          classNames={{
            input: 'bg-transparent',
            inputWrapper: 'bg-content2 border-divider',
          }}
        />
      </div>
    </div>
  );
};

export default PropStyleConfigPanel;
export { MATERIAL_OPTIONS, TEXTURE_OPTIONS, SIZE_OPTIONS, CONDITION_OPTIONS, STYLE_OPTIONS, ERA_OPTIONS, COLOR_PRESETS };
