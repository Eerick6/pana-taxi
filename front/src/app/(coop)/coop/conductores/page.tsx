'use client';
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import SociosList from '@/features/conductores/components/SociosList';

export default function CoopSociosPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Socios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestiona las solicitudes de membresía y socios de tu cooperativa
        </p>
      </div>
      <SociosList cooperativeId={user?.cooperative_id ?? undefined} />
    </div>
  );
}
