/**
 * Orquestador de la interfaz de usuario (UI) y controlador de eventos
 */

import { calculateCost } from "./calculator.js";
import { getHistory, saveToHistory, clearHistoryFromStorage, exportToCSV, exportToJSON } from "./history.js";
import * as api from "./api.js";

const $ = (id) => document.getElementById(id);

const THEME_KEY = "mi_calculadora_impresion3d_theme";
const AI_PROVIDER_KEY = "mi_calculadora_impresion3d_ai_provider";
const AI_API_KEY_KEY = "mi_calculadora_impresion3d_google_api_key";

let uploadedImageDataUrl = "";

// Gestión de Temas
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = $("themeToggle");
  if (!btn) return;
  const icon = btn.querySelector(".theme-icon");
  if (!icon) return;
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  icon.textContent = theme === "dark" ? "☀️" : "🌙";
  btn.setAttribute(
    "aria-label",
    theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro",
  );
}

// Auxiliares
function number(v) {
  return Number(v) || 0;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  );
}

function getInputsFromDOM() {
  return {
    filamentPrice: $("filamentPrice")?.value || 0,
    weightGrams: $("weightGrams")?.value || 0,
    printHours: $("printHours")?.value || 0,
    printerW: $("printerW")?.value || 0,
    elecPrice: $("elecPrice")?.value || 0,
    laborPrice: $("laborPrice")?.value || 0,
    postProcess: $("postProcess")?.value || 0,
    otherCosts: $("otherCosts")?.value || 0,
    marginPct: $("marginPct")?.value || 0,
    commissionPct: $("commissionPct")?.value || 0,
    ivaPct: $("ivaPct")?.value || 0,
    shippingCost: $("shippingCost")?.value || 0,

    includeFilament: !!$("includeFilament")?.checked,
    includeWeight: !!$("includeWeight")?.checked,
    includeTime: !!$("includeTime")?.checked,
    includeEnergy: !!$("includeEnergy")?.checked,
    includeElec: !!$("includeElec")?.checked,
    includeLabor: !!$("includeLabor")?.checked,
    includePost: !!$("includePost")?.checked,
    includeOther: !!$("includeOther")?.checked,
    includeCommission: !!$("includeCommission")?.checked,
    includeIVA: !!$("includeIVA")?.checked,
    includeShipping: !!$("includeShipping")?.checked,
  };
}

function getCalculationSummary() {
  const result = calculateCost(getInputsFromDOM());
  const query = $("mlQuery")?.value?.trim() || "";
  return {
    query,
    targetPrice: number($("mlTargetPrice")?.value || result.salePrice),
    suggestedPrice: result.salePrice,
    baseCosts: result.baseCosts,
    marginPct: result.marginPct,
    commissionPct: result.commissionPct,
    ivaPct: result.ivaPct,
    shipping: result.shipping,
  };
}

function buildAiContext() {
  const calculation = calculateCost(getInputsFromDOM());
  return {
    locale: "Argentina",
    currency: "ARS",
    productName: $("mlQuery")?.value?.trim() || "pieza impresa en 3D",
    marketQuery: $("mlQuery")?.value?.trim() || "impresiones 3D similares",
    imageAnalysis: { hasImage: Boolean(uploadedImageDataUrl) },
    calculation: {
      baseCost: calculation.baseCosts,
      suggestedPrice: calculation.salePrice,
      marginPct: calculation.marginPct,
      commissionPct: calculation.commissionPct,
      ivaPct: calculation.ivaPct,
      shipping: calculation.shipping,
    },
  };
}

