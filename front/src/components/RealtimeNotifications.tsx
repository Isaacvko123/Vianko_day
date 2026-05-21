import { BellRing, X } from "lucide-react";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};

type RealtimeNotificationsProps = {
  notifications: NotificationItem[];
  onDismiss: (notificationId: string) => void;
};

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function RealtimeNotifications({ notifications, onDismiss }: RealtimeNotificationsProps) {
  if (notifications.length === 0) {
    return <></>;
  }

  return (
    <section className="realtime-toast-stack" aria-live="polite" aria-label="Notificaciones en tiempo real">
      {notifications.map((notification) => (
        <article className="realtime-toast" key={notification.id}>
          <span><BellRing size={17} /></span>
          <div>
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
            <small>{formatNotificationTime(notification.createdAt)}</small>
          </div>
          <button type="button" onClick={() => onDismiss(notification.id)} aria-label="Cerrar notificacion">
            <X size={15} />
          </button>
        </article>
      ))}
    </section>
  );
}
