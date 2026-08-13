"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getAccessToken } from "@/lib/api";
import { useAuth } from "./AuthContext";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      setSocket((prev) => { prev?.disconnect(); return null; });
      setConnected(false);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    const token = getAccessToken();

    const s = io(apiUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    // Sesión única por cuenta: el backend avisa cuando alguien inicia
    // sesión con esta cuenta en otro dispositivo/pestaña — cerrar acá sin
    // esperar a que falle la próxima llamada a la API.
    s.on("session.revoked", () => {
      alert("Se inició sesión con esta cuenta en otro dispositivo.");
      logout();
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
