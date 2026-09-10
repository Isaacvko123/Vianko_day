import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
export function Dialog({ title, description, children, onClose, busy = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useDialog(true, onClose, busy);
  return <div ref={ref} className="product-dialog-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="product-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={20} /></button></header>
      {children}
    </section>
  </div>;
}
