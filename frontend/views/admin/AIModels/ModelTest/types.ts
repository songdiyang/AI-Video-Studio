export interface TestResult {
  success: boolean;
  category?: string;
  elapsed?: number;
  result?: any;
  hasQueryConfig?: boolean;
  message?: string;
  error?: string;
}

export interface QueryResult {
  success: boolean;
  result?: any;
  raw?: any;
  message?: string;
}

// 从结果中提取图片/视频 URL
export function extractMediaUrl(result: any): string | null {
  if (!result) return null;
  const raw = result._raw || result;
  
  const paths = [
    raw?.data?.task_result?.images?.[0]?.url,
    raw?.data?.task_result?.videos?.[0]?.url,
    raw?.data?.result?.image_url,
    raw?.data?.result?.video_url,
    raw?.data?.image_url,
    raw?.data?.video_url,
    raw?.output?.image_url,
    raw?.output?.video_url,
    result?.imageUrl,
    result?.videoUrl,
    result?.url,
  ];
  
  return paths.find(p => p && typeof p === 'string') || null;
}
