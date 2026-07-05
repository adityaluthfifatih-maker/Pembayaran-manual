/**
 * Simple polling-based notifications client — deliberately NOT WebSocket.
 * Talks to /api/notifications, backed by the `notifications` table. Every
 * application submission also writes a row here (see the api-server apply
 * route), so this works even if the realtime WS push is missed.
 */
const API_BASE = "/api";

export interface SimpleNotification {
  id: number;
  userId: string;
  message: string;
  type: string;
  jobId: number | null;
  applicationId: number | null;
  isRead: boolean;
  createdAt: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`Request gagal (${res.status})`);
  return (await res.json()) as T;
}

export function fetchNotifications(): Promise<SimpleNotification[]> {
  return requestJson<SimpleNotification[]>("/notifications");
}

export function fetchUnreadCount(): Promise<number> {
  return requestJson<{ count: number }>("/notifications/unread-count").then(
    (r) => r.count,
  );
}

export function markNotificationRead(id: number): Promise<SimpleNotification> {
  return requestJson<SimpleNotification>(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead(): Promise<void> {
  return requestJson<{ ok: boolean }>("/notifications/read-all", {
    method: "POST",
  }).then(() => undefined);
}
