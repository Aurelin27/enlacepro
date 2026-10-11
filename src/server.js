require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool, initSchema } = require('./db');
const { loadUser, requireLogin, requireAdmin } = require('./middleware');
const { stripeConfigured, isTestMode } = require('./stripe');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en las variables de entorno. Copia .env.example a .env y complétalo.');
  process.exit(1);
}
if (!process.env.SESSION_SECRET) {
  console.error('Falta SESSION_SECRET en las variables de entorno.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Detrás de un proxy (Vercel/Render): necesario para cookies seguras.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// El webhook de Stripe necesita el cuerpo sin procesar: se registra antes de los demás parsers.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), require('./routes/webhook'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Valores por defecto para las vistas (antes de la sesión, por si esta falla).
app.use((req, res, next) => {
  res.locals.user = null;
  res.locals.flash = null;
  res.locals.title = '';
  res.locals.stripeConfigured = stripeConfigured();
  res.locals.stripeTestMode = isTestMode();
  next();
});

app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 3600 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

app.use(loadUser);
app.use((req, res, next) => {
  res.locals.stripeConfigured = stripeConfigured();
  res.locals.stripeTestMode = isTestMode();
  next();
});
app.use('/dashboard', requireLogin, require('./routes/dashboard'));
app.use('/referidos', requireLogin, require('./routes/referrals'));
app.use('/admin', requireAdmin, require('./routes/admin'));
app.use('/', require('./routes/billing')); // /planes, /billing/*
app.use('/', require('./routes/public'));  // /, /login, /register, /r/:code, /:slug (al final)

app.use((req, res) => res.status(404).render('error', {
  title: 'No encontrado',
  message: 'Esta página no existe.',
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  });
});

const PORT = process.env.PORT || 3000;
// La inicialización de la BD corre al importar el módulo (también en serverless).
// Solo se escucha el puerto cuando se ejecuta directamente con `node src/server.js`.
const ready = initSchema().catch((e) => {
  console.error('No se pudo iniciar la base de datos:', e.message);
});

if (require.main === module) {
  ready.then(() => app.listen(PORT, () => console.log(`EnlacePro listo en http://localhost:${PORT}`)));
}

module.exports = app;
module.exports.ready = ready;
