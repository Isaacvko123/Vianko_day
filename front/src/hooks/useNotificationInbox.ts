import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/http';
export type InboxItem = { id: string; title: string; message: string; createdAt: string; readAt?: string; url: string; context?: string; projectName?: string; actorName?: string; category?: 'tasks'|'messages'|'requests'; actionLabel?: string };
export function useNotificationInbox(token?: string, workspaceId?: string, userId?: string) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<'all'|'tasks'|'messages'|'requests'>('all');
  const key = ['notifications', userId, workspaceId];
  useEffect(() => { setPage(0); setUnreadOnly(false); setCategory('all'); }, [workspaceId, userId]);
  const query = useQuery({ queryKey: [...key, page, unreadOnly, category], enabled: Boolean(token && workspaceId),
    queryFn: () => apiRequest<{ notifications: InboxItem[]; unreadCount: number; total: number }>(`/notifications?workspaceId=${workspaceId}&limit=30&offset=${page*30}&unread=${unreadOnly}&category=${category}`, { token }),
    refetchOnWindowFocus: true, refetchOnReconnect: true, refetchInterval: 60000 });
  const unreadCount = query.data?.unreadCount ?? 0;
  useEffect(() => { if(query.data) setPage(current=>Math.min(current,Math.max(0,Math.ceil(query.data.total/30)-1))); }, [query.data?.total]);
  useEffect(() => {
    const badge = navigator as Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    navigator.serviceWorker?.controller?.postMessage({ type: "UNREAD_COUNT", count: unreadCount });
    void (unreadCount ? badge.setAppBadge?.(unreadCount) : badge.clearAppBadge?.())?.catch(() => undefined);
  }, [unreadCount]);
  async function markRead(ids: string[]) {
    if (!ids.length || !token || !workspaceId) return;
    await apiRequest('/notifications/read', { token, method: 'POST', body: { workspaceId, ids } });
    await queryClient.invalidateQueries({ queryKey: key });
  }
  return { items: query.data?.notifications ?? [], unreadCount, total: query.data?.total ?? 0, page, setPage,
    unreadOnly, setUnreadOnly: (value: boolean) => {setPage(0);setUnreadOnly(value);}, category, setCategory: (value: typeof category) => {setPage(0);setCategory(value);},
    isLoading: query.isPending, error: query.error, markRead, refresh: () => queryClient.invalidateQueries({ queryKey: key }) };
}
