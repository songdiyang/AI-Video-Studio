import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea } from '@heroui/react';

type TabType = 'characters' | 'scenes' | 'props';

interface AssetModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  activeTab: TabType;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
}

const AssetModal: React.FC<AssetModalProps> = ({
  isOpen,
  onOpenChange,
  editMode,
  activeTab,
  formData,
  setFormData,
  onSave
}) => {
  const getTabLabel = () => {
    switch (activeTab) {
      case 'characters': return '角色';
      case 'scenes': return '场景';
      case 'props': return '道具';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
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
              {editMode ? '编辑' : '新建'}{getTabLabel()}
            </ModalHeader>
            <ModalBody className="space-y-4">
              <Input
                label="名称"
                placeholder={`输入${getTabLabel()}名称`}
                value={formData.name}
                onValueChange={(val) => setFormData({ ...formData, name: val })}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  label: "text-[var(--text-secondary)] font-medium",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm"
                }}
              />
              
              <Textarea
                label="描述"
                placeholder="输入详细描述"
                value={formData.description}
                onValueChange={(val) => setFormData({ ...formData, description: val })}
                minRows={3}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  label: "text-[var(--text-secondary)] font-medium",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm"
                }}
              />

              {activeTab === 'characters' && (
                <>
                  <Input
                    label="外貌"
                    placeholder="外貌特征"
                    value={formData.appearance}
                    onValueChange={(val) => setFormData({ ...formData, appearance: val })}
                    classNames={{
                      input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                      label: "text-slate-400 font-medium",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                    }}
                  />
                  <Input
                    label="性格"
                    placeholder="性格特点"
                    value={formData.personality}
                    onValueChange={(val) => setFormData({ ...formData, personality: val })}
                    classNames={{
                      input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                      label: "text-slate-400 font-medium",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                    }}
                  />
                </>
              )}

              {activeTab === 'scenes' && (
                <>
                  <Input
                    label="环境"
                    placeholder="环境描述"
                    value={formData.environment}
                    onValueChange={(val) => setFormData({ ...formData, environment: val })}
                    classNames={{
                      input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                      label: "text-slate-400 font-medium",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                    }}
                  />
                  <Input
                    label="光线"
                    placeholder="光线效果"
                    value={formData.lighting}
                    onValueChange={(val) => setFormData({ ...formData, lighting: val })}
                    classNames={{
                      input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                      label: "text-slate-400 font-medium",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                    }}
                  />
                  <Input
                    label="氛围"
                    placeholder="氛围感觉"
                    value={formData.mood}
                    onValueChange={(val) => setFormData({ ...formData, mood: val })}
                    classNames={{
                      input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                      label: "text-slate-400 font-medium",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                    }}
                  />
                </>
              )}

              {activeTab === 'props' && (
                <>
                  <Input
                    label="道具分类"
                    placeholder="如：武器、工具、装饰品等"
                    value={formData.category}
                    onValueChange={(val) => setFormData({ ...formData, category: val })}
                    classNames={{
                      input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                      label: "text-slate-400 font-medium",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                    }}
                  />
                  <div className="space-y-2">
                    <label className="text-[var(--text-secondary)] font-medium text-sm">图片</label>
                    {formData.image_url ? (
                      <div className="relative group">
                        <img
                          src={formData.image_url}
                          alt="道具预览"
                          className="w-full h-48 object-contain rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)]"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, image_url: '' })}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-32 rounded-lg border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-input)] flex flex-col items-center justify-center text-[var(--text-muted)]">
                        <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs">暂无图片，点击生成按钮创建设定图</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab !== 'props' && (
                <Input
                  label="图片URL"
                  placeholder="图片地址（选填）"
                  value={formData.image_url}
                  onValueChange={(val) => setFormData({ ...formData, image_url: val })}
                  classNames={{
                    input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                    label: "text-[var(--text-secondary)] font-medium",
                    inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm"
                  }}
                />
              )}

              <Input
                label="标签"
                placeholder="多个标签用逗号分隔"
                value={formData.tags}
                onValueChange={(val) => setFormData({ ...formData, tags: val })}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  label: "text-[var(--text-secondary)] font-medium",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm"
                }}
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

export default AssetModal;
