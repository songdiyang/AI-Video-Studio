/**
 * 轴线规则检查组件
 * 检查分镜序列中的越轴和视线匹配问题
 */

import React, { useState, useCallback } from 'react';
import { Button, Card, CardBody, Badge } from '@heroui/react';
import { AlertTriangle, AlertCircle, Info, RefreshCw, CheckCircle } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { AxisCheckResult, AxisIssue } from '../../../types/shotLanguage';
import { getAuthToken } from '../../../services/auth';

interface AxisCheckerProps {
  scriptId: number;
}

const AxisChecker: React.FC<AxisCheckerProps> = ({ scriptId }) => {
  const { showToast } = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<AxisCheckResult | null>(null);

  const checkAxis = useCallback(async () => {
    if (!scriptId) {
      showToast('请先选择剧本', 'warning');
      return;
    }

    setChecking(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/storyboards/check-axis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ scriptId }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data);
        if (data.issueCount === 0) {
          showToast('轴线检查通过，没有发现越轴问题', 'success');
        } else {
          showToast(`发现 ${data.issueCount} 个轴线问题`, 'warning');
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      showToast(error.message || '检查失败', 'error');
    } finally {
      setChecking(false);
    }
  }, [scriptId, showToast]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-amber-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'warning': return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      default: return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
    }
  };

  const getIssueTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      axis_violation: '越轴',
      direction_mismatch: '方向不匹配',
      continuity_error: '连续性错误',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">轴线规则检查</h3>
          <p className="text-xs text-slate-400">检查180度轴线和视线匹配</p>
        </div>
        <Button
          size="sm"
          variant="flat"
          className="bg-slate-800 text-slate-300"
          startContent={<RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />}
          onPress={checkAxis}
          isLoading={checking}
        >
          检查轴线
        </Button>
      </div>

      {result && (
        <Card className="bg-slate-900 border-slate-800">
          <CardBody className="p-3">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">总分镜:</span>
                <Badge size="sm" variant="flat" className="bg-slate-800 text-slate-200">
                  {result.totalScenes}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">问题数:</span>
                <Badge 
                  size="sm" 
                  variant="flat" 
                  className={result.issueCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}
                >
                  {result.issueCount}
                </Badge>
              </div>
              {result.issueCount === 0 && (
                <div className="flex items-center gap-1 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-xs">通过</span>
                </div>
              )}
            </div>

            {result.issues.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.issues.map((issue, index) => (
                  <div key={index} className={`p-2.5 rounded border ${getSeverityColor(issue.severity)}`}>
                    <div className="flex items-start gap-2">
                      {getSeverityIcon(issue.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">{getIssueTypeLabel(issue.type)}</span>
                          <span className="text-[10px] opacity-70">
                            分镜 {issue.fromIndex + 1} → {issue.toIndex + 1}
                          </span>
                        </div>
                        <p className="text-xs opacity-90">{issue.message}</p>
                        <p className="text-[10px] opacity-60 mt-1">建议: {issue.suggestion}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="bg-slate-900/50 border-slate-800">
        <CardBody className="p-3">
          <h4 className="text-xs font-medium text-slate-300 mb-2">轴线规则说明</h4>
          <ul className="text-[11px] text-slate-400 space-y-1">
            <li>• 180度规则：保持摄影机在轴线一侧，避免观众空间迷失</li>
            <li>• 越轴技巧：使用特写、中性镜头或明确的方向指示</li>
            <li>• 视线匹配：角色视线方向应保持一致性</li>
            <li>• 运动方向：同一场景中角色运动方向应连贯</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
};

export default AxisChecker;
