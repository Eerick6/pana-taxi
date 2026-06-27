# TaxiEC — Backend

Sistema de gestión de taxis para cooperativas legales del Ecuador. Funciona como una plataforma SaaS: una sola instalación sirve a múltiples cooperativas al mismo tiempo.

---

## ¿Qué hace la aplicación?

### Para los clientes (pasajeros)

- Se registran con su número de cédula (verificada y encriptada), nombre y teléfono.
- Inician sesión con su teléfono: reciben un código por SMS que expira en minutos.
- Solicitan un taxi: eligen modo **taxímetro** (precio sube en tiempo real) o modo **regateo** (proponen precio, el conductor acepta o no).
- Ven el estado de su viaje en tiempo real: posición del conductor en el mapa, precio del taxímetro subiendo.
- Si se mueven del punto de recogida mientras esperan al conductor, el mapa del conductor se actualiza.
- Pueden registrar hasta 3 contactos de emergencia en su perfil.

### Para los conductores

Hay dos tipos de conductor:

**Conductor regular (DRIVER)**
- No tiene taxi propio. Cada día trabaja en el taxi que le asigne un conductor-dueño.
- El conductor-dueño publica una solicitud de vehículo (`VehicleRequest`); el conductor la acepta y queda vinculado al taxi por ese día.
- Llama a `POST /drivers/me/start-day` para iniciar jornada → queda en línea.
- Puede trabajar para distintas cooperativas en distintos días.

**Conductor-dueño (OWNER_DRIVER)**
- Tiene sus propios taxis registrados en la plataforma.
- Se vincula a una o varias cooperativas (aprobación de la cooperativa requerida).
- Llama a `POST /drivers/me/start-day` con su `vehicle_id` para elegir cuál de sus taxis conduce hoy.
- También puede recibir solicitudes de conductores regulares para uno de sus vehículos desocupados.

Ambos tipos:
- Deben ser aprobados por la **plataforma** antes de operar.
- Tienen billetera digital: deben tener saldo para cubrir la comisión de cada viaje.
- Envían su ubicación GPS cada **60 segundos** cuando están en línea sin viaje (modo flota).
- Cambian a enviar cada **5 segundos** cuando tienen un viaje activo (modo seguimiento).
- Al completar jornada llaman a `POST /drivers/me/end-day`.

### Para las cooperativas

- Se registran y esperan aprobación de la plataforma.
- Aprueban los vehículos de sus conductores-dueños y la membresía de esos conductores.
- Pueden crear un viaje desde su panel (cliente presencial): solo llega a sus propios taxistas.
- Ven un mapa en tiempo real con todos sus vehículos activos: posición, estado, viaje en curso.
- Tienen su propia tasa de comisión configurable.
- Pagan una mensualidad a la plataforma.

### Para el dueño de la plataforma y su equipo

- Aprueba cooperativas, conductores y vehículos.
- Configura tarifas globales: precio base, precio/km, precio/minuto parado, recargo nocturno, radio de búsqueda inicial, radio máximo, mínimo por viaje, descuento máximo en regateo.
- Configura comisión global y por cooperativa.
- Configura mensualidad global y por cooperativa.
- Genera cobros mensuales y registra pagos.
- Confirma recargas de billetera de conductores (verifica el comprobante de pago).

---

## Estado actual — ¿qué está listo?