// Renderizados
function renderResult() {
  const r = calculateCost(getInputsFromDOM());
  const commissionImpact = r.commissionPct ? r.commissionPct * 100 : 0;
  const ivaImpact = r.ivaPct ? r.ivaPct * 100 : 0;
  $("result").innerHTML = `
    ${r.validationError ? `<div class="alert alert--error">${escapeHtml(r.validationError)}</div>` : ""}
    <div class="metric"><span class="subtle">Costo base calculado</span><strong>ARS ${r.baseCosts.toFixed(2)}</strong></div>
    <div class="metric"><span class="subtle">Costo adicional de envío</span><strong>${r.shipping ? `ARS ${r.shipping.toFixed(2)}` : "No incluido"}</strong></div>
    <div class="metric"><span class="subtle">Factores incluidos</span><strong>${[commissionImpact ? `Comisión ${commissionImpact.toFixed(1)}%` : null, ivaImpact ? `IVA ${ivaImpact.toFixed(1)}%` : null].filter(Boolean).join(" · ") || "Solo costo base"}</strong></div>
    <div class="metric"><span class="subtle">Precio sugerido</span><span class="price${isFinite(r.salePrice) ? "" : " price--invalid"}\">ARS ${isFinite(r.salePrice) ? r.salePrice.toFixed(2) : "No válido"}</span></div>
    <div class="subtle">El precio final ya contempla el margen deseado: ${(r.marginPct * 100).toFixed(1)}%.</div>
  `;
}

function loadHistory() {
  const list = getHistory();
  const ul = $("historyList");
  if (!ul) return;
  ul.innerHTML = "";
  if (!list.length) {
    ul.innerHTML = "<li>No hay productos guardados.</li>";
    return;
  }
  list.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = `${it.name} — costo ARS ${it.cost.toFixed(2)} — precio sugerido ARS ${it.price.toFixed(2)}`;
    ul.appendChild(li);
  });
}

function saveProduct() {
  const name = prompt("Nombre del producto (ej: Llavero 3D)") || "Producto";
  const r = calculateCost(getInputsFromDOM());
  saveToHistory(name, r.baseCosts, r.salePrice);
  loadHistory();
}

function clearHistory() {
  if (confirm("Borrar todo el historial local?")) {
    clearHistoryFromStorage();
    loadHistory();
  }
}

// Configuración de IA en el Cliente
function loadAiSettings() {
  const provider = localStorage.getItem(AI_PROVIDER_KEY) || "gemini";
  const apiKey = localStorage.getItem(AI_API_KEY_KEY) || "";
  const providerSelect = $("aiProvider");
  if (providerSelect) providerSelect.value = provider;
  const keyInput = $("googleApiKey");
  if (keyInput) keyInput.value = apiKey;
}

function saveAiSettings() {
  const providerSelect = $("aiProvider");
  const keyInput = $("googleApiKey");
  const provider = providerSelect?.value || "gemini";
  const apiKey = keyInput?.value?.trim() || "";
  localStorage.setItem(AI_PROVIDER_KEY, provider);
  localStorage.setItem(AI_API_KEY_KEY, apiKey);
  return { provider, apiKey };
}

function clearAiSettings() {
  localStorage.removeItem(AI_PROVIDER_KEY);
  localStorage.removeItem(AI_API_KEY_KEY);
  loadAiSettings();
}

function getAiSettings() {
  return {
    provider: localStorage.getItem(AI_PROVIDER_KEY) || "gemini",
    apiKey: localStorage.getItem(AI_API_KEY_KEY) || "",
  };
}

// Operaciones de Mercado
async function lazyLoadDetails(li, permalink) {
  if (!permalink) return;
  const img = li.querySelector(".market-card__media img");
  const tagsContainer = li.querySelector(".market-card__tags");

  try {
    const details = await api.getProductDetails(permalink);
    if (!details || details.blocked || details.error) {
      return;
    }

    if (details.image) {
      img.style.opacity = 0.3;
      img.src = details.image;
      img.onload = () => {
        img.style.transition = "opacity 0.4s ease";
        img.style.opacity = 1;
      };
    }

    if (details.price && tagsContainer) {
      let priceSpan = tagsContainer.querySelector(".market-price");
      if (!priceSpan) {
        priceSpan = document.createElement("span");
        priceSpan.className = "market-price";
        tagsContainer.insertBefore(priceSpan, tagsContainer.firstChild);
      }
      priceSpan.textContent = `ARS ${formatMoney(details.price)}`;
    }
  } catch (e) {
    console.error("Error al cargar detalles lazy del producto:", e);
  }
}

