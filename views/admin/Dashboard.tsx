import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Tooltip } from '@heroui/react';
import { Users, Cpu, TrendingUp, Activity, Server, Database, Clock, HardDrive, Radio, RefreshCw, Plus, BarChart3, Shield, CreditCard, Layers } from 'lucide-react';
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

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalModels: 0,
    todayRequests: 0,
    totalScripts: 0
  });
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [servicePorts, setServicePorts] = useState<ServicePortsResponse | null>(null);
  const [servicePortsLoading, setServicePortsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchServerStatus();
    fetchServicePorts();
    // 每 30 秒刷新服务器状态
    const interval = setInterval(() => {
      fetchServerStatus();
      fetchServicePorts();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchServerStatus = async () => {
    try {
      const response = await fetch('/api/admin/server-status', {
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setServerStatus(data);
      }
    } catch (error) {
      console.error('获取服务器状态失败:', error);
    }
  };

  const fetchServicePorts = async () => {
    setServicePortsLoading(true);
    try {
      const response = await fetch('/api/admin/service-ports-status', {
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setServicePorts(data);
      }
    } catch (error) {
      console.error('获取服务端口状态失败:', error);
    } finally {
      setServicePortsLoading(false);
    }
  };

  const getStatusColor = (status: ServicePortStatus['status']) => {
    switch (status) {
      case 'online':
        return 'text-emerald-400';
      case 'offline':
        return 'text-red-400';
      case 'degraded':
        return 'text-amber-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusBg = (status: ServicePortStatus['status']) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500/20';
      case 'offline':
        return 'bg-red-500/20';
      case 'degraded':
        return 'bg-amber-500/20';
      default:
        return 'bg-slate-500/20';
    }
  };

  const getStatusText = (status: ServicePortStatus['status']) => {
    switch (status) {
      case 'online':
        return '在线';
      case 'offline':
        return '离线';
      case 'degraded':
        return '异常';
      default:
        return '未知';
    }
  };

  // 格式化运行时间
  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} 天 ${hours % 24} 小时`;
    if (hours > 0) return `${hours} 小时 ${minutes % 60} 分钟`;
    if (minutes > 0) return `${minutes} 分钟 ${seconds % 60} 秒`;
    return `${seconds} 秒`;
  };

  // 格式化内存大小
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100">仪表盘</h1>
        <p className="text-slate-400 mt-1">系统概览与统计信息</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
          <CardBody className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">总用户数</p>
                <p className="text-3xl font-bold text-slate-100 mt-2">
                  {loading ? '-' : stats.totalUsers}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
          <CardBody className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">AI 模型数</p>
                <p className="text-3xl font-bold text-slate-100 mt-2">
                  {loading ? '-' : stats.totalModels}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
          <CardBody className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">今日请求</p>
                <p className="text-3xl font-bold text-slate-100 mt-2">
                  {loading ? '-' : stats.todayRequests}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
          <CardBody className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">系统状态</p>
                <p className="text-xl font-bold text-emerald-400 mt-2">运行中</p>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 服务端口状态 */}
      <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm mb-8">
        <CardBody className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center">
                <Radio className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">服务端口状态</h3>
                {servicePorts && (
                  <p className="text-xs text-slate-500">最后检查: {new Date(servicePorts.checkedAt).toLocaleTimeString()}</p>
                )}
              </div>
            </div>
            <button
              onClick={fetchServicePorts}
              disabled={servicePortsLoading}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-slate-400 ${servicePortsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {servicePorts ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {servicePorts.services.map((service) => (
                <Tooltip
                  key={service.name}
                  content={
                    <div className="p-2 max-w-xs">
                      <p className="font-medium">{service.description}</p>
                      {service.latency !== null && (
                        <p className="text-xs text-slate-400 mt-1">响应时间: {service.latency}ms</p>
                      )}
                      {service.error && (
                        <p className="text-xs text-red-400 mt-1">{service.error}</p>
                      )}
                    </div>
                  }
                >
                  <div className={`rounded-lg p-4 border border-slate-700/50 cursor-default ${getStatusBg(service.status)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-300 text-sm font-medium">{service.name}</span>
                      <span className={`w-2 h-2 rounded-full ${service.status === 'online' ? 'bg-emerald-400 animate-pulse' : service.status === 'offline' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-slate-500 text-xs">:{service.port}</span>
                      <span className={`text-sm font-medium ${getStatusColor(service.status)}`}>
                        {getStatusText(service.status)}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              ))}
            </div>
          ) : (
            <div className="text-slate-400 text-center py-4">加载中...</div>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 服务器状态 */}
        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm lg:col-span-2">
          <CardBody className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Server className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100">服务器状态</h3>
            </div>
            
            {serverStatus ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* 运行时间 */}
                <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-400 text-sm">运行时间</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">{formatUptime(serverStatus.server.uptime)}</p>
                </div>
                
                {/* 数据库状态 */}
                <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-blue-400" />
                    <span className="text-slate-400 text-sm">数据库</span>
                  </div>
                  <p className={`text-xl font-bold ${serverStatus.database.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                    {serverStatus.database.connected ? '已连接' : '未连接'}
                  </p>
                </div>
                
                {/* 内存使用 */}
                <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-400 text-sm">内存使用</span>
                  </div>
                  <p className="text-xl font-bold text-purple-400">
                    {formatBytes(serverStatus.server.processMemory.heapUsed)}
                  </p>
                  <p className="text-xs text-slate-500">
                    / {formatBytes(serverStatus.server.processMemory.heapTotal)}
                  </p>
                </div>
                
                {/* 环境 */}
                <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-orange-400" />
                    <span className="text-slate-400 text-sm">运行环境</span>
                  </div>
                  <p className="text-xl font-bold text-orange-400 capitalize">{serverStatus.server.env}</p>
                  <p className="text-xs text-slate-500">Node {serverStatus.server.nodeVersion}</p>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-center py-4">加载中...</div>
            )}
          </CardBody>
        </Card>

        {/* 配置检查 */}
        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
          <CardBody className="p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">配置检查</h3>
            {serverStatus ? (
              <div className="space-y-2">
                {Object.entries(serverStatus.config).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-2 border-b border-slate-700/50">
                    <span className="text-slate-400 text-sm">{key}</span>
                    <span className={`font-medium text-sm ${value.startsWith('✓') ? 'text-emerald-400' : value.startsWith('✗') ? 'text-red-400' : 'text-slate-200'}`}>
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

        {/* 系统信息 */}
        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
          <CardBody className="p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">系统信息</h3>
            {serverStatus ? (
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400">主机名</span>
                  <span className="font-medium text-slate-200">{serverStatus.server.hostname}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400">平台</span>
                  <span className="font-medium text-slate-200">{serverStatus.server.platform} ({serverStatus.server.arch})</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400">CPU 核心</span>
                  <span className="font-medium text-slate-200">{serverStatus.server.cpuCores} 核</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400">系统内存</span>
                  <span className="font-medium text-slate-200">
                    {formatBytes(serverStatus.server.freeMemory)} / {formatBytes(serverStatus.server.totalMemory)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">服务端口</span>
                  <span className="font-medium text-emerald-400">:{serverStatus.server.port}</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-center py-4">加载中...</div>
            )}
          </CardBody>
        </Card>

        <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
          <CardBody className="p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">快速操作</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/admin/ai-models')}
                className="text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Plus className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span className="font-medium text-slate-200">AI 模型配置</span>
                </div>
                <p className="text-xs text-slate-500">添加或管理 AI 模型</p>
              </button>
              <button
                onClick={() => navigate('/admin/users')}
                className="text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="font-medium text-slate-200">用户管理</span>
                </div>
                <p className="text-xs text-slate-500">管理系统用户</p>
              </button>
              <button
                onClick={() => navigate('/admin/services')}
                className="text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="font-medium text-slate-200">服务仪表盘</span>
                </div>
                <p className="text-xs text-slate-500">微服务状态监控</p>
              </button>
              <button
                onClick={() => navigate('/admin/model-stats')}
                className="text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="font-medium text-slate-200">模型统计</span>
                </div>
                <p className="text-xs text-slate-500">查看模型性能数据</p>
              </button>
              <button
                onClick={() => navigate('/admin/rate-limit')}
                className="text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="font-medium text-slate-200">AI 限流配置</span>
                </div>
                <p className="text-xs text-slate-500">配置并发限制</p>
              </button>
              <button
                onClick={() => navigate('/admin/subscriptions')}
                className="text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/50 group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
                  <span className="font-medium text-slate-200">订阅管理</span>
                </div>
                <p className="text-xs text-slate-500">管理用户订阅</p>
              </button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
