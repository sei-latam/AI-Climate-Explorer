/* =========================================================================
 * AI CLIMATE RISK PORTFOLIO EXPLORER — geovisor.js
 * ========================================================================= */

// --- TOKEN CESIUM ION ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiZmVkNzg3MS1mN2ZlLTQxNWUtYjMxZC02OTFiZTkzYTg1MjQiLCJpZCI6Mzg1ODkxLCJpYXQiOjE3Njk5ODI2OTZ9.j1fKrDLE7X97eksvPbF9to6YXvGybEBDIBaFR7Cg5vs';

// =========================================================================
// 1. CONFIGURACIÓN DE FUENTES DE DATOS
// =========================================================================
const GITHUB_REPO = 'sei-latam/AI-Climate-Explorer';
const GITHUB_REF = 'main'; // usar un hash de commit para congelar la versión de datos
const GITHUB_DATA_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/3.0%20Data`;

// GIRI: en el repo solo existen GeoTIFF. Exporta CSV (lat,lon,value) agregados a esta ruta.
const GIRI_DATA_BASE = `${GITHUB_DATA_BASE}/giri`;

const CIE_API_BASE = 'https://cie-api-v2.climateanalytics.org/api/geo-data/';

/**
 * Metadatos de variables (basado en diccionario_variables.csv).
 * worse: 'high' => valores altos = más riesgo ; 'low' => valores bajos = más riesgo.
 * Las unidades corresponden a los productos CIE por nivel de calentamiento; verifícalas con los metadatos de CIE.
 */
const VARIABLES = {
  'HI-danger':                { name: 'Dangerous heat days (HI > 40°C)', type: 'Acute',   unit: 'days/yr', worse: 'high', desc: 'Days per year when the heat index exceeds 40°C (NOAA "danger" threshold).' },
  'TXx':                      { name: 'Annual max. daily temperature',  type: 'Acute',   unit: '°C',      worse: 'high', desc: 'Highest daily maximum temperature of the year.' },
  'rx1day':                   { name: 'Max. 1-day precipitation',       type: 'Acute',   unit: '%',       worse: 'high', desc: 'Highest daily precipitation in a year.' },
  'rx5day':                   { name: 'Max. 5-day precipitation',       type: 'Acute',   unit: '%',       worse: 'high', desc: 'Maximum precipitation accumulated over any 5 consecutive days.' },
  'consecutive_dry_days':     { name: 'Consecutive dry days',           type: 'Acute',   unit: 'days',    worse: 'high', desc: 'Longest run of days with precipitation below 1 mm in the year.' },
  'fwixd':                    { name: 'Extreme fire-weather days',      type: 'Acute',   unit: 'days/yr', worse: 'high', desc: 'Days per year above the historical 95th percentile of the Fire Weather Index.' },
  'tasAdjust':                { name: 'Mean air temperature',           type: 'Chronic', unit: '°C',      worse: 'high', desc: 'Annual mean temperature at 2 m.' },
  'prAdjust':                 { name: 'Precipitation',                  type: 'Chronic', unit: 'mm/day',  worse: 'low',  desc: 'Mean daily precipitation of the year (decrease = water-scarcity risk).' },
  'wsi':                      { name: 'Water stress index',             type: 'Chronic', unit: '',        worse: 'high', desc: 'Ratio of human water demand to renewable surface water availability.' },
  'spei_gamma_12':            { name: 'SPEI-12 drought index',          type: 'Chronic', unit: '',        worse: 'low',  desc: 'Meteorological drought indicator combining precipitation and potential evapotranspiration (negative = drier).' },
  'labour-productivity-loss': { name: 'Labour productivity loss',       type: 'Chronic', unit: '%',       worse: 'high', desc: 'Reduction in physical work efficiency due to heat and humidity stress.' },
  'dis':                      { name: 'River discharge',                type: 'Chronic', unit: '%',       worse: 'low',  desc: 'Relative change in river discharge versus the reference period.' },
  'flood_giri':               { name: 'Riverine flood depth (GIRI)',    type: 'Acute',   unit: '',        worse: 'high', desc: 'Expected flood water depth for a given return period and RCP (MERIT Hydro, Manning).' }
};

/**
 * Fuentes. Cada fuente define sus variables, dos escenarios a comparar (A y B)
 * y cómo construir la URL y parsear la respuesta.
 */
const ALL_VARIABLES = ['labour-productivity-loss', 'HI-danger', 'TXx', 'tasAdjust', 'consecutive_dry_days', 'spei_gamma_12',
                       'prAdjust', 'rx1day', 'rx5day', 'dis', 'wsi', 'fwixd'];

const SOURCES = {
  // Fuente principal: API en vivo de CIE v2 (RCP + año). CIE convierte cada RCP/año en un nivel de calentamiento global.
  cie_api: {
    label: 'CIE v2 · Live API (RCP / year)',
    variables: ALL_VARIABLES,
    scenarios: () => {
      const rcp = { rcp26: 'RCP 2.6', rcp45: 'RCP 4.5', rcp85: 'RCP 8.5' }[state.cieRcp] || 'RCP 4.5';
      return {
        A: { code: '2030', label: `${rcp} · 2030`, short: '2030', note: rcp },
        B: { code: '2050', label: `${rcp} · 2050`, short: '2050', note: rcp }
      };
    },
    url: (variable, sc) => `${CIE_API_BASE}?iso=COL&var=${encodeURIComponent(variable)}&aggregation_spatial=gdp&season=annual&format=csv&scenarios=${state.cieRcp}&years=${sc.code}`,
    parse: text => parseCieWideCSV(text)
  },
  // Respaldo: mismos datos de CIE descargados por nivel de calentamiento (1.5 °C y 3.0 °C) en el repo de GitHub
  github: {
    label: 'CIE v2 · Warming levels (GitHub backup)',
    variables: ALL_VARIABLES,
    scenarios: () => ({
      A: { code: 'wl1p5', label: '+1.5°C', short: '+1.5°C', note: 'GWL' },
      B: { code: 'wl3p0', label: '+3.0°C', short: '+3.0°C', note: 'GWL' }
    }),
    url: (variable, sc) => `${GITHUB_DATA_BASE}/${encodeURIComponent(variable)}_${sc.code}.csv`,
    parse: text => parseLongCSV(text)
  }
};

// Plantas base (coordenadas validadas en el script R)
const DEFAULT_ASSETS = [
  { name: 'Cartagena', lat: 10.336597, lng: -75.504035 },
  { name: 'Cairo',     lat: 5.865301,  lng: -75.533499 },
  { name: 'Nare',      lat: 6.218793,  lng: -74.572677 },
  { name: 'Rioclaro',  lat: 5.867073,  lng: -74.851288 },
  { name: 'Sogamoso',  lat: 5.762965,  lng: -72.888826 },
  { name: 'Tolú',      lat: 9.471250,  lng: -75.466215 },
  { name: 'Yumbo',     lat: 3.562625,  lng: -76.488304 }
];

// Paletas (de bajo a alto)
const RAMP_SEQ = ['#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'];
const RAMP_DIV = ['#2166ac', '#4393c3', '#92c5de', '#f7f7f7', '#f4a582', '#d6604d', '#b2182b'];
const TIER_COLORS = { HIGH: '#E63946', MEDIUM: '#F4A261', LOW: '#2EC4B6', NA: '#94a3b8' };

// =========================================================================
// 2. ESTADO GLOBAL
// =========================================================================
const COLOMBIA_LAT = 4.5709;
const COLOMBIA_LON = -74.2973;

const state = {
  source: 'cie_api',
  variable: 'labour-productivity-loss',
  display: 'B',           // 'A' | 'B' | 'DIFF' -> lo que se pinta en la grilla
  cieRcp: 'rcp45',
  giriRP: 100,
  gridVisible: true,
  gridBorders: true,
  gridOpacity: 0.7,
  grids: { A: null, B: null, DIFF: null },
  scale: null,            // escala de color de la grilla activa
  loading: false,
  loadToken: 0,
  assets: []
};

let leafletMap = null;
let cesiumViewer = null;
let currentLeafletTile = null;
let currentLeafletLabels = null;
let leafletGridOverlay = null;

let cesiumBaseLayers = [];
let cesiumLabelsLayer = null;
let cesiumGridLayer = null;
let cesiumGridToken = 0;

let currentMode = '3d';
let currentNavMode3D = 'pan';
let activeBasemapKey2D = 'Satélite Híbrido';
let activeBasemapKey3D = 'esri-world';
let currentOpacity = 1.0;
let activeCoordType = 'dd';

// Pop-up Cesium anclado a una posición (activo o celda)
let cesiumPopupPosition = null;
let cesiumPopupAssetId = null;

// Herramientas de dibujo
let activeDrawTool = null;
let drawnLayers2D = [];
let drawnEntities3D = [];
let tempPoints = [];
let tempGraphics2D = null;
let tempGraphic3D = null;
let cesiumToolHandler = null;

const csvCache = new Map(); // url -> Promise<points>

// =========================================================================
// 3. MAPAS BASE
// =========================================================================
const BASEMAPS_2D = {
  'Satélite Híbrido': {
    name: 'Satélite Híbrido',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Hybrid_Map.png',
    attr: 'Esri, Maxar'
  },
  'Satélite Esri': {
    name: 'Satélite Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Satellite_Map.png',
    attr: 'Esri, Maxar'
  },
  'Esri World Street Map': {
    name: 'Esri World Street Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_World_Street_Map.png',
    attr: 'Esri'
  },
  'Google Maps': {
    name: 'Google Maps',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Google_Maps.png',
    attr: 'Google'
  },
  'Google Satélite': {
    name: 'Google Satélite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Satellite_Map.png',
    attr: 'Google'
  }
};

const BASEMAPS_3D = {
  'bing-aerial': {
    name: 'Bing Satélite 3D',
    type: 'ion',
    assetId: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Hybrid_Map.png'
  },
  'esri-world': {
    name: 'Esri Satélite Híbrido 3D',
    type: 'arcgis-hybrid',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    labelsUrl: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer',
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Hybrid_Map.png'
  },
  'esri-streets': {
    name: 'Esri World Street 3D',
    type: 'arcgis',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer',
    thumb: 'https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_World_Street_Map.png'
  }
};

// =========================================================================
// 4. INICIALIZACIÓN
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initLanguage();
  initClock();
  initLeaflet();
  initOpacitySlider();
  initClimateControls();
  initHoverChip();

  const selectSort = document.getElementById('select-sort-assets');
  if (selectSort) selectSort.addEventListener('change', () => renderPortfolio());

  await switchView('3d');

  DEFAULT_ASSETS.forEach(a => agregarPuntoAlSistema(a.name, a.lat, a.lng, 'Argos', { silent: true }));
  finalizarCargaMasiva();
  renderAgentIntro();

  loadClimateData();
});

function initClock() {
  const updateClock = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const el = document.getElementById('topbar-datetime');
    if (el) el.textContent = `${pad(d.getDate())}:${pad(d.getMonth() + 1)}:${d.getFullYear()}:${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  setInterval(updateClock, 1000);
  updateClock();
}

function initLeaflet() {
  leafletMap = L.map('map', { zoomControl: false, doubleClickZoom: false }).setView([COLOMBIA_LAT, COLOMBIA_LON], 5);

  // Panel de etiquetas por encima de la grilla climática
  const labelsPane = leafletMap.createPane('labels');
  labelsPane.style.zIndex = 450;
  labelsPane.style.pointerEvents = 'none';

  aplicarMapaBaseEnLeaflet(activeBasemapKey2D);

  leafletMap.on('click', e => {
    if (activeDrawTool) return;
    mostrarPopupCelda2D(e.latlng.lat, e.latlng.lng);
  });
  leafletMap.on('mousemove', e => {
    if (currentMode !== '2d') return;
    actualizarHoverChip(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
  });
  leafletMap.on('mouseout', ocultarHoverChip);
}

async function initCesiumIfNeeded() {
  if (cesiumViewer) return;

  cesiumViewer = new Cesium.Viewer('cesiumContainer', {
    baseLayerPicker: false,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    infoBox: false,
    selectionIndicator: false
  });

  cesiumViewer.camera.changed.addEventListener(actualizarBrujula3D);
  cesiumViewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(COLOMBIA_LON, COLOMBIA_LAT, 12000000.0) });
  cesiumViewer.scene.postRender.addEventListener(actualizarPosicionPopUpCesium);
  setupCesiumHandlers();
  cambiarModoNavegacion3D('pan');

  // Sincronizar lo que ya existía antes de crear el visor
  state.assets.forEach(asset => crearGraficosActivo(asset));
  await aplicarMapaBaseEnCesium(activeBasemapKey3D);

  try {
    cesiumViewer.terrainProvider = await Cesium.createWorldTerrainAsync({ requestWaterMask: true, requestVertexNormals: true });
    cesiumViewer.scene.verticalExaggeration = 3.0;
  } catch (err) {
    console.error('Error al cargar Cesium World Terrain:', err);
  }
}

// =========================================================================
// 5. VISTAS 2D / 3D Y MAPAS BASE
// =========================================================================
async function switchView(mode) {
  currentMode = mode;
  desactivarHerramientasActuales();
  ocultarHoverChip();

  const mapDiv = document.getElementById('map');
  const cesiumDiv = document.getElementById('cesiumContainer');
  const btn2d = document.getElementById('btn-2d');
  const btn3d = document.getElementById('btn-3d');
  const on = 'px-3 py-1 rounded-md text-xs font-bold transition-all bg-blue-700 text-white shadow-sm';
  const off = 'px-3 py-1 rounded-md text-xs font-bold transition-all text-slate-300 hover:text-blue-400';

  if (mode === '2d') {
    mapDiv.classList.remove('hidden');
    cesiumDiv.classList.add('hidden');
    btn2d.className = on; btn3d.className = off;
    cerrarCesiumPopup();
    if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 50);
  } else {
    cesiumDiv.classList.remove('hidden');
    mapDiv.classList.add('hidden');
    btn3d.className = on; btn2d.className = off;
    await initCesiumIfNeeded();
    setTimeout(() => { if (cesiumViewer) cesiumViewer.resize(); }, 50);
  }
  renderizarTarjetasMapasBase();
}

function renderizarTarjetasMapasBase() {
  const container = document.getElementById('basemapGridContainer');
  if (!container) return;
  const mapList = currentMode === '2d' ? BASEMAPS_2D : BASEMAPS_3D;
  const activeKey = currentMode === '2d' ? activeBasemapKey2D : activeBasemapKey3D;
  container.innerHTML = '';

  Object.keys(mapList).forEach(key => {
    const item = mapList[key];
    const isActive = key === activeKey;
    const btn = document.createElement('button');
    btn.onclick = () => seleccionarMapaBase(key);
    btn.className = `basemap-card group flex flex-col items-center p-1.5 rounded-xl transition-all cursor-pointer text-left ${
      isActive ? 'border-2 border-blue-500 bg-blue-950/30 active-basemap' : 'border border-slate-800 bg-slate-900/90 hover:border-slate-700 hover:bg-slate-800/50'}`;
    btn.innerHTML = `
      <div class="w-full h-14 rounded-lg overflow-hidden border border-slate-700/60 mb-1.5 relative">
        <img src="${item.thumb}" alt="${escapeHtml(t(item.name))}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
      </div>
      <span class="text-[10px] font-bold text-center leading-tight truncate w-full ${isActive ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}">${escapeHtml(t(item.name))}</span>`;
    container.appendChild(btn);
  });
}

function seleccionarMapaBase(key) {
  if (currentMode === '2d') {
    activeBasemapKey2D = key;
    aplicarMapaBaseEnLeaflet(key);
  } else {
    activeBasemapKey3D = key;
    aplicarMapaBaseEnCesium(key);
  }
  renderizarTarjetasMapasBase();
}

