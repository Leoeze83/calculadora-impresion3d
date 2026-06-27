# 🚀 Maker Pricing Lab — Calculadora de Impresión 3D

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-blue.svg?style=flat-square&logo=node.js)](https://nodejs.org)
[![Express Framework](https://img.shields.io/badge/express-4.18.2-lightgrey.svg?style=flat-square&logo=express)](https://expressjs.com)
[![Gemini AI Integration](https://img.shields.io/badge/AI-Google_Gemini-orange.svg?style=flat-square&logo=google-gemini)](https://deepmind.google/technologies/gemini/)
[![Local First](https://img.shields.io/badge/architecture-local--first-green.svg?style=flat-square)](https://localfirstweb.dev/)

Una suite local-first avanzada e inteligente para makers. Permite calcular costos reales de producción, estimar precios de venta sugeridos en Argentina y contrastar tus ideas contra el mercado de Mercado Libre en tiempo real, todo potenciado con inteligencia artificial (Gemini) y análisis visual de piezas.

---

## 📽️ Demostración en Acción

Así funciona el flujo completo de cálculo rápido, testeo de escenarios, pestañas modulares y raspado con comparativa de mercado real:

![Demostración de la Calculadora](file:///home/leo-vaderloop/.gemini/antigravity-ide/brain/cf313255-9213-48ab-ba55-f5c97ef9acce/verify_calculator_chrome_1782538262217.webp)

---

## ✨ Características Principales

*   **⚡ Motor de Pricing Dinámico:** Ingresa costos de filamentos, tiempo de impresión, consumo eléctrico de la impresora, tarifa de luz local, mano de obra, post-procesado, comisiones de Mercado Libre e IVA. Todo se calcula en el denominador para darte un precio sugerido exacto de punto de equilibrio.
*   **📂 Historial Local Interactivo:** Guarda tus escenarios de cotización directamente en tu navegador. Exporta todo a formatos estándar de la industria (CSV y JSON) con un solo clic.
*   **🔍 Integración de Mercado Libre:** Búsqueda pública en tiempo real (vía proxy DuckDuckGo y Jina.ai) para comparar tus costos con competidores reales.
*   **🏷️ Extractor de Precios Inteligente:** El backend analiza sintácticamente las publicaciones del mercado y extrae precios aproximados (ej. `ARS 4.500`) de los snippets para compararlos automáticamente con tu precio objetivo.
*   **👁️ Reconocimiento Visual IA:** Sube fotos de tus piezas impresas o diseños STL para que la IA (Gemini 2.5 Flash) reconozca la pieza y genere palabras clave optimizadas para el mercado.
*   **🤖 Copiloto IA Generativo:** Analiza márgenes ideales de venta, redacta títulos atractivos optimizados para SEO y autogenera descripciones completas para tus publicaciones.

---

## 🏗️ Arquitectura Modular (Fase 1)

El proyecto cuenta con un diseño limpio y modular:

```text
├── index.html                   # Interfaz de usuario (UI) principal
├── package.json                 # Scripts y dependencias generales
├── src/
│   ├── styles.css               # Diseño visual (Glassmorphism, Dark/Light Mode)
│   └── js/
│       ├── ui.js                # Controlador principal del DOM y tema
│       ├── calculator.js        # Motor matemático puro de cotizaciones (Testado)
│       ├── history.js           # Gestor de localStorage y exports CSV/JSON
│       └── api.js               # Cliente HTTP de servicios backend
├── server/
│   ├── index.js                 # Servidor Express (API central y estáticos)
│   └── services/
│       ├── mercadolibre.js      # Parser de precios y raspador DuckDuckGo
│       └── gemini.js            # Lógicas de fallback e IA
└── test/
    └── calculator.test.mjs      # Tests unitarios del motor de cálculo
```

---

## 🛠️ Cómo Ejecutar el Proyecto

### Opción 1: Aplicación Completa con Backend (Recomendada)
Para habilitar la IA, el visual matcher y el raspado de precios de Mercado Libre, levanta el backend local:

1. Instala las dependencias en la raíz:
   ```bash
   npm install
   ```
2. Ejecuta el servidor de desarrollo:
   ```bash
   npm start
   ```
3. Abre en tu navegador:
   ```text
   http://localhost:3000
   ```

### Opción 2: Frontend Estático (Solo cálculo local)
Si solo deseas usar el cotizador matemático sin integración de red, sirve el frontend estático desde la raíz:
```bash
python3 -m http.server 8000
```
Y abre: `http://localhost:8000`

---

## 🧪 Pruebas Unitarias
El motor matemático cuenta con un set de pruebas robustas integradas al corredor nativo de Node.js (Node 18+):

Para correr los tests ejecuta:
```bash
npm test
```

Valida:
- [x] Cálculos de costo base.
- [x] Aplicación de comisiones e IVA en el denominador para punto de equilibrio.
- [x] Control de error para comisiones acumuladas $\ge 100\%$.

---

## 🔑 Configuración de IA y Variables
La aplicación es local-first. Tu API Key de Google Gemini se almacena de forma segura en el `localStorage` de tu propio navegador y se envía cifrada en el payload de las llamadas locales.

1. Ve a la pestaña **IA**.
2. Selecciona **Google Gemini**.
3. Ingresa tu API Key gratuita obtenida en [Google AI Studio](https://aistudio.google.com/).
4. Haz clic en **Guardar clave**.

*Nota: Si no posees clave, la aplicación cuenta con un motor de fallback local inteligente que simulará respuestas coherentes de diagnóstico de negocios en pesos argentinos.*

---

## 🎯 Próximos Desarrollos (Roadmap)
- [ ] **Fase 4:** CRUD completo de materiales (PLA, PETG, ABS, TPU, etc.) en pestaña "Avanzado" con costos por kg y densidades predefinidas.
- [ ] **Fase 5:** Subida directa de archivos `.stl` / `.3mf` para calcular el volumen en $cm^3$ y estimar automáticamente peso en gramos y tiempo de impresión.
- [ ] **Fase 6:** Asistente SEO interactivo y generador premium de fichas técnicas para Mercado Libre.
