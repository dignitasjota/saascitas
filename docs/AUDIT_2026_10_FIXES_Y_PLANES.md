# Auditoría, correcciones y planes — octubre 2026

**PRs:** #1 `fix/auditoria-oct-2026` (25 commits, un fix por commit) y #2 `fix/frontend-public-dir`, ambas mergeadas en `main`. **197 tests unitarios y 10 de integración en verde**, `tsc` limpio, `next build` OK y `prisma migrate diff` sin drift. Pruebas end-to-end: 23/23 sobre los fixes y 15/15 sobre el ciclo de la prueba gratuita.

Es la segunda auditoría en profundidad, después de [la de julio](AUDIT_2026_07_HARDENING.md). Aquí se resume **qué cambió y por qué**. El detalle está en los mensajes de commit.

## Requisitos de despliegue

- **Migraciones nuevas**, que el contenedor del backend aplica al arrancar con `prisma migrate deploy`:
  | Migración | Qué hace |
  |---|---|
  | `20261017090000_backfill_employee_services` | Vincula los servicios activos a los empleados activos que no tenían ninguno |
  | `20261017091000_user_email_unique_active` | Email único global, sin distinguir mayúsculas, solo entre usuarios no borrados (sustituye a `users_email_tenant_id_key`). Si ya hay duplicados, emite un `WARNING` y no crea el índice: hay que limpiarlos y volver a crearlo |
  | `20261017092000_user_role_superadmin` | Añade `superadmin` al enum `UserRole`, que ninguna migración creaba |
  | `20261017100000_trial_professional` | Añade la columna `trial_reminder_sent_at` y pasa las pruebas en curso (sin suscripción y sin caducar) al plan Profesional con 5 empleados |
- **Variables de entorno.** El deploy no las inyecta: el compose de producción las lee del `.env` del servidor (`/srv/saascitas`).
  - `FRONTEND_URL`: obligatoria. Los enlaces de los emails se construyen con ella (antes se usaba `APP_URL`, que no existía).
  - `MAIL_FROM`: por defecto `noreply@rutapro.es`. Si está definida en el `.env`, manda sobre el valor por defecto.
  - `MAIL_SECURE`: por defecto `true` en el compose de producción. Fuera de él, `true` si el puerto es 465.
  - `TRUST_PROXY`: por defecto `1` (un salto, nginx).
  - `STRIPE_PRICE_PROFESSIONAL` se escribe con doble S. En los secretos del repo existe `STRIPE_PRICE_PROFESIONAL`; si el `.env` usa ese nombre, el precio del plan Profesional no se encuentra.
- **Correo:** configurar SPF y DKIM de `rutapro.es` para el remitente `noreply@`.
- **GitHub Actions:** falta el secreto `DEPLOY_SSH_KEY`. Las imágenes se construyen y se suben a GHCR, pero el paso de despliegue por SSH falla. Ningún despliegue automático ha funcionado todavía.

## Planes y prueba gratuita

Los límites viven en `backend/src/common/constants/plans.ts` y se comparten con el panel de admin.

| Plan | Precio | Empleados activos | Citas al mes |
|---|---|---|---|
| Básico | 0 € | 1 | 100 |
| Profesional | 29 € | 5 | ilimitadas |
| Business | 79 € | 20 (para más, contacto con `info@rutapro.es`) | ilimitadas |

- **Cuota de citas** (`common/utils/plan-limits.ts`): se cuenta por mes natural en la zona horaria del negocio y las canceladas no cuentan.
  - En el panel, crear una cita o moverla de mes por encima del límite devuelve 403.
  - En la reserva pública, al llegar al límite no se ofrecen huecos y `createBooking` devuelve 409 con un mensaje para el cliente.
  - La página de facturación muestra el uso (X / 100) y avisa al llegar al tope.
- **Límite de empleados:** solo cuentan los activos. Reactivar a un empleado comprueba que quede hueco.
- **Prueba de 14 días** (`TRIAL_DAYS`): el registro crea el negocio en el plan Profesional con estado `trialing`, sin tarjeta. El módulo `trials/` ejecuta un job BullMQ cada hora (`trials-hourly`, `0 * * * *`):
  - **Aviso:** 3 días antes del fin (`TRIAL_REMINDER_DAYS`) envía el email `trial-ending`. Primero reserva el envío en `trial_reminder_sent_at` y lo libera si falla.
  - **Fin de la prueba:** si el negocio no se ha suscrito, pasa a Básico (`active`, 1 empleado) en una transacción con actualización condicional. Mantiene activo el empleado del owner, o el más antiguo, y desactiva el resto sin borrar nada. Después envía el email `trial-ended`.
  - Las suscripciones de pago (`stripeSubscriptionId`) las gestiona Stripe y el job nunca las toca. El job es idempotente.
  - Durante la prueba se puede contratar el plan Profesional desde la página de facturación.

