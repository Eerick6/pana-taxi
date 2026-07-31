# Pana Taxi — Arquitectura y Funcionalidades

> Documento generado a partir del análisis del código fuente real del proyecto.
> Cubre el estado implementado en `/back/` (NestJS), `/mobile/driver/` y `/mobile/clientes/` (Flutter).

---

## 1. Visión General

**Pana Taxi** es una plataforma SaaS multi-cooperativa de taxis orientada a Ecuador. Su modelo de negocio es exclusivamente efectivo — no hay pagos en línea ni tarjetas de crédito en la aplicación. La comisión por cada viaje completado se deduce automáticamente del wallet del conductor.

La plataforma es multi-tenant: cada cooperativa opera de forma aislada dentro de la misma instancia, con el `cooperative_id` incluido en el JWT para imponer la separación de datos en cada query.

---

## 2. Arquitectura Técnica

### Stack

| Capa | Tecnología |
|---|---|
| Backend REST + WS | NestJS (Node.js) |
| Base de datos | MySQL 8 via TypeORM |
| Tiempo real | Socket.IO (con adaptador Redis opcional para escala horizontal) |
| Notificaciones push | Firebase Cloud Messaging (FCM) vía Firebase Admin SDK |
| Email | Brevo (SMTP relay) |
| SMS OTP | Twilio |
| Archivos | Cloudflare R2 (S3-compatible) via `StorageService` |
| Apps móviles | Flutter con Riverpod (gestión de estado) y GoRouter (navegación) |
| Autenticación | JWT (access token + refresh token persistido en BD) |
| Rate limiting | NestJS Throttler — 60 req/min global, 3 req/min en endpoints OTP |
| Auditoría | `AuditInterceptor` global — registra todas las peticiones |
| Tareas programadas | `@nestjs/schedule` — corre cada 15 segundos |

### Multi-tenant

El JWT contiene el campo `cooperative_id` para el personal de cooperativa. Este campo se inyecta como propiedad virtual en la entidad `User` por la `JwtStrategy`, de modo que todos los controladores y servicios de cooperativa siempre filtran datos por él — nunca confían en un parámetro de query para determinar la cooperativa del usuario autenticado.

### Roles del Sistema

| Rol (`UserRole`) | Ámbito | Capacidades principales |
|---|---|---|
| `owner` | Plataforma | Superadministrador. Acceso total. Gestiona staff, configura tarifas, planes, genera mensualidades |
| `platform_admin` | Plataforma | Igual que owner excepto creación de staff y configuraciones de máximo nivel |
| `finance` | Plataforma | Aprueba/rechaza recargas, gestiona liquidaciones, ve reportes financieros |
| `support` | Plataforma | Ve alertas SOS, viajes, conversaciones de chat, clientes |
| `monitoring` | Plataforma | Solo lectura: dashboard, flota, reportes globales |
| `cooperative_admin` | Cooperativa | Gestiona su cooperativa, miembros, conductores, vehículos, viajes propios |
| `cooperative_operator` | Cooperativa | Crea viajes, gestiona paradas, aprueba conductores/vehículos |
| `cooperative_supervisor` | Cooperativa | Solo lectura de su cooperativa |
| `driver` | App conductor | Se registra, sube documentos, gestiona vehículos, acepta viajes, maneja wallet |
| `client` | App cliente | Solicita viajes, sigue estado en tiempo real |

---

## 3. Módulos del Backend

### 3.1 Auth (`/auth`)

Maneja autenticación OTP para clientes/conductores (SMS via Twilio) y para staff de cooperativa/plataforma (email via Brevo). Los tokens son JWT con payload `{ sub, role, cooperative_id }`.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/auth/otp/request` | Público | Solicita OTP por SMS al teléfono registrado. Rate: 3/min |
| POST | `/auth/otp/verify` | Público | Verifica OTP y devuelve access_token + refresh_token. Rate: 5/min |
| POST | `/auth/email-otp/request` | Público | Solicita OTP por email (solo staff de cooperativa/plataforma). Rate: 3/min |
| POST | `/auth/email-otp/verify` | Público | Verifica OTP de email. Rate: 5/min |
| POST | `/auth/register/client` | Público | Registro de cliente (nombre, cédula cifrada, teléfono, versión de T&C aceptada). Envía OTP SMS. |
| POST | `/auth/refresh` | Público | Renueva tokens usando refresh_token |
| GET | `/auth/me` | JWT válido | Devuelve perfil del usuario autenticado |
| POST | `/auth/logout` | JWT válido | Invalida el refresh_token en BD |

**Notas de implementación:**
- OTP de 6 dígitos, expira en 10 minutos.
- En modo desarrollo (`NODE_ENV != production`), el código `000000` bypasa la validación y el endpoint devuelve `dev_code` en la respuesta.
- La cédula del cliente se cifra en reposo con AES y se busca por HMAC.

---

### 3.2 Users (`/users`)

Gestión de usuarios del sistema (staff de plataforma y cooperativa). No incluye conductores ni clientes, que tienen sus propios módulos.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/users` | owner, platform_admin | Lista usuarios |
| GET | `/users/:id` | owner, platform_admin | Detalle de usuario |
| PATCH | `/users/:id` | owner | Actualiza usuario |
| DELETE | `/users/:id` | owner | Elimina usuario |

---

### 3.3 Clients (`/clients`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/clients/me` | client | Perfil propio |
| PATCH | `/clients/me` | client | Actualiza perfil (nombre, etc.) |
| POST | `/clients/me/photo` | client | Sube foto de perfil (multipart) |
| POST | `/clients/me/emergency-contacts` | client | Agrega contacto de emergencia |
| GET | `/clients/me/emergency-contacts` | client | Lista contactos de emergencia |
| DELETE | `/clients/me/emergency-contacts/:id` | client | Elimina contacto |
| GET | `/clients` | owner, platform_admin, support | Lista clientes con búsqueda |
| GET | `/clients/:id` | owner, platform_admin, support | Detalle del cliente |
| PATCH | `/clients/:id/block` | owner, platform_admin, support | Bloquea cliente |
| PATCH | `/clients/:id/unblock` | owner, platform_admin, support | Desbloquea cliente |

