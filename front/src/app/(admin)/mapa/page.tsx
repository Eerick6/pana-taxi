'use client';
import dynamic from 'next/dynamic';

const MapaView = dynamic(() => import('@/features/mapa/components/MapaView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px]">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function MapaPage() {
  return <MapaView />;
}
