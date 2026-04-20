import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Select, SelectItem, Accordion, AccordionItem } from '@heroui/react';
import { ChevronDown, MapPin, Camera, FolderOpen } from 'lucide-react';
import { Project } from '../../../services/projects';

interface SpatialLayout {
  foreground?: string;
  midground?: string;
  background?: string;
  depthNotes?: string;
}

interface CameraDefaults {
  angle?: string;
  distance?: string;
  height?: string;
  movement?: string;
}

interface SceneModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
  userProjects?: Project[];
}

// 摄像机参数选项
const ANGLE_OPTIONS = [
  { value: '平视', label: '平视' },
  { value: '俯视', label: '俯视' },
  { value: '仰视', label: '仰视' }
];

const DISTANCE_OPTIONS = [
  { value: '远景', label: '远景' },
  { value: '中景', label: '中景' },
  { value: '近景', label: '近景' },
  { value: '特写', label: '特写' }
];

const HEIGHT_OPTIONS = [
  { value: '低角度', label: '低角度' },
  { value: '水平', label: '水平' },
  { value: '高角度', label: '高角度' }
];

const MOVEMENT_OPTIONS = [
  { value: '固定', label: '固定' },
  { value: '推拉', label: '推拉' },
  { value: '环绕', label: '环绕' },
  { value: '跟随', label: '跟随' },
  { value: '摇摆', label: '摇摆' }
];

const inputClassNames = {
  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
  label: "text-[var(--text-secondary)] font-medium",
  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm"
};

const selectClassNames = {
  trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm data-[hover=true]:bg-[var(--bg-card)]",
  value: "text-[var(--text-primary)]",
  label: "text-[var(--text-secondary)] font-medium",
  popoverContent: "bg-[var(--bg-elevated)] border border-[var(--border-color)]"
};

