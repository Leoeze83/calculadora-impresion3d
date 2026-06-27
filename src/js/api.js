/**
 * Módulo de cliente de API para comunicarse con el servidor backend
 */

function getApiBaseUrl() {
  if (typeof window === "undefined") return "";
  const currentOrigin = window.location.origin;
  const port = window.location.port;
  if (port === "3000" || port === "3001") return currentOrigin;
  if (["8000", "8080", "4173", "5173", "8081"].includes(port)) {
    const host = window.location.hostname || "127.0.0.1";
    // Mapeo automático al puerto del servidor express en desarrollo
    return `http://${host}:3000`;
  }
  return currentOrigin;
}

function apiUrl(path) {
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Realiza un fetch con límite de tiempo.
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout de ${timeoutMs / 1000}s en la solicitud`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Busca publicaciones en Mercado Libre.
 */
export async function searchMercadoLibre(query) {
  const res = await fetchWithTimeout(
    apiUrl(`/api/ml/search?q=${encodeURIComponent(query)}`),
    {},
    10000
  );
  if (!res.ok) throw new Error(`Error en búsqueda de mercado (${res.status})`);
  const data = await res.json();
  return data.items || [];
}

/**
 * Compara un precio objetivo con productos similares de Mercado Libre.
 */
export async function comparePrice(query, targetPrice) {
  const res = await fetchWithTimeout(
    apiUrl(`/api/ml/compare?q=${encodeURIComponent(query)}&targetPrice=${encodeURIComponent(targetPrice)}`),
    {},
    10000
  );
  if (!res.ok) throw new Error(`Error en comparación de mercado (${res.status})`);
  return await res.json();
}

/**
 * Obtiene los detalles de un producto (precio e imagen) raspados desde su URL.
 */
export async function getProductDetails(url) {
  const res = await fetchWithTimeout(
    apiUrl(`/api/ml/details?url=${encodeURIComponent(url)}`),
    {},
    12000
  );
  if (!res.ok) throw new Error(`Error al obtener detalles del producto (${res.status})`);
  return await res.json();
}

/**
 * Realiza una consulta al asistente IA.
 */
export async function askAI(prompt, context, provider, apiKey) {
  const res = await fetchWithTimeout(
    apiUrl("/api/ai"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context, provider, apiKey }),
    },
    25000
  );
  if (!res.ok) throw new Error(`Error al consultar IA (${res.status})`);
  return await res.json();
}

/**
 * Analiza una imagen para reconocer productos en 3D.
 */
export async function analyzeImage(imageDataUrl, context, provider, apiKey) {
  const res = await fetchWithTimeout(
    apiUrl("/api/vision/analyze"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl, context, provider, apiKey }),
    },
    25000
  );
  if (!res.ok) throw new Error(`Error al analizar la imagen (${res.status})`);
  return await res.json();
}
