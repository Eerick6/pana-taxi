'use client';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { DailyPoint } from '../api';
import { currency } from '@/lib/format';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  data: DailyPoint[];
  loading: boolean;
}

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function TrendChart({ data, loading }: Props) {
  const isDark = useIsDark();
  const [tab, setTab] = useState<'revenue' | 'trips'>('revenue');

  const categories = data.map((d) => {
    const [, m, day] = d.date.split('-');
    return `${day}/${m}`;
  });

  const series = tab === 'revenue'
    ? [{ name: 'Ingresos', data: data.map((d) => Number(d.revenue.toFixed(2))) }]
    : [{ name: 'Viajes', data: data.map((d) => d.trips) }];

  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? '#1f2937' : '#f3f4f6';

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      background: 'transparent',
      animations: { enabled: true, speed: 400 },
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2.5 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.0,
        stops: [0, 90, 100],
      },
    },
    colors: tab === 'revenue' ? ['#fcbd13'] : ['#3b82f6'],
    xaxis: {
      categories,
      labels: {
        style: { colors: textColor, fontSize: '11px' },
        rotate: 0,
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: 7,
    },
    yaxis: {
      labels: {
        style: { colors: textColor, fontSize: '11px' },
        formatter: tab === 'revenue' ? (v) => `$${v.toFixed(0)}` : (v) => String(v),
      },
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 4,
    },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      y: {
        formatter: tab === 'revenue' ? (v) => currency(v) : (v) => `${v} viajes`,
      },
    },
    markers: { size: 0 },
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="w-36 h-5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="w-24 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
        <div className="h-56 rounded-xl bg-gray-50 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
            Tendencia — últimos 30 días
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {tab === 'revenue' ? 'Ingresos diarios en USD' : 'Viajes por día'}
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setTab('revenue')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'revenue' ? 'bg-brand-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            Ingresos
          </button>
          <button
            onClick={() => setTab('trips')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'trips' ? 'bg-brand-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            Viajes
          </button>
        </div>
      </div>
      <ReactApexChart
        key={`${tab}-${isDark}`}
        options={options}
        series={series}
        type="area"
        height={220}
      />
    </div>
  );
}
