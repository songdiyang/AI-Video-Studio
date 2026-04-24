import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip, Select, SelectItem, Input, Switch } from '@heroui/react';
import { Play, AlertCircle, Code2, Eye, Film, Clock, Monitor } from 'lucide-react';
import { AIModel } from '../types';
import DebugPanel from './DebugPanel';
import SimpleMarkdown from './SimpleMarkdown';
import { getAdminAuthHeaders } from '../../../../services/auth';
import { useToast } from '../../../../contexts/ToastContext';
import { ASPECT_RATIO_PRESETS, DURATION_PRESETS, VIDEO_RESOLUTION_PRESETS } from '../types';

interface ModelTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: AIModel | null;
}

const DEFAULT_PARAMS: Record<string, any> = {
  TEXT: {
    prompt: "你好，请简单介绍一下自己。",
    temperature: 0.7
  },
  IMAGE: {
    prompt: "A cute cat sitting on a windowsill, watercolor style",
    width: 1024,
    height: 1024
  },
  VIDEO: {
    prompt: "A cat walking slowly",
    duration: 5
  },
  MULTIMODAL: {
    prompt: "请分析这张图片的内容，描述画面中的主要元素、色彩风格和氛围。",
    temperature: 0.7,
    top_p: 0.9
  }
};

// 检测 Seedream 版本
const isSeedream45 = (modelName: string) => /seedream[-_]?(4[-_]?5|4\.5)/i.test(modelName);
const isSeedream50 = (modelName: string) => /seedream[-_]?(5[-_]?0|5\.0)/i.test(modelName);

// 根据模型动态获取默认参数
const getDefaultParams = (category: string, modelName: string) => {
  const base = { ...DEFAULT_PARAMS[category] };
  if (category === 'IMAGE') {
    if (isSeedream50(modelName)) {
      // Seedream 5.0 系列使用 '2k' 预设值
      delete base.width;
      delete base.height;
      base.size = '2k';
    } else if (isSeedream45(modelName)) {
      // Seedream 4.5 使用 1920x1920
      base.width = 1920;
      base.height = 1920;
    }
  }
  return base;
};

