import React, { useState } from 'react';
import { Card, CardBody, Button, Accordion, AccordionItem } from '@heroui/react';
import { ChevronDown, ChevronUp, BookOpen, Clock, FileText } from 'lucide-react';

// 类型定义
export interface EpisodeRecap {
  episodeNumber: number;
  title: string;
  content: string;
  isFullContent: boolean;
  isTruncated: boolean;
  originalLength: number;
  updatedAt: string;
}

export interface RecapData {
  hasRecap: boolean;
  targetEpisode: number;
  totalPreviousEpisodes: number;
  fullContentCount: number;
  summaryCount: number;
  episodes: EpisodeRecap[];
  lastEpisode: {
    episodeNumber: number;
    title: string;
    briefSummary: string;
  } | null;
  message?: string;
}

interface PreviousEpisodesRecapProps {
  recapData: RecapData | null;
  loading?: boolean;
}

const PreviousEpisodesRecap: React.FC<PreviousEpisodesRecapProps> = ({
  recapData,
  loading = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 加载中状态
  if (loading) {
    return (
      <Card className="pro-card mb-4">
        <CardBody className="p-4">
          <div className="flex items-center gap-2 text-(--text-secondary)">
            <div className="w-4 h-4 border-2 border-(--text-secondary) border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">加载前情回顾...</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  // 没有前情回顾数据
  if (!recapData || !recapData.hasRecap || recapData.episodes.length === 0) {
    return null;
  }

  const { lastEpisode, episodes, totalPreviousEpisodes, fullContentCount, summaryCount } = recapData;

  return (
    <Card className="bg-linear-to-br from-(--warning)/10 to-orange-900/10 border border-(--warning)/20 rounded-xl mb-4 overflow-hidden">
      <CardBody className="p-0">
        {/* 折叠头部 - 始终显示 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-start justify-between hover:bg-(--warning)/5 transition-colors"
        >
          <div className="flex items-start gap-3 text-left">
            <div className="p-2 bg-(--warning)/20 rounded-lg">
              <BookOpen className="w-4 h-4 text-(--warning)" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-(--warning)">前情回顾</h4>
                <span className="text-xs text-(--text-muted) bg-(--bg-input) px-2 py-0.5 rounded-full">
                  {totalPreviousEpisodes} 集
                </span>
              </div>
              {lastEpisode && !isExpanded && (
                <div className="text-xs text-(--text-secondary)">
                  <span className="text-(--warning) font-medium">上一集「{lastEpisode.title}」：</span>
                  <span className="text-(--text-muted) line-clamp-2">{lastEpisode.briefSummary}</span>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 p-1">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-(--text-secondary)" />
            ) : (
              <ChevronDown className="w-4 h-4 text-(--text-secondary)" />
            )}
          </div>
        </button>

        {/* 展开内容 */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-(--warning)/10">
            {/* 统计信息 */}
            <div className="flex items-center gap-4 py-3 text-xs text-(--text-muted)">
              <div className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <span>完整内容: {fullContentCount} 集</span>
              </div>
              {summaryCount > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>摘要: {summaryCount} 集</span>
                </div>
              )}
            </div>

            {/* 各集内容 - 使用 Accordion */}
            <Accordion 
              variant="splitted" 
              className="px-0 gap-2"
              itemClasses={{
                base: "bg-(--bg-input) border border-(--border-color) rounded-lg",
                title: "text-sm font-medium text-(--text-primary)",
                trigger: "px-3 py-2 hover:bg-(--bg-card-hover)",
                content: "px-3 pb-3 text-sm"
              }}
            >
              {episodes.map((episode) => (
                <AccordionItem
                  key={episode.episodeNumber}
                  aria-label={`第${episode.episodeNumber}集`}
                  title={
                    <div className="flex items-center justify-between w-full">
                      <span>
                        第{episode.episodeNumber}集：{episode.title}
                      </span>
                      <div className="flex items-center gap-2">
                        {!episode.isFullContent && (
                          <span className="text-xs text-(--warning) bg-(--warning)/10 px-2 py-0.5 rounded">
                            摘要
                          </span>
                        )}
                        <span className="text-xs text-(--text-muted)">
                          {episode.originalLength} 字
                        </span>
                      </div>
                    </div>
                  }
                >
                  <div className="text-(--text-secondary) whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto custom-scrollbar">
                    {episode.content}
                    {episode.isTruncated && (
                      <span className="text-(--warning) text-xs ml-1">
                        （内容已截断，AI生成时将使用完整摘要）
                      </span>
                    )}
                  </div>
                </AccordionItem>
              ))}
            </Accordion>

            {/* 提示信息 */}
            <p className="text-xs text-(--text-muted) mt-3 px-1">
              AI 将基于以上剧情继续创作，保持人物、情节、风格的连贯性
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export default PreviousEpisodesRecap;
