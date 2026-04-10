import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, Button, Input, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Switch, Progress } from '@heroui/react';
import { Gauge, Plus, Edit, Trash2, Save, RefreshCw, Activity } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface RateLimitConfig {
  id: number;
  role: string;
  max_concurrent_text: number;
  max_concurrent_image: number;
  max_concurrent_video: number;
  timeout_seconds: number;
  retry_delay_ms: number;
  max_retries: number;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface SemaphoreStats {
  acquired: number;
  released: number;
  current: number;
  waiting: number;
  maxConcurrent: number;
  maxWaitingReached: number;
  avgWaitTime: number;
}

interface RoleStats {
  text: SemaphoreStats;
  image: SemaphoreStats;
  video: SemaphoreStats;
}

interface RateLimitStats {
  roleStats: Record<string, RoleStats>;
  configLoaded: boolean;
}

const RateLimitManagement: React.FC = () => {
  const [configs, setConfigs] = useState<RateLimitConfig[]>([]);
  const [stats, setStats] = useState<RateLimitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<RateLimitConfig | null>(null);
  const [formData, setFormData] = useState({
    role: '',
    max_concurrent_text: 10,
    max_concurrent_image: 5,
    max_concurrent_video: 3,
    timeout_seconds: 300,
    retry_delay_ms: 60000,
    max_retries: 3,
    description: '',
    is_active: true
  });
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/rate-limit-configs', {
        headers: getAdminAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch (error) {
      console.error('获取限流配置失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/rate-limit-stats', {
        headers: getAdminAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('获取限流统计失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
    fetchStats();
    // 每 5 秒刷新统计
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchConfigs, fetchStats]);

  const handleOpenModal = (config?: RateLimitConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        role: config.role,
        max_concurrent_text: config.max_concurrent_text,
        max_concurrent_image: config.max_concurrent_image,
        max_concurrent_video: config.max_concurrent_video,
        timeout_seconds: config.timeout_seconds,
        retry_delay_ms: config.retry_delay_ms,
        max_retries: config.max_retries,
        description: config.description || '',
        is_active: !!config.is_active
      });
    } else {
      setEditingConfig(null);
      setFormData({
        role: '',
        max_concurrent_text: 10,
        max_concurrent_image: 5,
        max_concurrent_video: 3,
        timeout_seconds: 300,
        retry_delay_ms: 60000,
        max_retries: 3,
        description: '',
        is_active: true
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingConfig(null);
  };

  const handleSave = async () => {
    if (!formData.role.trim()) {
      showToast('角色名称不能为空', 'error');
      return;
    }

    try {
      const url = editingConfig
        ? `/api/admin/rate-limit-configs/${editingConfig.id}`
        : '/api/admin/rate-limit-configs';

      const res = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: getAdminAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          ...formData,
          is_active: formData.is_active ? 1 : 0
        })
      });

      if (res.ok) {
        showToast(editingConfig ? '配置更新成功' : '配置创建成功', 'success');
        await fetchConfigs();
        handleCloseModal();
      } else {
        const data = await res.json();
        showToast(data.message || '操作失败', 'error');
      }
    } catch (error) {
      console.error('保存配置失败:', error);
      showToast('保存配置失败，请稍后重试', 'error');
    }
  };

  const handleDelete = async (id: number, role: string) => {
    if (role === 'default') {
      showToast('默认配置不能删除', 'error');
      return;
    }

    const confirmed = await confirm({
      title: '删除限流配置',
      message: `确定要删除角色 "${role}" 的限流配置吗？`,
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/rate-limit-configs/${id}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders()
      });

      if (res.ok) {
        showToast('配置已删除', 'success');
        await fetchConfigs();
      } else {
        const data = await res.json();
        showToast(data.message || '删除失败', 'error');
      }
    } catch (error) {
      console.error('删除配置失败:', error);
      showToast('删除配置失败，请稍后重试', 'error');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-500/10 text-purple-400';
      case 'vip':
        return 'bg-amber-500/10 text-amber-400';
      case 'default':
        return 'bg-slate-500/10 text-slate-400';
      default:
        return 'bg-blue-500/10 text-blue-400';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理员';
      case 'vip':
        return 'VIP用户';
      case 'user':
        return '普通用户';
      case 'default':
        return '默认配置';
      default:
        return role;
    }
  };

  const renderStatsCard = (roleStats: RoleStats, roleName: string) => {
    return (
      <Card className="bg-slate-800/50 border border-slate-700/50">
        <CardBody className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">{getRoleLabel(roleName)}</span>
            <Chip size="sm" className={getRoleColor(roleName)}>{roleName}</Chip>
          </div>
          <div className="space-y-3">
            {/* 文本模型 */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>文本模型</span>
                <span>{roleStats.text.current}/{roleStats.text.maxConcurrent} (等待: {roleStats.text.waiting})</span>
              </div>
              <Progress 
                size="sm" 
                value={(roleStats.text.current / roleStats.text.maxConcurrent) * 100}
                className="h-1.5"
                classNames={{
                  indicator: 'bg-blue-500'
                }}
              />
            </div>
            {/* 图片模型 */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>图片模型</span>
                <span>{roleStats.image.current}/{roleStats.image.maxConcurrent} (等待: {roleStats.image.waiting})</span>
              </div>
              <Progress 
                size="sm" 
                value={(roleStats.image.current / roleStats.image.maxConcurrent) * 100}
                className="h-1.5"
                classNames={{
                  indicator: 'bg-green-500'
                }}
              />
            </div>
            {/* 视频模型 */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>视频模型</span>
                <span>{roleStats.video.current}/{roleStats.video.maxConcurrent} (等待: {roleStats.video.waiting})</span>
              </div>
              <Progress 
                size="sm" 
                value={(roleStats.video.current / roleStats.video.maxConcurrent) * 100}
                className="h-1.5"
                classNames={{
                  indicator: 'bg-purple-500'
                }}
              />
            </div>
          </div>
        </CardBody>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
              <Gauge className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">AI 限流配置</h1>
              <p className="text-sm text-slate-400">按角色配置 AI 调用并发限制与重试策略</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="flat"
              className="bg-slate-700/50 text-slate-300"
              startContent={<RefreshCw className="w-4 h-4" />}
              onPress={() => { fetchConfigs(); fetchStats(); }}
            >
              刷新
            </Button>
            <Button
              className="bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold"
              startContent={<Plus className="w-4 h-4" />}
              onPress={() => handleOpenModal()}
            >
              新增角色配置
            </Button>
          </div>
        </div>

        {/* 实时统计卡片 */}
        {stats && Object.keys(stats.roleStats).length > 0 && (
          <Card className="bg-slate-900/80 border border-slate-700/50">
            <CardBody className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-green-400" />
                <h2 className="text-lg font-semibold text-slate-100">实时并发统计</h2>
                <Chip size="sm" variant="flat" className="bg-green-500/10 text-green-400">自动刷新</Chip>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(stats.roleStats).map(([role, roleStats]) => (
                  <div key={role}>
                    {renderStatsCard(roleStats, role)}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* 配置表格 */}
        <Card className="bg-slate-900/80 border border-slate-700/50">
          <CardBody className="p-6">
            <Table
              aria-label="限流配置表格"
              classNames={{
                wrapper: "bg-transparent shadow-none",
                th: "bg-slate-800/60 text-slate-400 font-semibold",
                td: "text-slate-300"
              }}
            >
              <TableHeader>
                <TableColumn>角色</TableColumn>
                <TableColumn>文本并发</TableColumn>
                <TableColumn>图片并发</TableColumn>
                <TableColumn>视频并发</TableColumn>
                <TableColumn>超时(秒)</TableColumn>
                <TableColumn>重试</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>操作</TableColumn>
              </TableHeader>
              <TableBody emptyContent="暂无配置">
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Chip size="sm" variant="flat" className={getRoleColor(config.role)}>
                          {config.role}
                        </Chip>
                        <span className="text-xs text-slate-500">{getRoleLabel(config.role)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-blue-400">{config.max_concurrent_text}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-green-400">{config.max_concurrent_image}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-purple-400">{config.max_concurrent_video}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-slate-400">{config.timeout_seconds}s</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-400">
                        {config.max_retries}次 / {config.retry_delay_ms / 1000}s
                      </span>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        size="sm" 
                        variant="flat"
                        className={config.is_active ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-400'}
                      >
                        {config.is_active ? '启用' : '禁用'}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          className="bg-blue-500/10 text-blue-400"
                          startContent={<Edit className="w-3 h-3" />}
                          onPress={() => handleOpenModal(config)}
                        >
                          编辑
                        </Button>
                        {config.role !== 'default' && (
                          <Button
                            size="sm"
                            variant="flat"
                            className="bg-red-500/10 text-red-400"
                            startContent={<Trash2 className="w-3 h-3" />}
                            onPress={() => handleDelete(config.id, config.role)}
                          >
                            删除
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      {/* 编辑/新增 Modal */}
      <Modal isOpen={showModal} onOpenChange={handleCloseModal} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {editingConfig ? '编辑限流配置' : '新增角色限流配置'}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="角色标识"
                    placeholder="例如: user, admin, vip, premium"
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                    isDisabled={!!editingConfig}
                    description="角色标识应与用户表中的 role 字段匹配"
                  />
                  
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      type="number"
                      label="文本模型并发数"
                      value={String(formData.max_concurrent_text)}
                      onValueChange={(value) => setFormData({ ...formData, max_concurrent_text: parseInt(value) || 0 })}
                      startContent={<span className="text-blue-400 text-xs">TEXT</span>}
                    />
                    <Input
                      type="number"
                      label="图片模型并发数"
                      value={String(formData.max_concurrent_image)}
                      onValueChange={(value) => setFormData({ ...formData, max_concurrent_image: parseInt(value) || 0 })}
                      startContent={<span className="text-green-400 text-xs">IMG</span>}
                    />
                    <Input
                      type="number"
                      label="视频模型并发数"
                      value={String(formData.max_concurrent_video)}
                      onValueChange={(value) => setFormData({ ...formData, max_concurrent_video: parseInt(value) || 0 })}
                      startContent={<span className="text-purple-400 text-xs">VID</span>}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      type="number"
                      label="超时时间(秒)"
                      value={String(formData.timeout_seconds)}
                      onValueChange={(value) => setFormData({ ...formData, timeout_seconds: parseInt(value) || 300 })}
                      description="等待队列的超时时间"
                    />
                    <Input
                      type="number"
                      label="重试延迟(毫秒)"
                      value={String(formData.retry_delay_ms)}
                      onValueChange={(value) => setFormData({ ...formData, retry_delay_ms: parseInt(value) || 60000 })}
                      description="429错误后的重试延迟"
                    />
                    <Input
                      type="number"
                      label="最大重试次数"
                      value={String(formData.max_retries)}
                      onValueChange={(value) => setFormData({ ...formData, max_retries: parseInt(value) || 3 })}
                      description="限流错误的最大重试次数"
                    />
                  </div>

                  <Input
                    label="描述"
                    placeholder="配置说明"
                    value={formData.description}
                    onValueChange={(value) => setFormData({ ...formData, description: value })}
                  />

                  <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                    <Switch
                      isSelected={formData.is_active}
                      onValueChange={(value) => setFormData({ ...formData, is_active: value })}
                    />
                    <div>
                      <p className="text-sm text-slate-200">启用此配置</p>
                      <p className="text-xs text-slate-400">禁用后该角色将使用默认配置</p>
                    </div>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  取消
                </Button>
                <Button
                  className="bg-gradient-to-r from-orange-500 to-red-600 text-white"
                  startContent={<Save className="w-4 h-4" />}
                  onPress={handleSave}
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

export default RateLimitManagement;
