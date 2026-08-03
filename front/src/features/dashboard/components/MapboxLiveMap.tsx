'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Map as MaplibreMap,
  Marker,
  Popup,
  NavigationControl,
  LngLatBounds,
} from 'maplibre-gl';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import api from '@/lib/api';

interface Driver {
  id: string;
  full_name: string;
  online_status: string;
  current_lat: number | null;
  current_lng: number | null;
  profile_photo_url?: string | null;
  active_vehicle?: { plate: string; cooperative?: { id: string; name: string } | null } | null;
}

interface TripRequest {
  id: string;
  status: 'requested' | 'accepted' | 'driver_arrived';
  origin_lat: number | string;
  origin_lng: number | string;
  client_name: string;
  destination_address?: string | null;
  suggested_fare?: number | string | null;
  fare_mode?: string;
}

interface TripData {
  id: string;
  status: 'requested' | 'accepted' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled' | string;
  fare_mode: string;
  meter_amount: string | number;
  suggested_fare: string | number | null;
  agreed_fare: string | number | null;
  fare_amount: string | number | null;
  origin_address: string | null;
  destination_address: string | null;
  origin_lat: string | number | null;
  origin_lng: string | number | null;
  destination_lat: string | number | null;
  destination_lng: string | number | null;
  started_at: string | null;
  route_geometry: { type: string; coordinates: [number, number][] } | null;
  driver?: { id: string; full_name: string } | null;
  vehicle?: { plate: string; brand: string; model: string } | null;
}

interface ActivePanel {
  driver: Driver;
  trip: TripData;
}

interface Props {
  drivers: Driver[];
  tripRequests?: TripRequest[];
  focusLat: number;
  focusLng: number;
  focusZoom: number;
  provinceLabel?: string;
  highlightDriverId?: string | null;
}

function taxiIconSvg(color: string) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28" width="40" height="28">
  <rect x="4" y="10" width="32" height="14" rx="4" fill="${color}"/>
  <path d="M10 10 L13 3 H27 L30 10 Z" fill="${color}"/>
  <rect x="14" y="4" width="5" height="6" rx="1" fill="rgba(255,255,255,0.85)"/>
  <rect x="21" y="4" width="5" height="6" rx="1" fill="rgba(255,255,255,0.85)"/>
  <rect x="5" y="11" width="6" height="6" rx="1" fill="rgba(255,255,255,0.65)"/>
  <rect x="29" y="11" width="6" height="6" rx="1" fill="rgba(255,255,255,0.65)"/>
  <rect x="16" y="1" width="8" height="3" rx="1" fill="#fbbf24"/>
  <text x="20" y="3.5" text-anchor="middle" font-size="2.2" font-weight="bold" fill="#000">TAXI</text>
  <circle cx="11" cy="24" r="4" fill="#1f2937"/>
  <circle cx="11" cy="24" r="2" fill="#9ca3af"/>
  <circle cx="29" cy="24" r="4" fill="#1f2937"/>
  <circle cx="29" cy="24" r="2" fill="#9ca3af"/>
  <line x1="20" y1="10" x2="20" y2="24" stroke="rgba(0,0,0,0.2)" stroke-width="0.8"/>
</svg>`;
}

function clientIconSvg(color: string, name: string) {
  const label = (name || 'C').slice(0, 6);
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 44" width="36" height="44">
  <path d="M18 2C11.4 2 6 7.4 6 14c0 9.6 12 28 12 28S30 23.6 30 14C30 7.4 24.6 2 18 2z" fill="${color}"/>
  <circle cx="18" cy="12" r="5" fill="white"/>
  <path d="M11 23c0-3.9 3.1-6 7-6s7 2.1 7 6" fill="white"/>
  <text x="18" y="36" text-anchor="middle" font-size="5" font-weight="bold" fill="white" font-family="system-ui,sans-serif">${label}</text>
</svg>`;
}

