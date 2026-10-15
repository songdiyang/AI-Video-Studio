/**
 * 导出设置面板
 * 支持自定义分辨率、帧率、格式、质量
 */

import React from 'react';
import { Button, Select, SelectItem } from '@heroui/react';
import { Settings2, X } from 'lucide-react';
import type { ExportOptions } from '../types';

interface ExportSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  options: ExportOptions;
  onChange: (options: ExportOptions) => void;
}

const RESOLUTION_OPTIONS = [
  { value: '480p', label: '480p (SD)', width: 854, height: 480 },
  { value: '720p', label: '720p (HD)', width: 1280, height: 720 },
  { value: '1080p', label: '1080p (FHD)', width: 1920, height: 1080 },
  { value: '1440p', label: '1440p (2K)', width: 2560, height: 1440 },
  { value: '4k', label: '4K (UHD)', width: 3840, height: 2160 },
];

const FPS_OPTIONS = [
  { value: 24, label: '24 fps (电影)' },
  { value: 30, label: '30 fps (标准)' },
  { value: 60, label: '60 fps (流畅)' },
];

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4 (H.264)', description: '兼容性好，推荐' },
  { value: 'webm', label: 'WebM (VP9)', description: 'Web优化，体积小' },
];

const QUALITY_OPTIONS = [
  { value: 'low', label: '低质量', description: '文件小，适合预览' },
  { value: 'medium', label: '中等质量', description: '平衡质量与大小' },
  { value: 'high', label: '高质量', description: '最佳画质，文件大' },
];

const ExportSettingsPanel: React.FC<ExportSettingsPanelProps> = ({
  isOpen,
  onClose,
  options,
  onChange,
}) => {
  if (!isOpen) return null;

  const handleChange = (key: keyof ExportOptions, value: string | number) => {
    onChange({ ...options, [key]: value });
  };

  // 获取当前分辨率的尺寸信息
  const currentResolution = RESOLUTION_OPTIONS.find(r => r.value === options.resolution);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-semibold text-slate-100">导出设置</h3>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-slate-400 hover:text-slate-200"
            onPress={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* 设置内容 */}
        <div className="p-5 space-y-5">
          {/* 分辨率 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">分辨率</label>
            <Select
              selectedKeys={[options.resolution]}
              onChange={(e) => handleChange('resolution', e.target.value)}
              classNames={{
                trigger: 'bg-slate-800 border-slate-700 text-slate-100',
                listbox: 'bg-slate-800',
              }}
            >
              {RESOLUTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} className="text-slate-100">
                  {opt.label}
                </SelectItem>
              ))}
            </Select>
            {currentResolution && (
              <p className="text-xs text-slate-500">
                输出尺寸: {currentResolution.width} × {currentResolution.height}
              </p>
            )}
          </div>

          {/* 帧率 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">帧率</label>
            <Select
              selectedKeys={[String(options.fps)]}
              onChange={(e) => handleChange('fps', Number(e.target.value))}
              classNames={{
                trigger: 'bg-slate-800 border-slate-700 text-slate-100',
                listbox: 'bg-slate-800',
              }}
            >
              {FPS_OPTIONS.map((opt) => (
                <SelectItem key={String(opt.value)} className="text-slate-100">
                  {opt.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          {/* 格式 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">格式</label>
            <Select
              selectedKeys={[options.format]}
              onChange={(e) => handleChange('format', e.target.value)}
              classNames={{
                trigger: 'bg-slate-800 border-slate-700 text-slate-100',
                listbox: 'bg-slate-800',
              }}
            >
              {FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} className="text-slate-100">
                  {opt.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          {/* 质量 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">编码质量</label>
            <Select
              selectedKeys={[options.quality]}
              onChange={(e) => handleChange('quality', e.target.value)}
              classNames={{
                trigger: 'bg-slate-800 border-slate-700 text-slate-100',
                listbox: 'bg-slate-800',
              }}
            >
              {QUALITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} className="text-slate-100">
                  {opt.label}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800 bg-slate-900/50">
          <Button
            size="sm"
            variant="flat"
            className="bg-slate-800 text-slate-300"
            onPress={() => {
              // 重置为默认值
              onChange({
                format: 'mp4',
                resolution: '1080p',
                fps: 30,
                quality: 'high',
              });
            }}
          >
            重置默认
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 text-white"
            onPress={onClose}
          >
            确定
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExportSettingsPanel;