| Módulo | Estado | Detalle |
|---|---|---|
| Autenticación | ✅ Completo | SMS OTP (clientes/conductores), Email OTP (staff), refresh token, logout |
| Clientes | ✅ Completo | Registro con cédula encriptada, perfil, foto, contactos de emergencia |
| Conductores | ✅ Completo | Dos tipos (DRIVER / OWNER_DRIVER), documentos, aprobación en 2 niveles, jornada (start-day/end-day), `active_vehicle` |
| Cooperativas | ✅ Completo | Registro, documentos, miembros, aprobación, suspensión, mapa de flota en tiempo real |
| Vehículos | ✅ Completo | Registro por conductor-dueño, documentos, aprobación |
| Solicitudes de vehículo | ✅ Completo | OWNER_DRIVER publica → DRIVER acepta → VehicleAssignment creado |
| Viajes | ✅ Completo | Solicitud (cliente o cooperativa), radio dinámico, aceptación, inicio, completado, cancelación, comisión |
| Taxímetro virtual | ✅ Completo | Sube en tiempo real según distancia/velocidad. Frontend recibe `increment_per_second` para animación fluida. |
| Modo regateo | ✅ Completo | Cliente propone precio; validado contra `max_negotiation_discount_pct`; conductor acepta |
| Tarifas y configuración | ✅ Completo | Base, km, minuto, nocturno, radio dinámico, mínimo, descuento, umbral desvío, frecuencia GPS |
| Radio de búsqueda dinámico | ✅ Completo | Crece cada N segundos si no hay conductor, hasta el máximo configurado (estilo inDrive) |
| Rutas con Mapbox | ✅ Completo | GeoJSON LineString guardado en el viaje; fallback Haversine si no hay token |
| Detección de desvío | ✅ Completo | Recalcula ruta desde posición actual; emite `trip.rerouted` al frontend |
| Ubicación del cliente | ✅ Completo | Cliente actualiza posición mientras espera; conductor ve el pin moverse |
| Panel de flota (coop) | ✅ Completo | `GET /cooperatives/:id/fleet` — todos los vehículos activos con posición y estado |
| Métodos de pago | ✅ Completo | Tabla escalable (efectivo activo, tarjeta/billetera preparados para activar) |
| Billetera conductores | ✅ Completo | Saldo, recargas con comprobante, historial, descuento automático de comisión |
| Tiempo real (WebSocket) | ✅ Completo | Ubicación, viajes nuevos, taxímetro, desvío, posición del cliente, sala por cooperativa/plataforma |
| Configuración plataforma | ✅ Completo | Comisión global y por coop, mensualidad global y por coop |
| Mensualidades coops | ✅ Completo | Generación mensual, estado pendiente/pagado/vencido |
| Personal de plataforma | ✅ Completo | Crear/gestionar admins, soporte, finanzas |
| Términos y condiciones | ✅ Completo | Publicación de versiones, aceptación al registrarse |
| Calificaciones | ✅ Completo | Conductores califican clientes, clientes califican conductores |
| Almacenamiento de archivos | ✅ Completo | Cloudflare R2 (compatible S3), URLs firmadas con expiración de 1 hora |

---

## ¿Qué falta construir?

| Módulo | Prioridad | Descripción |
|---|---|---|
| **Paradas de taxi** | Alta | Cooperativas registran paradas físicas en el mapa. Conductores se ubican en una parada y se asignan por orden de llegada. Requiere validar que el conductor esté físicamente en el punto GPS. |
| **Notificaciones push (FCM)** | Alta | Alerta al teléfono cuando llega un viaje, cuando el conductor acepta, cuando el viaje se completa. |
| **SOS / Emergencias** | Alta | Botón de pánico para clientes y conductores. Notifica a contactos de emergencia del cliente y al equipo de la cooperativa. |
| **Panel web (frontend)** | Alta | Interfaz para cooperativas (flota, viajes, conductores) y plataforma (aprobaciones, configuración, cobros). Consume `GET /cooperatives/:id/fleet` para el mapa. |
| **App móvil** | Alta | App clientes (solicitar viajes, ver taxímetro, mapa) y app conductores (recibir viajes, taxímetro, cambiar frecuencia GPS según `location_update_interval_sec`). |
| **Reportes financieros** | Media | Resumen de comisiones, viajes por cooperativa, conductores activos por período. |
| **Migraciones de BD** | Media | Reemplazar `synchronize: true` con migraciones TypeORM para producción. |
| **Tests automatizados** | Media | Pruebas unitarias e integración para flujos críticos (viajes, billetera, aprobaciones). |

---

## Cómo levantar el proyecto en local

### Requisitos

- Docker y Docker Compose instalados

### Pasos

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd taxi-ec

