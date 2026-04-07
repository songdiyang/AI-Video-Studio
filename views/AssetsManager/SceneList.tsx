import React, { useRef, useState } from 'react';
import { Card, CardBody, Button, Chip, Tooltip } from '@heroui/react';
import { Edit, Trash2, Eye, Image, Upload, X } from 'lucide-react';
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {scenes.map((scene) => (
          <Card 
            key={scene.id} 
            className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow cursor-pointer"
            isPressable
            onPress={() => onEdit(scene)}
          >
            <CardBody className="p-4 space-y-3">
              {/* 草图预览区域 */}
              {scene.sketch_url && (
                <div className="relative group">
                  <img
                    src={scene.sketch_url}
                    alt={`${scene.name} 草图`}
                    className="w-full h-32 object-cover rounded-lg border border-(--border-color) cursor-pointer"
                    onClick={() => setPreviewScene(scene)}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                    <Tooltip content="查看大图">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        className="bg-white/20 text-white"
                        onPress={() => setPreviewScene(scene)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="删除草图">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        className="bg-red-500/20 text-red-300 hover:bg-red-500/40"
                        onPress={() => handleDeleteSketch(scene)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-(--text-primary)">{scene.name}</h3>
                <div className="flex gap-1">
                  {/* 草图操作按钮 */}
                  <Tooltip content={scene.sketch_url ? '更换草图' : '上传草图'}>
                    <Button 
                      size="sm" 
                      isIconOnly 
                      variant="light" 
                      onPress={() => handleUploadClick(scene.id)}
                      isLoading={uploadingSceneId === scene.id}
                      className="hover:bg-purple-500/10"
                    >
                      {scene.sketch_url ? (
                        <Image className="w-4 h-4 text-purple-400" />
                      ) : (
                        <Upload className="w-4 h-4 text-purple-400" />
                      )}
                    </Button>
                  </Tooltip>
                  {onViewDetail && (
                    <Button 
                      size="sm" 
                      isIconOnly 
                      variant="light" 
                      onPress={() => onViewDetail(scene)} 
                      className="hover:bg-emerald-500/10"
                    >
                      <Eye className="w-4 h-4 text-emerald-400" />
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    isIconOnly 
                    variant="light" 
                    onPress={() => onEdit(scene)} 
                    className="hover:bg-(--accent)/10"
                  >
                    <Edit className="w-4 h-4 text-(--accent)" />
                  </Button>
                  <Button 
                    size="sm" 
                    isIconOnly 
                    variant="light" 
                    onPress={() => onDelete(scene.id)} 
                    className="hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-(--text-secondary) line-clamp-2">{scene.description}</p>
              <div className="flex flex-wrap gap-2">
                {scene.project_name && (
                  <Chip 
                    size="sm" 
                    variant="flat" 
                    className="bg-emerald-500/10 text-emerald-400 font-medium"
                  >
                    {scene.project_name}
                  </Chip>
                )}
                {scene.sketch_url && (
                  <Chip 
                    size="sm" 
                    variant="flat" 
                    className="bg-purple-500/10 text-purple-400 font-medium"
                  >
                    有草图
                  </Chip>
                )}
                {scene.tags && scene.tags.split(',').map((tag, idx) => (
                  <Chip 
                    key={idx} 
                    size="sm" 
                    variant="flat" 
                    className="bg-sky-500/10 text-sky-400 font-medium"
                  >
                    {tag.trim()}
                  </Chip>
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* 草图预览模态框 */}
      {previewScene && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewScene(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <Button
              isIconOnly
              variant="flat"
              className="absolute top-2 right-2 bg-black/50 text-white z-10"
              onPress={() => setPreviewScene(null)}
            >
              <X className="w-5 h-5" />
            </Button>
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
