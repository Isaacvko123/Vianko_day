import { apiRequest } from "../api/http";
import { useEffect, useState } from "react";
import type { RealtimeEvent } from "../realtime/socket";

export type NotificationPermissionState = "default" | "denied" | "granted" | "unsupported";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  url?: string;
  actionLabel?: string;
};

function getBrowserNotificationPermission(): NotificationPermissionState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function useBrowserNotifications(currentUserId?: string, token?: string, canViewManagement = false) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() =>
    getBrowserNotificationPermission()
  );

  function dismissNotification(notificationId: string) {
    setNotifications((currentNotifications) => currentNotifications.filter((notification) => notification.id !== notificationId));
  }

  useEffect(() => setNotifications([]), [currentUserId]);
  async function requestBrowserNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      throw new Error("Este navegador no admite notificaciones. Puedes consultar todos los avisos en esta bandeja.");
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'denied') throw new Error('Las notificaciones están bloqueadas. Permítelas desde la configuración de este sitio en tu navegador y vuelve a activarlas.');
    if (permission !== 'granted') throw new Error('No se activaron las notificaciones. Puedes intentarlo nuevamente cuando quieras.');
    if (!token) throw new Error('Inicia sesión para registrar las notificaciones de este dispositivo.');
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Instala la app en tu pantalla de inicio para habilitar las notificaciones móviles.");
    const config = await apiRequest<{ enabled: boolean; publicKey?: string }>("/push/config", { token });
    if (!config.enabled || !config.publicKey) throw new Error("Los avisos del servidor aún no están configurados. Tu bandeja sigue disponible.");
    await navigator.serviceWorker.register("/sw.js");
    const registration = await navigator.serviceWorker.ready;
    const normalized = config.publicKey.replace(/-/g, "+").replace(/_/g, "/");
    const key = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await apiRequest("/push/subscriptions", { token, method: "POST", body: subscription.toJSON() as Record<string, unknown> });
  }

  function pushRealtimeNotification(event: RealtimeEvent) {
    if (event.actorId === currentUserId || event.type === "notification.read" || event.type === "chat.updated") {
      return;
    }

    const params = new URLSearchParams({workspace:event.workspaceId});
    if(event.projectId) params.set('project',event.projectId);
    if(event.taskId) params.set('task',event.taskId);
    let path='/board';
    let actionLabel='Ver tarea';
    if(event.type.startsWith('chat.')){if(event.chatId)params.set('chat',event.chatId);actionLabel='Abrir chat';}
    else if(event.type==='comment.created'){params.set('tab','conversation');if(event.commentId)params.set('comment',event.commentId);actionLabel='Ver conversación';}
    else if(event.type.startsWith('staffing.')&&canViewManagement){path='/management';if(event.requestId)params.set('request',event.requestId);actionLabel='Ver solicitud';}
    else if(!event.taskId){path=event.projectId?'/board':'/notifications';actionLabel=event.projectId?'Ver proyecto':'Ver notificaciones';}
    const notification = { id:event.id,title:event.title,message:event.message,createdAt:event.createdAt,url:`${path}?${params}`,actionLabel };

    setNotifications((currentNotifications) => [notification, ...currentNotifications.filter((item) => item.id !== notification.id)].slice(0, 3));


  }

  return {
    notifications,
    notificationPermission,
    dismissNotification,
    requestBrowserNotifications,
    pushRealtimeNotification
  };
}
