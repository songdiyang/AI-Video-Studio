import React, { useState, useCallback } from 'react';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ButtonGroup } from '@heroui/react';
import { Pencil, Upload, Edit3, RefreshCw, Trash2, Wand2, ChevronDown, ChevronUp, ZoomIn, SplitSquareVertical, Image as ImageIcon } from 'lucide-react';
import { useToast } from '../../../../contexts/ToastContext';
import { useConfirm } from '../../../../contexts/ConfirmContext';
import { deleteSketch, updateSketchSettings, generateFromSketch } from '../../../../services/storyboards';
import SketchEditor from './SketchEditor';
import SketchUploader from './SketchUploader';
import SketchTypeSelector from './SketchTypeSelector';
import ControlStrengthSlider from './ControlStrengthSlider';
import { SketchType } from '../hooks/useSketchEditor';

interface SketchPanelProps {
  storyboardId: number;
  sketchUrl?: string;
  sketchType?: string;
  sketchData?: unknown;
  controlStrength?: number;
  backgroundImage?: string; // 首帧图片，用作绘图底图
  generatedImageUrl?: string; // AI 生成的图像，用于对比视图
  onSketchChange: (updates: {
    sketchUrl?: string;
    sketchType?: string;
    sketchData?: unknown;
    controlStrength?: number;
  }) => void;
}