---

### 3.4 Drivers (`/drivers`)

Dos tipos de conductor: `OWNER_DRIVER` (dueño del taxi que también maneja) y `DRIVER` (chofer que trabaja en taxi ajeno). Los OWNER_DRIVER se unen a cooperativas por solicitud; los DRIVER son aprobados por la plataforma y trabajan bajo `VehicleAssignment`.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/drivers/register` | Público | Auto-registro de conductor |
| GET | `/drivers/me` | driver | Perfil propio con cooperativas |
| PATCH | `/drivers/me/status` | driver | Cambia estado online/offline/busy |
| PATCH | `/drivers/me/location` | driver | Actualiza GPS (alternativa al WebSocket) |
| POST | `/drivers/documents` | driver | Sube documento (multipart). Tipos: licencia, foto, etc. |
| GET | `/drivers/documents` | driver | Lista documentos propios |
| GET | `/drivers/documents/:id/url` | driver | URL firmada del documento (presigned, 1h) |
| POST | `/drivers/me/start-day` | driver | Inicia jornada con vehículo `{ vehicle_id }`. Pone estado ONLINE. |
| POST | `/drivers/me/end-day` | driver | Finaliza jornada, pone estado OFFLINE, borra caché de vehículo activo |
| POST | `/drivers/me/cooperatives` | driver | Solicita unirse a cooperativa (solo OWNER_DRIVER aprobado) |
| GET | `/drivers/me/cooperatives` | driver | Lista cooperativas del conductor |
| GET | `/drivers` | platform_admin, support, coop_admin, coop_operator | Lista conductores (filtrable por estado, búsqueda, cooperativa) |
| GET | `/drivers/platform/pending` | platform_admin, support, owner | Lista conductores DRIVER pendientes de aprobación |
| PATCH | `/drivers/:id/platform-approve` | platform_admin, support, owner | Aprueba conductor DRIVER |
| PATCH | `/drivers/:id/platform-reject` | platform_admin, support, owner | Rechaza conductor DRIVER |
| GET | `/drivers/cooperative/pending` | coop_admin, coop_operator, coop_supervisor | Lista OWNER_DRIVER pendientes en la cooperativa |
| PATCH | `/drivers/:id/cooperative-approve` | coop_admin, coop_operator, owner | Aprueba membresía OWNER_DRIVER |
| PATCH | `/drivers/:id/cooperative-reject` | coop_admin, coop_operator, owner | Rechaza membresía OWNER_DRIVER |
| PATCH | `/drivers/:driverId/documents/:documentId/approve` | platform + coop write | Aprueba documento de conductor |
| PATCH | `/drivers/:driverId/documents/:documentId/reject` | platform + coop write | Rechaza documento |
| GET | `/drivers/:driverId/documents/:documentId/url` | platform + coop read | URL firmada para admin |
| PATCH | `/drivers/:id/block` | platform admin | Suspende cuenta del conductor |
| PATCH | `/drivers/:id/unblock` | platform admin | Reactiva cuenta del conductor |
| DELETE | `/drivers/:id` | platform admin | Elimina conductor (debe estar OFFLINE) |
| GET | `/drivers/:id` | platform + coop read | Detalle de conductor con documentos y cooperativas |

**Caché interno:** Al iniciar jornada (`start-day`), el servicio guarda en memoria (`Map`) el driver + vehículo activo con TTL de 4 horas. Esto evita queries repetidas a BD cada vez que se necesita saber qué taxi usa el conductor al aceptar un viaje.

---

### 3.5 Vehicles (`/vehicles`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/vehicles` | driver | Registra vehículo propio |
| GET | `/vehicles/mine` | driver | Lista vehículos propios |
| POST | `/vehicles/:vehicleId/documents` | driver | Sube documento del vehículo (multipart) |
| GET | `/vehicles/:vehicleId/documents` | driver | Lista documentos del vehículo |
| GET | `/vehicles/:vehicleId/documents/:documentId/url` | driver | URL firmada del documento |
| DELETE | `/vehicles/mine/:id` | driver | Elimina vehículo propio |
| PATCH | `/vehicles/:id/assign-driver` | driver (owner) | Asigna o desasigna un chofer al vehículo |
| GET | `/vehicles` | coop + platform admin | Lista todos con filtros |
| GET | `/vehicles/pending` | coop + platform admin | Lista vehículos pendientes de aprobación por cooperativa |
| GET | `/vehicles/:id` | coop + platform read | Detalle del vehículo |
| PATCH | `/vehicles/:id/approve` | coop + platform write | Aprueba vehículo |
| PATCH | `/vehicles/:id/reject` | coop + platform write | Rechaza vehículo |
| PATCH | `/vehicles/:id/suspend` | coop + platform write | Suspende vehículo |
| PATCH | `/vehicles/:id/activate` | coop + platform write | Reactiva vehículo |
| DELETE | `/vehicles/:id` | coop + platform write | Elimina vehículo |
| PATCH | `/vehicles/:vehicleId/documents/:documentId/approve` | coop + platform write | Aprueba documento |
| PATCH | `/vehicles/:vehicleId/documents/:documentId/reject` | coop + platform write | Rechaza documento |
| GET | `/vehicles/:vehicleId/admin-documents/:documentId/url` | coop + platform read | URL firmada para admin |

---

