import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Tooltip, Progress } from '@heroui/react';
import { 
  Users, Cpu, TrendingUp, Activity, Server, Database, Clock, HardDrive, 
  Radio, RefreshCw, Plus, BarChart3, Shield, CreditCard, Layers, 
  Gauge, MemoryStick, Zap, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';

interface DashboardStats {
  totalUsers: number;
  totalModels: number;
  todayRequests: number;
  totalScripts: number;
}

interface ServerStatus {
  server: {
    startTime: number;
    uptime: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    hostname: string;
    cpuCores: number;
    totalMemory: number;
    freeMemory: number;
    processMemory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
    env: string;
    port: number;
  };
  database: {
    connected: boolean;
    error: string | null;
  };
  config: Record<string, string>;
}

interface ServicePortStatus {
  name: string;
  port: number;
  description: string;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  latency: number | null;
  error: string | null;
}

interface ServicePortsResponse {
  services: ServicePortStatus[];
  checkedAt: string;
}

interface SystemResources {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    loadAvg: { '1m': string; '5m': string; '15m': string };
  };
  memory: {
    process: { rss: number; heapUsed: number; heapTotal: number; external: number };
    system: { total: number; free: number; used: number; usagePercent: number };
  };
  database: {
    pool: { active: number; idle: number; waiting: number };
    sizeMB: number;
  };
  tasks: {
    today: { total: number; completed: number; failed: number; active: number };
    activeByModel: { model_name: string; count: number }[];
  };
  requestTrendByModel: { time_slot: string; model_name: string; requests: number }[];
  timestamp: string;
}

