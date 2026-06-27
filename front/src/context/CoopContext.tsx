'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from './AuthContext';
import type { Cooperative } from '@/types';

interface CoopContextType {
  cooperatives: Cooperative[];
  selectedCoop: Cooperative | null;
  setSelectedCoop: (coop: Cooperative | null) => void;
  isLoadingCoops: boolean;
  refreshCoops: () => void;
}

const CoopContext = createContext<CoopContextType | null>(null);

export function CoopProvider({ children }: { children: React.ReactNode }) {
  const { user, isPlatformStaff } = useAuth();
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([]);
  const [selectedCoop, setSelectedCoop] = useState<Cooperative | null>(null);
  const [isLoadingCoops, setIsLoadingCoops] = useState(false);

  const loadCoops = useCallback(async () => {
    setIsLoadingCoops(true);
    try {
      const { data } = await api.get('/cooperatives', { params: { limit: 100, page: 1 } });
      setCooperatives(data.items ?? []);
    } catch {
      setCooperatives([]);
    } finally {
      setIsLoadingCoops(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !isPlatformStaff) return;
    loadCoops();
  }, [user, isPlatformStaff, loadCoops]);

  return (
    <CoopContext.Provider
      value={{ cooperatives, selectedCoop, setSelectedCoop, isLoadingCoops, refreshCoops: loadCoops }}
    >
      {children}
    </CoopContext.Provider>
  );
}

export function useCoop() {
  const ctx = useContext(CoopContext);
  if (!ctx) throw new Error('useCoop must be used inside CoopProvider');
  return ctx;
}
