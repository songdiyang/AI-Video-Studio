/**
 * 模型性能统计面板
 * 展示各AI模型的成功率、平均耗时、调用次数等统计信息
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, CardHeader, Button, Select, SelectItem, Tabs, Tab } from '@heroui/react';
import { TrendingUp, AlertCircle, Clock, DollarSign, Activity, BarChart3 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { getModelStats, getModelStatus, ModelOverallStats, RecentStats } from '../../services/modelStats';

const TIME_RANGE_OPTIONS = [
  { value: '1', label: '最近1天' },
  { value: '7', label: '最近7天' },
  { value: '30', label: '最近30天' },
];

const ModelStatsDashboard: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState('7');
  const [stats, setStats] = useState<ModelOverallStats[]>([]);
  const [recentStats, setRecentStats] = useState<RecentStats[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  // 加载统计数据
  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, statusData] = await Promise.all([
        getModelStats(parseInt(days)),
        getModelStatus(),
      ]);
      setStats(statsData.overallStats);
      setRecentStats(statusData.recentStats);
    } catch (error: any) {
      showToast(error.message || '加载统计失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [days, showToast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 自动刷新（每30秒）
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // 计算汇总数据
  const summary = React.useMemo(() => {
    const totalCalls = stats.reduce((sum, s) => sum + (Number(s.totalCalls) || 0), 0);
    const totalSuccess = stats.reduce((sum, s) => sum + (Number(s.successCalls) || 0), 0);
    const totalFailed = stats.reduce((sum, s) => sum + (Number(s.failedCalls) || 0), 0);
    const avgSuccessRate = totalCalls > 0 ? ((totalSuccess / totalCalls) * 100).toFixed(2) : '0';
    const totalCost = stats.reduce((sum, s) => sum + parseFloat(s.totalCost || '0'), 0);

    return {
      totalCalls,
      totalSuccess,
      totalFailed,
      avgSuccessRate,
      totalCost: totalCost.toFixed(6),
    };
  }, [stats]);

  return (
    <div className="p-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">模型性能统计</h1>
          <p className="text-slate-400 mt-1">监控各AI模型的调用情况和性能指标</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            selectedKeys={[days]}
            onChange={(e) => setDays(e.target.value)}
            classNames={{
              trigger: 'bg-slate-800 border-slate-700 text-slate-100 w-32',
            }}
            size="sm"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
          <Button
            size="sm"
            variant="flat"
            onPress={loadStats}
            isLoading={loading}
            className="bg-slate-800 text-slate-200"
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Activity className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-slate-400">总调用次数</p>
              <p className="text-2xl font-bold text-slate-100">{summary.totalCalls}</p>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-slate-400">平均成功率</p>
              <p className="text-2xl font-bold text-slate-100">{summary.avgSuccessRate}%</p>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 bg-red-500/10 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-slate-400">失败次数</p>
              <p className="text-2xl font-bold text-slate-100">{summary.totalFailed}</p>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardBody className="flex flex-row items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-lg">
              <DollarSign className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-slate-400">总成本</p>
              <p className="text-2xl font-bold text-slate-100">{summary.totalCost}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 详细数据 */}
      <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as string)}>
        <Tab key="overview" title="模型概览">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader className="border-b border-slate-800">
              <h3 className="text-lg font-semibold text-slate-100">各模型性能指标</h3>
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-slate-400 text-sm border-b border-slate-800">
                      <th className="pb-3 font-medium">模型名称</th>
                      <th className="pb-3 font-medium">调用次数</th>
                      <th className="pb-3 font-medium">成功率</th>
                      <th className="pb-3 font-medium">平均耗时</th>
                      <th className="pb-3 font-medium">平均成本</th>
                      <th className="pb-3 font-medium">总成本</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {stats.map((stat) => (
                      <tr key={stat.modelName} className="border-b border-slate-800/50 last:border-0">
                        <td className="py-3 font-medium">{stat.modelName}</td>
                        <td className="py-3">{stat.totalCalls}</td>
                        <td className="py-3">
                          <span className={`${
                            parseFloat(stat.successRate) >= 90 ? 'text-green-400' :
                            parseFloat(stat.successRate) >= 70 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {stat.successRate}%
                          </span>
                        </td>
                        <td className="py-3">
                          {stat.avgDurationSeconds ? `${stat.avgDurationSeconds}s` : '-'}
                        </td>
                        <td className="py-3">{stat.avgCost}</td>
                        <td className="py-3">{stat.totalCost}</td>
                      </tr>
                    ))}
                    {stats.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </Tab>

        <Tab key="realtime" title="实时状态">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader className="border-b border-slate-800">
              <h3 className="text-lg font-semibold text-slate-100">最近1小时活动</h3>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentStats.map((stat) => (
                  <Card key={stat.modelName} className="bg-slate-800/50 border-slate-700">
                    <CardBody>
                      <h4 className="font-semibold text-slate-100 mb-2">{stat.modelName}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">调用次数:</span>
                          <span className="text-slate-200">{stat.recentCalls}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">成功率:</span>
                          <span className={`${
                            parseFloat(stat.recentSuccessRate) >= 90 ? 'text-green-400' :
                            parseFloat(stat.recentSuccessRate) >= 70 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {stat.recentSuccessRate}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">进行中:</span>
                          <span className="text-blue-400">{stat.activeTasks}</span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
                {recentStats.length === 0 && (
                  <div className="col-span-full py-8 text-center text-slate-500">
                    最近1小时无活动
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </Tab>
      </Tabs>
    </div>
  );
};

export default ModelStatsDashboard;
