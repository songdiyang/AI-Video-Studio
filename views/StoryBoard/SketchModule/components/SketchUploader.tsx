import React, { useState, useCallback, useRef } from 'react';
import { Button, Progress } from '@heroui/react';
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import SketchTypeSelector from './SketchTypeSelector';
import { SketchType } from '../hooks/useSketchEditor';
import { getAuthToken } from '../../../../services/auth';
import { useToast } from '../../../../contexts/ToastContext';

interface SketchUploaderProps {
  storyboardId: number;
  onUploadComplete: (sketchUrl: string) => void;
  onCancel: () => void;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SketchUploader: React.FC<SketchUploaderProps> = ({
  storyboardId,
  onUploadComplete,
  onCancel
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sketchType, setSketchType] = useState<SketchType>('storyboard_sketch');
  const [controlStrength, setControlStrength] = useState(0.85);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // 验证文件
  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return '不支持的文件格式，请上传 PNG、JPG 或 SVG 格式的图片';
    }
    if (file.size > MAX_FILE_SIZE) {
      return `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`;
    }
    return null;
  };

  // 处理文件选择
  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);

    // 创建预览
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // 拖拽处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // 点击选择文件
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // 清除选择
  const handleClear = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 上传文件
  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('sketch', selectedFile);
      formData.append('sketch_type', sketchType);
      formData.append('control_strength', controlStrength.toString());

      // 使用 XMLHttpRequest 以获取上传进度
      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<string>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result.sketchUrl);
            } catch {
              reject(new Error('解析响应失败'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.message || '上传失败'));
            } catch {
              reject(new Error(`上传失败: ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('网络错误'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('上传已取消'));
        });

        xhr.open('POST', `/api/storyboards/${storyboardId}/sketch`);
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.send(formData);
      });

      const sketchUrl = await uploadPromise;
      showToast('草图上传成功', 'success');
      onUploadComplete(sketchUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '上传失败';
      setError(message);
      showToast(message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            上传草图
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* 拖拽上传区域 */}
          {!selectedFile ? (
            <div
              onClick={handleClick}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`
                relative p-8 border-2 border-dashed rounded-lg cursor-pointer transition-all
                ${isDragging
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-app)]'
                }
              `}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className={`
                  w-14 h-14 rounded-full flex items-center justify-center
                  ${isDragging ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'}
                `}>
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    拖拽图片到这里，或点击选择
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    支持 PNG、JPG、SVG 格式，最大 10MB
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>
          ) : (
            /* 预览区域 */
            <div className="relative">
              <div className="relative aspect-video bg-[var(--bg-app)] rounded-lg overflow-hidden border border-[var(--border-color)]">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="预览"
                    className="w-full h-full object-contain"
                  />
                )}
                {/* 清除按钮 */}
                <button
                  onClick={handleClear}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)] truncate">
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 草图类型选择 */}
          {selectedFile && (
            <SketchTypeSelector
              value={sketchType}
              onChange={setSketchType}
            />
          )}

          {/* 控制强度 */}
          {selectedFile && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  控制强度
                </label>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  {controlStrength.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={controlStrength}
                onChange={(e) => setControlStrength(parseFloat(e.target.value))}
                className="w-full h-2 bg-[var(--bg-app)] rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-[var(--accent)]
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-white
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer
                "
              />
              <p className="text-xs text-[var(--text-muted)]">
                较高的值会让生成的图像更接近草图轮廓
              </p>
            </div>
          )}

          {/* 上传进度 */}
          {uploading && (
            <div className="space-y-2">
              <Progress
                value={uploadProgress}
                className="max-w-full"
                classNames={{
                  track: "bg-[var(--bg-app)]",
                  indicator: "bg-[var(--accent)]"
                }}
                aria-label="上传进度"
              />
              <p className="text-xs text-center text-[var(--text-muted)]">
                上传中... {uploadProgress}%
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)]">
          <Button
            variant="flat"
            onPress={onCancel}
            className="pro-btn text-[var(--text-secondary)]"
            isDisabled={uploading}
          >
            取消
          </Button>
          <Button
            onPress={handleUpload}
            className="pro-btn-primary"
            isDisabled={!selectedFile || uploading}
            isLoading={uploading}
            startContent={!uploading && <Upload className="w-4 h-4" />}
          >
            {uploading ? '上传中...' : '上传草图'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SketchUploader;