### 3.6 Cooperatives (`/cooperatives`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/cooperatives` | owner, platform_admin | Crea cooperativa directamente |
| GET | `/cooperatives` | platform read | Lista todas las cooperativas |
| GET | `/cooperatives/active` | platform read + driver | Lista cooperativas activas y aprobadas |
| GET | `/cooperatives/pending` | owner, platform_admin | Lista cooperativas pendientes de aprobación |
| GET | `/cooperatives/:id` | platform read + coop_admin | Detalle |
| PATCH | `/cooperatives/:id` | owner, platform_admin | Actualiza datos |
| PATCH | `/cooperatives/:id/approve` | owner, platform_admin | Aprueba y activa cooperativa |
| PATCH | `/cooperatives/:id/reject` | owner, platform_admin | Rechaza cooperativa |
| PATCH | `/cooperatives/:id/suspend` | owner, platform_admin | Suspende cooperativa |
| PATCH | `/cooperatives/:id/activate` | owner, platform_admin | Reactiva cooperativa |
| PATCH | `/cooperatives/:id/set-fee` | owner, platform_admin | Establece fee mensual override |
| DELETE | `/cooperatives/:id` | owner, platform_admin | Elimina cooperativa (debe estar inactiva) |
| POST | `/cooperatives/:id/documents` | platform + coop_admin | Sube documento de la cooperativa |
| GET | `/cooperatives/:id/documents` | platform read + coop_admin | Lista documentos |
| GET | `/cooperatives/:id/documents/:docId/url` | platform read + coop_admin | URL firmada |
| PATCH | `/cooperatives/:id/documents/:docId/approve` | owner, platform_admin | Aprueba documento (envía email al admin de coop) |
| PATCH | `/cooperatives/:id/documents/:docId/reject` | owner, platform_admin | Rechaza documento (envía email al admin de coop) |
| POST | `/cooperatives/:id/members` | owner, platform_admin | Agrega miembro staff a la cooperativa |
| GET | `/cooperatives/:id/members` | platform read + coop_admin | Lista miembros staff |
| DELETE | `/cooperatives/members/:memberId` | owner, platform_admin | Elimina miembro y desactiva su cuenta |
| GET | `/cooperatives/:id/owners` | platform read + coop_admin/operator | Lista conductores-dueños de la cooperativa |
| GET | `/cooperatives/:id/fleet` | platform read + coop_admin/operator | Snapshot de la flota en tiempo real (conductores online + posición) |

**Endpoint público de registro** (`/cooperatives-public`): Permite que una cooperativa se pre-registre sin auth (nombre, RUC, email del admin). Crea el usuario admin con rol `cooperative_admin` y notifica a los admins de plataforma.

**Documentos requeridos de cooperativa:** RUC, permiso ANT/GADM, resolución SEPS, estatutos, cédula del representante legal, nombramiento del representante.

---

### 3.7 Trips (`/trips`)

El módulo central del sistema. Ver Sección 4 para el ciclo de vida completo.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/trips` | client, coop_admin, coop_operator | Crea viaje (cliente app o despachador cooperativa) |
| GET | `/trips/available` | driver | Lista viajes disponibles en radio del conductor |
| PATCH | `/trips/:id/accept` | driver | Acepta viaje (METER: asignación directa; NEGOTIATED: crea oferta) |
| POST | `/trips/:id/offers` | driver | Hace oferta de precio (solo NEGOTIATED) |
| PATCH | `/trips/:id/arrived` | driver | Marca llegada al punto de recogida (inicia timer 5 min) |
| PATCH | `/trips/:id/start` | driver | Inicia viaje con OTP del pasajero |
| PATCH | `/trips/:id/complete` | driver | Completa viaje, deduce comisión del wallet |
| GET | `/trips/driver/me` | driver | Historial de viajes del conductor (paginado) |
| GET | `/trips/driver/me/active` | driver | Viaje activo del conductor (sin OTP) |
| GET | `/trips/:id/offers` | client | Lista ofertas de conductores para viaje NEGOTIATED |
| PATCH | `/trips/:id/offers/:offerId/select` | client | Selecciona oferta, asigna conductor, rechaza el resto |
| PATCH | `/trips/:id/increment-offer` | client | Incrementa su oferta $0.25 (solo sin ofertas pendientes) |
| PATCH | `/trips/:id/client-ready` | client | Notifica al conductor que el cliente viene en camino |
| GET | `/trips/me` | client | Historial de viajes del cliente (paginado) |
| GET | `/trips/me/active` | client | Viaje activo del cliente (incluye OTP) |
| PATCH | `/trips/:id/cancel` | client, driver, coop_admin, coop_operator, owner, platform_admin | Cancela viaje |
| GET | `/trips` | platform + coop roles | Lista viajes (coop roles ven solo los suyos por JWT) |
| GET | `/trips/:id` | todos los roles | Detalle del viaje (OTP solo visible para el cliente) |

**Scheduler de viajes (cada 15 segundos):**
- **Expansión de radio**: si un viaje lleva más de `radius_expansion_interval_sec` sin conductor, expande el radio de búsqueda en `radius_expansion_km` hasta un máximo de `radius_max_km`.
- **Timer de espera**: detecta viajes en estado `DRIVER_ARRIVED` con `wait_timer_expires_at` vencido sin confirmación del cliente; notifica a ambas partes que el conductor puede cancelar sin penalización.

---

### 3.8 Wallet (`/wallet`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/wallet/bank-accounts` | driver + finance | Lista cuentas bancarias activas (para depósitos de recarga) |
| GET | `/wallet/bank-accounts/all` | finance | Lista todas (incluidas inactivas) |
| POST | `/wallet/bank-accounts/upload-logo` | finance | Sube logo del banco |
| POST | `/wallet/bank-accounts` | finance | Crea cuenta bancaria |
| PATCH | `/wallet/bank-accounts/:id` | finance | Actualiza cuenta bancaria |
| DELETE | `/wallet/bank-accounts/:id` | finance | Desactiva cuenta bancaria |
| GET | `/wallet/me` | driver | Balance y datos del wallet propio |
| GET | `/wallet/me/transactions` | driver | Historial de transacciones (paginado) |
| GET | `/wallet/me/recharges` | driver | Historial de recargas (paginado) |
| POST | `/wallet/me/recharges` | driver | Solicita recarga (multipart: monto + comprobante de transferencia) |
| GET | `/wallet/recharges` | finance | Lista recargas con filtro por estado |
| GET | `/wallet/recharges/pending` | finance | Lista recargas pendientes |
| GET | `/wallet/recharges/:id/proof-url` | finance | URL firmada del comprobante |
| PATCH | `/wallet/recharges/:id/confirm` | finance | Confirma recarga y acredita saldo al wallet (transaction DB con lock pesimista) |
| PATCH | `/wallet/recharges/:id/reject` | finance | Rechaza recarga |

