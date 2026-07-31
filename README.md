# Pana Taxi

Plataforma integral de movilidad para cooperativas de taxi legales en Ecuador. Solo taxis verificados, GPS en tiempo real, botón SOS y gestión digital completa.

---

## Estructura del monorepo

```
pana-taxi/
├── back/        # API REST + WebSockets — NestJS + TypeORM + MySQL
├── front/       # Dashboard web (cooperativas y plataforma) — Next.js 15
└── mobile/      # Apps móviles — Flutter
    ├── driver/  # App taxista
    └── client/  # App pasajero
```

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | NestJS, TypeORM, MySQL, Socket.IO, Cloudflare R2 |
| Dashboard web | Next.js 15 (App Router), Tailwind CSS |
| Apps móviles | Flutter (Android + iOS) |
| Autenticación | JWT + OTP (SMS/email) |
| Tiempo real | Socket.IO (WebSockets) |
| Notificaciones push | Firebase Cloud Messaging (FCM) |
| Almacenamiento | Cloudflare R2 (documentos y archivos) |

---

## Apps móviles — Flutter

### App Taxista (`mobile/driver`)

**Objetivo:** que el conductor gestione su jornada laboral desde el celular.

**Pantallas principales:**
- Login con OTP por teléfono
- Inicio / estado del turno (iniciar/cerrar día)
- Mapa con viajes disponibles en tiempo real
- Aceptar/rechazar viaje
- Navegación al pasajero → confirmar llegada → iniciar viaje → completar
- OTP del pasajero para confirmar abordaje
- Historial de viajes
- Calificaciones recibidas
- Botón SOS
- Wallet y balance de comisiones

**Flujo de un viaje (driver):**
```
Viaje nuevo  →  Aceptar  →  En camino al pasajero
     ↓
Llegué (driver_arrived)  →  Pasajero ingresa OTP
     ↓
Viaje en curso (GPS activo + metro)  →  Completar
     ↓
Calificar pasajero
```

### App Pasajero (`mobile/client`)

**Objetivo:** que el cliente solicite y siga su taxi de forma segura.

**Pantallas principales:**
- Registro con OTP por teléfono
- Mapa para seleccionar origen y destino
- Estimado de tarifa
- Solicitar viaje
- Espera: ver conductor en mapa en tiempo real
- OTP de abordaje (lo muestra el cliente, lo ingresa el driver)
- Viaje en curso: seguimiento GPS
- Botón SOS durante el viaje
- Historial de viajes
- Calificar conductor
- Métodos de pago / wallet

**Flujo de un viaje (client):**
```
Seleccionar destino  →  Ver estimado  →  Solicitar
     ↓
Esperar conductor  →  Ver taxi en mapa
     ↓
Conductor llegó  →  Mostrar OTP al conductor
     ↓
Viaje en curso (GPS)  →  Llegamos  →  Calificar
```

---

## API — Endpoints usados por las apps móviles

### Autenticación
| Método | Endpoint | Uso |
|---|---|---|
| POST | `/auth/otp/request` | Pedir código SMS |
| POST | `/auth/otp/verify` | Verificar OTP → token |
| POST | `/auth/register/client` | Registro nuevo cliente |
| POST | `/auth/refresh` | Renovar token |
| GET | `/auth/me` | Perfil del usuario |
| POST | `/auth/logout` | Cerrar sesión |

### Driver
| Método | Endpoint | Uso |
|---|---|---|
| POST | `/drivers/register` | Registro conductor |
| GET | `/drivers/me` | Perfil del conductor |
| PATCH | `/drivers/me/status` | Cambiar estado (online/offline/busy) |
| PATCH | `/drivers/me/location` | Enviar ubicación (polling fallback) |
| POST | `/drivers/me/start-day` | Iniciar turno |
| POST | `/drivers/me/end-day` | Cerrar turno |
| POST | `/drivers/me/cooperatives` | Solicitar unirse a cooperativa |
| GET | `/drivers/me/cooperatives` | Ver mis cooperativas |

### Viajes
| Método | Endpoint | Uso |
|---|---|---|
| POST | `/trips` | Cliente solicita viaje |
| GET | `/trips/me` | Mis viajes (cliente) |
| GET | `/trips/me/active` | Viaje activo del cliente |
| GET | `/trips/driver/me` | Viajes del conductor |
| GET | `/trips/driver/me/active` | Viaje activo del conductor |
| PATCH | `/trips/:id/accept` | Driver acepta viaje |
| PATCH | `/trips/:id/arrived` | Driver llegó al punto de recogida |
| PATCH | `/trips/:id/start` | Driver inicia viaje (con OTP del cliente) |
| PATCH | `/trips/:id/complete` | Driver completa viaje |
| PATCH | `/trips/:id/cancel` | Cancelar viaje (cliente o driver) |
| PATCH | `/trips/:id/client-ready` | Cliente confirmó abordaje |

