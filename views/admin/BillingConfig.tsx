import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardBody, Button, Input, Slider, Chip, Divider } from '@heroui/react';
import { Calculator, TrendingUp, Coins, Save, RefreshCw, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

interface SystemConfig {
  id: number;
  key: string;
  value: string;
  description: string;
}

// 成本基准数据
const COST_ITEMS = [
  { label: '文本生成(短)', cost: 0.015 },
  { label: '文本生成(标准)', cost: 0.025 },
  { label: '图片生成(每张)', cost: 0.22 },
  { label: '视频生成(每秒)', cost: 0.95 },
];

const POINT_VALUE_CNY = 0.01;
const POINT_PURCHASE_PRICE = 0.02;  // 积分充值售价

const BillingConfig: React.FC = () => {
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 服务费率 (数据库值 0.5 = 50%)
  const [feeRate, setFeeRate] = useState(0.5);
  const [feeRateInput, setFeeRateInput] = useState('50');
  const [feeRateConfigId, setFeeRateConfigId] = useState<number | null>(null);
  const [originalFeeRate, setOriginalFeeRate] = useState(0.5);

  // 成本覆盖计算器
  const [monthlyFixedCost, setMonthlyFixedCost] = useState(8400);
  const [expectedMonthlyProjects, setExpectedMonthlyProjects] = useState(100);

  const { showToast } = useToast();

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/system-configs/admin/all', {
        headers: getAdminAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        const configList: SystemConfig[] = data.configs || data || [];
        setConfigs(configList);

        const feeConfig = configList.find((c: SystemConfig) => c.key === 'service_fee_rate');
        if (feeConfig) {
          const val = parseFloat(JSON.parse(feeConfig.value) || feeConfig.value);
          setFeeRate(val);
          setFeeRateInput(String(Math.round(val * 100)));
          setFeeRateConfigId(feeConfig.id);
          setOriginalFeeRate(val);
        }
      } else {
        showToast('获取配置失败', 'error');
      }
    } catch (error) {
      console.error('获取配置失败:', error);
      showToast('获取配置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleFeeRateInputChange = (val: string) => {
    setFeeRateInput(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setFeeRate(num / 100);
    }
  };

  const handleSliderChange = (val: number | number[]) => {
    const v = Array.isArray(val) ? val[0] : val;
    setFeeRate(v / 100);
    setFeeRateInput(String(v));
  };

  const handleSaveFeeRate = async () => {
    if (feeRateConfigId === null) {
      showToast('未找到费率配置项', 'error');
      return;
    }
    if (feeRate < 0) {
      showToast('服务费率不能为负数', 'error');
      return;
    }
    if (feeRate > 3) {
      showToast('服务费率超过 300%，请确认是否合理', 'warning');
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/system-configs/admin/${feeRateConfigId}`, {
        method: 'PUT',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ value: JSON.stringify(String(feeRate)) })
      });
      if (response.ok) {
        showToast('服务费率已更新', 'success');
        setOriginalFeeRate(feeRate);
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.message || '保存失败', 'error');
      }
    } catch (error) {
      console.error('保存失败:', error);
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 计算积分消耗
  const calcPoints = (cost: number) => Math.ceil(cost * (1 + feeRate) / POINT_VALUE_CNY);

  // 完整项目成本计算：10个角色描述(短文本) + 30个分镜(标准文本+图片) + 15秒视频
  const fullProjectCost = useMemo(() => {
    const textShort = 0.015 * 10;
    const textStandard = 0.025 * 30;
    const images = 0.22 * 30;
    const video = 0.95 * 15;
    return textShort + textStandard + images + video;
  }, []);

  // 预览表格数据
  const previewData = useMemo(() => {
    const items = COST_ITEMS.map(item => {
      const fee = item.cost * feeRate;
      const price = item.cost + fee;
      const points = calcPoints(item.cost);
      return { ...item, fee, price, points };
    });
    const projectFee = fullProjectCost * feeRate;
    const projectPrice = fullProjectCost + projectFee;
    const projectPoints = calcPoints(fullProjectCost);
    items.push({
      label: '完整项目(10角色+30分镜+15秒视频)',
      cost: fullProjectCost,
      fee: projectFee,
      price: projectPrice,
      points: projectPoints,
    });
    return items;
  }, [feeRate, fullProjectCost]);

  // 成本覆盖计算
  const coverageCalc = useMemo(() => {
    const projectData = previewData[previewData.length - 1];
    const perProjectRevenue = projectData.price;
    const perProjectCost = projectData.cost;
    const perProjectProfit = perProjectRevenue - perProjectCost;
    const monthlyTotalProfit = perProjectProfit * expectedMonthlyProjects;
    const canCoverCost = monthlyTotalProfit >= monthlyFixedCost;
    const breakEvenProjects = perProjectProfit > 0 ? Math.ceil(monthlyFixedCost / perProjectProfit) : Infinity;
    const netIncome = monthlyTotalProfit - monthlyFixedCost;

    return {
      perProjectRevenue,
      perProjectCost,
      perProjectProfit,
      monthlyTotalProfit,
      canCoverCost,
      breakEvenProjects,
      netIncome
    };
  }, [previewData, monthlyFixedCost, expectedMonthlyProjects]);

  const hasChanges = feeRate !== originalFeeRate;

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-white/5 rounded-lg w-48" />
          <div className="h-40 bg-white/5 rounded-2xl" />
          <div className="h-60 bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 bg-linear-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            计费配置
          </h1>
          <p className="text-white/50 mt-2 text-sm">管理积分计费参数、服务费率和成本覆盖分析</p>
        </div>
        <Button
          size="sm"
          variant="flat"
          startContent={<RefreshCw className="w-4 h-4" />}
          onPress={fetchConfigs}
          className="bg-white/5 text-white/70 hover:bg-white/10"
        >
          刷新
        </Button>
      </div>

      {/* 上半部分：费率配置 + 积分单价 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 服务费率配置 */}
        <Card className="lg:col-span-2 bg-white/3 border border-white/6 shadow-none">
          <CardBody className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-lg">服务费率</h2>
                  <p className="text-white/40 text-xs">应用于所有 AI 服务的成本加成比例</p>
                </div>
              </div>
              {hasChanges && (
                <Chip size="sm" variant="flat" className="bg-amber-500/15 text-amber-400 border-amber-500/20">
                  未保存
                </Chip>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="text-white/60 text-sm mb-2 block">费率百分比</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={feeRateInput}
                      onValueChange={handleFeeRateInputChange}
                      min={0}
                      max={300}
                      step={1}
                      endContent={<span className="text-white/40 text-sm">%</span>}
                      classNames={{
                        base: 'max-w-[160px]',
                        input: 'text-white text-lg font-semibold',
                        inputWrapper: 'bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.08] group-data-[focus=true]:bg-white/[0.08]',
                      }}
                    />
                    <span className="text-white/30 text-sm">= 数据库值 {feeRate.toFixed(2)}</span>
                  </div>
                </div>
                <Button
                  color="primary"
                  startContent={<Save className="w-4 h-4" />}
                  onPress={handleSaveFeeRate}
                  isLoading={saving}
                  isDisabled={!hasChanges}
                  className="bg-linear-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-600/20"
                >
                  保存费率
                </Button>
              </div>

              <Slider
                aria-label="服务费率"
                step={1}
                minValue={0}
                maxValue={300}
                value={parseFloat(feeRateInput) || 0}
                onChange={handleSliderChange}
                className="max-w-full"
                classNames={{
                  track: 'bg-white/10',
                  filler: 'bg-gradient-to-r from-violet-500 to-purple-500',
                  thumb: 'bg-white shadow-md',
                }}
                showTooltip
                tooltipProps={{
                  content: `${feeRateInput}%`,
                }}
              />

              <div className="flex items-center gap-2 text-xs text-white/40">
                <Info className="w-3 h-3 shrink-0" />
                <span>公式：积分 = ⌈成本 × (1 + 服务费率) ÷ 积分单价⌉，后端限制范围 0~200%，超过请谨慎设置</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 积分单价显示 */}
        <Card className="bg-white/3 border border-white/6 shadow-none">
          <CardBody className="p-6 flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
              <h2 className="text-white font-semibold text-lg">积分单价</h2>
            </div>
            <div className="space-y-4">
              <div className="bg-white/3 rounded-xl p-4 border border-white/6">
                <div className="text-3xl font-bold text-white">¥0.01</div>
                <div className="text-white/40 text-sm mt-1">每积分内部成本价</div>
              </div>
              <div className="bg-amber-500/6 rounded-xl p-4 border border-amber-500/20">
                <div className="text-3xl font-bold text-amber-400">¥0.02</div>
                <div className="text-white/40 text-sm mt-1">每积分充值售价（用户购买价）</div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="text-white/40 text-xs mb-1">充值价目表（¥0.02/积分）</div>
                <div className="flex justify-between text-white/50">
                  <span>500 积分</span>
                  <span className="text-amber-400/80">¥{(500 * POINT_PURCHASE_PRICE).toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>2,500 积分</span>
                  <span className="text-amber-400/80">¥{(2500 * POINT_PURCHASE_PRICE).toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>5,000 积分</span>
                  <span className="text-amber-400/80">¥{(5000 * POINT_PURCHASE_PRICE).toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>25,000 积分</span>
                  <span className="text-amber-400/80">¥{(25000 * POINT_PURCHASE_PRICE).toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>50,000 积分</span>
                  <span className="text-amber-400/80">¥{(50000 * POINT_PURCHASE_PRICE).toFixed(0)}</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 实时预览表格 */}
      <Card className="bg-white/3 border border-white/6 shadow-none">
        <CardBody className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <Calculator className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">成本 → 积分 对照表</h2>
              <p className="text-white/40 text-xs">当前费率 {feeRateInput}% 下各服务的定价预览</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="text-left text-white/50 text-xs font-medium py-3 px-4">AI 服务</th>
                  <th className="text-right text-white/50 text-xs font-medium py-3 px-4">成本</th>
                  <th className="text-right text-white/50 text-xs font-medium py-3 px-4">服务费</th>
                  <th className="text-right text-white/50 text-xs font-medium py-3 px-4">售价</th>
                  <th className="text-right text-white/50 text-xs font-medium py-3 px-4">积分消耗</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((item, idx) => {
                  const isProject = idx === previewData.length - 1;
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-white/4 transition-colors hover:bg-white/2 ${isProject ? 'bg-white/2' : ''}`}
                    >
                      <td className={`py-3.5 px-4 text-sm ${isProject ? 'text-white font-semibold' : 'text-white/80'}`}>
                        {isProject && <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full mr-2 relative -top-px" />}
                        {item.label}
                      </td>
                      <td className="py-3.5 px-4 text-sm text-white/60 text-right font-mono">
                        ¥{item.cost.toFixed(3)}
                      </td>
                      <td className="py-3.5 px-4 text-sm text-orange-400/80 text-right font-mono">
                        +¥{item.fee.toFixed(3)}
                      </td>
                      <td className="py-3.5 px-4 text-sm text-white/80 text-right font-mono">
                        ¥{item.price.toFixed(3)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-semibold font-mono ${
                          isProject
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-violet-500/10 text-violet-400'
                        }`}>
                          {item.points.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* 成本覆盖计算器 */}
      <Card className="bg-white/3 border border-white/6 shadow-none">
        <CardBody className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">成本覆盖计算器</h2>
              <p className="text-white/40 text-xs">分析当前费率是否能覆盖月度固定成本</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 输入区域 */}
            <div className="space-y-4">
              <div>
                <label className="text-white/60 text-sm mb-2 block">月度固定成本</label>
                <Input
                  type="number"
                  value={String(monthlyFixedCost)}
                  onValueChange={(v) => setMonthlyFixedCost(parseFloat(v) || 0)}
                  startContent={<span className="text-white/40 text-sm">¥</span>}
                  description="基础设施 ¥2,900 + 运维运营 ¥5,500"
                  classNames={{
                    input: 'text-white font-semibold',
                    inputWrapper: 'bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.08] group-data-[focus=true]:bg-white/[0.08]',
                    description: 'text-white/30',
                  }}
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-2 block">预期月项目量</label>
                <Input
                  type="number"
                  value={String(expectedMonthlyProjects)}
                  onValueChange={(v) => setExpectedMonthlyProjects(parseInt(v) || 0)}
                  endContent={<span className="text-white/40 text-sm">个</span>}
                  classNames={{
                    input: 'text-white font-semibold',
                    inputWrapper: 'bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.08] group-data-[focus=true]:bg-white/[0.08]',
                  }}
                />
              </div>

              <Divider className="bg-white/6" />

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">单项目成本</span>
                  <span className="text-white/70 font-mono">¥{coverageCalc.perProjectCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">单项目售价</span>
                  <span className="text-white/70 font-mono">¥{coverageCalc.perProjectRevenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">单项目利润</span>
                  <span className="text-emerald-400 font-mono font-semibold">
                    +¥{coverageCalc.perProjectProfit.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* 结果区域 */}
            <div className="space-y-4">
              <div className={`rounded-xl p-5 border ${
                coverageCalc.canCoverCost
                  ? 'bg-emerald-500/6 border-emerald-500/20'
                  : 'bg-red-500/6 border-red-500/20'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {coverageCalc.canCoverCost ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={`font-semibold ${
                    coverageCalc.canCoverCost ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {coverageCalc.canCoverCost ? '可以覆盖固定成本' : '无法覆盖固定成本'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">月度总利润</span>
                    <span className="text-white font-mono font-semibold">
                      ¥{coverageCalc.monthlyTotalProfit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">月度固定成本</span>
                    <span className="text-white/70 font-mono">
                      -¥{monthlyFixedCost.toFixed(2)}
                    </span>
                  </div>
                  <Divider className="bg-white/8" />
                  <div className="flex justify-between">
                    <span className="text-white/50">月度净收入</span>
                    <span className={`font-mono font-bold text-base ${
                      coverageCalc.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {coverageCalc.netIncome >= 0 ? '+' : ''}¥{coverageCalc.netIncome.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white/3 rounded-xl p-4 border border-white/6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-white/70 font-semibold text-sm">盈亏平衡点</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  {coverageCalc.breakEvenProjects === Infinity
                    ? '—'
                    : `${coverageCalc.breakEvenProjects} 个项目/月`
                  }
                </div>
                <p className="text-white/40 text-xs mt-1">
                  达到此项目量即可覆盖 ¥{monthlyFixedCost.toLocaleString()} 的月度固定成本
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default BillingConfig;
