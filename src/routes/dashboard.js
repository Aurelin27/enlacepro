// Panel del usuario: resumen, perfil, enlaces y estilo visual.
const express = require('express');
const { pool } = require('../db');
const { setFlash, isVip } = require('../middleware');
const { validSlug, normalizeUrl } = require('../util');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const links = await pool.query('SELECT COUNT(*)::int AS c FROM links WHERE user_id=$1', [req.user.id]);
    const refs = await pool.query('SELECT COUNT(*)::int AS c FROM referrals WHERE referrer_user_id=$1', [req.user.id]);
    const rq = await pool.query(
      'SELECT * FROM referral_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [req.user.id]
    );
    res.render('dashboard', {
      title: 'Mi panel',
      linksCount: links.rows[0].c,
      refCount: refs.rows[0].c,
      lastRequest: rq.rows[0] || null,
      vip: isVip(req.user),
    });
  } catch (e) { next(e); }
});

router.get('/perfil', (req, res) => res.render('perfil', { title: 'Editar perfil' }));

router.post('/perfil', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 80);
    const bio = String(req.body.bio || '').trim().slice(0, 280);
    const photoUrl = normalizeUrl(req.body.photo_url);
    const slug = String(req.body.slug || '').trim().toLowerCase();
    if (!validSlug(slug)) {
      setFlash(req, 'error', 'Ese nombre de enlace no es válido o está reservado.');
      return res.redirect('/dashboard/perfil');
    }
    const clash = await pool.query('SELECT id FROM users WHERE slug=$1 AND id<>$2', [slug, req.user.id]);
    if (clash.rows[0]) {
      setFlash(req, 'error', 'Ese nombre de enlace ya está en uso.');
      return res.redirect('/dashboard/perfil');
    }
    await pool.query('UPDATE users SET name=$1, bio=$2, photo_url=$3, slug=$4 WHERE id=$5',
      [name, bio, photoUrl, slug, req.user.id]);
    setFlash(req, 'ok', 'Perfil actualizado.');
    res.redirect('/dashboard/perfil');
  } catch (e) { next(e); }
});

router.get('/enlaces', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM links WHERE user_id=$1 ORDER BY position ASC, id ASC', [req.user.id]);
    res.render('enlaces', { title: 'Mis enlaces', links: rows });
  } catch (e) { next(e); }
});

router.post('/enlaces', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 80);
    const url = normalizeUrl(req.body.url);
    if (!title || !url) {
      setFlash(req, 'error', 'Escribe un título y una dirección.');
      return res.redirect('/dashboard/enlaces');
    }
    const mx = await pool.query('SELECT COALESCE(MAX(position),-1)+1 AS p FROM links WHERE user_id=$1', [req.user.id]);
    await pool.query('INSERT INTO links(user_id, title, url, position) VALUES($1,$2,$3,$4)',
      [req.user.id, title, url, mx.rows[0].p]);
    setFlash(req, 'ok', 'Enlace agregado.');
    res.redirect('/dashboard/enlaces');
  } catch (e) { next(e); }
});

router.post('/enlaces/:id/editar', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 80);
    const url = normalizeUrl(req.body.url);
    if (!title || !url) {
      setFlash(req, 'error', 'Escribe un título y una dirección.');
      return res.redirect('/dashboard/enlaces');
    }
    await pool.query('UPDATE links SET title=$1, url=$2 WHERE id=$3 AND user_id=$4',
      [title, url, req.params.id, req.user.id]);
    setFlash(req, 'ok', 'Enlace actualizado.');
    res.redirect('/dashboard/enlaces');
  } catch (e) { next(e); }
});

router.post('/enlaces/:id/eliminar', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM links WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    setFlash(req, 'ok', 'Enlace eliminado.');
    res.redirect('/dashboard/enlaces');
  } catch (e) { next(e); }
});

async function moveLink(req, res, dir, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      'SELECT * FROM links WHERE user_id=$1 ORDER BY position ASC, id ASC', [req.user.id]);
    const i = rows.findIndex((l) => l.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return res.redirect('/dashboard/enlaces');
    const a = rows[i], b = rows[j];
    await pool.query('UPDATE links SET position=$1 WHERE id=$2', [b.position, a.id]);
    await pool.query('UPDATE links SET position=$1 WHERE id=$2', [a.position, b.id]);
    res.redirect('/dashboard/enlaces');
  } catch (e) { next(e); }
}
router.post('/enlaces/:id/subir', (req, res, next) => moveLink(req, res, 'up', next));
router.post('/enlaces/:id/bajar', (req, res, next) => moveLink(req, res, 'down', next));

router.get('/estilo', (req, res) => {
  res.render('estilo', { title: 'Estilo visual', vip: isVip(req.user) });
});

router.post('/estilo', async (req, res, next) => {
  try {
    const style = parseInt(req.body.style, 10);
    if (![1, 2, 3, 4].includes(style)) {
      setFlash(req, 'error', 'Estilo no válido.');
      return res.redirect('/dashboard/estilo');
    }
    if ((style === 3 || style === 4) && !isVip(req.user)) {
      setFlash(req, 'error', 'Esos estilos son solo para el plan VIP.');
      return res.redirect('/dashboard/estilo');
    }
    await pool.query('UPDATE users SET style=$1 WHERE id=$2', [style, req.user.id]);
    setFlash(req, 'ok', 'Estilo actualizado.');
    res.redirect('/dashboard/estilo');
  } catch (e) { next(e); }
});

module.exports = router;
