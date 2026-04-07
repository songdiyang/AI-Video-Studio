import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardBody, Button, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Progress, Tooltip, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Wallet, TrendingUp, FolderOpen, FileText, Receipt, AlertTriangle, Sparkles, Clock, Zap, ChevronLeft, ChevronRight, User, Calendar, Activity, RefreshCw, ExternalLink, CreditCard, ArrowUpRight, XCircle, Camera, Pencil, Save, X, Image, Video, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthToken, logout } from '../services/auth';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { fetchCurrentSubscription, cancelSubscription, type CurrentSubscriptionResponse } from '../services/subscriptions';
import useWebSocket, { type BalanceUpdateMessage } from '../hooks/useWebSocket';

interface UserProfile {
  id: number;
  email: string;
  nickname: string | null;
  avatar_url: string | null;
  signature: string | null;
  balance: number;
  created_at: string;
}

interface UserStats {
  totalSpent: number;
  totalTokens: number;
  totalRecords: number;
  failedRecords: number;
  scriptCount: number;
  videoCount: number;
  imageCount: number;
  projectCount: number;
  characterCount: number;
  monthlyPointsUsed: number;
}

interface PriceBreakdownItem {
  type: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  label?: string;
}

interface BillingRecord {
  id: number;
  operation?: string;
  operation_key?: string | null;
  model_name?: string | null;
  model_provider?: string | null;
  model_category?: string | null;
  source_type?: string | null;
  request_status?: string | null;
  charge_status?: string | null;
  currency?: string | null;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_seconds?: number;
  item_count?: number;
  amount: number;
  points_cost?: number;
  points_value?: number;
  error_message?: string | null;
  created_at: string;
  price_breakdown_json?: PriceBreakdownItem[];
}

interface BillingResponse {
  records: BillingRecord[];
  total: number;
  limit: number;
  offset: number;
}

// 积分充值售价（用户购买价格）
const POINT_PURCHASE_PRICE = 0.02;

const PAGE_SIZE = 20;

