// Planes, Checkout de Stripe y portal de facturación.
const express = require('express');
const { pool } = require('../db');
const { requireLogin, setFlash } = require('../middleware');
const { stripeConfigured, isTestMode, getStripe, priceIdFor } = require('../stripe');
const plans = require('../plans');

const router = express.Router();

function baseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

router.get('/planes', (req, res) => {
  res.render('planes', { title: 'Planes', plans });
});

router.post('/billing/checkout', requireLogin, async (req, res, next) => {
  try {
    const { plan, interval } = req.body;
    if (!['basico', 'vip'].includes(plan) || !['monthly', 'yearly'].includes(interval)) {
      setFlash(req, 'error', 'Plan no válido.');
      return res.redirect('/planes');
    }
    const stripe = getStripe();
    const priceId = priceIdFor(plan, interval);
    if (!stripe || !priceId) {
      setFlash(req, 'error', 'Pagos no configurados todavía. Vuelve pronto.');
      return res.redirect('/planes');
    }

    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { userId: String(req.user.id) },
      });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customerId, req.user.id]);
    }

    const refCode = req.session.referralCode || '';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl(req)}/billing/exito`,
      cancel_url: `${baseUrl(req)}/planes`,
      subscription_data: { metadata: { userId: String(req.user.id), plan, interval, referralCode: refCode } },
      metadata: { userId: String(req.user.id), plan, interval, referralCode: refCode },
    });
    res.redirect(303, session.url);
  } catch (e) { next(e); }
});

router.get('/billing/exito', requireLogin, (req, res) => {
  res.render('exito', { title: '¡Listo!' });
});

// Portal de Stripe: el usuario gestiona su suscripción y puede cancelar cuando quiera.
router.post('/billing/portal', requireLogin, async (req, res, next) => {
  try {
    const stripe = getStripe();
    if (!stripe || !req.user.stripe_customer_id) {
      setFlash(req, 'error', 'Pagos no configurados todavía.');
      return res.redirect('/planes');
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${baseUrl(req)}/dashboard`,
    });
    res.redirect(303, portal.url);
  } catch (e) { next(e); }
});

module.exports = router;