function aplicarMapaBaseEnLeaflet(key) {
  const provider = BASEMAPS_2D[key];
  if (!provider || !leafletMap) return;

  if (currentLeafletTile) leafletMap.removeLayer(currentLeafletTile);
  if (currentLeafletLabels) { leafletMap.removeLayer(currentLeafletLabels); currentLeafletLabels = null; }

  currentLeafletTile = L.tileLayer(provider.url, { attribution: provider.attr, maxZoom: 19, opacity: currentOpacity }).addTo(leafletMap);
  if (provider.labelsUrl) {
    currentLeafletLabels = L.tileLayer(provider.labelsUrl, { maxZoom: 19, opacity: currentOpacity, pane: 'labels' }).addTo(leafletMap);
  }
}

async function aplicarMapaBaseEnCesium(key) {
  if (!cesiumViewer) return;
  const provider = BASEMAPS_3D[key];
  if (!provider) return;
  const layers = cesiumViewer.imageryLayers;

  try {
    // Quitar solo las capas base (la grilla climática se conserva)
    cesiumBaseLayers.forEach(l => layers.remove(l, true));
    cesiumBaseLayers = [];
    cesiumLabelsLayer = null;
    // El visor arranca con una capa por defecto que no está registrada
    if (cesiumGridLayer) {
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers.get(i);
        if (l !== cesiumGridLayer) layers.remove(l, true);
      }
    } else {
      layers.removeAll();
    }

    const added = [];
    if (provider.type === 'ion') {
      added.push(layers.addImageryProvider(await Cesium.createWorldImageryAsync({ style: provider.assetId }), 0));
    } else if (provider.type === 'arcgis-hybrid') {
      added.push(layers.addImageryProvider(await Cesium.ArcGisMapServerImageryProvider.fromUrl(provider.url), 0));
      cesiumLabelsLayer = layers.addImageryProvider(await Cesium.ArcGisMapServerImageryProvider.fromUrl(provider.labelsUrl));
      added.push(cesiumLabelsLayer);
    } else if (provider.type === 'arcgis') {
      added.push(layers.addImageryProvider(await Cesium.ArcGisMapServerImageryProvider.fromUrl(provider.url), 0));
    }
    added.forEach(l => { l.alpha = currentOpacity; });
    cesiumBaseLayers = added;

    if (cesiumLabelsLayer) layers.raiseToTop(cesiumLabelsLayer);
  } catch (error) {
    console.error('Error al cargar mapa en Cesium:', error);
  }
}

function initOpacitySlider() {
  const slider = document.getElementById('opacity-slider');
  const label = document.getElementById('opacity-val');
  if (!slider) return;
  slider.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    currentOpacity = val / 100;
    if (label) label.textContent = `${val}%`;
    if (currentLeafletTile) currentLeafletTile.setOpacity(currentOpacity);
    if (currentLeafletLabels) currentLeafletLabels.setOpacity(currentOpacity);
    cesiumBaseLayers.forEach(l => { l.alpha = currentOpacity; });
  });
}

// =========================================================================
// 6. NAVEGACIÓN
// =========================================================================
function cambiarModoNavegacion3D(modo) {
  if (currentMode !== '3d' || !cesiumViewer) return;
  currentNavMode3D = modo;
  const controller = cesiumViewer.scene.screenSpaceCameraController;
  const btnPan = document.getElementById('btn-mode-pan');
  const btnRotate = document.getElementById('btn-mode-rotate');
  const activeClass = 'w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all shrink-0 shadow-sm';
  const inactiveClass = 'w-7 h-7 rounded-lg bg-slate-900/80 border border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all shrink-0';

  if (modo === 'pan') {
    controller.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
    controller.translateEventTypes = [Cesium.CameraEventType.RIGHT_DRAG];
    controller.tiltEventTypes = [Cesium.CameraEventType.MIDDLE_DRAG, Cesium.CameraEventType.PINCH];
    if (btnPan) btnPan.className = activeClass;
    if (btnRotate) btnRotate.className = inactiveClass;
  } else {
    controller.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
    controller.tiltEventTypes = [Cesium.CameraEventType.LEFT_DRAG, Cesium.CameraEventType.PINCH];
    controller.translateEventTypes = [Cesium.CameraEventType.RIGHT_DRAG];
    if (btnRotate) btnRotate.className = activeClass;
    if (btnPan) btnPan.className = inactiveClass;
  }
}

function resetearNorte() {
  if (currentMode === '3d' && cesiumViewer) {
    cesiumViewer.camera.flyTo({
      destination: cesiumViewer.camera.position,
      orientation: { heading: 0.0, pitch: Cesium.Math.toRadians(-90), roll: 0.0 },
      duration: 0.8
    });
  }
}

function actualizarBrujula3D() {
  if (!cesiumViewer) return;
  const icon = document.querySelector('#btn-orient-north i');
  if (icon) icon.style.transform = `rotate(${-Cesium.Math.toDegrees(cesiumViewer.camera.heading)}deg)`;
}

function zoomInActiveMap() {
  if (currentMode === '2d' && leafletMap) leafletMap.zoomIn();
  else if (cesiumViewer) cesiumViewer.camera.zoomIn(cesiumViewer.camera.positionCartographic.height * 0.4);
}

function zoomOutActiveMap() {
  if (currentMode === '2d' && leafletMap) leafletMap.zoomOut();
  else if (cesiumViewer) cesiumViewer.camera.zoomOut(cesiumViewer.camera.positionCartographic.height * 0.6);
}

function volverAlHome() {
  if (leafletMap) leafletMap.setView([COLOMBIA_LAT, COLOMBIA_LON], 5);
  if (cesiumViewer) cesiumViewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(COLOMBIA_LON, COLOMBIA_LAT, 12000000.0), duration: 1.2 });
}

function volarA(lat, lng, zoom2d = 12, height3d = 15000) {
  if (currentMode === '2d' && leafletMap) leafletMap.flyTo([lat, lng], zoom2d, { duration: 1.2 });
  else if (cesiumViewer) cesiumViewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lng, lat, height3d), duration: 1.5 });
}

function obtenerMiUbicacion() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => volarA(pos.coords.latitude, pos.coords.longitude));
}

// --- Búsqueda (Nominatim / OSM) ---
let searchTimer = null;

function buscarSugerencias() {
  clearTimeout(searchTimer);
  const q = document.getElementById('searchInput')?.value.trim();
  const box = document.getElementById('searchSuggestions');
  if (!box) return;
  if (!q || q.length < 3) { box.classList.add('hidden'); return; }
  searchTimer = setTimeout(async () => {
    const results = await geocodificar(q);
    if (!results.length) { box.classList.add('hidden'); return; }
    box.innerHTML = results.map((r, i) => `
      <div class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-800/70">
        <button class="text-left truncate flex-1 cursor-pointer" onclick="seleccionarSugerencia(${i}, false)">${escapeHtml(r.display_name)}</button>
        <button title="${t('Add as asset')}" class="text-blue-400 hover:text-blue-300 shrink-0 cursor-pointer" onclick="seleccionarSugerencia(${i}, true)"><i class="fa-solid fa-plus text-[10px]"></i></button>
      </div>`).join('');
    box.dataset.results = JSON.stringify(results.map(r => ({ name: r.display_name, lat: +r.lat, lng: +r.lon })));
    box.classList.remove('hidden');
  }, 350);
}

async function geocodificar(q) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'es,en' } });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

function seleccionarSugerencia(i, addAsAsset) {
  const box = document.getElementById('searchSuggestions');
  const r = JSON.parse(box.dataset.results || '[]')[i];
  box.classList.add('hidden');
  if (!r) return;
  if (addAsAsset) agregarPuntoAlSistema(r.name.split(',')[0], r.lat, r.lng, 'Search');
  else volarA(r.lat, r.lng);
}

async function ejecutarBusquedaDirecta() {
  const q = document.getElementById('searchInput')?.value.trim();
  if (!q) return;
  // Coordenadas directas "lat, lon"
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) { volarA(parseFloat(m[1]), parseFloat(m[2])); return; }
  const results = await geocodificar(q);
  document.getElementById('searchSuggestions')?.classList.add('hidden');
  if (results[0]) volarA(+results[0].lat, +results[0].lon);
  else alert(t('No results found for this search.'));
}

