// Panel de administración (solo rol admin).
const express = require('express');
const crypto = require('crypto');
const { pool, getSetting } = require('../db');
const { requireAdmin, setFlash } = require('../middleware');
const plans = require('../plans');

const router = express.Router();
router.use(requireAdmin);

function monthlyRevenue(activeUsers) {
  return activeUsers.reduce((sum, u) => {
    const p = plans[u.plan];
    if (!p) return sum;
    return sum + (u.billing_interval === 'yearly' ? p.yearlyPrice / 12 : p.monthlyPrice);
  }, 0);
}

router.get('/', async (req, res, next) => {
  try {
    const users = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    const subs = await pool.query(
      "SELECT plan, billing_interval FROM users WHERE subscription_status='active'");
    const recent = await pool.query(
      'SELECT id, email, name, slug, plan, subscription_status, created_at FROM users ORDER BY created_at DESC LIMIT 8');
    const pending = await pool.query(
      "SELECT COUNT(*)::int AS c FROM referral_requests WHERE status='pending'");
    res.render('admin/panel', {
      title: 'Administración',
      totalUsers: users.rows[0].c,
      activeSubs: subs.rows.length,
      revenue: monthlyRevenue(subs.rows),
      recent: recent.rows,
      pendingRequests: pending.rows[0].c,
    });
  } catch (e) { next(e); }
});

router.get('/usuarios', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    res.render('admin/usuarios', { title: 'Usuarios', users: rows });
  } catch (e) { next(e); }
});

router.post('/usuarios/:id/plan', async (req, res, next) => {
  try {
    const { plan } = req.body;
    if (!['none', 'basico', 'vip'].includes(plan)) {
      setFlash(req, 'error', 'Plan no válido.');
      return res.redirect('/admin/usuarios');
    }
    if (String(req.params.id) === String(req.user.id) && plan === 'none') {
      setFlash(req, 'error', 'No puedes quitarte el plan a ti mismo.');
      return res.redirect('/admin/usuarios');
    }
    await pool.query(
      `UPDATE users
       SET plan=$1,
           subscription_status = CASE WHEN $1='none' THEN 'canceled' ELSE subscription_status END,
           billing_interval = CASE WHEN $1='none' THEN NULL ELSE billing_interval END
       WHERE id=$2`, [plan, req.params.id]);
    setFlash(req, 'ok', 'Plan actualizado.');
    res.redirect('/admin/usuarios');
  } catch (e) { next(e); }
});

function genCode() {
  return 'REF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

router.get('/referidos', async (req, res, next) => {
  try {
    const requests = await pool.query(
      `SELECT r.*, u.name, u.email FROM referral_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.status='pending' ORDER BY r.created_at ASC`);
    const history = await pool.query(
      `SELECT r.*, ru.name AS referrer_name, du.email AS referred_email
       FROM referrals r
       JOIN users ru ON ru.id = r.referrer_user_id
       JOIN users du ON du.id = r.referred_user_id
       ORDER BY r.created_at DESC LIMIT 100`);
    const withPoints = await pool.query(
      `SELECT id, name, email, points, referral_code FROM users
       WHERE points > 0 OR referral_code IS NOT NULL ORDER BY points DESC`);
    const pointsPerReferral = await getSetting('points_per_referral', '100');
    res.render('admin/referidos', {
      title: 'Referidos',
      requests: requests.rows,
      history: history.rows,
      withPoints: withPoints.rows,
      pointsPerReferral,
    });
  } catch (e) { next(e); }
});

router.post('/referidos/solicitudes/:id/aprobar', async (req, res, next) => {
  try {
    let code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
    const rq = await pool.query(
      "SELECT * FROM referral_requests WHERE id=$1 AND status='pending'", [req.params.id]);
    if (!rq.rows[0]) {
      setFlash(req, 'error', 'Solicitud no encontrada.');
      return res.redirect('/admin/referidos');
    }
    const userId = rq.rows[0].user_id;
    if (!code) {
      let guard = 0;
      do {
        code = genCode();
        guard++;
      } while (guard < 10 && (await pool.query('SELECT id FROM users WHERE referral_code=$1', [code])).rows[0]);
    } else {
      const clash = await pool.query('SELECT id FROM users WHERE referral_code=$1', [code]);
      if (clash.rows[0]) {
        setFlash(req, 'error', 'Ese código ya está en uso.');
        return res.redirect('/admin/referidos');
      }
    }
    await pool.query('UPDATE users SET referral_code=$1, referral_approved=true WHERE id=$2', [code, userId]);
    await pool.query("UPDATE referral_requests SET status='approved', decided_at=NOW() WHERE id=$1", [req.params.id]);
    setFlash(req, 'ok', `Código ${code} asignado.`);
    res.redirect('/admin/referidos');
  } catch (e) { next(e); }
});

router.post('/referidos/solicitudes/:id/rechazar', async (req, res, next) => {
  try {
    await pool.query("UPDATE referral_requests SET status='rejected', decided_at=NOW() WHERE id=$1", [req.params.id]);
    setFlash(req, 'ok', 'Solicitud rechazada.');
    res.redirect('/admin/referidos');
  } catch (e) { next(e); }
});

router.get('/ajustes', async (req, res, next) => {
  try {
    const pointsPerReferral = await getSetting('points_per_referral', '100');
    res.render('admin/ajustes', { title: 'Ajustes', pointsPerReferral });
  } catch (e) { next(e); }
});

router.post('/ajustes', async (req, res, next) => {
  try {
    const pts = Math.max(0, parseInt(req.body.points_per_referral, 10) || 0);
    await pool.query(
      "INSERT INTO settings(key, value) VALUES('points_per_referral', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
      [String(pts)]);
    setFlash(req, 'ok', 'Ajustes guardados.');
    res.redirect('/admin/ajustes');
  } catch (e) { next(e); }
});

module.exports = router;
