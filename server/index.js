const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
  searchMercadoLibre,
  fetchProductDetails,
  analyzeCompetition,
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} = require("./services/mercadolibre");
const {
  buildFallbackAiResponse,
  buildFallbackVisionResponse,
  parseInlineImage,
  generateSeoTitle,
  generateSeoDescription,
} = require("./services/gemini");

const app = express();
app.use(cors({ origin: "*", credentials: false }));
app.use(express.json());

const BASE_PORT = Number(process.env.PORT || 3000);

function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .then((response) => {
      clearTimeout(timeoutId);
      return response;
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Timeout de ${timeoutMs / 1000}s en la solicitud`);
      }
      throw error;
    });
}

function resolveApiKey(apiKey) {
  return String(apiKey || "").trim() || process.env.GOOGLE_API_KEY || "";
}

function normalizeProvider(provider) {
  const value = String(provider || "").toLowerCase();
  return value === "fallback" ? "fallback" : "gemini";
}

// ─── Validación de configuración ───────────────────────────

console.log("🔧 Validando configuración...");

// ─── Archivos estáticos ────────────────────────────────────

app.use(express.static(path.join(__dirname, "..")));

// ═══════════════════════════════════════════════════════════
// RUTAS DE MERCADO LIBRE (API Pública - SIN autenticación)
// ═══════════════════════════════════════════════════════════

// Búsqueda pública de productos
app.get("/api/ml/search", async (req, res) => {
  const q = req.query.q || "impresion 3D";
  const limit = parseInt(req.query.limit) || 10;
  try {
    const result = await searchMercadoLibre(q, limit);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Comparar precio contra el mercado
app.get("/api/ml/compare", async (req, res) => {
  const q = req.query.q || "impresion 3D";
  const targetPrice = Number(req.query.targetPrice || 0);

  try {
    const competition = await analyzeCompetition(q);

    const items = competition.competitors || [];
    const itemsWithPrice = items.filter(
      (item) => typeof item.price === "number" && item.price > 0,
    );
    const nearest =
      itemsWithPrice.reduce((best, item) => {
        if (!best) return item;
        const currentDistance = Math.abs(item.price - targetPrice);
        const bestDistance = Math.abs(best.price - targetPrice);
        return currentDistance < bestDistance ? item : best;
      }, null) ||
      (items.length > 0 ? items[0] : null);

    res.json({
      query: q,
      targetPrice,
      items: items.sort((a, b) => b.score - a.score).slice(0, 8),
      stats: competition.analysis || {
        count: items.length,
        mode: "api-oficial-publica",
        note: "Resultados consultados desde la API pública de Mercado Libre (sin autenticación).",
      },
      nearest,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Detalles de un producto por su URL o ID
app.get("/api/ml/details", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }
  try {
    // Extraer el ID del item desde la URL
    const idMatch = url.match(/MLA-?([0-9]+)/i);
    if (!idMatch) {
      return res.status(400).json({ error: "No se pudo extraer el ID del item de la URL proporcionada." });
    }
    const itemId = `MLA${idMatch[1]}`;
    const details = await fetchProductDetails(itemId);
    res.json(details);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Análisis de competencia con estadísticas
app.get("/api/ml/competition", async (req, res) => {
  const q = req.query.q;
  if (!q) {
    return res.status(400).json({ error: "query (q) is required" });
  }
  try {
    const result = await analyzeCompetition(q);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// RUTAS DE MERCADO LIBRE (OAuth - para vendedores)
// ═══════════════════════════════════════════════════════════

// Iniciar flujo OAuth
app.get("/api/ml/auth", (req, res) => {
  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) {
    return res
      .status(400)
      .send("El servidor no tiene configurada una app ML (ML_CLIENT_ID).");
  }
  const redirectUri =
    process.env.ML_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/api/ml/callback`;
  const authUrl = getAuthUrl(clientId, redirectUri);
  res.redirect(authUrl);
});