// =========================================================================
// 7. CARGA Y PARSEO DE DATOS CLIMÁTICOS
// =========================================================================
function splitCSVLine(line, sep = ',') {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (c === sep && !quoted) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** CSV largo: lat,lon,value[,...] (formato del repo "3.0 Data") */
function parseLongCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = splitCSVLine(lines[0], sep).map(h => h.toLowerCase().replace(/"/g, ''));
  const iLat = headers.findIndex(h => h === 'lat' || h === 'latitude' || h === 'y');
  const iLon = headers.findIndex(h => h === 'lon' || h === 'lng' || h === 'longitude' || h === 'x');
  const iVal = headers.findIndex(h => h === 'value' || h === 'valor');
  if (iLat < 0 || iLon < 0 || iVal < 0) throw new Error(t('The CSV has no lat, lon, value columns.'));

  const points = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVLine(lines[i], sep);
    const lat = parseFloat(c[iLat]), lon = parseFloat(c[iLon]), value = parseFloat(c[iVal]);
    if (isFinite(lat) && isFinite(lon) && isFinite(value)) points.push({ lat, lon, value });
  }
  return points;
}

/** CSV ancho de la API CIE v2: metadatos (clave,valor) y luego la matriz lat x lon */
function parseCieWideCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let start = lines.findIndex(l => /^\s*"?lat\b/i.test(l));
  if (start < 0) start = lines.findIndex((l, i) => i >= 5 && l.split(',').length > 3 && l.split(',').slice(1).every(v => isFinite(parseFloat(v))));
  if (start < 0) throw new Error('Unexpected CIE API format');
  const meta = {};
  lines.slice(0, start).forEach(l => {
    const [k, v] = l.split(',');
    if (k && v !== undefined) meta[k.replace(/[:"]/g, '').trim().toLowerCase()] = v.trim();
  });
  const lons = lines[start].split(',').slice(1).map(h => Number(h.trim()));
  const points = [];
  for (let i = start + 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const lat = Number(cols[0]);
    if (cols[0].trim() === '' || !isFinite(lat)) continue;
    for (let j = 1; j < cols.length; j++) {
      const v = (cols[j] || '').trim();
      if (v === '' || v.toLowerCase() === 'nan') continue;
      const value = Number(v);
      if (isFinite(value) && isFinite(lons[j - 1])) points.push({ lat, lon: lons[j - 1], value });
    }
  }
  const wl = parseFloat(meta['warming level']);
  points.meta = { warmingLevel: isFinite(wl) ? wl : null, reference: parseFloat(meta.reference) || null };
  return points;
}

async function fetchPoints(url, parser) {
  if (!csvCache.has(url)) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
    const p = fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(async res => {
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
      const pts = parser(await res.text());
      if (!pts.length) throw new Error(t('No valid data in {url}', { url }));
      return pts;
    });
    p.catch(() => csvCache.delete(url)); // permitir reintento
    csvCache.set(url, p);
  }
  return csvCache.get(url);
}

/** Construye un índice de grilla regular para búsquedas O(1) */
function buildGrid(points) {
  const uniq = arr => [...new Set(arr.map(v => +v.toFixed(6)))].sort((a, b) => a - b);
  const minStep = arr => {
    let s = Infinity;
    for (let i = 1; i < arr.length; i++) { const d = arr[i] - arr[i - 1]; if (d > 1e-9 && d < s) s = d; }
    return isFinite(s) ? s : 0.5;
  };
  const lats = uniq(points.map(p => p.lat));
  const lons = uniq(points.map(p => p.lon));
  const grid = {
    points,
    resLat: minStep(lats),
    resLon: minStep(lons),
    latMin: lats[0], latMax: lats[lats.length - 1],
    lonMin: lons[0], lonMax: lons[lons.length - 1],
    index: new Map(),
    min: Infinity, max: -Infinity
  };
  points.forEach(p => {
    grid.index.set(gridKey(grid, p.lat, p.lon), p);
    if (p.value < grid.min) grid.min = p.value;
    if (p.value > grid.max) grid.max = p.value;
  });
  return grid;
}

function gridKey(grid, lat, lon) {
  return `${Math.round((lat - grid.latMin) / grid.resLat)}|${Math.round((lon - grid.lonMin) / grid.resLon)}`;
}

/** Celda que contiene exactamente el punto (o null) */
function cellAt(grid, lat, lon) {
  if (!grid) return null;
  return grid.index.get(gridKey(grid, lat, lon)) || null;
}

/** Extracción: celda que contiene el punto o, si no existe, vecino más cercano */
function extractValue(grid, lat, lon) {
  if (!grid) return null;
  const exact = cellAt(grid, lat, lon);
  if (exact) return { value: exact.value, cellLat: exact.lat, cellLon: exact.lon, distKm: haversineKm(lat, lon, exact.lat, exact.lon), exact: true };

  let best = null, bestD = Infinity;
  for (const p of grid.points) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (!best) return null;
  const maxKm = Math.max(grid.resLat, grid.resLon) * 111 * 2; // ~2 celdas
  return { value: best.value, cellLat: best.lat, cellLon: best.lon, distKm: bestD, exact: false, outside: bestD > maxKm };
}

function diffGrid(gA, gB) {
  const pts = [];
  gB.points.forEach(p => {
    const a = gA.index.get(gridKey(gA, p.lat, p.lon));
    if (a) pts.push({ lat: p.lat, lon: p.lon, value: p.value - a.value });
  });
  return buildGrid(pts);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSource() { return SOURCES[state.source]; }
function getScenarios() { return getSource().scenarios(); }
function getVarMeta(v = state.variable) {
  const m = VARIABLES[v];
  if (!m) return { name: v, unit: '', worse: 'high', desc: '' };
  return { ...m, name: t(m.name), desc: t(m.desc), unit: m.unit ? t(m.unit) : '' };
}

/** Carga los dos escenarios de la variable activa y refresca todo */
async function loadClimateData() {
  const token = ++state.loadToken;
  const src = getSource();
  const sc = getScenarios();
  const meta = getVarMeta();

  state.loading = true;
  setClimateStatus(() => `<i class="fa-solid fa-spinner animate-spin"></i> ${t('Loading {name} ({a} / {b})…', { name: getVarMeta().name, a: sc.A.label, b: sc.B.label })}`, 'info');

  try {
    const [ptsA, ptsB] = await Promise.all([
      fetchPoints(src.url(state.variable, sc.A), src.parse),
      fetchPoints(src.url(state.variable, sc.B), src.parse)
    ]);
    if (token !== state.loadToken) return; // llegó una petición más reciente

    state.grids.A = buildGrid(ptsA);
    state.grids.B = buildGrid(ptsB);
    state.wl = { A: ptsA.meta?.warmingLevel ?? null, B: ptsB.meta?.warmingLevel ?? null };
    state.grids.DIFF = diffGrid(state.grids.A, state.grids.B);

    recalcularActivos();
    renderClimateLayer();
    renderPortfolio();
    setClimateStatus(() => {
      const wl = state.source === 'cie_api' && state.wl?.A != null && state.wl?.B != null
        ? ` · ${t('global warming')} +${state.wl.A}°C / +${state.wl.B}°C` : '';
      return `<i class="fa-solid fa-circle-check"></i> ${t('{a} / {b} grid cells · res {res}°', { a: ptsA.length, b: ptsB.length, res: state.grids.A?.resLat })}${wl}`;
    }, 'ok');
  } catch (err) {
    if (token !== state.loadToken) return;
    console.error(err);
    // Respaldo automático: si la API en vivo no responde desde el navegador, usar los mismos datos CIE de GitHub
    if (state.source === 'cie_api' && !state.fallbackUsed) {
      state.fallbackUsed = true;
      state.source = 'github';
      const srcSel = document.getElementById('climate-source');
      if (srcSel) srcSel.value = 'github';
      actualizarOpcionesFuente();
      if (typeof showToast === 'function') showToast(t('The live CIE API did not respond. Showing the same CIE data from the GitHub backup.'), 'error');
      loadClimateData();
      return;
    }
    state.grids = { A: null, B: null, DIFF: null };
    recalcularActivos();
    renderClimateLayer();
    renderPortfolio();
    const help = src.missingHelp || (state.source === 'cie_api'
      ? 'The live CIE API may block browser requests (CORS). Use the GitHub source or a proxy.'
      : 'Check your connection or the file name in the repository.');
    setClimateStatus(() => `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(err.message)}<br><span class="text-slate-400">${t(help)}</span>`, 'error');
  } finally {
    if (token === state.loadToken) state.loading = false;
  }
}

// =========================================================================
// 8. ESCALAS DE COLOR Y FORMATO
// =========================================================================
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function interpRamp(ramp, t) {
  t = Math.min(1, Math.max(0, t));
  const pos = t * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
  return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * f));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Escala de color: divergente centrada en 0 si cruza cero; si no, secuencial. Rojo = peor. */
function makeScale(values, worse, forceDiverging = false) {
  const s = values.filter(isFinite).sort((a, b) => a - b);
  let min = percentile(s, 0.02), max = percentile(s, 0.98);
  if (min === max) { min -= 1e-6; max += 1e-6; }
  const diverging = forceDiverging || (min < 0 && max > 0);
  let ramp;
  if (diverging) {
    const m = Math.max(Math.abs(min), Math.abs(max));
    min = -m; max = m;
    ramp = worse === 'high' ? RAMP_DIV : [...RAMP_DIV].reverse();
  } else {
    ramp = worse === 'high' ? RAMP_SEQ : [...RAMP_SEQ].reverse();
  }
  return {
    min, max, ramp, diverging,
    rgb(v) { return interpRamp(ramp, (v - min) / (max - min)); },
    css(v) { const c = this.rgb(v); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  };
}

function fmtNum(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && a < 0.001) return v.toExponential(2);
  if (a < 1) return v.toFixed(3);
  if (a < 100) return v.toFixed(2);
  return v.toFixed(1);
}

function fmtVal(v, meta = getVarMeta(), signed = false) {
  if (v == null || !isFinite(v)) return '—';
  const s = (signed && v > 0 ? '+' : '') + fmtNum(v);
  if (!meta.unit) return s;
  return meta.unit === '%' ? `${s}%` : `${s} ${meta.unit}`;
}

/** ¿El cambio es desfavorable según la dirección de riesgo de la variable? */
function isWorse(delta, meta = getVarMeta()) {
  return meta.worse === 'high' ? delta > 0 : delta < 0;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// =========================================================================
// 9. CAPA DE GRILLA (Leaflet + Cesium) Y LEYENDA
// =========================================================================
function displayGrid() { return state.grids[state.display]; }

function displayLabel() {
  const sc = getScenarios();
  return state.display === 'DIFF' ? `Δ ${sc.B.short} − ${sc.A.short}` : sc[state.display].label;
}

function computeScale() {
  const meta = getVarMeta();
  if (state.display === 'DIFF') {
    if (!state.grids.DIFF) return null;
    return makeScale(state.grids.DIFF.points.map(p => p.value), meta.worse, true);
  }
  if (!state.grids.A || !state.grids.B) return null;
  // Misma escala para A y B => los mapas son comparables
  return makeScale([...state.grids.A.points, ...state.grids.B.points].map(p => p.value), meta.worse);
}

const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));

/**
 * Rasteriza la grilla en un canvas.
 * projection 'geo'  -> equirectangular (Cesium)
 * projection 'merc' -> Web Mercator (Leaflet imageOverlay)
 */
function renderGridCanvas(grid, scale, projection) {
  // Margen transparente de 1 celda: evita que Cesium estire los píxeles del borde (clamp-to-edge)
  const pad = projection === 'geo' ? 1 : 0;
  const west = grid.lonMin - grid.resLon * (0.5 + pad), east = grid.lonMax + grid.resLon * (0.5 + pad);
  const south = Math.max(-89.9, grid.latMin - grid.resLat * (0.5 + pad)), north = Math.min(89.9, grid.latMax + grid.resLat * (0.5 + pad));
  const ncol = Math.round((east - west) / grid.resLon);
  const nrow = Math.round((north - south) / grid.resLat);
  const px = Math.max(2, Math.min(24, Math.floor(4096 / Math.max(ncol, nrow))));
  const W = ncol * px;

  let H, yOf;
  if (projection === 'merc') {
    const yN = mercY(north), yS = mercY(south);
    H = Math.max(1, Math.round(W * (yN - yS) / ((east - west) * Math.PI / 180)));
    yOf = lat => (yN - mercY(lat)) / (yN - yS) * H;
  } else {
    H = nrow * px;
    yOf = lat => (north - lat) / (north - south) * H;
  }

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(15,23,42,0.35)';

  grid.points.forEach(p => {
    const x0 = Math.floor((p.lon - grid.resLon / 2 - west) / (east - west) * W);
    const x1 = Math.ceil((p.lon + grid.resLon / 2 - west) / (east - west) * W);
    const y0 = Math.floor(yOf(p.lat + grid.resLat / 2));
    const y1 = Math.ceil(yOf(p.lat - grid.resLat / 2));
    ctx.fillStyle = scale.css(p.value);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (state.gridBorders && px >= 6) ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  });

  return { url: canvas.toDataURL('image/png'), west, east, south, north };
}

function renderClimateLayer() {
  ocultarHoverChip();
  const grid = displayGrid();
  state.scale = grid ? computeScale() : null;

  // --- Leaflet ---
  if (leafletGridOverlay) { leafletMap.removeLayer(leafletGridOverlay); leafletGridOverlay = null; }
  if (grid && state.scale && state.gridVisible && leafletMap) {
    const img = renderGridCanvas(grid, state.scale, 'merc');
    leafletGridOverlay = L.imageOverlay(img.url, [[img.south, img.west], [img.north, img.east]], {
      opacity: state.gridOpacity, interactive: false, className: 'climate-grid-overlay'
    }).addTo(leafletMap);
  }

  renderCesiumGrid();
  renderLegend();
  actualizarEstiloActivos();
}

async function renderCesiumGrid() {
  if (!cesiumViewer) return;
  const token = ++cesiumGridToken;
  const layers = cesiumViewer.imageryLayers;
  if (cesiumGridLayer) { layers.remove(cesiumGridLayer, true); cesiumGridLayer = null; }

  const grid = displayGrid();
  if (!grid || !state.scale || !state.gridVisible) return;

  const img = renderGridCanvas(grid, state.scale, 'geo');
  const rectangle = Cesium.Rectangle.fromDegrees(img.west, img.south, img.east, img.north);
  try {
    const provider = Cesium.SingleTileImageryProvider.fromUrl
      ? await Cesium.SingleTileImageryProvider.fromUrl(img.url, { rectangle })
      : new Cesium.SingleTileImageryProvider({ url: img.url, rectangle });
    if (token !== cesiumGridToken) return;
    cesiumGridLayer = layers.addImageryProvider(provider);
    cesiumGridLayer.alpha = state.gridOpacity;
    cesiumGridLayer.magnificationFilter = Cesium.TextureMagnificationFilter.NEAREST;
    if (cesiumLabelsLayer) layers.raiseToTop(cesiumLabelsLayer);
  } catch (err) {
    console.error('Error al crear la grilla en Cesium:', err);
  }
}

function setGridOpacity(val) {
  state.gridOpacity = val;
  if (leafletGridOverlay) leafletGridOverlay.setOpacity(val);
  if (cesiumGridLayer) cesiumGridLayer.alpha = val;
}

function renderLegend() {
  let el = document.getElementById('climate-legend');
  if (!el) {
    el = document.createElement('div');
    el.id = 'climate-legend';
    el.className = 'absolute top-20 right-[310px] z-30 w-56 bg-[#0f172a]/85 backdrop-blur-md border border-slate-800/90 rounded-xl shadow-2xl p-2.5 text-slate-200';
    document.body.appendChild(el);
  }
  const s = state.scale;
  if (!s || !state.gridVisible) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');

  const meta = getVarMeta();
  const sc = getScenarios();
  const gradient = `linear-gradient(to right, ${s.ramp.join(',')})`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => s.min + (s.max - s.min) * t);
  const unit = meta.unit ? ` (${meta.unit})` : '';
  const scenarioNote = state.display === 'DIFF' ? `${sc.B.note} vs ${sc.A.note}` : sc[state.display].note;

  el.innerHTML = `
    <div class="flex items-start justify-between gap-2 mb-1.5">
      <div class="min-w-0">
        <div class="text-[10px] font-bold text-white leading-tight truncate" title="${escapeHtml(meta.name)}">${escapeHtml(meta.name)}${unit}</div>
        <div class="text-[9px] text-slate-400">${escapeHtml(displayLabel())} · ${escapeHtml(scenarioNote)}</div>
      </div>
      <span class="text-[8px] px-1.5 py-0.5 rounded border ${meta.type === 'Acute' ? 'border-rose-500/40 text-rose-300' : 'border-amber-500/40 text-amber-300'}">${t(meta.type || '')}</span>
    </div>
    <div class="h-2.5 rounded-sm border border-slate-700" style="background:${gradient}"></div>
    <div class="flex justify-between text-[8px] font-mono text-slate-300 mt-1">
      ${ticks.map((t, i) => `<span>${i === 0 ? '≤' : i === 4 ? '≥' : ''}${fmtNum(t)}</span>`).join('')}
    </div>
    <div class="flex justify-between text-[8px] text-slate-500 mt-1">
      <span>${t(meta.worse === 'high' ? 'lower risk' : 'higher risk')}</span>
      <span>${t(meta.worse === 'high' ? 'higher risk' : 'lower risk')}</span>
    </div>
    <div class="text-[8px] text-slate-500 mt-1 border-t border-slate-800 pt-1">${t('Source')}: ${escapeHtml(t(getSource().label))} · ${t('{n} cells', { n: state.grids[state.display]?.points.length || 0 })}</div>`;
}

// --- Chip flotante con el valor de la celda bajo el cursor ---
function initHoverChip() {
  if (document.getElementById('grid-hover-chip')) return;
  const chip = document.createElement('div');
  chip.id = 'grid-hover-chip';
  chip.className = 'hidden fixed z-[60] pointer-events-none bg-slate-950/90 border border-slate-700 rounded-md px-2 py-1 text-[10px] text-slate-100 font-mono shadow-xl';
  document.body.appendChild(chip);
}

function actualizarHoverChip(lat, lon, clientX, clientY) {
  const chip = document.getElementById('grid-hover-chip');
  const grid = displayGrid();
  if (!chip || !grid || !state.gridVisible || activeDrawTool) { ocultarHoverChip(); return; }
  const cell = cellAt(grid, lat, lon);
  if (!cell) { ocultarHoverChip(); return; }
  chip.innerHTML = `<span class="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style="background:${state.scale.css(cell.value)}"></span>${fmtVal(cell.value, getVarMeta(), state.display === 'DIFF')} <span class="text-slate-500">${cell.lat.toFixed(2)}, ${cell.lon.toFixed(2)}</span>`;
  chip.style.left = `${clientX + 14}px`;
  chip.style.top = `${clientY + 14}px`;
  chip.classList.remove('hidden');
}

function ocultarHoverChip() { document.getElementById('grid-hover-chip')?.classList.add('hidden'); }

// --- Consulta de celda al hacer clic ---
function cellPopupHTML(lat, lon) {
  const meta = getVarMeta();
  const sc = getScenarios();
  const a = cellAt(state.grids.A, lat, lon);
  const b = cellAt(state.grids.B, lat, lon);
  if (!a && !b) return null;
  const ref = a || b;
  const d = a && b ? b.value - a.value : null;
  return `
    <div class="font-sans pr-4 text-slate-900">
      <div class="flex items-center gap-1.5 mb-1">
        <i class="fa-solid fa-table-cells text-blue-600 text-xs"></i>
        <h4 class="font-bold text-xs text-slate-800 m-0">${escapeHtml(meta.name)}</h4>
      </div>
      <div class="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-200 pt-1 mt-1">
        <p class="m-0"><b>${sc.A.label}:</b> ${fmtVal(a?.value, meta)}</p>
        <p class="m-0"><b>${sc.B.label}:</b> ${fmtVal(b?.value, meta)}</p>
        <p class="m-0"><b>Δ:</b> <span style="color:${d != null && isWorse(d, meta) ? '#dc2626' : '#059669'}">${fmtVal(d, meta, true)}</span></p>
        <p class="m-0 text-[10px] text-slate-400">${t('Cell center')}: ${ref.lat.toFixed(2)}, ${ref.lon.toFixed(2)}</p>
      </div>
    </div>`;
}

function mostrarPopupCelda2D(lat, lon) {
  if (!state.gridVisible || !displayGrid()) return;
  const html = cellPopupHTML(lat, lon);
  if (html) L.popup({ maxWidth: 260 }).setLatLng([lat, lon]).setContent(html).openOn(leafletMap);
}

// =========================================================================
// 10. CONTROLES DEL WIDGET "CLIMATE DATA"
// =========================================================================
function initClimateControls() {
  const srcSel = document.getElementById('climate-source');
  if (srcSel) {
    srcSel.innerHTML = Object.entries(SOURCES).map(([k, s]) => `<option value="${k}">${t(s.label)}</option>`).join('');
    srcSel.value = state.source;
    srcSel.addEventListener('change', () => {
      state.source = srcSel.value;
      if (!getSource().variables.includes(state.variable)) state.variable = getSource().variables[0];
      poblarSelectorVariables();
      actualizarOpcionesFuente();
      loadClimateData();
    });
  }

  document.getElementById('climate-variable')?.addEventListener('change', e => {
    state.variable = e.target.value;
    actualizarDescripcionVariable();
    loadClimateData();
  });

  document.getElementById('climate-rcp')?.addEventListener('change', e => { state.cieRcp = e.target.value; renderScenarioButtons(); loadClimateData(); });
  document.getElementById('climate-giri-rp')?.addEventListener('change', e => { state.giriRP = +e.target.value; renderScenarioButtons(); loadClimateData(); });

  document.getElementById('climate-grid-visible')?.addEventListener('change', e => {
    state.gridVisible = e.target.checked;
    if (!state.gridVisible) ocultarHoverChip();
    renderClimateLayer();
  });
  document.getElementById('climate-grid-borders')?.addEventListener('change', e => { state.gridBorders = e.target.checked; renderClimateLayer(); });

  const op = document.getElementById('climate-grid-opacity');
  if (op) {
    op.value = Math.round(state.gridOpacity * 100);
    op.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      const lbl = document.getElementById('climate-grid-opacity-val');
      if (lbl) lbl.textContent = `${v}%`;
      setGridOpacity(v / 100);
    });
  }

  poblarSelectorVariables();
  actualizarOpcionesFuente();
}

function poblarSelectorVariables() {
  const sel = document.getElementById('climate-variable');
  if (!sel) return;
  const vars = getSource().variables;
  const groups = { Acute: [], Chronic: [] };
  vars.forEach(v => (groups[getVarMeta(v).type] || groups.Chronic).push(v));
  sel.innerHTML = Object.entries(groups).filter(([, list]) => list.length).map(([g, list]) =>
    `<optgroup label="${t(g + ' hazards')}">${list.map(v => `<option value="${v}">${getVarMeta(v).name}</option>`).join('')}</optgroup>`).join('');
  sel.value = state.variable;
  actualizarDescripcionVariable();
}

function actualizarDescripcionVariable() {
  const el = document.getElementById('climate-var-desc');
  const meta = getVarMeta();
  if (el) el.textContent = `${meta.desc}${meta.unit ? ` ${t('Units')}: ${meta.unit}.` : ''}`;
}

function actualizarOpcionesFuente() {
  document.getElementById('climate-cie-options')?.classList.toggle('hidden', state.source !== 'cie_api');
  document.getElementById('climate-giri-options')?.classList.toggle('hidden', state.source !== 'giri');
  renderScenarioButtons();
}

function renderScenarioButtons() {
  const box = document.getElementById('climate-scenario-buttons');
  if (!box) return;
  const sc = getScenarios();
  const opts = [
    { key: 'A', label: sc.A.short, title: `${sc.A.label} (${sc.A.note})` },
    { key: 'B', label: sc.B.short, title: `${sc.B.label} (${sc.B.note})` },
    { key: 'DIFF', label: t('Δ Change'), title: `${sc.B.label} − ${sc.A.label}` }
  ];
  box.innerHTML = opts.map(o => `
    <button type="button" title="${escapeHtml(o.title)}" onclick="seleccionarEscenario('${o.key}')"
      class="flex-1 py-0.5 rounded transition-colors ${state.display === o.key ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}">${o.label}</button>`).join('');
}