# 2. Crear el archivo de variables de entorno
cp back/.env.example back/.env
```

Editar `back/.env` y completar los valores:

```env
# Base de datos
DB_USER=taxi
DB_PASSWORD=taxi_password_seguro
MYSQL_USER=taxi
MYSQL_PASSWORD=taxi_password_seguro
MYSQL_ROOT_PASSWORD=root_password_seguro

# JWT — generar con: openssl rand -hex 32
JWT_SECRET=
JWT_REFRESH_SECRET=

# Encriptación de cédulas — generar con: openssl rand -hex 32
ENCRYPTION_KEY=
HMAC_SECRET=

# Cloudflare R2 (almacenamiento de archivos)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=taxi-docs

# Mapbox — para rutas reales y geometría GeoJSON
# Sin este token funciona igual con cálculo Haversine (sin dibujar la ruta en el mapa)
MAPBOX_ACCESS_TOKEN=

# Twilio (SMS en producción — en desarrollo se usa código 000000)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE=

# Resend (correo en producción — en desarrollo se usa código 000000)
RESEND_API_KEY=
RESEND_FROM=noreply@tudominio.com

# Email del dueño de la plataforma (se crea automáticamente al arrancar)
OWNER_EMAIL=owner@tudominio.com
```

```bash
# 3. Levantar todo
docker compose up -d

# La API queda disponible en http://localhost:3000
```

> **Nota:** Con `NODE_ENV=development` el código OTP es siempre `000000` y no se envía SMS ni correo real. La base de datos se sincroniza automáticamente (no se necesitan migraciones).

### Primer acceso como dueño de la plataforma

```bash
# Solicitar código OTP (en desarrollo llega como log, no por correo real)
curl -X POST http://localhost:3000/auth/email-otp/request \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@tudominio.com"}'

# Verificar con código 000000 (solo funciona con NODE_ENV=development)
curl -X POST http://localhost:3000/auth/email-otp/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@tudominio.com","code":"000000"}'
```

La respuesta incluye el `access_token` para usar en las siguientes peticiones.

---

## Estructura del proyecto

```
taxi-ec/
├── docker-compose.yml          # API + MySQL + Redis
└── back/                       # Código fuente del backend
    ├── src/
    │   └── modules/
    │       ├── auth/           # Login OTP (SMS y email)
    │       ├── clients/        # Perfil y datos de pasajeros
    │       ├── cooperatives/   # Gestión de cooperativas + mapa de flota
    │       ├── drivers/        # Conductores, tipos, jornada, active_vehicle
    │       ├── fare/           # Tarifas, taxímetro, rutas Mapbox, desvío
    │       ├── gateway/        # WebSockets (ubicación, taxímetro, eventos)
    │       ├── payment-methods/# Métodos de pago (efectivo, tarjeta, billetera)
    │       ├── platform/       # Staff, configuración global, mensualidades
    │       ├── ratings/        # Calificaciones conductor ↔ cliente
    │       ├── storage/        # Archivos en Cloudflare R2 (fotos, documentos)
    │       ├── terms/          # Términos y condiciones
    │       ├── trips/          # Ciclo de vida de viajes + scheduler de radio
    │       ├── vehicle-requests/ # Solicitudes de vehículo OWNER → DRIVER
    │       ├── vehicles/       # Vehículos y documentos
    │       └── wallet/         # Billetera de conductores
    └── .env.example            # Plantilla de configuración
