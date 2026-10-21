/**
 * 原神风格 UI 组件库
 * 设计语言：深邃星空、玻璃拟态、金色点缀
 */
import React, { forwardRef, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Tabs, Tab } from '@heroui/react';
import { Loader2 } from 'lucide-react';

// ========== GenshinButton ==========
interface GenshinButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export const GenshinButton = forwardRef<HTMLButtonElement, GenshinButtonProps>(({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}, ref) => {
  const baseStyles = `
    relative inline-flex items-center justify-center gap-2 font-semibold
    rounded-lg transition-all duration-300 ease-out
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0c0e1a]
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
    cursor-pointer
  `;

  const variants = {
    primary: `
      bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600
      text-[#1a1d35] font-bold
      shadow-lg shadow-amber-500/30
      hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-0.5
      focus:ring-amber-400
      active:translate-y-0
    `,
    secondary: `
      bg-gradient-to-br from-[rgba(230,200,122,0.15)] to-[rgba(201,168,76,0.25)]
      border border-[rgba(230,200,122,0.3)]
      text-[#f0dca0]
      hover:border-[rgba(230,200,122,0.5)]
      hover:shadow-[0_0_20px_rgba(230,200,122,0.3)]
      hover:-translate-y-0.5
      focus:ring-amber-400/50
      active:translate-y-0
    `,
    ghost: `
      bg-white/5 border border-white/10
      text-[#e8e4dc]
      hover:bg-white/10 hover:border-white/20
      focus:ring-white/30
    `,
    danger: `
      bg-gradient-to-br from-red-500/20 to-red-600/30
      border border-red-500/40
      text-red-400
      hover:border-red-500/60
      hover:shadow-[0_0_15px_rgba(255,82,82,0.3)]
      hover:-translate-y-0.5
      focus:ring-red-400/50
      active:translate-y-0
    `
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      ref={ref}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
});

GenshinButton.displayName = 'GenshinButton';

// ========== GenshinCard ==========
interface GenshinCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

export const GenshinCard: React.FC<GenshinCardProps> = ({
  children,
  className = '',
  hover = true,
  glow = false,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden
        bg-gradient-to-br from-[rgba(26,29,53,0.8)] to-[rgba(18,20,40,0.9)]
        backdrop-blur-xl
        border border-[rgba(255,255,255,0.08)]
        rounded-2xl
        shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]
        transition-all duration-300 ease-out
        ${hover ? `
          hover:-translate-y-1
          hover:border-[rgba(230,200,122,0.2)]
          hover:shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_20px_rgba(230,200,122,0.1)]
        ` : ''}
        ${glow ? 'animate-accent-pulse' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {/* 顶部高光 */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {children}
    </div>
  );
};

// ========== GenshinInput ==========
interface GenshinInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const GenshinInput = forwardRef<HTMLInputElement, GenshinInputProps>(({
  label,
  error,
  icon,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-[#a8a29e]">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6561]">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={`
            w-full
            bg-[rgba(30,35,60,0.6)]
            border border-[rgba(255,255,255,0.08)]
            rounded-lg
            text-[#e8e4dc] placeholder-[#6b6561]
            px-4 py-2.5
            ${icon ? 'pl-10' : ''}
            transition-all duration-300
            focus:outline-none focus:border-[rgba(230,200,122,0.4)]
            focus:shadow-[0_0_0_3px_rgba(230,200,122,0.1)]
            hover:border-[rgba(255,255,255,0.15)]
            ${error ? 'border-red-500/50 focus:border-red-500/70' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
});

GenshinInput.displayName = 'GenshinInput';

// ========== GenshinTextarea ==========
interface GenshinTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const GenshinTextarea = forwardRef<HTMLTextAreaElement, GenshinTextareaProps>(({
  label,
  error,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-[#a8a29e]">{label}</label>
      )}
      <textarea
        ref={ref}
        className={`
          w-full
          bg-[rgba(30,35,60,0.6)]
          border border-[rgba(255,255,255,0.08)]
          rounded-lg
          text-[#e8e4dc] placeholder-[#6b6561]
          px-4 py-3
          transition-all duration-300
          focus:outline-none focus:border-[rgba(230,200,122,0.4)]
          focus:shadow-[0_0_0_3px_rgba(230,200,122,0.1)]
          hover:border-[rgba(255,255,255,0.15)]
          resize-none overflow-y-auto
          ${error ? 'border-red-500/50 focus:border-red-500/70' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
});

GenshinTextarea.displayName = 'GenshinTextarea';

// ========== GenshinModal ==========
interface GenshinModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: ReactNode;
  footer?: ReactNode;
  hideCloseButton?: boolean;
}

export const GenshinModal: React.FC<GenshinModalProps> = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  hideCloseButton = false
}) => {
  const sizeMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl'
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={size === 'full' ? '4xl' : size}
      hideCloseButton={hideCloseButton}
      classNames={{
        backdrop: 'bg-black/60 backdrop-blur-sm',
        base: `
          bg-gradient-to-br from-[#1a1d35] to-[#121428]
          border border-[rgba(255,255,255,0.08)]
          shadow-2xl shadow-black/50
          ${sizeMap[size]}
        `,
        header: 'border-b border-[rgba(255,255,255,0.06)] px-6 py-4',
        body: 'px-6 py-4',
        footer: 'border-t border-[rgba(255,255,255,0.06)] px-6 py-4',
        closeButton: 'text-[#a8a29e] hover:text-[#e8e4dc] hover:bg-white/10'
      }}
    >
      <ModalContent>
        {title && (
          <ModalHeader>
            <h2 className="text-lg font-bold pro-title">{title}</h2>
          </ModalHeader>
        )}
        <ModalBody className="text-[#e8e4dc]">
          {children}
        </ModalBody>
        {footer && (
          <ModalFooter className="gap-2">
            {footer}
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

// ========== GenshinTabs ==========
interface GenshinTabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  content?: ReactNode;
}

interface GenshinTabsProps {
  items: GenshinTabItem[];
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  variant?: 'underlined' | 'solid' | 'bordered';
  className?: string;
}

export const GenshinTabs: React.FC<GenshinTabsProps> = ({
  items,
  selectedKey,
  onSelectionChange,
  variant = 'underlined',
  className = ''
}) => {
  return (
    <Tabs
      selectedKey={selectedKey}
      onSelectionChange={(key) => onSelectionChange?.(key as string)}
      variant={variant}
      classNames={{
        base: className,
        tabList: `
          bg-transparent gap-0 p-0
          ${variant === 'underlined' ? 'border-b border-[rgba(255,255,255,0.08)]' : ''}
          ${variant === 'solid' ? 'bg-[rgba(30,35,60,0.6)] rounded-lg p-1' : ''}
          ${variant === 'bordered' ? 'border border-[rgba(255,255,255,0.08)] rounded-lg p-1' : ''}
        `,
        tab: `
          px-4 py-2.5 font-medium text-sm
          text-[#a8a29e]
          data-[selected=true]:text-[#e6c87a]
          hover:text-[#e8e4dc]
          transition-colors duration-200
          ${variant === 'solid' ? 'data-[selected=true]:bg-[rgba(230,200,122,0.15)] rounded-md' : ''}
        `,
        cursor: variant === 'underlined' ? `
          bg-gradient-to-r from-amber-400 to-yellow-500
          h-0.5 rounded-full
          shadow-[0_0_10px_rgba(230,200,122,0.5)]
        ` : 'hidden',
        tabContent: 'group-data-[selected=true]:text-[#e6c87a]',
        panel: 'pt-4'
      }}
    >
      {items.map((item) => (
        <Tab
          key={item.key}
          title={
            <div className="flex items-center gap-2">
              {item.icon}
              <span>{item.label}</span>
            </div>
          }
        >
          {item.content}
        </Tab>
      ))}
    </Tabs>
  );
};

// ========== GenshinBadge ==========
interface GenshinBadgeProps {
  children: ReactNode;
  variant?: 'gold' | 'blue' | 'purple' | 'green' | 'red';
  size?: 'sm' | 'md';
  className?: string;
}

export const GenshinBadge: React.FC<GenshinBadgeProps> = ({
  children,
  variant = 'gold',
  size = 'sm',
  className = ''
}) => {
  const variants = {
    gold: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border-amber-500/30 text-[#e6c87a]',
    blue: 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/30 text-[#4fc3f7]',
    purple: 'bg-gradient-to-r from-purple-500/20 to-violet-500/20 border-purple-500/30 text-[#b388ff]',
    green: 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-[#69f0ae]',
    red: 'bg-gradient-to-r from-red-500/20 to-rose-500/20 border-red-500/30 text-[#ff5252]'
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm'
  };

  return (
    <span className={`
      inline-flex items-center
      border rounded-full font-medium
      ${variants[variant]}
      ${sizes[size]}
      ${className}
    `}>
      {children}
    </span>
  );
};

// ========== GenshinDivider ==========
interface GenshinDividerProps {
  className?: string;
  gold?: boolean;
}

export const GenshinDivider: React.FC<GenshinDividerProps> = ({
  className = '',
  gold = false
}) => {
  return (
    <div className={`
      h-px w-full
      ${gold
        ? 'bg-gradient-to-r from-transparent via-[rgba(230,200,122,0.3)] to-transparent'
        : 'bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.1)] to-transparent'
      }
      ${className}
    `} />
  );
};

// ========== GenshinProgress ==========
interface GenshinProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  className?: string;
  label?: string;
}

export const GenshinProgress: React.FC<GenshinProgressProps> = ({
  value,
  max = 100,
  size = 'md',
  showValue = false,
  className = '',
  label
}) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {(label || showValue) && (
        <div className="flex justify-between text-xs text-[#a8a29e]">
          {label && <span>{label}</span>}
          {showValue && <span>{Math.round(percent)}%</span>}
        </div>
      )}
      <div className={`
        w-full rounded-full overflow-hidden
        bg-[rgba(30,35,60,0.6)]
        ${sizes[size]}
      `}>
        <div
          className={`
            h-full rounded-full
            bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600
            shadow-[0_0_10px_rgba(230,200,122,0.5)]
            transition-all duration-500 ease-out
          `}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

// ========== GenshinSelect ==========
interface GenshinSelectOption {
  value: string;
  label: string;
}

interface GenshinSelectProps {
  options: GenshinSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export const GenshinSelect: React.FC<GenshinSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择',
  label,
  className = ''
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-[#a8a29e]">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={`
          w-full
          bg-[rgba(30,35,60,0.6)]
          border border-[rgba(255,255,255,0.08)]
          rounded-lg
          text-[#e8e4dc]
          px-4 py-2.5
          transition-all duration-300
          focus:outline-none focus:border-[rgba(230,200,122,0.4)]
          focus:shadow-[0_0_0_3px_rgba(230,200,122,0.1)]
          hover:border-[rgba(255,255,255,0.15)]
          cursor-pointer
          appearance-none
          bg-no-repeat bg-right
          pr-10
        `}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8a29e'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
          backgroundSize: '1.5rem',
          backgroundPosition: 'right 0.5rem center'
        }}
      >
        <option value="" className="bg-[#1a1d35] text-[#6b6561]">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#1a1d35] text-[#e8e4dc]">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// ========== 导出 ==========
export default {
  GenshinButton,
  GenshinCard,
  GenshinInput,
  GenshinTextarea,
  GenshinModal,
  GenshinTabs,
  GenshinBadge,
  GenshinDivider,
  GenshinProgress,
  GenshinSelect
};
