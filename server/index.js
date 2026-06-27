const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const { searchMercadoLibre, fetchProductDetails } = require("./services/mercadolibre");
const {
  buildFallbackAiResponse,
  buildFallbackVisionResponse,
  parseInlineImage,
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
        throw new Error(`Timeout de ${timeoutMs / 1000}s`);
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

// Validar configuración al iniciar
function validateConfig() {
  const warnings = [];
  const errors = [];

  if (!process.env.GOOGLE_API_KEY) {
    warnings.push(
      "⚠️  GOOGLE_API_KEY no configurada - modo IA will use fallback responses",
    );
  }

  if (errors.length > 0) {
    console.error("❌ Errores de configuración:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("⚠️  Advertencias de configuración:");
    warnings.forEach((w) => console.warn(`  - ${w}`));
  }
}

// Servir archivos estáticos del frontend (carpeta padre)
app.use(express.static(path.join(__dirname, "..")));

app.get("/api/ml/search", async (req, res) => {
  const q = req.query.q || "impresion 3D";
  try {
    const items = await searchMercadoLibre(q, 10);
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/ml/compare", async (req, res) => {
  const q = req.query.q || "impresion 3D";
  const targetPrice = Number(req.query.targetPrice || 0);

  try {
    const items = await searchMercadoLibre(q, 10);
    const itemsWithPrice = items.filter(item => typeof item.price === "number" && item.price > 0);
    const nearest = itemsWithPrice.reduce((best, item) => {
      if (!best) return item;
      const currentDistance = Math.abs(item.price - targetPrice);
      const bestDistance = Math.abs(best.price - targetPrice);
      return currentDistance < bestDistance ? item : best;
    }, null) || (items.length > 0 ? items[0] : null);

    res.json({
      query: q,
      targetPrice,
      items: items.sort((a, b) => b.score - a.score).slice(0, 8),
      stats: {
        count: items.length,
        mode: "real-public-links",
        note: "Mercado Libre bloquea el acceso directo a precios desde este entorno; se muestran publicaciones reales y su similitud.",
      },
      nearest,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/ml/details", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }
  try {
    const details = await fetchProductDetails(url);
    res.json(details);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
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
      "Sos un asistente experto en impresión 3D para Argentina.",
      "Responde de forma completa, accionable y clara.",
      "Incluye: diagnóstico breve, recomendación concreta, rango de precio si aplica y 3 pasos siguientes.",
      "Si la pregunta es sobre publicación o venta, optimiza para Mercado Libre y lenguaje maker.",
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
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
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
console.log("🔧 Validando configuración...");
validateConfig();
listen(BASE_PORT);