---

### 3.9 Accounting (`/accounting`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/accounting/coop-account` | finance | Balance de la cuenta contable de una cooperativa |
| GET | `/accounting/coop-statement` | finance | Estado de cuenta de cooperativa con filtros (fecha, cooperativa) |
| GET | `/accounting/driver-statement` | finance | Estado de cuenta de conductor |
| GET | `/accounting/settlements` | finance | Lista liquidaciones |
| POST | `/accounting/settlements` | platform_admin, finance | Crea liquidación (transfiere fondos de cuenta coop a plataforma) |
| PATCH | `/accounting/settlements/:id/confirm` | platform_admin, finance | Confirma liquidación con comprobante |
| DELETE | `/accounting/settlements/:id` | platform_admin, finance | Cancela liquidación |
| GET | `/accounting/platform-fee` | platform_admin, finance | Tasa de comisión global |
| PATCH | `/accounting/platform-fee` | platform_admin | Actualiza tasa de comisión global |

---

### 3.10 Stands (`/stands`) — Paradas

Las paradas son puntos de espera de taxis asociados a una cooperativa. Los conductores hacen check-in para ponerse en cola; los despachadores pueden enviar viajes priorizando al primero de la cola.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/stands` | coop_admin, coop_operator, owner, platform_admin | Crea parada |
| GET | `/stands/summary` | platform (owner, platform_admin, monitoring, support) | Resumen global de paradas |
| GET | `/stands` | todos los roles de coop + driver | Lista paradas (coop staff ve solo las suyas; drivers ven las de sus coops) |
| GET | `/stands/me` | driver | Parada en la que está actualmente el conductor |
| GET | `/stands/:id` | todos los roles de coop + driver | Detalle de parada |
| PATCH | `/stands/:id` | coop_admin, coop_operator, owner, platform_admin | Actualiza parada |
| DELETE | `/stands/:id` | coop_admin, owner, platform_admin | Elimina parada |
| POST | `/stands/check-in` | driver | El conductor se une a la cola de una parada |
| POST | `/stands/check-out` | driver | El conductor sale de la cola |
| GET | `/stands/:id/queue` | todos los roles de coop + driver | Lista la cola actual (orden de llegada) |

Al aceptar un viaje desde una parada, el sistema hace auto-checkout del conductor automáticamente.

---

### 3.11 Fare (`/fares`) — Tarifas

Configuración del taxímetro virtual conforme a la regulación ANT de Ecuador.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/fares/config` | owner, platform_admin | Ver configuración completa de tarifas |
| PATCH | `/fares/config` | owner | Actualiza configuración de tarifas |
| GET | `/fares/estimate` | client, driver, coop roles | Estima tarifa para una ruta (llama a Mapbox/OSRM internamente) |

Parámetros configurables: tarifa base, precio por km diurno/nocturno, precio por minuto en tráfico lento, tarifa mínima, radio de búsqueda inicial, velocidad de expansión del radio, umbrales del taxímetro, descuento máximo en modo NEGOTIATED, intervalo de actualización de ubicación (flota vs viaje activo), umbral de desviación de ruta en metros.

---

### 3.12 Notifications (`/notifications`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/notifications/token` | client, driver | Registra token FCM del dispositivo |
| DELETE | `/notifications/token` | client, driver | Elimina token FCM (al cerrar sesión) |
| GET | `/notifications/me` | múltiples roles | Feed de notificaciones del usuario (paginado) |
| GET | `/notifications/me/unread-count` | múltiples roles | Conteo de notificaciones no leídas |
| PATCH | `/notifications/:id/read` | múltiples roles | Marca notificación como leída |
| PATCH | `/notifications/read-all` | múltiples roles | Marca todas como leídas |
| DELETE | `/notifications/:id` | múltiples roles | Elimina notificación |

---

### 3.13 Ratings (`/ratings`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/ratings` | client, driver | Envía calificación tras un viaje o solicitud de vehículo |
| GET | `/ratings/drivers/:driverId` | múltiples roles | Estadísticas de calificación del conductor |
| GET | `/ratings/owners/:ownerId` | driver, owner, platform | Estadísticas del dueño de taxi |
| GET | `/ratings/clients/:clientId` | driver, owner, platform | Estadísticas del cliente |

---

### 3.14 SOS (`/sos`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/sos` | client, driver | Activa alerta SOS con ubicación |
| GET | `/sos` | owner, platform_admin, support, monitoring | Lista alertas (filtrables por estado) |
| GET | `/sos/:id` | plataforma | Detalle de alerta |
| PATCH | `/sos/:id/resolve` | plataforma | Resuelve alerta |

---

### 3.15 Chat (`/chat`)

Chat en tiempo real para múltiples contextos: conductor-cliente (por viaje), conductor-dueño (por solicitud de vehículo), dueño-postulante, conductor-operadora.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/chat/admin/conversations` | owner, platform_admin, support, monitoring | Lista todas las conversaciones |
| GET | `/chat/admin/conversations/:id/messages` | plataforma admin | Mensajes de cualquier conversación |
| GET | `/chat/conversations` | cualquier usuario auth | Lista conversaciones propias |
| POST | `/chat/trip/:tripId/open` | auth | Abre/obtiene conversación conductor-cliente por viaje |
| POST | `/chat/owner/open` | auth | Abre/obtiene conversación conductor-dueño |
| POST | `/chat/applicant/open` | auth | Abre/obtiene conversación dueño-postulante |
| POST | `/chat/operator/open` | auth | Abre/obtiene conversación conductor-operadora |
| POST | `/chat/messages` | auth | Envía mensaje (persiste en BD + emite WS `chat.message`) |
| GET | `/chat/conversations/:id/messages` | auth | Historial de mensajes (paginado) |
| PATCH | `/chat/conversations/:id/read` | auth | Marca conversación como leída |

---

### 3.16 Plans (`/plans`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/plans` | owner, platform_admin | Lista planes de suscripción |
| GET | `/plans/:id` | owner, platform_admin | Detalle de plan |
| POST | `/plans` | owner, platform_admin | Crea plan |
| PATCH | `/plans/:id` | owner, platform_admin | Actualiza plan |
| DELETE | `/plans/:id` | owner, platform_admin | Elimina plan |