const SketchPanel: React.FC<SketchPanelProps> = ({
  storyboardId,
  sketchUrl,
  sketchType = 'storyboard_sketch',
  sketchData,
  controlStrength = 0.85,
  backgroundImage,
  generatedImageUrl,
  onSketchChange
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  
  // 状态管理
  const [showSketchEditor, setShowSketchEditor] = useState(false);
  const [showSketchUploader, setShowSketchUploader] = useState(false);
  const [sketchGenerating, setSketchGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareMode, setCompareMode] = useState<'split' | 'slider'>('split');
  
  // 本地状态用于设置控制
  const [localSketchType, setLocalSketchType] = useState<SketchType>(sketchType as SketchType);
  const [localControlStrength, setLocalControlStrength] = useState(controlStrength);

  // 处理草图编辑器保存
  const handleEditorSave = useCallback((result: { sketchUrl?: string; sketchData?: unknown }) => {
    onSketchChange({
      sketchUrl: result.sketchUrl ?? '',
      sketchData: result.sketchData,
      sketchType: localSketchType,
      controlStrength: localControlStrength
    });
    setShowSketchEditor(false);
  }, [onSketchChange, localSketchType, localControlStrength]);

  // 处理上传完成
  const handleUploadComplete = useCallback((newSketchUrl: string) => {
    onSketchChange({
      sketchUrl: newSketchUrl,
      sketchType: localSketchType,
      controlStrength: localControlStrength
    });
    setShowSketchUploader(false);
  }, [onSketchChange, localSketchType, localControlStrength]);

  // 删除草图
  const handleDelete = useCallback(async () => {
    const confirmed = await confirm({
      title: '删除草图',
      message: '确定要删除该草图吗？此操作不可撤销。',
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消'
    });

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteSketch(storyboardId);
      onSketchChange({
        sketchUrl: undefined,
        sketchData: undefined,
        sketchType: undefined,
        controlStrength: undefined
      });
      showToast('草图已删除', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      showToast(message, 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [storyboardId, confirm, onSketchChange, showToast]);

  // 基于草图生成
  const handleGenerateFromSketch = useCallback(async () => {
    if (!sketchUrl) {
      showToast('请先上传或绘制草图', 'warning');
      return;
    }

    setSketchGenerating(true);
    try {
      const result = await generateFromSketch(storyboardId, {
        controlStrength: localControlStrength,
        sketchUrl: sketchUrl,
        sketchType: localSketchType,
      });
      showToast(`草图生成任务已提交，任务ID: ${result.jobId}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      showToast(message, 'error');
    } finally {
      setSketchGenerating(false);
    }
  }, [storyboardId, sketchUrl, localControlStrength, showToast]);

  // 更新草图设置
  const handleUpdateSettings = useCallback(async () => {
    try {
      await updateSketchSettings(storyboardId, {
        sketch_type: localSketchType,
        control_strength: localControlStrength
      });
      onSketchChange({
        sketchType: localSketchType,
        controlStrength: localControlStrength
      });
      showToast('设置已保存', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      showToast(message, 'error');
    }
  }, [storyboardId, localSketchType, localControlStrength, onSketchChange, showToast]);

  // 草图类型变更时自动保存
  const handleSketchTypeChange = useCallback(async (type: SketchType) => {
    setLocalSketchType(type);
    if (sketchUrl) {
      try {
        await updateSketchSettings(storyboardId, { sketch_type: type });
        onSketchChange({ sketchType: type });
      } catch (error) {
        console.error('[SketchPanel] 更新草图类型失败:', error);
      }
    }
  }, [storyboardId, sketchUrl, onSketchChange]);

  // 控制强度变更完成时保存
  const handleControlStrengthChangeEnd = useCallback(async (value: number) => {
    setLocalControlStrength(value);
    if (sketchUrl) {
      try {
        await updateSketchSettings(storyboardId, { control_strength: value });
        onSketchChange({ controlStrength: value });
      } catch (error) {
        console.error('[SketchPanel] 更新控制强度失败:', error);
      }
    }
  }, [storyboardId, sketchUrl, onSketchChange]);

  const hasSketch = !!sketchUrl;
  const canCompare = !!sketchUrl && !!generatedImageUrl;

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          草图参考
        </span>
        {hasSketch && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            设置
            {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* 无草图状态 */}
      {!hasSketch && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            startContent={<Pencil className="w-4 h-4" />}
            onPress={() => setShowSketchEditor(true)}
          >
            绘制草图
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            startContent={<Upload className="w-4 h-4" />}
            onPress={() => setShowSketchUploader(true)}
          >
            上传草图
          </Button>
        </div>
      )}

      {/* 有草图状态 */}
      {hasSketch && (
        <>
          {/* 草图缩略图预览 */}
          <div
            className="relative w-full aspect-video bg-[var(--bg-app)] rounded-lg overflow-hidden border border-[var(--border-color)] cursor-pointer group"
            onClick={() => setShowPreview(true)}
          >
            <img
              src={sketchUrl}
              alt="草图预览"
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="w-6 h-6 text-white" />
            </div>
            {/* 草图类型标签 */}
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px]">
              {sketchType === 'stick_figure' && '火柴人草稿'}
              {sketchType === 'storyboard_sketch' && '分镜草图'}
              {sketchType === 'detailed_lineart' && '精细线稿'}
            </div>
          </div>

          {/* 操作按钮组 */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="flat"
              className="flex-1 bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
              startContent={<Edit3 className="w-3.5 h-3.5" />}
              onPress={() => setShowSketchEditor(true)}
            >
              编辑
            </Button>
            <Button
              size="sm"
              variant="flat"
              className="flex-1 bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
              startContent={<RefreshCw className="w-3.5 h-3.5" />}
              onPress={() => setShowSketchUploader(true)}
            >
              替换
            </Button>
            <Button
              size="sm"
              variant="flat"
              isIconOnly
              className="bg-red-500/10 text-red-400 border border-red-500/30"
              onPress={handleDelete}
              isLoading={isDeleting}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* 基于草图生成按钮 */}
          <Button
            size="sm"
            className="w-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium"
            startContent={!sketchGenerating && <Wand2 className="w-4 h-4" />}
            onPress={handleGenerateFromSketch}
            isLoading={sketchGenerating}
            isDisabled={sketchGenerating}
          >
            {sketchGenerating ? '生成中...' : '基于草图生成'}
          </Button>

          {/* 草图/生成结果对比按钮 */}
          {canCompare && (
            <Button
              size="sm"
              variant="flat"
              className="w-full bg-purple-500/20 text-purple-400 border border-purple-500/30"
              startContent={<SplitSquareVertical className="w-4 h-4" />}
              onPress={() => setShowCompare(true)}
            >
              草图对比
            </Button>
          )}

          {/* 可折叠的控制参数 */}
          {showSettings && (
            <div className="space-y-3 p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
              {/* 草图类型选择 */}
              <SketchTypeSelector
                value={localSketchType}
                onChange={handleSketchTypeChange}
                compact
              />

              {/* 控制强度滑块 */}
              <ControlStrengthSlider
                value={localControlStrength}
                onChange={setLocalControlStrength}
                onChangeEnd={handleControlStrengthChangeEnd}
                showPresets
              />
            </div>
          )}
        </>
      )}

      {/* 草图编辑器弹窗 */}
      {showSketchEditor && (
        <SketchEditor
          storyboardId={storyboardId}
          initialData={sketchData}
          backgroundImage={backgroundImage}
          onSave={handleEditorSave}
          onClose={() => setShowSketchEditor(false)}
        />
      )}

      {/* 草图上传弹窗 */}
      {showSketchUploader && (
        <SketchUploader
          storyboardId={storyboardId}
          onUploadComplete={handleUploadComplete}
          onCancel={() => setShowSketchUploader(false)}
        />
      )}

      {/* 草图大图预览弹窗 */}
      <Modal
        isOpen={showPreview}
        onOpenChange={setShowPreview}
        size="3xl"
        classNames={{ base: "pro-modal" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-sm">草图预览</ModalHeader>
              <ModalBody className="p-4">
                {sketchUrl && (
                  <img
                    src={sketchUrl}
                    alt="草图大图预览"
                    className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 草图/生成结果对比弹窗 */}
      <Modal
        isOpen={showCompare}
        onOpenChange={setShowCompare}
        size="5xl"
        classNames={{ base: "pro-modal" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SplitSquareVertical className="w-5 h-5 text-purple-400" />
                  <span className="text-sm">草图 vs AI生成结果</span>
                </div>
              </ModalHeader>
              <ModalBody className="p-4">
                <div className="flex gap-4 h-[60vh]">
                  {/* 草图原稿 */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <Pencil className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-medium text-[var(--text-secondary)]">草图原稿</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        {sketchType === 'stick_figure' && '火柴人草稿'}
                        {sketchType === 'storyboard_sketch' && '分镜草图'}
                        {sketchType === 'detailed_lineart' && '精细线稿'}
                      </span>
                    </div>
                    <div className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] overflow-hidden">
                      {sketchUrl && (
                        <img
                          src={sketchUrl}
                          alt="草图原稿"
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                  </div>

                  {/* AI生成结果 */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-medium text-[var(--text-secondary)]">AI生成结果</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        控制强度: {Math.round((controlStrength || 0.85) * 100)}%
                      </span>
                    </div>
                    <div className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] overflow-hidden">
                      {generatedImageUrl && (
                        <img
                          src={generatedImageUrl}
                          alt="AI生成结果"
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default SketchPanel;
