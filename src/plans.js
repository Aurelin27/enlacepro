// Definición de planes (precios en USD).
module.exports = {
  basico: {
    key: 'basico',
    name: 'Básico',
    monthlyPrice: 10,
    yearlyPrice: 90, // 25% de descuento frente a $120
    features: [
      'Tu página personal de enlaces',
      '2 estilos visuales',
      'Edición cuando quieras',
      'Cancela cuando quieras',
    ],
  },
  vip: {
    key: 'vip',
    name: 'VIP',
    monthlyPrice: 20,
    yearlyPrice: 180, // 25% de descuento frente a $240
    features: [
      'Tu página personal de enlaces',
      'Los 4 estilos visuales',
      'Edición cuando quieras',
      'Cancela cuando quieras',
    ],
  },
};
