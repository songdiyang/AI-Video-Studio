import React, { useEffect, useState } from 'react';
import { Card, CardBody, Button, Input, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Plus, Server, Edit, Trash2, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface ModelProvider {
  id: number;
  name: string;
  display_name: string;
  base_url: string;
  api_key: string;
  headers_template: any;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface ProviderFormData {
  name: string;
  display_name: string;
  base_url: string;
  api_key: string;
  headers_template: string;
  is_active: number;
}

const DEFAULT_FORM: ProviderFormData = {
  name: '',
  display_name: '',
  base_url: '',
  api_key: '',
  headers_template: '{}',
  is_active: 1
};

const ModelProviders: React.FC = () => {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({ ...DEFAULT_FORM });
  const [jsonError, setJsonError] = useState('');
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/admin/model-providers', {
        headers: getAdminAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers || []);
      }
    } catch (error) {
      console.error('获取平台列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateJson = (val: string) => {
    if (!val || val.trim() === '' || val.trim() === '{}') return true;
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    if (!validateJson(formData.headers_template)) {
      setJsonError('Headers 模板 JSON 格式错误');
      return;
    }
    setJsonError('');

    try {
      const payload = {
        ...formData,
        headers_template: formData.headers_template.trim() ? JSON.parse(formData.headers_template) : {}
      };

      const url = editingProvider
        ? `/api/admin/model-providers/${editingProvider.id}`
        : '/api/admin/model-providers';

      const response = await fetch(url, {
        method: editingProvider ? 'PUT' : 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast(editingProvider ? '平台更新成功' : '平台创建成功', 'success');
        fetchProviders();
        setIsModalOpen(false);
        resetForm();
      } else {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || '保存失败');
      }
    } catch (error: any) {
      showToast(error.message || '保存失败', 'error');
    }
  };

  const handleDelete = async (provider: ModelProvider) => {
    const confirmed = await confirm({
      title: '删除平台',
      message: `确定要删除平台 "${provider.display_name}" 吗？如果已有模型使用此平台，将无法删除。`,
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/model-providers/${provider.id}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        showToast('平台已删除', 'success');
        fetchProviders();
      } else {
        const data = await response.json().catch(() => ({}));
        showToast(data.message || '删除失败', 'error');
      }
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const handleEdit = (provider: ModelProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      display_name: provider.display_name,
      base_url: provider.base_url,
      api_key: provider.api_key || '',
      headers_template: JSON.stringify(provider.headers_template || {}, null, 2),
      is_active: provider.is_active
    });
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingProvider(null);
    setFormData({ ...DEFAULT_FORM });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingProvider(null);
    setFormData({ ...DEFAULT_FORM });
    setJsonError('');
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">模型平台管理</h1>
          <p className="text-slate-400 mt-1">管理 OpenAI 兼容接口的平台配置</p>
        </div>
        <Button
          className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold shadow-lg"
          startContent={<Plus className="w-4 h-4" />}
          onPress={handleAdd}
        >
          添加平台
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">加载中...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Server className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <p>暂无平台配置</p>
          <p className="text-sm mt-1">点击下方按钮添加第一个平台</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {providers.map((provider) => (
            <Card key={provider.id} className="bg-slate-900/80 border border-slate-700/50 shadow-sm hover:shadow-md transition-shadow">
              <CardBody className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                      <Server className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-100">{provider.display_name}</h3>
                        <Chip size="sm" className={provider.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/50 text-slate-500'}>
                          {provider.is_active ? '启用' : '禁用'}
                        </Chip>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{provider.name}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="text-blue-400 hover:text-blue-300"
                      onPress={() => handleEdit(provider)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="text-red-400 hover:text-red-300"
                      onPress={() => handleDelete(provider)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="text-slate-400 truncate" title={provider.base_url}>{provider.base_url}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.api_key ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-400">已配置 API Key</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-amber-400">未配置 API Key（需在模型中单独配置）</span>
                      </>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="2xl" classNames={{ base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50" }}>
        <ModalContent>
          <ModalHeader className="text-xl font-bold text-slate-100">
            {editingProvider ? '编辑平台' : '添加平台'}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="平台标识"
                placeholder="如: deepseek"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                isRequired
                isReadOnly={!!editingProvider}
                description="唯一标识，创建后不可修改"
              />
              <Input
                label="显示名称"
                placeholder="如: DeepSeek"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                isRequired
              />
            </div>

            <Input
              label="Base URL"
              placeholder="https://api.example.com/v1"
              value={formData.base_url}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              isRequired
              description="OpenAI 兼容接口的基础 URL，不要以 / 结尾"
            />

            <Input
              label="默认 API Key"
              type="password"
              placeholder="sk-..."
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              description="平台默认 API Key，模型可单独覆盖"
            />

            <div>
              <Input
                label="Headers 模板 (JSON)"
                placeholder='{"X-Custom-Header": "value"}'
                value={formData.headers_template}
                onChange={(e) => {
                  setFormData({ ...formData, headers_template: e.target.value });
                  setJsonError('');
                }}
                classNames={{ input: "font-mono text-xs" }}
                description="自定义请求头，会合并到每个请求中"
              />
              {jsonError && (
                <p className="text-xs text-red-400 mt-1">{jsonError}</p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm text-slate-300">状态</label>
              <Chip
                className={`cursor-pointer ${formData.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/50 text-slate-500'}`}
                onClick={() => setFormData({ ...formData, is_active: formData.is_active ? 0 : 1 })}
              >
                {formData.is_active ? '启用' : '禁用'}
              </Chip>
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-2">
            <Button variant="flat" className="bg-slate-800/80 text-slate-300" onPress={() => setIsModalOpen(false)}>
              取消
            </Button>
            <Button className="bg-gradient-to-r from-blue-500 to-violet-600 text-white" onPress={handleSave}>
              保存
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ModelProviders;
