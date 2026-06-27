'use client';
import React, { useState, useEffect } from 'react';
import type { FareConfig } from '@/types';
import { getFareConfig, updateFareConfig } from '../api';

interface FieldDef {
  key: keyof FareConfig;
  label: string;
  description: string;
  prefix?: string;
  suffix?: string;
  step?: string;
  min?: number;
  max?: number;
}

const FIELDS: FieldDef[] = [
  { key: 'base_fare', label: 'Tarifa Base', description: 'Costo mínimo al iniciar un viaje', prefix: '$', step: '0.01', min: 0 },
  { key: 'per_km_rate', label: 'Tarifa por KM', description: 'Costo por kilómetro recorrido', prefix: '$', step: '0.001', min: 0 },
  { key: 'per_min_rate', label: 'Tarifa por Minuto', description: 'Costo por minuto en ruta', prefix: '$', step: '0.001', min: 0 },
  { key: 'minimum_fare', label: 'Tarifa Mínima', description: 'Valor mínimo cobrable', prefix: '$', step: '0.01', min: 0 },
  { key: 'platform_commission_pct', label: 'Comisión Plataforma', description: 'Porcentaje sobre cada viaje', suffix: '%', step: '0.1', min: 0, max: 100 },
];

export default function ConfigView() {
  const [config, setConfig] = useState<FareConfig | null>(null);
  const [form, setForm] = useState<FareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    getFareConfig()
      .then((c) => { setConfig(c); setForm(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await updateFareConfig(form);
      setConfig(updated);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = form && config && JSON.stringify(form) !== JSON.stringify(config);

  return (
    <div className="space-y-6">
      {/* Fare config */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Configuración de Tarifas</h2>
          <p className="text-sm text-gray-400 mt-0.5">Tasas aplicadas al cálculo de viajes en modo taxímetro</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800 mb-2" />
                <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-gray-800" />
              </div>
            ))}
          </div>
        ) : form ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {f.label}
                  </label>
                  <p className="text-xs text-gray-400 mb-2">{f.description}</p>
                  <div className="relative">
                    {f.prefix && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">{f.prefix}</span>
                    )}
                    <input
                      type="number"
                      step={f.step ?? '1'}
                      min={f.min}
                      max={f.max}
                      value={form[f.key]}
                      onChange={(e) => setForm((prev) => prev ? ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }) : prev)}
                      className={`w-full py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 ${f.prefix ? 'pl-7 pr-3' : f.suffix ? 'pl-3 pr-7' : 'px-3'}`}
                    />
                    {f.suffix && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">{f.suffix}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : null}
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {isDirty && !saving && (
                <button onClick={() => setForm(config)} className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Descartar
                </button>
              )}
              {saved && (
                <span className="text-sm font-medium text-success-600 dark:text-success-400 flex items-center gap-1">
                  ✓ Guardado
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">No se pudo cargar la configuración</div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: '🗺️', title: 'Modo Taxímetro', desc: 'El costo se calcula en tiempo real usando tarifa base + km + minutos. El conductor no puede modificarlo.' },
          { icon: '🤝', title: 'Modo Negociado', desc: 'El cliente propone un precio, el conductor puede aceptar o hacer contraoferta. Mayor flexibilidad.' },
          { icon: '📊', title: 'Comisión', desc: 'La plataforma retiene el % configurado de cada viaje completado. Aplica sobre la tarifa final acordada.' },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="text-2xl mb-3">{c.icon}</div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-2">{c.title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
