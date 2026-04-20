import React, { useState } from 'react';
import { Card, CardBody, Button, Input, Textarea, Select, SelectItem, Spinner } from '@heroui/react';
import { FileText, PenLine, Sparkles, Save, Loader2 } from 'lucide-react';
import ManualScriptForm from './ManualScriptForm';
import PreviousEpisodesRecap, { RecapData } from './PreviousEpisodesRecap';

interface ScriptGeneratorFormProps {
  title: string;
  description: string;
  length: string;
  loading: boolean;
  nextEpisode: number;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLengthChange: (value: string) => void;
  onGenerate: () => void;
  onManualSave: (title: string, content: string) => void;
  // 智能拆集
  onSplit?: (rawText: string, minutesPerEpisode: number) => void;
  splitLoading?: boolean;
  // 新增：生成进度信息
  generationProgress?: {
    step: number;
    totalSteps: number;
    stepName: string;
    progress: number;
  } | null;
  // 新增：前情回顾数据
  recapData?: RecapData | null;
  recapLoading?: boolean;
  // 新增：草稿保存（故事走向就是草稿）
  onSaveDraft?: () => void;
  isSaving?: boolean;
  lastSavedAt?: string | null;
  isDraft?: boolean;
  hasUnsavedChanges?: boolean;
}

