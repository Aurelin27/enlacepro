# Desplegar EnlacePro

Guía paso a paso para poner EnlacePro en internet con cobros reales.

## 1. Probar en tu computadora

1. Instala **Node.js 18+** y **PostgreSQL** en tu computadora.
2. Crea la base de datos:
   ```sql
   CREATE DATABASE enlacepro;
   ```
   (En la terminal: `createdb enlacepro`)
3. Copia el archivo de ejemplo y complétalo:
   ```bash
   cp .env.example .env
   ```
   Edita `.env`: pon tu `DATABASE_URL` (ej. `postgres://tu_usuario:tu_password@localhost:5432/enlacepro`)
   y un `SESSION_SECRET` largo y aleatorio.
4. Instala y arranca:
   ```bash
   npm install
   npm start
   ```
5. Abre **http://localhost:3000** en tu navegador.
6. **Regístrate primero tú**: la primera cuenta creada queda automáticamente como **administradora** (con todo gratis).

> Sin claves de Stripe, la app funciona igual pero los botones de pago muestran
> "Pagos no configurados" y no se cobra nada.

## 2. Configurar Stripe (modo de prueba)

1. Crea tu cuenta gratis en **https://dashboard.stripe.com** (si no tienes).
2. Activa el **modo de prueba** (interruptor "Test mode" en el panel).
3. Ve a **Developers → API keys** y copia:
   - `Publishable key` → `STRIPE_PUBLISHABLE_KEY`
   - `Secret key` → `STRIPE_SECRET_KEY`
4. Crea los productos y precios en **Product catalog → Create product** (4 precios):
   - Básico mensual: **$10 USD / mes** (recurrente mensual)
   - Básico anual: **$90 USD / año** (recurrente anual)
   - VIP mensual: **$20 USD / mes** (recurrente mensual)
   - VIP anual: **$180 USD / año** (recurrente anual)
   - Copia cada **Price ID** (empiezan con `price_...`) a su variable:
     `STRIPE_PRICE_BASICO_MONTHLY`, `STRIPE_PRICE_BASICO_YEARLY`,
     `STRIPE_PRICE_VIP_MONTHLY`, `STRIPE_PRICE_VIP_YEARLY`.
5. Crea el webhook en **Developers → Webhooks → Add endpoint**:
   - URL: `https://tu-dominio.com/webhooks/stripe`
   - Eventos: `checkout.session.completed`, `invoice.payment_succeeded`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copia el **Signing secret** (empieza con `whsec_...`) a `STRIPE_WEBHOOK_SECRET`.
6. Para probar webhooks en tu computadora, instala la CLI de Stripe y corre:
   ```bash
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```
   Usa el `whsec_...` que te muestra la CLI como `STRIPE_WEBHOOK_SECRET`.

## 3. Publicar en Render (recomendado)

1. Sube este código a un repositorio de **GitHub**.
2. En **https://dashboard.render.com** crea una cuenta y pulsa **New → Blueprint**,
   conecta tu repositorio. El archivo `render.yaml` crea automáticamente:
   - el servicio web `enlacepro`
   - la base de datos `enlacepro-db` (PostgreSQL)
3. Cuando te pida las variables de entorno, completa tus claves de Stripe
   y los 4 Price IDs (las que marcaste `sync: false`).
4. Cambia `APP_URL` por tu dominio real (ej. `https://enlacepro.onrender.com`).
5. Pulsa **Apply** y espera el despliegue.
6. Actualiza la URL del webhook en Stripe con tu dominio real
   (`https://tu-dominio.onrender.com/webhooks/stripe`) y actualiza
   `STRIPE_WEBHOOK_SECRET` en Render si cambió.
7. Regístrate primero tú en la app publicada para estrenar la cuenta administradora.

## 4. Cobrar dinero real (salir del modo de prueba)

1. En Stripe, desactiva el modo de prueba (**Test mode OFF**).
2. Repite el paso 2 con las claves **reales** (empiezan con `pk_live` / `sk_live`)
   y crea los 4 precios reales + el webhook real.
3. Actualiza las variables de entorno en Render con los valores reales.
4. Render reinicia el servicio solo. ¡Listo para cobrar!

## Notas

- Los puntos de referidos se acreditan **solo** cuando Stripe confirma el primer
  pago (webhook `invoice.payment_succeeded`). En modo de prueba verás el aviso
  "Modo de prueba" en la parte superior.
- Los usuarios cancelan cuando quieran desde el portal de Stripe
  (botón "Gestionar mi suscripción").
- Nunca subas tu archivo `.env` a GitHub ni compartas tus claves secretas.
