// Rutas públicas: landing, registro, login, enlaces de referido y perfiles públicos.
const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { setFlash } = require('../middleware');
const { validSlug } = require('../util');
const { stripeConfigured, isTestMode } = require('../stripe');
const plans = require('../plans');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', { title: 'Todas tus redes en un solo enlace', plans });
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Iniciar sesión' });
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      setFlash(req, 'error', 'Correo o contraseña incorrectos.');
      return res.redirect('/login');
    }
    req.session.userId = user.id;
    setFlash(req, 'ok', '¡Bienvenido de nuevo!');
    res.redirect('/dashboard');
  } catch (e) { next(e); }
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { title: 'Crear cuenta', refCode: req.session.referralCode || null });
});

router.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const slug = String(req.body.slug || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim().slice(0, 80);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFlash(req, 'error', 'Escribe un correo válido.');
      return res.redirect('/register');
    }
    if (password.length < 6) {
      setFlash(req, 'error', 'La contraseña debe tener al menos 6 caracteres.');
      return res.redirect('/register');
    }
    if (!validSlug(slug)) {
      setFlash(req, 'error', 'Ese nombre de enlace no es válido o está reservado. Usa letras, números y guiones.');
      return res.redirect('/register');
    }
    const exists = await pool.query('SELECT id FROM users WHERE email=$1 OR slug=$2', [email, slug]);
    if (exists.rows[0]) {
      setFlash(req, 'error', 'Ese correo o nombre de enlace ya está en uso.');
      return res.redirect('/register');
    }

    // La primera cuenta registrada queda como administradora (no se anuncia en público).
    const count = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    const role = count.rows[0].c === 0 ? 'admin' : 'user';

    let referredBy = null;
    const refCode = req.session.referralCode;
    if (refCode) {
      const r = await pool.query('SELECT id FROM users WHERE referral_code=$1 AND referral_approved=true', [refCode]);
      if (r.rows[0]) referredBy = r.rows[0].id;
    }

    const hash = await bcrypt.hash(password, 10);
    const ins = await pool.query(
      'INSERT INTO users(email, password_hash, name, slug, role, referred_by_user_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [email, hash, name || slug, slug, role, referredBy]
    );
    delete req.session.referralCode;
    req.session.userId = ins.rows[0].id;
    setFlash(req, 'ok', '¡Cuenta creada! Completa tu perfil.');
    res.redirect('/dashboard/perfil');
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Enlace de referido: /r/CODIGO
router.get('/r/:code', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM users WHERE referral_code=$1 AND referral_approved=true',
      [req.params.code]
    );
    if (!rows[0]) {
      return res.status(404).render('error', { title: 'No encontrado', message: 'Ese código de referido no existe.' });
    }
    req.session.referralCode = req.params.code;
    setFlash(req, 'ok', '¡Gana puntos con los referidos! Crea tu cuenta para empezar.');
    res.redirect('/register');
  } catch (e) { next(e); }
});

// Perfil público: /:slug (esta ruta va al final para no tapar las demás)
router.get('/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE slug=$1', [req.params.slug]);
    const profileUser = rows[0];
    if (!profileUser) {
      return res.status(404).render('error', { title: 'No encontrado', message: 'Esta página no existe.' });
    }
    const links = await pool.query(
      'SELECT * FROM links WHERE user_id=$1 ORDER BY position ASC, id ASC', [profileUser.id]
    );
    const vip = profileUser.plan === 'vip' || profileUser.role === 'admin';
    let style = profileUser.style;
    if ((style === 3 || style === 4) && !vip) style = 1; // estilos VIP requieren plan VIP
    res.render('perfil-publico', { title: profileUser.name || profileUser.slug, profileUser, links: links.rows, style });
  } catch (e) { next(e); }
});

module.exports = router;
