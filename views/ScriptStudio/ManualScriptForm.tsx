import React, { useState, useRef } from 'react';
import { Button, Input, Textarea, Select, SelectItem } from '@heroui/react';
import { PenLine, Scissors, Upload } from 'lucide-react';

interface ManualScriptFormProps {
  nextEpisode: number;
  loading: boolean;
  onSave: (title: string, content: string) => void;
  onSplit?: (rawText: string, minutesPerEpisode: number) => void;
  splitLoading?: boolean;
}

const DURATION_OPTIONS = [
  { key: '1', label: '1分钟/集' },
  { key: '3', label: '3分钟/集' },
  { key: '5', label: '5分钟/集' },
  { key: '10', label: '10分钟/集' },
];

const ManualScriptForm: React.FC<ManualScriptFormProps> = ({
  nextEpisode,
  loading,
  onSave,
  onSplit,
  splitLoading = false,
}) => {
  const isFirstEpisode = nextEpisode === 1;
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [minutesPerEpisode, setMinutesPerEpisode] = useState('3');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 拆集门槛：至少能填满1分钟内容（约600字），即可拆集
  const canSplit = onSplit && manualContent.trim().length > 600;

  // 文件导入处理
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setManualContent(text);
      }
    };
    reader.readAsText(file);
    // 重置 input 以支持重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <Input
        label={isFirstEpisode ? "剧本标题" : "本集标题"}
        placeholder={isFirstEpisode ? "输入剧本标题" : `第${nextEpisode}集的标题`}
        value={manualTitle}
        onValueChange={setManualTitle}
        classNames={{
          input: "bg-transparent text-[var(--text-primary)] font-semibold placeholder:text-[var(--text-muted)]",
          label: "text-[var(--text-secondary)] font-medium",
          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--success)]/50 data-[focus=true]:border-[var(--success)] shadow-sm"
        }}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-secondary)] font-medium">剧本内容</span>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.text"
              onChange={handleFileImport}
              className="hidden"
            />
            <Button
              size="sm"
              variant="flat"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] h-7 min-w-0 px-2 text-xs"
              startContent={<Upload className="w-3 h-3" />}
              onPress={() => fileInputRef.current?.click()}
            >
              导入文件
            </Button>
          </div>
        </div>
        <Textarea
          placeholder={`在这里编写或粘贴你的剧本内容...\n\n不要求格式，直接粘贴你的长文本，AI会帮你拆分为多集。\n也可以点击上方「导入文件」按钮导入 .txt 文件。`}
          value={manualContent}
          onValueChange={setManualContent}
          minRows={10}
          classNames={{
            input: "bg-transparent text-[var(--text-primary)] font-medium placeholder:text-[var(--text-muted)]",
            inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--success)]/50 data-[focus=true]:border-[var(--success)] shadow-sm"
          }}
        />
      </div>

      {/* 字数统计 */}
      {manualContent.trim().length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-[var(--text-muted)]">
            {manualContent.trim().length} 字
            {canSplit && ` · 约 ${Math.round(manualContent.trim().length / 600)} 分钟`}
          </span>
        </div>
      )}

      {/* 拆集选项 */}
      {canSplit && (
        <div className="space-y-3 p-4 rounded-xl bg-[var(--bg-input)]/50 border border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-[var(--success)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">智能拆集</span>
            <span className="text-xs text-[var(--text-muted)]">AI 识别高潮点，自动拆分为多集，不增删你的文字</span>
          </div>

          <div className="flex items-end gap-3">
            <Select
              label="每集时长"
              selectedKeys={[minutesPerEpisode]}
              onChange={(e) => setMinutesPerEpisode(e.target.value)}
              classNames={{
                trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-semibold shadow-sm",
                label: "text-[var(--text-secondary)] font-medium",
                value: "text-[var(--text-primary)] font-semibold",
                selectorIcon: "text-[var(--text-secondary)]"
              }}
              popoverProps={{
                classNames: {
                  content: "bg-[var(--bg-card)] border border-[var(--border-color)] shadow-lg"
                }
              }}
              className="flex-1"
            >
              {DURATION_OPTIONS.map(opt => (
                <SelectItem key={opt.key} className="text-[var(--text-primary)] data-[hover=true]:bg-[var(--bg-input)]">
                  {opt.label}
                </SelectItem>
              ))}
            </Select>

            <Button
              className="text-white font-bold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 bg-gradient-to-r from-[var(--success)] to-emerald-500 hover:from-[var(--success)]/80 hover:to-emerald-400 shadow-[var(--success-glow)] min-w-[140px]"
              size="lg"
              startContent={<Scissors className="w-5 h-5" />}
              isLoading={splitLoading}
              isDisabled={!manualContent.trim() || splitLoading}
              onPress={() => onSplit(manualContent.trim(), parseInt(minutesPerEpisode))}
            >
              {splitLoading ? 'AI 分析中...' : '智能拆集'}
            </Button>
          </div>
        </div>
      )}

      {/* 保存为单集按钮 */}
      <Button
        className="w-full font-bold border-2 transition-all duration-200 border-[var(--success)]/40 text-[var(--success)] hover:bg-[var(--success)]/10"
        variant="bordered"
        size="lg"
        startContent={<PenLine className="w-5 h-5" />}
        isLoading={loading}
        isDisabled={!manualContent.trim()}
        onPress={() => onSave(manualTitle, manualContent)}
      >
        {loading ? '保存中...' : `保存为第${nextEpisode}集`}
      </Button>
    </>
  );
};

export default ManualScriptForm;
