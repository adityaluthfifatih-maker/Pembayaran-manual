import { Bell, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  SimpleNotification,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications-client";

const POLL_MS = 15000;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

/**
 * Simple polling-based notification bell (no Socket.io / WebSocket).
 * Polls /api/notifications and /api/notifications/unread-count on an
 * interval so the badge and dropdown stay reasonably fresh with minimal
 * infrastructure.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SimpleNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const pollUnread = async () => {
      try {
        const count = await fetchUnreadCount();
        if (!cancelled) setUnreadCount(count);
      } catch {
        /* silent — next poll retries */
      }
    };

    void pollUnread();
    const id = setInterval(pollUnread, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchNotifications()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleItemClick = async (n: SimpleNotification) => {
    if (n.isRead) return;
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(n.id);
    } catch {
      /* best-effort */
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      /* best-effort */
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        data-testid="button-notification-bell"
      >
        <Bell className="w-5 h-5 text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 max-w-[85vw] bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-sm font-bold text-gray-900">Notifikasi</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <Check className="w-3 h-3" /> Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                Belum ada notifikasi
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-b-0 transition-colors hover:bg-gray-50 ${
                    !n.isRead ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    <div className={n.isRead ? "pl-3.5" : ""}>
                      <p className="text-xs text-gray-800 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
