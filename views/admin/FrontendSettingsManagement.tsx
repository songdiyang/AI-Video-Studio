import React, { useState, useEffect } from 'react';
import { Card, CardBody, Button, Input, Textarea, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem } from '@heroui/react';
import { Monitor, Plus, Edit, Trash2, Save, Code } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface FrontendConfig {
  id: number;
  config_key: string;
  config_name: string;
  config_type: 'options' | 'key_value' | 'text' | 'number' | 'boolean';
  config_value: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

const FrontendSettingsManagement: React.FC = () => {
  const [configs, setConfigs] = useState<FrontendConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<FrontendConfig | null>(null);
  const [formData, setFormData] = useState({
    config_key: '',
    config_name: '',
    config_type: 'key_value' as 'options' | 'key_value' | 'text' | 'number' | 'boolean',
    config_value: '',
    description: '',
    is_active: 1
  });
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/system-configs/admin/all', {
        headers: getAdminAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch (error) {
      console.error('获取前端配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (config?: FrontendConfig) => {
    if (config) {
      setEditingConfig(config);
      // 如果 config_value 是对象或数组，转换为 JSON 字符串用于编辑
      const configValueStr = typeof config.config_value === 'string'
        ? config.config_value
        : JSON.stringify(config.config_value, null, 2);

      setFormData({
        config_key: config.config_key,
        config_name: config.config_name,
        config_type: config.config_type,
        config_value: configValueStr,
        description: config.description || '',
        is_active: config.is_active
      });
    } else {
      setEditingConfig(null);
      setFormData({
        config_key: '',
        config_name: '',
        config_type: 'key_value',
        config_value: '',
        description: '',
        is_active: 1
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingConfig(null);
  };

  const handleSave = async () => {
    try {
      const url = editingConfig
        ? `/api/system-configs/admin/${editingConfig.id}`
        : '/api/system-configs/admin';

      const res = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: getAdminAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        await fetchConfigs();
        handleCloseModal();
      }
    } catch (error) {
      console.error('保存配置失败:', error);
      showToast('保存配置失败，请稍后重试', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: '删除配置',
      message: '确定要删除这个配置吗？',
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/system-configs/admin/${id}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders()
      });

      if (res.ok) {
        await fetchConfigs();
      }
    } catch (error) {
      console.error('删除配置失败:', error);
      showToast('删除配置失败，请稍后重试', 'error');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const parseConfigValue = (value: string | any, type: string) => {
    // 如果 value 已经是对象或数组，直接处理，不需要 JSON.parse
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch (e) {
        return value;
      }
    }

    if (Array.isArray(parsed)) {
      if (type === 'options') {
        return parsed.map((opt) => {
          if (typeof opt === 'object' && opt !== null) {
            return opt.label || opt.value || JSON.stringify(opt);
          }
          return String(opt);
        }).join(', ');
      }
      return parsed.map(item => {
        if (typeof item === 'object' && item !== null) {
          return JSON.stringify(item);
        }
        return String(item);
      }).join(', ');
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
    return String(parsed);
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      options: '选项列表',
      key_value: '键值对',
      text: '文本',
      number: '数字',
      boolean: '布尔值'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      options: 'bg-blue-500/10 text-blue-400',
      key_value: 'bg-purple-500/10 text-purple-400',
      text: 'bg-green-500/10 text-green-400',
      number: 'bg-orange-500/10 text-orange-400',
      boolean: 'bg-pink-500/10 text-pink-400'
    };
    return colors[type] || 'bg-slate-500/10 text-slate-400';
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
            <div className="w-12 h-12 bg-linear-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Monitor className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">前端设置</h1>
              <p className="text-sm text-slate-400">管理全局前端配置，对所有用户生效</p>
            </div>
          </div>
          <Button
            className="bg-linear-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/25"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => handleOpenModal()}
          >
            新增配置
          </Button>
        </div>

        {/* 配置列表 */}
        <div className="grid grid-cols-1 gap-4">
          {configs.length === 0 ? (
            <Card className="bg-slate-900/80 border border-slate-700/50">
              <CardBody className="p-12">
                <div className="text-center text-slate-500">
                  <Code className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">暂无配置</p>
                  <p className="text-sm mt-2">点击"新增配置"按钮创建第一个前端配置</p>
                </div>
              </CardBody>
            </Card>
          ) : (
            configs.map((config) => (
              <Card key={config.id} className="bg-slate-900/80 border border-slate-700/50 hover:border-indigo-500/30 transition-all">
                <CardBody className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Chip size="sm" variant="flat" className="bg-indigo-500/10 text-indigo-400 font-mono font-semibold">
                          {config.config_key}
                        </Chip>
                        <Chip size="sm" variant="flat" className={getTypeColor(config.config_type)}>
                          {getTypeLabel(config.config_type)}
                        </Chip>
                        {config.is_active === 0 && (
                          <Chip size="sm" variant="flat" className="bg-red-500/10 text-red-400">
                            已禁用
                          </Chip>
                        )}
                      </div>

                      <h3 className="text-lg font-semibold text-slate-100 mb-2">
                        {config.config_name}
                      </h3>

                      {config.description && (
                        <p className="text-sm text-slate-400 mb-3">
                          {config.description}
                        </p>
                      )}

                      <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
                        <div className="text-xs text-slate-500 mb-1">配置值</div>
                        <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap break-all">
                          {parseConfigValue(config.config_value, config.config_type)}
                        </pre>
                      </div>

                      <div className="text-xs text-slate-500 mt-3">
                        更新时间：{formatDate(config.updated_at)}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                        startContent={<Edit className="w-3 h-3" />}
                        onPress={() => handleOpenModal(config)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        className="bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        startContent={<Trash2 className="w-3 h-3" />}
                        onPress={() => handleDelete(config.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* 编辑/新增弹窗 */}
      <Modal isOpen={showModal} onOpenChange={handleCloseModal} size="3xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 border-b border-slate-700/50 pb-4">
                <div className="text-xl font-bold text-slate-100">
                  {editingConfig ? '编辑配置' : '新增配置'}
                </div>
                <div className="text-sm text-slate-400 font-normal">
                  {editingConfig ? '修改现有前端配置项' : '创建新的前端配置项'}
                </div>
              </ModalHeader>
              <ModalBody className="py-6">
                <div className="space-y-4">
                  <Input
                    label="配置键"
                    placeholder="例如: theme_options, default_language"
                    value={formData.config_key}
                    onValueChange={(value) => setFormData({ ...formData, config_key: value })}
                    isDisabled={!!editingConfig}
                    description="配置的唯一标识符，创建后不可修改"
                    classNames={{
                      label: "text-slate-300 font-medium",
                      input: "bg-slate-800/60",
                      inputWrapper: "border border-slate-600/50"
                    }}
                  />

                  <Input
                    label="配置名称"
                    placeholder="例如: 主题选项, 默认语言"
                    value={formData.config_name}
                    onValueChange={(value) => setFormData({ ...formData, config_name: value })}
                    description="配置的显示名称"
                    classNames={{
                      label: "text-slate-300 font-medium",
                      input: "bg-slate-800/60",
                      inputWrapper: "border border-slate-600/50"
                    }}
                  />

                  <Select
                    label="配置类型"
                    selectedKeys={[formData.config_type]}
                    onChange={(e) => setFormData({ ...formData, config_type: e.target.value as any })}
                    description="选择配置值的数据类型"
                    classNames={{
                      label: "text-slate-300 font-medium",
                      trigger: "bg-slate-800/60 border border-slate-600/50"
                    }}
                  >
                    <SelectItem key="options">选项列表 - 用于下拉选择</SelectItem>
                    <SelectItem key="key_value">键值对 - 用于对象配置</SelectItem>
                    <SelectItem key="text">文本 - 用于字符串</SelectItem>
                    <SelectItem key="number">数字 - 用于数值</SelectItem>
                    <SelectItem key="boolean">布尔值 - 用于开关</SelectItem>
                  </Select>

                  <Textarea
                    label="配置值"
                    placeholder={
                      formData.config_type === 'options'
                        ? '[{"label": "选项1", "value": "value1"}, {"label": "选项2", "value": "value2"}]'
                        : formData.config_type === 'key_value'
                        ? '{"key1": "value1", "key2": "value2"}'
                        : formData.config_type === 'boolean'
                        ? 'true 或 false'
                        : '配置值'
                    }
                    value={formData.config_value}
                    onValueChange={(value) => setFormData({ ...formData, config_value: value })}
                    description="JSON 格式的配置值"
                    minRows={4}
                    classNames={{
                      label: "text-slate-300 font-medium",
                      input: "bg-slate-800/60 font-mono text-sm",
                      inputWrapper: "border border-slate-600/50"
                    }}
                  />

                  <Textarea
                    label="描述"
                    placeholder="配置项的说明和用途"
                    value={formData.description}
                    onValueChange={(value) => setFormData({ ...formData, description: value })}
                    minRows={2}
                    classNames={{
                      label: "text-slate-300 font-medium",
                      input: "bg-slate-800/60",
                      inputWrapper: "border border-slate-600/50"
                    }}
                  />

                  <div className="flex items-center gap-3 p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active === 1}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                    />
                    <label htmlFor="is_active" className="text-sm text-slate-300 font-medium cursor-pointer">
                      启用此配置
                    </label>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter className="border-t border-slate-700/50 pt-4">
                <Button
                  variant="flat"
                  className="bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  className="bg-linear-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/25"
                  startContent={<Save className="w-4 h-4" />}
                  onPress={handleSave}
                >
                  保存配置
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default FrontendSettingsManagement;
