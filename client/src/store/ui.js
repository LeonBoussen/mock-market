import { create } from 'zustand';

let seq = 0;

export const useToasts = create((set, get) => ({
  toasts: [],
  push(kind, message) {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismiss(id), kind === 'err' ? 5200 : 3600);
    return id;
  },
  ok(message) { return this.push('ok', message); },
  err(message) { return this.push('err', message); },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export function errMessage(e) {
  return e?.message || 'Something went wrong. Please try again.';
}
