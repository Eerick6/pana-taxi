'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Propietario de la Plataforma',
  PLATFORM_ADMIN: 'Administrador de Plataforma',
  FINANCE: 'Finanzas',
  MONITORING: 'Monitoreo',
  SUPPORT: 'Soporte',
  COOPERATIVE_ADMIN: 'Administrador de Cooperativa',
  COOPERATIVE_OPERATOR: 'Operador de Cooperativa',
  COOPERATIVE_SUPERVISOR: 'Supervisor de Cooperativa',
};

const ROLE_COLOR: Record<string, string> = {
  OWNER: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400',
  PLATFORM_ADMIN: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  FINANCE: 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400',
  MONITORING: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  SUPPORT: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
  COOPERATIVE_ADMIN: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',
};

interface Stats {
  totalCoops?: number;
  totalDrivers?: number;
  totalTrips?: number;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<Stats>({});

  useEffect(() => {
    // Fetch some real stats for display
    Promise.allSettled([
      api.get('/cooperatives', { params: { limit: 1, page: 1 } }),
      api.get('/drivers', { params: { limit: 1, page: 1 } }),
      api.get('/reports/summary'),
    ]).then(([coops, drivers, summary]) => {
      setStats({
        totalCoops: coops.status === 'fulfilled' ? coops.value.data?.total ?? 0 : 0,
        totalDrivers: drivers.status === 'fulfilled' ? drivers.value.data?.total ?? 0 : 0,
        totalTrips: summary.status === 'fulfilled' ? summary.value.data?.total_trips ?? 0 : 0,
      });
    });
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const initials = user.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const roleColor = ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Profile hero */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 relative">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        </div>
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-8">
            <div className="w-16 h-16 rounded-2xl border-4 border-white dark:border-gray-900 shadow-lg flex items-center justify-center text-xl font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0 pt-2 sm:pt-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{user.full_name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${roleColor}`}>
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-error-200 dark:border-error-800 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      {(user.role === 'OWNER' || user.role === 'PLATFORM_ADMIN') && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Cooperativas', value: stats.totalCoops ?? '—', icon: '🏢' },
            { label: 'Conductores', value: stats.totalDrivers ?? '—', icon: '👤' },
            { label: 'Viajes totales', value: stats.totalTrips?.toLocaleString() ?? '—', icon: '🗺️' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 text-center">
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="text-xl font-bold text-gray-800 dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Account info */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-5">Información de la cuenta</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { label: 'Nombre completo', value: user.full_name, icon: '👤' },
            { label: 'Correo electrónico', value: user.email, icon: '📧' },
            { label: 'Rol en la plataforma', value: ROLE_LABEL[user.role] ?? user.role, icon: '🔑' },
            { label: 'ID de cuenta', value: user.id, icon: '🔍', mono: true, truncate: true },
          ].map((row) => (
            <div key={row.label} className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{row.icon}</span>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{row.label}</span>
              </div>
              <p className={`${row.mono ? 'font-mono text-xs text-gray-500 dark:text-gray-400 break-all' : 'text-sm font-semibold text-gray-800 dark:text-white'}`}>
                {row.truncate ? `${row.value.slice(0, 20)}...` : row.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Seguridad</h2>
        <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-success-50 dark:bg-success-500/10 flex items-center justify-center text-lg">🔐</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white">Sesión activa</p>
              <p className="text-xs text-gray-400">Token JWT con rotación automática cada 15 minutos</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-success-600 dark:text-success-400">
            <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            Activa
          </span>
        </div>
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-lg">🛡️</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white">Autenticación por OTP</p>
              <p className="text-xs text-gray-400">Verificación por correo o teléfono para acceso seguro</p>
            </div>
          </div>
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400">Habilitado</span>
        </div>
      </div>
    </div>
  );
}
