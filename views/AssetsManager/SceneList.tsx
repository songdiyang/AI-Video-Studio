import React, { useRef, useState } from 'react';
import { Button, Chip, Tooltip } from '@heroui/react';
import { Edit, Trash2, Eye, Image, Upload } from 'lucide-react';
import { Scene, uploadSceneSketch, deleteSceneSketch } from '../../services/assets';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface SceneListProps {
  scenes: Scene[];
  onEdit: (scene: Scene) => void;
  onDelete: (id: number) => void;
  onViewDetail?: (scene: Scene) => void;
  onSceneUpdate?: () => void;
}

const SceneList: React.FC<SceneListProps> = ({ scenes, onEdit, onDelete, onViewDetail, onSceneUpdate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingSceneId, setUploadingSceneId] = useState<number | null>(null);
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 重置上传状态
  const resetUploadState = () => {
    setUploadingSceneId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理草图上传
  const handleUploadClick = (sceneId: number) => {
    setUploadingSceneId(sceneId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingSceneId) {
      resetUploadState();
      return;
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      resetUploadState();
      return;
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast('文件大小不能超过 10MB', 'error');
      resetUploadState();
      return;
    }

    try {
      await uploadSceneSketch(uploadingSceneId, file);
      showToast('草图上传成功', 'success');
      onSceneUpdate?.();
    } catch (error: any) {
      console.error('上传草图失败:', error);
      showToast(error.message || '上传草图失败', 'error');
    } finally {
      resetUploadState();
    }
  };

  // 处理删除草图
  const handleDeleteSketch = async (scene: Scene) => {
    const confirmed = await confirm({
      title: '删除草图',
      message: `确定要删除场景「${scene.name}」的草图吗？`,
      type: 'danger',
      confirmText: '删除'
    });

    if (!confirmed) return;

    try {
      await deleteSceneSketch(scene.id);
      showToast('草图删除成功', 'success');
      onSceneUpdate?.();
    } catch (error: any) {
      console.error('删除草图失败:', error);
      showToast(error.message || '删除草图失败', 'error');
    }
  };

  return (
    <>
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
        {scenes.map((scene) => {
          const hasSketch = !!scene.sketch_url;

          return (
            <div
              key={scene.id}
              className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-lg hover:shadow-(--accent)/10 transition-all cursor-pointer rounded-xl overflow-hidden group"
              onClick={() => onEdit(scene)}
            >
              {/* 图片区域 - 主要展示 */}
              <div className="relative aspect-[4/3] bg-gradient-to-br from-(--bg-hover) to-(--bg-card) overflow-hidden">
                {hasSketch ? (
                  <img
                    src={scene.sketch_url}
                    alt={scene.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewScene(scene);
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-(--text-muted)">
                    <span className="text-4xl font-bold opacity-20">
                      {scene.name.charAt(0)}
                    </span>
                  </div>
                )}
                
                {/* 悬浮操作按钮 */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip content={hasSketch ? '更换草图' : '上传草图'}>
                    <Button 
                      size="sm" 
                      isIconOnly 
                      variant="solid"
                      className="bg-(--bg-card)/90 backdrop-blur-sm hover:bg-purple-500/20"
                      onPress={() => handleUploadClick(scene.id)}
                      isLoading={uploadingSceneId === scene.id}
                    >
                      {hasSketch ? (
                        <Image className="w-4 h-4 text-purple-400" />
                      ) : (
                        <Upload className="w-4 h-4 text-purple-400" />
                      )}
                    </Button>
                  </Tooltip>
                  {hasSketch && (
                    <Tooltip content="查看大图">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="solid"
                        className="bg-(--bg-card)/90 backdrop-blur-sm hover:bg-(--accent)/20"
                        onPress={() => setPreviewScene(scene)}
                      >
                        <Eye className="w-4 h-4 text-(--accent)" />
                      </Button>
                    </Tooltip>
                  )}
                  <Button 
                    size="sm" 
                    isIconOnly 
                    variant="solid"
                    className="bg-(--bg-card)/90 backdrop-blur-sm hover:bg-(--accent)/20"
                    onClick={(e) => { e.stopPropagation(); onEdit(scene); }}
                  >
                    <Edit className="w-4 h-4 text-(--accent)" />
                  </Button>
                  <Button 
                    size="sm" 
                    isIconOnly 
                    variant="solid"
                    className="bg-(--bg-card)/90 backdrop-blur-sm hover:bg-red-500/20"
                    onClick={(e) => { e.stopPropagation(); onDelete(scene.id); }}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>

                {/* 草图状态徽章 */}
                {hasSketch && (
                  <div className="absolute top-2 left-2">
                    <Chip
                      size="sm"
                      variant="solid"
                      className="bg-purple-500/90 backdrop-blur-sm text-white font-medium"
                      startContent={<Image className="w-3 h-3" />}
                    >
                      草图
                    </Chip>
                  </div>
                )}
              </div>

              {/* 信息区域 - 次要展示 */}
              <div className="p-3 space-y-2">
                <h3 className="text-base font-semibold text-(--text-primary) truncate">
                  {scene.name}
                </h3>
                
                {/* 描述文字（可选显示） */}
                {scene.description && (
                  <p className="text-xs text-(--text-muted) line-clamp-2 leading-relaxed">
                    {scene.description}
                  </p>
                )}

                {/* 标签区域 */}
                <div className="flex flex-wrap gap-1.5">
                  {scene.project_name && (
                    <Chip 
                      size="sm" 
                      variant="flat" 
                      className="bg-emerald-500/10 text-emerald-400 text-xs"
                    >
                      {scene.project_name}
                    </Chip>
                  )}
                  {scene.tags && scene.tags.split(',').slice(0, 2).map((tag, idx) => (
                    <Chip 
                      key={idx} 
                      size="sm" 
                      variant="flat" 
                      className="bg-sky-500/10 text-sky-400 text-xs"
                    >
                      {tag.trim()}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 草图预览模态框 */}
      {previewScene && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewScene(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
              onClick={() => setPreviewScene(null)}
            >
              ✕
            </button>
            <img
              src={previewScene.sketch_url || ''}
              alt={`${previewScene.name} 草图`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-center text-white mt-2 text-sm">{previewScene.name} - 草图</p>
          </div>
        </div>
      )}
    </>
  );
};

export default SceneList;
