/**
 * 服装编辑弹窗
 * 
 * 功能：
 * 1. 基础信息编辑（名称、描述、分类、性别）
 * 2. 服装提示词配置
 */
import React from 'react';
import { 
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, 
  Button, Input, Textarea, Select, SelectItem, SelectSection, Divider
} from '@heroui/react';
import { Shirt } from 'lucide-react';
import { COSTUME_CATEGORIES, CostumeCategory } from '../../../services/costumes';

interface CostumeModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
}

const CostumeModal: React.FC<CostumeModalProps> = ({
  isOpen,
  onOpenChange,
  editMode,
  formData,
  setFormData,
  onSave
}) => {
  // 性别选项
  const genderOptions = [
    { value: 'male', label: '男性' },
    { value: 'female', label: '女性' },
    { value: 'unisex', label: '通用' }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-(--bg-app)",
        header: "border-b border-(--border-color)",
        body: "py-4",
        footer: "border-t border-(--border-color)"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-(--text-primary)">
              <Shirt className="w-5 h-5 text-purple-400" />
              {editMode ? '编辑服装' : '新建服装'}
            </ModalHeader>
            
            <ModalBody className="space-y-4">
              {/* 基本信息 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-(--text-secondary)">基本信息</h4>
                
                <Input
                  label="服装名称"
                  labelPlacement="outside"
                  placeholder="输入服装名称"
                  value={formData.name || ''}
                  onValueChange={(value) => setFormData({ ...formData, name: value })}
                  classNames={{
                    input: "bg-transparent text-(--text-primary)",
                    inputWrapper: "bg-(--bg-card) border border-(--border-color)"
                  }}
                />
                
                <Textarea
                  label="服装描述"
                  labelPlacement="outside"
                  placeholder="描述这件服装的特点、风格等"
                  value={formData.description || ''}
                  onValueChange={(value) => setFormData({ ...formData, description: value })}
                  minRows={3}
                  classNames={{
                    input: "bg-transparent text-(--text-primary)",
                    inputWrapper: "bg-(--bg-card) border border-(--border-color)"
                  }}
                />
              </div>
              
              <Divider className="bg-(--border-color)" />
              
              {/* 分类配置 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-(--text-secondary)">分类配置</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="服装分类"
                    labelPlacement="outside"
                    placeholder="选择分类"
                    selectedKeys={formData.category ? [formData.category] : []}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as CostumeCategory;
                      setFormData({ ...formData, category: value });
                    }}
                    classNames={{
                      trigger: "bg-(--bg-card) border border-(--border-color)",
                      value: "text-(--text-primary)"
                    }}
                  >
                    {COSTUME_CATEGORIES.map((category) => (
                      <SelectItem key={category} textValue={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </Select>
                  
                  <Select
                    label="适用性别"
                    labelPlacement="outside"
                    placeholder="选择性别"
                    selectedKeys={formData.gender ? [formData.gender] : new Set(['unisex'])}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      setFormData({ ...formData, gender: value });
                    }}
                    classNames={{
                      trigger: "bg-(--bg-card) border border-(--border-color)",
                      value: "text-(--text-primary)"
                    }}
                  >
                    {genderOptions.map((option) => (
                      <SelectItem key={option.value} textValue={option.label}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </div>
              
              <Divider className="bg-(--border-color)" />
              
              {/* AI生成配置 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-(--text-secondary)">AI生成提示词</h4>
                
                <Textarea
                  label="服装提示词"
                  labelPlacement="outside"
                  placeholder="描述服装的具体样式，用于AI生成三视图，如：white dress shirt, black tie, formal suit jacket..."
                  value={formData.outfit_prompt || ''}
                  onValueChange={(value) => setFormData({ ...formData, outfit_prompt: value })}
                  minRows={4}
                  classNames={{
                    input: "bg-transparent text-(--text-primary) font-mono text-sm",
                    inputWrapper: "bg-(--bg-card) border border-(--border-color)"
                  }}
                />
                <p className="text-xs text-(--text-muted)">
                  此提示词将用于生成服装的三视图。建议使用英文描述，包含服装的颜色、材质、款式等关键词。
                </p>
              </div>
            </ModalBody>
            
            <ModalFooter>
              <Button 
                variant="light" 
                onPress={onClose}
                className="text-(--text-muted)"
              >
                取消
              </Button>
              <Button 
                color="primary"
                onPress={() => {
                  onSave();
                  onClose();
                }}
                isDisabled={!formData.name?.trim()}
              >
                {editMode ? '保存修改' : '创建服装'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default CostumeModal;
