'use client';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario',
  platform_admin: 'Administrador de Plataforma',
  finance: 'Finanzas',
  monitoring: 'Monitoreo',
  support: 'Soporte',
  cooperative_admin: 'Administrador de Cooperativa',
};

export default function Unauthorized({ requiredRoles }: { requiredRoles?: string[] }) {
  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-4xl mb-6">
        🔒
      </div>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
        Acceso restringido
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-1">
        Tu rol <span className="font-semibold text-gray-700 dark:text-gray-200">
          {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
        </span> no tiene permiso para acceder a esta sección.
      </p>
      {requiredRoles && requiredRoles.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-6">
          Roles con acceso: {requiredRoles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}
        </p>
      )}
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
      >
        ← Volver al Dashboard
      </Link>
    </div>
  );
}