const ModelTestModal: React.FC<ModelTestModalProps> = ({ isOpen, onClose, model }) => {
  const [paramsInput, setParamsInput] = useState('{}');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { showToast } = useToast();

  // 视频可视化参数
  const [videoPrompt, setVideoPrompt] = useState('A cat walking slowly');
  const [videoDuration, setVideoDuration] = useState('5');
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
  const [videoResolution, setVideoResolution] = useState('1080p');

  // 模型支持的参数选项
  const supportedAspectRatios = useMemo(() => {
    if (!model?.supported_aspect_ratios) return ASPECT_RATIO_PRESETS.map(p => p.value);
    const raw = typeof model.supported_aspect_ratios === 'string'
      ? JSON.parse(model.supported_aspect_ratios || '[]')
      : model.supported_aspect_ratios;
    return Array.isArray(raw) && raw.length > 0 ? raw.map((r: any) => typeof r === 'string' ? r : r.value) : ASPECT_RATIO_PRESETS.map(p => p.value);
  }, [model]);

  const supportedDurations = useMemo(() => {
    if (!model?.supported_durations) return DURATION_PRESETS.map(p => p.value);
    const raw = typeof model.supported_durations === 'string'
      ? JSON.parse(model.supported_durations || '[]')
      : model.supported_durations;
    return Array.isArray(raw) && raw.length > 0 ? raw.map((d: any) => typeof d === 'number' ? d : d.value) : DURATION_PRESETS.map(p => p.value);
  }, [model]);

  const supportedResolutions = useMemo(() => {
    try {
      const raw = model?.supported_resolutions;
      if (!raw) return [];
      const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
      return Array.isArray(arr) ? arr.map((r: any) => typeof r === 'string' ? r : r.value) : [];
    } catch { return []; }
  }, [model]);

  // 同步可视化参数到 JSON
  const syncVisualToJson = () => {
    if (!model || model.category !== 'VIDEO') return;
    const params: any = { prompt: videoPrompt, duration: Number(videoDuration) };
    if (videoAspectRatio) params.aspectRatio = videoAspectRatio;
    if (videoResolution && supportedResolutions.length > 0) params.resolution = videoResolution;
    setParamsInput(JSON.stringify(params, null, 2));
  };

  useEffect(() => {
    if (!advancedMode && model?.category === 'VIDEO') {
      syncVisualToJson();
    }
  }, [videoPrompt, videoDuration, videoAspectRatio, videoResolution, advancedMode]);

  // 切换模型时重置
  useEffect(() => {
    if (model) {
      setTestResult(null);
      setTesting(false);
      setAdvancedMode(false);
      const defaults = getDefaultParams(model.category, model.name);
      setParamsInput(JSON.stringify(defaults, null, 2));
      // 重置视频可视化参数
      if (model.category === 'VIDEO') {
        setVideoPrompt(defaults.prompt || 'A cat walking slowly');
        setVideoDuration(String(defaults.duration || 5));
        if (supportedAspectRatios.length > 0) setVideoAspectRatio(supportedAspectRatios[0]);
        if (supportedResolutions.length > 0) setVideoResolution(supportedResolutions[0]);
      }
    }
  }, [model?.id]);

  const handleTest = async () => {
    if (!model) return;
    let params: any;
    try {
      params = JSON.parse(paramsInput);
    } catch {
      showToast('参数 JSON 格式错误', 'error');
      return;
    }

    setTestResult(null);
    setTesting(true);

    // 支持取消请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/admin/ai-models/${model.id}/test-handler`, {
        method: 'POST',
        headers: getAdminAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ params }),
        signal: controller.signal
      });

      const data = await res.json();

      if (data.success) {
        setTestResult({
          result: data.result,
          category: data.category,
          elapsed: data.elapsed
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || '测试失败'
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      setTestResult({ success: false, message: error.message || '请求失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setTesting(false);
    onClose();
  };

  if (!model) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="full" scrollBehavior="inside">
      <ModalContent className="bg-slate-900/95 backdrop-blur-xl">
        <ModalHeader className="flex items-center gap-3 text-slate-100 border-b border-slate-700/50">
          <Play className="w-5 h-5 text-green-400" />
          <span>调试模型：{model.name}</span>
          <Chip size="sm" className="bg-blue-500/10 text-blue-400">{model.category}</Chip>
          <Chip size="sm" className="bg-slate-800/60 text-slate-400">{model.provider}</Chip>
        </ModalHeader>
        <ModalBody className="p-0">
          <div className="flex h-[calc(100vh-200px)]">
            {/* 左侧：参数输入和结果预览 */}
            <div className="w-1/2 border-r border-slate-700/50 p-6 space-y-4 overflow-y-auto">
              {/* 参数输入 */}
              <div>
                {/* 视频模型可视化模式切换 */}
                {model.category === 'VIDEO' && (
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-slate-300">
                      调用参数
                    </label>
                    <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-1 border border-slate-700/50">
                      <Eye className={`w-3.5 h-3.5 ${!advancedMode ? 'text-blue-400' : 'text-slate-500'}`} />
                      <Switch
                        size="sm"
                        isSelected={advancedMode}
                        onValueChange={setAdvancedMode}
                        classNames={{ wrapper: "group-data-[selected]:bg-amber-500" }}
                      />
                      <Code2 className={`w-3.5 h-3.5 ${advancedMode ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className="text-xs text-slate-400">{advancedMode ? 'JSON' : '可视化'}</span>
                    </div>
                  </div>
                )}

                {/* VIDEO 可视化输入 */}
                {model.category === 'VIDEO' && !advancedMode ? (
                  <div className="space-y-3">
                    <Textarea
                      label="提示词"
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      minRows={3}
                      maxRows={6}
                      classNames={{
                        inputWrapper: "bg-slate-800/60 border-2 border-slate-600/50"
                      }}
                      placeholder="描述你想生成的视频内容..."
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        label="视频时长"
                        selectedKeys={[videoDuration]}
                        onChange={(e) => setVideoDuration(e.target.value)}
                        startContent={<Clock className="w-4 h-4 text-blue-400" />}
                        classNames={{
                          trigger: "bg-slate-800/60 border-slate-600/50",
                          label: "text-slate-400",
                          value: "text-slate-200"
                        }}
                      >
                        {supportedDurations.map((d: number) => (
                          <SelectItem key={String(d)}>{d}秒</SelectItem>
                        ))}
                      </Select>
                      <Select
                        label="长宽比"
                        selectedKeys={[videoAspectRatio]}
                        onChange={(e) => setVideoAspectRatio(e.target.value)}
                        startContent={<Film className="w-4 h-4 text-purple-400" />}
                        classNames={{
                          trigger: "bg-slate-800/60 border-slate-600/50",
                          label: "text-slate-400",
                          value: "text-slate-200"
                        }}
                      >
                        {supportedAspectRatios.map((r: string) => {
                          const preset = ASPECT_RATIO_PRESETS.find(p => p.value === r);
                          return <SelectItem key={r}>{preset?.label || r}</SelectItem>;
                        })}
                      </Select>
                    </div>
                    {supportedResolutions.length > 0 && (
                      <Select
                        label="分辨率"
                        selectedKeys={[videoResolution]}
                        onChange={(e) => setVideoResolution(e.target.value)}
                        startContent={<Monitor className="w-4 h-4 text-emerald-400" />}
                        classNames={{
                          trigger: "bg-slate-800/60 border-slate-600/50",
                          label: "text-slate-400",
                          value: "text-slate-200"
                        }}
                      >
                        {supportedResolutions.map((r: string) => {
                          const preset = VIDEO_RESOLUTION_PRESETS.find(p => p.value === r);
                          return <SelectItem key={r}>{preset ? `${preset.label} (${preset.width}×${preset.height})` : r}</SelectItem>;
                        })}
                      </Select>
                    )}
                    <p className="text-xs text-slate-500">实际 JSON 参数已自动同步，切换到 JSON 模式可查看</p>
                  </div>
                ) : (
                  /* 原始 JSON 编辑器 */
                  <>
                    {model.category !== 'VIDEO' && (
                      <label className="text-sm font-medium text-slate-300 mb-2 block">
                        调用参数 (JSON)
                      </label>
                    )}
                    <Textarea
                      value={paramsInput}
                      onChange={(e) => setParamsInput(e.target.value)}
                      minRows={8}
                      maxRows={15}
                      classNames={{
                        input: "font-mono text-xs",
                        inputWrapper: "bg-slate-800/60 border-2 border-slate-600/50"
                      }}
                      placeholder='{"prompt": "...", "title": "..."}'
                    />
                  </>
                )}
              </div>

              {/* 执行状态 */}
              {testing && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                      <span className="text-sm text-blue-300">
                        {model.category === 'TEXT' ? '文本生成中...' : model.category === 'IMAGE' ? '图片生成中（含轮询）...' : model.category === 'MULTIMODAL' ? '多模态理解中...' : '视频生成中（含轮询）...'}
                      </span>
                    </div>
                    <Button size="sm" variant="flat" className="bg-red-500/10 text-red-400" onPress={() => { abortRef.current?.abort(); setTesting(false); }}>
                      取消
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {model.category === 'TEXT' || model.category === 'MULTIMODAL' ? '通常几秒内完成' : '图片/视频模型会自动轮询直到完成，可能需要数分钟'}
                  </p>
                </div>
              )}

              {/* 结果预览 */}
              {testResult && testResult.result && (
                <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-300">结果预览</h3>
                    {testResult.elapsed && (
                      <span className="text-xs text-slate-500">耗时: {(testResult.elapsed / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  
                  {/* TEXT / MULTIMODAL 模型：显示文本内容（Markdown 渲染） */}
                  {(model.category === 'TEXT' || model.category === 'MULTIMODAL') && testResult.result.content && (
                    <div className="bg-slate-800/40 rounded p-3 border border-slate-700/50 max-h-96 overflow-auto">
                      <SimpleMarkdown content={testResult.result.content} />
                    </div>
                  )}

                  {/* IMAGE 模型：显示图片 */}
                  {model.category === 'IMAGE' && testResult.result.image_url && (
                    <div className="bg-slate-800/40 rounded p-3 border border-slate-700/50">
                      <img 
                        src={testResult.result.image_url} 
                        alt="生成结果" 
                        className="max-w-full rounded" 
                      />
                    </div>
                  )}

                  {/* VIDEO 模型：显示视频 */}
                  {model.category === 'VIDEO' && testResult.result.video_url && (
                    <div className="bg-slate-800/40 rounded p-3 border border-slate-700/50">
                      <video 
                        src={testResult.result.video_url} 
                        controls 
                        className="max-w-full rounded" 
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 错误信息 */}
              {testResult && !testResult.result && testResult.message && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-medium text-red-400">测试失败</span>
                  </div>
                  <p className="text-sm text-red-300">{testResult.message}</p>
                </div>
              )}
            </div>

            {/* 右侧：详细调试信息 */}
            <div className="w-1/2 bg-slate-900/40">
              <DebugPanel testResult={testResult} model={model} />
            </div>
          </div>
        </ModalBody>
        <ModalFooter className="border-t border-slate-700/50">
          <Button variant="flat" className="bg-slate-800/60 text-slate-300" onPress={handleClose}>
            关闭
          </Button>
          <Button
            className="bg-gradient-to-r from-emerald-500 to-green-600 text-white"
            onPress={handleTest}
            isLoading={testing}
            startContent={!testing && <Play className="w-4 h-4" />}
            isDisabled={testing}
          >
            {testing ? '测试中...' : '发送测试'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ModelTestModal;
