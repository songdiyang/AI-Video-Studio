import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, Button, Input, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Switch, Textarea, Pagination } from '@heroui/react';
import { CreditCard, Plus, Edit, Trash2, Save, RefreshCw, Users, Crown } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  adminFetchPlans,
  adminCreatePlan,
  adminUpdatePlan,
  adminDeletePlan,
  adminFetchSubscriptions,
  type SubscriptionPlan,
  type AdminSubscription
} from '../../services/subscriptions';

const SubscriptionManagement: React.FC = () => {
  // 套餐管理状态
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planFormData, setPlanFormData] = useState({
    name: '',
    display_name: '',
    price_monthly: 0,
    price_yearly: 0,
    max_projects: 5,
    max_api_calls_monthly: 1000,
    max_team_members: 1,
    features_json: '',
    is_active: true,
    sort_order: 0
  });

  // 订阅列表状态
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [subscriptionsTotal, setSubscriptionsTotal] = useState(0);
  const [subscriptionsPage, setSubscriptionsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 获取套餐列表
  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const data = await adminFetchPlans();
      setPlans(data);
    } catch (error) {
      console.error('获取套餐列表失败:', error);
      showToast('获取套餐列表失败', 'error');
    } finally {
      setPlansLoading(false);
    }
  }, [showToast]);

  // 获取订阅列表
  const fetchSubscriptions = useCallback(async () => {
    setSubscriptionsLoading(true);
    try {
      const data = await adminFetchSubscriptions({
        page: subscriptionsPage,
        status: statusFilter || undefined
      });
      setSubscriptions(data.subscriptions || []);
      setSubscriptionsTotal(data.total || 0);
    } catch (error) {
      console.error('获取订阅列表失败:', error);
      showToast('获取订阅列表失败', 'error');
    } finally {
      setSubscriptionsLoading(false);
    }
  }, [subscriptionsPage, statusFilter, showToast]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  // 打开套餐编辑模态框
  const handleOpenPlanModal = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanFormData({
        name: plan.name,
        display_name: plan.display_name,
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        max_projects: plan.max_projects,
        max_api_calls_monthly: plan.max_api_calls_monthly,
        max_team_members: plan.max_team_members,
        features_json: Array.isArray(plan.features_json) ? plan.features_json.join('\n') : '',
        is_active: plan.is_active,
        sort_order: plan.sort_order
      });
    } else {
      setEditingPlan(null);
      setPlanFormData({
        name: '',
        display_name: '',
        price_monthly: 0,
        price_yearly: 0,
        max_projects: 5,
        max_api_calls_monthly: 1000,
        max_team_members: 1,
        features_json: '',
        is_active: true,
        sort_order: plans.length
      });
    }
    setShowPlanModal(true);
  };

  // 保存套餐
  const handleSavePlan = async () => {
    if (!planFormData.name.trim() || !planFormData.display_name.trim()) {
      showToast('套餐名称不能为空', 'error');
      return;
    }

    try {
      const featuresArray = planFormData.features_json
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0);

      const payload = {
        ...planFormData,
        features_json: featuresArray
      };

      if (editingPlan) {
        await adminUpdatePlan(editingPlan.id, payload);
        showToast('套餐更新成功', 'success');
      } else {
        await adminCreatePlan(payload);
        showToast('套餐创建成功', 'success');
      }

      await fetchPlans();
      setShowPlanModal(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  // 删除套餐
  const handleDeletePlan = async (plan: SubscriptionPlan) => {
    const confirmed = await confirm({
      title: '删除套餐',
      message: `确定要删除套餐 "${plan.display_name}" 吗？此操作不可撤销。`,
      type: 'danger',
      confirmText: '删除'
    });

    if (!confirmed) return;

    try {
      await adminDeletePlan(plan.id);
      showToast('套餐已删除', 'success');
      await fetchPlans();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  // 切换套餐启用状态
  const handleTogglePlanActive = async (plan: SubscriptionPlan) => {
    try {
      await adminUpdatePlan(plan.id, { is_active: !plan.is_active });
      showToast(plan.is_active ? '套餐已禁用' : '套餐已启用', 'success');
      await fetchPlans();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
      case 'trial':
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-400';
      case 'expired':
        return 'bg-orange-500/15 text-orange-700 dark:text-orange-400';
      case 'cancelled':
        return 'bg-slate-500/15 text-slate-600 dark:text-slate-400';
      default:
        return 'bg-slate-500/15 text-slate-600 dark:text-slate-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return '生效中';
      case 'trial':
        return '试用中';
      case 'expired':
        return '已过期';
      case 'cancelled':
        return '已取消';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  const formatPrice = (price: number) => {
    return `¥${price.toLocaleString()}`;
  };

  const totalPages = Math.ceil(subscriptionsTotal / 20);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>订阅管理</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>管理订阅套餐和用户订阅</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="flat"
              className="text-default-600 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
              startContent={<RefreshCw className="w-4 h-4" />}
              onPress={() => { fetchPlans(); fetchSubscriptions(); }}
            >
              刷新
            </Button>
            <Button
              className="bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold"
              startContent={<Plus className="w-4 h-4" />}
              onPress={() => handleOpenPlanModal()}
            >
              新增套餐
            </Button>
          </div>
        </div>

        {/* 套餐管理 */}
        <Card className="border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <CardBody className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>套餐列表</h2>
            </div>

            <Table
              aria-label="套餐列表"
              classNames={{
                wrapper: 'bg-transparent shadow-none',
                th: 'bg-default-100 text-default-600 font-semibold',
                td: 'text-default-700'
              }}
            >
              <TableHeader>
                <TableColumn>套餐名称</TableColumn>
                <TableColumn>月价</TableColumn>
                <TableColumn>年价</TableColumn>
                <TableColumn>项目上限</TableColumn>
                <TableColumn>API上限/月</TableColumn>
                <TableColumn>团队成员</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>操作</TableColumn>
              </TableHeader>
              <TableBody 
                emptyContent={plansLoading ? '加载中...' : '暂无套餐'}
                isLoading={plansLoading}
              >
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{plan.display_name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{plan.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">{formatPrice(plan.price_monthly)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">{formatPrice(plan.price_yearly)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{plan.max_projects === -1 ? '无限' : plan.max_projects}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{plan.max_api_calls_monthly === -1 ? '无限' : plan.max_api_calls_monthly.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{plan.max_team_members === -1 ? '无限' : plan.max_team_members}</span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        size="sm"
                        isSelected={plan.is_active}
                        onValueChange={() => handleTogglePlanActive(plan)}
                        classNames={{
                          wrapper: 'group-data-[selected=true]:bg-emerald-500'
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          className="bg-blue-500/15 text-blue-700 dark:text-blue-400"
                          startContent={<Edit className="w-3 h-3" />}
                          onPress={() => handleOpenPlanModal(plan)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          className="bg-red-500/15 text-red-700 dark:text-red-400"
                          startContent={<Trash2 className="w-3 h-3" />}
                          onPress={() => handleDeletePlan(plan)}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        {/* 用户订阅总览 */}
        <Card className="border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <CardBody className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>用户订阅</h2>
                <Chip size="sm" variant="flat" className="bg-default-200 text-default-600">
                  共 {subscriptionsTotal} 条
                </Chip>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setSubscriptionsPage(1);
                  }}
                  className="rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                >
                  <option value="">全部状态</option>
                  <option value="active">生效中</option>
                  <option value="trial">试用中</option>
                  <option value="expired">已过期</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
            </div>

            <Table
              aria-label="用户订阅列表"
              classNames={{
                wrapper: 'bg-transparent shadow-none',
                th: 'bg-default-100 text-default-600 font-semibold',
                td: 'text-default-700'
              }}
            >
              <TableHeader>
                <TableColumn>用户</TableColumn>
                <TableColumn>套餐</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>计费周期</TableColumn>
                <TableColumn>到期日期</TableColumn>
                <TableColumn>API用量</TableColumn>
                <TableColumn>订阅时间</TableColumn>
              </TableHeader>
              <TableBody 
                emptyContent={subscriptionsLoading ? '加载中...' : '暂无订阅记录'}
                isLoading={subscriptionsLoading}
              >
                {subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <span style={{ color: 'var(--text-primary)' }}>{sub.user_email}</span>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" className="bg-purple-500/15 text-purple-700 dark:text-purple-400">
                        {sub.plan_name}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" className={getStatusColor(sub.status)}>
                        {getStatusLabel(sub.status)}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {sub.billing_cycle === 'yearly' ? '年付' : '月付'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span style={{ color: 'var(--text-secondary)' }}>{formatDate(sub.current_period_end)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-blue-700 dark:text-blue-400">{sub.api_calls_used.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(sub.created_at)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex justify-center mt-4">
                <Pagination
                  total={totalPages}
                  page={subscriptionsPage}
                  onChange={setSubscriptionsPage}
                  classNames={{
                    wrapper: 'gap-2',
                    item: 'bg-default-100 text-default-700 hover:bg-default-200',
                    cursor: 'bg-purple-600 text-white'
                  }}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 套餐编辑 Modal */}
      <Modal isOpen={showPlanModal} onOpenChange={setShowPlanModal} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {editingPlan ? '编辑套餐' : '新增套餐'}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="套餐标识"
                      placeholder="例如: starter, creator"
                      value={planFormData.name}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, name: value })}
                      isDisabled={!!editingPlan}
                      description="唯一标识符，创建后不可修改"
                    />
                    <Input
                      label="显示名称"
                      placeholder="例如: 入门版"
                      value={planFormData.display_name}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, display_name: value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="number"
                      label="月付价格 (¥)"
                      value={String(planFormData.price_monthly)}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, price_monthly: parseFloat(value) || 0 })}
                    />
                    <Input
                      type="number"
                      label="年付价格 (¥)"
                      value={String(planFormData.price_yearly)}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, price_yearly: parseFloat(value) || 0 })}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      type="number"
                      label="项目上限"
                      description="-1 表示无限"
                      value={String(planFormData.max_projects)}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, max_projects: parseInt(value) || 0 })}
                    />
                    <Input
                      type="number"
                      label="每月 API 调用上限"
                      description="-1 表示无限"
                      value={String(planFormData.max_api_calls_monthly)}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, max_api_calls_monthly: parseInt(value) || 0 })}
                    />
                    <Input
                      type="number"
                      label="团队成员上限"
                      description="-1 表示无限"
                      value={String(planFormData.max_team_members)}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, max_team_members: parseInt(value) || 0 })}
                    />
                  </div>

                  <Textarea
                    label="功能特性"
                    placeholder="每行一个功能特性，例如：&#10;完整工作流&#10;模板库访问&#10;优先技术支持"
                    value={planFormData.features_json}
                    onValueChange={(value) => setPlanFormData({ ...planFormData, features_json: value })}
                    minRows={4}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="number"
                      label="排序"
                      description="数字越小排越前"
                      value={String(planFormData.sort_order)}
                      onValueChange={(value) => setPlanFormData({ ...planFormData, sort_order: parseInt(value) || 0 })}
                    />
                    <div className="flex items-center gap-3 p-3 rounded-lg self-end" style={{ background: 'var(--bg-elevated)' }}>
                      <Switch
                        isSelected={planFormData.is_active}
                        onValueChange={(value) => setPlanFormData({ ...planFormData, is_active: value })}
                      />
                      <div>
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>启用套餐</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>禁用后用户无法订阅</p>
                      </div>
                    </div>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  取消
                </Button>
                <Button
                  className="bg-gradient-to-r from-purple-500 to-pink-600 text-white"
                  startContent={<Save className="w-4 h-4" />}
                  onPress={handleSavePlan}
                >
                  保存
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default SubscriptionManagement;