function seleccionarEscenario(key) {
  state.display = key;
  renderScenarioButtons();
  renderClimateLayer();
  renderPortfolio();
  if (cesiumPopupAssetId == null && cesiumPopupPosition) cerrarCesiumPopup();
}

let lastClimateStatus = null;
function setClimateStatus(html, kind = 'info') {
  const el = document.getElementById('climate-status');
  if (!el) return;
  lastClimateStatus = [html, kind];
  if (typeof html === 'function') html = html();
  const color = { info: 'text-blue-300', ok: 'text-emerald-400', error: 'text-rose-400' }[kind];
  el.className = `text-[9px] leading-relaxed px-0.5 ${color}`;
  el.innerHTML = html;
}

function zoomToClimateLayer() {
  const g = displayGrid();
  if (!g) return;
  const w = g.lonMin - g.resLon / 2, e = g.lonMax + g.resLon / 2, s = g.latMin - g.resLat / 2, n = g.latMax + g.resLat / 2;
  if (currentMode === '2d' && leafletMap) leafletMap.flyToBounds([[s, w], [n, e]], { duration: 1 });
  else if (cesiumViewer) cesiumViewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(w, s, e, n), duration: 1.2 });
}

// =========================================================================
// 11. ACTIVOS (PUNTOS) — EMBUDO ÚNICO
// =========================================================================
function nuevoId() { return 'loc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }

/** Embudo único para cualquier punto (manual, archivo, búsqueda, herramienta de dibujo) */
function agregarPuntoAlSistema(name, lat, lng, source = 'Manual', opts = {}) {
  const latNum = parseFloat(lat), lngNum = parseFloat(lng);
  if (!isFinite(latNum) || !isFinite(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) return null;

  const asset = {
    id: nuevoId(),
    name: (name && String(name).trim()) || `Asset-${state.assets.length + 1}`,
    lat: latNum,
    lng: lngNum,
    source,
    enabled: true
  };
  calcularValoresActivo(asset);
  state.assets.push(asset);
  crearGraficosActivo(asset);

  if (!opts.silent) {
    actualizarEstiloActivos();
    renderActiveLayers();
    renderPortfolio();
    abrirPanelConsultas();
    zoomToLocation(asset.id);
  }
  return asset;
}

function finalizarCargaMasiva() {
  actualizarEstiloActivos();
  renderActiveLayers();
  renderPortfolio();
}

function calcularValoresActivo(asset) {
  asset.matchA = extractValue(state.grids.A, asset.lat, asset.lng);
  asset.matchB = extractValue(state.grids.B, asset.lat, asset.lng);
  asset.vA = asset.matchA && !asset.matchA.outside ? asset.matchA.value : null;
  asset.vB = asset.matchB && !asset.matchB.outside ? asset.matchB.value : null;
  asset.diff = asset.vA != null && asset.vB != null ? asset.vB - asset.vA : null;
}

function recalcularActivos() { state.assets.forEach(calcularValoresActivo); }

function activosActivos() { return state.assets.filter(a => a.enabled); }

/** Valor del activo según el modo de visualización */
function valorMostrado(a) { return state.display === 'A' ? a.vA : state.display === 'DIFF' ? a.diff : a.vB; }

/** Nivel de riesgo relativo (terciles del escenario B, según dirección de riesgo) */
function calcularTiers() {
  const meta = getVarMeta();
  const vals = activosActivos().map(a => a.vB).filter(v => v != null).sort((a, b) => a - b);
  const tiers = {};
  state.assets.forEach(a => {
    if (a.vB == null || vals.length === 0) { tiers[a.id] = 'NA'; return; }
    const q1 = percentile(vals, 0.33), q2 = percentile(vals, 0.67);
    const v = a.vB;
    let t = v >= q2 ? 'HIGH' : v >= q1 ? 'MEDIUM' : 'LOW';
    if (meta.worse === 'low') t = v <= q1 ? 'HIGH' : v <= q2 ? 'MEDIUM' : 'LOW';
    if (vals.length === 1) t = 'MEDIUM';
    tiers[a.id] = t;
  });
  return tiers;
}

function crearGraficosActivo(asset) {
  if (leafletMap && !asset.marker2D) {
    asset.marker2D = L.circleMarker([asset.lat, asset.lng], {
      radius: 7, color: '#ffffff', weight: 1.5, fillColor: TIER_COLORS.NA, fillOpacity: 0.95, bubblingMouseEvents: false
    }).bindTooltip(escapeHtml(asset.name), { permanent: true, direction: 'top', offset: [0, -8], className: 'asset-label' })
      .bindPopup(() => assetPopupHTML(asset), { maxWidth: 280 });
    if (asset.enabled) asset.marker2D.addTo(leafletMap);
  }

  if (cesiumViewer && !asset.entity3D) {
    asset.entity3D = cesiumViewer.entities.add({
      id: asset.id,
      name: asset.name,
      show: asset.enabled,
      position: Cesium.Cartesian3.fromDegrees(asset.lng, asset.lat, 0),
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString(TIER_COLORS.NA),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: asset.name,
        font: 'bold 12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0d1f2d'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000000)
      }
    });
  }
}

function actualizarEstiloActivos() {
  const tiers = calcularTiers();
  state.assets.forEach(a => {
    const color = TIER_COLORS[tiers[a.id]];
    a.tier = tiers[a.id];
    if (a.marker2D) a.marker2D.setStyle({ fillColor: color });
    if (a.entity3D) a.entity3D.point.color = Cesium.Color.fromCssColorString(color);
  });
  if (cesiumPopupAssetId) {
    const a = state.assets.find(x => x.id === cesiumPopupAssetId);
    if (a) document.getElementById('cesium-popup-content').innerHTML = assetPopupHTML(a);
  }
}

function assetPopupHTML(asset) {
  const meta = getVarMeta();
  const sc = getScenarios();
  const m = asset.matchB || asset.matchA;
  let matchTxt = t('No climate data loaded');
  if (m) {
    matchTxt = m.outside
      ? `<span class="text-rose-500">${t('Outside data coverage ({km} km to nearest cell)', { km: m.distKm.toFixed(0) })}</span>`
      : `${t(m.exact ? 'Grid cell' : 'Nearest cell')} ${m.cellLat.toFixed(2)}, ${m.cellLon.toFixed(2)} · ${m.distKm.toFixed(1)} km`;
  }
  const tierColor = TIER_COLORS[asset.tier || 'NA'];
  return `
    <div class="font-sans pr-4 text-slate-900 min-w-[210px]">
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="flex items-center gap-1.5">
          <i class="fa-solid fa-industry text-blue-600 text-xs"></i>
          <h4 class="font-bold text-xs text-slate-800 m-0">${escapeHtml(asset.name)}</h4>
        </div>
        ${asset.tier && asset.tier !== 'NA' ? `<span class="text-[9px] font-bold px-1.5 rounded" style="color:${tierColor};border:1px solid ${tierColor}">${t(asset.tier)}</span>` : ''}
      </div>
      <div class="text-[10px] text-slate-500 mb-1">${escapeHtml(meta.name)}</div>
      <div class="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-200 pt-1">
        <p class="m-0"><b>${sc.A.label}:</b> ${fmtVal(asset.vA, meta)}</p>
        <p class="m-0"><b>${sc.B.label}:</b> ${fmtVal(asset.vB, meta)}</p>
        <p class="m-0"><b>${t('Change')}:</b> <span style="color:${asset.diff != null && isWorse(asset.diff, meta) ? '#dc2626' : '#059669'}">${fmtVal(asset.diff, meta, true)}</span></p>
        <p class="m-0 text-[10px] text-slate-500">${matchTxt}</p>
        <p class="m-0 text-[10px] text-slate-400">Lat/Lon: ${asset.lat.toFixed(5)}, ${asset.lng.toFixed(5)}</p>
        <p class="m-0 text-[10px] text-slate-400"><b>${t('Origin')}:</b> ${escapeHtml(t(asset.source))}</p>
      </div>
    </div>`;
}

// --- Entrada manual ---
function switchCoordType(type) {
  activeCoordType = type;
  const tabDD = document.getElementById('tab-coord-dd');
  const tabGMS = document.getElementById('tab-coord-gms');
  const on = 'flex-1 py-0.5 font-bold rounded bg-blue-600 text-white transition-colors';
  const off = 'flex-1 py-0.5 text-slate-400 hover:text-white transition-colors';
  tabDD.className = type === 'dd' ? on : off;
  tabGMS.className = type === 'gms' ? on : off;
  document.getElementById('form-coord-dd').classList.toggle('hidden', type !== 'dd');
  document.getElementById('form-coord-gms').classList.toggle('hidden', type !== 'gms');
}

function dmsToDecimal(degrees, minutes, seconds, direction) {
  const dec = Math.abs(parseFloat(degrees) || 0) + (parseFloat(minutes) || 0) / 60 + (parseFloat(seconds) || 0) / 3600;
  return direction === 'S' || direction === 'W' ? -dec : dec;
}

function addManualLocation() {
  const val = id => document.getElementById(id)?.value ?? '';
  const name = val('manual-name').trim();
  let lat, lng;

  if (activeCoordType === 'dd') {
    lat = parseFloat(val('manual-lat'));
    lng = parseFloat(val('manual-lng'));
  } else {
    if (!val('lat-deg') || !val('lng-deg')) { alert(t('Enter at least the latitude and longitude degrees.')); return; }
    lat = dmsToDecimal(val('lat-deg'), val('lat-min'), val('lat-sec'), val('lat-dir'));
    lng = dmsToDecimal(val('lng-deg'), val('lng-min'), val('lng-sec'), val('lng-dir'));
  }

  if (!isFinite(lat) || !isFinite(lng)) { alert(t('Please enter valid coordinates.')); return; }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) { alert(t('Coordinates are out of the valid range.')); return; }

  agregarPuntoAlSistema(name, lat, lng, 'Manual');

  ['manual-name', 'manual-lat', 'manual-lng', 'lat-deg', 'lat-min', 'lat-sec', 'lng-deg', 'lng-min', 'lng-sec']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// --- Lista de capas/activos (panel izquierdo) ---
function renderActiveLayers() {
  const container = document.getElementById('contenedor-capas');
  if (!container) return;
  if (!state.assets.length) {
    container.innerHTML = `<p id="empty-layers-msg" class="text-[10px] text-slate-500 text-center py-2">${t('No active assets loaded.')}</p>`;
    return;
  }
  container.innerHTML = state.assets.map(loc => `
    <div class="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-colors group">
      <div class="flex items-center gap-2 truncate pr-2">
        <input type="checkbox" ${loc.enabled ? 'checked' : ''} onchange="toggleLocationVisibility('${loc.id}', this.checked)" class="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer">
        <span class="w-2 h-2 rounded-full shrink-0" style="background:${TIER_COLORS[loc.tier || 'NA']}"></span>
        <span class="text-[11px] font-medium text-slate-300 truncate cursor-pointer hover:text-white" onclick="zoomToLocation('${loc.id}')" title="${escapeHtml(t(loc.source))}">${escapeHtml(loc.name)}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-[9px] text-slate-500 font-mono">(${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)})</span>
        <button onclick="deleteLocation(event, '${loc.id}')" class="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors opacity-80 group-hover:opacity-100 cursor-pointer" title="${t('Delete')}">
          <i class="fa-solid fa-trash-can text-[10px] pointer-events-none"></i>
        </button>
      </div>
    </div>`).join('');
}

function toggleLocationVisibility(id, visible) {
  const a = state.assets.find(x => x.id === id);
  if (!a) return;
  a.enabled = visible;
  if (a.marker2D && leafletMap) visible ? a.marker2D.addTo(leafletMap) : leafletMap.removeLayer(a.marker2D);
  if (a.entity3D) a.entity3D.show = visible;
  if (!visible && cesiumPopupAssetId === id) cerrarCesiumPopup();
  actualizarEstiloActivos();
  renderActiveLayers();
  renderPortfolio();
}

function zoomToLocation(id) {
  const a = state.assets.find(x => x.id === id);
  if (!a) return;
  if (currentMode === '2d' && leafletMap) {
    leafletMap.flyTo([a.lat, a.lng], 11, { duration: 1.2 });
    if (a.enabled && a.marker2D) setTimeout(() => a.marker2D.openPopup(), 1300);
  } else if (cesiumViewer) {
    cesiumViewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(a.lng, a.lat, 60000.0), duration: 1.5 });
    if (a.enabled) mostrarCesiumPopupActivo(a);
  }
}

function deleteLocation(event, id) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const a = state.assets.find(x => x.id === id);
  if (!a) return;
  if (a.marker2D && leafletMap) leafletMap.removeLayer(a.marker2D);
  if (a.entity3D && cesiumViewer) cesiumViewer.entities.remove(a.entity3D);
  if (cesiumPopupAssetId === id) cerrarCesiumPopup();
  state.assets = state.assets.filter(x => x.id !== id);
  actualizarEstiloActivos();
  renderActiveLayers();
  renderPortfolio();
}