---

### 3.17 Billing (`/billing`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/billing/invoices` | finance | Lista facturas (filtrable por estado, cooperativa) |
| PATCH | `/billing/invoices/:id/mark-paid` | owner, platform_admin | Marca factura como pagada |
| GET | `/billing/payments` | finance | Lista pagos |
| PATCH | `/billing/payments/:id/confirm` | finance | Confirma pago |
| PATCH | `/billing/payments/:id/reject` | finance | Rechaza pago |
| GET | `/billing/renewals` | finance | Lista renovaciones próximas |
| GET | `/billing/stats` | finance | Estadísticas de facturación |

---

### 3.18 Platform (`/platform`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/platform/staff` | owner | Crea miembro de staff de plataforma |
| GET | `/platform/staff` | owner, platform_admin | Lista staff |
| GET | `/platform/staff/:id` | owner, platform_admin | Detalle de staff |
| PATCH | `/platform/staff/:id` | owner | Actualiza staff |
| DELETE | `/platform/staff/:id` | owner | Elimina staff |
| GET | `/platform/config` | owner, platform_admin | Lista configuración global del sistema |
| PATCH | `/platform/config/:key` | owner | Actualiza clave de configuración |
| GET | `/platform/subscriptions` | owner, platform_admin | Lista mensualidades de cooperativas |
| POST | `/platform/subscriptions/generate` | owner | Genera mensualidades del mes/año indicado |
| PATCH | `/platform/subscriptions/:id/mark-paid` | owner, platform_admin | Marca mensualidad como pagada |
| PATCH | `/platform/subscriptions/:id/mark-overdue` | owner | Marca mensualidad como vencida |
| GET | `/platform/leads` | owner, platform_admin | Lista leads de contacto |
| PATCH | `/platform/leads/:id/status` | owner, platform_admin | Actualiza estado del lead |
| DELETE | `/platform/leads/:id` | owner | Elimina lead |
| GET | `/platform/coop-applications` | owner, platform_admin | Lista solicitudes de registro de cooperativas |
| PATCH | `/platform/coop-applications/:id/status` | owner, platform_admin | Actualiza estado de solicitud |
| DELETE | `/platform/coop-applications/:id` | owner | Elimina solicitud |

---

### 3.19 Terms (`/terms`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/terms/:type` | Público | Versión vigente de T&C para un tipo (client, driver, cooperative) |
| POST | `/terms/publish` | owner, platform_admin | Publica nueva versión de T&C |
| GET | `/terms` | owner, platform_admin | Historial de versiones |

---

### 3.20 Reports (`/reports`)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/reports/dashboard-stats` | owner, platform_admin, monitoring | KPIs del dashboard (filtrable por cooperativa) |
| GET | `/reports/global` | finance roles | Reporte global por rango de fechas |
| GET | `/reports/daily` | finance roles | Reporte diario |
| GET | `/reports/summary` | finance + coop_admin/supervisor | Resumen general (coop staff ve solo los suyos) |
| GET | `/reports/trips` | finance + coop | Reporte detallado de viajes |
| GET | `/reports/drivers` | finance + coop | Ingresos por conductor |
| GET | `/reports/cooperatives` | finance plataforma | Desglose por cooperativa |
| GET | `/reports/wallets` | finance + coop | Saldos de wallets |
| GET | `/reports/trips/export` | finance + coop | Exportar viajes en CSV |

---

### 3.21 Vehicle Requests (`/vehicle-requests`)

Sistema de bolsa de trabajo: un OWNER_DRIVER publica que necesita un chofer para su taxi; los conductores tipo DRIVER se postulan.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/vehicle-requests` | driver | Publica solicitud de chofer (OWNER_DRIVER) |
| GET | `/vehicle-requests/open` | driver | Lista solicitudes abiertas disponibles para aplicar |
| POST | `/vehicle-requests/:id/apply` | driver | Conductor DRIVER se postula |
| PATCH | `/vehicle-requests/applications/:applicationId/withdraw` | driver | Retira postulación |
| GET | `/vehicle-requests/:id/applications` | driver (owner) | Lista postulaciones de su solicitud |
| PATCH | `/vehicle-requests/:id/applications/:applicationId/accept` | driver (owner) | Acepta postulación, crea VehicleAssignment |
| PATCH | `/vehicle-requests/:id/cancel` | driver (owner) | Cancela solicitud |
| PATCH | `/vehicle-requests/:id/complete` | driver (owner) | Completa la jornada/contrato |
| GET | `/vehicle-requests/mine` | driver | Solicitudes publicadas por el usuario |
| GET | `/vehicle-requests/my-applications` | driver | Postulaciones del conductor |

---

### 3.22 Payment Methods (`/payment-methods`)

Métodos de pago configurables por la plataforma (efectivo, transferencia, etc.) para mostrar en las apps.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/payment-methods` | cualquier JWT | Lista métodos activos |
| GET | `/payment-methods/:id` | cualquier JWT | Detalle |
| POST | `/payment-methods` | owner | Crea método de pago |
| PATCH | `/payment-methods/:id` | owner | Actualiza |
| DELETE | `/payment-methods/:id` | owner | Elimina |

---

## 4. Ciclo de Vida del Viaje

### Estados del viaje

```
REQUESTED → ACCEPTED → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED
                                                     ↘
                          ← ← ← ← ← ← ← ← ← ← ← ← CANCELLED
```

### Paso a paso

**1. Solicitud (REQUESTED)**
- El cliente (app) o un operador de cooperativa crea el viaje via `POST /trips`.
- El sistema calcula la tarifa estimada con Mapbox/OSRM (distancia, duración, geometría de ruta).
- Se registra la tasa de comisión en el momento (puede ser global o la del override de la cooperativa).
- Se emite el evento WS `trip.new` a los conductores disponibles en radio.

**2. Modos de tarifa**

