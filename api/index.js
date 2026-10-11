// Punto de entrada serverless para Vercel: reutiliza la app Express sin cambios.
const app = require('../src/server');

module.exports = async (req, res) => {
  await app.ready;
  return app(req, res);
};
