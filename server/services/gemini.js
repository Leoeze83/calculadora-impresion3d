/**
 * Servicio de ayuda y fallback para la integración con Gemini IA
 */

function buildFallbackAiResponse(prompt, context = {}) {
  const calc = context.calculation || {};
  const suggestedPrice = Number(calc.suggestedPrice || 0);
  const baseCost = Number(calc.baseCost || 0);
  const marketQuery =
    context.marketQuery || context.productName || "producto 3D";

  return [
    "Diagnóstico rápido (Modo local)",
    `- Producto: ${context.productName || "pieza impresa en 3D"}`,
    `- Búsqueda de mercado: ${marketQuery}`,
    `- Costo base estimado: ARS ${baseCost.toFixed(2)}`,
    `- Precio sugerido actual: ARS ${suggestedPrice.toFixed(2)}`,
    "",
    "Recomendación",
    suggestedPrice > 0
      ? `- Mantendría un precio de referencia cercano a ARS ${suggestedPrice.toFixed(2)} y lo validaría contra las publicaciones más similares.`
      : "- Primero calculá el costo base para fijar una referencia de venta confiable.",
    "",
    "Acciones siguientes",
    "- Ajustar el título para Mercado Libre con material, uso y compatibilidad.",
    "- Comparar contra 5 a 8 publicaciones reales similares antes de publicar.",
    "- Probar una variante premium y una variante económica para medir margen.",
    "",
    "Respuesta a tu consulta",
    `- ${prompt}`,
  ].join("\n");
}

function parseInlineImage(imageDataUrl) {
  const match = String(imageDataUrl || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
  );
  if (!match) return null;
  return { mimeType: match[1], base64Data: match[2] };
}

function buildFallbackVisionResponse(context = {}) {
  const productName = context?.productName || "pieza impresa en 3D";
  return {
    recognition: {
      objectName: productName,
      description: `Producto relacionado con ${productName}`,
      searchQuery: context?.marketQuery || productName,
      tags: ["maker", "impresión 3D"],
      confidence: 0.25,
    },
    description: `Reconocimiento estimado del producto: ${productName}`,
  };
}

async function callGemini(systemPrompt, apiKey) {
  const model = process.env.GOOGLE_MODEL || "gemini-1.5-flash";
  const key = apiKey || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("") || null;
  } catch {
    return null;
  }
}

async function generateSeoTitle(productName, material, color, features, apiKey) {
  const prompt = `Eres un experto en SEO para Mercado Libre Argentina. Generá un título comercialmente óptimo de exactamente 60 caracteres o menos (restricción estricta de Mercado Libre) para publicar un producto con estos detalles:
- Nombre del objeto: ${productName}
- Material: ${material || "No especificado"}
- Color: ${color || "No especificado"}
- Características extras: ${features || "Impreso en 3D con alta precisión"}

Reglas:
1. Sé extremadamente descriptivo e incluye palabras clave importantes.
2. Debe medir menos o igual a 60 caracteres.
3. No uses caracteres especiales, emojis ni comillas.
4. Responde ÚNICAMENTE con el título resultante, sin introducciones ni explicaciones.`;

  const response = await callGemini(prompt, apiKey);
  if (response) return response.trim().replace(/^"+|"+$/g, "").slice(0, 60);

  // Fallback local
  let title = `${productName} Impreso 3D ${material || ""} ${color || ""}`.trim();
  return title.slice(0, 60);
}

async function generateSeoDescription(productName, material, features, price, avgPrice, apiKey) {
  const prompt = `Eres copywriter experto en ventas y SEO de Mercado Libre Argentina. Escribí una descripción corta, vendedora y clara de 500 caracteres o menos para un producto con estos detalles:
- Nombre: ${productName}
- Material: ${material || "No especificado"}
- Características / Atributos: ${features || "Impreso en 3D con alta fidelidad y resistencia"}
- Precio sugerido de venta: ARS ${price}
- Precio promedio del mercado: ARS ${avgPrice}

Reglas:
1. Destacá el valor del producto y los detalles técnicos de la impresión 3D (resistencia, acabado).
2. Sé persuasivo e incluí una llamada a la acción clara para consultar.
3. El tono debe ser profesional y adaptado al público de Argentina (ej: "consultanos", "hacé tu pedido").
4. Evita gritar en mayúsculas y respeta el límite estricto de 500 caracteres.
5. Responde ÚNICAMENTE con el texto de la descripción, sin introducciones ni explicaciones.`;

  const response = await callGemini(prompt, apiKey);
  if (response) return response.trim().replace(/^"+|"+$/g, "").slice(0, 500);

  // Fallback local
  return `¡Hola! Te presentamos este espectacular ${productName} impreso en 3D de alta calidad, realizado en material ${material || "PLA"} súper resistente. Ideal para uso diario o decoración. 

🔹 Características: ${features || "Gran acabado y durabilidad."}
🔹 Realizamos pedidos personalizados y en cantidad.
🔹 Envíos a todo el país o retiro en persona.

¡Hacé tu consulta ahora y te responderemos a la brevedad!`.slice(0, 500);
}

module.exports = {
  buildFallbackAiResponse,
  buildFallbackVisionResponse,
  parseInlineImage,
  generateSeoTitle,
  generateSeoDescription,
};
