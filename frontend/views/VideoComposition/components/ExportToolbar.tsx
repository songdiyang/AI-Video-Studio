/**
 * 底部导出工具栏（含详细进度 + debug 日志面板）
 */

import React, { useState, useEffect, useRef } from 'react';
import { Button, Progress } from '@heroui/react';
import { Download, Trash2, RotateCcw, ChevronUp, ChevronDown, Bug, CheckCircle2, XCircle, Settings2 } from 'lucide-react';
import type { ExportProgress, ExportOptions } from '../types';
import ExportSettingsPanel from './ExportSettingsPanel';

interface ExportToolbarProps {
  clipCount: number;
  totalDuration: number;
  exportProgress: ExportProgress;
  exportOptions: ExportOptions;
  onExport: () => void;
  onClearTimeline: () => void;
  onOptionsChange: (options: ExportOptions) => void;
}

function useElapsed(startTime?: number, running?: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime || !running) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, running]);
  return elapsed;
}

const ExportToolbar: React.FC<ExportToolbarProps> = ({
  clipCount,
  totalDuration,
  exportProgress,
  exportOptions,
  onExport,
  onClearTimeline,
  onOptionsChange
}) => {
  const isExporting = exportProgress.stage === 'loading' || exportProgress.stage === 'processing';
  const showProgress = exportProgress.stage !== 'idle';
  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsed(exportProgress.startTime, isExporting);

  useEffect(() => {
    if (debugOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debugOpen, exportProgress.debugLogs?.length]);

  const elapsedStr = elapsed > 0 ? `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}` : '';
  const stepStr = exportProgress.currentStep && exportProgress.totalSteps
    ? `[${exportProgress.currentStep}/${exportProgress.totalSteps}]`
    : '';

  return (
    <div className="relative">
      {/* Debug 日志面板（底部上弹） */}
      {debugOpen && exportProgress.debugLogs && exportProgress.debugLogs.length > 0 && (
        <div className="bg-slate-950 border-t border-slate-700/50 max-h-48 overflow-y-auto px-4 py-2 font-mono text-[11px] text-slate-400 leading-relaxed">
          {exportProgress.debugLogs.map((log, i) => (
            <div key={i} className={`${
              log.includes('❌') ? 'text-red-400' :
              log.includes('✅') || log.includes('完成') ? 'text-green-400' :
              log.includes('[ffmpeg]') ? 'text-slate-600' :
              'text-slate-400'
            }`}>
              {log}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* 主工具栏 */}
      <div className="bg-slate-900/80 border-t border-slate-700/50 px-4 py-2.5 flex items-center justify-between gap-3">
        {/* 左侧：信息 + 进度 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xs text-slate-500 flex-shrink-0">
            {clipCount} 个片段 · {formatDuration(totalDuration)}
          </span>

          {showProgress && (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {/* 进度条 */}
              {isExporting && (
                <Progress
                  size="sm"
                  value={exportProgress.percent}
                  className="max-w-[140px] flex-shrink-0"
                  classNames={{ indicator: "bg-blue-600" }}
                  aria-label="导出进度"
                />
              )}

              {/* 状态图标 */}
              {exportProgress.stage === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
              {exportProgress.stage === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}

              {/* 文字信息 */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  {stepStr && <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">{stepStr}</span>}
                  <span className={`text-xs font-medium truncate ${
                    exportProgress.stage === 'done' ? 'text-green-400' :
                    exportProgress.stage === 'error' ? 'text-red-400' :
                    'text-blue-400'
                  }`}>
                    {exportProgress.message}
                  </span>
                  {isExporting && elapsedStr && (
                    <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">{elapsedStr}</span>
                  )}
                </div>
                {exportProgress.detail && (
                  <span className="text-[10px] text-slate-500 truncate">{exportProgress.detail}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：按钮 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 设置按钮 */}
          {!isExporting && clipCount > 0 && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className="text-slate-400 hover:text-blue-400"
              onPress={() => setSettingsOpen(true)}
              title="导出设置"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Debug 按钮 */}
          {showProgress && exportProgress.debugLogs && exportProgress.debugLogs.length > 0 && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className={`${debugOpen ? 'text-amber-400' : 'text-slate-500'} hover:text-amber-300`}
              onPress={() => setDebugOpen(v => !v)}
              title={debugOpen ? '收起日志' : '展开 Debug 日志'}
            >
              {debugOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <Bug className="w-3.5 h-3.5" />}
            </Button>
          )}

          {clipCount > 0 && (
            <Button
              size="sm"
              variant="flat"
              className="bg-slate-800/60 text-slate-400 font-medium"
              startContent={<Trash2 className="w-3.5 h-3.5" />}
              onPress={onClearTimeline}
              isDisabled={isExporting}
            >
              清空
            </Button>
          )}

          <Button
            size="sm"
            className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold"
            startContent={isExporting ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            onPress={onExport}
            isDisabled={clipCount === 0 || isExporting}
          >
            {isExporting ? '导出中...' : '导出合成视频'}
          </Button>
        </div>
      </div>

      {/* 导出设置面板 */}
      <ExportSettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        options={exportOptions}
        onChange={onOptionsChange}
      />
    </div>
  );
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default ExportToolbar;
