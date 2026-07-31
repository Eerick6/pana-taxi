'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '@/lib/api';

interface OnlineDriver {
  id: string;
  full_name: string;
  online_status: 'online' | 'busy' | 'offline' | 'looking_for_work';
  current_lat: number | null;
  current_lng: number | null;
  cooperative?: { name: string } | null;
}

// Ecuador bounding box aproximado
const EC = { minLat: -5.1, maxLat: 1.7, minLng: -81.1, maxLng: -74.9 };

// Proyección lat/lng → coordenadas SVG (viewBox 400×300)
function project(lat: number, lng: number, w = 400, h = 300) {
  const x = ((lng - EC.minLng) / (EC.maxLng - EC.minLng)) * w;
  const y = (1 - (lat - EC.minLat) / (EC.maxLat - EC.minLat)) * h;
  return { x, y };
}

// Path SVG simplificado del contorno de Ecuador continental
const ECUADOR_PATH = `
  M 180,10 L 210,8 L 240,15 L 265,20 L 280,35 L 310,40 L 330,55
  L 340,75 L 345,100 L 338,120 L 330,145 L 320,165 L 305,180
  L 290,200 L 270,215 L 250,225 L 230,240 L 210,250 L 185,255
  L 160,248 L 135,238 L 115,222 L 95,205 L 80,185 L 68,162
  L 62,138 L 60,112 L 65,88 L 75,68 L 90,50 L 110,35
  L 135,22 L 158,12 Z
`;

async function fetchOnlineDrivers(): Promise<OnlineDriver[]> {
  try {
    const { data } = await api.get('/drivers', { params: { limit: 500, page: 1 } });
    const items: OnlineDriver[] = data?.items ?? [];
    return items.filter(
      (d) => d.online_status === 'online' || d.online_status === 'busy',
    );
  } catch {
    return [];
  }
}

export default function LiveMapWidget() {
  const [drivers, setDrivers] = useState<OnlineDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<OnlineDriver | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const result = await fetchOnlineDrivers();
    setDrivers(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30000); // refresca cada 30s
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  const withCoords = drivers.filter(
    (d) => d.current_lat != null && d.current_lng != null,
  );
  const withoutCoords = drivers.length - withCoords.length;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Mapa en vivo</h3>
          <p className="text-xs text-gray-400 mt-0.5">Taxis conectados · actualiza cada 30s</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            <span className="text-xs font-semibold text-success-600 dark:text-success-400">
              {loading ? '...' : `${drivers.length} en línea`}
            </span>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            <svg className={`w-3.5 h-3.5 text-gray-400 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mapa SVG */}
      <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700/50">
        <svg
          viewBox="0 0 400 300"
          className="w-full"
          style={{ minHeight: 220 }}
        >
          {/* Fondo gradiente */}
          <defs>
            <radialGradient id="mapBg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width="400" height="300" fill="url(#mapBg)" />

          {/* Grid sutil */}
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 40} x2="400" y2={i * 40} stroke="#334155" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="300" stroke="#334155" strokeWidth="0.5" />
          ))}

          {/* Contorno Ecuador */}
          <path
            d={ECUADOR_PATH}
            fill="#1e3a5f"
            stroke="#3b82f6"
            strokeWidth="1.5"
            strokeLinejoin="round"
            opacity="0.8"
          />

          {/* Drivers SIN coordenadas — posición aleatoria dentro del país */}
          {loading
            ? null
            : Array.from({ length: Math.min(withoutCoords, 15) }).map((_, i) => {
                const seed = i * 37 + 13;
                const x = 90 + (seed * 17 % 220);
                const y = 30 + (seed * 11 % 220);
                return (
                  <circle
                    key={`nc-${i}`}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="#22c55e"
                    opacity="0.6"
                  />
                );
              })}

          {/* Drivers CON coordenadas reales */}
          {withCoords.map((d) => {
            const { x, y } = project(d.current_lat!, d.current_lng!);
            const isBusy = d.online_status === 'busy';
            const color = isBusy ? '#f59e0b' : '#22c55e';
            return (
              <g key={d.id} filter="url(#glow)">
                {/* Pulso */}
                <circle cx={x} cy={y} r="6" fill={color} opacity="0.2">
                  <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Punto principal */}
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill={color}
                  stroke="white"
                  strokeWidth="1"
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    setHovered(d);
                    const svg = (e.target as SVGElement).closest('svg')!;
                    const rect = svg.getBoundingClientRect();
                    const svgX = (x / 400) * rect.width;
                    const svgY = (y / 300) * rect.height;
                    setTooltipPos({ x: svgX, y: svgY });
                  }}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            );
          })}

          {/* Loading overlay */}
          {loading && (
            <g>
              <rect width="400" height="300" fill="#0f172a" opacity="0.7" />
              <text x="200" y="155" textAnchor="middle" fill="#64748b" fontSize="12">
                Cargando posiciones...
              </text>
            </g>
          )}

          {/* Etiquetas ciudades principales */}
          {[
            { name: 'Quito', lat: -0.18, lng: -78.48 },
            { name: 'Guayaquil', lat: -2.17, lng: -79.92 },
            { name: 'Cuenca', lat: -2.9, lng: -79.0 },
          ].map((city) => {
            const { x, y } = project(city.lat, city.lng);
            return (
              <g key={city.name}>
                <circle cx={x} cy={y} r="2" fill="#94a3b8" />
                <text x={x + 4} y={y + 4} fill="#94a3b8" fontSize="7" fontFamily="sans-serif">
                  {city.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="absolute z-10 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs pointer-events-none shadow-xl"
            style={{
              left: Math.min(tooltipPos.x + 10, 280),
              top: Math.max(tooltipPos.y - 40, 4),
            }}
          >
            <p className="font-semibold text-white">{hovered.full_name}</p>
            {hovered.cooperative && (
              <p className="text-gray-400">{hovered.cooperative.name}</p>
            )}
            <p className={`font-medium mt-0.5 ${hovered.online_status === 'busy' ? 'text-yellow-400' : 'text-green-400'}`}>
              {hovered.online_status === 'busy' ? '🟡 En carrera' : '🟢 Disponible'}
            </p>
          </div>
        )}

        {/* Leyenda */}
        <div className="absolute bottom-2 left-3 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-success-500" />
            <span className="text-[10px] text-slate-300">Disponible</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className="text-[10px] text-slate-300">En carrera</span>
          </div>
        </div>

        {/* Sin taxis */}
        {!loading && drivers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-slate-400 text-sm font-medium">Sin taxis en línea</p>
              <p className="text-slate-600 text-xs mt-1">Los conductores aparecerán aquí al conectarse</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats bajo el mapa */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          {
            label: 'Disponibles',
            value: drivers.filter((d) => d.online_status === 'online').length,
            color: 'text-success-600 dark:text-success-400',
          },
          {
            label: 'En carrera',
            value: drivers.filter((d) => d.online_status === 'busy').length,
            color: 'text-yellow-600 dark:text-yellow-400',
          },
          {
            label: 'Con GPS',
            value: withCoords.length,
            color: 'text-brand-600 dark:text-brand-400',
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-center">
            <p className={`text-lg font-bold ${s.color}`}>
              {loading ? '...' : s.value}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
