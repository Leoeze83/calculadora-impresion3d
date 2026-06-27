/**
 * Módulo de gestión del historial local (localStorage)
 */

const STORAGE_KEY = "mi_calculadora_impresion3d_history";

/**
 * Obtiene la lista completa de productos guardados en el historial.
 * @returns {Array} Lista de productos.
 */
export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    console.error("Error al leer el historial de localStorage:", e);
    return [];
  }
}

/**
 * Guarda un escenario de cálculo en el historial.
 * 
 * @param {string} name - Nombre descriptivo del producto.
 * @param {number} baseCosts - Costo de fabricación base.
 * @param {number} salePrice - Precio sugerido de venta.
 * @returns {Array} La lista actualizada de historial.
 */
export function saveToHistory(name, baseCosts, salePrice) {
  const item = {
    id: Date.now(),
    name: name || "Producto",
    created: new Date().toISOString(),
    cost: baseCosts,
    price: salePrice,
  };
  const list = getHistory();
  list.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

/**
 * Borra por completo el historial guardado.
 */
export function clearHistoryFromStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Genera el contenido CSV del historial.
 * @returns {string|null} Cadena en formato CSV o null si está vacío.
 */
export function exportToCSV() {
  const list = getHistory();
  if (!list.length) return null;

  const rows = [["id", "name", "created", "cost", "price"]];
  list.forEach((it) =>
    rows.push([it.id, it.name, it.created, it.cost, it.price]),
  );

  return rows
    .map((r) =>
      r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","),
    )
    .join("\n");
}

/**
 * Genera el contenido JSON estructurado con estadísticas del historial.
 * @returns {string|null} Cadena en formato JSON formateado o null si está vacío.
 */
export function exportToJSON() {
  const list = getHistory();
  if (!list.length) return null;

  const stats = {
    total: list.length,
    exported: new Date().toISOString(),
    averageCost: (
      list.reduce((sum, it) => sum + it.cost, 0) / list.length
    ).toFixed(2),
    averagePrice: (
      list.reduce((sum, it) => sum + it.price, 0) / list.length
    ).toFixed(2),
    averageMargin: (
      (list.reduce((sum, it) => sum + (it.price - it.cost), 0) /
        list.length /
        (list.reduce((sum, it) => sum + it.price, 0) / list.length)) *
      100
    ).toFixed(1),
  };

  return JSON.stringify({ stats, products: list }, null, 2);
}