### Tarifas y paradas
| Método | Endpoint | Uso |
|---|---|---|
| GET | `/fare/estimate` | Estimar costo antes de pedir |
| GET | `/stands` | Listar paradas cercanas |
| POST | `/stands/check-in` | Driver hace check-in en parada |
| POST | `/stands/check-out` | Driver sale de parada |
| GET | `/stands/:id/queue` | Ver cola de la parada |

### Calificaciones
| Método | Endpoint | Uso |
|---|---|---|
| POST | `/ratings` | Enviar calificación |
| GET | `/ratings/drivers/:driverId` | Ver calificaciones de un driver |
| GET | `/ratings/clients/:clientId` | Ver calificaciones de un cliente |

### Wallet
| Método | Endpoint | Uso |
|---|---|---|
| GET | `/wallet/me` | Balance del usuario |
| GET | `/wallet/me/transactions` | Historial de movimientos |

### Notificaciones
| Método | Endpoint | Uso |
|---|---|---|
| POST | `/notifications/token` | Registrar token FCM |
| DELETE | `/notifications/token` | Eliminar token FCM |
| GET | `/notifications/me` | Mis notificaciones |
| GET | `/notifications/me/unread-count` | Contador no leídas |
| PATCH | `/notifications/:id/read` | Marcar leída |
| PATCH | `/notifications/read-all` | Marcar todas leídas |

### SOS
| Método | Endpoint | Uso |
|---|---|---|
| POST | `/sos` | Activar botón SOS |

---

## WebSockets — Eventos en tiempo real

Conexión: `ws://API_URL?token=JWT`

### Driver emite
| Evento | Datos | Descripción |
|---|---|---|
| `location.update` | `{ lat, lng, heading, speed }` | Posición del conductor (cada 3s) |
| `trip.subscribe` | `{ trip_id }` | Unirse a sala del viaje |
| `trip.unsubscribe` | `{ trip_id }` | Salir de sala del viaje |

### Client emite
| Evento | Datos | Descripción |
|---|---|---|
| `client.location.update` | `{ lat, lng }` | Posición del cliente durante espera |
| `trip.subscribe` | `{ trip_id }` | Unirse a sala del viaje |

### Server emite al driver
| Evento | Datos | Descripción |
|---|---|---|
| `trip.new` | `{ trip }` | Nuevo viaje disponible |
| `client.location` | `{ lat, lng }` | Posición del cliente |

### Server emite al client
| Evento | Datos | Descripción |
|---|---|---|
| `driver.location` | `{ lat, lng, heading }` | Posición del conductor |
| `trip.meter_update` | `{ distance, fare }` | Actualización del taxímetro |
| `trip.rerouted` | `{ new_route }` | Ruta recalculada |
| `trip.accepted` | `{ driver }` | Conductor aceptó el viaje |
| `trip.driver_arrived` | — | Conductor llegó |
| `trip.started` | — | Viaje iniciado |
| `trip.completed` | `{ fare, distance }` | Viaje completado |
| `trip.cancelled` | `{ reason }` | Viaje cancelado |

---

## Lo que falta en el backend para las apps

### Pendiente de implementar
- [ ] Endpoint `GET /trips/available` (para que driver vea viajes sin aceptar en su zona)
- [ ] Push notifications via FCM cuando llega `trip.new` (app en segundo plano)
- [ ] Endpoint de OTP de abordaje: el backend ya maneja `start` con OTP pero hay que validar que el código venga del cliente correcto
- [ ] Deep linking para abrir la app desde una notificación push
- [ ] `GET /fare/config` ya existe — confirmar que devuelve precio base, precio por km y precio por minuto

### A definir antes de empezar Flutter
- [ ] ¿El viaje se solicita a una cooperativa específica o al conductor más cercano?
- [ ] ¿Tiene modalidad de oferta (InDrive style) o tarifa fija?
- [ ] ¿El pago es solo en efectivo al inicio o también wallet/tarjeta?
- [ ] ¿La app del taxista incluye la vista de documentos para subir cédula y licencia?

---

## Configuración local

```bash
# Backend (puerto 3000 interno, 3002 expuesto)
cd back && docker compose up -d

# Dashboard web (puerto 3001)
cd front && npm run dev
```

Variables de entorno requeridas: ver `back/.env.example`
