# BUILD REPORT — EnlacePro (versión desplegable)

Fecha: 2026-10-09
Ubicación: `~/workspace/enlacepro-deploy/`

## Qué se construyó

Reimplementación completa y autocontenida de la aplicación SaaS **EnlacePro** como
código desplegable (Node.js + Express + PostgreSQL + Stripe), desde cero según la
especificación. Todo el texto de la interfaz está en español latinoamericano.

**Stack:** Express 4, EJS (vistas en servidor), `pg`, `bcrypt`, `express-session`
con almacenamiento de sesiones en PostgreSQL (`connect-pg-simple`), SDK oficial
de `stripe`. Un solo servicio web.

**Funciones implementadas:**
1. **Landing** en español: héroe, "cómo funciona", características y sección de
   precios con interruptor mensual/anual (Básico $10/mes o $90/año; VIP $20/mes o
   $180/año, 25% de descuento anual).
2. **Auth:** registro/inicio de sesión con correo + contraseña (bcrypt, 10 rondas),
   sesiones. La **primera cuenta registrada queda como administradora**
   automáticamente (no se menciona en ninguna parte pública; la UI de admin solo
   se muestra con rol admin).
3. **Panel de usuario:** editar perfil (foto por URL, nombre, bio, slug),
   gestionar enlaces (agregar/editar/eliminar/reordenar: título + URL) y elegir
   entre 4 estilos visuales (los estilos 3 y 4 bloqueados para no-VIP).
4. **Páginas públicas** en `/:slug` con los 4 estilos.
5. **Planes y Stripe:** Checkout de suscripciones (mensual/anual), portal de
   facturación para gestionar/cancelar ("cancela cuando quieras"), webhook
   `/webhooks/stripe` con verificación de firma: activa en
   `checkout.session.completed`, sincroniza en `customer.subscription.updated`,
   desactiva en `customer.subscription.deleted`. Sin claves de Stripe, los
   planes se muestran con aviso claro de **"pagos no configurados"** y el
   checkout queda desactivado. Con claves `sk_test`, se muestra el banner
   "Modo de prueba".
6. **Referidos con puntos:** texto "gana puntos con los referidos". Flujo:
   el usuario toca "Solicitar código de referido" → el admin ve solicitudes
   pendientes → aprueba y asigna un código (personalizado o autogenerado
   `REF-XXXXXX`). Enlace `/r/CODIGO`. Los puntos (configurables, 100 por
   defecto) se acreditan al referente **solo** tras `invoice.payment_succeeded`
   con `billing_reason = subscription_create`, de forma idempotente
   (`UNIQUE(stripe_subscription_id)` + bandera `points_awarded` + transacción).
   Nunca se acreditan en activaciones simuladas. El usuario ve su saldo; el
   admin ve todos los puntos.
7. **Panel admin** (protegido por rol en cada ruta): resumen (usuarios totales,
   suscripciones activas, ingreso mensual estimado, solicitudes pendientes),
   lista de usuarios con gestión de planes, referidos (solicitudes, historial,
   puntos por usuario) y ajuste de puntos por referido.
8. **Seguridad:** contraseñas con hash, consultas parametrizadas en todo el
   código, verificación de firma del webhook, `requireAdmin` en cada ruta
   `/admin/*`, slugs validados contra lista de reservados.

**Archivos de despliegue:** `.env.example` (todas las variables, sin secretos),
`render.yaml` (servicio web + PostgreSQL gestionado), `DEPLOY.md` (pasos
numerados en español: local, Stripe, Render, paso a producción) y `.gitignore`.

## Cómo correrlo localmente

```bash
cd ~/workspace/enlacepro-deploy
cp .env.example .env   # completar DATABASE_URL y SESSION_SECRET
createdb enlacepro      # con PostgreSQL instalado
npm install
npm start               # http://localhost:3000
```

## Verificación realizada

- `node --check` en los 12 archivos JS: OK.
- Las 18 plantillas EJS compilan: OK.
- Arranque sin `DATABASE_URL`/`SESSION_SECRET`: falla con mensaje claro en español.
- Suite de integración (servidor real + base de datos en memoria): **23/23
  pruebas pasaron**, incluyendo registro (primer usuario = admin), login,
  bloqueo 403 a no-admin, CRUD de enlaces, perfil público, solicitud/aprobación
  de referido con código personalizado, `/r/CODIGO`, estilos VIP bloqueados,
  aviso "pagos no configurados", webhook 400 sin secreto, 404 y banner de modo
  de prueba.
- Webhook: firma válida aceptada (falla después solo por clave Stripe falsa, como
  se esperaba), firma inválida rechazada con 400.

## Lo que no se pudo implementar / limitaciones

- **Sin PostgreSQL real disponible** en este entorno: la integración se probó
  con una base en memoria (pg-mem). En PostgreSQL real todo el SQL usado es
  estándar; el esquema se crea solo al arrancar (`CREATE TABLE IF NOT EXISTS`).
- **Flujo de pago real no probado de extremo a extremo**: requiere claves
  reales de Stripe y un endpoint público para el webhook (ver DEPLOY.md paso 2
  y 4; para local se usa `stripe listen`).
- **Los puntos no tienen canje**: la especificación solo pedía acumularlos y
  mostrarlos. Canjear puntos por descuentos/meses gratis sería una función
  adicional.
- **Sin verificación de correo ni recuperación de contraseña**: no estaban en
  la especificación.
- **Foto de perfil por URL** (no hay subida de archivos), según especificación.
- Los estilos visuales de la página pública son 4 variantes de color/fondo;
  el editor muestra vistas previas simplificadas.
