"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useSocket } from "@/context/SocketContext";
import { relativeTime } from "@/lib/format";
import type { AppNotification } from "@/types";

function playNotificationSound() {
  try {
    const audio = new Audio('/notification.wav');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch { /* silent */ }
}

function notifActionUrl(n: AppNotification): string | null {
  if (n.type === 'wallet') return '/contabilidad?tab=recharges';
  if (n.type === 'sos') return '/sos';
  return null;
}

export default function NotificationDropdown() {
  const router = useRouter();
  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  // Carga inicial del conteo de no leídas (solo una vez al montar)
  useEffect(() => {
    api.get('/notifications/me/unread-count')
      .then(({ data }) => { setUnread(data.count ?? 0); firstLoad.current = false; })
      .catch(() => {});
  }, []);

  // Escucha notification.new del socket — sin polling
  useEffect(() => {
    if (!socket) return;

    const handler = (notif: AppNotification) => {
      playNotificationSound();
      setUnread((v) => v + 1);
      // Si el dropdown está abierto, agrega la notif al tope de la lista
      setNotifications((prev) => (prev.length > 0 ? [notif, ...prev] : prev));
    };

    socket.on('notification.new', handler);
    return () => { socket.off('notification.new', handler); };
  }, [socket]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications/me', { params: { limit: 10, page: 1 } });
      setNotifications(data.items ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    } catch { /* silent */ }
  };

  const markRead = async (notif: AppNotification) => {
    try {
      if (!notif.read_at) {
        await api.patch(`/notifications/${notif.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n)
        );
        setUnread((v) => Math.max(0, v - 1));
      }
      const url = notifActionUrl(notif);
      if (url) { setIsOpen(false); router.push(url); }
    } catch { /* silent */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative flex items-center justify-center w-10 h-10 text-gray-500 bg-white border border-gray-200 rounded-full hover:text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
        aria-label="Notificaciones"
      >
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-bold text-white animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <svg className="fill-current" width="20" height="20" viewBox="0 0 24 24">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl z-[9999] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Notificaciones</h3>
              {unread > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400">
                  {unread}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-4 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-gray-100 dark:bg-gray-800 mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-800 mb-2" />
                    <div className="h-2.5 w-full rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
              ))
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <span className="text-3xl">🔔</span>
                <p className="text-sm text-gray-400 mt-2">Sin notificaciones</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${!n.read_at ? 'bg-brand-50/40 dark:bg-brand-500/5' : ''}`}
                >
                  <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${!n.read_at ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold ${!n.read_at ? 'text-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{relativeTime(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-center text-gray-400">Últimas {notifications.length} notificaciones</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