| Modo | Descripción |
|---|---|
| `METER` | Tarifa calculada en tiempo real por el taxímetro virtual (distancia + tiempo en tráfico). Primer conductor que acepta gana (lock pesimista). |
| `NEGOTIATED` | El cliente propone un precio fijo. Múltiples conductores pueden hacer ofertas. El cliente selecciona la que prefiera. |

**3. Aceptación**

- **METER**: `PATCH /trips/:id/accept` — transacción con `pessimistic_write` lock en la fila del viaje. El primer conductor en ejecutar la transacción gana. Los demás reciben error de conflicto. Se genera un OTP de 4 dígitos y se asigna al viaje.
- **NEGOTIATED**: `PATCH /trips/:id/accept` redirige a `makeOffer`. Cualquier conductor en rango puede enviar una oferta con su precio propuesto (o aceptar el precio del cliente). El cliente ve las ofertas vía WS (`trip.new_offer`) y selecciona con `PATCH /trips/:id/offers/:offerId/select`. Al seleccionar, se rechaza el resto con lock pesimista.

Tras la aceptación: conductor pasa a estado `BUSY`, se le notifica por WS, se notifica al cliente con el OTP.

**4. Llegada (DRIVER_ARRIVED)**
- `PATCH /trips/:id/arrived` — el conductor marca que llegó al punto de recogida.
- Se inicia un temporizador de 5 minutos (`wait_timer_expires_at`).
- Se envía FCM al cliente: "Tu taxi llegó. Código: XXXX".
- El OTP se envía al cliente (no al conductor). El conductor no ve el OTP en ningún endpoint.

**5. Cliente confirma**
- `PATCH /trips/:id/client-ready` — opcional, notifica al conductor que el cliente viene en camino.

**6. Inicio del viaje (IN_PROGRESS)**
- `PATCH /trips/:id/start` con body `{ otp_code }`.
- El conductor le pide el código al pasajero en persona. Si es correcto, el viaje inicia.
- El OTP se borra de la BD.
- El taxímetro arranca con la tarifa base (para modo METER).

**7. Taxímetro virtual**
- Durante el viaje, el conductor envía su posición via WS (`location.update`).
- El gateway calcula la distancia recorrida entre pings (Haversine).
- Cuando la velocidad cae por debajo del umbral (`slow_speed_threshold_kmh`), el taxímetro cobra por tiempo (minutos transcurridos) en lugar de por distancia.
- El monto actualizado se emite via WS (`trip.meter_update` con `meter_amount` e `increment_per_second` para la animación en la app).

**8. Detección de desvío**
- En cada ping de ubicación, el gateway verifica si el conductor está dentro de `deviation_threshold_m` de la ruta calculada.
- Si se desvía, se recalcula la ruta y se emite `trip.rerouted` al viaje y `driver.deviation` a la cooperativa.

**9. Completar (COMPLETED)**
- `PATCH /trips/:id/complete` con `{ fare_amount }` (en modo METER se usa el `meter_amount` acumulado; en NEGOTIATED se usa el `agreed_fare`).
- Se aplica la tarifa mínima si el monto calculado es menor.
- En transacción atómica: se actualiza el estado del viaje, se deduce la comisión del wallet del conductor (`deductCommission`), y si el viaje pertenece a una cooperativa, se acredita la comisión en la cuenta contable de la cooperativa (`creditCoopCommission`).
- El conductor vuelve a estado `ONLINE`.

**10. Cancelación**
- Cualquier estado antes de `IN_PROGRESS` puede ser cancelado por cliente, conductor, o personal de cooperativa/plataforma.
- Los viajes `IN_PROGRESS` solo pueden ser cancelados por cooperativa o plataforma.
- Se registra `cancelled_by`: `CLIENT`, `DRIVER`, `COOPERATIVE`, `PLATFORM`.
- Para viajes NEGOTIATED, las ofertas pendientes quedan en estado `EXPIRED`.

---

## 5. Modelo de Comisiones y Wallet

### Estructura

- Cada conductor tiene exactamente un `DriverWallet` con saldo en USD.
- El saldo puede ser negativo (el conductor debe comisiones a la plataforma).

### Flujo de comisión

```
Viaje completado
    → fare_amount × commission_rate = commission_amount
    → wallet.balance -= commission_amount  (WalletTransaction: COMMISSION_DEDUCTION)
    → coop_account.balance += commission_amount  (AccountingEntry: coop commission)
```

La tasa de comisión se lee al crear el viaje (no al completarlo) y queda grabada en el campo `trip.commission_rate`. Si la cooperativa tiene un `commission_override`, se usa ese; si no, se usa la tasa global de la tabla `system_config`.

### Recarga del wallet

1. El conductor hace `POST /wallet/me/recharges` con monto y comprobante de transferencia (JPEG/PNG/PDF, máx 10MB). Monto mínimo $5, máximo $500.
2. Solo puede tener una recarga pendiente a la vez.
3. El personal de Finance recibe notificación push y por el feed.
4. Finance revisa el comprobante con la URL firmada y confirma o rechaza.
5. Al confirmar, se ejecuta una transacción con `pessimistic_write` que suma el monto al balance y crea una `WalletTransaction` de tipo `RECHARGE`.

### Liquidaciones

Finance puede crear liquidaciones para mover fondos acumulados en la cuenta contable de una cooperativa a la plataforma (`POST /accounting/settlements`). Requieren confirmación posterior.

---

## 6. Jornadas (Shifts)

Una jornada es el período en que un conductor está activo con un vehículo específico.

### Inicio de jornada (`POST /drivers/me/start-day`)

**OWNER_DRIVER (dueño que maneja):**
- Debe enviar `{ vehicle_id }` indicando cuál de sus taxis manejará ese día.
- El sistema verifica que el vehículo esté aprobado y le pertenezca.
- Verifica que nadie más tenga ese taxi en jornada activa (status no OFFLINE).
- Asigna `driver.active_vehicle_id = vehicle.id` y pone estado `ONLINE`.

**DRIVER (chofer en taxi ajeno):**
- No envía `vehicle_id` (o debe coincidir con el del assignment activo).
- Requiere un `VehicleAssignment` activo creado por el dueño del taxi.
- Igual verifica que nadie más esté usando ese taxi.