const UserCenter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [chargeStatus, setChargeStatus] = useState('');
  const [modelCategory, setModelCategory] = useState('');
  const [sourceType, setSourceType] = useState('');
  
  // 订阅相关状态
  const [subscription, setSubscription] = useState<CurrentSubscriptionResponse | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);

  // 资料编辑状态
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editSignature, setEditSignature] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // WebSocket 监听余额更新
  const handleBalanceUpdate = useCallback((data: BalanceUpdateMessage) => {
    setProfile(prev => prev ? { ...prev, balance: data.balance } : prev);
  }, []);

  useWebSocket({
    enabled: true,
    onBalanceUpdate: handleBalanceUpdate
  });

  useEffect(() => {
    const init = async () => {
      try {
        await fetchSummaryData();
        await fetchSubscriptionData();
      } catch (error) {
        console.error('初始化用户数据失败:', error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const loadBilling = async () => {
      try {
        await fetchBillingData();
      } catch (error) {
        console.error('加载账单数据失败:', error);
      }
    };
    loadBilling();
  }, [page, chargeStatus, modelCategory, sourceType]);

  const redirectToAuth = () => {
    logout();
    navigate('/auth', { replace: true, state: { from: location } });
  };

  const fetchSubscriptionData = async () => {
    const token = getAuthToken();
    if (!token) return;

    setSubscriptionLoading(true);
    try {
      const subData = await fetchCurrentSubscription();
      setSubscription(subData);
    } catch (error) {
      console.error('获取订阅信息失败:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    const confirmed = await confirm({
      title: t.subscription.cancel,
      message: t.subscription.cancelConfirm,
      type: 'danger',
      confirmText: t.common.confirm
    });
    if (!confirmed) return;

    setCancellingSubscription(true);
    try {
      await cancelSubscription();
      showToast('订阅已取消', 'success');
      await fetchSubscriptionData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '取消订阅失败', 'error');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/10 text-emerald-400';
      case 'trial':
        return 'bg-blue-500/10 text-blue-400';
      case 'expired':
        return 'bg-orange-500/10 text-orange-400';
      case 'cancelled':
        return 'bg-slate-500/10 text-slate-400';
      default:
        return 'bg-slate-500/10 text-slate-400';
    }
  };

  const formatExpiryDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const fetchSummaryData = async () => {
    const token = getAuthToken();
    if (!token) {
      redirectToAuth();
      return;
    }

    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const [profileRes, statsRes] = await Promise.all([
        fetch('/api/users/profile', { headers }),
        fetch('/api/users/stats', { headers })
      ]);

      if ([profileRes, statsRes].some((response) => response.status === 401)) {
        redirectToAuth();
        return;
      }

      if (profileRes.ok) {
        setProfile(await profileRes.json());
      }

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (error) {
      console.error('获取用户摘要失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBillingData = async () => {
    const token = getAuthToken();
    if (!token) {
      redirectToAuth();
      return;
    }

    setRecordsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(page)
      });

      if (chargeStatus) params.set('chargeStatus', chargeStatus);
      if (modelCategory) params.set('modelCategory', modelCategory);
      if (sourceType) params.set('sourceType', sourceType);

      const response = await fetch(`/api/users/billing?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 401) {
        redirectToAuth();
        return;
      }

      if (!response.ok) {
        throw new Error('获取账单失败');
      }

      const data: BillingResponse = await response.json();
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('获取账单列表失败:', error);
      setRecords([]);
      setTotal(0);
    } finally {
      setRecordsLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString('zh-CN');

  const formatMoney = (value: number | string | null | undefined) => {
    const numericValue = Number(value || 0);
    return `¥${numericValue.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    })}`;
  };

  const formatInteger = (value: number | string | null | undefined) => {
    const numericValue = Number(value || 0);
    return numericValue.toLocaleString('zh-CN');
  };

  const getSourceLabel = (value?: string | null) => {
    if (value === 'workflow') return t.userCenter.sourceWorkflow;
    if (value === 'route') return t.userCenter.sourceRoute;
    if (value === 'admin_tool') return t.userCenter.sourceAdminTool;
    return value || t.userCenter.sourceUnknown;
  };

  const getStatusChipClass = (value?: string | null, type: 'request' | 'charge' = 'request') => {
    const key = `${type}:${value || ''}`;
    const map: Record<string, string> = {
      'request:success': 'bg-emerald-500/10 text-emerald-400',
      'request:failed': 'bg-rose-500/10 text-rose-400',
      'request:submitted': 'bg-sky-500/10 text-sky-400',
      'charge:charged': 'bg-emerald-500/10 text-emerald-400',
      'charge:skipped': 'bg-slate-700/80 text-slate-300',
      'charge:pending': 'bg-amber-500/10 text-amber-400'
    };

    return map[key] || 'bg-slate-700/80 text-slate-300';
  };

  const buildUsageSummary = (record: BillingRecord) => {
    const parts: string[] = [];
    if (record.input_tokens) parts.push(`${t.userCenter.usageInput} ${formatInteger(record.input_tokens)}`);
    if (record.output_tokens) parts.push(`${t.userCenter.usageOutput} ${formatInteger(record.output_tokens)}`);
    if (record.duration_seconds) parts.push(`${Number(record.duration_seconds).toFixed(2)} ${t.userCenter.usageSeconds}`);
    if (record.item_count) parts.push(`${formatInteger(record.item_count)} ${t.userCenter.usageItems}`);
    if (!parts.length && record.tokens) parts.push(`${t.userCenter.usageTotalTokens} ${formatInteger(record.tokens)}`);
    return parts.join(' · ');
  };

  // 格式化注册日期
  const memberSince = useMemo(() => {
    if (!profile?.created_at) return '';
    return new Date(profile.created_at).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [profile?.created_at]);

  // 获取用户名首字母
  const avatarInitial = useMemo(() => {
    const name = profile?.nickname || profile?.email;
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  }, [profile?.nickname, profile?.email]);

  // 显示名称
  const displayName = useMemo(() => {
    return profile?.nickname || profile?.email || '';
  }, [profile?.nickname, profile?.email]);

  // 打开资料编辑模态框
  const openProfileModal = () => {
    setEditNickname(profile?.nickname || '');
    setEditSignature(profile?.signature || '');
    setShowProfileModal(true);
  };

  // 保存资料
  const handleSaveProfile = async () => {
    const token = getAuthToken();
    if (!token) return;

    setSavingProfile(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nickname: editNickname, signature: editSignature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setProfile(data.user);
      // 同步 localStorage
      try {
        const stored = localStorage.getItem('auth_user');
        if (stored) {
          const user = JSON.parse(stored);
          localStorage.setItem('auth_user', JSON.stringify({ ...user, nickname: data.user.nickname, avatar_url: data.user.avatar_url }));
        }
      } catch (localErr) {
        console.error('更新本地用户数据失败:', localErr);
      }
      setShowProfileModal(false);
      showToast('资料已更新', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新失败', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // 上传头像
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // 清空以允许重复选择

    const token = getAuthToken();
    if (!token) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch('/api/users/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setProfile(prev => prev ? { ...prev, avatar_url: data.avatar_url } : prev);
      // 同步 localStorage
      try {
        const stored = localStorage.getItem('auth_user');
        if (stored) {
          const user = JSON.parse(stored);
          localStorage.setItem('auth_user', JSON.stringify({ ...user, avatar_url: data.avatar_url }));
        }
      } catch (localErr) {
        console.error('更新本地用户数据失败:', localErr);
      }
      showToast('头像已更新', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '上传失败', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="h-full flex items-center justify-center bg-(--bg-app)">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
          <div className="text-(--text-muted)">{t.common.loading}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-(--bg-app)">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        
        {/* 用户信息头部 */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-(--accent)/20 via-purple-500/10 to-blue-500/10 border border-(--border-color)">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />
          
          <div className="relative p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              {/* 头像 - 可点击上传 */}
              <div className="relative group">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <div
                  className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg shadow-(--accent)/20 cursor-pointer"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="头像" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-linear-to-br from-(--accent) to-purple-500 flex items-center justify-center text-3xl font-bold text-white">
                      {avatarInitial}
                    </div>
                  )}
                </div>
                {/* 悬停覆盖层 */}
                <div
                  className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploadingAvatar ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-(--bg-card)">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
              
              {/* 用户信息 */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold text-(--text-primary)">
                    {displayName}
                  </h1>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    className="min-w-6 w-6 h-6"
                    onPress={openProfileModal}
                  >
                    <Pencil className="w-3.5 h-3.5 text-(--text-muted)" />
                  </Button>
                </div>
                {profile?.nickname && (
                  <p className="text-xs text-(--text-muted) mb-1">
                    {profile.email}
                  </p>
                )}
                {profile?.signature && (
                  <p className="text-sm text-(--text-secondary) italic mb-2">
                    「{profile.signature}」
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm text-(--text-muted)">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {memberSince} {t.userCenter.joinedAt}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-4 h-4" />
                    {formatInteger(stats?.totalRecords)} {t.userCenter.apiCalls}
                  </span>
                </div>
              </div>
              
              {/* 积分卡片 */}
              <div className="bg-(--bg-card)/80 backdrop-blur-sm rounded-xl p-4 border border-(--border-color) min-w-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm text-(--text-secondary)">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    积分余额
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    className="text-(--accent) min-w-0 px-2 h-7"
                    onPress={() => window.open('https://example.com/recharge', '_blank')}
                  >
                    充值
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                </div>
                <div className="text-3xl font-bold text-emerald-400">{formatInteger(profile?.balance)} <span className="text-base font-normal text-(--text-muted)">积分</span></div>
                <div className="text-xs text-(--text-muted) mt-1">≈ ¥{((profile?.balance || 0) * POINT_PURCHASE_PRICE).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 本月消耗 */}
          <Card className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md transition-shadow">
            <CardBody className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-orange-500/10 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-orange-400" />
                </div>
                <Tooltip content={t.userCenter.monthlyPointsTooltip}>
                  <div className="text-xs text-(--text-muted) cursor-help">{t.userCenter.thisMonth}</div>
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-2xl font-bold text-(--text-primary)">{formatInteger(stats?.monthlyPointsUsed)}</span>
                <span className="text-sm text-(--text-muted)">{t.userCenter.points}</span>
              </div>
              <div className="text-xs text-(--text-muted)">{t.userCenter.monthlyPoints}</div>
            </CardBody>
          </Card>

          {/* 生成作品 */}
          <Card className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md transition-shadow">
            <CardBody className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-blue-500/10 rounded-xl">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-2xl font-bold text-(--text-primary)">{formatInteger((stats?.imageCount || 0) + (stats?.videoCount || 0))}</span>
                <span className="text-sm text-(--text-muted)">{t.userCenter.works}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-(--text-muted)">
                <span className="flex items-center gap-1">
                  <Image className="w-3.5 h-3.5" />
                  {formatInteger(stats?.imageCount)} {t.userCenter.images}
                </span>
                <span className="flex items-center gap-1">
                  <Video className="w-3.5 h-3.5" />
                  {formatInteger(stats?.videoCount)} {t.userCenter.videos}
                </span>
              </div>
            </CardBody>
          </Card>

          {/* 项目/剧本 */}
          <Card className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md transition-shadow">
            <CardBody className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-purple-500/10 rounded-xl">
                  <FolderOpen className="w-5 h-5 text-purple-400" />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold text-(--text-primary)">{formatInteger(stats?.projectCount)}</span>
                <span className="text-sm text-(--text-muted)">{t.userCenter.projectCount}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                <FileText className="w-3.5 h-3.5" />
                {formatInteger(stats?.scriptCount)} {t.userCenter.scriptCount}
              </div>
            </CardBody>
          </Card>

          {/* 创作角色 */}
          <Card className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md transition-shadow">
            <CardBody className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                  <Users className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-2xl font-bold text-(--text-primary)">{formatInteger(stats?.characterCount)}</span>
                <span className="text-sm text-(--text-muted)">{t.userCenter.characters}</span>
              </div>
              <div className="text-xs text-(--text-muted)">{t.userCenter.charactersCreated}</div>
            </CardBody>
          </Card>
        </div>

        {/* 我的订阅 */}
        <Card className="bg-(--bg-card) border border-(--border-color) shadow-sm">
          <CardBody className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-(--accent)/10 rounded-xl">
                <CreditCard className="w-5 h-5 text-(--accent)" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-(--text-primary)">{t.subscription.title}</h3>
              </div>
            </div>

            {subscriptionLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
              </div>
            ) : subscription ? (
              <div className="space-y-6">
                {/* 订阅信息头部 */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 bg-(--bg-secondary) rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-linear-to-br from-(--accent) to-purple-600 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-(--text-primary)">
                          {subscription.plan?.display_name || '免费版'}
                        </span>
                        <Chip size="sm" className={getStatusColor(subscription.subscription?.status || subscription.status)}>
                          {t.subscription.status[(subscription.subscription?.status || subscription.status) as keyof typeof t.subscription.status] || subscription.status}
                        </Chip>
                      </div>
                      <div className="text-sm text-(--text-muted) mt-1">
                        {(subscription.subscription?.status || subscription.status) === 'trial' ? t.subscription.trialEnds : t.subscription.renewsOn}: {subscription.subscription?.current_period_end ? formatExpiryDate(subscription.subscription.current_period_end) : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      className="bg-(--accent)/10 text-(--accent)"
                      startContent={<ArrowUpRight className="w-4 h-4" />}
                      onPress={() => navigate('/pricing')}
                    >
                      {t.subscription.upgrade}
                    </Button>
                    {(subscription.subscription?.status || subscription.status) === 'active' && (
                      <Button
                        variant="flat"
                        className="bg-rose-500/10 text-rose-400"
                        startContent={<XCircle className="w-4 h-4" />}
                        isLoading={cancellingSubscription}
                        onPress={handleCancelSubscription}
                      >
                        {t.subscription.cancel}
                      </Button>
                    )}
                  </div>
                </div>

                {/* 用量统计 */}
                {subscription.usage && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* API 用量 */}
                    <div className="p-4 bg-(--bg-secondary) rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-(--text-secondary)">{t.subscription.apiUsage}</span>
                        <span className="text-sm font-medium text-(--text-primary)">
                          {formatInteger(subscription.usage.api_calls_used)} / {subscription.usage.api_calls_limit === -1 ? '∞' : formatInteger(subscription.usage.api_calls_limit)}
                        </span>
                      </div>
                      <Progress
                        value={subscription.usage.api_calls_limit === -1 ? 0 : (subscription.usage.api_calls_used / subscription.usage.api_calls_limit) * 100}
                        size="sm"
                        color={subscription.usage.api_calls_limit !== -1 && subscription.usage.api_calls_used / subscription.usage.api_calls_limit > 0.8 ? 'warning' : 'primary'}
                        className="h-2"
                        classNames={{
                          indicator: 'bg-(--accent)',
                          track: 'bg-(--accent)/10'
                        }}
                      />
                    </div>

                    {/* 项目用量 */}
                    <div className="p-4 bg-(--bg-secondary) rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-(--text-secondary)">{t.subscription.projectUsage}</span>
                        <span className="text-sm font-medium text-(--text-primary)">
                          {formatInteger(subscription.usage.projects_used)} / {subscription.usage.projects_limit === -1 ? '∞' : formatInteger(subscription.usage.projects_limit)}
                        </span>
                      </div>
                      <Progress
                        value={subscription.usage.projects_limit === -1 ? 0 : (subscription.usage.projects_used / subscription.usage.projects_limit) * 100}
                        size="sm"
                        color={subscription.usage.projects_limit !== -1 && subscription.usage.projects_used / subscription.usage.projects_limit > 0.8 ? 'warning' : 'secondary'}
                        className="h-2"
                        classNames={{
                          indicator: 'bg-purple-500',
                          track: 'bg-purple-500/10'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-(--bg-secondary) rounded-full flex items-center justify-center">
                  <CreditCard className="w-8 h-8 text-(--text-muted)" />
                </div>
                <p className="text-(--text-muted) mb-4">{t.subscription.noPlan}</p>
                <Button
                  className="bg-linear-to-r from-(--accent) to-purple-600 text-white font-semibold"
                  startContent={<ArrowUpRight className="w-4 h-4" />}
                  onPress={() => navigate('/pricing')}
                >
                  {t.pricing.basic.cta}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* 详细账单 */}
        <Card className="bg-(--bg-card) border border-(--border-color) shadow-sm">
          <CardBody className="p-0">
            {/* 账单头部 */}
            <div className="p-5 border-b border-(--border-color)">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-(--accent)/10 rounded-xl">
                    <Receipt className="w-5 h-5 text-(--accent)" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-(--text-primary)">{t.userCenter.billingTitle}</h3>
                    <div className="text-sm text-(--text-muted)">
                      {t.userCenter.billingDesc}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    className="text-(--text-secondary) min-w-0 px-2 h-8 ml-auto"
                    isLoading={recordsLoading}
                    onPress={() => fetchBillingData()}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                {/* 筛选器 */}
                <div className="flex flex-wrap gap-2">
                  <select
                    value={chargeStatus}
                    onChange={(e) => {
                      setChargeStatus(e.target.value);
                      setPage(1);
                    }}
                    className="bg-(--bg-secondary) border border-(--border-color) text-(--text-primary) rounded-lg px-3 py-2 text-sm min-w-30 focus:outline-none focus:ring-2 focus:ring-(--accent)/50"
                  >
                    <option value="">{t.userCenter.filterAllStatus}</option>
                    <option value="charged">{t.userCenter.filterCharged}</option>
                    <option value="skipped">{t.userCenter.filterSkipped}</option>
                    <option value="pending">{t.userCenter.filterPending}</option>
                  </select>

                  <select
                    value={modelCategory}
                    onChange={(e) => {
                      setModelCategory(e.target.value);
                      setPage(1);
                    }}
                    className="bg-(--bg-secondary) border border-(--border-color) text-(--text-primary) rounded-lg px-3 py-2 text-sm min-w-30 focus:outline-none focus:ring-2 focus:ring-(--accent)/50"
                  >
                    <option value="">{t.userCenter.filterAllModels}</option>
                    <option value="TEXT">{t.userCenter.filterTextModel}</option>
                    <option value="IMAGE">{t.userCenter.filterImageModel}</option>
                    <option value="VIDEO">{t.userCenter.filterVideoModel}</option>
                    <option value="AUDIO">{t.userCenter.filterAudioModel}</option>
                  </select>

                  <select
                    value={sourceType}
                    onChange={(e) => {
                      setSourceType(e.target.value);
                      setPage(1);
                    }}
                    className="bg-(--bg-secondary) border border-(--border-color) text-(--text-primary) rounded-lg px-3 py-2 text-sm min-w-30 focus:outline-none focus:ring-2 focus:ring-(--accent)/50"
                  >
                    <option value="">{t.userCenter.filterAllSources}</option>
                    <option value="workflow">{t.userCenter.sourceWorkflow}</option>
                    <option value="route">{t.userCenter.sourceRoute}</option>
                    <option value="admin_tool">{t.userCenter.sourceAdminTool}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 账单表格 */}
            <div className="overflow-x-auto">
              <Table
                aria-label={t.userCenter.billingTitle}
                className="min-w-full"
                classNames={{
                  wrapper: 'bg-transparent shadow-none rounded-none',
                  th: 'bg-(--bg-secondary) text-(--text-secondary) font-medium text-xs uppercase tracking-wider',
                  td: 'text-(--text-primary) align-top py-4'
                }}
              >
                <TableHeader>
                  <TableColumn>{t.userCenter.colTime}</TableColumn>
                  <TableColumn>{t.userCenter.colSource}</TableColumn>
                  <TableColumn>{t.userCenter.colModel}</TableColumn>
                  <TableColumn>{t.userCenter.colStatus}</TableColumn>
                  <TableColumn>{t.userCenter.colBreakdown}</TableColumn>
                  <TableColumn className="text-right">{t.userCenter.colTotal}</TableColumn>
                </TableHeader>
              <TableBody emptyContent={
                recordsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Receipt className="w-12 h-12 mx-auto mb-3 text-(--text-muted) opacity-30" />
                    <p className="text-(--text-muted)">{t.userCenter.billingEmpty}</p>
                  </div>
                )
              }>
                {records.map((record) => (
                  <TableRow key={record.id} className="hover:bg-(--bg-secondary)/50 transition-colors">
                    <TableCell className="text-sm text-(--text-muted) whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(record.created_at)}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Chip size="sm" className="bg-(--accent)/10 text-(--accent) w-fit">
                          {getSourceLabel(record.source_type)}
                        </Chip>
                        <div className="text-xs text-(--text-muted) truncate max-w-37.5">
                          {record.operation_key || record.operation || '-'}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="font-medium text-(--text-primary)">
                          {record.model_name || record.model_provider || '-'}
                        </div>
                        <Chip size="sm" variant="flat" className="w-fit text-xs bg-(--bg-secondary)">
                          {record.model_category || 'UNKNOWN'}
                        </Chip>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Chip size="sm" className={getStatusChipClass(record.request_status, 'request')}>
                          {record.request_status || 'unknown'}
                        </Chip>
                        <Chip size="sm" className={getStatusChipClass(record.charge_status, 'charge')}>
                          {record.charge_status || 'unknown'}
                        </Chip>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1.5 max-w-md">
                        {record.price_breakdown_json && record.price_breakdown_json.length > 0 ? (
                          record.price_breakdown_json.map((item, index) => (
                            <div key={`${record.id}-${index}`} className="text-sm">
                              <span className="text-(--text-primary)">{item.label || item.type}</span>
                              <span className="text-(--text-muted)"> × {formatInteger(item.quantity)}</span>
                              <span className="text-amber-400 font-medium"> = {formatMoney(item.amount)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-(--text-muted)">-</div>
                        )}

                        {buildUsageSummary(record) && (
                          <div className="text-xs text-(--text-muted) flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {buildUsageSummary(record)}
                          </div>
                        )}

                        {record.error_message && (
                          <div className="text-xs text-rose-400 wrap-break-word">{record.error_message}</div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-mono font-bold text-emerald-400">
                          {record.points_cost ? `${formatInteger(record.points_cost)} 积分` : formatMoney(record.amount)}
                        </span>
                        {record.points_cost && (
                          <span className="text-xs text-(--text-muted)">
                            ≈ ¥{((record.points_cost || 0) * POINT_PURCHASE_PRICE).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            {/* 分页 */}
            <div className="p-4 border-t border-(--border-color) flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-(--text-muted)">
                {t.userCenter.totalRecords} <span className="font-medium text-(--text-primary)">{formatInteger(total)}</span> {t.userCenter.recordsUnit}
                {t.userCenter.pageInfo.replace('{page}', String(page)).replace('{total}', String(totalPages))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  className="bg-(--bg-secondary) text-(--text-primary) gap-1"
                  isDisabled={page <= 1 || recordsLoading}
                  onPress={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t.userCenter.prevPage}
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  className="bg-(--bg-secondary) text-(--text-primary) gap-1"
                  isDisabled={page >= totalPages || recordsLoading}
                  onPress={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  {t.userCenter.nextPage}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 资料编辑模态框 */}
      <Modal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} size="md">
        <ModalContent className="bg-(--bg-card) border border-(--border-color)">
          <ModalHeader className="text-(--text-primary)">编辑个人资料</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="昵称"
              placeholder="设置你的昵称"
              value={editNickname}
              onValueChange={setEditNickname}
              maxLength={50}
              description={`${editNickname.length}/50`}
              classNames={{
                input: 'bg-transparent text-(--text-primary)',
                inputWrapper: 'bg-(--bg-secondary) border border-(--border-color)',
                label: 'text-(--text-secondary)',
              }}
            />
            <Textarea
              label="个性签名"
              placeholder="写一句话介绍自己"
              value={editSignature}
              onValueChange={setEditSignature}
              maxLength={200}
              description={`${editSignature.length}/200`}
              minRows={2}
              maxRows={4}
              classNames={{
                input: 'bg-transparent text-(--text-primary)',
                inputWrapper: 'bg-(--bg-secondary) border border-(--border-color)',
                label: 'text-(--text-secondary)',
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowProfileModal(false)}>
              取消
            </Button>
            <Button
              className="bg-(--accent) text-white"
              isLoading={savingProfile}
              onPress={handleSaveProfile}
              startContent={!savingProfile ? <Save className="w-4 h-4" /> : undefined}
            >
              保存
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default UserCenter;
