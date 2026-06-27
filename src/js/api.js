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

function getMlHeaders() {
  const method = localStorage.getItem("ml_auth_method") || "common";
  const headers = {};

  if (method === "dev") {
    const clientId = localStorage.getItem("ml_dev_client_id");
    const clientSecret = localStorage.getItem("ml_dev_client_secret");
    if (clientId && clientSecret) {
      headers["x-ml-client-id"] = clientId;
      headers["x-ml-client-secret"] = clientSecret;
    }
  } else {
    const token = localStorage.getItem("ml_user_access_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  return headers;
}

/**
 * Busca publicaciones en Mercado Libre.
 */
export async function searchMercadoLibre(query) {
  const res = await fetchWithTimeout(
    apiUrl(`/api/ml/search?q=${encodeURIComponent(query)}`),
    { headers: getMlHeaders() },
    10000
  );
  if (!res.ok) {
    let errMsg = `Error en búsqueda de mercado (${res.status})`;
    try {
      const errData = await res.json();
      if (errData.error) errMsg = errData.error;
    } catch {}
    throw new Error(errMsg);
  }
  const data = await res.json();
  return data.items || [];
}

/**
 * Compara un precio objetivo con productos similares de Mercado Libre.
 */
export async function comparePrice(query, targetPrice) {
  const res = await fetchWithTimeout(
    apiUrl(`/api/ml/compare?q=${encodeURIComponent(query)}&targetPrice=${encodeURIComponent(targetPrice)}`),
    { headers: getMlHeaders() },
    10000
  );
  if (!res.ok) {
    let errMsg = `Error en comparación de mercado (${res.status})`;
    try {
      const errData = await res.json();
      if (errData.error) errMsg = errData.error;
    } catch {}
    throw new Error(errMsg);
  }
  return await res.json();
}

/**
 * Obtiene los detalles de un producto (precio e imagen) raspados desde su URL.
 */
export async function getProductDetails(url) {
  const res = await fetchWithTimeout(
    apiUrl(`/api/ml/details?url=${encodeURIComponent(url)}`),
    { headers: getMlHeaders() },
    12000
  );
  if (!res.ok) {
    let errMsg = `Error al obtener detalles del producto (${res.status})`;
    try {
      const errData = await res.json();
      if (errData.error) errMsg = errData.error;
    } catch {}
    throw new Error(errMsg);
  }
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

/**
 * Obtiene la vista previa de una publicación en Mercado Libre con títulos/descripciones por IA y precios sugeridos.
 */
export async function getMlPublishPreview(formData, apiKey) {
  const res = await fetchWithTimeout(
    apiUrl("/api/ml/publish/preview"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, apiKey }),
    },
    25000
  );
  if (!res.ok) {
    let errMsg = `Error al generar vista previa (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }
  return await res.json();
}

/**
 * Crea la publicación final en Mercado Libre. Requiere OAuth.
 */
export async function createMlListing(listingData) {
  const res = await fetchWithTimeout(
    apiUrl("/api/ml/publish/create"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("ml_user_access_token")}`
      },
      body: JSON.stringify(listingData),
    },
    20000
  );
  if (!res.ok) {
    let errMsg = `Error al publicar (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }
  return await res.json();
}