// =========================================================================
// 12. POP-UP Y EVENTOS EN CESIUM
// =========================================================================
function setupCesiumHandlers() {
  const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

  handler.setInputAction(movement => {
    if (activeDrawTool) return;
    const picked = cesiumViewer.scene.pick(movement.position);
    if (Cesium.defined(picked) && picked.id) {
      const a = state.assets.find(x => x.id === picked.id.id);
      if (a) { mostrarCesiumPopupActivo(a); return; }
    }
    // Consulta de celda de la grilla
    const coord = obtenerLatLonCesium(movement.position);
    const html = coord && state.gridVisible && displayGrid() ? cellPopupHTML(coord.lat, coord.lng) : null;
    if (html) mostrarCesiumPopupEn(Cesium.Cartesian3.fromDegrees(coord.lng, coord.lat, 0), html, null);
    else cerrarCesiumPopup();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  let pending = false;
  handler.setInputAction(movement => {
    if (pending || currentMode !== '3d') return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const cart = cesiumViewer.camera.pickEllipsoid(movement.endPosition, cesiumViewer.scene.globe.ellipsoid);
      if (!cart) { ocultarHoverChip(); return; }
      const c = Cesium.Cartographic.fromCartesian(cart);
      const rect = cesiumViewer.canvas.getBoundingClientRect();
      actualizarHoverChip(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude),
        rect.left + movement.endPosition.x, rect.top + movement.endPosition.y);
    });
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

function mostrarCesiumPopupActivo(asset) {
  mostrarCesiumPopupEn(Cesium.Cartesian3.fromDegrees(asset.lng, asset.lat, 0), assetPopupHTML(asset), asset.id);
}

function mostrarCesiumPopupEn(position, html, assetId) {
  const container = document.getElementById('cesium-popup-container');
  const content = document.getElementById('cesium-popup-content');
  if (!container || !content) return;
  cesiumPopupPosition = position;
  cesiumPopupAssetId = assetId;
  content.innerHTML = html;
  container.classList.remove('hidden');
  actualizarPosicionPopUpCesium();
}

function actualizarPosicionPopUpCesium() {
  const container = document.getElementById('cesium-popup-container');
  if (!container) return;
  if (!cesiumPopupPosition || container.classList.contains('hidden') || currentMode !== '3d') {
    container.style.display = 'none';
    return;
  }
  const win = Cesium.SceneTransforms.wgs84ToWindowCoordinates(cesiumViewer.scene, cesiumPopupPosition);
  if (!Cesium.defined(win) || Cesium.Cartesian3.distance(cesiumViewer.camera.position, cesiumPopupPosition) > 25000000) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  container.style.left = `${win.x}px`;
  container.style.top = `${win.y - 18}px`;
}

function cerrarCesiumPopup() {
  cesiumPopupPosition = null;
  cesiumPopupAssetId = null;
  const container = document.getElementById('cesium-popup-container');
  if (container) { container.classList.add('hidden'); container.style.display = 'none'; }
}

// =========================================================================
// 13. PANEL DERECHO — PORTAFOLIO
// =========================================================================
function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

function abrirPanelConsultas() {
  const body = document.getElementById('consultas-panel-body');
  if (body && body.classList.contains('hidden')) toggleConsultasPanel();
}

function renderPortfolio() {
  const meta = getVarMeta();
  const sc = getScenarios();
  const data = activosActivos().filter(a => a.vA != null || a.vB != null);

  // Etiquetas dinámicas
  setText('metric-label-a', `${t('Avg.')} · ${sc.A.label}`);
  setText('metric-label-b', `${t('Avg.')} · ${sc.B.label}`);
  setText('metric-label-change', t('Avg. change ({a} → {b})', { a: sc.A.short, b: sc.B.short }));
  setText('th-col-a', sc.A.short);
  setText('th-col-b', sc.B.short);
  setText('th-col-diff', 'Δ');
  setText('risk-label-max', t('Highest exposure ({s})', { s: sc.B.short }));
  setText('risk-label-min', t('Most resilient ({s})', { s: sc.B.short }));
  const varLabel = document.getElementById('portfolio-variable-label');
  if (varLabel) varLabel.textContent = `${meta.name}${meta.unit ? ` (${meta.unit})` : ''} · ${t('{n} asset(s)', { n: data.length })}`;

  const metricA = document.getElementById('metric-p2030');
  const metricB = document.getElementById('metric-p2050');
  const changeEl = document.getElementById('metric-change');
  const tbody = document.getElementById('asset-productivity-list');

  if (!data.length) {
    if (metricA) { metricA.textContent = '—'; if (metricA.nextElementSibling) metricA.nextElementSibling.textContent = t('No data'); }
    if (metricB) { metricB.textContent = '—'; if (metricB.nextElementSibling) metricB.nextElementSibling.textContent = t('No data'); }
    if (changeEl) changeEl.textContent = '—';
    setText('plant-max-exposure', '—'); setText('plant-resilient', '—');
    setText('risk-max-value', ''); setText('risk-min-value', '');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="py-2 text-center text-slate-500">${state.loading ? t('Loading…') : t('No assets with data for this layer.')}</td></tr>`;
    const chart = document.getElementById('chart-asset-productivity');
    if (chart) chart.innerHTML = `<span class="text-[9px] text-slate-500 italic">${t('No data')}</span>`;
    setText('risk-description', meta.desc);
    return;
  }

  // 1. Métricas
  const stats = vals => {
    const v = vals.filter(x => x != null);
    return v.length ? { avg: v.reduce((s, x) => s + x, 0) / v.length, min: Math.min(...v), max: Math.max(...v) } : null;
  };
  const sA = stats(data.map(a => a.vA)), sB = stats(data.map(a => a.vB));
  if (metricA) {
    metricA.textContent = fmtVal(sA?.avg, meta);
    if (metricA.nextElementSibling) metricA.nextElementSibling.textContent = sA ? `${t('Range')}: ${fmtNum(sA.min)} – ${fmtNum(sA.max)}` : '—';
  }
  if (metricB) {
    metricB.textContent = fmtVal(sB?.avg, meta);
    if (metricB.nextElementSibling) metricB.nextElementSibling.textContent = sB ? `${t('Range')}: ${fmtNum(sB.min)} – ${fmtNum(sB.max)}` : '—';
  }
  if (changeEl && sA && sB) {
    const d = sB.avg - sA.avg;
    changeEl.textContent = fmtVal(d, meta, true);
    changeEl.className = `text-xs font-bold font-mono ${isWorse(d, meta) ? 'text-rose-400' : 'text-emerald-400'}`;
  }

  // 2. Riesgo (según dirección de riesgo de la variable, escenario B)
  const withB = data.filter(a => a.vB != null);
  if (withB.length) {
    const sorted = [...withB].sort((a, b) => meta.worse === 'high' ? b.vB - a.vB : a.vB - b.vB);
    const worst = sorted[0], best = sorted[sorted.length - 1];
    setText('plant-max-exposure', worst.name);
    setText('plant-resilient', best.name);
    setText('risk-max-value', fmtVal(worst.vB, meta));
    setText('risk-min-value', fmtVal(best.vB, meta));
  }
  const highCount = data.filter(a => a.tier === 'HIGH').length;
  const worsening = data.filter(a => a.diff != null && isWorse(a.diff, meta)).length;
  setText('risk-description',
    `${meta.desc} ${t('{w} of {n} assets worsen from {a} to {b}; {h} in the high-exposure tier.', { w: worsening, n: data.length, a: sc.A.short, b: sc.B.short, h: highCount })}`);

  // 3. Comparación
  const sortOption = document.getElementById('select-sort-assets')?.value || 'risk-desc';
  const riskKey = a => (a.vB ?? -Infinity) * (meta.worse === 'high' ? 1 : -1);
  let sorted = [...data];
  if (sortOption === 'risk-desc') sorted.sort((a, b) => riskKey(b) - riskKey(a));
  else if (sortOption === 'risk-asc') sorted.sort((a, b) => riskKey(a) - riskKey(b));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));

  if (tbody) {
    tbody.innerHTML = sorted.map(a => {
      const dCls = a.diff == null ? 'text-slate-500' : isWorse(a.diff, meta) ? 'text-rose-400' : 'text-emerald-400';
      const approx = a.matchB && !a.matchB.exact ? `<span class="text-slate-500" title="${t('Nearest grid cell')}">≈</span>` : '';
      return `
        <tr class="hover:bg-slate-800/40 transition-colors cursor-pointer" onclick="zoomToLocation('${a.id}')">
          <td class="py-1 px-1.5 font-medium text-slate-200 truncate max-w-[80px]" title="${escapeHtml(a.name)}">
            <span class="inline-block w-1.5 h-1.5 rounded-full mr-1" style="background:${TIER_COLORS[a.tier || 'NA']}"></span>${escapeHtml(a.name)}</td>
          <td class="py-1 px-1">${approx}${fmtNum(a.vA)}</td>
          <td class="py-1 px-1 text-amber-400 font-semibold">${fmtNum(a.vB)}</td>
          <td class="py-1 px-1 text-right ${dCls} font-mono font-bold">${a.diff == null ? '—' : (a.diff > 0 ? '+' : '') + fmtNum(a.diff)}</td>
        </tr>`;
    }).join('');
  }

  renderMiniChart(sorted, sc);
}

/** Barras agrupadas A/B con eje en cero (soporta valores negativos) */
function renderMiniChart(data, sc) {
  const el = document.getElementById('chart-asset-productivity');
  if (!el) return;
  const W = 260, H = 100, padT = 12, padB = 14;
  const vals = data.flatMap(a => [a.vA, a.vB]).filter(v => v != null);
  const vmax = Math.max(0, ...vals), vmin = Math.min(0, ...vals);
  const span = vmax - vmin || 1;
  const y = v => padT + (vmax - v) / span * (H - padT - padB);
  const n = data.length;
  const slot = W / n;
  const bw = Math.max(2, Math.min(12, slot * 0.35));

  const bars = data.map((a, i) => {
    const cx = slot * i + slot / 2;
    const bar = (v, x, color, label) => v == null ? '' :
      `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${bw}" height="${Math.max(1, Math.abs(y(v) - y(0)))}" fill="${color}" rx="1"><title>${escapeHtml(a.name)} · ${label}: ${fmtNum(v)}</title></rect>`;
    return `${bar(a.vA, cx - bw - 0.5, '#F4A261', sc.A.short)}${bar(a.vB, cx + 0.5, '#E63946', sc.B.short)}
      <text x="${cx}" y="${H - 3}" font-size="7" fill="${isLightTheme() ? '#475569' : '#94a3b8'}" text-anchor="middle">${escapeHtml(a.name.substring(0, 4))}</text>`;
  }).join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-full" preserveAspectRatio="none">
      <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="${isLightTheme() ? '#cbd5e1' : '#334155'}" stroke-width="0.6"/>
      ${bars}
      <g font-size="7" fill="${isLightTheme() ? '#334155' : '#cbd5e1'}">
        <rect x="4" y="2" width="6" height="6" fill="#F4A261"/><text x="12" y="7.5">${escapeHtml(sc.A.short)}</text>
        <rect x="44" y="2" width="6" height="6" fill="#E63946"/><text x="52" y="7.5">${escapeHtml(sc.B.short)}</text>
      </g>
    </svg>`;
}

// =========================================================================
// 14. IMPORTACIÓN DE ARCHIVOS (CSV / TXT / GEOJSON)
// =========================================================================
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();
  reader.onload = e => {
    try {
      if (ext === 'csv' || ext === 'txt') parseCSVData(e.target.result, file.name);
      else if (ext === 'geojson' || ext === 'json') parseGeoJSONData(JSON.parse(e.target.result), file.name);
      else alert(t('File "{f}" is not supported. Upload a CSV, TXT or GeoJSON.', { f: file.name }));
    } catch (err) {
      alert(t('Could not read {f}: {e}', { f: file.name, e: err.message }));
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function parseCSVData(csvText, fileName) {
  const lines = csvText.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return;
  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headers = splitCSVLine(lines[0], sep).map(h => h.toLowerCase());
  const latIdx = headers.findIndex(h => h.startsWith('lat'));
  const lngIdx = headers.findIndex(h => h.startsWith('lon') || h.startsWith('lng') || h === 'long');
  const nameIdx = headers.findIndex(h => /name|nombre|asset|activo|planta|punto/.test(h));
  if (latIdx < 0 || lngIdx < 0) { alert(t("No latitude ('lat') and longitude ('lon'/'lng') columns were found.")); return; }

  let added = 0;
  lines.slice(1).forEach((line, i) => {
    const c = splitCSVLine(line, sep);
    const name = nameIdx >= 0 && c[nameIdx] ? c[nameIdx] : `Imported-${i + 1}`;
    if (agregarPuntoAlSistema(name, c[latIdx], c[lngIdx], fileName, { silent: true })) added++;
  });
  finalizarCargaMasiva();
  zoomToAllAssets();
  abrirPanelConsultas();
  alert(t('{n} locations imported from {f}.', { n: added, f: fileName }));
}

function parseGeoJSONData(geoJson, fileName) {
  const features = geoJson.type === 'Feature' ? [geoJson] : geoJson.features;
  if (!Array.isArray(features)) { alert('GeoJSON sin "features".'); return; }
  let added = 0;
  features.forEach((f, i) => {
    const g = f.geometry;
    if (!g) return;
    const pts = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : [];
    pts.forEach(([lng, lat]) => {
      const p = f.properties || {};
      const name = p.name || p.nombre || p.asset || p.activo || `GeoJSON-${i + 1}`;
      if (agregarPuntoAlSistema(name, lat, lng, fileName, { silent: true })) added++;
    });
  });
  finalizarCargaMasiva();
  zoomToAllAssets();
  abrirPanelConsultas();
  alert(t('{n} locations imported from {f}.', { n: added, f: fileName }));
}

function zoomToAllAssets() {
  const pts = activosActivos();
  if (!pts.length) return;
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const s = Math.min(...lats) - 0.5, n = Math.max(...lats) + 0.5, w = Math.min(...lngs) - 0.5, e = Math.max(...lngs) + 0.5;
  if (currentMode === '2d' && leafletMap) leafletMap.flyToBounds([[s, w], [n, e]], { duration: 1 });
  else if (cesiumViewer) cesiumViewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(w, s, e, n), duration: 1.2 });
}

// =========================================================================
// 15. PANELES DESPLEGABLES
// =========================================================================
function toggleWidget(bodyId, iconId) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const icon = document.getElementById(iconId || bodyId.replace('body-panel-', 'icon-toggle-'));
  body.classList.toggle('hidden');
  if (icon) icon.classList.toggle('rotate-180');
}

function toggleNavigationPanel() {
  document.getElementById('navigation-panel-body')?.classList.toggle('hidden');
  document.getElementById('nav-toggle-icon')?.classList.toggle('rotate-180');
}

function toggleConsultasPanel() {
  document.getElementById('consultas-panel-body')?.classList.toggle('hidden');
  document.getElementById('consultas-toggle-icon')?.classList.toggle('rotate-180');
}

function toggleChatBody() {
  document.getElementById('chat-content-collapsible')?.classList.toggle('hidden');
  document.getElementById('chat-toggle-icon')?.classList.toggle('rotate-180');
}

// =========================================================================
// 16. HERRAMIENTAS ESPACIALES (2D / 3D) + ESTADÍSTICA ZONAL DE LA GRILLA
// =========================================================================
function calcularDistanciaPuntos(p1, p2) { return haversineKm(p1.lat, p1.lng, p2.lat, p2.lng) * 1000; }

function formatearDistancia(m) { return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`; }

function calcularAreaPoligono(puntos) {
  if (puntos.length < 3) return 0;
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < puntos.length; i++) {
    const p1 = puntos[i], p2 = puntos[(i + 1) % puntos.length];
    area += (p2.lng - p1.lng) * Math.PI / 180 * (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180));
  }
  return Math.abs(area * R * R / 2);
}

