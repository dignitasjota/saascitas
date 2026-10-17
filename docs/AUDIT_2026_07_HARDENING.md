# Auditoría y Hardening — julio 2026

**Rama:** `fix/bloqueantes-despliegue` · **135 tests unit + 10 integración verdes** · `tsc` limpio · `next build` OK · 5 migraciones aplican limpias desde cero.

Auditoría en profundidad del proyecto y corrección de los hallazgos. Este documento resume **qué cambió y por qué**; los detalles están en el historial de commits de la rama.

## Requisitos de despliegue

- Aplicar migraciones con `prisma migrate deploy` (rename de enum de plan, constraint de exclusión anti-solape, `stripe_events`, índice único parcial de teléfono).
- El **constraint de exclusión** `appointments_no_overlap` falla al aplicar si la BD ya contiene citas solapadas → limpiar antes.
- Definir `STRIPE_SECRET_KEY`, `REDIS_PASSWORD`, `JWT_SECRET`, etc. El compose de prod aborta si faltan las críticas (`${VAR:?}`).
- `rls.sql` (opcional) se aplica pasando la contraseña como variable: `psql "$DATABASE_URL" -v app_user_password="$APP_USER_PASSWORD" -f prisma/rls.sql`.

## Bloqueantes de despliegue

| Problema | Fix |
|---|---|
| Build de Next roto (prop `title` en icono lucide) | `<span title>` accesible |
| Colisión de rutas en `/` (landing vs agenda) | La agenda pasa a `/dashboard` |
| Reserva pública 404 en prod (`NEXT_PUBLIC_API_URL` indefinida) | Usa `BACKEND_URL` |
| Facturación rota: enum `business` (código) vs `premium` (BD) | Enum alineado a `business` (migración) + `mapStripeStatus` `suspended`→`paused` |

## Aislamiento multi-tenant

El RLS diseñado **no era operativo** (`SET LOCAL` fuera de transacción sobre un pool + usuario propietario que salta RLS). La única barrera eran los `where: { tenantId }` manuales.

Se añade la capa de defensa en profundidad: **contexto de tenant por request** (`AsyncLocalStorage`, `common/context/tenant-context.ts`) + **extensión de Prisma** (`common/prisma/tenant-extension.ts`) que inyecta el `tenantId` en toda operación sobre modelos tenant-scoped (`where` en reads/count/aggregate/`*Many`, post-filtro en `findUnique`, forzado del tenant en `create`). Superadmin en bypass; fail-open sin contexto (jobs, booking público, auth). Verificado con `tenant-guard.int-spec.ts` (10 casos contra Postgres). RLS queda como capa opcional en `prisma/rls.sql`.

## Seguridad

- **JWT revalidado en BD** en cada request (`jwt.strategy.ts`): usuario activo, rol actual de BD, tenant vivo. Un despido/degradación tiene efecto inmediato.
- **`@Roles`** en `customers` y `appointments` (export CSV y borrado → owner/admin).
- **Webhooks de Stripe idempotentes**: tabla `stripe_events` por `event.id`.
- **Cookies httpOnly**: los access/refresh tokens migran de `localStorage` a cookies `httpOnly` (`common/utils/auth-cookies.ts`, SameSite=Lax, Secure en prod). El backend setea/lee/limpia cookies; `JwtStrategy` extrae de cookie (fallback header); el frontend usa `withCredentials`, sin Authorization header, refresh con mutex. **Middleware server-side** (`middleware.ts`) protege rutas. Verificado end-to-end (incluido el proxy de Next).
- Filtro de excepciones: no filtra mensajes internos al cliente en prod.
- Política de contraseñas: `IsStrongPassword` (8+, mayúsculas/minúsculas/números).

## Correctitud de negocio

- **Anti-doble-reserva**: constraint de exclusión GiST `appointments_no_overlap` (`tstzrange`) — invariante central garantizada en BD, no solo en app. La violación (23P01) se traduce a `ConflictException`.
- `endsAt` se recalcula al reprogramar (antes quedaba corrupto).
- `bookingSettings` aplicados: `slotDurationMinutes`, `bufferMinutes`, `maxAdvanceDays`; la reserva valida horario laboral y que el empleado ofrezca el servicio.
- Clientes duplicados por teléfono: índice único parcial `(tenant_id, phone) WHERE deleted_at IS NULL` + manejo de carrera.
- Plan de Stripe derivado del `price` de la suscripción (no la metadata congelada).
- Recordatorios reprogramados al mover y cancelados al cancelar; no se envían para citas pasadas.
- Stats de cliente: `totalAppointments` se decrementa al cancelar; `totalSpentCents` se acumula al completar.
- **Timezones**: cálculo/visualización en la zona del negocio (`tenant.timezone`), backend y frontend. Helper propio con Intl/ICU.
- Calendario: solapamiento en vez de contención (citas de medianoche) y rango de horas dinámico. Métricas con rango semi-abierto. Paginación con tiebreaker por id.

## Infraestructura / DevOps

- **El build de imágenes Docker estaba roto**: `npm ci` dentro de cada workspace sin lockfile (monorepo hoisted) → nada se desplegaba. Corregido con `npm install --ignore-scripts` por workspace. Destapó: `date-fns` dependencia fantasma del backend; `prisma` movido a `dependencies` (lo eliminaba `npm prune`); `node dist/main` → `dist/src/main`; **backend conectaba a Redis sin contraseña**.
- CI reescrito para el monorepo + `next build`. **Deploy condicionado a un CI verde** (`workflow_run`).
- Contenedores no-root + HEALTHCHECK; hardening de nginx; variables críticas validadas.
- `npm audit fix` (nodemailer 6→9). 2 vulnerabilidades moderate restantes no accionables (postcss transitiva de next).
- `rls.sql` sin contraseña hardcodeada; `ssh-action` fijado por SHA.

## Frontend

- Refresh con mutex; guard de `/admin`; doble submit corregido; debounce en búsquedas; no pisar ediciones de horario.
- **Estado de error** (`ErrorState`) en las 14 páginas con queries.
- **Accesibilidad**: calendario por teclado (botones + `Dialog` con focus-trap/Escape); `<Label>` asociados a inputs en todos los formularios.

## Verificación

- Backend: `tsc`, 135 unit, 10 integración (aislamiento vs Postgres), migraciones limpias.
- Frontend: `tsc`, `next build`.
- End-to-end reales: cookies (backend + proxy Next), imagen Docker del backend (arranque + `/v1/health`), constraint de exclusión e índice de teléfono contra Postgres.

## Pendiente (no bloquea)

- Funcionalidades nuevas: portal de cliente, recordatorios WhatsApp/SMS, optimización de rutas por proximidad.
- 2 vulnerabilidades moderate (next/postcss) sin fix hacia adelante.
- Los precios reales configurados en Stripe deben coincidir con 0/29/79 € (landing, billing y MRR del admin ya alineados).
