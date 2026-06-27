'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types';

type Step = 'email' | 'otp';

async function parseResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

export default function SignInForm() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/email-otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await parseResponse(res);
      if (!res.ok) throw new Error(data.message ?? 'Correo no registrado o cuenta inactiva');
      setStep('otp');
    } catch (err: any) {
      const msg = err.message ?? '';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        setError('No se pudo conectar con el servidor. Intenta de nuevo.');
      } else {
        setError(msg || 'Ocurrió un error. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await parseResponse(res);
      if (!res.ok) throw new Error(data.message ?? 'Código inválido o expirado');
      await login(data.access_token, data.role as UserRole);
      router.push('/');
    } catch (err: any) {
      const msg = err.message ?? '';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        setError('No se pudo conectar con el servidor. Intenta de nuevo.');
      } else {
        setError(msg || 'Código incorrecto. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {step === 'email' ? 'Iniciar sesión' : 'Verificar identidad'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {step === 'email'
              ? 'Ingresa tu correo para recibir un código de acceso'
              : `Ingresa el código enviado a ${email}`}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="correo@ejemplo.com"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-400"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-black transition hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Código de verificación
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                placeholder="000000"
                maxLength={6}
                className="h-14 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-center text-3xl tracking-[0.6em] text-gray-800 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-black transition hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setError(''); }}
              className="text-center text-sm text-gray-500 hover:text-brand-500 dark:text-gray-400"
            >
              ← Cambiar correo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
