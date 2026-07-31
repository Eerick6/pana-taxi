'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import Link from 'next/link';

interface CoopStats {
  totalDrivers: number;
  activeDrivers: number;
  tripsToday: number;
  revenueToday: number;
  pendingRequests: number;
}

export default function CoopDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<CoopStats | null>(null);
  const [coopName, setCoopName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.cooperative_id) return;
    const id = user.cooperative_id;

    Promise.allSettled([
      api.get(`/cooperatives/${id}`),
      api.get('/drivers', { params: { limit: 500, cooperative_id: id } }),
      api.get('/trips', { params: { limit: 500, status: 'in_progress', cooperative_id: id } }),
      api.get('/trips', { params: { limit: 500, status: 'requested', cooperative_id: id } }),
      api.get('/reports/summary', { params: { cooperative_id: id } }),
    ]).then(([coop, drivers, active, pending, summary]) => {
      if (coop.status === 'fulfilled') setCoopName(coop.value.data?.name ?? '');
      const driverList = drivers.status === 'fulfilled' ? (drivers.value.data?.items ?? []) : [];
      setStats({
        totalDrivers:    driverList.length,
        activeDrivers:   driverList.filter((d: any) => ['online', 'busy'].includes(d.online_status)).length,
        tripsToday:      summary.status === 'fulfilled' ? (summary.value.data?.total_trips ?? 0) : 0,
        revenueToday:    summary.status === 'fulfilled' ? (summary.value.data?.total_revenue ?? 0) : 0,
        pendingRequests: pending.status === 'fulfilled' ? (pending.value.data?.total ?? 0) : 0,
      });
      setLoading(false);
    });
  }, [user?.cooperative_id]);

  const ROLE_LABEL: Record<string, string> = {
    cooperative_admin:      'Administrador',
    cooperative_operator:   'Operador',
    cooperative_supervisor: 'Supervisor',
  };

  const cards = stats ? [
    { label: 'Conductores totales', value: stats.totalDrivers, icon: '👤', color: 'bg-blue-50 dark:bg-blue-500/10', href: '/coop/conductores' },
    { label: 'Conductores activos', value: stats.activeDrivers, icon: '🟢', color: 'bg-emerald-50 dark:bg-emerald-500/10', href: '/coop/mapa' },
    { label: 'Solicitudes pendientes', value: stats.pendingRequests, icon: '🚕', color: 'bg-amber-50 dark:bg-amber-500/10', href: '/coop/viajes' },
    { label: 'Viajes hoy', value: stats.tripsToday, icon: '🗺️', color: 'bg-brand-50 dark:bg-brand-500/10', href: '/coop/viajes' },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
          {loading ? 'Cargando…' : (coopName || 'Mi Cooperativa')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Bienvenido, {user?.full_name} · {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 h-28 animate-pulse">
                <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 rounded mb-3" />
                <div className="h-8 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
            ))
          : cards.map((c) => (
              <Link key={c.label} href={c.href}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-md transition-shadow group">
                <div className={`w-10 h-10 rounded-xl ${c.color} flex items-center justify-center text-xl mb-3`}>
                  {c.icon}
                </div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white tabular-nums">{c.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.label}</p>
              </Link>
            ))
        }
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: '/coop/mapa',        icon: '📡', title: 'Mapa en vivo',    desc: 'Ubica a tus conductores en tiempo real' },
          { href: '/coop/conductores', icon: '👤', title: 'Conductores',     desc: 'Gestiona el personal y su estado' },
          { href: '/coop/vehiculos',   icon: '🚖', title: 'Vehículos',       desc: 'Flota de la cooperativa' },
          { href: '/coop/viajes',      icon: '🗺️', title: 'Viajes',         desc: 'Historial y seguimiento de viajes' },
          { href: '/coop/staff',       icon: '🧑‍💼', title: 'Staff',         desc: 'Equipo administrativo de la cooperativa' },
        ].map((item) => (
          <Link key={item.href} href={item.href}
            className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-brand-200 dark:hover:border-brand-500/30 hover:shadow-md transition-all group">
            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xl flex-shrink-0 group-hover:bg-brand-50 dark:group-hover:bg-brand-500/10 transition-colors">
              {item.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white">{item.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
