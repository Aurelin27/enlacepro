// Utilidades compartidas.
const RESERVED_SLUGS = new Set([
  'login', 'register', 'registro', 'logout', 'salir', 'dashboard', 'panel',
  'admin', 'administracion', 'planes', 'billing', 'facturacion', 'referidos',
  'r', 'webhooks', 'api', 'assets', 'static', 'ayuda', 'soporte', 'inicio',
]);

function validSlug(s) {
  return (
    typeof s === 'string' &&
    /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/.test(s) &&
    !RESERVED_SLUGS.has(s)
  );
}

function normalizeUrl(u) {
  let url = String(u || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url.slice(0, 500);
}

module.exports = { RESERVED_SLUGS, validSlug, normalizeUrl };
