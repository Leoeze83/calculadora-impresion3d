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

module.exports = {
  searchMercadoLibre,
  extractPrice,
};
