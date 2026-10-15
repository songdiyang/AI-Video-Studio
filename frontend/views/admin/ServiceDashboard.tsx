import React, { useEffect, useState } from 'react';
import {
  Activity,
  RefreshCw,
  Server,
  Globe,
  Database,
  HardDrive,
  Clock,
  Cpu,
  MemoryStick,
  Gauge,
  Info
} from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';

type ServiceStatus = 'online' | 'offline' | 'degraded' | 'unknown' | string;

interface ServiceMetrics {
  cpuPercent?: number;
  memoryUsage?: number;
  memoryLimit?: number;
}

interface ServiceItem {
  serviceId: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  latency?: number;
  uptimeSeconds?: number;
  metrics?: ServiceMetrics;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

interface ServicesResponse {
  services?: ServiceItem[];
  checkedAt?: string;
}

const refreshIntervalMs = 10000;

function formatBytes(value?: number) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  backend: <Server className="h-5 w-5" />,
  frontend: <Globe className="h-5 w-5" />,
  mysql: <Database className="h-5 w-5" />,
  minio: <HardDrive className="h-5 w-5" />,
};

function getStatusStyle(status: ServiceStatus) {
  switch (status) {
    case 'online':
      return {
        dot: 'bg-emerald-500',
        dotPulse: 'animate-pulse',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        label: '在线',
        ring: 'ring-emerald-500/20'
      };
    case 'degraded':
      return {
        dot: 'bg-amber-500',
        dotPulse: '',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        label: '异常',
        ring: 'ring-amber-500/20'
      };
    case 'offline':
      return {
        dot: 'bg-rose-400',
        dotPulse: '',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        label: '离线',
        ring: 'ring-rose-500/20'
      };
    default:
      return {
        dot: 'bg-slate-300',
        dotPulse: '',
        badge: 'bg-slate-100 text-slate-600 border-slate-200',
        label: '未知',
        ring: 'ring-slate-500/20'
      };
  }
}

const ServiceDashboard: React.FC = () => {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    void fetchServices(true);
    const timer = window.setInterval(() => {
      void fetchServices(false, true);
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  async function fetchServices(isInitial = false, silent = false) {
    if (isInitial) setLoading(true);
    if (!silent && !isInitial) setRefreshing(true);

    try {
      const response = await fetch('/api/admin/services', {
        headers: getAdminAuthHeaders()
      });
      const payload: ServicesResponse = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('获取服务列表失败');

      setServices(Array.isArray(payload.services) ? payload.services : []);
      setCheckedAt(payload.checkedAt || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取服务列表失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onlineCount = services.filter(s => s.status === 'online').length;
  const totalCount = services.length;

  return (
    <div className="min-h-full bg-[#fbfbf8] text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        {/* Header */}
        <section className="rounded-[28px] border border-slate-200 bg-white px-7 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                <Activity className="h-3.5 w-3.5" />
                Service Dashboard
              </span>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">服务仪表盘</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  实时探测各核心服务的运行状态、响应延迟和资源占用。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Summary pill */}
              {!loading && totalCount > 0 && (
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  onlineCount === totalCount
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${onlineCount === totalCount ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {onlineCount}/{totalCount} 在线
                </div>
              )}

              <button
                type="button"
                onClick={() => void fetchServices(false)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? '刷新中' : '刷新状态'}
              </button>
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Service Cards */}
        <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={`skel-${i}`} className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 animate-pulse rounded-2xl bg-slate-100" />
                    <div className="space-y-2 flex-1">
                      <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((__, j) => (
                      <div key={`m-${j}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="h-3 w-12 animate-pulse rounded bg-slate-100" />
                        <div className="mt-2 h-5 w-16 animate-pulse rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            : services.map((service) => {
                const style = getStatusStyle(service.status);
                const icon = SERVICE_ICONS[service.serviceId] || <Server className="h-5 w-5" />;
                const hasMetrics = service.metrics && (service.metrics.cpuPercent !== undefined || service.metrics.memoryUsage);

                return (
                  <article
                    key={service.serviceId}
                    className={`rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)] ring-2 ring-offset-2 ring-offset-white ${style.ring} transition-shadow`}
                  >
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                          {icon}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold text-slate-950 truncate">{service.name}</h2>
                          <p className="text-sm text-slate-500 truncate">{service.description}</p>
                        </div>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${style.badge}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${style.dot} ${style.dotPulse}`} />
                        {style.label}
                      </span>
                    </div>

                    {/* Error message */}
                    {service.error && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-600">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="break-all">{service.error}</span>
                      </div>
                    )}

                    {/* Metrics */}
                    <div className={`mt-5 grid gap-3 ${hasMetrics ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-2 xl:grid-cols-3'}`}>
                      <MetricCard
                        icon={<Gauge className="h-3.5 w-3.5" />}
                        label="延迟"
                        value={service.latency !== undefined ? `${service.latency}ms` : '-'}
                      />
                      {service.uptimeSeconds !== undefined && (
                        <MetricCard
                          icon={<Clock className="h-3.5 w-3.5" />}
                          label="运行时间"
                          value={formatUptime(service.uptimeSeconds)}
                        />
                      )}
                      {hasMetrics && (
                        <>
                          <MetricCard
                            icon={<Cpu className="h-3.5 w-3.5" />}
                            label="CPU"
                            value={`${service.metrics!.cpuPercent ?? 0}%`}
                          />
                          <MetricCard
                            icon={<MemoryStick className="h-3.5 w-3.5" />}
                            label="内存"
                            value={`${formatBytes(service.metrics!.memoryUsage)} / ${formatBytes(service.metrics!.memoryLimit)}`}
                          />
                        </>
                      )}
                    </div>

                    {/* Metadata tags */}
                    {service.metadata && Object.keys(service.metadata).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {Object.entries(service.metadata).map(([key, val]) => (
                          <span
                            key={key}
                            className="inline-flex items-center rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[11px] text-slate-500"
                          >
                            <span className="font-medium text-slate-600">{key}</span>
                            <span className="mx-1 text-slate-300">:</span>
                            {String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
        </section>

        {/* Footer */}
        {checkedAt && !loading && (
          <p className="mt-4 text-center text-xs text-slate-400">
            上次检查: {new Date(checkedAt).toLocaleString('zh-CN')} · 每 {refreshIntervalMs / 1000}s 自动刷新
          </p>
        )}
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
    <div className="flex items-center gap-1.5 text-slate-400">
      {icon}
      <span className="text-[11px] font-medium uppercase tracking-[0.18em]">{label}</span>
    </div>
    <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
  </div>
);

export default ServiceDashboard;
