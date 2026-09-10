import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { apiRequest } from '../api/http';
import type { Role } from '../types';
import { roleLabel } from '../lib/roles';
import { formatDate } from '../lib/format';
import { Button, EmptyState, LoadingState } from './ui';
type Item = { id: string; email: string; status: string; expiresAt: string; createdAt: string; role?: Role; area?: { name: string }; canRevoke: boolean };
export function InvitationsList({ token, workspaceId }: { token: string; workspaceId: string }) {
  const query = useQuery({ queryKey: ['invitations', workspaceId], queryFn: () => apiRequest<{ invitations: Item[] }>(`/workspaces/${workspaceId}/invitations`, { token }) });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  return <div className="invitations-panel"><p className="muted-note">Últimas 50 invitaciones. Al aceptar, la persona aparecerá en Equipo. Cancelar una invitación invalida su enlace.</p>{query.isLoading && <LoadingState label="Cargando invitaciones…" rows={3} />}{(error || query.error) && <p role="alert" className="form-error">{error || query.error?.message}</p>}{query.data?.invitations.map(item => {
    const expired = item.status === 'EXPIRED' || item.status === 'PENDING' && new Date(item.expiresAt) <= new Date();
    return <article className="invitation-row" key={item.id}><Mail size={18} /><span><strong>{item.email}</strong><small>{roleLabel(item.role)} · {item.area?.name}</small></span><span className="subtle-tag">{expired ? 'Vencida' : item.status === 'ACCEPTED' ? 'Aceptada' : item.status === 'REVOKED' ? 'Cancelada' : `Pendiente · vence ${formatDate(item.expiresAt)}`}</span>{item.canRevoke && <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={async () => { setBusy(item.id); setError(''); try { await apiRequest(`/workspaces/${workspaceId}/invitations/${item.id}/revoke`, { token, method: 'PATCH' }); await query.refetch(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo cancelar la invitación.'); } finally { setBusy(''); } }}>{busy === item.id ? 'Cancelando…' : 'Cancelar invitación'}</Button>}</article>;
  })}{query.data?.invitations.length === 0 && <EmptyState icon={<Mail size={24} />} title="Aún no hay invitaciones" description="Invita a una persona para compartirle su acceso al equipo." />}</div>;
}
