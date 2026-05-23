import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Tooltip, Switch, Progress } from '@heroui/react';
import { Image as ImageIcon, Trash2, Eye, HelpCircle, Power, Upload } from 'lucide-react';
import {
  AssetReferenceImage,
  AssetReferenceType,
  fetchReferenceImages,
  deleteReferenceImage,
  updateReferenceImage,
  uploadFileToMinIO
} from '../../../services/assets';
import { useToast } from '../../../contexts/ToastContext';

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

/**
 * 参考图管理组件（精简版）
 * - 道具：上传一张道具设定图
 * - 角色：上传一张角色设定图作为白膜三视图生成参考
 * - 不再区分正/侧/背三视图，也不再提供其他参考图
 * - 后端按 is_enabled=1 聚合所有参考图作为参考，单张即可生效
 */
const ReferenceImageManager: React.FC<ReferenceImageManagerProps> = ({
  assetType,
  assetId,
  disabled = false,
  showGlobalToggle = false,
  globalEnabled = true,
  onGlobalEnabledChange
}) => {
  // 根据资产类型获取显示名称
  const getAssetLabel = () => {
    if (assetType === 'prop') return '道具设定图';
    if (assetType === 'character') return '角色设定图';
    if (assetType === 'character_state') return '状态设定图';
    return '设定图';
  };

  const assetLabel = getAssetLabel();
  const [images, setImages] = useState<AssetReferenceImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const { isOpen: isPreviewOpen, onOpen: onPreviewOpen, onOpenChange: onPreviewOpenChange } = useDisclosure();

  // 当前设定图：取第一张启用的参考图（不区分视角）
  const sheetImage = useMemo<AssetReferenceImage | undefined>(() => {
    const enabled = images.filter(img => img.is_enabled !== false);
    if (enabled.length > 0) return enabled[0];
    return images[0];
  }, [images]);

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

  // 上传本地文件（固定 view_type='front' 作为设定图）
  const handleFileUpload = async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('只允许上传图片文件 (JPEG, PNG, GIF, WebP)', 'error');
      return;
    }
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('文件大小超过限制（最大 10MB）', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      await uploadFileToMinIO(
        file,
        assetType,
        assetId,
        'front',
        undefined,
        (progress) => setUploadProgress(progress)
      );
      await loadImages();
      showToast(`${assetLabel}上传成功`, 'success');
    } catch (error: any) {
      console.error('上传失败:', error);
      showToast(error.message || '上传失败，请重试', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!sheetImage) return;
    try {
      await deleteReferenceImage(sheetImage.id);
      await loadImages();
      showToast(`${assetLabel}已删除`, 'success');
    } catch (error: any) {
      showToast(error.message || '删除失败', 'error');
    }
  };

  const handleToggleEnabled = async () => {
    if (!sheetImage) return;
    try {
      await updateReferenceImage(sheetImage.id, { is_enabled: !sheetImage.is_enabled });
      await loadImages();
      showToast(sheetImage.is_enabled ? '参考图已禁用' : '参考图已启用', 'success');
    } catch (error: any) {
      showToast(error.message || '操作失败', 'error');
    }
  };

  if (!assetId) {
    return (
      <div className="text-center py-4 text-slate-500 text-sm">
        请先保存资产后再管理参考图
      </div>
    );
  }

  const enabled = sheetImage?.is_enabled !== false;

  return (
    <div className="space-y-6">
      {/* 全局启用开关 */}
      {showGlobalToggle && (
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="flex items-center gap-2">
            <Power className={`w-4 h-4 ${globalEnabled ? 'text-green-400' : 'text-slate-500'}`} />
            <span className="text-sm text-slate-200">使用参考图生成白膜三视图</span>
            <Tooltip
              content={`开启后，AI生成白膜三视图时会参考上传的${assetType === 'prop' ? '道具' : '角色'}设定图。关闭则仅基于${assetType === 'prop' ? '道具' : '角色'}描述生成白膜。其他状态（如服装变体）的生成不受此开关影响，它们始终以白膜三视图为参考基准。`}
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

      {/* 设定图区域 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-medium text-slate-200">{assetLabel}</h4>
          <Tooltip
            content={`上传一张${assetType === 'prop' ? '道具' : '角色'}设定图，仅用于${assetType === 'prop' ? '道具' : '白膜三视图'}生成时作为参考。`}
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
          <div
            className="relative flex flex-col max-w-xs"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {sheetImage ? (
              <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-600/50 bg-slate-800/60 group">
                <img
                  src={sheetImage.image_url}
                  alt={assetLabel}
                  className="w-full h-full object-cover object-top cursor-pointer"
                  onClick={onPreviewOpen}
                />
                {!disabled && isHovering && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
                    <button
                      onClick={onPreviewOpen}
                      className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                      title="预览"
                    >
                      <Eye className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleEnabled();
                      }}
                      className={`p-2 rounded-lg transition-colors ${
                        enabled
                          ? 'bg-green-500/80 hover:bg-green-500'
                          : 'bg-slate-500/80 hover:bg-slate-500'
                      }`}
                      title={enabled ? '禁用' : '启用'}
                    >
                      <Power className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 bg-red-500/80 rounded-lg hover:bg-red-500 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}
                {!enabled && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white text-xs font-medium px-2 py-1 bg-black/60 rounded">
                      已禁用
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-[3/4] rounded-lg border-2 border-dashed border-slate-600/50 bg-slate-800/30 flex flex-col items-center justify-center p-3">
                {disabled ? (
                  <div className="text-center">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 text-slate-600" />
                    <p className="text-xs text-slate-500">暂无{assetLabel}</p>
                  </div>
                ) : uploading ? (
                  <div className="w-full px-2">
                    <div className="text-center mb-2">
                      <Upload className="w-8 h-8 mx-auto mb-1 text-blue-400 animate-pulse" />
                      <p className="text-xs text-slate-400">上传中...</p>
                    </div>
                    <Progress
                      value={uploadProgress}
                      size="sm"
                      color="primary"
                      className="w-full"
                    />
                    <p className="text-xs text-center text-slate-500 mt-1">
                      {uploadProgress}%
                    </p>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-10 h-10 mb-3 text-slate-500 opacity-50" />
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
                    <p className="text-[11px] text-slate-500 mt-2 text-center">
                      支持 JPEG / PNG / GIF / WebP，最大 10MB
                    </p>
                  </>
                )}
              </div>
            )}
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
                <ImageIcon className="w-5 h-5" />
                <span>{assetLabel}</span>
              </ModalHeader>
              <ModalBody>
                {sheetImage && (
                  <div className="relative">
                    <img
                      src={sheetImage.image_url}
                      alt={assetLabel}
                      className="w-full max-h-[70vh] object-contain"
                    />
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