```

---

## Eventos WebSocket

La app móvil y el panel web se conectan con `socket.io`. El token JWT va en el handshake (`auth.token`).

| Dirección | Evento | Quién lo recibe | Descripción |
|---|---|---|---|
| server → client | `trip.new` | Conductores disponibles / flota de coop | Nuevo viaje disponible para aceptar |
| server → client | `trip.accepted` | Cliente + sala del viaje | Conductor aceptó; incluye `location_update_interval_sec: 5` |
| server → client | `trip.started` | Sala del viaje | Conductor inició el viaje |
| server → client | `trip.meter_update` | Sala del viaje | Taxímetro actualizado: `{ meter_amount, increment_per_second, speed_kmh, is_stopped }` |
| server → client | `trip.completed` | Sala del viaje | Viaje completado; incluye `location_update_interval_sec: 60` |
| server → client | `trip.cancelled` | Sala del viaje | Viaje cancelado; incluye `location_update_interval_sec: 60` |
| server → client | `trip.rerouted` | Sala del viaje | Conductor se desvió; incluye nueva `route_geometry` GeoJSON |
| server → client | `trip.radius_expanded` | Sala del viaje | Radio de búsqueda creció (nadie aceptó aún) |
| server → client | `driver.location` | Sala del viaje / sala de coop | Posición actualizada del conductor |
| server → client | `client.location` | Sala personal del conductor | Posición actualizada del cliente mientras espera recogida |
| client → server | `location.update` | — | Conductor envía `{ lat, lng, speed_kmh }` |
| client → server | `client.location.update` | — | Cliente envía `{ lat, lng }` durante ACCEPTED |
| client → server | `trip.subscribe` | — | Cliente se une a la sala de su viaje |
| client → server | `trip.unsubscribe` | — | Cliente sale de la sala del viaje |

### Taxímetro en el frontend

El evento `trip.meter_update` incluye `increment_per_second` para que la pantalla suba suavemente entre pings GPS (cada 5s). Implementación sugerida:

```ts
let base = 0, rate = 0, syncedAt = Date.now();

socket.on('trip.meter_update', (data) => {
  base = data.meter_amount;
  rate = data.increment_per_second;
  syncedAt = Date.now();
});

// Actualizar display 10 veces por segundo
setInterval(() => {
  const elapsed = (Date.now() - syncedAt) / 1000;
  display.setText(`$${(base + rate * elapsed).toFixed(2)}`);
}, 100);
```

---

## Reglas de negocio clave

**Comisión por viaje**
Se configura como porcentaje global. Cada cooperativa puede tener su propio porcentaje. Se descuenta de la billetera del conductor al completar el viaje.

**Tarifa mínima**
Ningún viaje puede cerrarse por menos de `minimum_fare` (configurable, default $1.50).

**Modo regateo**
El cliente puede proponer un precio menor al sugerido, pero no más del `max_negotiation_discount_pct` por debajo (ej. 30% → no puede ofrecer menos del 70% del precio sugerido). Este porcentaje lo controla el dueño de la plataforma.

**Tarifas nocturnas**
Entre `night_start_hour` (22h) y `night_end_hour` (6h) se aplica un recargo porcentual configurable sobre la tarifa calculada.

**Taxímetro**
Cuando el taxi va a más de `slow_speed_threshold_kmh` km/h cobra por distancia (`price_per_km`). Cuando va más lento o está parado, cobra por tiempo (`price_per_minute`). Aplica el mismo mecanismo que los taxímetros físicos regulados por la ANT.

**Radio de búsqueda dinámico**
Al crear un viaje se asigna el radio inicial (`search_radius_km`). Cada `radius_expansion_interval_sec` segundos (si nadie aceptó) el radio crece `radius_expansion_km` km hasta el máximo `radius_max_km`. Todos los valores son configurables.

**Tipos de conductor**
Un `OWNER_DRIVER` puede pertenecer a varias cooperativas y tiene sus propios taxis (aprobados por la cooperativa). Un `DRIVER` no tiene taxi y se le asigna uno por jornada mediante `VehicleRequest`. Ambos son aprobados por la **plataforma**; las cooperativas solo aprueban la membresía y los vehículos.

**Jornada de trabajo**
Antes de recibir viajes, el conductor debe llamar a `POST /drivers/me/start-day` (con `vehicle_id` si es OWNER_DRIVER). Esto establece su `active_vehicle` y lo pone en estado ONLINE. Al terminar llama a `POST /drivers/me/end-day`.

**Mensualidad**
Monto fijo mensual por cooperativa. Personalizable por cooperativa. La plataforma genera los cobros y registra los pagos manualmente.

**Cédula encriptada**
El número de cédula se guarda cifrado (AES-256). Se usa un hash HMAC separado para detectar duplicados sin descifrar el dato.

**Viajes de cooperativa**
Cuando una cooperativa crea el viaje (cliente presencial sin app), solo se notifica a los conductores de esa cooperativa. Los viajes de cliente llegan a todos los conductores disponibles en radio.
