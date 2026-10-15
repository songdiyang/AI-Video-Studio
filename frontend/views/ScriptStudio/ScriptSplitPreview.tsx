import React from 'react';
import { Button, Card, CardBody, Chip } from '@heroui/react';
import { Check, X, Clock, FileText, ChevronDown, ChevronUp } from 'lucide-react';

export interface SplitEpisode {
  episodeNumber: number;
  title: string;
  content: string;
  charCount: number;
  estimatedMinutes: number;
}

interface ScriptSplitPreviewProps {
  episodes: SplitEpisode[];
  onConfirm: (episodes: SplitEpisode[]) => void;
  onCancel: () => void;
  isCreating?: boolean;
}

const ScriptSplitPreview: React.FC<ScriptSplitPreviewProps> = ({
  episodes,
  onConfirm,
  onCancel,
  isCreating = false,
}) => {
  const [expandedEpisodes, setExpandedEpisodes] = React.useState<Set<number>>(new Set());

  const toggleExpand = (num: number) => {
    setExpandedEpisodes(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const totalChars = episodes.reduce((sum, e) => sum + e.charCount, 0);
  const totalMinutes = episodes.reduce((sum, e) => sum + e.estimatedMinutes, 0);

  return (
    <div className="space-y-4">
      {/* 汇总信息 */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)]">
        <div className="flex items-center gap-4">
          <Chip
            size="sm"
            variant="flat"
            className="bg-[var(--success)]/20 text-[var(--success)]"
          >
            {episodes.length} 集
          </Chip>
          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {totalChars.toLocaleString()} 字
          </span>
          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            约 {totalMinutes.toFixed(1)} 分钟
          </span>
        </div>
      </div>

      {/* 每集预览列表 */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {episodes.map((episode) => {
          const isExpanded = expandedEpisodes.has(episode.episodeNumber);
          const preview = episode.content.substring(0, 50);
          const tailPreview = episode.content.substring(episode.content.length - 30);

          return (
            <Card
              key={episode.episodeNumber}
              className="border border-[var(--border-color)] bg-[var(--bg-card)]"
            >
              <CardBody className="p-3">
                {/* 标题行 */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleExpand(episode.episodeNumber)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--success)] bg-[var(--success)]/15 px-2 py-0.5 rounded">
                      第{episode.episodeNumber}集
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {episode.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-muted)]">
                      {episode.charCount.toLocaleString()} 字 · {episode.estimatedMinutes.toFixed(1)} 分钟
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                    )}
                  </div>
                </div>

                {/* 内容预览 */}
                {!isExpanded && (
                  <p className="text-xs text-[var(--text-muted)] mt-1.5 line-clamp-1">
                    {preview}...{tailPreview}
                  </p>
                )}

                {/* 展开内容 */}
                {isExpanded && (
                  <div className="mt-2 p-2 rounded bg-[var(--bg-input)] text-xs text-[var(--text-secondary)] max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                    {episode.content}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <Button
          className="flex-1 text-white font-bold shadow-lg bg-gradient-to-r from-[var(--success)] to-emerald-500 hover:from-[var(--success)]/80 hover:to-emerald-400"
          size="lg"
          startContent={<Check className="w-5 h-5" />}
          isLoading={isCreating}
          onPress={() => onConfirm(episodes)}
        >
          {isCreating ? '创建中...' : `确认创建 ${episodes.length} 集`}
        </Button>
        <Button
          variant="bordered"
          className="font-bold border-[var(--border-color)] text-[var(--text-secondary)]"
          size="lg"
          startContent={<X className="w-5 h-5" />}
          isDisabled={isCreating}
          onPress={onCancel}
        >
          取消
        </Button>
      </div>
    </div>
  );
};

export default ScriptSplitPreview;
