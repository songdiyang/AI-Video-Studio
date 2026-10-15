import JSZip from 'jszip';
import { StoryboardScene } from '../useSceneManager';

export type DownloadType = 'images' | 'videos';

/**
 * 批量下载并打包所有图片或视频
 */
export async function batchDownloadMedia(
  scenes: StoryboardScene[],
  type: DownloadType,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  let mediaList: { url: string; filename: string }[] = [];

  // 收集所有媒体文件
  if (type === 'images') {
    scenes.forEach((scene, index) => {
      if (scene.startFrame) {
        mediaList.push({
          url: scene.startFrame,
          filename: `scene_${index + 1}_start.png`
        });
      }
      if (scene.endFrame && scene.hasAction) {
        mediaList.push({
          url: scene.endFrame,
          filename: `scene_${index + 1}_end.png`
        });
      }
    });
  } else {
    scenes.forEach((scene, index) => {
      if (scene.videoUrl) {
        mediaList.push({
          url: scene.videoUrl,
          filename: `scene_${index + 1}.mp4`
        });
      }
    });
  }

  if (mediaList.length === 0) {
    throw new Error(type === 'images' ? '没有可下载的图片' : '没有可下载的视频');
  }

  // 下载并添加到zip
  for (let i = 0; i < mediaList.length; i++) {
    const { url, filename } = mediaList[i];
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      zip.file(filename, blob);
      onProgress?.(i + 1, mediaList.length);
    } catch (error) {
      console.error(`下载失败: ${filename}`, error);
    }
  }

  // 生成zip并下载
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = window.URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `storyboard_${type}_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
