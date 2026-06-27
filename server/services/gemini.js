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

module.exports = {
  buildFallbackAiResponse,
  buildFallbackVisionResponse,
  parseInlineImage,
};