function formatearArea(m2) {
  if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(2)} km²`;
  if (m2 >= 1e4) return `${(m2 / 1e4).toFixed(2)} ha`;
  return `${m2.toFixed(1)} m²`;
}

function puntoEnPoligono(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat, xj = poly[j].lng, yj = poly[j].lat;
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Estadísticas de las celdas cuyo centro cae dentro del polígono */
function estadisticaZonal(poly) {
  const grid = displayGrid();
  if (!grid) return null;
  const vals = grid.points.filter(p => puntoEnPoligono(p.lat, p.lon, poly)).map(p => p.value);
  if (!vals.length) return { n: 0 };
  return { n: vals.length, mean: vals.reduce((s, v) => s + v, 0) / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
}

function zonalHTML(z) {
  if (!z) return '';
  const meta = getVarMeta();
  if (!z.n) return `<br><span style="color:#64748b">${t('No grid cells inside the area')}</span>`;
  const signed = state.display === 'DIFF';
  return `<hr style="margin:4px 0"><b>${escapeHtml(meta.name)}</b> · ${escapeHtml(displayLabel())}<br>
    ${t('Cells')}: <b>${z.n}</b> · ${t('Mean')}: <b>${fmtVal(z.mean, meta, signed)}</b><br>Min/Max: ${fmtNum(z.min)} / ${fmtNum(z.max)}`;
}

function setStatusDibujo(text, cls) {
  const el = document.getElementById('statusDibujo');
  if (!el) return;
  el.textContent = text;
  if (cls) el.className = cls;
}

function activarHerramientaDibujo(modo) {
  desactivarHerramientasActuales();
  activeDrawTool = modo;
  actualizarEstilosBotonesHerramientas(modo);

  const msgs = {
    point: 'Point mode: click on the map',
    rectangle: 'Rectangle mode: click to set corner 1',
    lasso: 'Lasso mode: successive clicks (double click to finish)',
    measure: 'Measure mode: click route points (double click to finish)'
  };
  setStatusDibujo(t(msgs[modo]), 'text-[9px] text-blue-400 font-bold px-1 animate-pulse');

  if (leafletMap) {
    leafletMap.getContainer().style.cursor = 'crosshair';
    leafletMap.on('click', manejarEventoClic2D);
    leafletMap.on('mousemove', manejarEventoMover2D);
    leafletMap.on('dblclick', manejarEventoDobleClic2D);
  }

  if (cesiumViewer) {
    cesiumViewer.canvas.style.cursor = 'crosshair';
    cesiumToolHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    cesiumToolHandler.setInputAction(m => { const c = obtenerLatLonCesium(m.position); if (c) procesarClicPunto(c); }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    cesiumToolHandler.setInputAction(m => { const c = obtenerLatLonCesium(m.endPosition); if (c) procesarMoverPunto(c); }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    cesiumToolHandler.setInputAction(() => finalizarDibujoHerramienta(), Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    cesiumToolHandler.setInputAction(() => finalizarDibujoHerramienta(), Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }
}

function desactivarHerramientasActuales() {
  activeDrawTool = null;
  tempPoints = [];
  if (leafletMap) {
    leafletMap.getContainer().style.cursor = '';
    leafletMap.off('click', manejarEventoClic2D);
    leafletMap.off('mousemove', manejarEventoMover2D);
    leafletMap.off('dblclick', manejarEventoDobleClic2D);
  }
  if (cesiumViewer?.canvas) cesiumViewer.canvas.style.cursor = '';
  if (cesiumToolHandler) { cesiumToolHandler.destroy(); cesiumToolHandler = null; }
  limpiarPrevisualizacionTemp();
  actualizarEstilosBotonesHerramientas(null);
}

function actualizarEstilosBotonesHerramientas(modoActivo) {
  ['point', 'rectangle', 'lasso', 'measure'].forEach(m => {
    const btn = document.getElementById(`btn-draw-${m}`);
    if (!btn) return;
    const on = m === modoActivo;
    btn.classList.toggle('border-blue-500', on);
    btn.classList.toggle('bg-blue-900/60', on);
    btn.classList.toggle('ring-1', on);
    btn.classList.toggle('ring-blue-500', on);
    btn.classList.toggle('border-slate-800/80', !on);
    btn.classList.toggle('bg-slate-900/90', !on);
  });
}

function obtenerLatLonCesium(position) {
  if (!cesiumViewer || !position) return null;
  const ray = cesiumViewer.camera.getPickRay(position);
  const cart = ray && cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene)
    || cesiumViewer.camera.pickEllipsoid(position, cesiumViewer.scene.globe.ellipsoid);
  if (!cart) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  return { lat: Cesium.Math.toDegrees(c.latitude), lng: Cesium.Math.toDegrees(c.longitude) };
}

function manejarEventoClic2D(e) { procesarClicPunto({ lat: e.latlng.lat, lng: e.latlng.lng }); }
function manejarEventoMover2D(e) { procesarMoverPunto({ lat: e.latlng.lat, lng: e.latlng.lng }); }
function manejarEventoDobleClic2D(e) { L.DomEvent.stopPropagation(e); finalizarDibujoHerramienta(); }

function procesarClicPunto(coord) {
  if (!activeDrawTool) return;

  if (activeDrawTool === 'point') {
    const nombre = prompt(t('Analysis point name:'), `${t('Analysis')}-${state.assets.length + 1}`);
    desactivarHerramientasActuales();
    if (!nombre) return;
    agregarPuntoAlSistema(nombre, coord.lat, coord.lng, 'Spatial analysis');
    setStatusDibujo(t('Point added and evaluated'), 'text-[9px] text-green-400 font-semibold px-1');

  } else if (activeDrawTool === 'rectangle') {
    if (!tempPoints.length) {
      tempPoints.push(coord);
      setStatusDibujo(t('Corner 1 set. Click the opposite corner.'));
      return;
    }
    const p1 = tempPoints[0], p2 = coord;
    const minLat = Math.min(p1.lat, p2.lat), maxLat = Math.max(p1.lat, p2.lat);
    const minLng = Math.min(p1.lng, p2.lng), maxLng = Math.max(p1.lng, p2.lng);
    const poly = [{ lat: minLat, lng: minLng }, { lat: maxLat, lng: minLng }, { lat: maxLat, lng: maxLng }, { lat: minLat, lng: maxLng }];
    const areaText = formatearArea(calcularAreaPoligono(poly));
    const html = `<b>${t('Analysis rectangle')}</b><br>${t('Area')}: <b>${areaText}</b>${zonalHTML(estadisticaZonal(poly))}`;

    if (leafletMap) {
      const r = L.rectangle([[minLat, minLng], [maxLat, maxLng]], { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.15 }).addTo(leafletMap);
      r.bindPopup(html);
      if (currentMode === '2d') r.openPopup();
      drawnLayers2D.push(r);
    }
    if (cesiumViewer) {
      drawnEntities3D.push(cesiumViewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat),
          material: Cesium.Color.BLUE.withAlpha(0.2)
        }
      }));
      if (currentMode === '3d') mostrarCesiumPopupEn(Cesium.Cartesian3.fromDegrees((minLng + maxLng) / 2, (minLat + maxLat) / 2), `<div class="text-[11px] pr-4">${html}</div>`, null);
    }
    setStatusDibujo(t('Rectangle drawn ({a})', { a: areaText }), 'text-[9px] text-green-400 font-semibold px-1');
    desactivarHerramientasActuales();

  } else if (activeDrawTool === 'lasso' || activeDrawTool === 'measure') {
    tempPoints.push(coord);
    setStatusDibujo(t('{tool}: {n} point(s). Double click to finish.', { tool: t(activeDrawTool === 'lasso' ? 'Lasso' : 'Measure'), n: tempPoints.length }));
  }
}

function procesarMoverPunto(coord) {
  if (!activeDrawTool || !tempPoints.length) return;
  limpiarPrevisualizacionTemp();

  if (activeDrawTool === 'rectangle') {
    const p1 = tempPoints[0];
    const minLat = Math.min(p1.lat, coord.lat), maxLat = Math.max(p1.lat, coord.lat);
    const minLng = Math.min(p1.lng, coord.lng), maxLng = Math.max(p1.lng, coord.lng);
    if (leafletMap) tempGraphics2D = L.rectangle([[minLat, minLng], [maxLat, maxLng]], { color: '#60a5fa', weight: 1.5, dashArray: '4, 4', fillOpacity: 0.1 }).addTo(leafletMap);
    if (cesiumViewer && minLat !== maxLat && minLng !== maxLng) {
      tempGraphic3D = cesiumViewer.entities.add({
        rectangle: { coordinates: Cesium.Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat), material: Cesium.Color.DODGERBLUE.withAlpha(0.15) }
      });
    }
    return;
  }

  const preview = [...tempPoints, coord];
  const color2D = activeDrawTool === 'lasso' ? '#a855f7' : '#f59e0b';
  const color3D = activeDrawTool === 'lasso' ? Cesium.Color.PURPLE : Cesium.Color.ORANGE;
  if (leafletMap) tempGraphics2D = L.polyline(preview.map(p => [p.lat, p.lng]), { color: color2D, weight: 2, dashArray: '4, 4' }).addTo(leafletMap);
  if (cesiumViewer) {
    tempGraphic3D = cesiumViewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(preview.flatMap(p => [p.lng, p.lat])),
        width: 2, material: new Cesium.PolylineDashMaterialProperty({ color: color3D }), clampToGround: true
      }
    });
  }
  if (activeDrawTool === 'measure') {
    let d = 0;
    for (let i = 0; i < preview.length - 1; i++) d += calcularDistanciaPuntos(preview[i], preview[i + 1]);
    setStatusDibujo(t('Current distance: {d}', { d: formatearDistancia(d) }));
  }
}

function finalizarDibujoHerramienta() {
  // El doble clic dispara también un clic: quitar el punto duplicado
  if (tempPoints.length >= 2) {
    const a = tempPoints[tempPoints.length - 1], b = tempPoints[tempPoints.length - 2];
    if (Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9) tempPoints.pop();
  }
  if (!activeDrawTool || tempPoints.length < 2) { desactivarHerramientasActuales(); return; }

  if (activeDrawTool === 'lasso' && tempPoints.length >= 3) {
    const pts = [...tempPoints];
    const areaText = formatearArea(calcularAreaPoligono(pts));
    const html = `<b>${t('Lasso polygon')}</b><br>${t('Area')}: <b>${areaText}</b>${zonalHTML(estadisticaZonal(pts))}`;
    if (leafletMap) {
      const p = L.polygon(pts.map(q => [q.lat, q.lng]), { color: '#8b5cf6', weight: 2, fillColor: '#8b5cf6', fillOpacity: 0.2 }).addTo(leafletMap);
      p.bindPopup(html);
      if (currentMode === '2d') p.openPopup();
      drawnLayers2D.push(p);
    }
    if (cesiumViewer) {
      drawnEntities3D.push(cesiumViewer.entities.add({
        polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(pts.flatMap(q => [q.lng, q.lat])), material: Cesium.Color.PURPLE.withAlpha(0.25) }
      }));
      const c = pts.reduce((s, q) => ({ lat: s.lat + q.lat / pts.length, lng: s.lng + q.lng / pts.length }), { lat: 0, lng: 0 });
      if (currentMode === '3d') mostrarCesiumPopupEn(Cesium.Cartesian3.fromDegrees(c.lng, c.lat), `<div class="text-[11px] pr-4">${html}</div>`, null);
    }
    setStatusDibujo(t('Lasso completed ({a})', { a: areaText }), 'text-[9px] text-green-400 font-semibold px-1');

  } else if (activeDrawTool === 'measure') {
    const pts = [...tempPoints];
    let d = 0;
    for (let i = 0; i < pts.length - 1; i++) d += calcularDistanciaPuntos(pts[i], pts[i + 1]);
    const distText = formatearDistancia(d);
    if (leafletMap) {
      const l = L.polyline(pts.map(q => [q.lat, q.lng]), { color: '#f59e0b', weight: 3 }).addTo(leafletMap);
      l.bindPopup(`<b>${t('Distance')}</b><br>${t('Total length')}: <b>${distText}</b>`);
      if (currentMode === '2d') l.openPopup();
      drawnLayers2D.push(l);
    }
    if (cesiumViewer) {
      drawnEntities3D.push(cesiumViewer.entities.add({
        polyline: { positions: Cesium.Cartesian3.fromDegreesArray(pts.flatMap(q => [q.lng, q.lat])), width: 3, material: Cesium.Color.ORANGE, clampToGround: true }
      }));
    }
    setStatusDibujo(t('Measurement finished ({d})', { d: distText }), 'text-[9px] text-green-400 font-semibold px-1');
  }
  desactivarHerramientasActuales();
}

function limpiarPrevisualizacionTemp() {
  if (tempGraphics2D && leafletMap) { leafletMap.removeLayer(tempGraphics2D); tempGraphics2D = null; }
  if (tempGraphic3D && cesiumViewer) { cesiumViewer.entities.remove(tempGraphic3D); tempGraphic3D = null; }
}

function limpiarDibujos() {
  desactivarHerramientasActuales();
  drawnLayers2D.forEach(l => leafletMap?.removeLayer(l));
  drawnLayers2D = [];
  drawnEntities3D.forEach(e => cesiumViewer?.entities.remove(e));
  drawnEntities3D = [];
  if (!cesiumPopupAssetId) cerrarCesiumPopup();
  setStatusDibujo(t('No active tool'), 'text-[9px] text-slate-400 italic px-1');
}


// =========================================================================
// 17. AGENTES IA — DEMOSTRACIÓN DEL FLUJO DE 4 AGENTES
//     1) Climate Selection and Analysis  2) Risk Assessment
//     3) Response and Reporting          4) Delivery and Feedback
//     Las respuestas son simuladas (no hay LLM conectado), pero usan los datos
//     reales del mapa y del panel de consulta.
// =========================================================================
const agentState = { step: 0, busy: false, run: null, msgSeq: 0 };

const AGENTS = {
  1: { name: 'Climate Selection and Analysis Agent', icon: 'fa-magnifying-glass-chart', color: 'text-sky-400', ring: 'border-sky-500/40 bg-sky-950/60' },
  2: { name: 'Risk Assessment Agent', icon: 'fa-shield-halved', color: 'text-amber-400', ring: 'border-amber-500/40 bg-amber-950/60' },
  3: { name: 'Response and Reporting Agent', icon: 'fa-file-lines', color: 'text-emerald-400', ring: 'border-emerald-500/40 bg-emerald-950/60' },
  4: { name: 'Delivery and Feedback Agent', icon: 'fa-paper-plane', color: 'text-violet-400', ring: 'border-violet-500/40 bg-violet-950/60' }
};

const EXAMPLE_QUERIES = [
  'Which location will have the highest risk of consecutive dry days in 2030 and 2050?',
  'Which plant faces the largest increase in dangerous heat days by 2050?',
  'Compare labour productivity loss in Nare and Yumbo.'
];

/** Palabras clave → variable (orden: de lo más específico a lo más general) */
const VARIABLE_KEYWORDS = [
  ['consecutive_dry_days', /dry days?|dias? secos?|cdd|estiagem|sequia consecutiva/],
  ['labour-productivity-loss', /productiv|produtiv|labou?r|laboral|trabaj|trabalh/],
  ['HI-danger', /heat days|dangerous heat|heat index|heatwave|heat wave|dias de calor|ola de calor|onda de calor|calor peligroso|calor perigoso/],
  ['fwixd', /fire|incendi|queimad/],
  ['spei_gamma_12', /drought|sequia|\bseca\b|spei/],
  ['wsi', /water stress|estres hidrico|estresse hidrico|water scarcity|escasez de agua|escassez/],
  ['dis', /river|discharge|caudal|vazao|streamflow|\brio\b/],
  ['rx5day', /5[- ]?day|cinco dias|rx5/],
  ['rx1day', /1[- ]?day|extreme rain|heavy rain|lluvia extrema|lluvias extremas|chuva extrema|rx1|flood|inundac/],
  ['prAdjust', /precipitation|rain|lluvia|precipitac|chuva/],
  ['TXx', /max(imum)? (daily )?temperature|temperatura maxima|txx/],
  ['tasAdjust', /temperature|temperatura|warming|calentamiento|aquecimento/],
  ['HI-danger', /heat|calor/]
];

const RECOMMENDATIONS = {
  dry: 'Prioritise a site-level water-availability assessment and contingency plans for dry seasons at the most exposed sites.',
  heat: 'Prioritise heat-stress protocols for workers (shifts, shade, hydration) and cooling needs at the most exposed sites.',
  rain: 'Prioritise a review of drainage, flood defences and access routes at the most exposed sites.',
  fire: 'Prioritise fire-prevention measures and vegetation management around the most exposed sites.',
  water: 'Prioritise water-supply security and efficiency measures at the most exposed sites.'
};
const RECO_BY_VAR = {
  consecutive_dry_days: 'dry', spei_gamma_12: 'dry', prAdjust: 'dry', 'HI-danger': 'heat', TXx: 'heat', tasAdjust: 'heat',
  'labour-productivity-loss': 'heat', rx1day: 'rain', rx5day: 'rain', fwixd: 'fire', wsi: 'water', dis: 'water'
};

const normalizeText = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function showToast(msg, kind = 'ok') {
  const el = document.createElement('div');
  const color = kind === 'error' ? 'border-rose-500/50 text-rose-200' : 'border-emerald-500/50 text-emerald-200';
  el.className = `fixed top-24 left-1/2 -translate-x-1/2 z-[10000] bg-slate-900/95 border ${color} text-xs px-3 py-2 rounded-lg shadow-2xl max-w-md text-center`;
  el.innerHTML = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// --- Elementos del chat --------------------------------------------------
function chatBody() { return document.getElementById('chat-conversation-body'); }
function scrollChat() { const b = chatBody(); if (b) b.scrollTop = b.scrollHeight; }

function addUserBubble(text) {
  chatBody()?.insertAdjacentHTML('beforeend', `
    <div class="flex justify-end">
      <div class="bg-blue-600/20 border border-blue-500/30 px-3 py-2 rounded-2xl rounded-tr-none max-w-[85%] text-slate-200 text-[11px]">${escapeHtml(text)}</div>
    </div>`);
  scrollChat();
}

/** Burbuja de un agente; devuelve el contenedor interno para ir llenándolo */
function addAgentBubble(n) {
  const a = AGENTS[n];
  const id = `agent-msg-${++agentState.msgSeq}`;
  chatBody()?.insertAdjacentHTML('beforeend', `
    <div class="flex gap-2.5" data-agent-step="${n}">
      <div class="w-7 h-7 rounded-lg border ${a.ring} flex items-center justify-center shrink-0">
        <i class="fa-solid ${a.icon} ${a.color} text-xs"></i>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl rounded-tl-none max-w-[90%] w-full text-slate-200 text-[11px] leading-relaxed space-y-2.5 shadow-lg">
        <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
          <span class="text-[10px] font-bold ${a.color} flex items-center gap-1"><i class="fa-solid fa-microchip"></i> ${t('Agent {n}', { n })}: ${t(a.name)}</span>
          <span class="text-[9px] text-slate-500 font-mono">${t('simulated')}</span>
        </div>
        <div id="${id}" class="space-y-2.5"></div>
      </div>
    </div>`);
  scrollChat();
  return document.getElementById(id);
}

/** Lista de tareas que se van completando ("pensando") */
async function runThinking(container, steps, delay = 650) {
  const box = document.createElement('div');
  box.className = 'p-2 bg-slate-950/80 border border-slate-800 rounded-lg text-[10px] text-slate-400 font-mono space-y-1';
  container.appendChild(box);
  for (const st of steps) {
    const row = document.createElement('div');
    row.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-sky-400 w-3"></i> ${escapeHtml(st)}`;
    box.appendChild(row);
    scrollChat();
    await sleep(delay);
    row.innerHTML = `<i class="fa-solid fa-check text-emerald-400 w-3"></i> ${escapeHtml(st)}`;
  }
  return box;
}

