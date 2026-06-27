/**
 * Servicio de integración con Mercado Libre (API Oficial)
 *
 * Basado en: ML_INTEGRATION_GUIDE.md y ML_PRACTICAL_CODE.js
 *
 * Flujos soportados:
 *  - Búsqueda pública de productos (NO requiere token)
 *  - Detalles de producto (NO requiere token)
 *  - Análisis de competencia (NO requiere token)
 *  - OAuth de vendedor (requiere ML_CLIENT_ID + ML_CLIENT_SECRET + code)
 */

const ML_API_BASE = "https://api.mercadolibre.com";
const ML_OAUTH_BASE = "https://auth.mercadolibre.com.ar";

// ─── Utilidades ────────────────────────────────────────────

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function similarityScore(query, title) {
  const queryTokens = new Set(tokenize(query));
  const titleTokens = tokenize(title);
  if (!queryTokens.size || !titleTokens.length) return 0;
  let matches = 0;
  titleTokens.forEach((token) => {
    if (queryTokens.has(token)) matches += 1;
  });
  return matches / Math.max(queryTokens.size, titleTokens.length);
}

// ─── Caché de tokens OAuth (para vendedores) ───────────────

let oauthTokenCache = {};

// ─── Búsqueda pública (SIN autenticación) ──────────────────

async function searchMercadoLibre(query, limit = 10) {
  console.log(`🔍 Buscando en ML API pública: "${query}" (limit: ${limit})`);

  const url = `${ML_API_BASE}/sites/MLA/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ML search error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  const results = (data.results || []).map((item) => {
    const image = item.thumbnail
      ? item.thumbnail.replace(/^http:/i, "https:")
      : null;
    return {
      id: item.id,
      title: item.title,
      price: item.price,
      currency_id: item.currency_id,
      permalink: item.permalink,
      image,
      condition: item.condition,
      seller: item.seller
        ? { id: item.seller.id, nickname: item.seller.nickname }
        : null,
      sold_quantity: item.sold_quantity || 0,
      listing_type_id: item.listing_type_id,
      score: similarityScore(query, item.title),
      source: "api_oficial",
    };
  });

  return {
    items: results,
    paging: data.paging || {},
  };
}

// ─── Detalles de producto (SIN autenticación) ──────────────

async function fetchProductDetails(itemId) {
  console.log(`📦 Obteniendo detalles de item: ${itemId}`);

  const [itemRes, descRes] = await Promise.allSettled([
    fetch(`${ML_API_BASE}/items/${itemId}`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`${ML_API_BASE}/items/${itemId}/description`, {
      headers: { Accept: "application/json" },
    }),
  ]);

  if (itemRes.status === "rejected" || !itemRes.value.ok) {
    const errText =
      itemRes.status === "rejected"
        ? itemRes.reason.message
        : await itemRes.value.text();
    throw new Error(`ML item error: ${errText}`);
  }

  const item = await itemRes.value.json();

  let description = "";
  if (descRes.status === "fulfilled" && descRes.value.ok) {
    const descData = await descRes.value.json();
    description = descData.plain_text || "";
  }

  let image = null;
  if (item.pictures && item.pictures.length > 0) {
    image = (item.pictures[0].secure_url || item.pictures[0].url || "").replace(
      /^http:/i,
      "https:",
    );
  }

  return {
    id: item.id,
    title: item.title,
    price: item.price,
    currency_id: item.currency_id,
    available_quantity: item.available_quantity,
    sold_quantity: item.sold_quantity,
    pictures: item.pictures || [],
    image,
    permalink: item.permalink,
    seller: item.seller,
    category_id: item.category_id,
    attributes: item.attributes || [],
    description,
    shipping: item.shipping,
    condition: item.condition,
    blocked: false,
    source: "api_oficial",
  };
}

// ─── Análisis de competencia ───────────────────────────────

async function analyzeCompetition(query) {
  const searchResult = await searchMercadoLibre(query, 10);
  const items = searchResult.items;

  if (!items.length) {
    return { competitors: [], analysis: null };
  }

  const prices = items
    .map((i) => i.price)
    .filter((p) => typeof p === "number" && p > 0);

  if (!prices.length) {
    return { competitors: items, analysis: null };
  }

  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return {
    competitors: items,
    analysis: {
      avgPrice: Math.round(avgPrice),
      minPrice,
      maxPrice,
      range: maxPrice - minPrice,
      count: prices.length,
      recommendation: {
        suggestedPrice: Math.round(avgPrice * 0.95),
        reason: "5% debajo del promedio: competitivo pero visible en búsqueda",
      },
    },
  };
}

// ─── OAuth: Generar URL de autorización ────────────────────

function getAuthUrl(clientId, redirectUri) {
  return `${ML_OAUTH_BASE}/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

// ─── OAuth: Intercambiar código por token ──────────────────

async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OAuth token exchange failed: ${errText}`);
  }

  const data = await response.json();
  console.log(
    `🔑 Token OAuth obtenido para user ${data.user_id}. Expira en ${data.expires_in}s.`,
  );
  return data;
}

// ─── OAuth: Refrescar token ────────────────────────────────

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  return await response.json();
}

// ─── Exports ───────────────────────────────────────────────

module.exports = {
  searchMercadoLibre,
  fetchProductDetails,
  analyzeCompetition,
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
};