interface HistoryStats {
  period: string;
  summary: {
    totalTasks: number;
    totalCompleted: number;
    totalFailed: number;
    totalCost: string;
    avgDailyTasks: number;
    avgDailyUsers: number;
  };
  dailyTasks: { date: string; total: number; completed: number; failed: number; total_cost: number }[];
  dailyUsers: { date: string; active_users: number }[];
  newUsers: { date: string; count: number }[];
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ totalUsers: 0, totalModels: 0, todayRequests: 0, totalScripts: 0 });
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [servicePorts, setServicePorts] = useState<ServicePortsResponse | null>(null);
  const [systemResources, setSystemResources] = useState<SystemResources | null>(null);
  const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
  const [servicePortsLoading, setServicePortsLoading] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/stats', { headers: getAdminAuthHeaders() });
      if (response.ok) setStats(await response.json());
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/server-status', { headers: getAdminAuthHeaders() });
      if (response.ok) setServerStatus(await response.json());
    } catch (error) {
      console.error('获取服务器状态失败:', error);
    }
  }, []);

  const fetchServicePorts = useCallback(async () => {
    setServicePortsLoading(true);
    try {
      const response = await fetch('/api/admin/service-ports-status', { headers: getAdminAuthHeaders() });
      if (response.ok) setServicePorts(await response.json());
    } catch (error) {
      console.error('获取服务端口状态失败:', error);
    } finally {
      setServicePortsLoading(false);
    }
  }, []);

  const fetchSystemResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      const response = await fetch('/api/admin/system-resources', { headers: getAdminAuthHeaders() });
      if (response.ok) setSystemResources(await response.json());
    } catch (error) {
      console.error('获取系统资源失败:', error);
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  const fetchHistoryStats = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/history-stats?days=7', { headers: getAdminAuthHeaders() });
      if (response.ok) setHistoryStats(await response.json());
    } catch (error) {
      console.error('获取历史统计失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchServerStatus();
    fetchServicePorts();
    fetchSystemResources();
    fetchHistoryStats();
    // 每 15 秒刷新资源监控
    const resourceInterval = setInterval(fetchSystemResources, 15000);
    // 每 30 秒刷新服务状态
    const statusInterval = setInterval(() => {
      fetchServerStatus();
      fetchServicePorts();
    }, 30000);
    return () => {
      clearInterval(resourceInterval);
      clearInterval(statusInterval);
    };
  }, [fetchStats, fetchServerStatus, fetchServicePorts, fetchSystemResources, fetchHistoryStats]);

  const getStatusColor = (status: ServicePortStatus['status']) => {
    switch (status) {
      case 'online': return 'text-emerald-400';
      case 'offline': return 'text-red-400';
      case 'degraded': return 'text-amber-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusBg = (status: ServicePortStatus['status']) => {
    switch (status) {
      case 'online': return 'bg-emerald-500/20';
      case 'offline': return 'bg-red-500/20';
      case 'degraded': return 'bg-amber-500/20';
      default: return 'bg-slate-500/20';
    }
  };

  const getStatusText = (status: ServicePortStatus['status']) => {
    switch (status) {
      case 'online': return '在线';
      case 'offline': return '离线';
      case 'degraded': return '异常';
      default: return '未知';
    }
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}天 ${hours % 24}小时`;
    if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟`;
    return `${seconds}秒`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warning';
    return 'success';
  };

  // 简单的柱状图组件
  const MiniBarChart: React.FC<{ data: { label: string; value: number }[]; maxValue?: number; color?: string }> = ({ data, maxValue, color = 'bg-blue-500' }) => {
    const max = maxValue || Math.max(...data.map(d => d.value), 1);
    return (
      <div className="flex items-end gap-1 h-16">
        {data.map((item, i) => (
          <Tooltip key={i} content={`${item.label}: ${item.value}`}>
            <div
              className={`flex-1 ${color} rounded-t opacity-80 hover:opacity-100 transition-opacity min-w-[8px]`}
              style={{ height: `${Math.max((item.value / max) * 100, 4)}%` }}
            />
          </Tooltip>
        ))}
      </div>
    );
  };

  // 多模型折线图组件（24小时请求趋势）
  const MODEL_COLORS = [
    '#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171',
    '#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#818cf8'
  ];

  const MultiModelTrendChart: React.FC<{
    data: { time_slot: string; model_name: string; requests: number }[];
  }> = ({ data }) => {
    const [hoveredModel, setHoveredModel] = React.useState<string | null>(null);
    const svgW = 800;
    const svgH = 200;
    const padL = 40;
    const padR = 16;
    const padT = 12;
    const padB = 6;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    const timeSlots = [...new Set(data.map(d => d.time_slot))].sort();
    const modelTotals: Record<string, number> = {};
    for (const d of data) {
      modelTotals[d.model_name] = (modelTotals[d.model_name] || 0) + d.requests;
    }
    const modelNames = [...new Set(data.map(d => d.model_name))].sort(
      (a, b) => (modelTotals[b] || 0) - (modelTotals[a] || 0)
    );
    const modelDataMap: Record<string, Record<string, number>> = {};
    for (const d of data) {
      if (!modelDataMap[d.model_name]) modelDataMap[d.model_name] = {};
      modelDataMap[d.model_name][d.time_slot] = d.requests;
    }
    const maxVal = Math.max(...data.map(d => d.requests), 1);
    const niceMax = Math.ceil(maxVal / 5) * 5 || 5;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => Math.round(niceMax * r));
    const points = timeSlots.length;
    const totalRequests = data.reduce((s, d) => s + d.requests, 0);

    const toX = (i: number) => padL + (points > 1 ? (i / (points - 1)) * plotW : plotW / 2);
    const toY = (val: number) => padT + plotH - (val / niceMax) * plotH;

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-slate-500">24h 总计</span>
          <span className="text-sm font-semibold text-slate-200 bg-slate-800/80 px-2 py-0.5 rounded-md">{totalRequests}</span>
          <span className="text-xs text-slate-500">次请求</span>
        </div>

        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ height: 200 }}>
          <defs>
            {modelNames.map((_model, mi) => (
              <linearGradient key={mi} id={`trendGrad-${mi}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MODEL_COLORS[mi % MODEL_COLORS.length]} stopOpacity={0.2} />
                <stop offset="100%" stopColor={MODEL_COLORS[mi % MODEL_COLORS.length]} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>

          {/* Y 轴网格线 + 刻度 */}
          {yTicks.map((tick, i) => {
            const y = toY(tick);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#334155" strokeWidth={0.5} strokeDasharray="4 3" />
                <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-500" fontSize={10}>{tick}</text>
              </g>
            );
          })}

          {/* X 轴时间标签 */}
          {timeSlots.map((slot, si) => {
            const step = Math.max(1, Math.floor(points / 8));
            if (si % step !== 0 && si !== points - 1) return null;
            return (
              <text key={si} x={toX(si)} y={svgH - 1} textAnchor="middle" className="fill-slate-500" fontSize={10}>{slot}</text>
            );
          })}

          {/* 面积 + 折线（按请求量倒序，少的后画 = 在上层） */}
          {[...modelNames].reverse().map((model, _ri) => {
            const mi = modelNames.indexOf(model);
            const isDimmed = hoveredModel && hoveredModel !== model;
            const linePts = timeSlots.map((slot, si) => `${toX(si)},${toY(modelDataMap[model]?.[slot] || 0)}`).join(' ');
            const areaD = `M${timeSlots.map((slot, si) => `${toX(si)},${toY(modelDataMap[model]?.[slot] || 0)}`).join(' L')} L${toX(points - 1)},${toY(0)} L${toX(0)},${toY(0)} Z`;

            return (
              <g key={model} opacity={isDimmed ? 0.12 : 1} style={{ transition: 'opacity 0.25s' }}>
                <path d={areaD} fill={`url(#trendGrad-${mi})`} />
                <polyline
                  fill="none"
                  stroke={MODEL_COLORS[mi % MODEL_COLORS.length]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={linePts}
                />
              </g>
            );
          })}

          {/* 数据点（悬停高亮模型时显示） */}
          {hoveredModel && timeSlots.map((slot, si) => {
            const mi = modelNames.indexOf(hoveredModel);
            const val = modelDataMap[hoveredModel]?.[slot] || 0;
            if (val === 0) return null;
            return (
              <circle
                key={si}
                cx={toX(si)}
                cy={toY(val)}
                r={3.5}
                fill={MODEL_COLORS[mi % MODEL_COLORS.length]}
                stroke="#0f172a"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {/* 图例卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-3">
          {modelNames.map((model, mi) => {
            const total = modelTotals[model] || 0;
            const isActive = !hoveredModel || hoveredModel === model;
            return (
              <div
                key={model}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-700/50 transition-all cursor-pointer border border-transparent hover:border-slate-600/40"
                style={{ opacity: isActive ? 1 : 0.35 }}
                onMouseEnter={() => setHoveredModel(model)}
                onMouseLeave={() => setHoveredModel(null)}
              >
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: MODEL_COLORS[mi % MODEL_COLORS.length] }} />
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] text-slate-300 truncate leading-tight">{model}</span>
                  <span className="text-[10px] text-slate-500 leading-tight">{total} 次</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">系统监控仪表盘</h1>
          <p className="text-slate-400 text-sm mt-1">实时监控系统资源与服务状态，为配置决策提供数据参考</p>
        </div>
        <button
          onClick={() => { fetchSystemResources(); fetchServicePorts(); fetchHistoryStats(); }}
          disabled={resourcesLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-sm text-slate-300"
        >
          <RefreshCw className={`w-4 h-4 ${resourcesLoading ? 'animate-spin' : ''}`} />
          刷新数据
        </button>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">总用户数</p>
                <p className="text-xl font-bold text-slate-100">{loading ? '-' : stats.totalUsers}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <Cpu className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">AI模型数</p>
                <p className="text-xl font-bold text-slate-100">{loading ? '-' : stats.totalModels}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">今日请求</p>
                <p className="text-xl font-bold text-slate-100">{loading ? '-' : stats.todayRequests}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">今日任务</p>
                <p className="text-xl font-bold text-slate-100">{systemResources?.tasks.today.total || 0}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">今日完成</p>
                <p className="text-xl font-bold text-emerald-400">{systemResources?.tasks.today.completed || 0}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">今日失败</p>
                <p className="text-xl font-bold text-red-400">{systemResources?.tasks.today.failed || 0}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 系统资源监控 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* CPU 监控 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
                <Gauge className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">CPU 使用率</h3>
                <p className="text-xs text-slate-500">{systemResources?.cpu.cores || 0} 核 · {systemResources?.cpu.model?.split(' ').slice(0, 3).join(' ') || '-'}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">进程占用</span>
                  <span className="text-slate-200 font-medium">{systemResources?.cpu.usage || 0}%</span>
                </div>
                <Progress 
                  value={systemResources?.cpu.usage || 0} 
                  color={getUsageColor(systemResources?.cpu.usage || 0)}
                  size="sm"
                  className="h-2"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/50">
                <div className="text-center">
                  <p className="text-xs text-slate-500">1分钟</p>
                  <p className="text-sm font-medium text-slate-200">{systemResources?.cpu.loadAvg['1m'] || '-'}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">5分钟</p>
                  <p className="text-sm font-medium text-slate-200">{systemResources?.cpu.loadAvg['5m'] || '-'}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">15分钟</p>
                  <p className="text-sm font-medium text-slate-200">{systemResources?.cpu.loadAvg['15m'] || '-'}</p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 内存监控 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <MemoryStick className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">内存使用</h3>
                <p className="text-xs text-slate-500">系统总量: {formatBytes(systemResources?.memory.system.total || 0)}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">系统内存</span>
                  <span className="text-slate-200 font-medium">
                    {formatBytes(systemResources?.memory.system.used || 0)} ({systemResources?.memory.system.usagePercent || 0}%)
                  </span>
                </div>
                <Progress 
                  value={systemResources?.memory.system.usagePercent || 0} 
                  color={getUsageColor(systemResources?.memory.system.usagePercent || 0)}
                  size="sm"
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Node堆内存</span>
                  <span className="text-slate-200 font-medium">
                    {formatBytes(systemResources?.memory.process.heapUsed || 0)}
                  </span>
                </div>
                <Progress 
                  value={systemResources?.memory.process.heapTotal ? (systemResources.memory.process.heapUsed / systemResources.memory.process.heapTotal) * 100 : 0} 
                  color="secondary"
                  size="sm"
                  className="h-2"
                />
                <p className="text-xs text-slate-500 mt-1">堆总量: {formatBytes(systemResources?.memory.process.heapTotal || 0)}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 数据库监控 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">数据库连接池</h3>
                <p className="text-xs text-slate-500">MySQL · 数据库大小: {systemResources?.database.sizeMB || 0} MB</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{systemResources?.database.pool.active || 0}</p>
                <p className="text-xs text-slate-400">活跃连接</p>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{systemResources?.database.pool.idle || 0}</p>
                <p className="text-xs text-slate-400">空闲连接</p>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">{systemResources?.database.pool.waiting || 0}</p>
                <p className="text-xs text-slate-400">等待队列</p>
              </div>
            </div>
            {(systemResources?.database.pool.waiting || 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 rounded-lg p-2">
                <AlertTriangle className="w-4 h-4" />
                <span>有请求在等待连接，考虑增加连接池大小</span>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 服务状态 + 请求趋势 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 服务端口状态 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center">
                  <Radio className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">服务状态</h3>
                  {servicePorts && (
                    <p className="text-xs text-slate-500">更新于 {new Date(servicePorts.checkedAt).toLocaleTimeString()}</p>
                  )}
                </div>
              </div>
              <button onClick={fetchServicePorts} disabled={servicePortsLoading} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <RefreshCw className={`w-4 h-4 text-slate-400 ${servicePortsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {servicePorts ? (
              <div className="grid grid-cols-2 gap-3">
                {servicePorts.services.map((service) => (
                  <Tooltip key={service.name} content={<div className="p-1"><p>{service.description}</p>{service.latency !== null && <p className="text-xs">延迟: {service.latency}ms</p>}{service.error && <p className="text-xs text-red-400">{service.error}</p>}</div>}>
                    <div className={`rounded-lg p-3 border border-slate-700/50 ${getStatusBg(service.status)}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-200 text-sm font-medium">{service.name}</span>
                        <span className={`w-2 h-2 rounded-full ${service.status === 'online' ? 'bg-emerald-400 animate-pulse' : service.status === 'offline' ? 'bg-red-400' : 'bg-amber-400'}`} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-xs">:{service.port}</span>
                        <span className={`text-xs font-medium ${getStatusColor(service.status)}`}>{getStatusText(service.status)}</span>
                      </div>
                    </div>
                  </Tooltip>
                ))}
              </div>
            ) : (
              <div className="text-slate-400 text-center py-8">加载中...</div>
            )}
          </CardBody>
        </Card>

        {/* 24小时请求趋势（按AI模型折线图） */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">24小时请求趋势</h3>
                <p className="text-xs text-slate-500">按AI模型分类</p>
              </div>
            </div>
            {systemResources?.requestTrendByModel && systemResources.requestTrendByModel.length > 0 ? (
              <MultiModelTrendChart data={systemResources.requestTrendByModel} />
            ) : (
              <div className="text-slate-400 text-center py-8 text-sm">暂无请求数据</div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 7天历史趋势 */}
      {historyStats && (
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">7天趋势统计</h3>
                  <p className="text-xs text-slate-500">
                    日均任务: {historyStats.summary.avgDailyTasks} · 日均用户: {historyStats.summary.avgDailyUsers} · 总成本: ¥{historyStats.summary.totalCost}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 任务趋势 */}
              <div>
                <p className="text-xs text-slate-400 mb-2">每日任务数</p>
                <MiniBarChart 
                  data={historyStats.dailyTasks.map(d => ({ label: d.date, value: d.total }))} 
                  color="bg-blue-500"
                />
                <div className="flex justify-between mt-1 text-xs text-slate-500">
                  {historyStats.dailyTasks.length > 0 && (
                    <>
                      <span>{historyStats.dailyTasks[0]?.date?.slice(5)}</span>
                      <span>{historyStats.dailyTasks[historyStats.dailyTasks.length - 1]?.date?.slice(5)}</span>
                    </>
                  )}
                </div>
              </div>
              {/* 用户活跃趋势 */}
              <div>
                <p className="text-xs text-slate-400 mb-2">每日活跃用户</p>
                <MiniBarChart 
                  data={historyStats.dailyUsers.map(d => ({ label: d.date, value: d.active_users }))} 
                  color="bg-purple-500"
                />
                <div className="flex justify-between mt-1 text-xs text-slate-500">
                  {historyStats.dailyUsers.length > 0 && (
                    <>
                      <span>{historyStats.dailyUsers[0]?.date?.slice(5)}</span>
                      <span>{historyStats.dailyUsers[historyStats.dailyUsers.length - 1]?.date?.slice(5)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 服务器信息 + 快速操作 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 服务器信息 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Server className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">服务器信息</h3>
            </div>
            {serverStatus ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                  <span className="text-slate-400">运行时间</span>
                  <span className="text-emerald-400 font-medium">{formatUptime(serverStatus.server.uptime)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                  <span className="text-slate-400">主机名</span>
                  <span className="text-slate-200">{serverStatus.server.hostname}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                  <span className="text-slate-400">平台</span>
                  <span className="text-slate-200">{serverStatus.server.platform} ({serverStatus.server.arch})</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-700/30">
                  <span className="text-slate-400">Node.js</span>
                  <span className="text-slate-200">{serverStatus.server.nodeVersion}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">环境</span>
                  <span className="text-orange-400 font-medium capitalize">{serverStatus.server.env}</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-center py-4">加载中...</div>
            )}
          </CardBody>
        </Card>

        {/* 配置检查 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">配置检查</h3>
            {serverStatus ? (
              <div className="space-y-2 text-sm">
                {Object.entries(serverStatus.config).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-1.5 border-b border-slate-700/30">
                    <span className="text-slate-400 text-xs">{key}</span>
                    <span className={`text-xs font-medium ${value.startsWith('✓') ? 'text-emerald-400' : value.startsWith('✗') ? 'text-red-400' : 'text-slate-200'}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400 text-center py-4">加载中...</div>
            )}
          </CardBody>
        </Card>

        {/* 快速操作 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">快速操作</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => navigate('/admin/ai-models')} className="text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium text-slate-200">AI模型</span>
                </div>
              </button>
              <button onClick={() => navigate('/admin/users')} className="text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-medium text-slate-200">用户管理</span>
                </div>
              </button>
              <button onClick={() => navigate('/admin/services')} className="text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-medium text-slate-200">服务监控</span>
                </div>
              </button>
              <button onClick={() => navigate('/admin/model-stats')} className="text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-200">模型统计</span>
                </div>
              </button>
              <button onClick={() => navigate('/admin/task-errors')} className="text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-medium text-slate-200">错误监控</span>
                </div>
              </button>
              <button onClick={() => navigate('/admin/rate-limits')} className="text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-medium text-slate-200">限流配置</span>
                </div>
              </button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 配置建议 */}
      {systemResources && (
        <Card className="bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/50 shadow-sm">
          <CardBody className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <Activity className="w-5 h-5 text-cyan-500" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">服务器配置参考</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 rounded-lg p-3">
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">CPU核心</p>
                <p className="text-slate-800 dark:text-slate-100 font-medium">{systemResources.cpu.cores} 核</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {systemResources.cpu.usage > 80 ? '建议升级' : systemResources.cpu.usage < 20 ? '资源充足' : '使用正常'}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 rounded-lg p-3">
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">系统内存</p>
                <p className="text-slate-800 dark:text-slate-100 font-medium">{formatBytes(systemResources.memory.system.total)}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  已用 {systemResources.memory.system.usagePercent}%
                  {systemResources.memory.system.usagePercent > 85 ? ' · 建议扩容' : ''}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 rounded-lg p-3">
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">数据库</p>
                <p className="text-slate-800 dark:text-slate-100 font-medium">{systemResources.database.sizeMB} MB</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  连接池 {systemResources.database.pool.active + systemResources.database.pool.idle}/20
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 rounded-lg p-3">
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">日均负载</p>
                <p className="text-slate-800 dark:text-slate-100 font-medium">{historyStats?.summary.avgDailyTasks || 0} 任务/天</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {historyStats?.summary.avgDailyUsers || 0} 活跃用户/天
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