/** Texto que se escribe progresivamente (efecto de respuesta de un LLM) */
async function streamText(container, html) {
  const p = document.createElement('div');
  p.className = 'text-[11px] leading-relaxed text-slate-200';
  container.appendChild(p);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const plain = tmp.textContent;
  const words = plain.split(/(\s+)/);
  let out = '';
  for (let i = 0; i < words.length; i++) {
    out += words[i];
    if (i % 3 === 0) { p.textContent = out; scrollChat(); await sleep(28); }
  }
  p.innerHTML = html;
  scrollChat();
  return p;
}

const kvCard = rows => `<div class="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5 text-[10px] font-mono">${
  rows.map(([k, v, cls], i) => `<div class="flex justify-between gap-3 ${i < rows.length - 1 ? 'border-b border-slate-800/80 pb-1' : ''}"><span class="text-slate-400 shrink-0">${k}</span><span class="${cls || 'text-slate-200'} font-bold text-right">${v}</span></div>`).join('')}</div>`;

function nextButton(label, onclick) {
  return `<div class="pt-1"><button onclick="${onclick}" class="agent-next-btn px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold transition-all shadow-md flex items-center gap-1.5"><i class="fa-solid fa-arrow-right"></i> ${label}</button></div>`;
}

function disableNextButtons() {
  chatBody()?.querySelectorAll('.agent-next-btn').forEach(b => { b.disabled = true; b.classList.add('opacity-40', 'cursor-not-allowed'); });
}

// --- Pasos del encabezado ------------------------------------------------
function updateStepButtons() {
  for (let n = 1; n <= 4; n++) {
    const btn = document.getElementById(`step-btn-${n}`);
    const icon = document.getElementById(`step-icon-${n}`);
    if (!btn || !icon) continue;
    const done = agentState.step > n || agentState.done;
    const active = agentState.step === n && !agentState.done;
    const reachable = done || active || (n === 1);
    btn.disabled = !reachable;
    btn.className = `p-1.5 rounded-lg border flex items-center justify-center gap-1.5 ${
      active ? 'bg-blue-500/20 border-blue-500/60 text-blue-300 cursor-pointer'
      : done ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 cursor-pointer'
      : n === 1 ? 'bg-blue-500/20 border-blue-500/60 text-blue-300 cursor-pointer'
      : 'bg-slate-900/50 border-slate-800 text-slate-600 opacity-50 cursor-not-allowed'}`;
    icon.innerHTML = done ? '<i class="fa-solid fa-circle-check text-[10px]"></i>'
      : active || n === 1 ? `<i class="fa-solid ${AGENTS[n].icon} text-[10px] ${active ? 'animate-pulse' : ''}"></i>`
      : '<i class="fa-solid fa-lock text-[10px]"></i>';
  }
}

/** Clic en un paso: lleva al mensaje de ese agente */
function selectStep(n) {
  const el = chatBody()?.querySelector(`[data-agent-step="${n}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else document.getElementById('user-chat-input')?.focus();
}

// --- Intro y ejemplos ----------------------------------------------------
function renderAgentIntro() {
  const body = chatBody();
  if (!body || agentState.step > 0) return;
  body.innerHTML = `
    <div class="flex gap-2.5">
      <div class="w-7 h-7 rounded-lg border border-sky-500/40 bg-sky-950/60 flex items-center justify-center shrink-0"><i class="fa-solid fa-robot text-sky-400 text-xs"></i></div>
      <div class="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl rounded-tl-none max-w-[90%] text-slate-300 text-[11px] leading-relaxed space-y-2">
        <p class="text-slate-100 font-bold">${t('Hello! I am the AI Climate Risk assistant.')}</p>
        <p>${t('Ask a question about the assets and climate variables on the map. Four agents will select the data, assess the risk, answer with a PDF report and handle delivery and feedback.')}</p>
        <p class="text-slate-500 text-[10px]">${t('Demonstration: responses are simulated, but they use the real CIE v2 data shown in the platform.')}</p>
        <div class="flex flex-col gap-1.5 pt-1">
          ${EXAMPLE_QUERIES.map((q, i) => `<button onclick="useExampleQuery(${i})" class="text-left px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-950/60 hover:border-blue-500/60 hover:text-white text-[10px] text-slate-300 transition-colors"><i class="fa-regular fa-lightbulb text-amber-400 mr-1"></i>${escapeHtml(t(q))}</button>`).join('')}
        </div>
      </div>
    </div>`;
  const input = document.getElementById('user-chat-input');
  if (input) input.placeholder = t('Ask about the climate risk of your portfolio...');
  updateStepButtons();
}

function useExampleQuery(i) {
  const input = document.getElementById('user-chat-input');
  if (input) input.value = t(EXAMPLE_QUERIES[i]);
  executeCurrentStep();
}

// --- Agente 1: selección y análisis climático -----------------------------
function parseQuery(text) {
  const q = normalizeText(text);
  const varHit = VARIABLE_KEYWORDS.find(([, re]) => re.test(q));
  const variable = varHit && getSource().variables.includes(varHit[0]) ? varHit[0] : state.variable;
  let rcp = null;
  if (/rcp ?2\.?6|ssp1/.test(q)) rcp = 'rcp26';
  else if (/rcp ?4\.?5|ssp2/.test(q)) rcp = 'rcp45';
  else if (/rcp ?8\.?5|ssp5/.test(q)) rcp = 'rcp85';
  const named = state.assets.filter(a => a.enabled && q.includes(normalizeText(a.name)));
  const years = ['2030', '2050'].filter(y => q.includes(y));
  return { variable, rcp, assetIds: named.map(a => a.id), years, detectedVariable: !!varHit };
}

async function waitForClimateData(maxMs = 45000) {
  const t0 = Date.now();
  await sleep(50);
  while ((state.loading || !state.grids.A) && Date.now() - t0 < maxMs) await sleep(150);
  return !!state.grids.A;
}

async function executeCurrentStep(customInput = null) {
  if (agentState.busy) return;
  const input = document.getElementById('user-chat-input');
  const text = (customInput || input?.value || '').trim();
  if (!text) return;
  if (input) input.value = '';

  // Una nueva pregunta reinicia el flujo
  if (agentState.step === 0 || agentState.done) chatBody().innerHTML = '';
  disableNextButtons();
  agentState.busy = true;
  agentState.done = false;
  agentState.step = 1;
  agentState.run = { query: text, startedAt: new Date() };
  updateStepButtons();
  addUserBubble(text);

  try {
    const box = addAgentBubble(1);
    const parsed = parseQuery(text);
    await runThinking(box, [
      t('Parsing the natural-language query'),
      t('Identifying climate variable, scenario and time horizons'),
      t('Matching locations with the assets on the map')
    ]);

    // Aplicar la selección al mapa (variable y RCP) y cargar los datos reales
    let changed = false;
    if (parsed.rcp && state.source === 'cie_api' && parsed.rcp !== state.cieRcp) {
      state.cieRcp = parsed.rcp;
      const rcpSel = document.getElementById('climate-rcp');
      if (rcpSel) rcpSel.value = parsed.rcp;
      renderScenarioButtons();
      changed = true;
    }
    if (parsed.variable !== state.variable) {
      state.variable = parsed.variable;
      const sel = document.getElementById('climate-variable');
      if (sel) sel.value = parsed.variable;
      actualizarDescripcionVariable();
      changed = true;
    }
    const loadingRow = await runThinking(box, [t('Loading CIE v2 data for the selection')], 300);
    if (changed) loadClimateData();
    const ok = await waitForClimateData();
    if (!ok) throw new Error(t('Climate data could not be loaded.'));
    loadingRow.remove();

    const meta = getVarMeta();
    const sc = getScenarios();
    const assets = (parsed.assetIds.length ? state.assets.filter(a => parsed.assetIds.includes(a.id)) : activosActivos());
    agentState.run = { ...agentState.run, parsed, variable: state.variable, meta, sc, source: state.source, rcp: state.cieRcp, wl: state.wl, assetIds: assets.map(a => a.id) };

    const wlText = state.source === 'cie_api' && state.wl?.A != null ? ` (+${state.wl.A}°C / +${state.wl.B}°C)` : '';
    box.insertAdjacentHTML('beforeend', `<p>${t('I selected the following data for your question:')}</p>` + kvCard([
      [t('Variable') + ':', escapeHtml(meta.name), 'text-sky-300'],
      [t('Scenario') + ':', escapeHtml(state.source === 'cie_api' ? `${sc.A.note}${wlText}` : t(getSource().label)), ''],
      [t('Horizons') + ':', `${escapeHtml(sc.A.short)} · ${escapeHtml(sc.B.short)}`, ''],
      [t('Locations') + ':', parsed.assetIds.length ? escapeHtml(assets.map(a => a.name).join(', ')) : t('All {n} assets in the portfolio', { n: assets.length }), ''],
      [t('Source') + ':', escapeHtml(t(getSource().label)), 'text-slate-400']
    ]) + (parsed.detectedVariable ? '' : `<p class="text-amber-300 text-[10px]">${t('No variable was named in the question, so I used the one selected on the map.')}</p>`)
      + `<p class="text-slate-400">${t('The map and the query panel now show this selection.')}</p>`
      + nextButton(t('Send to Risk Assessment Agent'), 'runRiskAssessmentAgent()'));
    abrirPanelConsultas();
    scrollChat();
  } catch (err) {
    chatBody()?.insertAdjacentHTML('beforeend', `<p class="text-rose-400 text-[11px]">${escapeHtml(err.message)}</p>`);
    agentState.step = 0;
  } finally {
    agentState.busy = false;
    updateStepButtons();
  }
}

// --- Datos del análisis (los mismos del panel de consulta) -----------------
function runAssets() {
  const ids = agentState.run?.assetIds || [];
  return state.assets.filter(a => ids.includes(a.id) && (a.vA != null || a.vB != null));
}

function rankAssets(list, key) {
  const meta = agentState.run.meta;
  const val = a => key === 'A' ? a.vA : key === 'B' ? a.vB : a.diff;
  return [...list].filter(a => val(a) != null).sort((x, y) => meta.worse === 'high' ? val(y) - val(x) : val(x) - val(y));
}

// --- Agente 2: evaluación de riesgo --------------------------------------
async function runRiskAssessmentAgent() {
  if (agentState.busy || agentState.step !== 1) return;
  agentState.busy = true;
  disableNextButtons();
  agentState.step = 2;
  updateStepButtons();
  try {
    const box = addAgentBubble(2);
    await runThinking(box, [
      t('Receiving the selection from the Climate Selection and Analysis Agent'),
      t('Validating results against the query panel'),
      t('Checking units, grid coverage and missing values'),
      t('Converting results to machine-readable format (JSON)'),
      t('Retrieving context from the knowledge base (RAG)')
    ]);
    const r = agentState.run;
    const list = runAssets();
    const outside = state.assets.filter(a => r.assetIds.includes(a.id) && a.vA == null && a.vB == null).length;
    const worsening = list.filter(a => a.diff != null && isWorse(a.diff, r.meta)).length;

    const payload = {
      query_id: `q-${r.startedAt.getTime().toString(36)}`,
      intent: 'rank_assets_by_hazard',
      language: currentLang,
      variable: { code: r.variable, unit: r.meta.unit || 'index', higher_is_worse: r.meta.worse === 'high' },
      scenario: r.source === 'cie_api' ? { rcp: r.rcp, global_warming_c: [r.wl?.A, r.wl?.B] } : { warming_levels_c: [1.5, 3.0] },
      horizons: [r.sc.A.code, r.sc.B.code],
      assets: list.map(a => ({ name: a.name, lat: +a.lat.toFixed(3), lon: +a.lng.toFixed(3), [r.sc.A.short]: a.vA == null ? null : +a.vA.toFixed(3), [r.sc.B.short]: a.vB == null ? null : +a.vB.toFixed(3), delta: a.diff == null ? null : +a.diff.toFixed(3) }))
    };
    r.payload = payload;
    const json = JSON.stringify(payload, null, 2);

    box.insertAdjacentHTML('beforeend',
      kvCard([
        [t('Assets validated') + ':', `${list.length}`, 'text-emerald-400'],
        [t('Outside data coverage') + ':', `${outside}`, outside ? 'text-rose-400' : 'text-slate-200'],
        [t('Assets with increasing risk') + ':', `${worsening} / ${list.length}`, worsening ? 'text-amber-400' : 'text-emerald-400'],
        [t('Consistency with query panel') + ':', t('OK'), 'text-emerald-400']
      ]) +
      `<div><p class="text-[10px] text-slate-400 mb-1"><i class="fa-solid fa-code text-amber-400"></i> ${t('Machine-readable payload sent to the RAG and LLM:')}</p>
        <pre class="p-2 bg-slate-950/90 border border-slate-800 rounded-lg text-[9px] leading-snug text-emerald-300 font-mono max-h-28 overflow-auto custom-scrollbar">${escapeHtml(json)}</pre></div>` +
      `<div><p class="text-[10px] text-slate-400 mb-1"><i class="fa-solid fa-book text-amber-400"></i> ${t('Context retrieved from the knowledge base (simulated):')}</p>` +
      kvCard([
        [t('CIE v2 indicator documentation'), 'sim. 0.92', 'text-blue-400'],
        [t('IPCC AR6 WGI, Chapter 11: weather and climate extremes'), 'sim. 0.87', 'text-blue-400'],
        [t('Portfolio climate-risk screening guidelines'), 'sim. 0.81', 'text-blue-400']
      ]) + `</div>` +
      nextButton(t('Generate response and report'), 'runResponseAgent()'));
    scrollChat();
  } finally {
    agentState.busy = false;
    updateStepButtons();
  }
}

// --- Agente 3: respuesta y reporte ---------------------------------------
function buildAnswerHTML() {
  const r = agentState.run;
  const meta = r.meta;
  const list = runAssets();
  if (!list.length) return { html: t('No assets with data were found for this question.'), summary: [] };
  const byA = rankAssets(list, 'A'), byB = rankAssets(list, 'B'), byD = rankAssets(list, 'DIFF');
  const topA = byA[0], topB = byB[0], low = byB[byB.length - 1], topD = byD[0];
  const scen = r.source === 'cie_api' ? `${r.sc.A.note}` : t('the selected warming levels');
  const b = s => `<b>${escapeHtml(s)}</b>`;
  const parts = [];
  const lcFirst = s => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  parts.push(t('Under {scen}, {asset} faces the highest risk for {var} by {yb}: {vb} relative to the reference period ({ya}: {va}).', {
    scen: escapeHtml(scen), asset: b(topB.name), var: escapeHtml(lcFirst(meta.name)), yb: escapeHtml(r.sc.B.short),
    vb: fmtVal(topB.vB, meta), ya: escapeHtml(r.sc.A.short), va: fmtVal(topB.vA, meta)
  }));
  if (topA && topA.id !== topB.id) parts.push(t('In {ya}, the most exposed location is {asset} ({va}).', { ya: escapeHtml(r.sc.A.short), asset: b(topA.name), va: fmtVal(topA.vA, meta) }));
  else parts.push(t('{asset} is also the most exposed location in {ya}.', { asset: b(topB.name), ya: escapeHtml(r.sc.A.short) }));
  if (topD && topD.diff != null) parts.push(t('Risk grows fastest between {ya} and {yb} at {asset} ({d}).', { ya: escapeHtml(r.sc.A.short), yb: escapeHtml(r.sc.B.short), asset: b(topD.name), d: fmtVal(topD.diff, meta, true) }));
  if (list.length > 1 && low) parts.push(t('The lowest exposure in {yb} is at {asset} ({vb}).', { yb: escapeHtml(r.sc.B.short), asset: b(low.name), vb: fmtVal(low.vB, meta) }));
  if (meta.worse === 'low') parts.push(t('For this variable, lower values mean more risk.'));
  parts.push(`<span class="text-sky-300">${t(RECOMMENDATIONS[RECO_BY_VAR[r.variable] || 'water'])}</span>`);
  parts.push(`<span class="text-slate-500 text-[10px]">${t('Values are changes relative to the CIE reference period, at ~55 km resolution. They describe climate hazard, not financial losses.')}</span>`);
  return { html: parts.join(' '), ranking: byB };
}

async function runResponseAgent() {
  if (agentState.busy || agentState.step !== 2) return;
  agentState.busy = true;
  disableNextButtons();
  agentState.step = 3;
  updateStepButtons();
  try {
    const box = addAgentBubble(3);
    await runThinking(box, [t('Combining the query, validated data and retrieved context'), t('Generating the answer with the LLM')], 700);
    const ans = buildAnswerHTML();
    agentState.run.answerHTML = ans.html;
    await streamText(box, ans.html);

    const meta = agentState.run.meta;
    const rows = (ans.ranking || []).slice(0, 5).map((a, i) => `<tr class="border-t border-slate-800/60"><td class="py-0.5 pr-2 text-slate-500">${i + 1}</td><td class="py-0.5 pr-2 text-slate-200">${escapeHtml(a.name)}</td><td class="py-0.5 pr-2 text-right">${fmtNum(a.vA)}</td><td class="py-0.5 pr-2 text-right text-amber-300">${fmtNum(a.vB)}</td><td class="py-0.5 text-right ${a.diff != null && isWorse(a.diff, meta) ? 'text-rose-400' : 'text-emerald-400'}">${a.diff == null ? '—' : (a.diff > 0 ? '+' : '') + fmtNum(a.diff)}</td></tr>`).join('');
    const sc = agentState.run.sc;
    box.insertAdjacentHTML('beforeend', `
      <table class="w-full text-[10px] font-mono"><thead class="text-slate-500 text-[9px] uppercase"><tr><th class="text-left">#</th><th class="text-left">${t('Asset')}</th><th class="text-right">${escapeHtml(sc.A.short)}</th><th class="text-right">${escapeHtml(sc.B.short)}</th><th class="text-right">Δ</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="p-2.5 bg-slate-950/90 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 overflow-hidden"><i class="fa-solid fa-file-pdf text-red-400 text-xl shrink-0"></i>
          <div class="truncate"><p class="text-[10px] font-bold text-white truncate">${escapeHtml(reportFileName())}</p><p class="text-[9px] text-slate-400">${t('Summary report generated by the LLM')}</p></div></div>
        <button onclick="openAgentReport()" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shrink-0"><i class="fa-solid fa-eye"></i> ${t('Preview')}</button>
      </div>` + nextButton(t('Continue to delivery and feedback'), 'runDeliveryAgent()'));
    scrollChat();
  } finally {
    agentState.busy = false;
    updateStepButtons();
  }
}

function reportFileName() {
  const d = new Date().toISOString().slice(0, 10);
  return `Climate_Risk_Summary_${agentState.run?.variable || 'portfolio'}_${d}.pdf`;
}

/** Reporte PDF (vista imprimible → "Guardar como PDF") */
function openAgentReport() {
  const r = agentState.run;
  if (!r) return;
  const w = window.open('', '_blank');
  if (!w) { showToast(t('Allow pop-ups to open the report.'), 'error'); return; }
  const meta = r.meta, sc = r.sc;
  const list = rankAssets(runAssets(), 'B');
  const date = new Date().toLocaleDateString(LOCALES[currentLang] || 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const scen = r.source === 'cie_api' ? `${sc.A.note}${r.wl?.A != null ? ` (+${r.wl.A}°C / +${r.wl.B}°C)` : ''}` : t(SOURCES[r.source].label);
  const rows = list.map((a, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(a.name)}</b></td><td class="num">${fmtNum(a.vA)}</td><td class="num">${fmtNum(a.vB)}</td><td class="num">${a.diff == null ? '—' : (a.diff > 0 ? '+' : '') + fmtNum(a.diff)}</td><td>${t(a.tier || 'NA')}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="${currentLang}"><head><meta charset="utf-8"><title>${escapeHtml(reportFileName())}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11.5px; max-width: 180mm; margin: 0 auto; }
  .top { border-bottom: 3px solid #0f766e; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { font-size: 10px; color: #0f766e; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h1 { font-size: 20px; margin: 4px 0; } h2 { font-size: 13px; margin: 16px 0 6px; color: #0f766e; }
  .muted { color: #64748b; } .q { background: #f1f5f9; border-left: 4px solid #2563eb; padding: 8px 10px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding: 5px 4px; }
  td { padding: 5px 4px; border-bottom: 1px solid #eef2f7; } .num { text-align: right; font-family: "Courier New", monospace; }
  .note { font-size: 9.5px; color: #475569; border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 8px; line-height: 1.45; }
  .noprint { margin: 10px 0; } @media print { .noprint { display: none; } }
  button { background: #1d4ed8; color: #fff; border: 0; border-radius: 6px; padding: 7px 12px; font-weight: 700; cursor: pointer; }
</style></head><body>
  <div class="noprint"><button onclick="print()">${t('Save as PDF / Print')}</button></div>
  <div class="top"><div class="brand">SEI · AI Climate Risk Portfolio Explorer</div>
    <h1>${t('Climate risk summary report')}</h1>
    <div class="muted">${escapeHtml(date)} · ${t('Generated by the AI agents (demonstration)')}</div></div>
  <h2>${t('Question')}</h2><div class="q">${escapeHtml(r.query)}</div>
  <h2>${t('Answer')}</h2><p>${r.answerHTML || ''}</p>
  <h2>${t('Data used')}</h2>
  <table><tbody>
    <tr><td class="muted">${t('Variable')}</td><td><b>${escapeHtml(meta.name)}</b>${meta.unit ? ` (${escapeHtml(meta.unit)})` : ''}</td></tr>
    <tr><td class="muted">${t('Scenario')}</td><td>${escapeHtml(scen)}</td></tr>
    <tr><td class="muted">${t('Horizons')}</td><td>${escapeHtml(sc.A.short)} · ${escapeHtml(sc.B.short)}</td></tr>
    <tr><td class="muted">${t('Source')}</td><td>Climate Analytics — Climate Impact Explorer (CIE v2)</td></tr>
  </tbody></table>
  <h2>${t('Ranking of locations')}</h2>
  <table><thead><tr><th>#</th><th>${t('Asset')}</th><th class="num">${escapeHtml(sc.A.short)}</th><th class="num">${escapeHtml(sc.B.short)}</th><th class="num">Δ</th><th>${t('Relative tier')}</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="note">${t('This report was produced by a demonstration of the AI agent workflow. The answer text is simulated; the values come from CIE v2 as shown in the platform. Values are changes relative to the CIE reference period at ~55 km resolution and describe climate hazard, not financial losses.')}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));<\/script>
</body></html>`);
  w.document.close();
}

