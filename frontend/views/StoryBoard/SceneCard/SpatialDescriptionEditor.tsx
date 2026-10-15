import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Select, SelectItem } from '@heroui/react';
import { MapPin, Plus, Trash2, Users } from 'lucide-react';
import { SpatialDescription, CharacterPosition } from '../useSceneManager';

interface SpatialDescriptionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  spatialDescription?: SpatialDescription;
  characters: string[];  // 当前分镜涉及的角色列表
  onSave: (spatialDescription: SpatialDescription | null) => void;
}

const DEPTH_OPTIONS = [
  { value: 'foreground', label: '前景' },
  { value: 'midground', label: '中景' },
  { value: 'background', label: '背景' }
];

const POSITION_OPTIONS = [
  { value: '画面左侧', label: '画面左侧' },
  { value: '画面中央', label: '画面中央' },
  { value: '画面右侧', label: '画面右侧' },
  { value: '前景左侧', label: '前景左侧' },
  { value: '前景中央', label: '前景中央' },
  { value: '前景右侧', label: '前景右侧' },
  { value: '中景左侧', label: '中景左侧' },
  { value: '中景中央', label: '中景中央' },
  { value: '中景右侧', label: '中景右侧' },
  { value: '背景', label: '背景' }
];

const FACING_OPTIONS = [
  { value: '面向镜头', label: '面向镜头' },
  { value: '背对镜头', label: '背对镜头' },
  { value: '面向左方', label: '面向左方' },
  { value: '面向右方', label: '面向右方' },
  { value: '侧面朝左', label: '侧面朝左' },
  { value: '侧面朝右', label: '侧面朝右' }
];

const inputClassNames = {
  input: "bg-transparent text-slate-100 placeholder:text-slate-500",
  label: "text-slate-400 font-medium text-xs",
  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
};

const selectClassNames = {
  trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm data-[hover=true]:bg-slate-800/80 min-h-unit-8 h-8",
  value: "text-slate-100 text-xs",
  label: "text-slate-400 font-medium text-xs",
  popoverContent: "bg-slate-900 border border-slate-700"
};

