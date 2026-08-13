'use strict';

// Prueba de carga LOCAL — simula cientos de viajes completos (cliente crea
// viaje → conductor acepta → cliente selecciona oferta → llega → inicia →
// completa) contra el backend de desarrollo (docker taxi-api / taxi-db).
//
// Todo pasa por los endpoints HTTP reales de la app, nunca se toca la DB
// directamente. Corre SOLO contra localhost — no envía SMS ni cobra
// tarjetas reales (usa el bypass de OTP '000000', disponible solo cuando
// NODE_ENV !== 'production').
//
// Uso:
//   node scripts/load-test.js                  # valores por defecto
//   TARGET_TRIPS=600 DRIVER_POOL=12 node scripts/load-test.js

const BASE_URL = process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000';
const TARGET_TRIPS = parseInt(process.env.TARGET_TRIPS || '550', 10);
const POOL_SIZE = parseInt(process.env.DRIVER_POOL || '10', 10); // conductores == clientes == lanes concurrentes
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'erick199335@gmail.com';

// Centro de operaciones: coordenadas reales de la cooperativa de prueba
// "Taxi San Pedro" (Sangolquí, Ecuador) ya existente en la DB local.
const HUB_LAT = -0.3210137;
const HUB_LNG = -78.4625745;

const RUN_ID = Date.now().toString().slice(-7);

function jitter(base, km) {
  // ~1km ≈ 0.009 grados de latitud/longitud en el ecuador
  const deg = km * 0.009;
  return base + (Math.random() * 2 - 1) * deg;
}

// Dígitos únicos para este run + índice de carril, del ancho que se pida —
// mezcla RUN_ID (único por ejecución del script) con i (único por carril)
// vía multiplicación por un primo, así que incluso con width chico (placas,
// 4 dígitos) dos corridas distintas casi nunca producen el mismo valor.
// Evita que reruns del script choquen con teléfonos/cédulas/placas que
// hayan quedado en la DB local de una corrida anterior.
function uniqueDigits(i, width) {
  const mixed = (parseInt(RUN_ID, 10) * 131 + i * 7919) >>> 0;
  return String(mixed % Math.pow(10, width)).padStart(width, '0');
}

function generateValidCedula(i) {
  const digits = ('17' + '0' + uniqueDigits(i, 6)).split('').map(Number);
  const coeff = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let j = 0; j < 9; j++) {
    let v = digits[j] * coeff[j];
    if (v > 9) v -= 9;
    sum += v;
  }
  const check = sum % 10 === 0 ? 0 : 10 - (sum % 10);
  return digits.join('') + String(check);
}

