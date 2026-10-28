import { create } from 'zustand';
import { uid } from './id';

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>): void;
  dismiss(id: string): void;
}

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push(t) {
    const id = uid();
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? 7000 : 4000);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  info: (message: string, action?: Toast['action']) => useToasts.getState().push({ kind: 'info', message, action }),
  success: (message: string, action?: Toast['action']) => useToasts.getState().push({ kind: 'success', message, action }),
  error: (message: string) => useToasts.getState().push({ kind: 'error', message }),
};

