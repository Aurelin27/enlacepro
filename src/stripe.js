// Cliente de Stripe (opcional: la app funciona sin claves, con pagos desactivados).
let stripe = null;

function stripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
}

function isTestMode() {
  return stripeConfigured() && String(process.env.STRIPE_SECRET_KEY).startsWith('sk_test');
}

function getStripe() {
  if (!stripeConfigured()) return null;
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

const PRICE_IDS = {
  basico_monthly: process.env.STRIPE_PRICE_BASICO_MONTHLY,
  basico_yearly: process.env.STRIPE_PRICE_BASICO_YEARLY,
  vip_monthly: process.env.STRIPE_PRICE_VIP_MONTHLY,
  vip_yearly: process.env.STRIPE_PRICE_VIP_YEARLY,
};

function priceIdFor(plan, interval) {
  return PRICE_IDS[`${plan}_${interval}`] || null;
}

module.exports = { stripeConfigured, isTestMode, getStripe, priceIdFor };
