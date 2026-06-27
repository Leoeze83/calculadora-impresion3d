/**
 * Servicio de búsqueda y análisis para Mercado Libre
 */

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

function decodeDuckDuckGoUrl(url) {
  try {
    const parsed = new URL(url);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url;
  } catch {
    return url;
  }
}

function buildDuckDuckGoQuery(query) {
  return `site:mercadolibre.com.ar ${query} Mercado Libre`;
}

function sanitizeText(text) {
  return String(text || "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

async function getAccessToken() {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  try {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("Mercado Libre OAuth failed:", errText);
      return null;
    }

    const data = await response.json();
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = Date.now() + (data.expires_in * 1000);
    console.log("🔑 Nuevo token obtenido de Mercado Libre. Expira en:", data.expires_in, "segundos.");
    return tokenCache.accessToken;
  } catch (err) {
    console.error("Error al obtener token de Mercado Libre:", err.message);
    return null;
  }
}

function thumbnailDataUri(title, query) {
  const safeTitle = sanitizeText(title).slice(0, 24);
  const safeQuery = sanitizeText(query).slice(0, 22);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
        <linearGradient id="g2" x1="0" x2="1" y1="1" y2="0">
          <stop offset="0%" stop-color="#081017"/>
          <stop offset="100%" stop-color="#111827"/>
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="32" fill="url(#g2)"/>
      <circle cx="520" cy="95" r="78" fill="rgba(56,189,248,.18)"/>
      <circle cx="116" cy="310" r="96" fill="rgba(245,158,11,.18)"/>
      <rect x="58" y="60" width="166" height="34" rx="17" fill="rgba(255,255,255,.08)"/>
      <rect x="58" y="112" width="520" height="186" rx="28" fill="url(#g)" opacity=".92"/>
      <path d="M132 182h220l36 36h92" stroke="rgba(255,255,255,.9)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="454" cy="220" r="22" fill="#ffffff"/>
      <circle cx="170" cy="220" r="22" fill="#ffffff"/>
      <rect x="72" y="322" width="496" height="20" rx="10" fill="rgba(255,255,255,.16)"/>
      <rect x="72" y="352" width="354" height="16" rx="8" fill="rgba(255,255,255,.12)"/>
      <text x="72" y="88" fill="#e6eef8" font-size="30" font-family="Arial, sans-serif" font-weight="700">${escapeXml(safeQuery || "Mercado Libre")}</text>
      <text x="72" y="388" fill="#cbd5e1" font-size="24" font-family="Arial, sans-serif">${escapeXml(safeTitle || "Publicación real")}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function extractPrice(title, snippet) {
  const combined = `${snippet} ${title}`;
  const matches = combined.match(/\$[ \t]*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+(?:,[0-9]{2})?|[0-9]+)/);
  if (matches) {
    let priceStr = matches[1];
    if (priceStr.includes(",") && priceStr.includes(".")) {
      priceStr = priceStr.replace(/\./g, "").replace(/,/g, ".");
    } else if (priceStr.includes(",")) {
      priceStr = priceStr.replace(/,/g, ".");
    } else if (priceStr.includes(".")) {
      const parts = priceStr.split(".");
      if (parts[parts.length - 1].length === 3) {
        priceStr = priceStr.replace(/\./g, "");
      } else {
        priceStr = priceStr.replace(/\./g, "");
      }
    }
    const val = parseFloat(priceStr);
    if (!isNaN(val)) return val;
  }
  return null;
}

async function searchMercadoLibre(query, limit = 8, retryCount = 0) {
  const token = await getAccessToken();
  if (token) {
    console.log(`🤖 Usando API oficial de Mercado Libre para buscar: "${query}"`);
    try {
      const response = await fetch(`https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const results = (data.results || []).map((r) => {
          const image = r.thumbnail ? r.thumbnail.replace(/^http:/i, "https:") : null;
          return {
            id: r.id,
            title: r.title,
            permalink: r.permalink,
            price: r.price,
            image: image,
            score: similarityScore(query, r.title),
            source: "api_oficial"
          };
        });
        return results;
      } else {
        console.warn(`API oficial retornó estado ${response.status}. Reintentando con scraper...`);
      }
    } catch (err) {
      console.warn("Falla en API oficial, reintentando con DuckDuckGo scraper...", err.message);
    }
  }

  const maxRetries = 2;
  const ddgQuery = buildDuckDuckGoQuery(query);
  const sourceUrl = `https://r.jina.ai/http://https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(ddgQuery)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      throw new Error(`Jina.ai returned ${resp.status}`);
    }

    const markdown = await resp.text();
    const lines = markdown.split(/\r?\n/);
    const items = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      const match = line.match(/^\d+\.\[(.+?)\]\((.+?)\)$/);
      if (!match) continue;

      const title = match[1].replace(/\*\*/g, "");
      const url = decodeDuckDuckGoUrl(match[2]);
      const snippet =
        lines[index + 1] && !lines[index + 1].startsWith("http")
          ? lines[index + 1].trim()
          : "";
      const price = extractPrice(title, snippet);
      items.push({
        id: `${index}-${title}`,
        title,
        snippet,
        permalink: url,
        price,
        image: thumbnailDataUri(title, query),
        score: similarityScore(query, title),
        source: "duckduckgo",
      });

      if (items.length >= limit) break;
    }

    return items;
  } catch (error) {
    if (retryCount < maxRetries) {
      console.warn(
        `searchMercadoLibre retry ${retryCount + 1}/${maxRetries} - ${error.message}`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (retryCount + 1)),
      );
      return searchMercadoLibre(query, limit, retryCount + 1);
    }

    console.error(
      `searchMercadoLibre failed after ${maxRetries} retries:`,
      error.message,
    );
    throw error;
  }
}

