/* =========================================================================
 * AI CLIMATE RISK PORTFOLIO EXPLORER — geovisor.js
 * Lógica de datos climáticos (CIE v2 / GIRI), extracción por punto,
 * grilla con simbología + leyenda (Leaflet 2D y Cesium 3D) y portafolio.
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
const SOURCES = {
  github: {
    label: 'CIE v2 · Warming levels (GitHub repo)',
    variables: ['labour-productivity-loss', 'HI-danger', 'TXx', 'tasAdjust', 'consecutive_dry_days', 'spei_gamma_12',
                'prAdjust', 'rx1day', 'rx5day', 'dis', 'wsi', 'fwixd'],
    scenarios: () => ({
      A: { code: 'wl1p5', label: 'WL 1.5°C', short: '1.5°C', note: '≈ RCP2.6' },
      B: { code: 'wl3p0', label: 'WL 3.0°C', short: '3.0°C', note: '≈ RCP8.5' }
    }),
    url: (variable, sc) => `${GITHUB_DATA_BASE}/${encodeURIComponent(variable)}_${sc.code}.csv`,
    parse: text => parseLongCSV(text)
  },
  cie_api: {
    label: 'CIE v2 · Live API (RCP / year)',
    variables: ['labour-productivity-loss', 'HI-danger', 'consecutive_dry_days', 'prAdjust', 'rx5day', 'tasAdjust', 'TXx'],
    scenarios: () => {
      const rcp = (state.cieRcp || 'rcp45').toUpperCase().replace('RCP', 'RCP ');
      return {
        A: { code: '2030', label: `${rcp} · 2030`, short: '2030', note: rcp },
        B: { code: '2050', label: `${rcp} · 2050`, short: '2050', note: rcp }
      };
    },
    url: (variable, sc) => `${CIE_API_BASE}?iso=COL&var=${encodeURIComponent(variable)}&aggregation_spatial=gdp&season=annual&format=csv&scenarios=${state.cieRcp}&years=${sc.code}`,
    parse: text => parseCieWideCSV(text)
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
  source: 'github',
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
        <img src="${item.thumb}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
      </div>
      <span class="text-[10px] font-bold text-center leading-tight truncate w-full ${isActive ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}">${item.name}</span>`;
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
        <button title="Add as asset" class="text-blue-400 hover:text-blue-300 shrink-0 cursor-pointer" onclick="seleccionarSugerencia(${i}, true)"><i class="fa-solid fa-plus text-[10px]"></i></button>
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
  else alert('No se encontraron resultados para la búsqueda.');
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
  if (iLat < 0 || iLon < 0 || iVal < 0) throw new Error('El CSV no tiene columnas lat, lon, value.');

  const points = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVLine(lines[i], sep);
    const lat = parseFloat(c[iLat]), lon = parseFloat(c[iLon]), value = parseFloat(c[iVal]);
    if (isFinite(lat) && isFinite(lon) && isFinite(value)) points.push({ lat, lon, value });
  }
  return points;
}

/** CSV ancho de la API CIE v2 (10 líneas de metadatos, luego matriz lat x lon) */
function parseCieWideCSV(text) {
  const lines = text.trim().replace(/\r/g, '').split('\n');
  // Buscar la fila de cabecera de la matriz (después de los metadatos)
  let start = lines.findIndex((l, i) => i >= 5 && l.split(',').length > 3 && l.split(',').slice(1).every(v => isFinite(parseFloat(v))));
  if (start < 0) start = 10;
  const headers = lines[start].split(',').map(h => h.trim());
  const lons = headers.slice(1).map(Number);
  const points = [];
  for (let i = start + 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const lat = Number(cols[0]);
    if (!isFinite(lat)) continue;
    for (let j = 1; j < cols.length; j++) {
      const v = cols[j].trim();
      if (v === '' || v.toLowerCase() === 'nan') continue;
      const value = Number(v);
      if (isFinite(value) && isFinite(lons[j - 1])) points.push({ lat, lon: lons[j - 1], value });
    }
  }
  return points;
}

