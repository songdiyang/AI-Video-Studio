import React, { useEffect, useState } from 'react';
import { Card, CardBody, Switch, Spinner } from '@heroui/react';
import { Globe, UserPlus, RefreshCw } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

interface SiteConfig {
  id: number;
  config_key: string;
  config_name: string;
  config_type: string;
  config_value: string;
  description: string;
  is_active: number;
}

const SiteSettings: React.FC = () => {
  const [configs, setConfigs] = useState<SiteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { showToast } = useToast();

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
      console.error('获取站点配置失败:', error);
      showToast('获取站点配置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getConfigValue = (key: string): boolean => {
    const config = configs.find(c => c.config_key === key);
    if (!config) return true; // 默认开启
    try {
      return JSON.parse(config.config_value) === true;
    } catch {
      return true;
    }
  };

  const toggleConfig = async (key: string, newValue: boolean) => {
    setSaving(key);
    const existing = configs.find(c => c.config_key === key);

    try {
      if (existing) {
        // 更新已有配置
        const res = await fetch(`/api/system-configs/admin/${existing.id}`, {
          method: 'PUT',
          headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ config_value: newValue })
        });
        if (!res.ok) throw new Error('更新失败');
      } else {
        // 创建新配置
        const configMeta = CONFIG_DEFINITIONS[key];
        const res = await fetch('/api/system-configs/admin', {
          method: 'POST',
          headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            config_key: key,
            config_name: configMeta?.name || key,
            config_type: 'boolean',
            config_value: newValue,
            description: configMeta?.description || '',
            is_active: 1
          })
        });
        if (!res.ok) throw new Error('创建失败');
      }

      await fetchConfigs();
      showToast(`${newValue ? '已开启' : '已关闭'}`, 'success');
    } catch (error) {
      console.error('保存配置失败:', error);
      showToast('保存配置失败，请稍后重试', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const registrationEnabled = getConfigValue('enable_registration');

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Globe className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">站点设置</h1>
            <p className="text-sm text-slate-400">管理站点的全局功能开关</p>
          </div>
        </div>
        <button
          onClick={fetchConfigs}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 用户注册开关 */}
      <Card className="bg-slate-900/50 border border-slate-800">
        <CardBody className="p-0">
          <div className="p-5 border-b border-slate-800">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              用户注册
            </h2>
            <p className="text-sm text-slate-400 mt-1">控制新用户注册功能的开放状态</p>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">开放用户注册</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    registrationEnabled
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {registrationEnabled ? '已开启' : '已关闭'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  {registrationEnabled
                    ? '当前允许新用户通过注册页面创建账户。'
                    : '当前已禁止新用户注册，登录页面将隐藏注册入口，注册接口也将拒绝请求。'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {saving === 'enable_registration' && (
                  <Spinner size="sm" />
                )}
                <Switch
                  isSelected={registrationEnabled}
                  onValueChange={(val) => toggleConfig('enable_registration', val)}
                  isDisabled={saving === 'enable_registration'}
                  size="lg"
                  color="success"
                  classNames={{
                    wrapper: 'group-data-[selected=true]:bg-emerald-500',
                  }}
                />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

// 配置定义元数据
const CONFIG_DEFINITIONS: Record<string, { name: string; description: string }> = {
  enable_registration: {
    name: '开放用户注册',
    description: '控制是否允许新用户注册。关闭后注册页面将不可用。'
  }
};

export default SiteSettings;
