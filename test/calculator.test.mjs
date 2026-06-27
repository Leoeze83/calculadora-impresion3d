import test from 'node:test';
import assert from 'node:assert';
import { calculateCost } from '../src/js/calculator.js';

test('Cálculo de costo base sin comisiones ni IVA', () => {
  const inputs = {
    filamentPrice: 10000,
    weightGrams: 100,
    printHours: 5,
    printerW: 100,
    elecPrice: 50,
    laborPrice: 1000,
    postProcess: 500,
    otherCosts: 200,
    marginPct: 50,
    commissionPct: 10,
    ivaPct: 21,
    shippingCost: 0,
    includeFilament: true,
    includeWeight: true,
    includeTime: true,
    includeEnergy: true,
    includeElec: true,
    includeLabor: true,
    includePost: true,
    includeOther: true,
    includeCommission: false,
    includeIVA: false,
    includeShipping: false
  };

  const res = calculateCost(inputs);

  // Desglose esperado:
  // Filamento: 10000 ARS/kg * (100g / 1000) = 1000 ARS
  // Energía: (100W * 5h / 1000) * 50 ARS/kWh = 25 ARS
  // Mano de Obra: 1000 ARS/h * 5h = 5000 ARS
  // Post-procesado: 500 ARS
  // Otros: 200 ARS
  // Total costo base: 1000 + 25 + 5000 + 500 + 200 = 6725 ARS
  // Precio sugerido (50% margen): 6725 * 1.5 = 10087.50 ARS
  assert.strictEqual(res.baseCosts, 6725);
  assert.strictEqual(res.salePrice, 10087.50);
  assert.strictEqual(res.validationError, null);
});

test('Cálculo con comisiones e IVA incluidos en el denominador', () => {
  const inputs = {
    filamentPrice: 10000,
    weightGrams: 100,
    printHours: 5,
    printerW: 100,
    elecPrice: 50,
    laborPrice: 1000,
    postProcess: 500,
    otherCosts: 200,
    marginPct: 50,
    commissionPct: 10,
    ivaPct: 21,
    shippingCost: 2000,
    includeFilament: true,
    includeWeight: true,
    includeTime: true,
    includeEnergy: true,
    includeElec: true,
    includeLabor: true,
    includePost: true,
    includeOther: true,
    includeCommission: true,
    includeIVA: true,
    includeShipping: true
  };

  const res = calculateCost(inputs);

  // Costo base = 6725 ARS
  // Costo con margen + envío = (6725 * 1.5) + 2000 = 10087.5 + 2000 = 12087.5 ARS
  // Denominador (1 - 0.10 - 0.21) = 0.69
  // Venta sugerida = 12087.5 / 0.69 = 17518.1159... ARS
  assert.strictEqual(res.baseCosts, 6725);
  assert.strictEqual(Number(res.salePrice.toFixed(4)), 17518.1159);
  assert.strictEqual(res.commissionPct, 0.10);
  assert.strictEqual(res.ivaPct, 0.21);
});

test('Validación de comisiones + IVA superiores o iguales al 100%', () => {
  const inputs = {
    filamentPrice: 10000,
    weightGrams: 100,
    printHours: 5,
    printerW: 100,
    elecPrice: 50,
    laborPrice: 1000,
    postProcess: 500,
    otherCosts: 200,
    marginPct: 50,
    commissionPct: 50,
    ivaPct: 50,
    shippingCost: 0,
    includeFilament: true,
    includeWeight: true,
    includeTime: true,
    includeEnergy: true,
    includeElec: true,
    includeLabor: true,
    includePost: true,
    includeOther: true,
    includeCommission: true,
    includeIVA: true,
    includeShipping: false
  };

  const res = calculateCost(inputs);

  assert.strictEqual(isNaN(res.salePrice), true);
  assert.match(res.validationError, /No es posible calcular un precio válido/);
});
