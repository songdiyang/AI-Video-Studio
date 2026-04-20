import React, { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardBody, Button, Input } from '@heroui/react';
import { User, Lock, ArrowRight, KeyRound, Maximize2, Minimize2, Mail, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { login, register, loginWithAdminAccess, getLoginRequirements, getRegistrationStatus } from '../services/auth';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';

// 中文标点 → 英文标点 映射表（常见混淆）
const CJK_PUNCTUATION_MAP: Record<string, string> = {
  '。': '.',   // 中文句号
  '，': ',',   // 中文逗号
  '；': ';',   // 中文分号
  '：': ':',   // 中文冒号
  '！': '!',   // 中文感叹号
  '？': '?',   // 中文问号
  '（': '(',   // 中文左括号
  '）': ')',   // 中文右括号
  '＠': '@',   // 全角＠
  '＿': '_',   // 全角下划线
  '－': '-',   // 全角连字符
};

/**
 * 检测并纠正邮箱中的中文/全角标点
 * @returns { corrected: string, hasCJK: boolean, details: string[] }
 */
function sanitizeEmailCJK(input: string): { corrected: string; hasCJK: boolean; details: string[] } {
  const details: string[] = [];
  let corrected = input;
  for (const [cjk, ascii] of Object.entries(CJK_PUNCTUATION_MAP)) {
    if (corrected.includes(cjk)) {
      details.push(`"${cjk}" → "${ascii}"`);
      corrected = corrected.replaceAll(cjk, ascii);
    }
  }
  return { corrected, hasCJK: details.length > 0, details };
}

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminAccessKey, setAdminAccessKey] = useState('');
  const [requiresAdminAccess, setRequiresAdminAccess] = useState(false);
  const [checkingLoginRequirements, setCheckingLoginRequirements] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [cjkWarning, setCjkWarning] = useState<string | null>(null);

  // 获取注册功能开关状态
  useEffect(() => {
    getRegistrationStatus().then(({ enabled }) => {
      setRegistrationEnabled(enabled);
      // 如果注册已关闭且当前在注册模式，切回登录
      if (!enabled && mode === 'register') {
        setMode('login');
      }
    });
  }, []);

  // 获取登录前想访问的页面
  const from = (location.state as any)?.from?.pathname || '/';

  // 全屏切换功能
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
    }
  };

  // 监听全屏变化事件
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (mode !== 'login') {
      setRequiresAdminAccess(false);
      setCheckingLoginRequirements(false);
      setAdminAccessKey('');
      setCjkWarning(null);
      return;
    }

    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      setRequiresAdminAccess(false);
      setCheckingLoginRequirements(false);
      setAdminAccessKey('');
      return;
    }

    let active = true;
    setCheckingLoginRequirements(true);

    const timer = window.setTimeout(async () => {
      try {
        const result = await getLoginRequirements(normalizedUsername);
        if (!active) return;

        setRequiresAdminAccess(result.requiresAdminAccess);
        if (!result.requiresAdminAccess) {
          setAdminAccessKey('');
        }
      } catch {
        if (!active) return;
        setRequiresAdminAccess(false);
      } finally {
        if (active) {
          setCheckingLoginRequirements(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mode, username]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // 前端验证
    const newErrors: typeof errors = {};
    const trimmedUsername = username.trim();

    // 登录模式：强制邮箱格式校验
    if (mode === 'login') {
      // 先检测并纠正中文/全角标点
      const { corrected, hasCJK, details } = sanitizeEmailCJK(trimmedUsername);
      if (hasCJK) {
        // 自动纠正并提示用户
        setUsername(corrected);
        showToast(`已自动修正邮箱中的中文标点：${details.join('，')}`, 'info');
        // 用纠正后的值继续验证
      }
      const emailToValidate = hasCJK ? corrected : trimmedUsername;
      
      if (!emailToValidate) {
        newErrors.username = t.auth.emailRequired;
      } else if (!emailToValidate.includes('@')) {
        newErrors.username = t.auth.emailFormatRequired;
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailToValidate)) {
          newErrors.username = t.auth.emailFormatInvalid;
        }
      }
    } else {
      // 注册模式：允许用户名或邮箱
      const isEmail = trimmedUsername.includes('@');
      if (isEmail) {
        const { corrected, hasCJK, details } = sanitizeEmailCJK(trimmedUsername);
        if (hasCJK) {
          setUsername(corrected);
          showToast(`已自动修正邮箱中的中文标点：${details.join('，')}`, 'info');
        }
        const emailToValidate = hasCJK ? corrected : trimmedUsername;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailToValidate)) {
          newErrors.username = t.auth.emailFormatInvalid;
        }
      } else if (trimmedUsername.length < 3) {
        newErrors.username = t.auth.usernameMinLength;
      }
    }
    if (password.length < 6) {
      newErrors.password = t.auth.passwordMinLength;
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!username || !password) {
      showToast(t.auth.fillAllFields, 'error');
      return;
    }
    if (mode === 'login' && requiresAdminAccess && !adminAccessKey.trim()) {
      showToast(t.auth.adminKeyRequired, 'error');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        await register(username, password);
      } else {
        if (requiresAdminAccess) {
          await loginWithAdminAccess(username, password, adminAccessKey);
        } else {
          await login(username, password);
        }
      }
      // 登录成功后返回之前想访问的页面
      navigate(from, { replace: true });
    } catch (err: any) {
      if (err?.reason === 'missing' || err?.reason === 'invalid') {
        setRequiresAdminAccess(true);
      }
      showToast(mode === 'login' ? t.auth.loginFailed : t.auth.registerFailed, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-(--bg-app) px-4 relative overflow-hidden">
      {/* 装饰背景元素 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-(--accent-secondary)/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-(--accent)/10 rounded-full blur-3xl animate-float-delay"></div>
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-(--accent)/5 rounded-full blur-2xl"></div>
        {/* 星点装饰 */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-(--accent)/40 rounded-full animate-twinkle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
      </div>

      {/* 全屏按钮 */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-(--bg-input)/80 border border-(--border-color) text-(--text-muted) hover:text-(--text-primary) hover:border-(--accent)/30 transition-all duration-200 backdrop-blur-sm"
        title={isFullscreen ? '退出全屏' : '全屏模式'}
      >
        {isFullscreen ? (
          <Minimize2 className="w-4 h-4" />
        ) : (
          <Maximize2 className="w-4 h-4" />
        )}
      </button>

      <Card className="w-full max-w-md pro-card relative z-10">
        <CardBody className="p-8 sm:p-10 space-y-7">
          {/* Logo 区域 - 入场动画 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-center space-y-5"
          >
            <div className="relative inline-block">
              {/* 外层光晕 */}
              <div className="absolute inset-0 bg-linear-to-br from-(--accent)/30 to-(--accent-dark)/30 rounded-2xl blur-2xl animate-pulse-slow" />
              {/* 内层光晕 */}
              <div className="absolute inset-0 bg-linear-to-br from-(--accent)/20 to-(--accent-dark)/20 rounded-2xl blur-xl" />
              {/* Logo 容器 */}
              <div 
                className="relative inline-flex items-center justify-center w-18 h-18 bg-linear-to-br from-(--accent) to-(--accent-dark) rounded-2xl transition-transform duration-300 hover:scale-105"
                style={{ boxShadow: '0 10px 25px -5px var(--accent-glow), 0 8px 10px -6px var(--accent-glow)' }}
              >
                {/* 饺子图标 */}
                <svg 
                  viewBox="0 0 48 48" 
                  className="w-9 h-9 text-(--text-inverse)"
                  fill="currentColor"
                >
                  {/* 饺子主体 - 半月形 */}
                  <path d="M24 8C16 8 8 14 8 22C8 30 14 38 24 40C34 38 40 30 40 22C40 14 32 8 24 8Z" />
                  {/* 饺子褶皱 */}
                  <path 
                    d="M12 20 Q16 18 20 20 Q24 18 28 20 Q32 18 36 20" 
                    fill="none" 
                    stroke="var(--accent-dark)" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                  />
                  <path 
                    d="M14 26 Q18 24 22 26 Q26 24 30 26 Q34 24 38 26" 
                    fill="none" 
                    stroke="var(--accent-dark)" 
                    strokeWidth="2" 
                    strokeLinecap="round"
                  />
                  {/* 高光 */}
                  <ellipse cx="18" cy="16" rx="4" ry="2" fill="white" opacity="0.4" />
                </svg>
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-black tracking-tight pro-title">
                {t.auth.title}
              </h1>
              <p className="text-sm text-(--text-muted) font-medium">
                {t.auth.subtitle}
              </p>
            </div>
          </motion.div>

          {/* Tab 切换 - 滑块动画（注册开放时显示） */}
          {registrationEnabled ? (
          <div className="flex gap-1 p-1 bg-(--bg-input) rounded-xl border border-(--border-color) relative">
            {/* 滑块 */}
            <motion.div
              layoutId="auth-tab-indicator"
              className="absolute inset-y-1 rounded-lg bg-linear-to-r from-(--accent)/20 to-(--accent-light)/20 border border-(--accent)/30 shadow-[0_0_15px_var(--accent-glow)]"
              style={{
                left: mode === 'login' ? '4px' : 'calc(50%)',
                width: 'calc(50% - 4px)'
              }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer relative z-10 ${
                mode === 'login'
                  ? 'text-(--accent)'
                  : 'text-(--text-muted) hover:text-(--text-secondary)'
              }`}
            >
              {t.auth.loginTab}
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer relative z-10 ${
                mode === 'register'
                  ? 'text-(--accent)'
                  : 'text-(--text-muted) hover:text-(--text-secondary)'
              }`}
            >
              {t.auth.registerTab}
            </button>
          </div>
          ) : null}

          {/* 表单 - 切换动画 */}
          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === 'login' ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Input
                  type={mode === 'login' ? 'email' : 'text'}
                  placeholder={mode === 'login' ? t.auth.emailPlaceholder : `${t.auth.username} / ${t.auth.emailPlaceholder}`}
                  value={username}
                  onValueChange={(v) => {
                    setUsername(v);
                    setErrors(prev => ({ ...prev, username: undefined }));
                    // 实时检测中文标点并警告
                    if (v) {
                      const { hasCJK, details } = sanitizeEmailCJK(v);
                      if (hasCJK) {
                        setCjkWarning(t.auth.cjkPunctuationWarning + details.join('，'));
                      } else {
                        setCjkWarning(null);
                      }
                    } else {
                      setCjkWarning(null);
                    }
                  }}
                  startContent={mode === 'login' ? <Mail className="w-4 h-4 text-(--text-muted)" /> : <User className="w-4 h-4 text-(--text-muted)" />}
                  variant="flat"
                  radius="lg"
                  size="lg"
                  isInvalid={!!errors.username}
                  errorMessage={errors.username}
                  autoComplete={mode === 'login' ? 'email' : 'username'}
                  classNames={{
                    base: 'bg-transparent',
                    input: 'bg-transparent text-(--text-primary) placeholder:text-(--text-muted)',
                    inputWrapper: `bg-(--bg-input) border hover:border-(--accent)/30 data-[focus=true]:border-(--accent)/50 shadow-sm transition-colors ${errors.username ? 'border-(--danger)' : 'border-(--border-color)'}`,
                  }}
                />
                {/* 中文标点检测警告 */}
                {cjkWarning && !errors.username && (
                  <div className="flex items-start gap-1.5 px-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-400 leading-relaxed">{cjkWarning}</p>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Input
                  type="password"
                  placeholder={t.auth.password}
                  value={password}
                  onValueChange={(v) => {
                    setPassword(v);
                    setErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  startContent={<Lock className="w-4 h-4 text-(--text-muted)" />}
                  variant="flat"
                  radius="lg"
                  size="lg"
                  isInvalid={!!errors.password}
                  errorMessage={errors.password}
                  classNames={{
                    base: 'bg-transparent',
                    input: 'bg-transparent text-(--text-primary) placeholder:text-(--text-muted)',
                    inputWrapper: `bg-(--bg-input) border hover:border-(--accent)/30 data-[focus=true]:border-(--accent)/50 shadow-sm transition-colors ${errors.password ? 'border-(--danger)' : 'border-(--border-color)'}`,
                  }}
                />
              </div>

              {mode === 'login' && requiresAdminAccess ? (
                <div className="space-y-2 animate-fade-in-up">
                  <Input
                    type="password"
                    placeholder={t.auth.adminAccessKey}
                    value={adminAccessKey}
                    onValueChange={setAdminAccessKey}
                    startContent={<KeyRound className="w-4 h-4 text-(--accent)" />}
                    variant="flat"
                    radius="lg"
                    size="lg"
                    classNames={{
                      base: 'bg-transparent',
                      input: 'bg-transparent text-(--text-primary) placeholder:text-(--text-muted)',
                      inputWrapper: 'bg-(--bg-input) border border-(--accent)/50 hover:border-(--accent) data-[focus=true]:border-(--accent) shadow-[0_0_10px_rgba(59,130,246,0.15)]',
                    }}
                  />
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-(--accent) animate-pulse" />
                    <p className="text-xs text-(--accent) font-medium">
                      {t.auth.adminAccountDetected}
                    </p>
                  </div>
                </div>
              ) : null}

              {mode === 'login' && checkingLoginRequirements ? (
                <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                  <div className="w-3 h-3 border-2 border-(--text-muted)/30 border-t-(--accent) rounded-full animate-spin" />
                  {t.auth.checkingPermissions}
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                radius="lg"
                className="w-full font-bold bg-linear-to-br from-(--accent) to-(--accent-dark) text-(--text-inverse) transition-all cursor-pointer glow-accent group"
                endContent={<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
                isLoading={loading}
              >
                {mode === 'login' ? t.auth.loginBtn : t.auth.registerBtn}
              </Button>
            </motion.form>
          </AnimatePresence>

          {/* 底部提示 */}
          {registrationEnabled ? (
          <div className="pt-4 border-t border-(--border-color)">
            <p className="text-center text-sm text-(--text-muted)">
              {mode === 'login' ? (
                <>
                  {t.auth.firstTime}
                  <button
                    onClick={() => setMode('register')}
                    className="ml-1.5 text-(--accent) hover:text-(--accent-light) font-semibold transition-colors cursor-pointer hover:underline underline-offset-2"
                  >
                    {t.auth.goRegister}
                  </button>
                </>
              ) : (
                <>
                  {t.auth.hasAccount}
                  <button
                    onClick={() => setMode('login')}
                    className="ml-1.5 text-(--accent) hover:text-(--accent-light) font-semibold transition-colors cursor-pointer hover:underline underline-offset-2"
                  >
                    {t.auth.goLogin}
                  </button>
                </>
              )}
            </p>
          </div>
          ) : (
          <div className="pt-4 border-t border-(--border-color)">
            <p className="text-center text-xs text-(--text-muted)">
              {t.auth.registrationClosed}
            </p>
          </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default Auth;