const ScriptGeneratorForm: React.FC<ScriptGeneratorFormProps> = ({
  title,
  description,
  length,
  loading,
  nextEpisode,
  onTitleChange,
  onDescriptionChange,
  onLengthChange,
  onGenerate,
  onManualSave,
  onSplit,
  splitLoading = false,
  generationProgress,
  recapData,
  recapLoading,
  onSaveDraft,
  isSaving,
  lastSavedAt,
  isDraft,
  hasUnsavedChanges
}) => {
  const isFirstEpisode = nextEpisode === 1;
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  
  // 格式化保存时间
  const formatSavedTime = (isoString: string | null | undefined) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  return (
    <Card className="pro-card">
      <CardBody className="p-6 space-y-5">
        {/* 标题 + Tab 切换 */}
        <div className="mb-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {isFirstEpisode ? '创作你的故事' : `创作第${nextEpisode}集`}
            </h2>
            <div className="flex bg-[var(--bg-input)] rounded-lg p-0.5 border border-[var(--border-color)]">
              <button
                onClick={() => setMode('ai')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  mode === 'ai'
                    ? 'bg-[var(--accent)]/20 text-[var(--accent-light)] border border-[var(--accent)]/30 shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                AI 生成
              </button>
              <button
                onClick={() => setMode('manual')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  mode === 'manual'
                    ? 'bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <PenLine className="w-3 h-3" />
                手动编写
              </button>
            </div>
          </div>
          <div className={`w-12 h-1 rounded-full ${mode === 'ai' ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)]' : 'bg-gradient-to-r from-[var(--success)] to-emerald-400'}`}></div>
          {mode === 'ai' && !isFirstEpisode && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              AI 将基于前面的剧情继续创作，您的输入会影响剧情走向
            </p>
          )}
          {mode === 'manual' && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              直接编写剧本内容，保存后即可使用
            </p>
          )}
        </div>

        {mode === 'ai' ? (
          <>
            {/* 前情回顾组件 - 仅在非第一集时显示 */}
            {!isFirstEpisode && (
              <PreviousEpisodesRecap 
                recapData={recapData || null} 
                loading={recapLoading} 
              />
            )}

            <Input
              label={isFirstEpisode ? "剧本标题" : "本集标题"}
              placeholder={isFirstEpisode ? "输入你的创意标题" : `第${nextEpisode}集的标题（可选）`}
              value={title}
              onValueChange={onTitleChange}
              classNames={{
                input: "bg-transparent text-[var(--text-primary)] font-semibold placeholder:text-[var(--text-muted)]",
                label: "text-[var(--text-secondary)] font-medium",
                inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 data-[focus=true]:border-[var(--accent)] shadow-sm"
              }}
            />

            <div>
              <Textarea
                label={
                  <div className="flex items-center gap-2 w-full">
                    <span>故事走向</span>
                    {isDraft && (
                      <span className="text-xs px-1.5 py-0.5 bg-[var(--warning)]/20 text-[var(--warning)] border border-[var(--warning)]/30 rounded font-normal">
                        草稿
                      </span>
                    )}
                  </div>
                }
                placeholder={isFirstEpisode 
                  ? "描述你的故事创意..." 
                  : "描述你希望剧情如何发展..."
                }
                value={description}
                onValueChange={onDescriptionChange}
                minRows={4}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)] font-medium placeholder:text-[var(--text-muted)]",
                  label: "text-[var(--text-secondary)] font-medium w-full",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--border-color)] data-[focus=true]:border-[var(--accent)]/50 shadow-sm"
                }}
              />
              {/* 状态/操作栏 - 仅在草稿模式下显示 */}
              {isDraft && (
                <div className="flex items-center justify-between px-1 mt-1.5">
                  <span className="text-xs text-[var(--text-muted)]">
                    {isSaving ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        保存中...
                      </span>
                    ) : hasUnsavedChanges ? (
                      <span className="text-[var(--warning)]">未保存的更改</span>
                    ) : lastSavedAt ? (
                      <span>已自动保存 {formatSavedTime(lastSavedAt)}</span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-2">
                    <kbd className="text-xs text-[var(--text-muted)] bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-1.5 py-0.5 font-mono">
                      Ctrl+S
                    </kbd>
                    <Button
                      size="sm"
                      variant="light"
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] h-6 min-w-0 px-2 text-xs"
                      startContent={<Save className="w-3 h-3" />}
                      isLoading={isSaving}
                      onPress={onSaveDraft}
                    >
                      保存草稿
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2">
              <Select
                label="长度"
                selectedKeys={[length]}
                onChange={(e) => onLengthChange(e.target.value)}
                classNames={{
                  trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-semibold hover:border-[var(--accent)]/50 shadow-sm",
                  label: "text-[var(--text-secondary)] font-medium",
                  value: "text-[var(--text-primary)] font-semibold",
                  selectorIcon: "text-[var(--text-secondary)]"
                }}
                popoverProps={{
                  classNames: {
                    content: "bg-[var(--bg-card)] border border-[var(--border-color)] shadow-lg"
                  }
                }}
              >
                <SelectItem key="短篇" className="text-[var(--text-primary)] data-[hover=true]:bg-[var(--bg-input)]">短篇 (1-3分钟)</SelectItem>
                <SelectItem key="中篇" className="text-[var(--text-primary)] data-[hover=true]:bg-[var(--bg-input)]">中篇 (3-5分钟)</SelectItem>
                <SelectItem key="长篇" className="text-[var(--text-primary)] data-[hover=true]:bg-[var(--bg-input)]">长篇 (5-10分钟)</SelectItem>
              </Select>
            </div>

            <Button
              className="w-full pro-btn-primary transform hover:-translate-y-0.5 transition-all duration-200"
              size="lg"
              startContent={!loading && <FileText className="w-5 h-5" />}
              isLoading={loading}
              onPress={onGenerate}
            >
              {loading 
                ? (generationProgress 
                    ? `${generationProgress.step}/${generationProgress.totalSteps} ${generationProgress.stepName}...` 
                    : '启动生成...'
                  )
                : isDraft ? `基于草稿生成第${nextEpisode}集` : `生成第${nextEpisode}集`
              }
            </Button>
          </>
        ) : (
          <ManualScriptForm
            nextEpisode={nextEpisode}
            loading={loading}
            onSave={onManualSave}
            onSplit={onSplit}
            splitLoading={splitLoading}
          />
        )}
      </CardBody>
    </Card>
  );
};

export default ScriptGeneratorForm;
