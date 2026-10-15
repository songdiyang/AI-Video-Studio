/**
 * 导演参数选择器组件 - 可视化选择专业术语参数
 */
import React from 'react';
import { Select, SelectItem, Tooltip } from '@heroui/react';
import { Sun, Camera, Wind, Info } from 'lucide-react';
import {
  DirectorParams,
  LIGHTING_DIRECTION_OPTIONS,
  LIGHTING_QUALITY_OPTIONS,
  LIGHTING_COLOR_OPTIONS,
  LIGHTING_INTENSITY_OPTIONS,
  CAMERA_FOCAL_LENGTH_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_DOF_OPTIONS,
  CAMERA_COMPOSITION_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
  ATMOSPHERE_MOOD_OPTIONS,
  ATMOSPHERE_TEXTURE_OPTIONS,
  ATMOSPHERE_COLOR_GRADE_OPTIONS,
  ATMOSPHERE_VISUAL_STYLE_OPTIONS,
} from './directorParams';

interface ParamSelectProps {
  label: string;
  options: Array<{ value: string; label: string; desc: string }>;
  value: string;
  onChange: (value: string) => void;
}

const ParamSelect: React.FC<ParamSelectProps> = ({ label, options, value, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-foreground-500">{label}</label>
    <Select
      size="sm"
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const selected = Array.from(keys)[0] as string;
        if (selected) onChange(selected);
      }}
      classNames={{
        trigger: 'bg-content2 border-divider min-h-[32px] h-8',
        value: 'text-xs',
        popoverContent: 'bg-content1 border-divider',
      }}
    >
      {options.map((opt) => (
        <SelectItem key={opt.value} textValue={opt.label}>
          <div className="flex flex-col">
            <span className="text-sm">{opt.label}</span>
            <span className="text-xs text-foreground-400">{opt.desc}</span>
          </div>
        </SelectItem>
      ))}
    </Select>
  </div>
);

interface CategorySectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  color: string;
}

const CategorySection: React.FC<CategorySectionProps> = ({ title, icon, children, color }) => (
  <div className="bg-content2/50 rounded-lg p-3 border border-divider">
    <div className={`flex items-center gap-2 mb-3 ${color}`}>
      {icon}
      <span className="font-medium text-sm">{title}</span>
    </div>
    <div className="grid grid-cols-2 gap-3">
      {children}
    </div>
  </div>
);

interface DirectorParamSelectorProps {
  params: DirectorParams;
  onChange: (params: DirectorParams) => void;
}

const DirectorParamSelector: React.FC<DirectorParamSelectorProps> = ({ params, onChange }) => {
  const updateLighting = (key: keyof DirectorParams['lighting'], value: string) => {
    onChange({
      ...params,
      lighting: { ...params.lighting, [key]: value },
    });
  };

  const updateCamera = (key: keyof DirectorParams['camera'], value: string) => {
    onChange({
      ...params,
      camera: { ...params.camera, [key]: value },
    });
  };

  const updateAtmosphere = (key: keyof DirectorParams['atmosphere'], value: string) => {
    onChange({
      ...params,
      atmosphere: { ...params.atmosphere, [key]: value },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 光线参数 */}
      <CategorySection
        title="光线参数"
        icon={<Sun className="w-4 h-4" />}
        color="text-yellow-400"
      >
        <ParamSelect
          label="光线方向"
          options={LIGHTING_DIRECTION_OPTIONS}
          value={params.lighting.direction}
          onChange={(v) => updateLighting('direction', v)}
        />
        <ParamSelect
          label="光线质量"
          options={LIGHTING_QUALITY_OPTIONS}
          value={params.lighting.quality}
          onChange={(v) => updateLighting('quality', v)}
        />
        <ParamSelect
          label="光线色彩"
          options={LIGHTING_COLOR_OPTIONS}
          value={params.lighting.color}
          onChange={(v) => updateLighting('color', v)}
        />
        <ParamSelect
          label="光线强度"
          options={LIGHTING_INTENSITY_OPTIONS}
          value={params.lighting.intensity}
          onChange={(v) => updateLighting('intensity', v)}
        />
      </CategorySection>

      {/* 镜头参数 */}
      <CategorySection
        title="镜头参数"
        icon={<Camera className="w-4 h-4" />}
        color="text-blue-400"
      >
        <ParamSelect
          label="镜头焦距"
          options={CAMERA_FOCAL_LENGTH_OPTIONS}
          value={params.camera.focalLength}
          onChange={(v) => updateCamera('focalLength', v)}
        />
        <ParamSelect
          label="镜头运动"
          options={CAMERA_MOVEMENT_OPTIONS}
          value={params.camera.movement}
          onChange={(v) => updateCamera('movement', v)}
        />
        <ParamSelect
          label="景深"
          options={CAMERA_DOF_OPTIONS}
          value={params.camera.depthOfField}
          onChange={(v) => updateCamera('depthOfField', v)}
        />
        <ParamSelect
          label="构图方式"
          options={CAMERA_COMPOSITION_OPTIONS}
          value={params.camera.composition}
          onChange={(v) => updateCamera('composition', v)}
        />
        <ParamSelect
          label="拍摄角度"
          options={CAMERA_ANGLE_OPTIONS}
          value={params.camera.angle}
          onChange={(v) => updateCamera('angle', v)}
        />
      </CategorySection>

      {/* 空气感参数 */}
      <CategorySection
        title="空气感参数"
        icon={<Wind className="w-4 h-4" />}
        color="text-purple-400"
      >
        <ParamSelect
          label="氛围营造"
          options={ATMOSPHERE_MOOD_OPTIONS}
          value={params.atmosphere.mood}
          onChange={(v) => updateAtmosphere('mood', v)}
        />
        <ParamSelect
          label="质感表现"
          options={ATMOSPHERE_TEXTURE_OPTIONS}
          value={params.atmosphere.texture}
          onChange={(v) => updateAtmosphere('texture', v)}
        />
        <ParamSelect
          label="调色风格"
          options={ATMOSPHERE_COLOR_GRADE_OPTIONS}
          value={params.atmosphere.colorGrade}
          onChange={(v) => updateAtmosphere('colorGrade', v)}
        />
        <ParamSelect
          label="视觉风格"
          options={ATMOSPHERE_VISUAL_STYLE_OPTIONS}
          value={params.atmosphere.visualStyle}
          onChange={(v) => updateAtmosphere('visualStyle', v)}
        />
      </CategorySection>
    </div>
  );
};

export default DirectorParamSelector;