function generatePlate(i) {
  // Formato exigido por el backend: ABC-1234
  const letter = String.fromCharCode(65 + (i % 26));
  return `LT${letter}-${uniqueDigits(i, 4)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Cliente HTTP con reintento automático ante 429 (rate limit) ─────────────
async function req(method, path, { token, body, retries = 6 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const elapsed = Date.now() - started;

    if (res.status === 429 && attempt < retries) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
      await sleep((retryAfter + 0.5) * 1000);
      continue;
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      /* respuesta vacía */
    }

    return { status: res.status, ok: res.ok, body: json, elapsed };
  }
}

// ── Métricas ──────────────────────────────────────────────────────────────
class Metrics {
  constructor() {
    this.samples = {}; // endpoint -> [ms, ms, ...]
    this.errors = []; // { endpoint, status, message }
    this.tripsCompleted = 0;
    this.tripsFailed = 0;
  }

  record(endpoint, ms) {
    (this.samples[endpoint] ??= []).push(ms);
  }

  recordError(endpoint, status, message) {
    this.errors.push({ endpoint, status, message });
  }

  percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  }

  report() {
    const lines = [];
    lines.push('');
    lines.push('── Latencia por endpoint (ms) ──────────────────────────────');
    const endpoints = Object.keys(this.samples).sort();
    const colWidth = Math.max(...endpoints.map((e) => e.length), 20);
    lines.push(
      `${'endpoint'.padEnd(colWidth)}  n     avg     p50     p95     p99     max`,
    );
    for (const ep of endpoints) {
      const arr = this.samples[ep];
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      lines.push(
        `${ep.padEnd(colWidth)}  ${String(arr.length).padStart(4)}  ` +
        `${avg.toFixed(0).padStart(5)}   ${this.percentile(arr, 50).toString().padStart(5)}   ` +
        `${this.percentile(arr, 95).toString().padStart(5)}   ${this.percentile(arr, 99).toString().padStart(5)}   ` +
        `${Math.max(...arr).toString().padStart(5)}`,
      );
    }
    lines.push('');
    lines.push(`Viajes completados: ${this.tripsCompleted}`);
    lines.push(`Viajes fallidos:    ${this.tripsFailed}`);
    if (this.errors.length) {
      lines.push('');
      lines.push('── Errores (primeros 20) ───────────────────────────────────');
      for (const e of this.errors.slice(0, 20)) {
        lines.push(`  [${e.status}] ${e.endpoint} — ${e.message}`);
      }
      if (this.errors.length > 20) lines.push(`  ... y ${this.errors.length - 20} más`);
    }
    return lines.join('\n');
  }
}

const metrics = new Metrics();

async function timed(endpoint, fn) {
  const started = Date.now();
  const result = await fn();
  metrics.record(endpoint, Date.now() - started);
  return result;
}

// ── Login OWNER (para approvals) ────────────────────────────────────────────
async function loginOwner() {
  await req('POST', '/auth/email-otp/request', { body: { email: OWNER_EMAIL } });
  const res = await req('POST', '/auth/email-otp/verify', { body: { email: OWNER_EMAIL, code: '000000' } });
  if (!res.ok) throw new Error(`No se pudo iniciar sesión como OWNER: ${JSON.stringify(res.body)}`);
  return res.body.access_token;
}

async function findOrCreateCooperativeId(ownerToken) {
  const res = await req('GET', '/cooperatives/active?limit=1', { token: ownerToken });
  const existing = res.body?.items?.[0];
  if (existing) return existing.id;
  throw new Error('No hay ninguna cooperativa activa en la DB local. Crea una manualmente antes de correr la prueba de carga.');
}

// ── Onboarding de un conductor-dueño (register → approve → vehículo → approve → start-day) ──
async function onboardDriver(i, ownerToken, cooperativeId) {
  const phone = `+5931${uniqueDigits(i, 9)}`;
  const password = 'LoadTest123!';

  const termsRes = await req('GET', '/terms/driver');
  const termsVersion = termsRes.body.version;

  const reg = await req('POST', '/drivers/register', {
    body: {
      full_name: `LT Driver ${i}`,
      phone,
      driver_type: 'owner_driver',
      terms_version: termsVersion,
      password,
    },
  });
  if (!reg.ok) throw new Error(`register driver ${i}: ${JSON.stringify(reg.body)}`);
  const driverId = reg.body.driver_id;

  await req('POST', '/auth/otp/request', { body: { phone } });
  const loginRes = await req('POST', '/auth/otp/verify', { body: { phone, code: '000000' } });
  if (!loginRes.ok) throw new Error(`login driver ${i}: ${JSON.stringify(loginRes.body)}`);
  const token = loginRes.body.access_token;

  const approveRes = await req('PATCH', `/drivers/${driverId}/platform-approve`, { token: ownerToken });
  if (!approveRes.ok) throw new Error(`platform-approve driver ${i}: ${JSON.stringify(approveRes.body)}`);

  const plate = generatePlate(i);
  const vehicleRes = await req('POST', '/vehicles', {
    token,
    body: {
      cooperative_id: cooperativeId,
      plate,
      brand: 'Chevrolet',
      model: 'Aveo',
      color: 'Amarillo',
      year: 2020,
    },
  });
  if (!vehicleRes.ok) throw new Error(`register vehicle ${i}: ${JSON.stringify(vehicleRes.body)}`);
  const vehicleId = vehicleRes.body.vehicle_id;

  // registerVehicle() ya crea la membresía (pending) — aprobarla como socio
  // de la cooperativa es requisito previo para poder aprobar su vehículo.
  const coopApprove = await req(
    'PATCH',
    `/drivers/${driverId}/cooperative-approve?cooperative_id=${cooperativeId}`,
    { token: ownerToken },
  );
  if (!coopApprove.ok) throw new Error(`cooperative-approve driver ${i}: ${JSON.stringify(coopApprove.body)}`);

  const vApprove = await req('PATCH', `/vehicles/${vehicleId}/approve`, { token: ownerToken });
  if (!vApprove.ok) throw new Error(`approve vehicle ${i}: ${JSON.stringify(vApprove.body)}`);

  const startDay = await req('POST', '/drivers/me/start-day', { token, body: { vehicle_id: vehicleId } });
  if (!startDay.ok) throw new Error(`start-day driver ${i}: ${JSON.stringify(startDay.body)}`);

  return { token, driverId, vehicleId };
}

// ── Onboarding de un cliente ─────────────────────────────────────────────────
async function onboardClient(i) {
  const phone = `+5932${uniqueDigits(i, 9)}`;
  const password = 'LoadTest123!';
  const cedula = generateValidCedula(i);

  const termsRes = await req('GET', '/terms/client');
  const termsVersion = termsRes.body.version;

  const reg = await req('POST', '/auth/register/client', {
    body: { phone, full_name: `LT Client ${i}`, cedula, terms_version: termsVersion, password },
  });
  if (!reg.ok) throw new Error(`register client ${i}: ${JSON.stringify(reg.body)}`);

  const loginRes = await req('POST', '/auth/otp/verify', { body: { phone, code: '000000' } });
  if (!loginRes.ok) throw new Error(`login client ${i}: ${JSON.stringify(loginRes.body)}`);

  return { token: loginRes.body.access_token };
}

// ── Ciclo de vida completo de UN viaje (taxímetro, efectivo) ────────────────
async function runOneTrip(clientToken, driverToken) {
  const originLat = jitter(HUB_LAT, 2);
  const originLng = jitter(HUB_LNG, 2);
  const destLat = jitter(HUB_LAT, 3);
  const destLng = jitter(HUB_LNG, 3);

  const create = await timed('POST /trips', () =>
    req('POST', '/trips', {
      token: clientToken,
      body: {
        origin_address: 'Origen prueba de carga',
        origin_lat: originLat,
        origin_lng: originLng,
        destination_address: 'Destino prueba de carga',
        destination_lat: destLat,
        destination_lng: destLng,
        fare_mode: 'meter',
        payment_method_slug: 'cash',
      },
    }),
  );
  if (!create.ok) throw new Error(`create: [${create.status}] ${JSON.stringify(create.body)}`);
  const tripId = create.body.id;

  const accept = await timed('PATCH /trips/:id/accept', () =>
    req('PATCH', `/trips/${tripId}/accept`, { token: driverToken }),
  );
  if (!accept.ok) throw new Error(`accept: [${accept.status}] ${JSON.stringify(accept.body)}`);

  const offers = await timed('GET /trips/:id/offers', () =>
    req('GET', `/trips/${tripId}/offers`, { token: clientToken }),
  );
  if (!offers.ok || !offers.body?.length) {
    throw new Error(`offers: [${offers.status}] ${JSON.stringify(offers.body)}`);
  }
  const offerId = offers.body[0].offer_id;

  const select = await timed('PATCH /trips/:id/offers/:id/select', () =>
    req('PATCH', `/trips/${tripId}/offers/${offerId}/select`, { token: clientToken }),
  );
  if (!select.ok) throw new Error(`select: [${select.status}] ${JSON.stringify(select.body)}`);

  const arrived = await timed('PATCH /trips/:id/arrived', () =>
    req('PATCH', `/trips/${tripId}/arrived`, { token: driverToken }),
  );
  if (!arrived.ok) throw new Error(`arrived: [${arrived.status}] ${JSON.stringify(arrived.body)}`);

  const start = await timed('PATCH /trips/:id/start', () =>
    req('PATCH', `/trips/${tripId}/start`, { token: driverToken, body: { otp_code: '000000' } }),
  );
  if (!start.ok) throw new Error(`start: [${start.status}] ${JSON.stringify(start.body)}`);

  const fareAmount = +(3 + Math.random() * 5).toFixed(2);
  const complete = await timed('PATCH /trips/:id/complete', () =>
    req('PATCH', `/trips/${tripId}/complete`, { token: driverToken, body: { fare_amount: fareAmount } }),
  );
  if (!complete.ok) throw new Error(`complete: [${complete.status}] ${JSON.stringify(complete.body)}`);

  return tripId;
}

// ── Carril: un par cliente+conductor corriendo viajes secuenciales ──────────
async function lane(laneIndex, clientToken, driverToken, tripsForThisLane) {
  for (let i = 0; i < tripsForThisLane; i++) {
    try {
      await runOneTrip(clientToken, driverToken);
      metrics.tripsCompleted++;
    } catch (err) {
      metrics.tripsFailed++;
      metrics.recordError(`lane ${laneIndex} trip ${i}`, '-', err.message);
    }
  }
}

async function main() {
  console.log(`Prueba de carga LOCAL — objetivo: ${TARGET_TRIPS} viajes, ${POOL_SIZE} carriles concurrentes`);
  console.log(`Backend: ${BASE_URL}\n`);

  console.log('1/3 — Login OWNER y verificación de cooperativa de prueba...');
  const ownerToken = await loginOwner();
  const cooperativeId = await findOrCreateCooperativeId(ownerToken);
  console.log(`     cooperative_id = ${cooperativeId}`);

  console.log(`\n2/3 — Onboarding de ${POOL_SIZE} conductores + ${POOL_SIZE} clientes (esto respeta el rate-limit real de la API, puede tardar varios minutos)...`);
  const drivers = [];
  const clients = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    process.stdout.write(`     conductor ${i + 1}/${POOL_SIZE}... `);
    const d = await onboardDriver(i, ownerToken, cooperativeId);
    drivers.push(d);
    console.log('ok');

    process.stdout.write(`     cliente   ${i + 1}/${POOL_SIZE}... `);
    const c = await onboardClient(i);
    clients.push(c);
    console.log('ok');
  }

  console.log(`\n3/3 — Ejecutando ${TARGET_TRIPS} viajes en ${POOL_SIZE} carriles concurrentes...`);
  const perLane = Math.ceil(TARGET_TRIPS / POOL_SIZE);
  const startedAt = Date.now();

  await Promise.all(
    drivers.map((d, idx) => lane(idx, clients[idx].token, d.token, perLane)),
  );

  const wallSeconds = (Date.now() - startedAt) / 1000;

  console.log(metrics.report());
  console.log('');
  console.log(`Tiempo total: ${wallSeconds.toFixed(1)}s`);
  console.log(`Throughput:   ${(metrics.tripsCompleted / wallSeconds).toFixed(2)} viajes/s`);
  console.log(`Tasa de éxito: ${((metrics.tripsCompleted / (metrics.tripsCompleted + metrics.tripsFailed)) * 100).toFixed(1)}%`);
}

main().catch((err) => {
  console.error('\nFALLO FATAL:', err);
  process.exit(1);
});