const SceneModal: React.FC<SceneModalProps> = ({
  isOpen,
  onOpenChange,
  editMode,
  formData,
  setFormData,
  onSave,
  userProjects = []
}) => {
  // 解析空间布局数据
  const spatialLayout: SpatialLayout = formData.spatial_layout || {};
  const cameraDefaults: CameraDefaults = formData.camera_defaults || {};

  const updateSpatialLayout = (field: keyof SpatialLayout, value: string) => {
    setFormData({
      ...formData,
      spatial_layout: {
        ...spatialLayout,
        [field]: value || undefined
      }
    });
  };

  const updateCameraDefaults = (field: keyof CameraDefaults, value: string) => {
    setFormData({
      ...formData,
      camera_defaults: {
        ...cameraDefaults,
        [field]: value || undefined
      }
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-[var(--bg-elevated)] backdrop-blur-xl border border-[var(--border-color)] shadow-2xl shadow-black/40",
        header: "border-b border-[var(--border-color)]",
        body: "py-6"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="text-[var(--text-primary)] font-bold">
              {editMode ? '编辑' : '新建'}场景
            </ModalHeader>
            <ModalBody className="space-y-4">
              {/* 所属项目选择器 */}
              <Select
                label="所属项目"
                placeholder="选择所属项目（可选）"
                selectedKeys={formData.project_id ? [String(formData.project_id)] : []}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as string;
                  setFormData({ ...formData, project_id: val ? Number(val) : undefined });
                }}
                isDisabled={editMode}
                startContent={<FolderOpen className="w-4 h-4 text-blue-400" />}
                classNames={{
                  ...selectClassNames,
                  label: "text-[var(--text-secondary)] font-medium"
                }}
                description={editMode ? '编辑模式下不可更改所属项目' : '选择后场景可在该项目的分镜中调用'}
              >
                {userProjects.map((p) => (
                  <SelectItem key={String(p.id)} textValue={p.name}>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                      <span>{p.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </Select>

              {/* 基本信息 */}
              <Input
                label="名称"
                placeholder="输入场景名称"
                value={formData.name}
                onValueChange={(val) => setFormData({ ...formData, name: val })}
                classNames={inputClassNames}
              />
              
              <Textarea
                label="描述"
                placeholder="输入详细描述"
                value={formData.description}
                onValueChange={(val) => setFormData({ ...formData, description: val })}
                minRows={3}
                classNames={inputClassNames}
              />

              <Input
                label="环境"
                placeholder="环境描述"
                value={formData.environment}
                onValueChange={(val) => setFormData({ ...formData, environment: val })}
                classNames={inputClassNames}
              />

              <Input
                label="光线"
                placeholder="光线效果"
                value={formData.lighting}
                onValueChange={(val) => setFormData({ ...formData, lighting: val })}
                classNames={inputClassNames}
              />

              <Input
                label="氛围"
                placeholder="氛围感觉"
                value={formData.mood}
                onValueChange={(val) => setFormData({ ...formData, mood: val })}
                classNames={inputClassNames}
              />

              <Input
                label="图片URL"
                placeholder="图片地址（选填）"
                value={formData.image_url}
                onValueChange={(val) => setFormData({ ...formData, image_url: val })}
                classNames={inputClassNames}
              />

              <Input
                label="标签"
                placeholder="多个标签用逗号分隔"
                value={formData.tags}
                onValueChange={(val) => setFormData({ ...formData, tags: val })}
                classNames={inputClassNames}
              />

              {/* 空间布局折叠区域 */}
              <Accordion 
                variant="splitted" 
                className="px-0"
                itemClasses={{
                  base: "bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg",
                  title: "text-[var(--text-secondary)] font-medium",
                  trigger: "px-4 py-3 data-[hover=true]:bg-[var(--bg-input)]",
                  content: "px-4 pb-4"
                }}
              >
                <AccordionItem
                  key="spatial"
                  aria-label="空间布局"
                  title={
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-400" />
                      <span>空间布局</span>
                      <span className="text-xs text-[var(--text-muted)]">（可选）</span>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--text-muted)] mb-3">
                      定义场景的前景、中景、背景空间层次，帮助AI理解场景的空间纵深关系
                    </p>
                    <Input
                      label="前景"
                      placeholder="描述前景元素，如：桌子和椅子"
                      value={spatialLayout.foreground || ''}
                      onValueChange={(val) => updateSpatialLayout('foreground', val)}
                      classNames={inputClassNames}
                    />
                    <Input
                      label="中景"
                      placeholder="描述中景元素，如：角色站立的位置"
                      value={spatialLayout.midground || ''}
                      onValueChange={(val) => updateSpatialLayout('midground', val)}
                      classNames={inputClassNames}
                    />
                    <Input
                      label="背景"
                      placeholder="描述背景元素，如：窗户透出的暮色"
                      value={spatialLayout.background || ''}
                      onValueChange={(val) => updateSpatialLayout('background', val)}
                      classNames={inputClassNames}
                    />
                    <Textarea
                      label="深度备注"
                      placeholder="空间纵深的额外说明，如：三层纵深结构"
                      value={spatialLayout.depthNotes || ''}
                      onValueChange={(val) => updateSpatialLayout('depthNotes', val)}
                      minRows={2}
                      classNames={inputClassNames}
                    />
                  </div>
                </AccordionItem>

                <AccordionItem
                  key="camera"
                  aria-label="摄像机默认参数"
                  title={
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-blue-400" />
                      <span>摄像机默认参数</span>
                      <span className="text-xs text-[var(--text-muted)]">（可选）</span>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--text-muted)] mb-3">
                      设置该场景的默认摄像机参数，在生成图片时会参考这些设置
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        label="拍摄角度"
                        placeholder="选择拍摄角度"
                        selectedKeys={cameraDefaults.angle ? [cameraDefaults.angle] : []}
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;
                          updateCameraDefaults('angle', value);
                        }}
                        classNames={selectClassNames}
                      >
                        {ANGLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} className="text-[var(--text-primary)]">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </Select>

                      <Select
                        label="景别距离"
                        placeholder="选择景别距离"
                        selectedKeys={cameraDefaults.distance ? [cameraDefaults.distance] : []}
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;
                          updateCameraDefaults('distance', value);
                        }}
                        classNames={selectClassNames}
                      >
                        {DISTANCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} className="text-[var(--text-primary)]">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </Select>

                      <Select
                        label="镜头高度"
                        placeholder="选择镜头高度"
                        selectedKeys={cameraDefaults.height ? [cameraDefaults.height] : []}
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;
                          updateCameraDefaults('height', value);
                        }}
                        classNames={selectClassNames}
                      >
                        {HEIGHT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} className="text-[var(--text-primary)]">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </Select>

                      <Select
                        label="镜头运动"
                        placeholder="选择镜头运动"
                        selectedKeys={cameraDefaults.movement ? [cameraDefaults.movement] : []}
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;
                          updateCameraDefaults('movement', value);
                        }}
                        classNames={selectClassNames}
                      >
                        {MOVEMENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} className="text-[var(--text-primary)]">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  </div>
                </AccordionItem>
              </Accordion>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} className="font-semibold text-[var(--text-secondary)]">
                取消
              </Button>
              <Button 
                className="pro-btn-primary"
                onPress={onSave}
              >
                保存
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default SceneModal;
