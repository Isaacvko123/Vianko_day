import { apiRequest } from "../api/http";
import { useEffect, useState } from "react";
import { registerPwa, isIos } from "../lib/pwa";
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

  const [deviceState, setDeviceState] = useState<"checking" | "enabled" | "available" | "denied" | "unsupported" | "server-missing" | "unavailable">("checking");
  const [deviceMessage, setDeviceMessage] = useState("");

  function dismissNotification(notificationId: string) {
    setNotifications((currentNotifications) => currentNotifications.filter((notification) => notification.id !== notificationId));
  }

  useEffect(() => setNotifications([]), [currentUserId]);
  async function checkDevice() {
    if (!token) return;
    try {
      const config = await apiRequest<{ enabled: boolean }>("/push/config", { token });
      if (!config.enabled) { setDeviceState("server-missing"); setDeviceMessage("El servidor todavía no tiene habilitados los avisos push."); return; }
      const permission = getBrowserNotificationPermission();
      setNotificationPermission(permission);
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || permission === "unsupported") {
        setDeviceState("unsupported"); setDeviceMessage(isIos() ? "Instala Vianko Day en la pantalla de inicio y abre su icono para activar los avisos." : "Usa la dirección HTTPS en un navegador compatible con avisos push."); return;
      }
      if (permission === "denied") { setDeviceState("denied"); setDeviceMessage("Permite las notificaciones de este sitio en la configuración del navegador."); return; }
      const registration = await registerPwa();
      const subscription = await registration.pushManager.getSubscription();
      const status = subscription ? await apiRequest<{ subscribed: boolean }>("/push/subscriptions/status", { token, method: "POST", body: { endpoint: subscription.endpoint } }) : { subscribed: false };
      setDeviceState(status.subscribed && permission === "granted" ? "enabled" : "available");
      setDeviceMessage(status.subscribed && permission === "granted" ? "Este dispositivo está registrado para recibir tus notificaciones." : "Activa los avisos para recibir asignaciones y mensajes con la app cerrada.");
    } catch { setDeviceState("unavailable"); setDeviceMessage("No se pudo consultar el registro del dispositivo. Reintenta cuando tengas conexión."); }
  }
  useEffect(() => {
    setDeviceState("checking");
    void checkDevice();
    const update = () => { if (document.visibilityState === "visible") void checkDevice(); };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [token, currentUserId]);

  async function requestBrowserNotifications() {
    if (!token) throw new Error("Inicia sesión para registrar este dispositivo.");
    if (!window.isSecureContext) throw new Error("Abre la dirección HTTPS de Vianko para activar los avisos.");
    if (!("Notification" in window) || !("PushManager" in window)) throw new Error(isIos() ? "Primero instala la app en la pantalla de inicio y ábrela desde su icono." : "Este navegador no admite avisos push. Usa Chrome, Edge, Firefox o Safari actualizado.");
    // Request permission directly from the click so Safari retains user activation.
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "denied") throw new Error("Las notificaciones están bloqueadas. Permítelas desde la configuración de este sitio.");
    if (permission !== "granted") throw new Error("No se activaron los avisos. Puedes intentarlo nuevamente cuando quieras.");
    const config = await apiRequest<{ enabled: boolean; publicKey?: string }>("/push/config", { token });
    if (!config.enabled || !config.publicKey) throw new Error("Los avisos del servidor aún no están configurados.");
    const registration = await registerPwa();
    const normalized = config.publicKey.replace(/-/g, "+").replace(/_/g, "/");
    const key = Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), char => char.charCodeAt(0));
    let subscription = await registration.pushManager.getSubscription();
    const previousKey = subscription?.options.applicationServerKey;
    if (subscription && previousKey && (new Uint8Array(previousKey).length !== key.length || new Uint8Array(previousKey).some((byte, index) => byte !== key[index]))) {
      await apiRequest("/push/subscriptions", { token, method: "DELETE", body: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe(); subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await apiRequest("/push/subscriptions", { token, method: "POST", body: subscription.toJSON() as Record<string, unknown> });
    setDeviceState("enabled"); setDeviceMessage("Este dispositivo está registrado para recibir tus notificaciones.");
  }

  async function disableBrowserNotifications() {
    if (!token) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await apiRequest("/push/subscriptions", { token, method: "DELETE", body: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe();
    }
    setDeviceState("available"); setDeviceMessage("Los avisos de este dispositivo están desactivados. Tu bandeja sigue guardando la actividad.");
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
    deviceState,
    deviceMessage,
    checkDevice,
    disableBrowserNotifications,
    dismissNotification,
    requestBrowserNotifications,
    pushRealtimeNotification
  };
}
