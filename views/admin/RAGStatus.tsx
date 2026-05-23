/**
 * RAG（知识库）状态监控面板
 * 
 * 显示火山引擎知识库的连接状态、文档数量、存储使用情况
 */

import React, { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { 
  BookOpen, Database, CheckCircle2, XCircle, AlertTriangle, 
  RefreshCw, FileText, HardDrive, Clock, Activity
} from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';

interface RAGStatusData {
  available: boolean;
  projectId?: string;
  documentCount?: number;
  storageUsed?: number;
  lastUpdated?: string;
  message?: string;
}

interface RAGStats {
  totalScripts: number;
  indexedScripts: number;
  totalChunks: number;
  lastSyncAt: string | null;
}

const RAGStatus: React.FC = () => {
  const [status, setStatus] = useState<RAGStatusData | null>(null);
  const [stats, setStats] = useState<RAGStats>({
    totalScripts: 0,
    indexedScripts: 0,
    totalChunks: 0,
    lastSyncAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rag/status', {
        headers: getAdminAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `请求失败 (${res.status})`);
      }
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setError(err.message || '获取状态失败');
      setStatus({ available: false, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // 获取剧本统计（从已有 admin API）
      const res = await fetch('/api/admin/stats', {
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({
          ...prev,
          totalScripts: data.totalScripts || 0,
        }));
      }
    } catch (err) {
      console.warn('获取剧本统计失败:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchStats();
  }, []);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '未知';
    try {
      return new Date(dateStr).toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">知识库状态</h1>
            <p className="text-sm text-[var(--text-muted)]">火山引擎 RAG 服务监控</p>
          </div>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-sm">刷新</span>
        </button>
      </div>

      {/* 连接状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[var(--bg-secondary)] border-[var(--border-color)]">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-muted)] mb-1">服务状态</p>
                <div className="flex items-center gap-2">
                  {status?.available ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span className="text-lg font-semibold text-emerald-500">正常运行</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-red-500" />
                      <span className="text-lg font-semibold text-red-500">不可用</span>
                    </>
                  )}
                </div>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                status?.available ? 'bg-emerald-500/10' : 'bg-red-500/10'
              }`}>
                <Activity className={`w-6 h-6 ${status?.available ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-[var(--bg-secondary)] border-[var(--border-color)]">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-muted)] mb-1">索引文档数</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {status?.documentCount ?? '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-[var(--bg-secondary)] border-[var(--border-color)]">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-muted)] mb-1">存储使用</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {formatBytes(status?.storageUsed)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <HardDrive className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 详细信息 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-[var(--bg-secondary)] border-[var(--border-color)]">
          <CardHeader className="px-5 py-4 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">服务配置</span>
            </div>
          </CardHeader>
          <CardBody className="p-5 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-color)]/50">
              <span className="text-sm text-[var(--text-muted)]">知识库项目 ID</span>
              <span className="text-sm font-mono text-[var(--text-primary)]">
                {status?.projectId || '未配置'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-color)]/50">
              <span className="text-sm text-[var(--text-muted)]">API 端点</span>
              <span className="text-sm font-mono text-[var(--text-primary)] truncate max-w-[200px]">
                ark.cn-beijing.volces.com
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-color)]/50">
              <span className="text-sm text-[var(--text-muted)]">最后更新</span>
              <span className="text-sm text-[var(--text-primary)]">
                {formatDate(status?.lastUpdated)}
              </span>
            </div>
            {status?.message && !status.available && (
              <div className="flex items-start gap-2 py-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <span className="text-sm text-amber-500">{status.message}</span>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="bg-[var(--bg-secondary)] border-[var(--border-color)]">
          <CardHeader className="px-5 py-4 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">剧本索引统计</span>
            </div>
          </CardHeader>
          <CardBody className="p-5 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-color)]/50">
              <span className="text-sm text-[var(--text-muted)]">剧本总数</span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {stats.totalScripts}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-color)]/50">
              <span className="text-sm text-[var(--text-muted)]">已索引剧本</span>
              <span className="text-sm font-semibold text-emerald-500">
                {stats.indexedScripts}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-color)]/50">
              <span className="text-sm text-[var(--text-muted)]">索引片段数</span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {stats.totalChunks}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-[var(--text-muted)]">索引覆盖率</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-[var(--bg-input)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ 
                      width: `${stats.totalScripts > 0 ? (stats.indexedScripts / stats.totalScripts) * 100 : 0}%` 
                    }}
                  />
                </div>
                <span className="text-sm text-[var(--text-primary)]">
                  {stats.totalScripts > 0 
                    ? Math.round((stats.indexedScripts / stats.totalScripts) * 100) 
                    : 0}%
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 使用说明 */}
      <Card className="bg-[var(--bg-secondary)] border-[var(--border-color)]">
        <CardHeader className="px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">使用说明</span>
          </div>
        </CardHeader>
        <CardBody className="p-5">
          <div className="space-y-2 text-sm text-[var(--text-muted)]">
            <p>1. 剧本创建/更新时会自动建立向量索引</p>
            <p>2. 剧本删除时会自动清理对应索引</p>
            <p>3. AI 助手提问时会自动检索相关剧本片段</p>
            <p>4. 如果知识库服务不可用，系统会回退到原始剧本内容截取</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default RAGStatus;