**Restricción de un taxi — un conductor activo a la vez:**
Esta restricción se impone a nivel de aplicación: antes de asignar `active_vehicle_id`, se busca cualquier driver con ese vehículo y estado `!= OFFLINE`. Si existe (y no es el mismo conductor), lanza `ConflictException`.

### Durante la jornada
- El conductor aparece en la sala WS `available_drivers` y en las salas de sus cooperativas.
- Su ubicación GPS (enviada cada N segundos por el cliente móvil vía WS) se persiste en `driver.current_lat/lng`.
- El despacho de viajes de cooperativa llega a todos los conductores de la sala de la coop.
- Si el viaje viene de una parada, se envía primero al primero de la cola de la parada.

### Fin de jornada (`POST /drivers/me/end-day`)
- `driver.active_vehicle_id = null`, estado `OFFLINE`.
- Se borra el caché en memoria del driver+vehículo.

---

## 7. Seguridad Implementada

### Multi-tenant por JWT
El `cooperative_id` del JWT es la única fuente de verdad para determinar la cooperativa del usuario. Los controladores nunca confían en parámetros de query para esto. Los roles de cooperativa solo ven datos de su propia cooperativa.

### Control de acceso basado en roles
Implementado con el par de guards `JwtGuard` (verifica token) + `RolesGuard` (verifica rol). Cada endpoint declara explícitamente los roles permitidos con el decorador `@Roles(...)`.

### OTP de viaje (previene inicio sin pasajero)
- Al aceptar un viaje, el backend genera un OTP de 4 dígitos que se envía al cliente.
- El conductor nunca puede ver este OTP (los endpoints del conductor lo omiten explícitamente).
- Para iniciar el viaje, el conductor debe pedirle el código al pasajero en persona.
- Esto previene que un conductor marque un viaje como iniciado/completado sin haber recogido al pasajero.

### OTP de autenticación
- Clientes y conductores se autentican exclusivamente por OTP SMS (Twilio).
- El personal de cooperativa y plataforma se autentica por OTP email (Brevo).
- Los OTP expiran en 10 minutos.
- El personal de plataforma no puede usar el endpoint de OTP por teléfono, y viceversa.

### Lock pesimista en aceptación de viajes
- Modo METER: `SELECT ... FOR UPDATE` en la transacción de aceptación. Solo un conductor puede tomar el viaje; el resto recibe `ConflictException`.
- Modo NEGOTIATED: el lock se aplica al seleccionar la oferta del cliente, previniendo asignaciones simultáneas.

### Cifrado de cédula (PII)
- La cédula del cliente se cifra con AES en reposo (transformer de TypeORM).
- Para buscarla de forma única (e.g., prevenir duplicados), se guarda un HMAC en columna separada (`cedula_hash`).

### Versionado de Términos y Condiciones
- Los clientes, conductores y cooperativas deben aceptar la versión vigente de los T&C al registrarse.
- La versión aceptada y la fecha quedan registradas en `user.terms_version` y `user.terms_accepted_at`.

### Rate limiting global
- 60 req/min por IP para todos los endpoints.
- 3 req/min adicionales para endpoints de solicitud de OTP.

### Auditoría global
- `AuditInterceptor` registra todas las peticiones autenticadas.

---

## 8. Notificaciones Push (FCM)

El servicio `NotificationsService` persiste cada notificación en la tabla `app_notifications` (feed consultable) y además envía el push FCM de forma asíncrona (fire-and-forget). Si el token FCM es inválido, se limpia automáticamente de la BD.

### Eventos que disparan notificaciones push

| Evento | Destinatario | Contenido |
|---|---|---|
| Viaje aceptado | Cliente | "¡Tu taxi está en camino!" |
| Conductor llegó al punto de recogida | Cliente | "¡Tu taxi llegó! Tienes 5 minutos. Código: XXXX" |
| Nuevo despacho desde parada | Primer conductor en cola | "¡Te toca! Nuevo viaje desde tu parada" |
| Solicitud de recarga enviada | Finance staff (todos) | "Nueva solicitud de recarga de $X" |
| Conductor aprobado | (WS, no push directo) | — |
| Documento de cooperativa aprobado/rechazado | Admin de cooperativa | Email vía Brevo |
| Nueva cooperativa registrada | Platform admins | Push + notificación en feed |
| Nuevo documento de cooperativa subido | Platform admins | Push + notificación en feed |

---

## 9. WebSocket Events (Socket.IO)

El gateway usa un namespace raíz (`/`). La autenticación se realiza con el JWT en `socket.handshake.auth.token` o en el header `Authorization`.

### Salas (Rooms)

| Sala | Descripción |
|---|---|
| `user:<userId>` | Sala personal de cada usuario |
| `driver:<driverId>` | Sala personal del conductor (por driver.id, no user.id) |
| `trip:<tripId>` | Sala del viaje en curso (cliente se une via `trip.subscribe`) |
| `coop:<coopId>` | Sala de toda la cooperativa (staff + conductores activos en ella) |
| `platform` | Staff de plataforma |
| `available_drivers` | Conductores disponibles (para broadcast de viajes de clientes app) |
| `conv:<conversationId>` | Sala de chat de una conversación |

### Eventos emitidos por el servidor al cliente

