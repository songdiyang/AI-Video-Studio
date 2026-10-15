import React from 'react';
import { AlertCircle, AlertTriangle, Bug, CheckCircle, Info } from 'lucide-react';
import type { ToastType } from './types';

export function normalizeToastType(type: ToastType): 'debug' | 'info' | 'success' | 'warn' | 'error' {
  if (type === 'warning') return 'warn';
  return type;
}

export function getToastAppearance(type: ToastType) {
  switch (normalizeToastType(type)) {
    case 'success':
      return {
        bg: 'bg-emerald-600',
        border: 'border-emerald-500',
        text: 'text-white',
        icon: <CheckCircle className="w-5 h-5 text-emerald-100" />
      };
    case 'error':
      return {
        bg: 'bg-red-600',
        border: 'border-red-500',
        text: 'text-white',
        icon: <AlertCircle className="w-5 h-5 text-red-100" />
      };
    case 'warn':
      return {
        bg: 'bg-amber-500',
        border: 'border-amber-400',
        text: 'text-amber-950',
        icon: <AlertTriangle className="w-5 h-5 text-amber-900" />
      };
    case 'debug':
      return {
        bg: 'bg-slate-600',
        border: 'border-slate-500',
        text: 'text-white',
        icon: <Bug className="w-5 h-5 text-slate-200" />
      };
    case 'info':
    default:
      return {
        bg: 'bg-blue-600',
        border: 'border-blue-500',
        text: 'text-white',
        icon: <Info className="w-5 h-5 text-blue-100" />
      };
  }
}
