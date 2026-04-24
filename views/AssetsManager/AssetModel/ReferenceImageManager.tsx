import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Select, SelectItem, Tooltip, Switch, Progress } from '@heroui/react';
import { Plus, Image as ImageIcon, Trash2, GripVertical, Eye, User, ArrowLeft, ArrowRight, HelpCircle, Power, Upload, X } from 'lucide-react';
import {
  AssetReferenceImage,
  AssetReferenceType,
  ReferenceViewType,
  VIEW_TYPE_CONFIG,
  fetchReferenceImages,
  uploadReferenceImage,
  deleteReferenceImage,
  updateReferenceImage,
  uploadFileToMinIO
} from '../../../services/assets';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';

interface ReferenceImageManagerProps {
  assetType: AssetReferenceType;
  assetId: number;
  disabled?: boolean;
  /** 是否显示全局启用/禁用开关（仅角色级别） */
  showGlobalToggle?: boolean;
  /** 全局启用状态 */
  globalEnabled?: boolean;
  /** 全局启用状态变更回调 */
  onGlobalEnabledChange?: (enabled: boolean) => void;
}

/** 视角图标组件 */
const ViewIcon: React.FC<{ viewType: ReferenceViewType; className?: string }> = ({ viewType, className = 'w-5 h-5' }) => {
  switch (viewType) {
    case 'front':
      return <User className={className} />;
    case 'side':
      return <ArrowRight className={className} />;
    case 'back':
      return <ArrowLeft className={className} />;
    default:
      return <ImageIcon className={className} />;
  }
};

