export function currency(n: number | string | null | undefined): string {
  if (n == null) return '$0.00';
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(n));
}

export function num(n: number | string | null | undefined): string {
  if (n == null) return '0';
  return new Intl.NumberFormat('es-EC').format(Number(n));
}

export function dateStr(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTimeStr(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('es-EC', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(s: string | null | undefined): string {
  if (!s) return '—';
  const diff = Date.now() - new Date(s).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

export function percent(n: number | null | undefined): string {
  if (n == null) return '0%';
  return `${Number(n).toFixed(1)}%`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