// --- Agente 4: entrega y retroalimentación ---------------------------------
async function runDeliveryAgent() {
  if (agentState.busy || agentState.step !== 3) return;
  agentState.busy = true;
  disableNextButtons();
  agentState.step = 4;
  updateStepButtons();
  try {
    const box = addAgentBubble(4);
    await runThinking(box, [t('Preparing the report for delivery')], 500);
    box.insertAdjacentHTML('beforeend', `
      <p>${t('Your report is ready. How would you like to receive it?')}</p>
      <div class="flex flex-wrap gap-1.5">
        <button onclick="showEmailForm(this)" class="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-950/60 hover:border-violet-500/60 text-[10px] text-slate-200"><i class="fa-solid fa-envelope text-violet-400"></i> ${t('Send by email')}</button>
        <button onclick="deliverByDownload(this)" class="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-950/60 hover:border-violet-500/60 text-[10px] text-slate-200"><i class="fa-solid fa-download text-violet-400"></i> ${t('Download to my device')}</button>
      </div>
      <div id="agent-delivery-area" class="space-y-2"></div>`);
    scrollChat();
  } finally {
    agentState.busy = false;
    updateStepButtons();
  }
}

function showEmailForm(btn) {
  const area = document.getElementById('agent-delivery-area');
  if (!area) return;
  area.innerHTML = `
    <div class="flex gap-1.5">
      <input id="agent-email" type="email" placeholder="${t('name@organization.org')}" class="flex-1 bg-slate-950/80 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-violet-500">
      <button onclick="deliverByEmail()" class="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-[10px] font-bold">${t('Send')}</button>
    </div>`;
  document.getElementById('agent-email')?.focus();
  scrollChat();
}

function deliverByEmail() {
  const email = document.getElementById('agent-email')?.value.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast(t('Please enter a valid email address.'), 'error'); return; }
  const area = document.getElementById('agent-delivery-area');
  area.innerHTML = `<p class="text-emerald-400 text-[10px]"><i class="fa-solid fa-circle-check"></i> ${t('Report {f} queued for {e}.', { f: escapeHtml(reportFileName()), e: escapeHtml(email) })}</p>
    <p class="text-slate-500 text-[9px]">${t('Demonstration: no email is actually sent.')}</p>`;
  askSatisfactionSurvey();
}

function deliverByDownload() {
  openAgentReport();
  const area = document.getElementById('agent-delivery-area');
  area.innerHTML = `<p class="text-emerald-400 text-[10px]"><i class="fa-solid fa-circle-check"></i> ${t('Report opened. Use "Save as PDF" to store it on your device.')}</p>`;
  askSatisfactionSurvey();
}

function askSatisfactionSurvey() {
  if (document.getElementById('agent-survey')) return;
  const area = document.getElementById('agent-delivery-area');
  area.insertAdjacentHTML('beforeend', `
    <div id="agent-survey" class="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
      <p class="font-bold text-slate-100 text-[10px]"><i class="fa-solid fa-star text-amber-400"></i> ${t('Brief satisfaction survey')}</p>
      <p class="text-[10px] text-slate-300">${t('How satisfied are you with the answer?')}</p>
      <div class="flex gap-1" id="agent-stars">${[1, 2, 3, 4, 5].map(n => `<button onclick="setSurveyRating(${n})" data-star="${n}" class="text-slate-600 hover:text-amber-400 text-sm"><i class="fa-solid fa-star"></i></button>`).join('')}</div>
      <p class="text-[10px] text-slate-300">${t('Was the information useful for your decision?')}</p>
      <div class="flex gap-1.5">
        <button onclick="setSurveyUseful(this, true)" data-useful="yes" class="px-2 py-0.5 rounded border border-slate-700 text-[10px] text-slate-300">${t('Yes')}</button>
        <button onclick="setSurveyUseful(this, false)" data-useful="no" class="px-2 py-0.5 rounded border border-slate-700 text-[10px] text-slate-300">${t('No')}</button>
      </div>
      <textarea id="agent-comment" rows="2" placeholder="${t('Optional comment')}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-violet-500"></textarea>
      <button onclick="submitSurvey()" class="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-[10px] font-bold">${t('Submit feedback')}</button>
    </div>`);
  scrollChat();
}

const surveyState = { rating: 0, useful: null };

function setSurveyRating(n) {
  surveyState.rating = n;
  document.querySelectorAll('#agent-stars [data-star]').forEach(b => {
    b.className = `${Number(b.dataset.star) <= n ? 'text-amber-400' : 'text-slate-600'} hover:text-amber-400 text-sm`;
  });
}

function setSurveyUseful(btn, value) {
  surveyState.useful = value;
  btn.parentElement.querySelectorAll('button').forEach(b => {
    const on = (b.dataset.useful === 'yes') === value;
    b.className = `px-2 py-0.5 rounded border text-[10px] ${on ? 'border-violet-500 bg-violet-500/20 text-white' : 'border-slate-700 text-slate-300'}`;
  });
}

function submitSurvey() {
  if (!surveyState.rating) { showToast(t('Please select a rating from 1 to 5 stars.'), 'error'); return; }
  const survey = document.getElementById('agent-survey');
  if (survey) survey.innerHTML = `<p class="text-emerald-400 text-[10px]"><i class="fa-solid fa-heart"></i> ${t('Thank you! Your rating ({r}/5) helps us evaluate and improve the agents (human-in-the-loop).', { r: surveyState.rating })}</p>`;
  agentState.done = true;
  surveyState.rating = 0; surveyState.useful = null;
  updateStepButtons();
  chatBody()?.insertAdjacentHTML('beforeend', `<p class="text-center text-[10px] text-slate-500 py-1">${t('Workflow completed. Ask a new question to start again.')}</p>`);
  scrollChat();
}


// =========================================================================
// 18. IDIOMA (EN principal, ES, PT) Y TEMA CLARO / OSCURO
// =========================================================================
function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* modo privado */ } }

function initLanguage() {
  const sel = document.getElementById('lang-selector');
  const saved = storageGet('ace-lang');
  const lang = LANGS[saved] ? saved : 'en'; // inglés por defecto
  if (sel) {
    sel.innerHTML = Object.keys(LANGS).map(k => `<option value="${k}">${LANG_FLAGS[k]} ${k.toUpperCase()}</option>`).join('');
    sel.addEventListener('change', e => setLanguage(e.target.value));
  }
  setLanguage(lang, { initial: true });
}

function setLanguage(lang, opts = {}) {
  if (!LANGS[lang]) return;
  currentLang = lang;
  storageSet('ace-lang', lang);
  document.documentElement.lang = lang;
  const sel = document.getElementById('lang-selector');
  if (sel) sel.value = lang;
  translateStatic(document.body);
  applyTheme(document.documentElement.dataset.theme || 'dark', false);
  if (opts.initial) return;
  refreshDynamicUI();
}

/** Vuelve a pintar lo que se genera desde JS en el idioma activo */
function refreshDynamicUI() {
  const srcSel = document.getElementById('climate-source');
  if (srcSel) {
    const v = srcSel.value;
    srcSel.innerHTML = Object.entries(SOURCES).map(([k, s]) => `<option value="${k}">${t(s.label)}</option>`).join('');
    srcSel.value = v;
  }
  poblarSelectorVariables();
  renderScenarioButtons();
  renderizarTarjetasMapasBase();
  renderLegend();
  renderActiveLayers();
  renderPortfolio();
  if (lastClimateStatus) setClimateStatus(...lastClimateStatus);
  if (!activeDrawTool) setStatusDibujo(t('No active tool'), 'text-[9px] text-slate-400 italic px-1');
  if (agentState.step === 0) renderAgentIntro();
  else {
    const input = document.getElementById('user-chat-input');
    if (input) input.placeholder = t('Ask about the climate risk of your portfolio...');
  }
  if (cesiumPopupAssetId) {
    const a = state.assets.find(x => x.id === cesiumPopupAssetId);
    if (a) document.getElementById('cesium-popup-content').innerHTML = assetPopupHTML(a);
  } else cerrarCesiumPopup();
  leafletMap?.closePopup();
}

function isLightTheme() { return document.documentElement.dataset.theme === 'light'; }

function initTheme() {
  applyTheme(storageGet('ace-theme') === 'light' ? 'light' : 'dark', false);
  document.getElementById('theme-toggle')?.addEventListener('click', () => applyTheme(isLightTheme() ? 'dark' : 'light'));
}

function applyTheme(theme, rerender = true) {
  document.documentElement.dataset.theme = theme;
  storageSet('ace-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = `fa-solid ${theme === 'light' ? 'fa-sun' : 'fa-moon'} text-xs`;
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.title = t(theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  if (rerender) { renderPortfolio(); renderLegend(); }
}
