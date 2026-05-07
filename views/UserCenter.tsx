import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardBody, Button, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Progress, Tooltip, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Wallet, TrendingUp, FolderOpen, FileText, Receipt, AlertTriangle, Sparkles, Clock, Zap, ChevronLeft, ChevronRight, User, Calendar, Activity, RefreshCw, ExternalLink, CreditCard, ArrowUpRight, XCircle, Camera, Pencil, Save, X, Image, Video, Users, Package, Gift } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthToken, logout } from '../services/auth';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { usePoints } from '../contexts/PointsContext';
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
  project_name?: string | null;
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
  const { resourcePacks } = usePoints();

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

  // 操作类型中文映射
  const OPERATION_LABELS: Record<string, string> = {
    'single_frame': '单帧生成',
    'frame_generation': '批量帧生成',
    'single_frame_generation': '单帧重新生成',
    'prompt_optimize': '提示词优化',
    'optimize_prompt': '提示词优化',
    'batch_prompt_optimization': '批量提示词优化',
    'single_image_prompt_optimization': 'AI优化提示词(图片)',
    'single_video_prompt_optimization': 'AI优化提示词(视频)',
    'batch_image_prompt_optimization': '批量提示词优化(图片)',
    'batch_video_prompt_optimization': '批量提示词优化(视频)',
    'generate_script': '剧本生成',
    'scene_video': '场景视频',
    'generate_reference': '参考图生成',
    'generate_three_views': '三视图生成',
    'generate_depth_concept': '深度概念图',
    'text_generation': '文本生成',
    'image_generation': '图片生成',
    'video_generation': '视频生成',
    'audio_generation': '音频生成',
  };

  const getOperationLabel = (record: BillingRecord) => {
    const key = record.operation_key || record.operation || '';
    return OPERATION_LABELS[key] || key || '-';
  };

  // 格式化耗时
  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '-';
    const s = Number(seconds);
    if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    return `${m}m${remainder > 0 ? ` ${remainder.toFixed(0)}s` : ''}`;
  };

  // 格式化资源包有效期
  const formatPackPeriod = (start: string, end: string) => {
    const ps = new Date(start);
    const pe = new Date(end);
    const sm = `${ps.getFullYear()}年${ps.getMonth() + 1}月`;
    const em = `${pe.getFullYear()}年${pe.getMonth() + 1}月`;
    return sm === em ? sm : `${sm} ~ ${em}`;
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
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        {/* 顶部精简用户信息 */}
        <div className="flex items-center gap-4 mb-5 pb-5 border-b border-(--border-color)">
          {/* 头像 */}
          <div className="relative group shrink-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <div
              className="w-12 h-12 rounded-xl overflow-hidden cursor-pointer"
              onClick={() => avatarInputRef.current?.click()}
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-linear-to-br from-(--accent) to-purple-500 flex items-center justify-center text-lg font-bold text-white">
                  {avatarInitial}
                </div>
              )}
            </div>
            <div
              className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => avatarInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-white" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-(--text-primary) truncate">
                {displayName}
              </h1>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="min-w-5 w-5 h-5 shrink-0"
                onPress={openProfileModal}
              >
                <Pencil className="w-3 h-3 text-(--text-muted)" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-(--text-muted)">
              <span>{memberSince} 加入</span>
              <span className="text-(--border-color)">·</span>
              <span>{formatInteger(stats?.totalRecords)} 次 API 调用</span>
            </div>
          </div>
        </div>

        {/* 左右分栏布局 */}
        <div className="flex flex-col lg:flex-row gap-5">
          {/* 左侧栏 */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4">
            {/* 用户简介 + 积分 */}
            <div className="bg-(--bg-card) border border-(--border-color) rounded-xl p-5">
              <div className="text-center mb-4">
                <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden mb-3">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="头像" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-linear-to-br from-(--accent) to-purple-500 flex items-center justify-center text-2xl font-bold text-white">
                      {avatarInitial}
                    </div>
                  )}
                </div>
                <h2 className="text-base font-semibold text-(--text-primary)">{displayName}</h2>
                {profile?.nickname && (
                  <p className="text-xs text-(--text-muted) mt-0.5">{profile.email}</p>
                )}
                {profile?.signature && (
                  <p className="text-xs text-(--text-secondary) italic mt-1 truncate px-2">「{profile.signature}」</p>
                )}
              </div>

              <div className="border-t border-(--border-color) pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-(--text-secondary)">积分余额</span>
                  <Button
                    size="sm"
                    variant="light"
                    className="text-(--accent) min-w-0 px-2 h-6 text-xs"
                    onPress={() => navigate('/pricing')}
                  >
                    充值
                  </Button>
                </div>
                <div className="text-2xl font-bold text-emerald-400 tabular-nums">{formatInteger(profile?.balance)}</div>
                <div className="text-[11px] text-(--text-muted)">≈ ¥{((profile?.balance || 0) * POINT_PURCHASE_PRICE).toFixed(2)}</div>
              </div>
            </div>

            {/* 我的订阅 */}
            <div className="bg-(--bg-card) border border-(--border-color) rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-(--text-primary)">{t.subscription.title}</h3>
                {subscription && (
                  <Chip size="sm" className={getStatusColor(subscription.subscription?.status || subscription.status)}>
                    {t.subscription.status[(subscription.subscription?.status || subscription.status) as keyof typeof t.subscription.status] || subscription.status}
                  </Chip>
                )}
              </div>

              {subscriptionLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
                </div>
              ) : subscription ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-(--text-primary)">{subscription.plan?.display_name || '免费版'}</span>
                      <span className="text-xs text-(--text-muted)">
                        {subscription.subscription?.current_period_end ? formatExpiryDate(subscription.subscription.current_period_end) : '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        className="bg-(--accent)/10 text-(--accent) h-7 text-xs"
                        startContent={<ArrowUpRight className="w-3 h-3" />}
                        onPress={() => navigate('/pricing')}
                      >
                        {t.subscription.upgrade}
                      </Button>
                      {(subscription.subscription?.status || subscription.status) === 'active' && (
                        <Button
                          size="sm"
                          variant="flat"
                          className="bg-rose-500/10 text-rose-400 h-7 text-xs"
                          isLoading={cancellingSubscription}
                          onPress={handleCancelSubscription}
                        >
                          {t.subscription.cancel}
                        </Button>
                      )}
                    </div>
                  </div>

                  {subscription.usage && (
                    <div className="space-y-3 pt-3 border-t border-(--border-color)">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-(--text-secondary)">{t.subscription.apiUsage}</span>
                          <span className="text-xs font-medium text-(--text-primary) tabular-nums">
                            {formatInteger(subscription.usage.api_calls_used)} / {subscription.usage.api_calls_limit === -1 ? '∞' : formatInteger(subscription.usage.api_calls_limit)}
                          </span>
                        </div>
                        <Progress
                          value={subscription.usage.api_calls_limit === -1 ? 0 : (subscription.usage.api_calls_used / subscription.usage.api_calls_limit) * 100}
                          size="sm"
                          color={subscription.usage.api_calls_limit !== -1 && subscription.usage.api_calls_used / subscription.usage.api_calls_limit > 0.8 ? 'warning' : 'primary'}
                          className="h-1.5"
                          classNames={{
                            indicator: 'bg-(--accent)',
                            track: 'bg-(--accent)/10'
                          }}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-(--text-secondary)">{t.subscription.projectUsage}</span>
                          <span className="text-xs font-medium text-(--text-primary) tabular-nums">
                            {formatInteger(subscription.usage.projects_used)} / {subscription.usage.projects_limit === -1 ? '∞' : formatInteger(subscription.usage.projects_limit)}
                          </span>
                        </div>
                        <Progress
                          value={subscription.usage.projects_limit === -1 ? 0 : (subscription.usage.projects_used / subscription.usage.projects_limit) * 100}
                          size="sm"
                          color={subscription.usage.projects_limit !== -1 && subscription.usage.projects_used / subscription.usage.projects_limit > 0.8 ? 'warning' : 'secondary'}
                          className="h-1.5"
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
                <div className="text-center py-4">
                  <p className="text-xs text-(--text-muted) mb-3">{t.subscription.noPlan}</p>
                  <Button
                    size="sm"
                    className="bg-(--accent) text-white text-xs"
                    onPress={() => navigate('/pricing')}
                  >
                    {t.pricing.basic.cta}
                  </Button>
                </div>
              )}
            </div>

            {/* 我的资源包 */}
            <div className="bg-(--bg-card) border border-(--border-color) rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-(--text-primary)">我的资源包</h3>
                <span className="text-xs text-(--text-muted)">{resourcePacks.filter(p => p.isActive).length} 个有效</span>
              </div>

              {resourcePacks.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-(--text-muted) mb-2">暂无资源包</p>
                  <Button
                    size="sm"
                    className="bg-amber-500 text-white text-xs h-7"
                    onPress={() => navigate('/pricing')}
                  >
                    获取资源包
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {resourcePacks.map(pack => {
                    const usedPercent = pack.totalPoints > 0
                      ? Math.round(((pack.totalPoints - pack.remainingPoints) / pack.totalPoints) * 100)
                      : 0;
                    const periodEnd = new Date(pack.periodEnd);
                    const now = new Date();
                    const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    const isExpiringSoon = pack.isActive && daysLeft > 0 && daysLeft <= 7;

                    return (
                      <div
                        key={pack.id}
                        className={`p-3 rounded-lg border ${
                          pack.isActive
                            ? 'bg-(--bg-secondary) border-(--border-color)'
                            : 'bg-(--bg-secondary)/50 border-(--border-color)/50 opacity-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-medium text-(--text-primary) truncate">{pack.name}</span>
                            {pack.isGift && (
                              <Chip size="sm" variant="flat" className="bg-rose-500/10 text-rose-500 text-[10px] h-4 px-1">
                                赠送
                              </Chip>
                            )}
                          </div>
                          <span className="text-xs font-mono text-emerald-500 shrink-0">
                            {pack.remainingPoints.toLocaleString()}
                            <span className="text-(--text-muted)">/{pack.totalPoints.toLocaleString()}</span>
                          </span>
                        </div>
                        <Progress
                          value={usedPercent}
                          size="sm"
                          className="h-1 mb-1.5"
                          color={pack.isActive ? (isExpiringSoon ? 'warning' : 'primary') : 'default'}
                        />
                        <div className="flex items-center justify-between text-[11px] text-(--text-muted)">
                          <span>{pack.periodMonth || formatPackPeriod(pack.periodStart, pack.periodEnd)}</span>
                          {pack.isActive && (
                            <span className={isExpiringSoon ? 'text-amber-500' : ''}>
                              {daysLeft > 0 ? `${daysLeft}天后到期` : '今日到期'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右侧主内容区 */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* 本月消耗 */}
              <div className="bg-(--bg-card) border border-(--border-color) rounded-xl p-4 hover:bg-(--bg-secondary)/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-orange-500/10 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-orange-400" />
                  </div>
                  <span className="text-xs text-(--text-muted)">{t.userCenter.thisMonth}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-xl font-bold text-(--text-primary) tabular-nums">{formatInteger(stats?.monthlyPointsUsed)}</span>
                  <span className="text-xs text-(--text-muted)">{t.userCenter.points}</span>
                </div>
                <div className="text-[11px] text-(--text-muted)">{t.userCenter.monthlyPoints}</div>
              </div>

              {/* 生成作品 */}
              <div className="bg-(--bg-card) border border-(--border-color) rounded-xl p-4 hover:bg-(--bg-secondary)/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs text-(--text-muted)">作品</span>
                </div>
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-xl font-bold text-(--text-primary) tabular-nums">{formatInteger((stats?.imageCount || 0) + (stats?.videoCount || 0))}</span>
                  <span className="text-xs text-(--text-muted)">{t.userCenter.works}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-(--text-muted)">
                  <span>{formatInteger(stats?.imageCount)} 图</span>
                  <span>{formatInteger(stats?.videoCount)} 视频</span>
                </div>
              </div>

              {/* 项目/剧本 */}
              <div className="bg-(--bg-card) border border-(--border-color) rounded-xl p-4 hover:bg-(--bg-secondary)/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg">
                    <FolderOpen className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-xs text-(--text-muted)">项目</span>
                </div>
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-xl font-bold text-(--text-primary) tabular-nums">{formatInteger(stats?.projectCount)}</span>
                  <span className="text-xs text-(--text-muted)">{t.userCenter.projectCount}</span>
                </div>
                <div className="text-[11px] text-(--text-muted)">{formatInteger(stats?.scriptCount)} {t.userCenter.scriptCount}</div>
              </div>

              {/* 创作角色 */}
              <div className="bg-(--bg-card) border border-(--border-color) rounded-xl p-4 hover:bg-(--bg-secondary)/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-xs text-(--text-muted)">角色</span>
                </div>
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-xl font-bold text-(--text-primary) tabular-nums">{formatInteger(stats?.characterCount)}</span>
                  <span className="text-xs text-(--text-muted)">{t.userCenter.characters}</span>
                </div>
                <div className="text-[11px] text-(--text-muted)">{t.userCenter.charactersCreated}</div>
              </div>
            </div>

            {/* 详细账单 */}
            <div className="bg-(--bg-card) border border-(--border-color) rounded-xl overflow-hidden">
              {/* 账单头部 */}
              <div className="p-4 border-b border-(--border-color)">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-(--text-primary)">{t.userCenter.billingTitle}</h3>
                    <span className="text-xs text-(--text-muted)">· {formatInteger(total)} 条记录</span>
                    <Button
                      size="sm"
                      variant="light"
                      className="text-(--text-secondary) min-w-0 px-1.5 h-6"
                      isLoading={recordsLoading}
                      onPress={() => fetchBillingData()}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
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
                      className="bg-(--bg-secondary) border border-(--border-color) text-(--text-primary) rounded-lg px-2.5 py-1.5 text-xs min-w-24 focus:outline-none focus:ring-2 focus:ring-(--accent)/50"
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
                      className="bg-(--bg-secondary) border border-(--border-color) text-(--text-primary) rounded-lg px-2.5 py-1.5 text-xs min-w-24 focus:outline-none focus:ring-2 focus:ring-(--accent)/50"
                    >
                      <option value="">{t.userCenter.filterAllModels}</option>
                      <option value="TEXT">{t.userCenter.filterTextModel}</option>
                      <option value="IMAGE">{t.userCenter.filterImageModel}</option>
                      <option value="VIDEO">{t.userCenter.filterVideoModel}</option>
                      <option value="AUDIO">{t.userCenter.filterAudioModel}</option>
                      <option value="MULTIMODAL">多模态</option>
                      <option value="3D">3D</option>
                    </select>

                    <select
                      value={sourceType}
                      onChange={(e) => {
                        setSourceType(e.target.value);
                        setPage(1);
                      }}
                      className="bg-(--bg-secondary) border border-(--border-color) text-(--text-primary) rounded-lg px-2.5 py-1.5 text-xs min-w-24 focus:outline-none focus:ring-2 focus:ring-(--accent)/50"
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
                    th: 'bg-(--bg-secondary) text-(--text-secondary) font-medium text-[11px] uppercase tracking-wider py-2.5',
                    td: 'text-(--text-primary) py-2.5 text-xs'
                  }}
                >
                  <TableHeader>
                    <TableColumn className="w-16">编号</TableColumn>
                    <TableColumn>所属工程</TableColumn>
                    <TableColumn>任务类型</TableColumn>
                    <TableColumn>使用模型</TableColumn>
                    <TableColumn className="text-center w-16">状态</TableColumn>
                    <TableColumn>执行时间</TableColumn>
                    <TableColumn className="text-right w-16">耗时</TableColumn>
                    <TableColumn className="text-right w-20">消费积分</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent={
                    recordsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-5 h-5 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="text-center py-10">
                        <Receipt className="w-10 h-10 mx-auto mb-2 text-(--text-muted) opacity-20" />
                        <p className="text-xs text-(--text-muted)">{t.userCenter.billingEmpty}</p>
                      </div>
                    )
                  }>
                    {records.map((record) => (
                      <TableRow key={record.id} className="hover:bg-(--bg-secondary)/50 transition-colors">
                        {/* 编号 */}
                        <TableCell className="text-[11px] font-mono text-(--text-muted)">
                          #{record.id}
                        </TableCell>

                        {/* 所属工程 */}
                        <TableCell>
                          {record.project_name ? (
                            <Tooltip content={record.project_name} placement="top">
                              <span className="text-(--text-primary) truncate max-w-32 inline-block">{record.project_name}</span>
                            </Tooltip>
                          ) : (
                            <span className="text-(--text-muted)">-</span>
                          )}
                        </TableCell>

                        {/* 任务类型 */}
                        <TableCell>
                          <Chip size="sm" variant="flat" className="bg-(--accent)/10 text-(--accent) text-[10px] h-5">
                            {getOperationLabel(record)}
                          </Chip>
                        </TableCell>

                        {/* 使用模型 */}
                        <TableCell>
                          <div className="flex flex-col min-w-0">
                            <Tooltip content={record.model_name || record.model_provider || '-'} placement="top">
                              <span className="text-(--text-primary) truncate max-w-36 inline-block">
                                {record.model_name || record.model_provider || '-'}
                              </span>
                            </Tooltip>
                            <span className="text-[10px] text-(--text-muted)">
                              {record.model_category || ''}
                            </span>
                          </div>
                        </TableCell>

                        {/* 状态 */}
                        <TableCell className="text-center">
                          {record.request_status === 'success' ? (
                            <Chip size="sm" className="bg-emerald-500/10 text-emerald-400 text-[10px] h-5">成功</Chip>
                          ) : record.request_status === 'failed' ? (
                            <Tooltip content={record.error_message || '未知错误'} placement="top" className="max-w-xs">
                              <Chip size="sm" className="bg-rose-500/10 text-rose-400 text-[10px] h-5 cursor-help">失败</Chip>
                            </Tooltip>
                          ) : (
                            <Chip size="sm" className="bg-sky-500/10 text-sky-400 text-[10px] h-5">进行中</Chip>
                          )}
                        </TableCell>

                        {/* 执行时间 */}
                        <TableCell className="text-(--text-muted) whitespace-nowrap">
                          {formatDate(record.created_at)}
                        </TableCell>

                        {/* 耗时 */}
                        <TableCell className="text-right text-(--text-muted) font-mono">
                          {formatDuration(record.duration_seconds)}
                        </TableCell>

                        {/* 消费积分 */}
                        <TableCell className="text-right">
                          <span className={`font-mono font-semibold text-xs ${record.points_cost ? 'text-emerald-400' : 'text-(--text-muted)'}`}>
                            {record.points_cost ? formatInteger(record.points_cost) : '0'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              <div className="p-3 border-t border-(--border-color) flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-(--text-muted)">
                  {t.userCenter.pageInfo.replace('{page}', String(page)).replace('{total}', String(totalPages))}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="flat"
                    className="bg-(--bg-secondary) text-(--text-primary) gap-1 h-7 text-xs"
                    isDisabled={page <= 1 || recordsLoading}
                    onPress={() => setPage((prev) => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {t.userCenter.prevPage}
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    className="bg-(--bg-secondary) text-(--text-primary) gap-1 h-7 text-xs"
                    isDisabled={page >= totalPages || recordsLoading}
                    onPress={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  >
                    {t.userCenter.nextPage}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
