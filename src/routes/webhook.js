// Webhook de Stripe. Los puntos de referidos SOLO se acreditan aquí,
// tras un pago confirmado por Stripe (idempotente). Nunca en activaciones simuladas.
const { pool, getSetting } = require('../db');
const { getStripe } = require('../stripe');

module.exports = async function stripeWebhook(req, res) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return res.status(400).send('Webhook no configurado');

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    return res.status(400).send(`Firma inválida: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(stripe, event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await onInvoicePaid(event.data.object);
        break;
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event.data.object);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Error en webhook de Stripe:', e);
    res.status(500).send('Error interno');
  }
};

async function onCheckoutCompleted(stripe, session) {
  if (!session.subscription) return;
  const sub = await stripe.subscriptions.retrieve(session.subscription);
  const m = sub.metadata || {};
  const userId = parseInt(m.userId, 10);
  if (!userId || !['basico', 'vip'].includes(m.plan)) return;

  await pool.query(
    `UPDATE users
     SET stripe_customer_id=$1, stripe_subscription_id=$2, plan=$3,
         billing_interval=$4, subscription_status='active'
     WHERE id=$5`,
    [String(session.customer), sub.id, m.plan, m.interval === 'yearly' ? 'yearly' : 'monthly', userId]
  );

  // Registra el referido como pendiente: los puntos se acreditan solo con el primer pago.
  if (m.referralCode) {
    const r = await pool.query(
      'SELECT id FROM users WHERE referral_code=$1 AND referral_approved=true', [m.referralCode]);
    if (r.rows[0] && r.rows[0].id !== userId) {
      await pool.query(
        `INSERT INTO referrals(referrer_user_id, referred_user_id, code, stripe_subscription_id)
         VALUES($1,$2,$3,$4)
         ON CONFLICT (stripe_subscription_id) DO NOTHING`,
        [r.rows[0].id, userId, m.referralCode, sub.id]
      );
      await pool.query(
        'UPDATE users SET referred_by_user_id=$1 WHERE id=$2 AND referred_by_user_id IS NULL',
        [r.rows[0].id, userId]
      );
    }
  }
}

async function onInvoicePaid(invoice) {
  // Solo el primer pago de la suscripción genera puntos (no las renovaciones).
  if (invoice.billing_reason !== 'subscription_create' || !invoice.subscription) return;
  const subId = String(invoice.subscription);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      'SELECT * FROM referrals WHERE stripe_subscription_id=$1 AND points_awarded=false FOR UPDATE', [subId]);
    if (r.rows.length > 0) {
      const s = await client.query("SELECT value FROM settings WHERE key='points_per_referral'");
      const pts = Math.max(0, parseInt((s.rows[0] && s.rows[0].value) || '100', 10) || 0);
      await client.query('UPDATE users SET points = points + $1 WHERE id=$2', [pts, r.rows[0].referrer_user_id]);
      await client.query('UPDATE referrals SET points_awarded=true WHERE id=$1', [r.rows[0].id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function onSubscriptionUpdated(sub) {
  const status = (sub.status === 'active' || sub.status === 'trialing') ? 'active' : sub.status;
  await pool.query('UPDATE users SET subscription_status=$1 WHERE stripe_subscription_id=$2', [status, sub.id]);
}

async function onSubscriptionDeleted(sub) {
  await pool.query(
    `UPDATE users SET subscription_status='canceled', plan='none', billing_interval=NULL
     WHERE stripe_subscription_id=$1`, [sub.id]);
}