function renderMarketResults(items) {
  const ul = $("mlResults");
  if (!ul) return;
  ul.innerHTML = "";
  if (!items.length) {
    ul.innerHTML = "<li>No se encontraron productos similares.</li>";
    return;
  }

  items.forEach((item, index) => {
    const li = document.createElement("li");
    const title = escapeHtml(item.title);
    const snippet = escapeHtml(
      item.snippet || "Publicación real encontrada en Mercado Libre",
    );
    const permalink = escapeHtml(item.permalink || "");
    const link = item.permalink
      ? `<a href="${permalink}" target="_blank" rel="noreferrer">Abrir publicación</a>`
      : "";
    const priceText = item.price
      ? `<span class="market-price">ARS ${formatMoney(item.price)}</span>`
      : "";
    li.innerHTML = `
      <div class="market-card">
        <div class="market-card__media">
          <img src="${item.image || createFallbackImage(item.title)}" alt="${title}" style="transition: opacity 0.4s ease;">
        </div>
        <div class="market-card__body">
          <div class="market-card__top">
            <strong>${title}</strong>
            <div class="market-card__tags">
              ${priceText}
              <span class="market-tag">${(Number(item.score || 0) * 100).toFixed(0)}% match</span>
            </div>
          </div>
          <p>${snippet}</p>
          <div class="market-card__meta">
            <span>Fuente: DuckDuckGo / Mercado Libre</span>
            ${link}
          </div>
        </div>
      </div>
    `;
    ul.appendChild(li);

    // Carga perezosa escalonada de imágenes reales y precios exactos
    if (permalink && permalink.includes("mercadolibre.com.ar")) {
      setTimeout(() => {
        lazyLoadDetails(li, permalink);
      }, index * 1200);
    }
  });
}

