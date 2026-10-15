export type ToastType = 'debug' | 'info' | 'success' | 'warn' | 'error' | 'warning';

export interface ToastItemData {
  id: string;
  message: string;
  type: ToastType;
}
