// Sole renderer of toastStore (src/lib/toast.ts). showToast() only pushes to
// (and, after 3.5s, removes from) the store — all DOM building for toasts
// happens here, driven by useToasts' useSyncExternalStore subscription.
//
// No dismiss timer lives in this component: showToast() already schedules
// the store removal at 3.5s, so this just renders whatever's currently in
// the store. A second timer here would race the first and risk removing an
// id twice (harmless on the store, since the filter is a no-op the second
// time, but pointless duplication) — one writer of the timeout is enough.
import type { CSSProperties } from 'react';
import { useToasts } from '@/hooks/useToasts';
import type { ToastVariant } from '@/lib/toast';

// Mirrors the inline border-left-color the old DOM-based showToast() applied
// per variant; 'info' falls through to legacy.css's default border color.
const VARIANT_STYLE: Record<ToastVariant, CSSProperties | undefined> = {
  info: undefined,
  success: { borderLeftColor: 'var(--success-500)' },
  error: { borderLeftColor: 'var(--danger-500)' },
};

export function Toaster() {
  const toasts = useToasts();

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" role="status" style={VARIANT_STYLE[toast.variant]}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
