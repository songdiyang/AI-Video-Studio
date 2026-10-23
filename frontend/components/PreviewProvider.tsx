import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import Lightbox, { Slide, useLightboxState } from "yet-another-react-lightbox";
import { Download as DownloadIcon, X as CloseIcon } from "lucide-react";
import { WindowControls } from './TitleBar';
import "yet-another-react-lightbox/styles.css";
// Plugins
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Video from "yet-another-react-lightbox/plugins/video";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Download from "yet-another-react-lightbox/plugins/download";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import "yet-another-react-lightbox/plugins/counter.css";

interface PreviewContextType {
  openPreview: (slides: Slide[], index?: number) => void;
  closePreview: () => void;
}

const PreviewContext = createContext<PreviewContextType | undefined>(undefined);

export const usePreview = () => {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error('usePreview must be used within a PreviewProvider');
  }
  return context;
};

interface PreviewProviderProps {
  children: ReactNode;
}

/** 预览工具栏：带中文文字的胶囊按钮 */
const ToolbarTextButton: React.FC<{ onClick: () => void; icon: ReactNode; label: string }> = ({ onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/45 hover:bg-black/70 text-white/90 hover:text-white text-xs font-medium backdrop-blur-sm border border-white/10 transition-colors"
  >
    {icon}
    <span>{label}</span>
  </button>
);

/** 下载按钮：读取当前幻灯片 src 触发下载 */
const LabeledDownloadButton: React.FC = () => {
  const { currentSlide } = useLightboxState();
  const src = (currentSlide as any)?.src as string | undefined;
  const name = (currentSlide as any)?.alt || 'image';
  const handleDownload = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return <ToolbarTextButton onClick={handleDownload} icon={<DownloadIcon size={14} />} label="下载图片" />;
};

export const PreviewProvider: React.FC<PreviewProviderProps> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);

  const openPreview = useCallback((newSlides: Slide[], newIndex: number = 0) => {
    setSlides(newSlides);
    setIndex(newIndex);
    setOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setOpen(false);
  }, []);

  // 预览打开时，Lightbox 会给 #root 加 inert（禁用整棵应用子树），配合全屏遮罩使顶栏与其余部分一并变灰、不可交互。
  // 右上角三个窗口控制按钮（最小化/最大化/关闭）通过 render.controls 注入到遮罩层内（非 inert 子树），保持唯一可交互的窗口级控件。
  const renderWindowControls = useCallback(
    () => (
      <div
        className="fixed top-1 right-2 z-10000 flex items-center"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <WindowControls />
      </div>
    ),
    [],
  );

  return (
    <PreviewContext.Provider value={{ openPreview, closePreview }}>
      {children}
      <Lightbox
        open={open}
        close={closePreview}
        index={index}
        slides={slides}
        on={{
          view: ({ index: newIndex }) => setIndex(newIndex),
        }}
        controller={{ closeOnBackdropClick: true }}
        plugins={[Zoom, Thumbnails, Video, Counter, Download]}
        portal={{ root: document.body }}
        render={{
          controls: renderWindowControls,
          buttonClose: () => (
            <ToolbarTextButton onClick={closePreview} icon={<CloseIcon size={14} />} label="关闭预览" />
          ),
          buttonDownload: () => <LabeledDownloadButton />,
        }}
        zoom={{
          maxZoomPixelRatio: 3,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 2,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
          scrollToZoom: true,
        }}
        video={{
          controls: true,
          autoPlay: true,
          loop: false,
        }}
        styles={{ root: { zIndex: 9999 }, toolbar: { top: '52px' } }}
      />
    </PreviewContext.Provider>
  );
};
