import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Select, SelectItem } from '@heroui/react';
import { FolderOpen } from 'lucide-react';
import { Project } from '../../../services/projects';

interface SceneModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
  userProjects?: Project[];
}

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
                isRequired
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
                placeholder="环境描述（建筑结构、空间布局、物品摆设等）"
                value={formData.environment}
                onValueChange={(val) => setFormData({ ...formData, environment: val })}
                classNames={inputClassNames}
              />

              <Input
                label="光线"
                placeholder="光线效果（光线来源、明暗对比、色调等）"
                value={formData.lighting}
                onValueChange={(val) => setFormData({ ...formData, lighting: val })}
                classNames={inputClassNames}
              />

              <Input
                label="氛围"
                placeholder="氛围感觉（紧张、温馨、诡异等）"
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