| Evento | Sala destino | Descripción |
|---|---|---|
| `trip.new` | `available_drivers` o `coop:<id>` | Nuevo viaje disponible |
| `trip.accepted` | `trip:<id>`, `user:<clientId>`, `driver:<driverId>`, `coop:<id>` | Viaje aceptado. Solo el cliente recibe el `otp_code`. |
| `trip.new_offer` | `user:<clientId>` | Nueva oferta de conductor (NEGOTIATED) |
| `trip.offer_accepted` | `driver:<driverId>` | El cliente seleccionó tu oferta |
| `trip.offer_rejected` | `driver:<driverId>` | Tu oferta fue rechazada |
| `trip.driver_arrived` | `trip:<id>`, `user:<clientId>` | Conductor llegó al punto de recogida |
| `trip.client_ready` | `driver:<driverId>` | El cliente confirmó que viene en camino |
| `trip.started` | `trip:<id>` | Viaje iniciado |
| `trip.meter_update` | `trip:<id>` | Actualización del taxímetro (monto, velocidad, is_stopped) |
| `trip.rerouted` | `trip:<id>` | El conductor se desvió, nueva ruta calculada |
| `trip.completed` | `trip:<id>` | Viaje completado con tarifa y comisión |
| `trip.cancelled` | `trip:<id>` | Viaje cancelado |
| `trip.radius_expanded` | `trip:<id>` | Radio de búsqueda expandido (scheduler) |
| `trip.wait_expired` | `trip:<id>`, `user:<clientId>` | Los 5 minutos de espera vencieron |
| `driver.location` | `trip:<id>`, `coop:<id>`, `platform` | Posición GPS del conductor en tiempo real |
| `driver.deviation` | `coop:<id>` | Conductor se desvió de la ruta |
| `driver.approved` | `driver:<driverId>` | La plataforma aprobó al conductor |
| `client.location` | `driver:<driverId>` | Posición del cliente mientras espera al taxi |
| `chat.message` | `conv:<conversationId>` | Nuevo mensaje de chat |

### Eventos enviados del cliente al servidor

| Evento | Quien lo envía | Descripción |
|---|---|---|
| `location.update` | driver | Actualiza GPS del conductor. Actualiza taxímetro si hay viaje activo. |
| `client.location.update` | client | Envía posición del cliente al conductor durante la espera |
| `trip.subscribe` | client | Entra a la sala del viaje para recibir actualizaciones |
| `trip.unsubscribe` | client | Sale de la sala del viaje |
| `chat.join` | cualquier usuario | Entra a la sala de una conversación |
| `chat.leave` | cualquier usuario | Sale de la sala de una conversación |

---

## 10. Apps Móviles

### 10.1 App Conductor (`/mobile/driver/`) — Flutter + Riverpod

**Pantallas y flujos:**

| Ruta | Pantalla | Descripción |
|---|---|---|
| `/splash` | SplashPage | Verifica token almacenado y redirige |
| `/auth/welcome` | WelcomePage | Bienvenida con opciones de login/registro |
| `/auth/login` | LoginPage | Ingresa teléfono para solicitar OTP |
| `/auth/register` | RegisterPage | Formulario de registro (nombre, licencia, teléfono, tipo conductor, T&C) |
| `/auth/otp` | OtpPage | Verifica código OTP de 6 dígitos |
| `/auth/onboarding` | OnboardingPage | Tutorial post-registro |
| `/home` | HomePage (shell) | Mapa con viajes disponibles en tiempo real. Acepta/rechaza viajes. Muestra estado online/offline. |
| `/trip/:tripId` | TripActivePage | Pantalla de viaje activo: navegación, OTP, taxímetro, botones de llegada/inicio/completar |
| `/vehicles` | MyVehiclesPage | Lista de taxis del dueño (OWNER_DRIVER) |
| `/vehicles/register` | RegisterVehiclePage | Registra nuevo vehículo |
| `/vehicles/:id/documents` | VehicleDocumentsPage | Sube y gestiona documentos del vehículo |
| `/vehicle-requests` | VehicleRequestsPage | Bolsa de trabajo para conductores DRIVER (solicitudes de taxis disponibles) |
| `/owner-requests` | OwnerJobRequestsPage | Solicitudes publicadas por el dueño |
| `/owner-requests/:id/applicants` | OwnerApplicantsPage | Postulantes a una solicitud |
| `/cooperatives/join` | JoinCooperativePage | Solicitud de membresía a cooperativa (OWNER_DRIVER) |
| `/documents` | DocumentsPage | Sube y gestiona documentos del conductor |
| `/chat` | ChatListPage | Lista de conversaciones activas |
| `/chat/:conversationId` | ChatConversationPage | Conversación individual en tiempo real |
| `/wallet` | WalletPage | Balance, historial de transacciones, solicitar recarga con comprobante |
| `/profile` | ProfilePage | Perfil, estado online, cooperativas, inicio/fin de jornada |

**Bottom navigation dinámica:** El tab de "Mis taxis" / "Empleos" cambia según si el conductor es OWNER_DRIVER o DRIVER.

### 10.2 App Cliente (`/mobile/clientes/`) — Flutter + Riverpod

**Pantallas y flujos:**

| Ruta | Pantalla | Descripción |
|---|---|---|
| `/` | WelcomePage | Bienvenida con opciones de login/registro |
| `/register` | RegisterPage | Registro con nombre, cédula y teléfono |
| `/otp` | OtpPage | Verifica OTP (modo registro o modo login) |
| `/home` | HomePage | Mapa con botón para pedir taxi. Muestra viaje activo si existe. |
| `/request-trip` | RequestTripPage | Selecciona origen y destino, elige modo de tarifa (METER o NEGOTIATED), ve estimado de precio |
| `/trip/:id` | ActiveTripPage | Seguimiento en tiempo real del viaje: posición del conductor, OTP visible, estado del taxímetro, opciones de cancelar |
| `/my-trips` | MyTripsPage | Historial de viajes completados y cancelados |
| `/profile` | ProfilePage | Editar perfil, gestionar contactos de emergencia |

---

## Apéndice: Variables de Entorno Requeridas

| Variable | Descripción |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión MySQL |
| `JWT_SECRET` | Secreto para access tokens |
| `JWT_REFRESH_SECRET` | Secreto para refresh tokens |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Duración de tokens |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE` | SMS OTP |
| `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`, `BREVO_FROM` | Email OTP y notificaciones |
| `FCM_SERVICE_ACCOUNT_PATH` | Ruta al JSON de Firebase Admin SDK |
| `REDIS_URL` | Redis para adaptador Socket.IO horizontal (opcional) |
| `ALLOWED_ORIGINS` | CORS (lista separada por comas) |
| `NODE_ENV` | `production` para deshabilitar modos de desarrollo (OTP bypass, dev_code en respuesta, synchronize TypeORM) |
| Cloudflare R2 | Configuración de bucket S3-compatible en `StorageService` |
| Mapbox/OSRM | API key para cálculo de rutas en `FareService` |