// Callback OAuth
app.get("/api/ml/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Código de autorización no provisto.");
  }
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri =
    process.env.ML_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/api/ml/callback`;

  try {
    const data = await exchangeCodeForToken(
      code,
      clientId,
      clientSecret,
      redirectUri,
    );
    res.redirect(
      `/?ml_access_token=${encodeURIComponent(data.access_token)}&ml_refresh_token=${encodeURIComponent(data.refresh_token || "")}`,
    );
  } catch (err) {
    console.error("Callback OAuth error:", err.message);
    res
      .status(500)
      .send("Error de autenticación con Mercado Libre: " + err.message);
  }
});

// Refrescar token OAuth
app.post("/api/ml/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken)
    return res.status(400).json({ error: "refreshToken is required" });

  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;

  try {
    const data = await refreshAccessToken(refreshToken, clientId, clientSecret);
    res.json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai", async (req, res) => {
  const {
    prompt,
    context,
    provider: requestedProvider,
    apiKey,
  } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  const provider = normalizeProvider(requestedProvider);
  const key = resolveApiKey(apiKey);

  try {
    const businessContext = context ? JSON.stringify(context, null, 2) : "{}";
    const systemPrompt = [
      "Sos un asistente experto en negocios de impresión 3D en Argentina.",
      "Responde de forma completa, detallada y clara sin recortar el texto.",
      "Si el usuario solicita redactar descripciones de productos, títulos o contenido comercial, concéntrate en generar ese texto de forma extensa, completa y profesional para Mercado Libre sin forzar la estructura de diagnóstico.",
      "Si el usuario solicita un análisis financiero, de costos o de márgenes, incluye diagnóstico breve, recomendación de precio sugerido y 3 pasos siguientes.",
      `Contexto del negocio: ${businessContext}`,
      `Pregunta del usuario: ${prompt}`,
    ].join("\n\n");

    let resolvedProvider = "fallback";
    let text = "";

    if (provider === "gemini" && key) {
      const model =
        process.env.GOOGLE_MODEL ||
        process.env.GOOGLE_MODEL_NAME ||
        "gemini-1.5-flash";
      const endpoint =
        process.env.GOOGLE_ENDPOINT ||
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const body = {
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      };
      const r = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        20000,
      );
      const data = await r.json();
      if (r.ok && !data?.error) {
        text =
          data?.candidates?.[0]?.content?.parts
            ?.map((p) => p.text)
            .filter(Boolean)
            .join("") ||
          data?.candidates?.[0]?.content ||
          JSON.stringify(data);
        resolvedProvider = "gemini";
      }
    }

    if (!text) {
      resolvedProvider = provider === "gemini" ? "fallback" : provider;
      text = buildFallbackAiResponse(prompt, context);
    }

    res.json({
      text,
      provider: resolvedProvider,
      fallback: resolvedProvider === "fallback",
    });
  } catch (e) {
    console.error(e);
    res.json({
      text: buildFallbackAiResponse(prompt, context),
      fallback: true,
      sourceError: e.message,
    });
  }
});

app.post("/api/vision/analyze", async (req, res) => {
  const {
    imageDataUrl,
    context,
    provider: requestedProvider,
    apiKey,
  } = req.body || {};
  const image = parseInlineImage(imageDataUrl);
  if (!image)
    return res.status(400).json({
      error:
        "imageDataUrl is required and must be a data URL (image/*;base64,...)",
    });

  const provider = normalizeProvider(requestedProvider);
  const key = resolveApiKey(apiKey);
  const businessContext = context ? JSON.stringify(context, null, 2) : "{}";
  const prompt = [
    "Analiza la imagen de un producto o pieza impresa en 3D.",
    "Identifica el objeto de la imagen con el mayor nivel de precisión posible.",
    "Devuelve JSON estricto con estas claves: objectName, description, searchQuery, tags, confidence, notes.",
    "searchQuery debe estar optimizada para Mercado Libre Argentina.",
    "Si no puedes identificar el objeto, devuelve una hipótesis conservadora y una búsqueda amplia.",
    `Contexto del negocio: ${businessContext}`,
  ].join("\n\n");

  try {
    if (provider === "gemini" && key) {
      const model =
        process.env.GOOGLE_VISION_MODEL ||
        process.env.GOOGLE_MODEL ||
        "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const body = {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: image.mimeType,
                  data: image.base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
        },
      };

      const r = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        20000,
      );
      const data = await r.json();

      if (r.ok && !data?.error) {
        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text)
            .filter(Boolean)
            .join("") || "";
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }

        if (parsed) {
          return res.json({
            recognition: {
              objectName:
                parsed.objectName || parsed.object || "Objeto detectado",
              description: parsed.description || "",
              searchQuery:
                parsed.searchQuery ||
                parsed.objectName ||
                parsed.object ||
                context?.marketQuery ||
                "impresión 3D",
              tags: Array.isArray(parsed.tags) ? parsed.tags : [],
              confidence: Number(parsed.confidence || 0),
            },
            description: parsed.description || "",
            notes: parsed.notes || "",
            provider: "gemini",
          });
        }
      }
    }

    res.json({
      ...buildFallbackVisionResponse(context),
      fallback: true,
      provider: provider === "gemini" ? "fallback" : provider,
    });
  } catch (e) {
    console.error(e);
    res.json({
      ...buildFallbackVisionResponse(context),
      fallback: true,
      provider: "fallback",
      sourceError: e.message,
    });
  }
});

// ─── Generador de publicación (preview y creación) ─────────

function calculatePricing(costs, avgMarketPrice, strategy = "balanced") {
  const filamentCost = Number(costs.filamentCost || 0);
  const energyCost = Number(costs.energyCost || 0);
  const laborCost = Number(costs.laborCost || 0);
  const postCost = Number(costs.postCost || 0);
  const otherCost = Number(costs.otherCost || 0);
  const shippingCost = Number(costs.shippingCost || 0);
  const marginPct = Number(costs.marginPct || 30) / 100;
  const commissionPct = Number(costs.commissionPct || 13) / 100;
  const ivaPct = Number(costs.ivaPct || 21) / 100;

  // Costo de producción base
  const baseCost = filamentCost + energyCost + laborCost + postCost + otherCost;

  // Costo total incluyendo envío si lo absorbe el vendedor
  const totalCost = baseCost + shippingCost;

  // Precio sugerido según fórmula
  const denominator = 1 - commissionPct - ivaPct;
  let suggestedPrice =
    denominator > 0.05
      ? (baseCost * (1 + marginPct) + shippingCost) / denominator
      : baseCost * (1 + marginPct) + shippingCost;

  // Ajuste según estrategia y competencia
  let finalPrice = suggestedPrice;
  if (avgMarketPrice && avgMarketPrice > 0) {
    if (strategy === "aggressive") {
      finalPrice = Math.min(suggestedPrice, avgMarketPrice * 0.90);
    } else if (strategy === "premium") {
      finalPrice = Math.max(suggestedPrice, avgMarketPrice * 1.15);
    } else {
      // Balanced
      if (suggestedPrice < avgMarketPrice) {
        finalPrice = (suggestedPrice + avgMarketPrice) / 2;
      }
    }
  }

  // Redondear a múltiplo de 50 para estética de ML
  finalPrice = Math.ceil(finalPrice / 50) * 50;

  // Margen real obtenido final
  let realMarginPct = 0;
  if (baseCost > 0) {
    realMarginPct =
      (finalPrice * (1 - commissionPct - ivaPct) - shippingCost) / baseCost - 1;
  }

  return {
    baseCost,
    totalCost,
    suggestedPrice: Math.round(suggestedPrice),
    finalPrice: Math.round(finalPrice),
    realMarginPct: Math.round(realMarginPct * 100),
    breakdown: {
      material: Math.round(filamentCost),
      electricity: Math.round(energyCost),
      labor: Math.round(laborCost),
      postProcessing: Math.round(postCost),
      other: Math.round(otherCost),
      shipping: Math.round(shippingCost),
      mlCommission: Math.round(finalPrice * commissionPct),
      iva: Math.round(finalPrice * ivaPct),
    },
  };
}

// POST /api/ml/publish/preview
app.post("/api/ml/publish/preview", async (req, res) => {
  const {
    productName,
    material,
    color,
    features,
    costs, // { filamentCost, energyCost, laborCost, postCost, otherCost, shippingCost, marginPct, commissionPct, ivaPct }
    pricingStrategy = "balanced",
    apiKey,
  } = req.body || {};

  if (!productName) {
    return res.status(400).json({ error: "productName es requerido" });
  }

  try {
    console.log(`📊 Generando preview de publicación para "${productName}"...`);

    // 1. Analizar competencia
    const competition = await analyzeCompetition(productName);
    const avgPrice = competition.analysis ? competition.analysis.avgPrice : 0;

    // 2. Generar título SEO optimizado
    const optimizedTitle = await generateSeoTitle(
      productName,
      material,
      color,
      features,
      apiKey,
    );

    // 3. Calcular precios dinámicos
    const pricing = calculatePricing(costs || {}, avgPrice, pricingStrategy);

    // 4. Generar descripción persuasiva
    const description = await generateSeoDescription(
      productName,
      material,
      features,
      pricing.finalPrice,
      avgPrice,
      apiKey,
    );

    res.json({
      preview: {
        title: optimizedTitle,
        description,
        price: pricing.finalPrice,
        pricing: {
          optimalPrice: pricing.suggestedPrice,
          adjustedStrategy: pricingStrategy,
          profitMargin: pricing.realMarginPct,
          breakdown: pricing.breakdown,
        },
        competition: {
          avgPrice,
          competitors: (competition.competitors || []).slice(0, 5),
        },
        ready_to_publish: true,
      },
    });
  } catch (err) {
    console.error("Error generando preview de publicación:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ml/publish/create (requiere token de autenticación)
app.post("/api/ml/publish/create", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res
      .status(401)
      .json({
        error:
          "No autorizado. Debe iniciar sesión con Mercado Libre primero en la pestaña Integraciones.",
      });
  }

  const {
    title,
    description,
    price,
    quantity = 1,
    category_id = "MLA449106", // Categoría Impresión 3D por defecto
    pictures = [],
  } = req.body || {};

  if (!title || !price) {
    return res.status(400).json({ error: "title y price son requeridos" });
  }

  try {
    console.log(
      `📤 Creando publicación en Mercado Libre: "${title}" por ARS ${price}`,
    );

    // Formato de imágenes requerido por la API de Mercado Libre
    const formattedPictures = pictures.map((pic) => {
      if (typeof pic === "string") return { source: pic };
      return pic;
    });

    const listingBody = {
      title,
      category_id,
      price: Number(price),
      currency_id: "ARS",
      available_quantity: Number(quantity),
      buying_mode: "buy_it_now",
      listing_type_id: "gold_special", // Clásica (comisión estándar)
      condition: "new",
      pictures:
        formattedPictures.length > 0
          ? formattedPictures
          : [
              {
                source:
                  "https://http2.mlstatic.com/D_NQ_NP_897148-MLA48007204990_102021-O.webp",
              },
            ],
    };

    const response = await fetch("https://api.mercadolibre.com/items", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(listingBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error al crear item en Mercado Libre: ${errText}`);
    }

    const item = await response.json();
    console.log(`✅ Publicación creada con ID: ${item.id}`);

    // Agregar la descripción al item creado
    if (description) {
      const descResponse = await fetch(
        `https://api.mercadolibre.com/items/${item.id}/description`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ plain_text: description }),
        },
      );
      if (!descResponse.ok) {
        console.warn(
          `⚠️ No se pudo guardar la descripción en el item ${item.id}.`,
        );
      } else {
        console.log(`✅ Descripción añadida al item ${item.id}`);
      }
    }

    res.json({
      success: true,
      itemId: item.id,
      permalink: item.permalink,
    });
  } catch (err) {
    console.error("Error creando publicación:", err);
    res.status(500).json({ error: err.message });
  }
});

function listen(port) {
  const server = app.listen(port, () => {
    console.log(
      `\n🚀 Calculadora Impres3D iniciada en http://localhost:${port}`,
    );
    console.log(`📁 Archivos: ${path.join(__dirname, "..")}`);
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < BASE_PORT + 10) {
      console.log(`⚠️  Puerto ${port} en uso, probando ${port + 1}...`);
      server.close(() => listen(port + 1));
      return;
    }
    console.error("❌ Error del servidor:", error);
    process.exit(1);
  });
}

// Startup
listen(BASE_PORT);
