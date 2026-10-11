// Middlewares de autenticación y autorización.
const { pool } = require('./db');

function setFlash(req, type, msg) {
  if (req.session) req.session.flash = { type, msg };
}

async function loadUser(req, res, next) {
  res.locals.user = null;
  try {
    if (req.session && req.session.userId) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.session.userId]);
      if (rows[0]) {
        req.user = rows[0];
        res.locals.user = rows[0];
      } else {
        delete req.session.userId;
      }
    }
  } catch (e) {
    return next(e);
  }
  const flash = req.session ? req.session.flash : null;
  if (req.session) delete req.session.flash;
  res.locals.flash = flash || null;
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) {
    setFlash(req, 'error', 'Inicia sesión para continuar.');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    setFlash(req, 'error', 'Inicia sesión para continuar.');
    return res.redirect('/login');
  }
  if (req.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Sin acceso',
      message: 'No tienes permiso para ver esta página.',
    });
  }
  next();
}

function isVip(user) {
  return !!user && (user.plan === 'vip' || user.role === 'admin');
}

module.exports = { setFlash, loadUser, requireLogin, requireAdmin, isVip };
