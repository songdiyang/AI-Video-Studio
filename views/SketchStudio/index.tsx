import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, CardFooter, Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Spinner } from '@heroui/react';
import { Pencil, Plus, Search, Clock, Edit, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  SketchProject, 
  getSketchProjects, 
  createSketchProject, 
  updateSketchProject, 
  deleteSketchProject,
  uploadSketchThumbnail
} from '../../services/sketchProjects';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

// 动态导入 SketchEditor 避免首屏加载
const SketchEditor = React.lazy(() => import('../StoryBoard/SketchModule/components/SketchEditor'));

const LAST_PROJECT_KEY = 'nanostory_last_project_id';

// 加载骨架屏
const EditorSkeleton: React.FC = () => (
  <div className="h-full flex items-center justify-center bg-[var(--bg-app)]">
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" color="primary" />
      <p className="text-sm text-[var(--text-muted)]">加载编辑器中...</p>
    </div>
  </div>
);

const SketchStudio: React.FC = () => {
  const [sketches, setSketches] = useState<SketchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSketch, setEditingSketch] = useState<SketchProject | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // 获取当前项目 ID
  const getCurrentProjectId = useCallback((): number | null => {
    const storedId = localStorage.getItem(LAST_PROJECT_KEY);
    return storedId ? parseInt(storedId, 10) : null;
  }, []);

  // 加载草图列表
  const loadSketches = useCallback(async () => {
    setLoading(true);
    try {
      const projectId = getCurrentProjectId();
      if (!projectId) {
        setSketches([]);
        return;
      }
      const response = await getSketchProjects({ 
        project_id: projectId,
        search: searchQuery || undefined 
      });
      setSketches(response.items);
    } catch (error: any) {
      console.error('加载草图失败:', error);
      showToast('加载草图失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  }, [getCurrentProjectId, searchQuery, showToast]);

  useEffect(() => {
    loadSketches();
  }, [loadSketches]);

  // 创建新草图
  const handleCreate = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      showToast('请先创建或选择一个工程', 'warning');
      return;
    }
    setIsCreating(true);
    try {
      const newSketch = await createSketchProject({
        title: `草图 ${new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        project_id: projectId
      });
      setEditingSketch(newSketch);
      showToast('草图创建成功', 'success');
    } catch (error: any) {
      console.error('创建草图失败:', error);
      showToast('创建草图失败，请稍后重试', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  // 删除草图
  const handleDelete = async () => {
    if (!deleteTargetId) return;
    
    try {
      await deleteSketchProject(deleteTargetId);
      setSketches(prev => prev.filter(s => s.id !== deleteTargetId));
      showToast('草图已删除', 'success');
    } catch (error: any) {
      console.error('删除草图失败:', error);
      showToast('删除草图失败，请稍后重试', 'error');
    } finally {
      setDeleteTargetId(null);
      onDeleteOpenChange();
    }
  };

  // 打开删除确认
  const confirmDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTargetId(id);
    onDeleteOpen();
  };

  // 标题更新
  const handleTitleChange = useCallback(async (title: string) => {
    if (!editingSketch) return;
    try {
      await updateSketchProject(editingSketch.id, { title });
      setEditingSketch(prev => prev ? { ...prev, title } : null);
    } catch (error: any) {
      console.error('更新标题失败:', error);
    }
  }, [editingSketch]);

  // 保存草图数据
  const handleSave = useCallback(async (result: { sketchUrl?: string; sketchData?: unknown }) => {
    if (!editingSketch) return;
    
    try {
      // 保存 excalidraw 数据
      if (result.sketchData) {
        await updateSketchProject(editingSketch.id, { 
          excalidraw_data: result.sketchData 
        });
      }
      
      // 如果有生成的 PNG 图片，上传作为缩略图
      if (result.sketchUrl && result.sketchUrl.startsWith('data:image/png')) {
        const base64Data = result.sketchUrl.split(',')[1];
        const blob = base64ToBlob(base64Data, 'image/png');
        await uploadSketchThumbnail(editingSketch.id, blob);
      }
      
    } catch (error: any) {
      console.error('保存草图失败:', error);
      showToast('保存失败，请稍后重试', 'error');
    }
  }, [editingSketch, showToast]);

  // 关闭编辑器
  const handleCloseEditor = useCallback(() => {
    setEditingSketch(null);
    loadSketches(); // 刷新列表
  }, [loadSketches]);

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 过滤草图列表
  const filteredSketches = sketches.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 编辑器视图
  if (editingSketch) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="editor"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full w-full"
        >
          <React.Suspense fallback={<EditorSkeleton />}>
            <SketchEditor
              standalone={true}
              sketchProjectId={editingSketch.id}
              title={editingSketch.title}
              initialData={editingSketch.excalidraw_data}
              onTitleChange={handleTitleChange}
              onSave={handleSave}
              onClose={handleCloseEditor}
            />
          </React.Suspense>
        </motion.div>
      </AnimatePresence>
    );
  }

  // 草图库视图
  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/30 to-[var(--accent-dark)]/30 rounded-xl blur-lg opacity-60" />
              <div className="relative p-2.5 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-dark)]/30 rounded-xl border border-[var(--accent)]/30">
                <Pencil className="w-6 h-6 text-[var(--accent)]" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold pro-title">草图绘制</h1>
              <p className="text-sm text-[var(--text-muted)]">自由绘制草图和概念图</p>
            </div>
          </div>
          <Button
            className="pro-btn-primary"
            startContent={isCreating ? <Spinner size="sm" color="white" /> : <Plus className="w-4 h-4" />}
            onPress={handleCreate}
            isDisabled={isCreating}
          >
            {isCreating ? '创建中...' : '新建草图'}
          </Button>
        </div>

        {/* 搜索 */}
        <Input
          placeholder="搜索草图..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          startContent={<Search className="w-4 h-4 text-[var(--text-muted)]" />}
          classNames={{
            input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 focus-within:border-[var(--accent)]/40 shadow-sm"
          }}
        />

        {/* 草图列表 */}
        {loading ? (
          <div className="text-center py-12 text-[var(--text-muted)]">
            <Spinner size="lg" color="primary" />
            <p className="mt-4">加载中...</p>
          </div>
        ) : filteredSketches.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto bg-[var(--bg-card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-color)]">
              <Pencil className="w-10 h-10 text-[var(--text-muted)]" />
            </div>
            <p className="text-[var(--text-secondary)] font-medium">还没有草图</p>
            <p className="text-[var(--text-muted)] text-sm mt-1">点击"新建草图"开始创作吧</p>
            <Button
              className="pro-btn-primary mt-4"
              startContent={<Plus className="w-4 h-4" />}
              onPress={handleCreate}
              isDisabled={isCreating}
            >
              新建草图
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredSketches.map((sketch) => (
              <Card
                key={sketch.id}
                className="pro-card cursor-pointer group rounded-xl"
                isPressable
                onPress={() => setEditingSketch(sketch)}
              >
                <CardBody className="p-0 overflow-hidden">
                  {/* 缩略图区域 */}
                  <div className="h-32 lg:h-40 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-input)] relative overflow-hidden rounded-t-xl">
                    {sketch.thumbnail_url ? (
                      <img 
                        src={sketch.thumbnail_url} 
                        alt={sketch.title} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Pencil className="w-12 h-12 text-[var(--accent)]/30" />
                      </div>
                    )}
                    {/* 操作按钮 */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-[var(--bg-elevated)] backdrop-blur-sm hover:bg-[var(--bg-card)] shadow-lg border border-[var(--border-color)] cursor-pointer"
                        onPress={() => setEditingSketch(sketch)}
                      >
                        <Edit className="w-4 h-4 text-[var(--text-primary)]" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-[var(--bg-elevated)] backdrop-blur-sm hover:bg-red-500/20 shadow-lg border border-[var(--border-color)] cursor-pointer"
                        onPress={(e) => confirmDelete(sketch.id, e as unknown as React.MouseEvent)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardBody>
                <CardFooter className="flex-col items-start gap-1 p-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">
                    {sketch.title}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(sketch.updated_at)}</span>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* 删除确认对话框 */}
        <Modal
          isOpen={isDeleteOpen}
          onOpenChange={onDeleteOpenChange}
          size="sm"
          classNames={{
            backdrop: 'bg-black/60 backdrop-blur-sm',
            base: 'bg-[var(--bg-elevated)] border border-[var(--border-color)] shadow-2xl',
            header: 'border-b border-[var(--border-color)]',
            body: 'py-6',
            footer: 'border-t border-[var(--border-color)]',
            closeButton: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10'
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="text-[var(--text-primary)] font-bold">
                  删除草图
                </ModalHeader>
                <ModalBody>
                  <p className="text-[var(--text-secondary)]">
                    确定要删除这个草图吗？此操作无法撤销。
                  </p>
                </ModalBody>
                <ModalFooter className="gap-2">
                  <Button 
                    variant="flat" 
                    onPress={onClose} 
                    className="bg-white/5 text-[var(--text-secondary)] font-semibold hover:bg-white/10 border border-white/10 cursor-pointer"
                  >
                    取消
                  </Button>
                  <Button 
                    color="danger" 
                    onPress={handleDelete}
                    className="cursor-pointer"
                  >
                    删除
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
};

// 辅助函数：Base64 转 Blob
function base64ToBlob(base64: string, type: string): Blob {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

export default SketchStudio;
