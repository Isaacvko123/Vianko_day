import { useState } from "react";
import type { RealtimeEvent } from "../realtime/socket";

export type NotificationPermissionState = "default" | "denied" | "granted" | "unsupported";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};

function getBrowserNotificationPermission(): NotificationPermissionState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function useBrowserNotifications(currentUserId?: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() =>
    getBrowserNotificationPermission()
  );

  function dismissNotification(notificationId: string) {
    setNotifications((currentNotifications) => currentNotifications.filter((notification) => notification.id !== notificationId));
  }

  async function requestBrowserNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function pushRealtimeNotification(event: RealtimeEvent) {
    if (event.actorId === currentUserId) {
      return;
    }

    const notification = {
      id: event.id,
      title: event.title,
      message: event.message,
      createdAt: event.createdAt
    };

    setNotifications((currentNotifications) => [notification, ...currentNotifications].slice(0, 5));

    if (notificationPermission === "granted") {
      new Notification(event.title, {
        body: event.message,
        tag: event.id
      });
    }
  }

  return {
    notifications,
    notificationPermission,
    dismissNotification,
    requestBrowserNotifications,
    pushRealtimeNotification
  };
}
