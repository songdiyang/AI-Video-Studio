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
  const [isDragOver, setIsDragOver] = useState(false);
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

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderColor: 'var(--border-color)',
  };

  return (
    <div className="space-y-4">
      {/* 全局启用开关 */}
      {showGlobalToggle && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border"
          style={cardStyle}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Power
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: globalEnabled ? 'var(--success)' : 'var(--text-muted)' }}
            />
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              使用参考图生成白膜三视图
            </span>
            <Tooltip
              content={`开启后，AI生成白膜三视图时会参考上传的${assetType === 'prop' ? '道具' : '角色'}设定图。关闭则仅基于${assetType === 'prop' ? '道具' : '角色'}描述生成白膜。其他状态（如服装变体）的生成不受此开关影响，它们始终以白膜三视图为参考基准。`}
              placement="right"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0 cursor-help" style={{ color: 'var(--text-muted)' }} />
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
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <h4 className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>{assetLabel}</h4>
          <Tooltip
            content={`上传一张${assetType === 'prop' ? '道具' : '角色'}设定图，仅用于${assetType === 'prop' ? '道具' : '白膜三视图'}生成时作为参考。`}
            placement="right"
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0 cursor-help" style={{ color: 'var(--text-muted)' }} />
          </Tooltip>
          {globalEnabled === false && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{ color: '#d49a36', background: 'rgba(212, 154, 54, 0.12)' }}
            >
              参考图功能已关闭
            </span>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
        />

        {loading ? (
          <div
            className="w-60 max-w-full aspect-[3/4] rounded-lg border flex items-center justify-center text-xs"
            style={{ ...cardStyle, color: 'var(--text-muted)' }}
          >
            加载中…
          </div>
        ) : (
          <div
            className="relative w-60 max-w-full aspect-[3/4] rounded-lg overflow-hidden"
            style={sheetImage ? { border: '1px solid var(--border-color)' } : undefined}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {sheetImage ? (
              <>
                <img
                  src={sheetImage.image_url}
                  alt={assetLabel}
                  className="w-full h-full object-cover object-top cursor-pointer"
                  onClick={onPreviewOpen}
                />
                {!disabled && isHovering && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={onPreviewOpen}
                      className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                      title="预览"
                      aria-label="预览设定图"
                    >
                      <Eye className="w-4 h-4 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                      title="更换"
                      aria-label="更换设定图"
                    >
                      <Upload className="w-4 h-4 text-white" />
                    </button>
                    <button
                      type="button"
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
                      aria-label={enabled ? '禁用参考图' : '启用参考图'}
                    >
                      <Power className="w-4 h-4 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="p-2 bg-red-500/80 rounded-lg hover:bg-red-500 transition-colors"
                      title="删除"
                      aria-label="删除设定图"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}
                {!enabled && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                    <span className="text-white text-xs font-medium px-2 py-1 bg-black/60 rounded">
                      已禁用
                    </span>
                  </div>
                )}
              </>
            ) : uploading ? (
              <div
                className="w-full h-full flex flex-col items-center justify-center px-5 rounded-lg border border-dashed"
                style={cardStyle}
              >
                <Upload className="w-6 h-6 mb-2 text-blue-400 animate-pulse" />
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  上传中… {uploadProgress}%
                </p>
                <Progress
                  value={uploadProgress}
                  size="sm"
                  color="primary"
                  className="w-full mt-2"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFileUpload(file);
                }}
                disabled={disabled}
                aria-label={`上传${assetLabel}`}
                className={`group w-full h-full flex flex-col items-center justify-center px-4 rounded-lg border border-dashed transition-colors bg-[var(--bg-card)] ${
                  disabled ? 'cursor-default' : 'hover:bg-[var(--bg-card-hover)]'
                }`}
                style={{
                  borderColor: isDragOver ? 'var(--accent)' : 'var(--border-color)',
                  background: isDragOver ? 'var(--bg-card-hover)' : undefined,
                }}
              >
                <Upload
                  className={`w-6 h-6 mb-2 transition-colors text-[var(--text-muted)] ${
                    disabled ? '' : 'group-hover:text-[var(--accent)]'
                  }`}
                  style={isDragOver ? { color: 'var(--accent)' } : undefined}
                />
                <span className={`text-xs font-medium ${disabled ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                  {disabled ? `暂无${assetLabel}` : `上传${assetLabel}`}
                </span>
                {!disabled && (
                  <span className="mt-1 text-[11px] text-center text-[var(--text-secondary)]">
                    点击选择或拖拽图片到此处
                  </span>
                )}
                <span className="mt-2 text-[11px] text-center leading-relaxed text-[var(--text-muted)]">
                  JPEG / PNG / GIF / WebP
                  <br />
                  大小不超过 10MB
                </span>
              </button>
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