/** 三视图上传区块 */
const ViewUploadSlot: React.FC<{
  viewType: ReferenceViewType;
  image?: AssetReferenceImage;
  onUpload: (viewType: ReferenceViewType, url: string, desc?: string) => void;
  onFileUpload?: (viewType: ReferenceViewType, file: File) => void;
  onDelete: (image: AssetReferenceImage) => void;
  onPreview: (image: AssetReferenceImage) => void;
  onToggleEnabled?: (image: AssetReferenceImage) => void;
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: number;
}> = ({ viewType, image, onUpload, onFileUpload, onDelete, onPreview, onToggleEnabled, disabled, uploading, uploadProgress }) => {
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = VIEW_TYPE_CONFIG[viewType];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(viewType, file);
    }
    // 重置 input 以便可以再次选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div 
      className="relative flex flex-col"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* 标题 */}
      <div className="flex items-center gap-1.5 mb-2">
        <ViewIcon viewType={viewType} className={`w-4 h-4 ${config.color}`} />
        <span className={`text-sm font-medium ${config.color}`}>{config.label}图</span>
        <Tooltip content={config.desc} placement="top">
          <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
        </Tooltip>
      </div>

      {/* 图片区域 */}
      {image ? (
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-600/50 bg-slate-800/60 group">
          <img
            src={image.image_url}
            alt={`${config.label}视图`}
            className="w-full h-full object-cover object-top cursor-pointer"
            onClick={() => onPreview(image)}
          />
          {/* 悬停操作 */}
          {!disabled && isHovering && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
              <button
                onClick={() => onPreview(image)}
                className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                title="预览"
              >
                <Eye className="w-4 h-4 text-white" />
              </button>
              {onToggleEnabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleEnabled(image);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    image.is_enabled !== false
                      ? 'bg-green-500/80 hover:bg-green-500'
                      : 'bg-slate-500/80 hover:bg-slate-500'
                  }`}
                  title={image.is_enabled !== false ? '禁用' : '启用'}
                >
                  <Power className="w-4 h-4 text-white" />
                </button>
              )}
              <button
                onClick={() => onDelete(image)}
                className="p-2 bg-red-500/80 rounded-lg hover:bg-red-500 transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
          {/* 禁用状态遮罩 */}
          {image.is_enabled === false && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs font-medium px-2 py-1 bg-black/60 rounded">
                已禁用
              </span>
            </div>
          )}
          {/* 视角标签 */}
          <div className={`absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 ${config.color}`}>
            <p className="text-xs text-center">{config.label}</p>
          </div>
        </div>
      ) : (
        <div className="aspect-[3/4] rounded-lg border-2 border-dashed border-slate-600/50 bg-slate-800/30 flex flex-col items-center justify-center p-2">
          {disabled ? (
            <div className="text-center">
              <ImageIcon className="w-8 h-8 mx-auto mb-1 text-slate-600" />
              <p className="text-xs text-slate-500">暂无{config.label}图</p>
            </div>
          ) : uploading ? (
            <div className="w-full px-2">
              <div className="text-center mb-2">
                <Upload className="w-8 h-8 mx-auto mb-1 text-blue-400 animate-pulse" />
                <p className="text-xs text-slate-400">上传中...</p>
              </div>
              <Progress 
                value={uploadProgress || 0} 
                size="sm"
                color="primary"
                className="w-full"
              />
              <p className="text-xs text-center text-slate-500 mt-1">
                {uploadProgress || 0}%
              </p>
            </div>
          ) : (
            <>
              <ViewIcon viewType={viewType} className={`w-8 h-8 mb-3 ${config.color} opacity-50`} />
              
              {/* 文件上传按钮 */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
              />
              <Button
                size="sm"
                variant="flat"
                className="w-full h-8 text-xs bg-blue-600 text-white border border-blue-500 font-medium"
                onPress={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3 h-3 mr-1" />
                上传本地图片
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const ReferenceImageManager: React.FC<ReferenceImageManagerProps> = ({
  assetType,
  assetId,
  disabled = false,
  showGlobalToggle = false,
  globalEnabled = true,
  onGlobalEnabledChange
}) => {
  const [images, setImages] = useState<AssetReferenceImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageDesc, setNewImageDesc] = useState('');
  const [newViewType, setNewViewType] = useState<ReferenceViewType>('other');
  const [previewImage, setPreviewImage] = useState<AssetReferenceImage | null>(null);
  // 上传状态
  const [uploadingViewType, setUploadingViewType] = useState<ReferenceViewType | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { isOpen: isPreviewOpen, onOpen: onPreviewOpen, onOpenChange: onPreviewOpenChange } = useDisclosure();

  // 按视角类型分组图片
  const imagesByViewType = useMemo(() => {
    const grouped: Record<ReferenceViewType, AssetReferenceImage[]> = {
      front: [],
      side: [],
      back: [],
      other: []
    };
    images.forEach(img => {
      const vt = img.view_type || 'other';
      grouped[vt].push(img);
    });
    return grouped;
  }, [images]);

  // 三视图槽位（每种视角取第一张启用的）
  const threeViewSlots = useMemo(() => ({
    front: imagesByViewType.front.find(img => img.is_enabled !== false),
    side: imagesByViewType.side.find(img => img.is_enabled !== false),
    back: imagesByViewType.back.find(img => img.is_enabled !== false)
  }), [imagesByViewType]);

  // 切换参考图启用状态
  const handleToggleEnabled = async (image: AssetReferenceImage) => {
    try {
      await updateReferenceImage(image.id, { is_enabled: !image.is_enabled });
      await loadImages();
      showToast(image.is_enabled ? '参考图已禁用' : '参考图已启用', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  // 加载参考图
  const loadImages = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const data = await fetchReferenceImages(assetType, assetId);
      setImages(data);
    } catch (error: any) {
      console.error('加载参考图失败:', error);
    } finally {
      setLoading(false);
    }
  }, [assetType, assetId]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // 上传参考图（URL方式）
  const handleUpload = async (viewType: ReferenceViewType, url: string, desc?: string) => {
    try {
      await uploadReferenceImage(assetType, assetId, url, desc, viewType);
      await loadImages();
      showToast('参考图添加成功', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  // 上传文件（本地文件方式）
  const handleFileUpload = async (viewType: ReferenceViewType, file: File) => {
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('只允许上传图片文件 (JPEG, PNG, GIF, WebP)', 'error');
      return;
    }

    // 验证文件大小 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('文件大小超过限制（最大 10MB）', 'error');
      return;
    }

    setUploadingViewType(viewType);
    setUploadProgress(0);

    try {
      const result = await uploadFileToMinIO(
        file,
        assetType,
        assetId,
        viewType,
        undefined,
        (progress) => setUploadProgress(progress)
      );
      
      await loadImages();
      showToast('图片上传成功', 'success');
    } catch (error: any) {
      console.error('上传失败:', error);
      showToast(error.message || '上传失败，请重试', 'error');
    } finally {
      setUploadingViewType(null);
      setUploadProgress(0);
    }
  };

  // 添加其他参考图
  const handleAddOtherImage = async () => {
    if (!newImageUrl.trim()) {
      showToast('请输入图片URL', 'error');
      return;
    }
    await handleUpload(newViewType, newImageUrl.trim(), newImageDesc.trim() || undefined);
    setNewImageUrl('');
    setNewImageDesc('');
    setNewViewType('other');
  };

  // 删除参考图
  const handleDeleteImage = async (image: AssetReferenceImage) => {
    const confirmed = await confirm({
      title: '删除确认',
      message: '确定要删除这张参考图吗？',
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;

    try {
      await deleteReferenceImage(image.id);
      await loadImages();
      showToast('参考图删除成功', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  // 预览图片
  const handlePreview = (image: AssetReferenceImage) => {
    setPreviewImage(image);
    onPreviewOpen();
  };

  // 拖拽排序（仅其他参考图）
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex === dropIndex) return;

    const otherImages = imagesByViewType.other;
    const newOtherImages = [...otherImages];
    const [draggedImage] = newOtherImages.splice(dragIndex, 1);
    newOtherImages.splice(dropIndex, 0, draggedImage);

    // 更新服务器排序
    try {
      for (let i = 0; i < newOtherImages.length; i++) {
        await updateReferenceImage(newOtherImages[i].id, { sort_order: i });
      }
      await loadImages();
    } catch (error: any) {
      showToast(error.message, 'error');
      loadImages();
    }
  };

  if (!assetId) {
    return (
      <div className="text-center py-4 text-slate-500 text-sm">
        请先保存资产后再管理参考图
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 全局启用开关 */}
      {showGlobalToggle && (
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="flex items-center gap-2">
            <Power className={`w-4 h-4 ${globalEnabled ? 'text-green-400' : 'text-slate-500'}`} />
            <span className="text-sm text-slate-200">使用参考图生成三视图</span>
            <Tooltip 
              content="关闭后，AI生成三视图时将忽略所有参考图，仅基于角色描述生成"
              placement="right"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
            </Tooltip>
          </div>
          <Switch
            size="sm"
            isSelected={globalEnabled}
            onValueChange={onGlobalEnabledChange}
            isDisabled={disabled}
          />
        </div>
      )}

      {/* 三视图区域 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-medium text-slate-200">角色三视图</h4>
          <Tooltip 
            content="上传角色的正面、侧面、背面参考图，AI生成时会根据镜头角度自动选择合适的视图。已禁用的参考图不会参与生成。"
            placement="right"
          >
            <HelpCircle className="w-4 h-4 text-slate-500 cursor-help" />
          </Tooltip>
          {globalEnabled === false && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
              参考图功能已关闭
            </span>
          )}
        </div>
        
        {loading ? (
          <div className="text-center py-4 text-slate-400 text-sm">加载中...</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <ViewUploadSlot
              viewType="front"
              image={threeViewSlots.front}
              onUpload={handleUpload}
              onFileUpload={handleFileUpload}
              onDelete={handleDeleteImage}
              onPreview={handlePreview}
              onToggleEnabled={handleToggleEnabled}
              disabled={disabled}
              uploading={uploadingViewType === 'front'}
              uploadProgress={uploadProgress}
            />
            <ViewUploadSlot
              viewType="side"
              image={threeViewSlots.side}
              onUpload={handleUpload}
              onFileUpload={handleFileUpload}
              onDelete={handleDeleteImage}
              onPreview={handlePreview}
              onToggleEnabled={handleToggleEnabled}
              disabled={disabled}
              uploading={uploadingViewType === 'side'}
              uploadProgress={uploadProgress}
            />
            <ViewUploadSlot
              viewType="back"
              image={threeViewSlots.back}
              onUpload={handleUpload}
              onFileUpload={handleFileUpload}
              onDelete={handleDeleteImage}
              onPreview={handlePreview}
              onToggleEnabled={handleToggleEnabled}
              disabled={disabled}
              uploading={uploadingViewType === 'back'}
              uploadProgress={uploadProgress}
            />
          </div>
        )}
      </div>

      {/* 分隔线 */}
      <div className="border-t border-slate-700/50" />

      {/* 其他参考图区域 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-medium text-slate-200">其他参考图</h4>
          <span className="text-xs text-slate-500">（补充角色细节、表情、动作等）</span>
        </div>

        {/* 添加其他参考图 */}
        {!disabled && (
          <div className="space-y-2 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 mb-3">
            {/* 文件上传按钮 */}
            <div className="flex gap-2">
              <input
                type="file"
                id="other-image-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(newViewType, file);
                    // 重置 input
                    e.target.value = '';
                  }
                }}
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
              />
              <Button
                size="sm"
                variant="flat"
                className="flex-1 bg-blue-600/20 text-blue-200 border border-blue-500/30"
                onPress={() => document.getElementById('other-image-upload')?.click()}
                isDisabled={uploadingViewType !== null}
                startContent={<Upload className="w-4 h-4" />}
              >
                上传本地图片
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-slate-600/50" />
              <span className="text-[10px] text-slate-500">或粘贴图片URL</span>
              <div className="flex-1 h-px bg-slate-600/50" />
            </div>
            
            <div className="flex gap-2">
              <Input
                size="sm"
                placeholder="输入图片URL"
                value={newImageUrl}
                onValueChange={setNewImageUrl}
                classNames={{
                  input: "bg-transparent text-slate-100",
                  inputWrapper: "bg-slate-700/60 border border-slate-600/50"
                }}
                className="flex-1"
              />
              <Select
                size="sm"
                selectedKeys={[newViewType]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as ReferenceViewType;
                  if (selected) setNewViewType(selected);
                }}
                classNames={{
                  trigger: "bg-slate-700/60 border border-slate-600/50 min-w-[100px]",
                  value: "text-slate-200"
                }}
                aria-label="选择视角类型"
              >
                {Object.entries(VIEW_TYPE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} textValue={cfg.label}>
                    <span className={cfg.color}>{cfg.label}</span>
                  </SelectItem>
                ))}
              </Select>
              <Button
                size="sm"
                className="bg-blue-500 text-white shrink-0"
                onPress={handleAddOtherImage}
                isDisabled={!newImageUrl.trim()}
                startContent={<Plus className="w-4 h-4" />}
              >
                添加
              </Button>
            </div>
            <Input
              size="sm"
              placeholder="图片描述（可选，如：微笑表情、战斗姿势等）"
              value={newImageDesc}
              onValueChange={setNewImageDesc}
              classNames={{
                input: "bg-transparent text-slate-100",
                inputWrapper: "bg-slate-700/60 border border-slate-600/50"
              }}
            />
            
            {/* 上传进度 */}
            {uploadingViewType === newViewType && (
              <div className="mt-2">
                <Progress 
                  value={uploadProgress} 
                  size="sm"
                  color="primary"
                  className="w-full"
                />
                <p className="text-xs text-center text-slate-400 mt-1">
                  上传中... {uploadProgress}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* 其他参考图列表 */}
        {imagesByViewType.other.length === 0 ? (
          <div className="text-center py-4 text-slate-500">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">暂无其他参考图</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {imagesByViewType.other.map((image, index) => (
              <div
                key={image.id}
                draggable={!disabled}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className="relative group rounded-lg overflow-hidden border border-slate-700/50 bg-slate-800/40 cursor-pointer"
                onClick={() => handlePreview(image)}
              >
                {/* 拖拽手柄 */}
                {!disabled && (
                  <div className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-1 bg-black/50 rounded cursor-grab">
                      <GripVertical className="w-3 h-3 text-white" />
                    </div>
                  </div>
                )}
                
                {/* 删除按钮 */}
                {!disabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteImage(image);
                    }}
                    className="absolute top-1 right-1 z-10 p-1 bg-red-500/80 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                )}

                {/* 图片 */}
                <div className="aspect-square">
                  <img
                    src={image.image_url}
                    alt={image.description || '参考图'}
                    className="w-full h-full object-cover object-top"
                  />
                </div>

                {/* 描述 */}
                {image.description && (
                  <div className="p-1.5 bg-slate-900/80">
                    <p className="text-xs text-slate-300 truncate">{image.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 预览弹窗 */}
      <Modal
        isOpen={isPreviewOpen}
        onOpenChange={onPreviewOpenChange}
        size="3xl"
        classNames={{
          base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50",
          header: "border-b border-slate-700/50",
          body: "p-0"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-slate-100 flex items-center gap-2">
                {previewImage && (
                  <>
                    <ViewIcon viewType={previewImage.view_type || 'other'} className="w-5 h-5" />
                    <span>{VIEW_TYPE_CONFIG[previewImage.view_type || 'other'].label}参考图</span>
                  </>
                )}
              </ModalHeader>
              <ModalBody>
                {previewImage && (
                  <div className="relative">
                    <img
                      src={previewImage.image_url}
                      alt={previewImage.description || '参考图'}
                      className="w-full max-h-[70vh] object-contain"
                    />
                    {previewImage.description && (
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/60">
                        <p className="text-sm text-slate-200">{previewImage.description}</p>
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} className="text-slate-400">
                  关闭
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ReferenceImageManager;
