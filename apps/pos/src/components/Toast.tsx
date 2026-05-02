'use client';

import { CheckCircle2, X, XCircle } from 'lucide-react';
import { create } from 'zustand';

import { cn } from '@/lib/utils';

interface ToastItem {
  id: string;
  type: 'success' | 'error';
  message: string;
}

interface ToastState {
  items: ToastItem[];
  show: (type: 'success' | 'error', message: string) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastState>((set) => ({
  items: [],
  show: (type, message) =>
    set((s) => {
      const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const item = { id, type, message };
      // auto-dismiss después de 3.5s
      setTimeout(() => {
        set((curr) => ({ items: curr.items.filter((i) => i.id !== id) }));
      }, 3500);
      return { items: [...s.items, item] };
    }),
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
};

export function ToastContainer() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((it) => (
        <div
          key={it.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg animate-in slide-in-from-top-2',
            it.type === 'success' && 'border-emerald-500/40 bg-emerald-50',
            it.type === 'error' && 'border-destructive/40 bg-destructive/5',
          )}
        >
          {it.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 text-destructive" />
          )}
          <p className="flex-1 text-sm font-medium">{it.message}</p>
          <button
            type="button"
            onClick={() => dismiss(it.id)}
            className="rounded-md p-1 hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
