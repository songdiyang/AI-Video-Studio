import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { FolderOpen, Sparkles, Users, Camera, Pencil, Save } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthToken, logout } from '../services/auth';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';

interface UserProfile {
  id: number;
  email: string;
  nickname: string | null;
  avatar_url: string | null;
  signature: string | null;
  created_at: string;
}

interface UserStats {
  scriptCount: number;
  videoCount: number;
  imageCount: number;
  projectCount: number;
  characterCount: number;
}

const UserCenter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  // 资料编辑状态
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editSignature, setEditSignature] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        // 功能优先模式：使用本地默认数据
        const token = getAuthToken();
        if (token) {
          // 已登录，从服务器获取数据
          await fetchSummaryData();
        } else {
          // 未登录，使用本地默认数据
          setProfile({
            id: 0,
            email: 'local@example.com',
            nickname: '本地用户',
            avatar_url: null,
            signature: '功能优先模式，登录后可同步数据',
            created_at: new Date().toISOString()
          });
          setStats({
            scriptCount: 0,
            videoCount: 0,
            imageCount: 0,
            projectCount: 0,
            characterCount: 0
          });
          setLoading(false);
        }
      } catch (error) {
        console.error('初始化用户数据失败:', error);
        setLoading(false);
      }
    };
    init();
  }, []);

  const redirectToAuth = () => {
    logout();
    navigate('/auth', { replace: true, state: { from: location } });
  };

  const fetchSummaryData = async () => {
    const token = getAuthToken();
    if (!token) {
      // 功能优先模式：未登录时使用本地数据
      setLoading(false);
      return;
    }

    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const [profileRes, statsRes] = await Promise.all([
        fetch('/api/users/profile', { headers }),
        fetch('/api/users/stats', { headers })
      ]);

      // 功能优先模式：401 错误不再跳转登录页
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

  const formatInteger = (value: number | string | null | undefined) => {
    const numericValue = Number(value || 0);
    return numericValue.toLocaleString('zh-CN');
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
    if (!token) {
      showToast('功能优先模式：登录后才能保存资料到服务器', 'warning');
      return;
    }

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
    if (!token) {
      showToast('功能优先模式：登录后才能上传头像到服务器', 'warning');
      return;
    }

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
            </div>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <span className="text-xs text-(--text-muted)">个</span>
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
              <span className="text-xs text-(--text-muted)">个</span>
            </div>
            <div className="text-[11px] text-(--text-muted)">{formatInteger(stats?.scriptCount)} 个剧本</div>
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
              <span className="text-xs text-(--text-muted)">个</span>
            </div>
            <div className="text-[11px] text-(--text-muted)">已创建角色</div>
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