// Fetch real road route from Mapbox Directions API
// from/to are [lat, lng]; returns [lng, lat][] for MapLibre
async function fetchRoute(
  from: [number, number],
  to: [number, number],
): Promise<[number, number][]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [[from[1], from[0]], [to[1], to[0]]];
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[1]},${from[0]};${to[1]},${to[0]}?geometries=geojson&overview=full&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (coords && coords.length >= 2) return coords;
  } catch {}
  return [[from[1], from[0]], [to[1], to[0]]];
}

type MarkerEntry = {
  marker: Marker;
  el: HTMLDivElement;
  driver: Driver;
};

type ClientMarkerEntry = {
  marker: Marker;
  el: HTMLDivElement;
  trip: TripRequest;
};

const ROUTE_SOURCE = 'pana-route';
const ROUTE_LAYER  = 'pana-route-line';
const ROUTE_PULSE  = 'pana-route-pulse';

function fmt(n: string | number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const v = typeof n === 'string' ? parseFloat(n) : n;
  return isNaN(v) ? '—' : `$${v.toFixed(2)}`;
}

function elapsed(startedAt: string | null): string {
  if (!startedAt) return '—';
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function MapboxLiveMap({ drivers, tripRequests = [], focusLat, focusLng, focusZoom, provinceLabel, highlightDriverId }: Props) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<MaplibreMap | null>(null);
  const markerMapRef    = useRef<Map<string, MarkerEntry>>(new Map());
  const clientMarkersRef = useRef<Map<string, ClientMarkerEntry>>(new Map());
  const driversRef      = useRef<Driver[]>(drivers);
  const meterPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedPanel, setSelectedPanel]   = useState<ActivePanel | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<TripRequest | null>(null);
  const [loadingDriverId, setLoadingDriverId] = useState<string | null>(null);
  const [elapsedStr, setElapsedStr]         = useState('—');

  useEffect(() => { driversRef.current = drivers; }, [drivers]);

  // ── Elapsed timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPanel?.trip.started_at) return;
    const t = setInterval(() => setElapsedStr(elapsed(selectedPanel.trip.started_at)), 1000);
    return () => clearInterval(t);
  }, [selectedPanel?.trip.started_at]);

  // ── Route helpers ────────────────────────────────────────────────────────
  const clearRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer(ROUTE_PULSE))  map.removeLayer(ROUTE_PULSE);
    if (map.getLayer(ROUTE_LAYER))  map.removeLayer(ROUTE_LAYER);
    if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
  }, []);

  const drawRoute = useCallback(async (
    trip: TripData,
    driverLat?: number | null,
    driverLng?: number | null,
  ) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    clearRoute();

    // Determine from/to based on trip status
    // accepted → driver → pickup (camino al cliente)
    // driver_arrived / in_progress → origin → destination
    let from: [number, number] | null = null; // [lat, lng]
    let to: [number, number] | null = null;
    let lineColor = '#3b82f6';
    let dashed = false;

    const oLat = parseFloat(String(trip.origin_lat));
    const oLng = parseFloat(String(trip.origin_lng));
    const dLat = parseFloat(String(trip.destination_lat));
    const dLng = parseFloat(String(trip.destination_lng));

    if (trip.status === 'accepted' && driverLat != null && driverLng != null) {
      // Driver heading to pickup — dashed blue
      from = [driverLat, driverLng];
      to   = [oLat, oLng];
      lineColor = '#3b82f6';
      dashed = true;
    } else if (trip.status === 'driver_arrived' || trip.status === 'in_progress') {
      // Showing trip route — solid
      if (!isNaN(oLat) && !isNaN(dLat)) {
        from = [oLat, oLng];
        to   = [dLat, dLng];
        lineColor = trip.status === 'in_progress' ? '#10b981' : '#f59e0b';
      }
    }

    if (!from || !to || isNaN(from[0]) || isNaN(to[0])) return;

    // Fetch real road route
    const coords = await fetchRoute(from, to);
    if (coords.length < 2) return;

    if (!map.isStyleLoaded() || map.getSource(ROUTE_SOURCE)) return;

    map.addSource(ROUTE_SOURCE, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
    });

    // Glow backdrop
    map.addLayer({
      id: ROUTE_PULSE,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': lineColor, 'line-width': 12, 'line-opacity': 0.15 },
    });

    // Main route
    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': lineColor,
        'line-width': 4,
        'line-opacity': 0.92,
        ...(dashed ? { 'line-dasharray': [4, 3] } : {}),
      },
    });

    try {
      const bounds = coords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
      );
      map.fitBounds(bounds, { padding: 100, maxZoom: 16, duration: 1000 });
    } catch {}
  }, [clearRoute]);

  // ── Meter polling ────────────────────────────────────────────────────────
  const startMeterPoll = useCallback((tripId: string) => {
    if (meterPollRef.current) clearInterval(meterPollRef.current);
    meterPollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/trips/${tripId}`);
        setSelectedPanel(prev => {
          if (!prev || prev.trip.id !== tripId) return prev;
          return { ...prev, trip: { ...prev.trip, meter_amount: data.meter_amount } };
        });
        if (data.status === 'completed' || data.status === 'cancelled') {
          if (meterPollRef.current) clearInterval(meterPollRef.current);
        }
      } catch {}
    }, 3000);
  }, []);

  const stopMeterPoll = useCallback(() => {
    if (meterPollRef.current) { clearInterval(meterPollRef.current); meterPollRef.current = null; }
  }, []);

  useEffect(() => () => stopMeterPoll(), [stopMeterPoll]);

  // ── Select driver: fetch active trip (any in-flight status) ─────────────
  const handleDriverClick = useCallback(async (d: Driver) => {
    setSelectedRequest(null);
    const map = mapRef.current;
    if (map && d.current_lat != null && d.current_lng != null) {
      map.flyTo({ center: [d.current_lng, d.current_lat], zoom: Math.max(map.getZoom(), 15), duration: 900 });
    }

    if (d.online_status !== 'busy') {
      setSelectedPanel(null);
      stopMeterPoll();
      clearRoute();
      return;
    }

    setLoadingDriverId(d.id);
    try {
      const statuses = ['in_progress', 'accepted', 'driver_arrived'];
      const results = await Promise.all(
        statuses.map((s) => api.get('/trips', { params: { status: s, limit: 100, page: 1 } })),
      );
      const allTrips: TripData[] = results.flatMap((r) => r.data?.items ?? []);
      const trip = allTrips.find((t) => (t as { driver?: { id: string } | null }).driver?.id === d.id);
      if (trip) {
        setSelectedPanel({ driver: d, trip });
        setElapsedStr(elapsed(trip.started_at));
        drawRoute(trip, d.current_lat, d.current_lng);
        if (trip.status === 'in_progress' && trip.fare_mode === 'meter') startMeterPoll(trip.id);
        else stopMeterPoll();
      } else {
        setSelectedPanel(null);
        clearRoute();
        stopMeterPoll();
      }
    } catch {
      setSelectedPanel(null);
    } finally {
      setLoadingDriverId(null);
    }
  }, [clearRoute, drawRoute, startMeterPoll, stopMeterPoll]);

  // ── Close panel ───────────────────────────────────────────────────────────
  const closePanel = useCallback(() => {
    setSelectedPanel(null);
    stopMeterPoll();
    clearRoute();
  }, [clearRoute, stopMeterPoll]);

  // ── Highlight driver from sidebar ─────────────────────────────────────────
  useEffect(() => {
    if (!highlightDriverId) return;
    const entry = markerMapRef.current.get(highlightDriverId);
    const map = mapRef.current;
    if (!entry || !map) return;
    const lngLat = entry.marker.getLngLat();
    map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: Math.max(map.getZoom(), 16), duration: 900 });
    handleDriverClick(entry.driver);
  }, [highlightDriverId, handleDriverClick]);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [focusLng, focusLat],
      zoom: focusZoom,
      attributionControl: false,
    });
    map.addControl(new NavigationControl(), 'top-right');
    mapRef.current = map;
    return () => {
      stopMeterPoll();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: [focusLng, focusLat], zoom: focusZoom, duration: 1200 });
  }, [focusLat, focusLng, focusZoom]);

  // ── Marker build ──────────────────────────────────────────────────────────
  const buildMarkerEl = useCallback((d: Driver): HTMLDivElement => {
    const busy = d.online_status === 'busy';
    const color = busy ? '#f59e0b' : '#10b981';
    const shadowColor = busy ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)';

    const el = document.createElement('div');
    el.style.cssText = 'width:44px;height:30px;cursor:pointer;';

    const inner = document.createElement('div');
    inner.style.cssText = [
      'width:44px', 'height:30px',
      'transition:transform 0.15s',
      `filter:drop-shadow(0 2px 6px ${shadowColor})`,
    ].join(';');
    inner.innerHTML = taxiIconSvg(color);
    el.appendChild(inner);

    el.addEventListener('mouseenter', () => { inner.style.transform = 'scale(1.2)'; });
    el.addEventListener('mouseleave', () => { inner.style.transform = ''; });
    return el;
  }, []);

  const buildPopup = useCallback((d: Driver): Popup => {
    const busy = d.online_status === 'busy';
    return new Popup({ offset: [0, -14], closeButton: false, className: 'taxi-popup' }).setHTML(
      `<div style="font-size:12px;line-height:1.6;min-width:155px;padding:2px 0">
        <p style="font-weight:700;margin:0 0 2px;color:#111">${d.full_name}</p>
        ${d.active_vehicle
          ? `<p style="color:#6b7280;margin:0;font-size:11px">${d.active_vehicle.plate}${d.active_vehicle.cooperative ? ` · ${d.active_vehicle.cooperative.name}` : ''}</p>`
          : ''}
        <p style="margin:3px 0 0;font-weight:600;color:${busy ? '#d97706' : '#059669'}">
          ${busy ? '🟡 En viaje — click para ruta y taxímetro' : '🟢 Libre'}
        </p>
      </div>`
    );
  }, []);

  // ── Sync markers ──────────────────────────────────────────────────────────
  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const incoming = new Set(drivers.map(d => d.id));

    for (const [id, entry] of markerMapRef.current.entries()) {
      if (!incoming.has(id)) { entry.marker.remove(); markerMapRef.current.delete(id); }
    }

    drivers.forEach(d => {
      if (d.current_lat === null || d.current_lng === null) return;
      const existing = markerMapRef.current.get(d.id);
      if (existing) {
        existing.marker.setLngLat([d.current_lng, d.current_lat]);
        existing.driver = d;
        return;
      }

      const el    = buildMarkerEl(d);
      const popup = buildPopup(d);

      el.addEventListener('click', () => handleDriverClick(d));

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([d.current_lng, d.current_lat])
        .setPopup(popup)
        .addTo(map);

      markerMapRef.current.set(d.id, { marker, el, driver: d });
    });
  }, [drivers, buildMarkerEl, buildPopup, handleDriverClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) syncMarkers();
    else map.once('load', syncMarkers);
  }, [syncMarkers]);

  // ── Client/trip-request markers ───────────────────────────────────────────
  const syncClientMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const incoming = new Set(tripRequests.map((t) => t.id));

    for (const [id, entry] of clientMarkersRef.current.entries()) {
      if (!incoming.has(id)) { entry.marker.remove(); clientMarkersRef.current.delete(id); }
    }

    tripRequests.forEach((t) => {
      const lat = parseFloat(String(t.origin_lat));
      const lng = parseFloat(String(t.origin_lng));
      if (isNaN(lat) || isNaN(lng)) return;
      if (clientMarkersRef.current.has(t.id)) return;

      const color = t.status === 'requested' ? '#2563eb'
        : t.status === 'accepted' ? '#f59e0b'
        : '#10b981';
      const shadowColor = t.status === 'requested' ? 'rgba(37,99,235,0.5)'
        : t.status === 'accepted' ? 'rgba(245,158,11,0.5)'
        : 'rgba(16,185,129,0.5)';
      const firstName = (t.client_name || 'Cliente').split(' ')[0];

      // Exact same pattern as taxi buildMarkerEl — no position:relative, no flex, innerHTML for SVG
      const el = document.createElement('div');
      el.style.cssText = 'width:36px;height:44px;cursor:pointer;';

      const inner = document.createElement('div');
      inner.style.cssText = [
        'width:36px;height:44px',
        'transition:transform 0.15s',
        `filter:drop-shadow(0 2px 6px ${shadowColor})`,
      ].join(';');
      inner.innerHTML = clientIconSvg(color, firstName);

      el.appendChild(inner);

      el.addEventListener('mouseenter', () => { inner.style.transform = 'scale(1.2)'; });
      el.addEventListener('mouseleave', () => { inner.style.transform = ''; });
      el.addEventListener('click', () => {
        setSelectedRequest(t);
        setSelectedPanel(null);
        stopMeterPoll();
        clearRoute();
      });

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);

      clientMarkersRef.current.set(t.id, { marker, el, trip: t });
    });
  }, [tripRequests, clearRoute, stopMeterPoll]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) syncClientMarkers();
    else map.once('load', syncClientMarkers);
  }, [syncClientMarkers]);

  // ── WebSocket real-time location — usa el socket compartido ─────────────────
  useEffect(() => {
    if (!socket || !user) return;

    const handler = (payload: { driver_id: string; lat: number; lng: number }) => {
      const entry = markerMapRef.current.get(payload.driver_id);
      if (!entry) return;
      entry.marker.setLngLat([payload.lng, payload.lat]);
      entry.driver = { ...entry.driver, current_lat: payload.lat, current_lng: payload.lng };
    };

    socket.on('driver.location', handler);
    return () => { socket.off('driver.location', handler); };
  }, [socket, user]);

  // ── Panel meter display ───────────────────────────────────────────────────
  const panel = selectedPanel;

  const tripStatusLabel = panel?.trip.status === 'in_progress'
    ? '🟡 En viaje'
    : panel?.trip.status === 'driver_arrived'
    ? '📍 Llegó al punto'
    : panel?.trip.status === 'accepted'
    ? '🚗 En camino al cliente'
    : '—';

  const meterValue = panel?.trip.status === 'in_progress' && panel.trip.fare_mode === 'meter'
    ? fmt(panel.trip.meter_amount)
    : panel?.trip.fare_mode === 'negotiated'
    ? fmt(panel.trip.agreed_fare ?? panel.trip.suggested_fare)
    : panel?.trip.status !== 'in_progress'
    ? fmt(panel?.trip.suggested_fare)
    : '—';

  const meterLabel = panel?.trip.status === 'in_progress' && panel.trip.fare_mode === 'meter'
    ? 'Taxímetro'
    : panel?.trip.status !== 'in_progress'
    ? 'Tarifa estimada'
    : panel?.trip.fare_mode === 'negotiated'
    ? 'Precio acordado'
    : '—';

  return (
    <div style={{ position: 'relative', height: 500 }} className="rounded-xl overflow-hidden">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Loading spinner overlay on marker */}
      {loadingDriverId && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 25,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.08)', pointerEvents: 'none',
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: '10px 18px',
            fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Cargando viaje...
          </div>
        </div>
      )}

      {/* Active trip panel */}
      {panel && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 20,
          width: 240, background: 'rgba(255,255,255,0.97)',
          border: '1px solid #e5e7eb', borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,.14)',
          fontSize: 12, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: panel.trip.status === 'in_progress' ? '#f59e0b'
              : panel.trip.status === 'driver_arrived' ? '#8b5cf6'
              : '#3b82f6',
            padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {panel.driver.profile_photo_url ? (
                <img
                  src={panel.driver.profile_photo_url}
                  alt={panel.driver.full_name}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.6)', flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff', flexShrink: 0 }}>
                  {panel.driver.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#fff' }}>
                  {panel.driver.full_name}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                  {panel.driver.active_vehicle ? `${panel.driver.active_vehicle.plate} · ` : ''}{tripStatusLabel}
                </p>
              </div>
            </div>
            <button
              onClick={closePanel}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, lineHeight: 1, padding: 0 }}
            >×</button>
          </div>

          {/* Taximeter */}
          <div style={{ padding: '10px 12px', background: '#1f2937', textAlign: 'center' }}>
            <p style={{ margin: '0 0 2px', fontSize: 10, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase' }}>
              {meterLabel}
            </p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fbbf24', fontFamily: 'monospace' }}>
              {meterValue}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#6b7280' }}>
              {panel.trip.status === 'in_progress' ? `Transcurrido: ${elapsedStr}` : 'Viaje aún no iniciado'}
            </p>
          </div>

          {/* Route info */}
          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📍</span>
                <div>
                  <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Origen</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#374151', lineHeight: 1.4 }}>
                    {panel.trip.origin_address ?? '—'}
                  </p>
                </div>
              </div>
              <div style={{ marginLeft: 6, width: 2, height: 12, background: '#e5e7eb' }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🏁</span>
                <div>
                  <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Destino</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#374151', lineHeight: 1.4 }}>
                    {panel.trip.destination_address ?? '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Fare details */}
            <div style={{
              marginTop: 10, paddingTop: 8,
              borderTop: '1px solid #f3f4f6',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>
                {panel.trip.fare_mode === 'meter' ? '⏱ Taxímetro' : '🤝 Precio fijo'}
              </span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>
                Sugerido: {fmt(panel.trip.suggested_fare)}
              </span>
            </div>

            {panel.trip.status === 'in_progress' && panel.trip.fare_mode === 'meter' && (
              <p style={{ margin: '6px 0 0', fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
                🔄 Actualizando cada 3s
              </p>
            )}
          </div>
        </div>
      )}

      {/* Client request panel */}
      {selectedRequest && !panel && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 20,
          width: 240, background: 'rgba(255,255,255,0.97)',
          border: '1px solid #e5e7eb', borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,.14)',
          fontSize: 12, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: selectedRequest.status === 'requested' ? '#3b82f6' : '#10b981',
            padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#fff' }}>
                👤 {selectedRequest.client_name}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                {selectedRequest.status === 'requested' ? 'Esperando taxi...'
                  : selectedRequest.status === 'accepted' ? 'Taxi asignado'
                  : 'Taxi en camino'}
              </p>
            </div>
            <button
              onClick={() => setSelectedRequest(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, lineHeight: 1, padding: 0 }}
            >×</button>
          </div>

          {/* Trip info */}
          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
                <div>
                  <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Origen</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#374151' }}>
                    {parseFloat(String(selectedRequest.origin_lat)).toFixed(5)}, {parseFloat(String(selectedRequest.origin_lng)).toFixed(5)}
                  </p>
                </div>
              </div>
              {selectedRequest.destination_address && (
                <>
                  <div style={{ marginLeft: 6, width: 2, height: 12, background: '#e5e7eb' }} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>🏁</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Destino</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#374151', lineHeight: 1.4 }}>{selectedRequest.destination_address}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
            {selectedRequest.suggested_fare && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Tarifa estimada</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{fmt(selectedRequest.suggested_fare)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 12, zIndex: 10,
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid #e5e7eb', borderRadius: 8,
        padding: '6px 10px', fontSize: 11,
        display: 'flex', gap: 10, alignItems: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,.12)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
          Libre
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />
          En viaje
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
          Cliente
        </span>
        {!panel && !selectedRequest && <span style={{ color: '#9ca3af', fontSize: 10 }}>Click en marker para detalles</span>}
      </div>

      {provinceLabel && (
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          background: 'rgba(255,255,255,0.92)', border: '1px solid #e5e7eb',
          borderRadius: 8, padding: '4px 10px',
          fontSize: 12, fontWeight: 600, color: '#1d4ed8', pointerEvents: 'none',
        }}>
          📍 {provinceLabel}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes radarPulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(2.8); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}
