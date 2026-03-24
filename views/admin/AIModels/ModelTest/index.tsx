import React, { useState, useEffect, useRef } from 'react';
import { Button, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip } from '@heroui/react';
import { Play, AlertCircle } from 'lucide-react';
import { AIModel } from '../types';
import DebugPanel from './DebugPanel';
import SimpleMarkdown from './SimpleMarkdown';
import { getAdminAuthHeaders } from '../../../../services/auth';
import { useToast } from '../../../../contexts/ToastContext';

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
  }
};

const ModelTestModal: React.FC<ModelTestModalProps> = ({ isOpen, onClose, model }) => {
  const [paramsInput, setParamsInput] = useState('{}');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { showToast } = useToast();

  // 切换模型时重置
  useEffect(() => {
    if (model) {
      setTestResult(null);
      setTesting(false);
      const defaults = DEFAULT_PARAMS[model.category] || {};
      setParamsInput(JSON.stringify(defaults, null, 2));
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
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                  调用参数 (JSON)
                </label>
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
              </div>

              {/* 执行状态 */}
              {testing && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                      <span className="text-sm text-blue-300">
                        {model.category === 'TEXT' ? '文本生成中...' : model.category === 'IMAGE' ? '图片生成中（含轮询）...' : '视频生成中（含轮询）...'}
                      </span>
                    </div>
                    <Button size="sm" variant="flat" className="bg-red-500/10 text-red-400" onPress={() => { abortRef.current?.abort(); setTesting(false); }}>
                      取消
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {model.category === 'TEXT' ? '通常几秒内完成' : '图片/视频模型会自动轮询直到完成，可能需要数分钟'}
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
                  
                  {/* TEXT 模型：显示文本内容（Markdown 渲染） */}
                  {model.category === 'TEXT' && testResult.result.content && (
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
