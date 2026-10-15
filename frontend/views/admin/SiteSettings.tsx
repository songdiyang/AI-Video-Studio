import React, { useEffect, useState } from 'react';
import { Globe, UserPlus, RefreshCw, Loader2, LogIn, ShieldAlert, Zap } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

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
  const [kicking, setKicking] = useState(false);
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
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  const registrationEnabled = getConfigValue('enable_registration');
  const loginEnabled = getConfigValue('enable_login');

  const handleKickAll = async () => {
    const confirmed = await confirm({
      title: '⚠️ 踢出所有在线用户',
      message: '此操作将立即使所有非管理员用户的会话失效，并自动禁止登录。确定执行吗？',
      type: 'danger',
      confirmText: '确认踢出'
    });
    if (!confirmed) return;
    setKicking(true);
    try {
      const res = await fetch('/api/system-configs/admin/kick-all', {
        method: 'POST',
        headers: getAdminAuthHeaders()
      });
      if (!res.ok) throw new Error('操作失败');
      await fetchConfigs();
      showToast('已踢出所有在线用户并禁止登录', 'success');
    } catch (error) {
      console.error('踢出用户失败:', error);
      showToast('操作失败，请稍后重试', 'error');
    } finally {
      setKicking(false);
    }
  };

  return (
    <div className="p-6 min-h-screen" style={{ backgroundColor: '#0a0a0f' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">站点设置</h1>
              <p className="text-sm text-white/50">管理站点的全局功能开关</p>
            </div>
          </div>
          <button
            onClick={fetchConfigs}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        {/* 用户注册开关 */}
        <div className="rounded-xl border border-white/10 bg-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              用户注册
            </h2>
            <p className="text-sm text-white/50 mt-1">控制新用户注册功能的开放状态</p>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">开放用户注册</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    registrationEnabled
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/15 text-red-400 border border-red-500/30'
                  }`}>
                    {registrationEnabled ? '已开启' : '已关闭'}
                  </span>
                </div>
                <p className="text-xs text-white/40 mt-1.5 leading-relaxed">
                  {registrationEnabled
                    ? '当前允许新用户通过注册页面创建账户。'
                    : '当前已禁止新用户注册，登录页面将隐藏注册入口，注册接口也将拒绝请求。'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {saving === 'enable_registration' && (
                  <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
                )}
                <button
                  onClick={() => toggleConfig('enable_registration', !registrationEnabled)}
                  disabled={saving === 'enable_registration'}
                  className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors ${
                    registrationEnabled ? 'bg-emerald-500' : 'bg-white/20'
                  } ${saving === 'enable_registration' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    registrationEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 用户登录开关 */}
        <div className="rounded-xl border border-white/10 bg-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <LogIn className="w-4 h-4 text-blue-400" />
              用户登录
            </h2>
            <p className="text-sm text-white/50 mt-1">控制非管理员用户的登录权限</p>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">允许用户登录</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    loginEnabled
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/15 text-red-400 border border-red-500/30'
                  }`}>
                    {loginEnabled ? '已开启' : '已关闭'}
                  </span>
                </div>
                <p className="text-xs text-white/40 mt-1.5 leading-relaxed">
                  {loginEnabled
                    ? '当前允许所有用户正常登录。'
                    : '当前已禁止非管理员用户登录，用户将收到"系统维护中"提示。管理员不受影响。'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {saving === 'enable_login' && (
                  <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
                )}
                <button
                  onClick={() => toggleConfig('enable_login', !loginEnabled)}
                  disabled={saving === 'enable_login'}
                  className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors ${
                    loginEnabled ? 'bg-emerald-500' : 'bg-white/20'
                  } ${saving === 'enable_login' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    loginEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 踢出在线用户 */}
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-red-500/15">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              危险操作
            </h2>
            <p className="text-sm text-white/50 mt-1">谨慎执行以下操作</p>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">踢出所有在线用户</span>
                </div>
                <p className="text-xs text-white/40 mt-1.5 leading-relaxed">
                  立即使所有非管理员用户的登录会话失效，强制下线。执行后将自动禁止用户登录。管理员账户不受影响。
                </p>
              </div>
              <button
                onClick={handleKickAll}
                disabled={kicking}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  kicking
                    ? 'bg-red-500/20 text-red-300 opacity-50 cursor-not-allowed'
                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                }`}
              >
                {kicking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {kicking ? '执行中...' : '立即踢出'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 配置定义元数据
const CONFIG_DEFINITIONS: Record<string, { name: string; description: string }> = {
  enable_registration: {
    name: '开放用户注册',
    description: '控制是否允许新用户注册。关闭后注册页面将不可用。'
  },
  enable_login: {
    name: '允许用户登录',
    description: '控制非管理员用户是否可以登录。关闭后用户将无法登录。'
  }
};

export default SiteSettings;
