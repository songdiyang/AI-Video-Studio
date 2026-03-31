import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, GitCompare, Zap } from 'lucide-react';

interface FrameCompareProps {
  version1Url: string;
  version2Url: string;
  version1Label?: string;
  version2Label?: string;
  onClose: () => void;
}

const FrameCompare: React.FC<FrameCompareProps> = ({
  version1Url,
  version2Url,
  version1Label = '版本 1',
  version2Label = '版本 2',
  onClose
}) => {
  const [compareMode, setCompareMode] = useState<'side' | 'slider' | 'diff'>('slider');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [diffOpacity, setDiffOpacity] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 计算差异（简单的像素差异）
  const [diffCanvas, setDiffCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (compareMode === 'diff') {
      calculateDiff();
    }
  }, [compareMode, version1Url, version2Url]);

  const calculateDiff = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img1 = new Image();
    const img2 = new Image();

    img1.crossOrigin = 'anonymous';
    img2.crossOrigin = 'anonymous';

    await Promise.all([
      new Promise((resolve) => {
        img1.onload = resolve;
        img1.src = version1Url;
      }),
      new Promise((resolve) => {
        img2.onload = resolve;
        img2.src = version2Url;
      })
    ]);

    canvas.width = Math.max(img1.width, img2.width);
    canvas.height = Math.max(img1.height, img2.height);

    // 绘制第一张图
    ctx.drawImage(img1, 0, 0);
    const imageData1 = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 绘制第二张图
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img2, 0, 0);
    const imageData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 计算差异
    const diffData = ctx.createImageData(canvas.width, canvas.height);
    const threshold = 30; // 差异阈值

    for (let i = 0; i < imageData1.data.length; i += 4) {
      const diff = Math.abs(imageData1.data[i] - imageData2.data[i]) +
                   Math.abs(imageData1.data[i + 1] - imageData2.data[i + 1]) +
                   Math.abs(imageData1.data[i + 2] - imageData2.data[i + 2]);

      if (diff > threshold) {
        // 差异区域用红色高亮
        diffData.data[i] = 255;     // R
        diffData.data[i + 1] = 0;   // G
        diffData.data[i + 2] = 0;   // B
        diffData.data[i + 3] = 200; // Alpha
      } else {
        diffData.data[i + 3] = 0; // 透明
      }
    }

    ctx.putImageData(diffData, 0, 0);
    setDiffCanvas(canvas);
  };

  const handleSliderMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const position = ((x - rect.left) / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, position)));
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleSliderMove as any);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleSliderMove as any);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleSliderMove as any);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleSliderMove as any);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        className="bg-[var(--bg-card)] rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <GitCompare className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-lg font-semibold">帧对比</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-input)] rounded">
            <span className="text-xl">×</span>
          </button>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-2 p-3 border-b border-[var(--border-color)] bg-[var(--bg-app)]">
          <button
            onClick={() => setCompareMode('side')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              compareMode === 'side'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Eye className="w-3 h-3 inline mr-1" />
            并排对比
          </button>
          <button
            onClick={() => setCompareMode('slider')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              compareMode === 'slider'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Zap className="w-3 h-3 inline mr-1" />
            滑动对比
          </button>
          <button
            onClick={() => setCompareMode('diff')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              compareMode === 'diff'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <GitCompare className="w-3 h-3 inline mr-1" />
            差异高亮
          </button>

          {compareMode === 'diff' && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs text-[var(--text-muted)]">差异透明度:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={diffOpacity * 100}
                onChange={(e) => setDiffOpacity(parseInt(e.target.value) / 100)}
                className="w-32"
              />
            </div>
          )}
        </div>

        {/* 对比区域 */}
        <div className="relative p-4 overflow-hidden" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {compareMode === 'side' && (
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="bg-[var(--bg-app)] rounded-lg overflow-hidden">
                <div className="p-2 text-center text-xs font-medium bg-[var(--bg-card)] border-b border-[var(--border-color)]">
                  {version1Label}
                </div>
                <img src={version1Url} alt={version1Label} className="w-full h-full object-contain" />
              </div>
              <div className="bg-[var(--bg-app)] rounded-lg overflow-hidden">
                <div className="p-2 text-center text-xs font-medium bg-[var(--bg-card)] border-b border-[var(--border-color)]">
                  {version2Label}
                </div>
                <img src={version2Url} alt={version2Label} className="w-full h-full object-contain" />
              </div>
            </div>
          )}

          {compareMode === 'slider' && (
            <div
              ref={containerRef}
              className="relative w-full h-full bg-[var(--bg-app)] rounded-lg overflow-hidden cursor-col-resize"
              onMouseDown={handleMouseDown}
              onTouchStart={handleMouseDown}
            >
              {/* 底层图片（版本 2） */}
              <img src={version2Url} alt={version2Label} className="absolute w-full h-full object-contain" />

              {/* 顶层图片（版本 1，可裁剪） */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPosition}%` }}
              >
                <img
                  src={version1Url}
                  alt={version1Label}
                  className="absolute w-full h-full object-contain"
                  style={{ width: containerRef.current?.offsetWidth }}
                />
              </div>

              {/* 滑动条 */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white cursor-col-resize shadow-lg"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none">
                    <path d="M8 4L16 12L8 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 4L8 12L16 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          )}

          {compareMode === 'diff' && diffCanvas && (
            <div className="relative w-full h-full">
              <img src={version1Url} alt={version1Label} className="absolute w-full h-full object-contain" />
              <img
                src={diffCanvas.toDataURL()}
                alt="差异图"
                className="absolute w-full h-full object-contain"
                style={{ opacity: diffOpacity }}
              />
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <div className="p-3 border-t border-[var(--border-color)] bg-[var(--bg-app)] text-xs text-[var(--text-muted)]">
          提示：{
            compareMode === 'side' ? '并排查看两个版本的差异' :
            compareMode === 'slider' ? '拖动滑块对比两个版本' :
            '红色区域表示差异部分'
          }
        </div>
      </motion.div>
    </motion.div>
  );
};

export default FrameCompare;
