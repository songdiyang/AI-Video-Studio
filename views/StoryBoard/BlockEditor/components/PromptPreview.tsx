/**
 * 提示词预览
 * 显示生成的分镜描述提示词
 */

import React from 'react';
import { Button } from '@heroui/react';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useToast } from '../../../../contexts/ToastContext';

interface PromptPreviewProps {
  prompt: string;
  onRegenerate?: () => void;
  loading?: boolean;
}

const PromptPreview: React.FC<PromptPreviewProps> = ({
  prompt,
  onRegenerate,
  loading = false,
}) => {
  const { showToast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('提示词已复制到剪贴板', 'success');
    } catch (error) {
      showToast('复制失败', 'error');
    }
  };

  return (
    <div className="bg-[var(--bg-card)] border-t border-[var(--border-color)] p-4">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            生成的分镜描述
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {onRegenerate && (
            <Button
              size="sm"
              variant="flat"
              className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
              startContent={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onPress={onRegenerate}
              isLoading={loading}
            >
              重新生成
            </Button>
          )}
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
            startContent={<Copy className="w-3.5 h-3.5" />}
            onPress={handleCopy}
            isDisabled={!prompt}
          >
            复制
          </Button>
        </div>
      </div>

      {/* 提示词内容 */}
      <div className="relative">
        <textarea
          value={prompt || '拖拽积木块到画布，自动生成分镜描述...'}
          readOnly
          className={`
            w-full min-h-[80px] p-3 text-sm rounded-lg
            ${prompt ? 'bg-[var(--bg-app)] text-[var(--text-primary)]' : 'bg-[var(--bg-input)] text-[var(--text-muted)] italic'}
            border border-[var(--border-color)]
            resize-none focus:outline-none overflow-y-auto
          `}
          rows={3}
        />

        {/* 字符计数 */}
        {prompt && (
          <div className="absolute bottom-2 right-2 text-xs text-[var(--text-muted)]">
            {prompt.length} 字符
          </div>
        )}
      </div>

      {/* 提示 */}
      {!prompt && (
        <p className="text-xs text-[var(--text-muted)] mt-2">
          💡 提示：从左侧选择积木块，拖拽到中央画布区域进行组合
        </p>
      )}
    </div>
  );
};

export default PromptPreview;
