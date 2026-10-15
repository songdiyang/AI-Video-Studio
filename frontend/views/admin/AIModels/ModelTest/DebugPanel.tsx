import React from 'react';
import { Code2, ArrowRight, CheckCircle, XCircle } from 'lucide-react';

interface DebugPanelProps {
  testResult: any;
  model: any;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ testResult, model }) => {
  if (!testResult) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <div className="text-center">
          <Code2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">点击"发送测试"查看详细信息</p>
        </div>
      </div>
    );
  }

  const result = testResult.result;
  const rawData = result?._raw || {};
  const modelInfo = result?._model || {};

  return (
    <div className="h-full overflow-y-auto space-y-4 p-4 bg-slate-900/40">
      {/* 状态标题 */}
      <div className={`flex items-center gap-2 p-3 rounded-lg ${
        result ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'
      }`}>
        {result ? (
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        ) : (
          <XCircle className="w-5 h-5 text-red-400" />
        )}
        <span className={`font-semibold ${result ? 'text-emerald-400' : 'text-red-400'}`}>
          {result ? '请求成功' : '请求失败'}
        </span>
      </div>

      {/* 模型信息 */}
      {modelInfo.provider && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Code2 className="w-4 h-4" />
            模型信息
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Provider:</span>
              <span className="font-mono text-slate-300">{modelInfo.provider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Model Name:</span>
              <span className="font-mono text-slate-300">{modelInfo.name || model.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Category:</span>
              <span className="font-mono text-slate-300">{modelInfo.category || model.category}</span>
            </div>
          </div>
        </div>
      )}

      {/* 请求信息 */}
      {rawData.request && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-blue-600" />
            请求信息
          </h3>
          
          {/* 请求 URL */}
          <div className="mb-3">
            <p className="text-xs text-slate-500 mb-1">URL:</p>
            <div className="bg-slate-800/40 rounded p-2 border border-slate-700/50">
              <code className="text-xs text-slate-300 break-all">{rawData.request.url}</code>
            </div>
          </div>

          {/* 请求头 */}
          {rawData.request.headers && (
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-1">Headers:</p>
              <div className="bg-slate-800/40 rounded p-2 border border-slate-700/50">
                <pre className="text-xs text-slate-300 overflow-x-auto">
                  {JSON.stringify(rawData.request.headers, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* 请求体 */}
          {rawData.request.body && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Body:</p>
              <div className="bg-slate-800/40 rounded p-2 border border-slate-700/50 max-h-64 overflow-auto">
                <pre className="text-xs text-slate-300">
                  {JSON.stringify(rawData.request.body, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 响应信息 */}
      <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-green-400 rotate-180" />
          响应信息
        </h3>

        {/* 响应头 */}
        {rawData.headers && (
          <div className="mb-3">
            <p className="text-xs text-slate-500 mb-1">Headers:</p>
            <div className="bg-slate-800/40 rounded p-2 border border-slate-700/50">
              <pre className="text-xs text-slate-300 overflow-x-auto">
                {JSON.stringify(rawData.headers, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* 原始响应体 */}
        <div>
          <p className="text-xs text-slate-500 mb-1">Raw Response:</p>
          <div className="bg-slate-800 rounded p-3 border border-slate-700 max-h-96 overflow-auto">
            <pre className="text-xs text-slate-100">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* 处理后的结果 */}
      <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-purple-400" />
          处理结果
        </h3>
        
        {/* 映射后的数据 */}
        <div className="space-y-2 text-xs mb-3">
          {result?.content && (
            <div>
              <span className="text-slate-500">Content:</span>
              <div className="mt-1 bg-slate-800/40 rounded p-2 border border-slate-700/50 max-h-32 overflow-auto">
                <p className="text-slate-300 whitespace-pre-wrap">{result.content}</p>
              </div>
            </div>
          )}
          {result?.image_url && (
            <div>
              <span className="text-slate-500">Image URL:</span>
              <div className="mt-1 bg-slate-800/40 rounded p-2 border border-slate-700/50">
                <code className="text-slate-700 text-xs break-all">{result.image_url}</code>
              </div>
            </div>
          )}
          {result?.video_url && (
            <div>
              <span className="text-slate-500">Video URL:</span>
              <div className="mt-1 bg-slate-800/40 rounded p-2 border border-slate-700/50">
                <code className="text-slate-700 text-xs break-all">{result.video_url}</code>
              </div>
            </div>
          )}
          {result?.tokens !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-500">Tokens:</span>
              <span className="font-mono text-slate-300">{result.tokens}</span>
            </div>
          )}
          {result?.taskId && (
            <div className="flex justify-between">
              <span className="text-slate-500">Task ID:</span>
              <span className="font-mono text-slate-300">{result.taskId}</span>
            </div>
          )}
        </div>

        {/* 完整映射结果 */}
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200 font-medium">
            查看完整映射结果
          </summary>
          <div className="mt-2 bg-slate-800 rounded p-3 border border-slate-700 max-h-64 overflow-auto">
            <pre className="text-xs text-slate-100">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </details>
      </div>

      {/* 错误信息 */}
      {testResult.message && !result && (
        <div className="bg-red-500/10 rounded-lg border border-red-500/30 p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-2">错误信息</h3>
          <p className="text-sm text-red-300">{testResult.message}</p>
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
