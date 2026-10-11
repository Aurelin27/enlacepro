// Programa de referidos con puntos (vista del usuario).
const express = require('express');
const { pool, getSetting } = require('../db');
const { setFlash } = require('../middleware');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rq = await pool.query(
      'SELECT * FROM referral_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [req.user.id]);
    const refs = await pool.query(
      `SELECT r.*, u.name AS referred_name, u.email AS referred_email
       FROM referrals r JOIN users u ON u.id = r.referred_user_id
       WHERE r.referrer_user_id=$1 ORDER BY r.created_at DESC`, [req.user.id]);
    const pointsPerReferral = await getSetting('points_per_referral', '100');
    const host = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.render('referidos', {
      title: 'Referidos',
      request: rq.rows[0] || null,
      referrals: refs.rows,
      pointsPerReferral,
      referralLink: req.user.referral_code ? `${host}/r/${req.user.referral_code}` : null,
    });
  } catch (e) { next(e); }
});

router.post('/solicitar', async (req, res, next) => {
  try {
    if (req.user.referral_code) {
      setFlash(req, 'error', 'Ya tienes un código de referido.');
      return res.redirect('/referidos');
    }
    const ex = await pool.query(
      "SELECT id FROM referral_requests WHERE user_id=$1 AND status='pending'", [req.user.id]);
    if (ex.rows[0]) {
      setFlash(req, 'error', 'Ya tienes una solicitud en revisión.');
      return res.redirect('/referidos');
    }
    await pool.query('INSERT INTO referral_requests(user_id) VALUES($1)', [req.user.id]);
    setFlash(req, 'ok', 'Solicitud enviada. Te avisaremos cuando sea aprobada.');
    res.redirect('/referidos');
  } catch (e) { next(e); }
});

module.exports = router;