function createFallbackImage(title) {
  const text = String(title || "Mercado Libre").slice(0, 18);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="28" fill="#081017"/>
      <rect x="36" y="36" width="568" height="348" rx="26" fill="url(#bg)" opacity=".92"/>
      <circle cx="520" cy="110" r="62" fill="rgba(255,255,255,.12)"/>
      <circle cx="116" cy="292" r="78" fill="rgba(255,255,255,.10)"/>
      <rect x="78" y="84" width="156" height="34" rx="17" fill="rgba(255,255,255,.16)"/>
      <rect x="78" y="150" width="340" height="44" rx="22" fill="rgba(255,255,255,.18)"/>
      <rect x="78" y="210" width="220" height="20" rx="10" fill="rgba(255,255,255,.18)"/>
      <rect x="78" y="244" width="270" height="20" rx="10" fill="rgba(255,255,255,.14)"/>
      <text x="78" y="310" fill="#ffffff" font-size="32" font-family="Arial, sans-serif" font-weight="700">${text}</text>
      <text x="78" y="350" fill="#e2e8f0" font-size="22" font-family="Arial, sans-serif">Vista previa del producto</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function runMarketComparison() {
  const summary = getCalculationSummary();
  const query = summary.query || "impresion 3D";
  const targetPrice = Number.isFinite(summary.targetPrice)
    ? summary.targetPrice
    : summary.suggestedPrice;

  const out = $("mlCompareSummary");
  if (!out) return;
  out.textContent = "Buscando productos comparables...";

  try {
    const data = await api.comparePrice(query, targetPrice);
    const items = data.items || [];

    renderMarketResults(items);

    const stats = data.stats || {};
    const nearest = data.nearest || items[0];
    const bandText = stats.note || "Publicaciones reales encontradas en Mercado Libre.";

    out.innerHTML = `
      <div class="metric"><span class="subtle">Precio objetivo</span><strong>ARS ${formatMoney(targetPrice)}</strong></div>
      <div class="metric"><span class="subtle">Resultados reales</span><strong>${items.length}</strong></div>
      <div class="metric"><span class="subtle">Más similar</span><strong>${nearest ? nearest.title : "Sin datos"}</strong></div>
      <div class="subtle">${bandText} Usa tu precio sugerido como referencia contra la publicación más similar.</div>
    `;
  } catch (error) {
    out.textContent = `No se pudo comparar con Mercado Libre: ${error.message}`;
  }
}

// Imagen y Visión
function updateImagePreview(dataUrl) {
  const preview = $("productImagePreview");
  const empty = $("productImageEmpty");
  const wrapper = $("visionPreview");
  const visionResult = $("visionResult");
  if (!preview || !empty || !wrapper) return;

  if (!dataUrl) {
    uploadedImageDataUrl = "";
    preview.removeAttribute("src");
    wrapper.classList.remove("has-image");
    empty.textContent = "Todavía no subiste ninguna imagen.";
    if (visionResult)
      visionResult.textContent =
        "La IA reconocerá el objeto y generará la búsqueda ideal para Mercado Libre.";
    return;
  }

  preview.src = dataUrl;
  wrapper.classList.add("has-image");
  empty.textContent = "Imagen cargada.";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function analyzeImageAndSearch() {
  const visionResult = $("visionResult");
  if (!uploadedImageDataUrl) {
    if (visionResult)
      visionResult.textContent =
        "Primero subí una imagen del producto o usá la cámara.";
    return;
  }

  if (visionResult) visionResult.textContent = "Analizando imagen con IA...";

  try {
    const { provider, apiKey } = getAiSettings();
    const data = await api.analyzeImage(uploadedImageDataUrl, buildAiContext(), provider, apiKey);

    if (data.error) {
      if (visionResult)
        visionResult.textContent = `No se pudo reconocer la imagen: ${data.error}`;
      return;
    }

    const recognition = data.recognition || {};
    const query =
      recognition.searchQuery ||
      recognition.objectName ||
      $("mlQuery").value ||
      "impresión 3D";
    $("mlQuery").value = query;

    const promptBox = $("aiPrompt");
    if (promptBox) {
      promptBox.value = `Analizá este producto: ${data.description || recognition.description || query}. Sugerí un precio, un título para Mercado Libre y mejoras de publicación.`;
    }

    const lines = [
      recognition.objectName
        ? `Objeto detectado: ${recognition.objectName}`
        : "Objeto detectado: no identificado con precisión",
      `Búsqueda sugerida: ${query}`,
      recognition.confidence
        ? `Confianza: ${(Number(recognition.confidence) * 100).toFixed(0)}%`
        : null,
      data.description ? `Descripción: ${data.description}` : null,
      recognition.tags?.length
        ? `Etiquetas: ${recognition.tags.join(", ")}`
        : null,
    ].filter(Boolean);

    if (visionResult)
      visionResult.textContent =
        lines.join(" · ") || "Imagen analizada correctamente.";

    await runMarketComparison();
  } catch (error) {
    if (visionResult)
      visionResult.textContent = `Error al analizar la imagen: ${error.message}`;
  }
}

// Consultas de IA
async function handleAiPrompt() {
  const prompt = $("aiPrompt").value.trim();
  const out = $("aiResponse");
  if (!out) return;
  out.textContent = "Procesando...";
  if (!prompt) {
    out.textContent = "Escribe una pregunta.";
    return;
  }

  try {
    const { provider, apiKey } = getAiSettings();
    const data = await api.askAI(prompt, buildAiContext(), provider, apiKey);
    if (data.error) out.textContent = "Error: " + data.error;
    else out.textContent = data.text || JSON.stringify(data, null, 2);
  } catch (e) {
    out.textContent = "Error al llamar API: " + e.message;
  }
}

function fillAiPrompt(prompt) {
  const promptBox = $("aiPrompt");
  if (!promptBox) return;
  promptBox.value = prompt;
  promptBox.focus();
}

// Descargas
function downloadCSVFile() {
  const csv = exportToCSV();
  if (!csv) {
    alert("No hay datos para exportar");
    return;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "historial_impresion3d.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJSONFile() {
  const json = exportToJSON();
  if (!json) {
    alert("No hay datos para exportar");
    return;
  }
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "historial_impresion3d_" + new Date().toISOString().split("T")[0] + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Bindeos e Eventos
function bind() {
  // Theme toggle
  const themeBtn = $("themeToggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  // Pestañas
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.remove("tab-btn--active");
        b.setAttribute("aria-selected", "false");
      });
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("tab-content--active"));
      
      btn.classList.add("tab-btn--active");
      btn.setAttribute("aria-selected", "true");
      const content = document.getElementById(targetTab);
      if (content) content.classList.add("tab-content--active");
    });
  });

  $("calcBtn").addEventListener("click", renderResult);
  $("saveBtn").addEventListener("click", saveProduct);
  $("clearHistoryBtn").addEventListener("click", clearHistory);
  $("exportCsvBtn").addEventListener("click", downloadCSVFile);
  $("exportJsonBtn").addEventListener("click", downloadJSONFile);

  $("mlSearchBtn").addEventListener("click", async () => {
    const q = $("mlQuery").value.trim() || "impresion 3D";
    $("mlCompareSummary").textContent = "Buscando productos similares...";
    try {
      const res = await api.searchMercadoLibre(q);
      renderMarketResults(res);
      $("mlCompareSummary").textContent =
        "Resultados cargados. Ahora podés comparar contra tu precio objetivo.";
    } catch (e) {
      $("mlCompareSummary").textContent = `Error: ${e.message}`;
    }
  });

  $("mlCompareBtn").addEventListener("click", runMarketComparison);
  $("aiAskBtn").addEventListener("click", handleAiPrompt);

  $("saveAiSettingsBtn").addEventListener("click", () => {
    saveAiSettings();
    const responseBox = $("aiResponse");
    if (responseBox)
      responseBox.textContent = "Clave guardada localmente para usar en las próximas consultas.";
  });

  $("clearAiSettingsBtn").addEventListener("click", () => {
    clearAiSettings();
    const responseBox = $("aiResponse");
    if (responseBox)
      responseBox.textContent = "Configuración de IA limpiada.";
  });

  $("analyzeImageBtn").addEventListener("click", analyzeImageAndSearch);

  $("clearImageBtn").addEventListener("click", () => {
    uploadedImageDataUrl = "";
    const input = $("productImageInput");
    if (input) input.value = "";
    updateImagePreview("");
  });

  $("productImageInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      updateImagePreview("");
      return;
    }
    try {
      uploadedImageDataUrl = await readFileAsDataUrl(file);
      updateImagePreview(uploadedImageDataUrl);
    } catch (e) {
      alert(e.message);
    }
  });

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () =>
      fillAiPrompt(button.dataset.prompt || ""),
    );
  });

  const toggleMap = {
    includeFilament: "filamentPrice",
    includeWeight: "weightGrams",
    includeTime: "printHours",
    includeEnergy: "printerW",
    includeElec: "elecPrice",
    includeLabor: "laborPrice",
    includePost: "postProcess",
    includeOther: "otherCosts",
    includeCommission: "commissionPct",
    includeIVA: "ivaPct",
    includeShipping: "shippingCost",
  };

  const syncDisabledState = () => {
    Object.entries(toggleMap).forEach(([toggleId, inputId]) => {
      const toggle = $(toggleId);
      if (!toggle) return;
      const input = $(inputId);
      if (input && input !== toggle) input.disabled = !toggle.checked;
      const card = toggle.closest(".field-card");
      if (card) card.classList.toggle("field-card--disabled", !toggle.checked);
    });
  };

  Object.keys(toggleMap).forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("change", syncDisabledState);
  });

  syncDisabledState();
}

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadAiSettings();
  bind();
  loadHistory();
  renderResult();
});
