/**
 * Motor de cálculo de precios de impresión 3D
 */

/**
 * Realiza el cálculo matemático de costos y precio de venta sugerido.
 * 
 * @param {Object} inputs - Valores de entrada para el cálculo.
 * @returns {Object} Detalle de costos calculados y precio sugerido.
 */
export function calculateCost(inputs) {
  const filamentPrice = Number(inputs.filamentPrice) || 0;
  const weightGrams = Number(inputs.weightGrams) || 0;
  const printHours = Number(inputs.printHours) || 0;
  const printerW = Number(inputs.printerW) || 0;
  const elecPrice = Number(inputs.elecPrice) || 0;
  const laborPrice = Number(inputs.laborPrice) || 0;
  const postProcess = Number(inputs.postProcess) || 0;
  const otherCosts = Number(inputs.otherCosts) || 0;
  const marginPct = (Number(inputs.marginPct) || 0) / 100;
  const commissionPct = (Number(inputs.commissionPct) || 0) / 100;
  const ivaPct = (Number(inputs.ivaPct) || 0) / 100;
  const shippingCost = Number(inputs.shippingCost) || 0;

  const includeFilament = !!inputs.includeFilament;
  const includeWeight = !!inputs.includeWeight;
  const includeTime = !!inputs.includeTime;
  const includeEnergy = !!inputs.includeEnergy;
  const includeElec = !!inputs.includeElec;
  const includeLabor = !!inputs.includeLabor;
  const includePost = !!inputs.includePost;
  const includeOther = !!inputs.includeOther;
  const includeCommission = !!inputs.includeCommission;
  const includeIVA = !!inputs.includeIVA;
  const includeShipping = !!inputs.includeShipping;

  const effectiveHours = includeTime ? printHours : 0;
  const effectiveWeight = includeWeight ? weightGrams : 0;

  // Costo de filamento: (precio_kg * gramos) / 1000
  const filamentCost =
    includeFilament && includeWeight
      ? filamentPrice * (effectiveWeight / 1000)
      : 0;

  // Costo energético: (watts * horas / 1000) * precio_kwh
  const energyKWh = (printerW * effectiveHours) / 1000;
  const energyCost =
    includeEnergy && includeElec && includeTime ? energyKWh * elecPrice : 0;

  // Costo de mano de obra
  const laborCost =
    includeLabor && includeTime ? laborPrice * effectiveHours : 0;

  // Costos adicionales fijos
  const postCost = includePost ? postProcess : 0;
  const otherCost = includeOther ? otherCosts : 0;

  const baseCosts =
    filamentCost + energyCost + laborCost + postCost + otherCost;

  // Precio de venta sugerido
  // Fórmula considerando IVA y Comisión en el denominador:
  // salePrice = (baseCosts * (1 + marginPct) + shipping) / (1 - commissionPct - ivaPct)
  const shipping = includeShipping ? shippingCost : 0;
  const effectiveRate =
    (includeCommission ? commissionPct : 0) + (includeIVA ? ivaPct : 0);
  
  let salePrice = 0;
  let validationError = null;

  if (effectiveRate >= 1) {
    validationError = `Comisión (${((includeCommission ? commissionPct : 0) * 100).toFixed(1)}%) + IVA (${((includeIVA ? ivaPct : 0) * 100).toFixed(1)}%) = ${(effectiveRate * 100).toFixed(1)}% ≥ 100%. No es posible calcular un precio válido. Ajusta los porcentajes.`;
    salePrice = NaN;
  } else if (effectiveRate > 0.95) {
    validationError = `Advertencia: Comisión + IVA = ${(effectiveRate * 100).toFixed(1)}%. Margen muy ajustado, podrías perder dinero.`;
    salePrice = (baseCosts * (1 + marginPct) + shipping) / (1 - effectiveRate);
  } else {
    salePrice = (baseCosts * (1 + marginPct) + shipping) / (1 - effectiveRate);
  }

  return {
    filamentCost,
    energyCost,
    laborCost,
    postCost,
    otherCost,
    baseCosts,
    salePrice,
    marginPct,
    commissionPct: includeCommission ? commissionPct : 0,
    ivaPct: includeIVA ? ivaPct : 0,
    shipping,
    validationError,
  };
}
