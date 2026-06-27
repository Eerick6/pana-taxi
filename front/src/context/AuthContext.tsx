'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, UserRole } from '@/types';
import { setAccessToken } from '@/lib/api';
import api from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (access_token: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  isPlatformStaff: boolean;
  isCoopStaff: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PLATFORM_ROLES: UserRole[] = ['OWNER', 'PLATFORM_ADMIN', 'FINANCE', 'MONITORING', 'SUPPORT'];
const COOP_ROLES: UserRole[] = ['COOPERATIVE_ADMIN', 'COOPERATIVE_OPERATOR', 'COOPERATIVE_SUPERVISOR'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async (token: string) => {
    setAccessToken(token);
    const { data } = await api.get<AuthUser>('/auth/me');
    setUser(data);
  }, []);

  useEffect(() => {
    const restore = async () => {
      try {
        const r = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!r.ok) throw new Error('no session');
        const data = await r.json();
        await loadUser(data.access_token);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, [loadUser]);

  const login = useCallback(async (access_token: string, role: UserRole) => {
    await loadUser(access_token);
  }, [loadUser]);

  const logout = useCallback(async () => {
    const token = (await import('@/lib/api')).getAccessToken();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    setAccessToken(null);
    setUser(null);
    router.push('/signin');
  }, [router]);

  const hasRole = useCallback((...roles: UserRole[]) => {
    return !!user && roles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      hasRole,
      isPlatformStaff: !!user && PLATFORM_ROLES.includes(user.role),
      isCoopStaff: !!user && COOP_ROLES.includes(user.role),
      isOwner: user?.role === 'OWNER',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