const SpatialDescriptionEditor: React.FC<SpatialDescriptionEditorProps> = ({
  isOpen,
  onClose,
  spatialDescription,
  characters,
  onSave
}) => {
  const [formData, setFormData] = useState<SpatialDescription>(() => ({
    characterPositions: spatialDescription?.characterPositions || [],
    cameraAngle: spatialDescription?.cameraAngle || '',
    spatialRelationship: spatialDescription?.spatialRelationship || '',
    environmentDepth: spatialDescription?.environmentDepth || ''
  }));

  // 当 modal 打开时重置表单数据
  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        characterPositions: spatialDescription?.characterPositions || [],
        cameraAngle: spatialDescription?.cameraAngle || '',
        spatialRelationship: spatialDescription?.spatialRelationship || '',
        environmentDepth: spatialDescription?.environmentDepth || ''
      });
    }
  }, [isOpen, spatialDescription]);

  const addCharacterPosition = () => {
    const newPosition: CharacterPosition = {
      name: characters[0] || '',
      position: '画面中央',
      depth: 'midground',
      facing: '面向镜头'
    };
    setFormData({
      ...formData,
      characterPositions: [...(formData.characterPositions || []), newPosition]
    });
  };

  const removeCharacterPosition = (index: number) => {
    const newPositions = [...(formData.characterPositions || [])];
    newPositions.splice(index, 1);
    setFormData({ ...formData, characterPositions: newPositions });
  };

  const updateCharacterPosition = (index: number, field: keyof CharacterPosition, value: string) => {
    const newPositions = [...(formData.characterPositions || [])];
    newPositions[index] = { ...newPositions[index], [field]: value };
    setFormData({ ...formData, characterPositions: newPositions });
  };

  const handleSave = () => {
    // 过滤掉空数据
    const cleanData: SpatialDescription = {};
    if (formData.characterPositions && formData.characterPositions.length > 0) {
      cleanData.characterPositions = formData.characterPositions.filter(cp => cp.name);
    }
    if (formData.cameraAngle?.trim()) cleanData.cameraAngle = formData.cameraAngle.trim();
    if (formData.spatialRelationship?.trim()) cleanData.spatialRelationship = formData.spatialRelationship.trim();
    if (formData.environmentDepth?.trim()) cleanData.environmentDepth = formData.environmentDepth.trim();

    // 如果所有字段都为空，则传 null
    const hasData = Object.keys(cleanData).length > 0;
    onSave(hasData ? cleanData : null);
    onClose();
  };

  const handleClear = () => {
    onSave(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl shadow-black/40",
        header: "border-b border-slate-700/50",
        body: "py-4"
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2 text-slate-100 font-bold">
              <MapPin className="w-5 h-5 text-emerald-400" />
              编辑空间描述
            </ModalHeader>
            <ModalBody className="space-y-4">
              <p className="text-xs text-slate-500">
                定义该镜头的空间布局，帮助AI理解角色位置和摄像机角度，生成更合理的画面构图
              </p>

              {/* 角色位置列表 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-slate-300">角色位置</span>
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    className="bg-blue-500/10 text-blue-400 text-xs"
                    onPress={addCharacterPosition}
                    startContent={<Plus className="w-3 h-3" />}
                  >
                    添加角色
                  </Button>
                </div>

                {(formData.characterPositions || []).map((cp, index) => (
                  <div key={index} className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <Select
                          label="角色"
                          placeholder="选择角色"
                          size="sm"
                          selectedKeys={cp.name ? [cp.name] : []}
                          onSelectionChange={(keys) => {
                            const value = Array.from(keys)[0] as string;
                            updateCharacterPosition(index, 'name', value);
                          }}
                          classNames={selectClassNames}
                        >
                          {characters.map((char) => (
                            <SelectItem key={char} className="text-slate-200 text-xs">
                              {char}
                            </SelectItem>
                          ))}
                        </Select>

                        <Select
                          label="位置"
                          placeholder="选择位置"
                          size="sm"
                          selectedKeys={cp.position ? [cp.position] : []}
                          onSelectionChange={(keys) => {
                            const value = Array.from(keys)[0] as string;
                            updateCharacterPosition(index, 'position', value);
                          }}
                          classNames={selectClassNames}
                        >
                          {POSITION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} className="text-slate-200 text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </Select>

                        <Select
                          label="深度层"
                          placeholder="选择深度"
                          size="sm"
                          selectedKeys={cp.depth ? [cp.depth] : []}
                          onSelectionChange={(keys) => {
                            const value = Array.from(keys)[0] as string;
                            updateCharacterPosition(index, 'depth', value);
                          }}
                          classNames={selectClassNames}
                        >
                          {DEPTH_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} className="text-slate-200 text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </Select>

                        <Select
                          label="朝向"
                          placeholder="选择朝向"
                          size="sm"
                          selectedKeys={cp.facing ? [cp.facing] : []}
                          onSelectionChange={(keys) => {
                            const value = Array.from(keys)[0] as string;
                            updateCharacterPosition(index, 'facing', value);
                          }}
                          classNames={selectClassNames}
                        >
                          {FACING_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} className="text-slate-200 text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        className="text-red-400 hover:bg-red-500/10 mt-5"
                        onPress={() => removeCharacterPosition(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {(!formData.characterPositions || formData.characterPositions.length === 0) && (
                  <p className="text-xs text-slate-500 text-center py-2">
                    暂无角色位置，点击"添加角色"开始设置
                  </p>
                )}
              </div>

              {/* 摄像机角度 */}
              <Input
                label="摄像机角度"
                placeholder="如：中景平拍、近景俯拍、远景仰拍"
                size="sm"
                value={formData.cameraAngle || ''}
                onValueChange={(val) => setFormData({ ...formData, cameraAngle: val })}
                classNames={inputClassNames}
              />

              {/* 空间关系描述 */}
              <Textarea
                label="空间关系描述"
                placeholder="描述角色之间的相对位置，如：角色A在角色B的左后方"
                size="sm"
                minRows={2}
                value={formData.spatialRelationship || ''}
                onValueChange={(val) => setFormData({ ...formData, spatialRelationship: val })}
                classNames={inputClassNames}
              />

              {/* 环境纵深 */}
              <Textarea
                label="环境纵深"
                placeholder="描述场景的纵深结构，如：三层纵深——前景桌椅、中景过道、远景窗户"
                size="sm"
                minRows={2}
                value={formData.environmentDepth || ''}
                onValueChange={(val) => setFormData({ ...formData, environmentDepth: val })}
                classNames={inputClassNames}
              />
            </ModalBody>
            <ModalFooter className="flex justify-between">
              <Button
                variant="light"
                size="sm"
                className="text-red-400"
                onPress={handleClear}
              >
                清空
              </Button>
              <div className="flex gap-2">
                <Button variant="light" size="sm" onPress={onClose} className="text-slate-400">
                  取消
                </Button>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold"
                  onPress={handleSave}
                >
                  保存
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default SpatialDescriptionEditor;