## Bugs corregidos

### Funcionalidad rota
- **Reserva online sin profesionales:** no había forma de asignar servicios a los empleados.
  - Se añade `PUT /employees/:id/services` y un diálogo en la página de Empleados.
  - Los empleados nuevos se vinculan a todos los servicios activos, y los servicios nuevos a todos los empleados activos.
  - Una migración rellena los datos existentes.
- **Enlaces de confirmar y cancelar de los emails daban 404:** se crean las páginas públicas `/cita/confirmar/[token]` y `/cita/cancelar/[token]`. La de cancelar pide confirmación antes.
- **Envío de emails en producción:** el puerto 465 se usaba sin TLS (`MAIL_SECURE`).
- **Emails con la hora en UTC:** ahora usan la zona horaria del negocio. El asunto distingue "Cita registrada" de "Cita confirmada".
- **Gestión de estados de citas:** no existía. Ahora se puede confirmar, empezar, completar y cancelar desde el calendario, el listado y el panel (`AppointmentDetailDialog`).
- **Nueva cita sin servicio fallaba:** se añade un selector de duración. El panel usaba la zona horaria del navegador y ahora usa la del negocio.
- **Rol `superadmin`:** el valor no existía en el enum de Postgres.

### Seguridad
- **Rate limit compartido por todos los usuarios** detrás de nginx: faltaba `trust proxy`. Además, el webhook de Stripe queda fuera del throttler.
- **Un técnico podía gestionar la suscripción:** el checkout y el portal pasan a `@Roles('owner')`, y el estado a owner/admin.
- **Detección de reutilización del refresh token:** nunca saltaba. Ahora:
  - El token se reclama de forma atómica y, si se reutiliza, se revoca toda la familia.
  - Hay 15 s de gracia, solo si existe un sucesor vivo.
  - Se comprueba que el usuario no esté borrado ni bloqueado y que el tenant siga vivo.
  - `logout` revoca la familia completa.
  - Cambiar la contraseña revoca las demás sesiones.
  - El token de reset de contraseña es de un solo uso (`GETDEL`).
- **Email de usuario único en toda la plataforma:** antes era único por tenant y el login era ambiguo. Un duplicado devuelve 409, no 500.
- **La reserva pública revelaba el nombre del cliente** asociado a un teléfono. Ahora solo devuelve los datos que envía el visitante, y el email solo se rellena si faltaba.
- **Validación de entrada:**
  - DTOs para todos los query params, `ParseUUIDPipe` en los ids y paginación limitada a 100.
  - Rango del calendario de 93 días como máximo y métricas de 1 a 366 días.
  - Formato `YYYY-MM-DD` y `HH:MM` en la reserva y zona horaria IANA validada (`@IsTimeZone`).

### Correctitud
- **Carreras en los cambios de estado** descontaban dos veces las estadísticas del cliente. Se resuelve con compare-and-set (`updateMany` filtrando por estado) en el panel y en la reserva pública. El cliente solo puede cancelar citas pendientes o confirmadas que aún no han pasado.
- **Disponibilidad:** ignoraba las citas que empiezan el día anterior. El solape se calcula ahora teniendo en cuenta el buffer.
- **Métricas:** agrupaban por día y mes en UTC. Ahora usan la zona horaria del negocio y rangos semiabiertos.
- **Editar un cliente** con un teléfono ya usado daba 500. Ahora devuelve 409.
- **Facturación:**
  - `currentPeriodEnd` se lee de `items.data[0]`: con la API `2026-02-25.clover` el campo ya no está en la suscripción.
  - Se ignoran los eventos de una suscripción que ya no es la actual.
- **Menú lateral:** se filtra según el rol.

### Infraestructura
- **Imagen Docker del frontend:** el build fallaba porque `frontend/public/` estaba vacío y no se versionaba. Se añade `.gitkeep` (PR #2).

## Pendiente

- Añadir el secreto `DEPLOY_SSH_KEY` y relanzar el despliegue.
- Las bajadas de plan desde el portal de Stripe no desactivan a los empleados que sobran, a diferencia del fin de la prueba.
- Probar de verdad el envío por SMTP y las llamadas a Stripe; en las pruebas estaban simulados.
- Las pruebas que ya estén caducadas al desplegar pasan a Básico en la primera ejecución del job y también reciben el email `trial-ended`. Si alguna caducó hace mucho, conviene tenerlo en cuenta.