async function fetchProductDetails(url) {
  const token = await getAccessToken();
  if (token) {
    const idMatch = url.match(/MLA-?([0-9]+)/i);
    if (idMatch) {
      const itemId = `MLA${idMatch[1]}`;
      console.log(`🤖 Usando API oficial de Mercado Libre para detalles de item: ${itemId}`);
      try {
        const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (response.ok) {
          const item = await response.json();
          let image = null;
          if (item.pictures && item.pictures.length > 0) {
            image = item.pictures[0].secure_url || item.pictures[0].url;
          }
          if (image) {
            image = image.replace(/^http:/i, "https:");
          }
          return {
            url,
            price: item.price,
            image,
            blocked: false,
            source: "api_oficial"
          };
        } else {
          console.warn(`API oficial retornó estado ${response.status} para detalles de item. Reintentando con scraper...`);
        }
      } catch (err) {
        console.warn("Falla en detalles de API oficial, reintentando con Jina.ai...", err.message);
      }
    }
  }

  const targetUrl = `https://r.jina.ai/${url}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      throw new Error(`Jina.ai returned ${resp.status}`);
    }

    const markdown = await resp.text();

    if (markdown.includes("unusual traffic") || markdown.includes("Cookies consent") || markdown.includes("Centro de Privacidad") || markdown.includes("Algo salió mal")) {
      return {
        url,
        price: null,
        image: null,
        blocked: true
      };
    }

    let price = null;
    const priceMatches = markdown.match(/\$[ \t]*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+)/g);
    if (priceMatches && priceMatches.length > 0) {
      for (const pStr of priceMatches) {
        const matches = pStr.match(/\$[ \t]*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+)/);
        if (matches) {
          let cleanStr = matches[1];
          if (cleanStr.includes(",") && cleanStr.includes(".")) {
            cleanStr = cleanStr.replace(/\./g, "").replace(/,/g, ".");
          } else if (cleanStr.includes(",")) {
            cleanStr = cleanStr.replace(/,/g, ".");
          } else if (cleanStr.includes(".")) {
            const parts = cleanStr.split(".");
            if (parts[parts.length - 1].length === 3) {
              cleanStr = cleanStr.replace(/\./g, "");
            } else {
              cleanStr = cleanStr.replace(/\./g, "");
            }
          }
          const val = parseFloat(cleanStr);
          if (!isNaN(val) && val > 100) {
            price = val;
            break;
          }
        }
      }
    }

    let image = null;
    const imageMatch = markdown.match(/https:\/\/http2\.mlstatic\.com\/D_NQ_NP_[A-Za-z0-9_-]+-[FO]\.(?:jpg|webp|png|jpeg)/i);
    if (imageMatch) {
      image = imageMatch[0];
    }

    return {
      url,
      price,
      image,
      blocked: false
    };
  } catch (error) {
    console.error(`Error al scrapear detalles de ${url}:`, error.message);
    return {
      url,
      price: null,
      image: null,
      error: error.message
    };
  }
}

module.exports = {
  searchMercadoLibre,
  extractPrice,
  fetchProductDetails,
};
