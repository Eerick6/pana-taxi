'use client';
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import VehiclesList from '@/features/vehiculos/components/VehiclesList';

export default function CoopVehiculosPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Vehículos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Flota de vehículos de tu cooperativa</p>
      </div>
      <VehiclesList cooperativeId={user?.cooperative_id ?? undefined} />
    </div>
  );
}
