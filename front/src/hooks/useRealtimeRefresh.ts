'use client';
import { useEffect, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';

/**
 * Escucha eventos del socket ya conectado (SocketProvider) y llama a
 * `onChange` cuando llega alguno de `events`. Sin polling — puramente
 * reactivo a lo que emite el backend.
 *
 * `filter` es opcional: útil para eventos genéricos donde solo interesa
 * un subconjunto de payloads (ej. `data.changed` filtrado por `entity`).
 */
export function useRealtimeRefresh<T = unknown>(
  events: string[],
  onChange: () => void,
  filter?: (payload: T) => boolean,
) {
  const { socket } = useSocket();

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const eventsKey = events.join(',');

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: T) => {
      if (!filterRef.current || filterRef.current(payload)) onChangeRef.current();
    };
    const list = eventsKey.split(',').filter(Boolean);
    list.forEach((e) => socket.on(e, handler));
    return () => { list.forEach((e) => socket.off(e, handler)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, eventsKey]);
}
