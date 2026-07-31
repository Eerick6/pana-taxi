'use client';
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import dynamic from 'next/dynamic';

const MapaView = dynamic(
  () => import('@/features/mapa/components/MapaView'),
  { ssr: false }
);

export default function CoopMapaPage() {
  const { user } = useAuth();
  return <MapaView cooperativeId={user?.cooperative_id ?? undefined} />;
}