async function fetchPoints(url, parser) {
  if (!csvCache.has(url)) {
    const p = fetch(url).then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
      const pts = parser(await res.text());
      if (!pts.length) throw new Error(`Sin datos válidos en ${url}`);
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
function getVarMeta(v = state.variable) { return VARIABLES[v] || { name: v, unit: '', worse: 'high', desc: '' }; }

/** Carga los dos escenarios de la variable activa y refresca todo */
async function loadClimateData() {
  const token = ++state.loadToken;
  const src = getSource();
  const sc = getScenarios();
  const meta = getVarMeta();

  state.loading = true;
  setClimateStatus(`<i class="fa-solid fa-spinner animate-spin"></i> Loading ${meta.name} (${sc.A.label} / ${sc.B.label})…`, 'info');

  try {
    const [ptsA, ptsB] = await Promise.all([
      fetchPoints(src.url(state.variable, sc.A), src.parse),
      fetchPoints(src.url(state.variable, sc.B), src.parse)
    ]);
    if (token !== state.loadToken) return; // llegó una petición más reciente

    state.grids.A = buildGrid(ptsA);
    state.grids.B = buildGrid(ptsB);
    state.grids.DIFF = diffGrid(state.grids.A, state.grids.B);

    recalcularActivos();
    renderClimateLayer();
    renderPortfolio();
    setClimateStatus(`<i class="fa-solid fa-circle-check"></i> ${ptsA.length} / ${ptsB.length} grid cells · res ${state.grids.A.resLat}°`, 'ok');
  } catch (err) {
    if (token !== state.loadToken) return;
    console.error(err);
    state.grids = { A: null, B: null, DIFF: null };
    recalcularActivos();
    renderClimateLayer();
    renderPortfolio();
    const help = src.missingHelp || (state.source === 'cie_api'
      ? 'The live CIE API may block browser requests (CORS). Use the GitHub source or a proxy.'
      : 'Check your connection or the file name in the repository.');
    setClimateStatus(`<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(err.message)}<br><span class="text-slate-400">${help}</span>`, 'error');
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
    el.className = 'absolute bottom-28 left-[310px] z-30 w-60 bg-[#0f172a]/85 backdrop-blur-md border border-slate-800/90 rounded-xl shadow-2xl p-2.5 text-slate-200';
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
      <span class="text-[8px] px-1.5 py-0.5 rounded border ${meta.type === 'Acute' ? 'border-rose-500/40 text-rose-300' : 'border-amber-500/40 text-amber-300'}">${meta.type || ''}</span>
    </div>
    <div class="h-2.5 rounded-sm border border-slate-700" style="background:${gradient}"></div>
    <div class="flex justify-between text-[8px] font-mono text-slate-300 mt-1">
      ${ticks.map((t, i) => `<span>${i === 0 ? '≤' : i === 4 ? '≥' : ''}${fmtNum(t)}</span>`).join('')}
    </div>
    <div class="flex justify-between text-[8px] text-slate-500 mt-1">
      <span>${meta.worse === 'high' ? 'lower risk' : 'higher risk'}</span>
      <span>${meta.worse === 'high' ? 'higher risk' : 'lower risk'}</span>
    </div>
    <div class="text-[8px] text-slate-500 mt-1 border-t border-slate-800 pt-1">Source: ${escapeHtml(getSource().label)} · ${state.grids[state.display]?.points.length || 0} cells</div>`;
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
        <p class="m-0 text-[10px] text-slate-400">Cell center: ${ref.lat.toFixed(2)}, ${ref.lon.toFixed(2)}</p>
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
    srcSel.innerHTML = Object.entries(SOURCES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
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
    `<optgroup label="${g} hazards">${list.map(v => `<option value="${v}">${getVarMeta(v).name}</option>`).join('')}</optgroup>`).join('');
  sel.value = state.variable;
  actualizarDescripcionVariable();
}

function actualizarDescripcionVariable() {
  const el = document.getElementById('climate-var-desc');
  const meta = getVarMeta();
  if (el) el.textContent = `${meta.desc}${meta.unit ? ` Units: ${meta.unit}.` : ''}`;
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
    { key: 'DIFF', label: 'Δ Change', title: `${sc.B.label} − ${sc.A.label}` }
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

function setClimateStatus(html, kind = 'info') {
  const el = document.getElementById('climate-status');
  if (!el) return;
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
  let matchTxt = 'No climate data loaded';
  if (m) {
    matchTxt = m.outside
      ? `<span class="text-rose-500">Outside data coverage (${m.distKm.toFixed(0)} km to nearest cell)</span>`
      : `${m.exact ? 'Grid cell' : 'Nearest cell'} ${m.cellLat.toFixed(2)}, ${m.cellLon.toFixed(2)} · ${m.distKm.toFixed(1)} km`;
  }
  const tierColor = TIER_COLORS[asset.tier || 'NA'];
  return `
    <div class="font-sans pr-4 text-slate-900 min-w-[210px]">
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="flex items-center gap-1.5">
          <i class="fa-solid fa-industry text-blue-600 text-xs"></i>
          <h4 class="font-bold text-xs text-slate-800 m-0">${escapeHtml(asset.name)}</h4>
        </div>
        ${asset.tier && asset.tier !== 'NA' ? `<span class="text-[9px] font-bold px-1.5 rounded" style="color:${tierColor};border:1px solid ${tierColor}">${asset.tier}</span>` : ''}
      </div>
      <div class="text-[10px] text-slate-500 mb-1">${escapeHtml(meta.name)}</div>
      <div class="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-200 pt-1">
        <p class="m-0"><b>${sc.A.label}:</b> ${fmtVal(asset.vA, meta)}</p>
        <p class="m-0"><b>${sc.B.label}:</b> ${fmtVal(asset.vB, meta)}</p>
        <p class="m-0"><b>Change:</b> <span style="color:${asset.diff != null && isWorse(asset.diff, meta) ? '#dc2626' : '#059669'}">${fmtVal(asset.diff, meta, true)}</span></p>
        <p class="m-0 text-[10px] text-slate-500">${matchTxt}</p>
        <p class="m-0 text-[10px] text-slate-400">Lat/Lon: ${asset.lat.toFixed(5)}, ${asset.lng.toFixed(5)}</p>
        <p class="m-0 text-[10px] text-slate-400"><b>Origin:</b> ${escapeHtml(asset.source)}</p>
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
    if (!val('lat-deg') || !val('lng-deg')) { alert('Ingresa al menos los grados de latitud y longitud.'); return; }
    lat = dmsToDecimal(val('lat-deg'), val('lat-min'), val('lat-sec'), val('lat-dir'));
    lng = dmsToDecimal(val('lng-deg'), val('lng-min'), val('lng-sec'), val('lng-dir'));
  }

  if (!isFinite(lat) || !isFinite(lng)) { alert('Por favor ingresa coordenadas válidas.'); return; }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) { alert('Las coordenadas están fuera del rango válido.'); return; }

  agregarPuntoAlSistema(name, lat, lng, 'Manual');

  ['manual-name', 'manual-lat', 'manual-lng', 'lat-deg', 'lat-min', 'lat-sec', 'lng-deg', 'lng-min', 'lng-sec']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// --- Lista de capas/activos (panel izquierdo) ---
function renderActiveLayers() {
  const container = document.getElementById('contenedor-capas');
  if (!container) return;
  if (!state.assets.length) {
    container.innerHTML = `<p id="empty-layers-msg" class="text-[10px] text-slate-500 text-center py-2">No active assets loaded.</p>`;
    return;
  }
  container.innerHTML = state.assets.map(loc => `
    <div class="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-colors group">
      <div class="flex items-center gap-2 truncate pr-2">
        <input type="checkbox" ${loc.enabled ? 'checked' : ''} onchange="toggleLocationVisibility('${loc.id}', this.checked)" class="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer">
        <span class="w-2 h-2 rounded-full shrink-0" style="background:${TIER_COLORS[loc.tier || 'NA']}"></span>
        <span class="text-[11px] font-medium text-slate-300 truncate cursor-pointer hover:text-white" onclick="zoomToLocation('${loc.id}')" title="${escapeHtml(loc.source)}">${escapeHtml(loc.name)}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-[9px] text-slate-500 font-mono">(${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)})</span>
        <button onclick="deleteLocation(event, '${loc.id}')" class="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors opacity-80 group-hover:opacity-100 cursor-pointer" title="Delete">
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
  setText('metric-label-a', `Avg. · ${sc.A.label}`);
  setText('metric-label-b', `Avg. · ${sc.B.label}`);
  setText('metric-label-change', `Avg. change (${sc.A.short} → ${sc.B.short})`);
  setText('th-col-a', sc.A.short);
  setText('th-col-b', sc.B.short);
  setText('th-col-diff', 'Δ');
  setText('risk-label-max', `Highest exposure (${sc.B.short})`);
  setText('risk-label-min', `Most resilient (${sc.B.short})`);
  const varLabel = document.getElementById('portfolio-variable-label');
  if (varLabel) varLabel.textContent = `${meta.name}${meta.unit ? ` (${meta.unit})` : ''} · ${data.length} asset(s)`;

  const metricA = document.getElementById('metric-p2030');
  const metricB = document.getElementById('metric-p2050');
  const changeEl = document.getElementById('metric-change');
  const tbody = document.getElementById('asset-productivity-list');

  if (!data.length) {
    if (metricA) { metricA.textContent = '—'; if (metricA.nextElementSibling) metricA.nextElementSibling.textContent = 'No data'; }
    if (metricB) { metricB.textContent = '—'; if (metricB.nextElementSibling) metricB.nextElementSibling.textContent = 'No data'; }
    if (changeEl) changeEl.textContent = '—';
    setText('plant-max-exposure', '—'); setText('plant-resilient', '—');
    setText('risk-max-value', ''); setText('risk-min-value', '');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="py-2 text-center text-slate-500">${state.loading ? 'Loading…' : 'No assets with data for this layer.'}</td></tr>`;
    const chart = document.getElementById('chart-asset-productivity');
    if (chart) chart.innerHTML = `<span class="text-[9px] text-slate-500 italic">No data</span>`;
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
    if (metricA.nextElementSibling) metricA.nextElementSibling.textContent = sA ? `Range: ${fmtNum(sA.min)} – ${fmtNum(sA.max)}` : '—';
  }
  if (metricB) {
    metricB.textContent = fmtVal(sB?.avg, meta);
    if (metricB.nextElementSibling) metricB.nextElementSibling.textContent = sB ? `Range: ${fmtNum(sB.min)} – ${fmtNum(sB.max)}` : '—';
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
    `${meta.desc} ${worsening} of ${data.length} assets worsen from ${sc.A.short} to ${sc.B.short}; ${highCount} in the high-exposure tier.`);

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
      const approx = a.matchB && !a.matchB.exact ? '<span class="text-slate-500" title="Nearest grid cell">≈</span>' : '';
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
      <text x="${cx}" y="${H - 3}" font-size="7" fill="#94a3b8" text-anchor="middle">${escapeHtml(a.name.substring(0, 4))}</text>`;
  }).join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-full" preserveAspectRatio="none">
      <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#334155" stroke-width="0.6"/>
      ${bars}
      <g font-size="7" fill="#cbd5e1">
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
      else alert(`Archivo "${file.name}" no soportado. Sube un CSV, TXT o GeoJSON.`);
    } catch (err) {
      alert(`No se pudo leer ${file.name}: ${err.message}`);
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
  if (latIdx < 0 || lngIdx < 0) { alert("No se identificaron columnas de latitud ('lat') y longitud ('lon'/'lng')."); return; }

  let added = 0;
  lines.slice(1).forEach((line, i) => {
    const c = splitCSVLine(line, sep);
    const name = nameIdx >= 0 && c[nameIdx] ? c[nameIdx] : `Imported-${i + 1}`;
    if (agregarPuntoAlSistema(name, c[latIdx], c[lngIdx], fileName, { silent: true })) added++;
  });
  finalizarCargaMasiva();
  zoomToAllAssets();
  abrirPanelConsultas();
  alert(`Se importaron ${added} ubicaciones desde ${fileName}.`);
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
  alert(`Se importaron ${added} puntos desde ${fileName}.`);
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
  if (!z.n) return `<br><span style="color:#64748b">No grid cells inside the area</span>`;
  const signed = state.display === 'DIFF';
  return `<hr style="margin:4px 0"><b>${escapeHtml(meta.name)}</b> · ${escapeHtml(displayLabel())}<br>
    Cells: <b>${z.n}</b> · Mean: <b>${fmtVal(z.mean, meta, signed)}</b><br>Min/Max: ${fmtNum(z.min)} / ${fmtNum(z.max)}`;
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
  setStatusDibujo(msgs[modo], 'text-[9px] text-blue-400 font-bold px-1 animate-pulse');

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
    const nombre = prompt('Analysis point name:', `Analysis-${state.assets.length + 1}`);
    desactivarHerramientasActuales();
    if (!nombre) return;
    agregarPuntoAlSistema(nombre, coord.lat, coord.lng, 'Spatial analysis');
    setStatusDibujo('Point added and evaluated', 'text-[9px] text-green-400 font-semibold px-1');

  } else if (activeDrawTool === 'rectangle') {
    if (!tempPoints.length) {
      tempPoints.push(coord);
      setStatusDibujo('Corner 1 set. Click the opposite corner.');
      return;
    }
    const p1 = tempPoints[0], p2 = coord;
    const minLat = Math.min(p1.lat, p2.lat), maxLat = Math.max(p1.lat, p2.lat);
    const minLng = Math.min(p1.lng, p2.lng), maxLng = Math.max(p1.lng, p2.lng);
    const poly = [{ lat: minLat, lng: minLng }, { lat: maxLat, lng: minLng }, { lat: maxLat, lng: maxLng }, { lat: minLat, lng: maxLng }];
    const areaText = formatearArea(calcularAreaPoligono(poly));
    const html = `<b>Analysis rectangle</b><br>Area: <b>${areaText}</b>${zonalHTML(estadisticaZonal(poly))}`;

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
    setStatusDibujo(`Rectangle drawn (${areaText})`, 'text-[9px] text-green-400 font-semibold px-1');
    desactivarHerramientasActuales();

  } else if (activeDrawTool === 'lasso' || activeDrawTool === 'measure') {
    tempPoints.push(coord);
    setStatusDibujo(`${activeDrawTool === 'lasso' ? 'Lasso' : 'Measure'}: ${tempPoints.length} point(s). Double click to finish.`);
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
    setStatusDibujo(`Current distance: ${formatearDistancia(d)}`);
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
    const html = `<b>Lasso polygon</b><br>Area: <b>${areaText}</b>${zonalHTML(estadisticaZonal(pts))}`;
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
    setStatusDibujo(`Lasso completed (${areaText})`, 'text-[9px] text-green-400 font-semibold px-1');

  } else if (activeDrawTool === 'measure') {
    const pts = [...tempPoints];
    let d = 0;
    for (let i = 0; i < pts.length - 1; i++) d += calcularDistanciaPuntos(pts[i], pts[i + 1]);
    const distText = formatearDistancia(d);
    if (leafletMap) {
      const l = L.polyline(pts.map(q => [q.lat, q.lng]), { color: '#f59e0b', weight: 3 }).addTo(leafletMap);
      l.bindPopup(`<b>Distance</b><br>Total length: <b>${distText}</b>`);
      if (currentMode === '2d') l.openPopup();
      drawnLayers2D.push(l);
    }
    if (cesiumViewer) {
      drawnEntities3D.push(cesiumViewer.entities.add({
        polyline: { positions: Cesium.Cartesian3.fromDegreesArray(pts.flatMap(q => [q.lng, q.lat])), width: 3, material: Cesium.Color.ORANGE, clampToGround: true }
      }));
    }
    setStatusDibujo(`Measurement finished (${distText})`, 'text-[9px] text-green-400 font-semibold px-1');
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
  setStatusDibujo('Ninguna herramienta activa', 'text-[9px] text-slate-400 italic px-1');
}

// =========================================================================
// 17. AGENTES IA (pipeline simulado, alimentado con datos reales del portafolio)
// =========================================================================
const langGraphState = { currentStep: 1, userQueryHistory: [], isProcessing: false };

const pipelineConfig = {
  1: { title: 'Step 1: Climate Data Agent', placeholder: 'Request climate data grid extraction...', nextStep: 2 },
  2: { title: 'Step 2: Risk Analysis Agent', placeholder: 'Request vulnerability and loss evaluation...', nextStep: 3 },
  3: { title: 'Step 3: Report Generator Agent', placeholder: 'Request PDF report consolidation...', nextStep: 4 },
  4: { title: 'Step 4: Climate Finance Agent', placeholder: 'Search funding opportunities...', nextStep: null }
};

function buildAgentResponse(step) {
  const meta = getVarMeta();
  const sc = getScenarios();
  const data = activosActivos().filter(a => a.vB != null);
  const sorted = [...data].sort((a, b) => meta.worse === 'high' ? b.vB - a.vB : a.vB - b.vB);
  const worst = sorted[0];
  const row = (k, v, cls = 'text-slate-200') => `<div class="flex justify-between border-b border-slate-800/80 pb-1"><span class="text-slate-400">${k}</span><span class="${cls} font-bold">${v}</span></div>`;
  const card = inner => `<div class="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5 text-[10px] font-mono">${inner}</div>`;

  if (step === 1) return {
    agentName: 'Agent 1: Climate Ingestion & Filtering',
    toolExecuted: `fetch_grid(source='${state.source}', var='${state.variable}', scenarios=['${sc.A.code}','${sc.B.code}'])`,
    llmReasoning: `Loaded ${state.grids.A?.points.length || 0} grid cells per scenario for ${meta.name} and extracted values for ${data.length} assets by grid cell / nearest neighbour.`,
    cardHTML: card(row('Variable:', escapeHtml(state.variable), 'text-green-400') + row('Scenarios:', `${sc.A.label} / ${sc.B.label}`) +
      row('Grid resolution:', `${state.grids.A?.resLat ?? '—'}°`, 'text-blue-400')),
    suggestion: 'Data validated. Transfer context to <b>Agent 2 (Risk Analysis)</b>.'
  };
  if (step === 2) return {
    agentName: 'Agent 2: Physical Vulnerability & Exposure',
    toolExecuted: `rank_assets(var='${state.variable}', scenario='${sc.B.code}', direction='${meta.worse}')`,
    llmReasoning: worst ? `Highest exposure under ${sc.B.label}: ${escapeHtml(worst.name)}. ${data.filter(a => a.tier === 'HIGH').length} asset(s) in the high tier.` : 'No assets with data.',
    cardHTML: card(sorted.slice(0, 4).map(a => row(`${escapeHtml(a.name)}:`, `${fmtVal(a.vA, meta)} → ${fmtVal(a.vB, meta)}`, isWorse(a.diff ?? 0, meta) ? 'text-red-400' : 'text-emerald-400')).join('')),
    suggestion: 'Assessment stored in state. Proceed to the <b>Agent 3</b> report.'
  };
  if (step === 3) return {
    agentName: 'Agent 3: Report Generator (PDF)',
    toolExecuted: `build_pdf_report(template='SEI_Executive_V1', var='${state.variable}')`,
    llmReasoning: 'Consolidated portfolio metrics, rankings and maps into a structured report (demo).',
    cardHTML: `<div class="p-2.5 bg-slate-950/90 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 overflow-hidden"><i class="fa-solid fa-file-pdf text-red-400 text-xl shrink-0"></i>
        <div class="truncate"><p class="text-[10px] font-bold text-white truncate">Climate_Risk_${escapeHtml(state.variable)}.pdf</p><p class="text-[9px] text-slate-400">Demo output</p></div></div>
        <button onclick="downloadReportSimulated()" class="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-bold shrink-0"><i class="fa-solid fa-download"></i> PDF</button></div>`,
    suggestion: 'Report issued. Transfer to <b>Agent 4</b> to search funding lines.'
  };
  return {
    agentName: 'Agent 4: Climate Finance Matching',
    toolExecuted: `match_funds(hazard_type='${meta.type}', country='COL')`,
    llmReasoning: 'Candidate adaptation finance windows for the identified hazards (demo, not verified).',
    cardHTML: card(row('Adaptation-focused funds', 'to review', 'text-amber-400') + row('Development bank lines', 'to review', 'text-amber-400')),
    suggestion: 'Pipeline completed.'
  };
}

function executeCurrentStep(customInput = null) {
  if (langGraphState.isProcessing) return;
  const inputEl = document.getElementById('user-chat-input');
  const chatBody = document.getElementById('chat-conversation-body');
  const queryText = customInput || inputEl?.value.trim();
  if (!queryText || !chatBody) return;

  langGraphState.isProcessing = true;
  langGraphState.userQueryHistory.push(queryText);
  chatBody.insertAdjacentHTML('beforeend', `
    <div class="flex justify-end"><div class="bg-green-600/20 border border-green-500/30 px-3 py-2 rounded-2xl rounded-tr-none max-w-[85%] text-slate-200 text-[11px]">${escapeHtml(queryText)}</div></div>`);
  if (inputEl) inputEl.value = '';

  const loadingId = `loading-${Date.now()}`;
  chatBody.insertAdjacentHTML('beforeend', `
    <div id="${loadingId}" class="flex gap-2.5">
      <div class="w-7 h-7 rounded-lg bg-green-950/40 border border-green-500/30 flex items-center justify-center shrink-0"><i class="fa-solid fa-spinner animate-spin text-green-400 text-xs"></i></div>
      <div class="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl rounded-tl-none text-slate-400 text-[11px]">Running agent ${langGraphState.currentStep}…</div>
    </div>`);
  chatBody.scrollTop = chatBody.scrollHeight;

  setTimeout(() => {
    document.getElementById(loadingId)?.remove();
    const step = langGraphState.currentStep;
    const res = buildAgentResponse(step);
    const next = pipelineConfig[step].nextStep;
    const btn = next ? `<div class="pt-1"><button onclick="triggerNextAgentStep(${next})" class="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5"><i class="fa-solid fa-arrow-right"></i> Run ${pipelineConfig[next].title.split(':')[1]}</button></div>` : '';
    chatBody.insertAdjacentHTML('beforeend', `
      <div class="flex gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-green-950/60 border border-green-500/40 flex items-center justify-center shrink-0"><i class="fa-solid fa-robot text-green-400 text-xs"></i></div>
        <div class="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl rounded-tl-none max-w-[90%] text-slate-200 text-[11px] leading-relaxed space-y-2.5 shadow-lg">
          <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <span class="text-[10px] font-bold text-green-400 flex items-center gap-1"><i class="fa-solid fa-microchip"></i> ${res.agentName}</span>
            <span class="text-[9px] text-slate-500 font-mono">demo</span>
          </div>
          <div class="flex items-center gap-2 p-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[10px] text-slate-400 font-mono overflow-x-auto">
            <i class="fa-solid fa-terminal text-green-400 shrink-0"></i><span class="truncate">ToolExecuted: <span class="text-slate-200">${escapeHtml(res.toolExecuted)}</span></span>
          </div>
          <p>${res.llmReasoning}</p>${res.cardHTML}<p class="text-slate-400">${res.suggestion}</p>${btn}
        </div>
      </div>`);
    unlockNextStepUI(step);
    langGraphState.isProcessing = false;
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 1200);
}

function triggerNextAgentStep(targetStep) {
  selectStep(targetStep);
  executeCurrentStep(pipelineConfig[targetStep].placeholder);
}

function unlockNextStepUI(completedStep) {
  const icon = document.getElementById(`step-icon-${completedStep}`);
  if (icon) icon.innerHTML = `<i class="fa-solid fa-circle-check text-green-400"></i>`;
  const next = pipelineConfig[completedStep].nextStep;
  if (!next) return;
  const btn = document.getElementById(`step-btn-${next}`);
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-slate-900/50', 'border-slate-800', 'text-slate-600');
    btn.classList.add('bg-blue-500/20', 'border-blue-500/60', 'text-blue-300', 'cursor-pointer');
    const nIcon = document.getElementById(`step-icon-${next}`);
    if (nIcon) nIcon.innerHTML = `<i class="fa-solid fa-brain text-[10px] animate-pulse"></i>`;
  }
  selectStep(next);
}

function selectStep(stepNumber) {
  langGraphState.currentStep = stepNumber;
  const input = document.getElementById('user-chat-input');
  if (input) input.placeholder = pipelineConfig[stepNumber].placeholder;
}

function downloadReportSimulated() {
  alert('Descarga simulada del reporte técnico de riesgo climático (PDF).');
}
