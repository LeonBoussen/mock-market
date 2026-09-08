import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { useToasts } from '../store/ui';

const ICONS = { ok: CheckCircle2, err: XCircle, info: Info };
const COLORS = { ok: 'var(--up)', err: 'var(--down)', info: 'var(--brand-1)' };

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const Ico = ICONS[t.kind] || Info;
        return (
          <div key={t.id} className={`toast ${t.kind}`} role="status" onClick={() => dismiss(t.id)}>
            <Ico size={17} color={COLORS[t.kind]} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
