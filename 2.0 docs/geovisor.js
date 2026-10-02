// --- ASIGNACIÓN DEL TOKEN DE CESIUM ION ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiZmVkNzg3MS1mN2ZlLTQxNWUtYjMxZC02OTFiZTkzYTg1MjQiLCJpZCI6Mzg1ODkxLCJpYXQiOjE3Njk5ODI2OTZ9.j1fKrDLE7X97eksvPbF9to6YXvGybEBDIBaFR7Cg5vs';

// --- VARIABLES GLOBALES ---
let leafletMap = null;
let cesiumViewer = null;

let currentLeafletTile = null;
let currentLeafletLabels = null;
let cesiumActiveEntity = null;

const COLOMBIA_LAT = 4.5709;
const COLOMBIA_LON = -74.2973;

let currentMode = '3d';
let currentNavMode3D = 'pan';
let activeBasemapKey2D = 'Satélite Híbrido';
let activeBasemapKey3D = 'esri-world';
let currentOpacity = 1.0;

let userLocations = [];
const mapMarkers = {};
const cesiumEntities = {};

let activeCoordType = 'dd'; // 'dd' o 'gms'

// Variables para Herramientas Espaciales 2D / 3D
let activeDrawTool = null;
let drawnLayers2D = [];
let drawnEntities3D = [];
let tempPoints = [];
let tempGraphics2D = null;
let tempGraphic3D = null;
let cesiumToolHandler = null;

// --- DICCIONARIO DE MAPAS BASE ---
const BASEMAPS_2D = {
  "Satélite Híbrido": {
    name: "Satélite Híbrido",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    labelsUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    thumb: "https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Hybrid_Map.png",
    attr: "Esri, Maxar"
  },
  "Satélite Esri": {
    name: "Satélite Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    thumb: "https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Satellite_Map.png",
    attr: "Esri, Maxar"
  },
  "Esri World Street Map": {
    name: "Esri World Street Map",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    thumb: "https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_World_Street_Map.png",
    attr: "Esri"
  },
  "Google Maps": {
    name: "Google Maps",
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    thumb: "https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Google_Maps.png",
    attr: "Google"
  },
  "Google Satélite": {
    name: "Google Satélite",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    thumb: "https://pub-57e2d6782dd6483194a2084ca392d4ce.r2.dev/Esri_Satellite_Map.png",
    attr: "Google"
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



// --- PLANTAS INICIALES Y MOTOR DE RIESGO CLIMÁTICO ---
const INITIAL_PLANTS = [
  { id: 'plant_cartagena', name: 'Cartagena', lat: 10.3910, lng: -75.4794, source: 'Sistema', risk2030: 2.10, risk2050: 4.80, enabled: true },
  { id: 'plant_cairo', name: 'Cairo', lat: 5.8231, lng: -75.8231, source: 'Sistema', risk2030: 1.50, risk2050: 3.20, enabled: true },
  { id: 'plant_nare', name: 'Nare', lat: 6.1833, lng: -74.5833, source: 'Sistema', risk2030: 1.80, risk2050: 3.90, enabled: true },
  { id: 'plant_rioclaro', name: 'Rioclaro', lat: 5.9000, lng: -74.8500, source: 'Sistema', risk2030: 2.40, risk2050: 5.10, enabled: true },
  { id: 'plant_sogamoso', name: 'Sogamoso', lat: 7.1000, lng: -73.4000, source: 'Sistema', risk2030: 1.25, risk2050: 3.74, enabled: true },
  { id: 'plant_tolu', name: 'Tolú', lat: 9.5222, lng: -75.5811, source: 'Sistema', risk2030: 2.80, risk2050: 5.60, enabled: true },
  { id: 'plant_yumbo', name: 'Yumbo', lat: 3.5833, lng: -76.5000, source: 'Sistema', risk2030: 1.90, risk2050: 4.20, enabled: true }
];

// Asigna valores de riesgo climático para ubicaciones nuevas basadas en coordenadas
function calculateClimateRisk(lat, lng) {
  const seed = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233));
  const risk2030 = parseFloat((1.1 + seed * 1.8).toFixed(2));
  const risk2050 = parseFloat((risk2030 * (1.9 + seed * 0.5)).toFixed(2));
  return { risk2030, risk2050 };
}

// ============================================================
// 2. INICIALIZACIÓN DE PLANTAS BASE
// ============================================================
function initDefaultAssets() {
  if (currentAssetsData.length === 0) {
    INITIAL_PLANTS.forEach(plant => {
      agregarPuntoAlSistema(plant.name, plant.lat, plant.lng, plant.source || 'Argos', true);
    });
    finalizarCargaMasiva();
  }
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initLeaflet();
  initOpacitySlider();
  switchView('3d');
  initDefaultAssets();
});



function initClock() {
  const updateClock = () => {
    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${pad(ahora.getDate())}:${pad(ahora.getMonth() + 1)}:${ahora.getFullYear()}:${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
    const el = document.getElementById('topbar-datetime');
    if (el) el.textContent = timeStr;
  };
  setInterval(updateClock, 1000);
  updateClock();
}

function initLeaflet() {
  leafletMap = L.map('map', { zoomControl: false }).setView([COLOMBIA_LAT, COLOMBIA_LON], 5);
  aplicarMapaBaseEnLeaflet(activeBasemapKey2D);
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

  try {
    cesiumViewer.terrainProvider = await Cesium.createWorldTerrainAsync({
      requestWaterMask: true,
      requestVertexNormals: true
    });
    cesiumViewer.scene.verticalExaggeration = 3.0;
  } catch (terrainError) {
    console.error("Error al cargar Cesium World Terrain:", terrainError);
  }

  cesiumViewer.camera.changed.addEventListener(actualizarBrujula3D);
  cambiarModoNavegacion3D('pan');

  cesiumViewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(COLOMBIA_LON, COLOMBIA_LAT, 12000000.0)
  });

  cesiumViewer.scene.postRender.addEventListener(actualizarPosicionPopUpCesium);
  setupCesiumClickHandler();

  aplicarMapaBaseEnCesium(activeBasemapKey3D);
}

// --- CONMUTAR VISTA 2D / 3D ---
async function switchView(mode) {
  currentMode = mode;
  desactivarHerramientasActuales();

  const mapDiv = document.getElementById('map');
  const cesiumDiv = document.getElementById('cesiumContainer');

  const btn2d = document.getElementById('btn-2d');
  const btn3d = document.getElementById('btn-3d');

  if (mode === '2d') {
    mapDiv.classList.remove('hidden');
    cesiumDiv.classList.add('hidden');
    btn2d.className = "px-3 py-1 rounded-md text-xs font-bold transition-all bg-blue-700 text-white shadow-sm";
    btn3d.className = "px-3 py-1 rounded-md text-xs font-bold transition-all text-slate-300 hover:text-blue-400";
    if (leafletMap) leafletMap.invalidateSize();
  } else {
    cesiumDiv.classList.remove('hidden');
    mapDiv.classList.add('hidden');
    btn3d.className = "px-3 py-1 rounded-md text-xs font-bold transition-all bg-blue-700 text-white shadow-sm";
    btn2d.className = "px-3 py-1 rounded-md text-xs font-bold transition-all text-slate-300 hover:text-blue-400";
    
    await initCesiumIfNeeded();
    setTimeout(() => { if (cesiumViewer) cesiumViewer.resize(); }, 50);
  }

  renderizarTarjetasMapasBase();
}

// --- RENDERING Y MAPAS BASE ---
function renderizarTarjetasMapasBase() {
  const container = document.getElementById('basemapGridContainer');
  if (!container) return;

  const mapList = (currentMode === '2d') ? BASEMAPS_2D : BASEMAPS_3D;
  const activeKey = (currentMode === '2d') ? activeBasemapKey2D : activeBasemapKey3D;

  container.innerHTML = '';

  Object.keys(mapList).forEach(key => {
    const item = mapList[key];
    const isActive = key === activeKey;

    const btn = document.createElement('button');
    btn.onclick = () => seleccionarMapaBase(key);
    btn.className = `basemap-card group flex flex-col items-center p-1.5 rounded-xl transition-all cursor-pointer text-left ${
      isActive
        ? 'border-2 border-blue-500 bg-blue-950/30 active-basemap'
        : 'border border-slate-800 bg-slate-900/90 hover:border-slate-700 hover:bg-slate-800/50'
    }`;

    btn.innerHTML = `
      <div class="w-full h-14 rounded-lg overflow-hidden border border-slate-700/60 mb-1.5 relative">
        <img src="${item.thumb}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
      </div>
      <span class="text-[10px] font-bold text-center leading-tight truncate w-full ${
        isActive ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'
      }">${item.name}</span>
    `;

    container.appendChild(btn);
  });
}

function seleccionarMapaBase(keyMapa) {
  if (currentMode === '2d') {
    activeBasemapKey2D = keyMapa;
    aplicarMapaBaseEnLeaflet(keyMapa);
  } else {
    activeBasemapKey3D = keyMapa;
    aplicarMapaBaseEnCesium(keyMapa);
  }
  renderizarTarjetasMapasBase();
}

function aplicarMapaBaseEnLeaflet(key) {
  const provider = BASEMAPS_2D[key];
  if (!provider || !leafletMap) return;

  if (currentLeafletTile) leafletMap.removeLayer(currentLeafletTile);
  if (currentLeafletLabels) {
    leafletMap.removeLayer(currentLeafletLabels);
    currentLeafletLabels = null;
  }

  currentLeafletTile = L.tileLayer(provider.url, {
    attribution: provider.attr,
    maxZoom: 19,
    opacity: currentOpacity
  }).addTo(leafletMap);

  if (provider.labelsUrl) {
    currentLeafletLabels = L.tileLayer(provider.labelsUrl, {
      maxZoom: 19,
      opacity: currentOpacity
    }).addTo(leafletMap);
  }
}

async function aplicarMapaBaseEnCesium(key) {
  if (!cesiumViewer) return;
  const provider = BASEMAPS_3D[key];
  if (!provider) return;

  const layers = cesiumViewer.imageryLayers;

  try {
    layers.removeAll();

    if (provider.type === 'ion') {
      const imageryProvider = await Cesium.createWorldImageryAsync({ style: provider.assetId });
      const layer = layers.addImageryProvider(imageryProvider);
      layer.alpha = currentOpacity;
    } else if (provider.type === 'arcgis-hybrid') {
      const satProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(provider.url);
      const satLayer = layers.addImageryProvider(satProvider);
      satLayer.alpha = currentOpacity;

      const labelsProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(provider.labelsUrl);
      const labelsLayer = layers.addImageryProvider(labelsProvider);
      labelsLayer.alpha = currentOpacity;
    } else if (provider.type === 'arcgis') {
      const imageryProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(provider.url);
      const layer = layers.addImageryProvider(imageryProvider);
      layer.alpha = currentOpacity;
    }
  } catch (error) {
    console.error("Error al cargar mapa en Cesium:", error);
  }
}

function initOpacitySlider() {
  const slider = document.getElementById('opacity-slider');
  const label = document.getElementById('opacity-val');

  if (slider) {
    slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      currentOpacity = val / 100;
      if (label) label.textContent = `${val}%`;

      if (currentLeafletTile) currentLeafletTile.setOpacity(currentOpacity);
      if (currentLeafletLabels) currentLeafletLabels.setOpacity(currentOpacity);

      if (cesiumViewer) {
        const numLayers = cesiumViewer.imageryLayers.length;
        for (let i = 0; i < numLayers; i++) {
          const layer = cesiumViewer.imageryLayers.get(i);
          if (layer) layer.alpha = currentOpacity;
        }
      }
    });
  }
}

// --- CONTROLES DE NAVEGACIÓN ---
function cambiarModoNavegacion3D(modo) {
  if (currentMode !== '3d' || !cesiumViewer) return;

  currentNavMode3D = modo;
  const controller = cesiumViewer.scene.screenSpaceCameraController;

  const btnPan = document.getElementById('btn-mode-pan');
  const btnRotate = document.getElementById('btn-mode-rotate');

  const activeClass = "w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all shrink-0 shadow-sm";
  const inactiveClass = "w-7 h-7 rounded-lg bg-slate-900/80 border border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all shrink-0";

  if (modo === 'pan') {
    controller.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
    controller.translateEventTypes = [Cesium.CameraEventType.RIGHT_DRAG];
    controller.tiltEventTypes = [Cesium.CameraEventType.MIDDLE_DRAG, Cesium.CameraEventType.PINCH];

    if (btnPan) btnPan.className = activeClass;
    if (btnRotate) btnRotate.className = inactiveClass;
  } else if (modo === 'rotate') {
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
  const compassIcon = document.querySelector('#btn-orient-north i');
  if (!compassIcon) return;

  const headingDeg = Cesium.Math.toDegrees(cesiumViewer.camera.heading);
  compassIcon.style.transform = `rotate(${-headingDeg}deg)`;
}

function zoomInActiveMap() {
  if (currentMode === '2d' && leafletMap) leafletMap.zoomIn();
  else if (cesiumViewer) cesiumViewer.camera.zoomIn(100000);
}

function zoomOutActiveMap() {
  if (currentMode === '2d' && leafletMap) leafletMap.zoomOut();
  else if (cesiumViewer) cesiumViewer.camera.zoomOut(100000);
}

function volverAlHome() {
  if (leafletMap) leafletMap.setView([COLOMBIA_LAT, COLOMBIA_LON], 5);
  if (cesiumViewer) {
    cesiumViewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(COLOMBIA_LON, COLOMBIA_LAT, 12000000.0)
    });
  }
}

function obtenerMiUbicacion() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      if (leafletMap) leafletMap.setView([latitude, longitude], 12);
      if (cesiumViewer) {
        cesiumViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, 15000.0)
        });
      }
    });
  }
}

function switchCoordType(type) {
  activeCoordType = type;
  const tabDD = document.getElementById('tab-coord-dd');
  const tabGMS = document.getElementById('tab-coord-gms');
  const formDD = document.getElementById('form-coord-dd');
  const formGMS = document.getElementById('form-coord-gms');

  if (type === 'dd') {
    tabDD.className = 'flex-1 py-0.5 font-bold rounded bg-blue-600 text-white transition-colors';
    tabGMS.className = 'flex-1 py-0.5 text-slate-400 hover:text-white transition-colors';
    formDD.classList.remove('hidden');
    formGMS.classList.add('hidden');
  } else {
    tabGMS.className = 'flex-1 py-0.5 font-bold rounded bg-blue-600 text-white transition-colors';
    tabDD.className = 'flex-1 py-0.5 text-slate-400 hover:text-white transition-colors';
    formGMS.classList.remove('hidden');
    formDD.classList.add('hidden');
  }
}

function dmsToDecimal(degrees, minutes, seconds, direction) {
  const deg = parseFloat(degrees) || 0;
  const min = parseFloat(minutes) || 0;
  const sec = parseFloat(seconds) || 0;
  
  let decimal = deg + (min / 60) + (sec / 3600);
  
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }
  return decimal;
}


function addManualLocation() {
  const nameInput = document.getElementById('manual-name');
  const name = nameInput.value.trim() || `Asset-${userLocations.length + 1}`;
  
  let lat, lng;

  if (activeCoordType === 'dd') {
    lat = parseFloat(document.getElementById('manual-lat').value);
    lng = parseFloat(document.getElementById('manual-lng').value);
  } else {
    const latDeg = document.getElementById('lat-deg').value;
    const latMin = document.getElementById('lat-min').value;
    const latSec = document.getElementById('lat-sec').value;
    const latDir = document.getElementById('lat-dir').value;

    const lngDeg = document.getElementById('lng-deg').value;
    const lngMin = document.getElementById('lng-min').value;
    const lngSec = document.getElementById('lng-sec').value;
    const lngDir = document.getElementById('lng-dir').value;

    if (!latDeg || !lngDeg) {
      alert("Por favor ingresa al menos los grados en las coordenadas GMS.");
      return;
    }

    lat = dmsToDecimal(latDeg, latMin, latSec, latDir);
    lng = dmsToDecimal(lngDeg, lngMin, lngSec, lngDir);
  }

  if (isNaN(lat) || isNaN(lng)) {
    alert("Por favor ingresa coordenadas válidas.");
    return;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    alert("Las coordenadas resultantes están fuera del rango válido.");
    return;
  }

  // Calcular riesgo para las coordenadas ingresadas
  const { risk2030, risk2050 } = calculateClimateRisk(lat, lng);

  const newLocation = { 
    id: 'loc_' + Date.now(), 
    name: name, 
    lat: lat, 
    lng: lng, 
    source: 'manual',
    risk2030: risk2030,
    risk2050: risk2050,
    enabled: true
  };

  userLocations.push(newLocation);

  // Limpiar formulario
  nameInput.value = '';
  document.getElementById('manual-lat').value = '';
  document.getElementById('manual-lng').value = '';
  document.getElementById('lat-deg').value = '';
  document.getElementById('lat-min').value = '';
  document.getElementById('lat-sec').value = '';
  document.getElementById('lng-deg').value = '';
  document.getElementById('lng-min').value = '';
  document.getElementById('lng-sec').value = '';

  renderActiveLayers();
  plotOnMap(newLocation, true);
  updateRightPanel(); // Recalcula promedios y actualiza la lista del panel derecho
}




// ============================================================
// 3. INSERCIÓN MANUAL
// ============================================================
function addManualLocation() {
  const nameInput = document.getElementById('manual-name');
  const name = nameInput ? nameInput.value.trim() : '';

  let lat, lng;

  if (activeCoordType === 'dd') {
    lat = parseFloat(document.getElementById('manual-lat').value);
    lng = parseFloat(document.getElementById('manual-lng').value);
  } else {
    const latDeg = document.getElementById('lat-deg').value;
    const latMin = document.getElementById('lat-min').value;
    const latSec = document.getElementById('lat-sec').value;
    const latDir = document.getElementById('lat-dir').value;

    const lngDeg = document.getElementById('lng-deg').value;
    const lngMin = document.getElementById('lng-min').value;
    const lngSec = document.getElementById('lng-sec').value;
    const lngDir = document.getElementById('lng-dir').value;

    if (!latDeg || !lngDeg) {
      alert("Por favor ingresa al menos los grados en las coordenadas GMS.");
      return;
    }

    lat = dmsToDecimal(latDeg, latMin, latSec, latDir);
    lng = dmsToDecimal(lngDeg, lngMin, lngSec, lngDir);
  }

  if (isNaN(lat) || isNaN(lng)) {
    alert("Por favor ingresa coordenadas válidas.");
    return;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    alert("Las coordenadas resultantes están fuera del rango válido.");
    return;
  }

  // Enviar al embudo unificado
  agregarPuntoAlSistema(name || `Punto-${currentAssetsData.length + 1}`, lat, lng, 'Manual');

  // Limpiar campos del formulario
  if (nameInput) nameInput.value = '';
  document.getElementById('manual-lat').value = '';
  document.getElementById('manual-lng').value = '';
  document.getElementById('lat-deg').value = '';
  document.getElementById('lat-min').value = '';
  document.getElementById('lat-sec').value = '';
  document.getElementById('lng-deg').value = '';
  document.getElementById('lng-min').value = '';
  document.getElementById('lng-sec').value = '';
}



function plotOnMap(location, centerMap = false) {
  const r2030 = (location.v2030 ?? location.risk2030 ?? 0);
  const r2050 = (location.v2050 ?? location.risk2050 ?? 0);
  const diff = r2050 - r2030;

  const popupContent = `
    <div class="p-2 text-slate-900 font-sans">
      <div class="flex items-center gap-1.5 mb-1">
        <i class="fa-solid fa-location-dot text-blue-600 text-xs"></i>
        <h4 class="font-bold text-xs text-slate-800 m-0">${location.name}</h4>
      </div>
      <div class="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-200 pt-1 mt-1">
        <p class="m-0"><b>2030 Loss:</b> ${r2030.toFixed(2)}%</p>
        <p class="m-0"><b>2050 Loss:</b> ${r2050.toFixed(2)}%</p>
        <p class="m-0"><b>Cambio:</b> ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%</p>
        <p class="m-0"><b>Latitud:</b> ${location.lat.toFixed(6)}</p>
        <p class="m-0"><b>Longitud:</b> ${location.lng.toFixed(6)}</p>
        <p class="m-0 text-[10px] text-slate-400 capitalize"><b>Origen:</b> ${location.source || 'Manual'}</p>
      </div>
    </div>
  `;

  if (leafletMap) {
    const marker = L.marker([location.lat, location.lng]).addTo(leafletMap).bindPopup(popupContent);
    mapMarkers[location.id] = marker;

    if (centerMap && currentMode === '2d') {
      leafletMap.flyTo([location.lat, location.lng], 12, { duration: 1.2 });
      marker.openPopup();
    }
  }

  if (cesiumViewer) {
    const entity = cesiumViewer.entities.add({
      id: location.id,
      name: location.name,
      position: Cesium.Cartesian3.fromDegrees(location.lng, location.lat, 0),
      billboard: {
        image: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        width: 25,
        height: 41,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      description: popupContent
    });
    cesiumEntities[location.id] = entity;

    if (centerMap && currentMode === '3d') {
      cesiumViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(location.lng, location.lat, 15000.0),
        duration: 1.5
      });
      mostrarCesiumPopup(entity, location);
    }
  }
}

function setupCesiumClickHandler() {
  if (!cesiumViewer) return;
  const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
  handler.setInputAction((movement) => {
    if (activeDrawTool) return;
    const pickedObject = cesiumViewer.scene.pick(movement.position);
    if (Cesium.defined(pickedObject) && pickedObject.id) {
      const entity = pickedObject.id;
      const loc = userLocations.find(l => l.id === entity.id);
      if (loc) {
        mostrarCesiumPopup(entity, loc);
      }
    } else {
      cerrarCesiumPopup();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function mostrarCesiumPopup(entity, location) {
  cesiumActiveEntity = entity;
  const container = document.getElementById('cesium-popup-container');
  const content = document.getElementById('cesium-popup-content');
  
  if (!container || !content) return;

  const r2030 = (location.v2030 ?? location.risk2030 ?? 0);
  const r2050 = (location.v2050 ?? location.risk2050 ?? 0);
  const diff = r2050 - r2030;

  content.innerHTML = `
    <div class="font-sans pr-4">
      <div class="flex items-center gap-1.5 mb-1">
        <i class="fa-solid fa-location-dot text-blue-600 text-xs"></i>
        <h4 class="font-bold text-xs text-slate-800 m-0">${location.name}</h4>
      </div>
      <div class="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-200 pt-1 mt-1">
        <p class="m-0"><b>2030 Loss:</b> ${r2030.toFixed(2)}%</p>
        <p class="m-0"><b>2050 Loss:</b> ${r2050.toFixed(2)}%</p>
        <p class="m-0"><b>Cambio:</b> ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%</p>
        <p class="m-0"><b>Latitud:</b> ${location.lat.toFixed(6)}</p>
        <p class="m-0"><b>Longitud:</b> ${location.lng.toFixed(6)}</p>
        <p class="m-0 text-[10px] text-slate-400 capitalize"><b>Origen:</b> ${location.source || 'Manual'}</p>
      </div>
    </div>
  `;

  container.classList.remove('hidden');
  actualizarPosicionPopUpCesium();
}

function actualizarPosicionPopUpCesium() {
  const container = document.getElementById('cesium-popup-container');
  
  if (!cesiumActiveEntity || !container || container.classList.contains('hidden')) {
    if (container) container.style.display = 'none';
    return;
  }

  const position3D = cesiumActiveEntity.position.getValue(cesiumViewer.clock.currentTime);
  if (!position3D) return;

  const windowPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(cesiumViewer.scene, position3D);

  if (Cesium.defined(windowPosition)) {
    const cameraPosition = cesiumViewer.camera.position;
    const distance = Cesium.Cartesian3.distance(cameraPosition, position3D);
    if (distance > 25000000) { 
      container.style.display = 'none';
      return;
    }

    const offsetY = 45;
    container.style.display = 'block';
    container.style.left = `${windowPosition.x}px`;
    container.style.top = `${windowPosition.y - offsetY}px`;
  }
}

function cerrarCesiumPopup() {
  cesiumActiveEntity = null;
  if (cesiumViewer) {
    cesiumViewer.selectedEntity = undefined;
  }
  const container = document.getElementById('cesium-popup-container');
  if (container) {
    container.classList.add('hidden');
    container.style.display = 'none';
  }
}


function toggleLocationVisibility(id, visible) {
  const loc = userLocations.find(l => String(l.id) === String(id));
  if (loc) {
    loc.enabled = visible;
  }

  const marker = mapMarkers[id];
  if (marker && leafletMap) {
    if (visible) leafletMap.addLayer(marker);
    else leafletMap.removeLayer(marker);
  }

  const entity = cesiumEntities[id];
  if (entity) {
    entity.show = visible;
  }

  updateRightPanel(); // Recalcular métricas en el panel derecho al activar/desactivar la casilla
}



function renderActiveLayers() {
  const container = document.getElementById('contenedor-capas');
  if (!container) return;

  if (!userLocations || userLocations.length === 0) {
    container.innerHTML = `<p id="empty-layers-msg" class="text-[10px] text-slate-500 text-center py-2">No active assets loaded.</p>`;
    return;
  }

  container.innerHTML = userLocations.map(loc => `
    <div class="flex items-center justify-between p-1.5 rounded bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-colors group">
      <div class="flex items-center gap-2 truncate pr-2">
        <input type="checkbox" checked onchange="toggleLocationVisibility('${loc.id}', this.checked)" class="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer">
        <span class="text-[11px] font-medium text-slate-300 truncate cursor-pointer hover:text-white" onclick="zoomToLocation('${loc.id}')" title="Hacer clic para enfocar">
          ${loc.name}
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-[9px] text-slate-500 font-mono">(${Number(loc.lat).toFixed(2)}, ${Number(loc.lng).toFixed(2)})</span>
        <button onclick="deleteLocation(event, '${loc.id}')" class="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors opacity-80 group-hover:opacity-100 cursor-pointer" title="Eliminar punto">
          <i class="fa-solid fa-trash-can text-[10px] pointer-events-none"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function zoomToLocation(id) {
  const loc = userLocations.find(item => item.id === id);
  if (!loc) return;

  if (currentMode === '2d' && leafletMap) {
    leafletMap.flyTo([loc.lat, loc.lng], 13);
    if (mapMarkers[id]) mapMarkers[id].openPopup();
  } else if (currentMode === '3d' && cesiumViewer) {
    const entity = cesiumEntities[id];
    if (entity) {
      cesiumViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, 15000.0),
        duration: 1.5
      });
      mostrarCesiumPopup(entity, loc);
    }
  }
}

function deleteLocation(event, id) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (mapMarkers[id]) {
    if (leafletMap && leafletMap.hasLayer(mapMarkers[id])) {
      leafletMap.removeLayer(mapMarkers[id]);
    }
    delete mapMarkers[id];
  }

  if (cesiumEntities[id]) {
    if (cesiumViewer && cesiumViewer.entities) {
      cesiumViewer.entities.remove(cesiumEntities[id]);
    }
    delete cesiumEntities[id];

    if (cesiumActiveEntity && cesiumActiveEntity.id === id) {
      cerrarCesiumPopup();
    }
  }

  userLocations = userLocations.filter(loc => String(loc.id) !== String(id));
  renderActiveLayers();
  updateRightPanel(); // Recalcular panel derecho tras eliminar
}

// ============================================================
// 4. IMPORTACIÓN DE ARCHIVOS (TXT, CSV, GEOJSON)
// ============================================================
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name;
  const ext = fileName.split('.').pop().toLowerCase();

  const reader = new FileReader();
  if (ext === 'csv' || ext === 'txt') {
    reader.onload = (e) => parseCSVData(e.target.result, fileName);
    reader.readAsText(file);
  } else if (ext === 'geojson' || ext === 'json') {
    reader.onload = (e) => parseGeoJSONData(JSON.parse(e.target.result), fileName);
    reader.readAsText(file);
  } else {
    alert(`Archivo "${fileName}" no soportado. Sube un archivo CSV, TXT o GeoJSON.`);
  }
}

function parseCSVData(csvText, fileName) {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return;

  // Sombra de detección flexible de separadores (coma o punto y coma)
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());
  
  const latIndex = headers.findIndex(h => h.includes('lat'));
  const lngIndex = headers.findIndex(h => h.includes('lon') || h.includes('lng'));
  const nameIndex = headers.findIndex(h => h.includes('name') || h.includes('nombre') || h.includes('asset') || h.includes('punto'));

  if (latIndex === -1 || lngIndex === -1) {
    alert("No se identificaron columnas de Latitud ('lat') y Longitud ('lon' o 'lng') en el archivo.");
    return;
  }

  let addedCount = 0;
  lines.slice(1).forEach((line, i) => {
    const cols = line.split(separator).map(c => c.trim());
    const lat = parseFloat(cols[latIndex]);
    const lng = parseFloat(cols[lngIndex]);
    const name = nameIndex !== -1 && cols[nameIndex] ? cols[nameIndex] : `Importado-${i + 1}`;

    if (!isNaN(lat) && !isNaN(lng)) {
      // Carga en modo silencioso para optimizar rendimiento
      agregarPuntoAlSistema(name, lat, lng, fileName, true);
      addedCount++;
    }
  });

  // Renderizar panel y mapa al finalizar la lectura completa
  finalizarCargaMasiva();
  alert(`Se importaron exitosamente ${addedCount} ubicaciones desde ${fileName}.`);
}

function parseGeoJSONData(geoJson, fileName) {
  if (!geoJson.features || !Array.isArray(geoJson.features)) return;

  let addedCount = 0;
  geoJson.features.forEach((feat, i) => {
    if (feat.geometry && feat.geometry.type === 'Point') {
      const [lng, lat] = feat.geometry.coordinates;
      const name = feat.properties?.name || feat.properties?.nombre || `GeoJSON-${i + 1}`;

      agregarPuntoAlSistema(name, lat, lng, fileName, true);
      addedCount++;
    }
  });

  finalizarCargaMasiva();
  alert(`Se importaron exitosamente ${addedCount} puntos desde ${fileName}.`);
}



function parseCSVData(csvText, fileName) {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return;

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const latIndex = headers.findIndex(h => h.includes('lat'));
  const lngIndex = headers.findIndex(h => h.includes('lon') || h.includes('lng'));
  const nameIndex = headers.findIndex(h => h.includes('name') || h.includes('nombre') || h.includes('asset'));

  if (latIndex === -1 || lngIndex === -1) {
    alert("No se identificaron columnas de 'Lat' y 'Lng' en el CSV.");
    return;
  }

  let addedCount = 0;
  lines.slice(1).forEach((line, i) => {
    const cols = line.split(',').map(c => c.trim());
    const lat = parseFloat(cols[latIndex]);
    const lng = parseFloat(cols[lngIndex]);
    const name = nameIndex !== -1 && cols[nameIndex] ? cols[nameIndex] : `Punto-${i + 1}`;

    if (!isNaN(lat) && !isNaN(lng)) {
      const { risk2030, risk2050 } = calculateClimateRisk(lat, lng);
      const loc = { 
        id: 'loc_' + Date.now() + '_' + i, 
        name, 
        lat, 
        lng, 
        source: fileName,
        risk2030,
        risk2050,
        enabled: true
      };
      userLocations.push(loc);
      plotOnMap(loc, false);
      addedCount++;
    }
  });

  renderActiveLayers();
  updateRightPanel();
  alert(`Se importaron exitosamente ${addedCount} ubicaciones desde ${fileName}.`);
}

function parseGeoJSONData(geoJson, fileName) {
  if (!geoJson.features) return;

  let addedCount = 0;
  geoJson.features.forEach((feat, i) => {
    if (feat.geometry && feat.geometry.type === 'Point') {
      const [lng, lat] = feat.geometry.coordinates;
      const name = feat.properties?.name || feat.properties?.nombre || `Punto-${i + 1}`;
      const { risk2030, risk2050 } = calculateClimateRisk(lat, lng);

      const loc = { 
        id: 'loc_' + Date.now() + '_' + i, 
        name, 
        lat, 
        lng, 
        source: fileName,
        risk2030,
        risk2050,
        enabled: true
      };
      userLocations.push(loc);
      plotOnMap(loc, false);
      addedCount++;
    }
  });

  renderActiveLayers();
  updateRightPanel();
  alert(`Se importaron ${addedCount} puntos desde ${fileName}.`);
}


// --- DESPLEGAR PANELES Y CONTROLES ---
function toggleWidget(bodyId, iconId) {
  const body = document.getElementById(bodyId);
  if (!body) return;

  if (!iconId) {
    iconId = bodyId.replace('body-panel-', 'icon-toggle-');
  }

  const icon = document.getElementById(iconId);
  body.classList.toggle('hidden');

  if (icon) {
    icon.classList.toggle('rotate-180');
  }
}

function toggleNavigationPanel() {
  const panelBody = document.getElementById('navigation-panel-body');
  const toggleIcon = document.getElementById('nav-toggle-icon');
  if (panelBody) panelBody.classList.toggle('hidden');
  if (toggleIcon) toggleIcon.classList.toggle('rotate-180');
}

function toggleConsultasPanel() {
  const panelBody = document.getElementById('consultas-panel-body');
  const toggleIcon = document.getElementById('consultas-toggle-icon');
  if (panelBody) panelBody.classList.toggle('hidden');
  if (toggleIcon) toggleIcon.classList.toggle('rotate-180');
}

function toggleChatBody() {
  const collapsibleContent = document.getElementById('chat-content-collapsible');
  const toggleIcon = document.getElementById('chat-toggle-icon');
  if (collapsibleContent) collapsibleContent.classList.toggle('hidden');
  if (toggleIcon) toggleIcon.classList.toggle('rotate-180');
}

// =========================================================================
// MOTOR DE HERRAMIENTAS ESPACIALES MULTI-VISTA (2D Leaflet y 3D Cesium)
// =========================================================================

// --- UTILIDADES DE CÁLCULO GEOMÉTRICO ---
function calcularDistanciaPuntos(p1, p2) {
  const R = 6371000; // Radio medio de la Tierra en metros
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatearDistancia(metros) {
  if (metros >= 1000) return `${(metros / 1000).toFixed(2)} km`;
  return `${metros.toFixed(1)} m`;
}

function calcularAreaPoligono(puntos) {
  if (puntos.length < 3) return 0;
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < puntos.length; i++) {
    const p1 = puntos[i];
    const p2 = puntos[(i + 1) % puntos.length];
    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const lon1 = p1.lng * Math.PI / 180;
    const lon2 = p2.lng * Math.PI / 180;
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * R * R / 2);
}

function formatearArea(m2) {
  if (m2 >= 1000000) return `${(m2 / 1000000).toFixed(2)} km²`;
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${m2.toFixed(1)} m²`;
}

// --- GESTIÓN DE ESTADOS Y EVENTOS ---
function activarHerramientaDibujo(modo) {
  desactivarHerramientasActuales();
  activeDrawTool = modo;

  actualizarEstilosBotonesHerramientas(modo);

  const statusEl = document.getElementById('statusDibujo');
  if (statusEl) {
    statusEl.className = 'text-[9px] text-blue-400 font-bold px-1 animate-pulse';
    if (modo === 'point') statusEl.textContent = 'Modo Punto: Haz clic en el mapa';
    else if (modo === 'rectangle') statusEl.textContent = 'Modo Rectángulo: Clic para fijar esquina 1';
    else if (modo === 'lasso') statusEl.textContent = 'Modo Lazo: Haz clics sucesivos (Doble clic para terminar)';
    else if (modo === 'measure') statusEl.textContent = 'Modo Medición: Clic para puntos de ruta (Doble clic para terminar)';
  }

  // Configurar listeners en Leaflet 2D
  if (leafletMap) {
    leafletMap.getContainer().style.cursor = 'crosshair';
    leafletMap.on('click', manejarEventoClic2D);
    leafletMap.on('mousemove', manejarEventoMover2D);
    leafletMap.on('dblclick', manejarEventoDobleClic2D);
  }

  // Configurar listeners en Cesium 3D
  if (cesiumViewer) {
    cesiumViewer.canvas.style.cursor = 'crosshair';
    cesiumToolHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    cesiumToolHandler.setInputAction((movement) => {
      const coord = obtenerLatLonCesium(movement.position);
      if (coord) manejarEventoClic3D(coord);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    cesiumToolHandler.setInputAction((movement) => {
      const coord = obtenerLatLonCesium(movement.endPosition);
      if (coord) manejarEventoMover3D(coord);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    cesiumToolHandler.setInputAction(() => {
      finalizarDibujoHerramienta();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    cesiumToolHandler.setInputAction(() => {
      finalizarDibujoHerramienta();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }
}

function desactivarHerramientasActuales() {
  activeDrawTool = null;
  tempPoints = [];

  if (leafletMap) {
    if (leafletMap.getContainer()) leafletMap.getContainer().style.cursor = '';
    leafletMap.off('click', manejarEventoClic2D);
    leafletMap.off('mousemove', manejarEventoMover2D);
    leafletMap.off('dblclick', manejarEventoDobleClic2D);
  }

  if (cesiumViewer && cesiumViewer.canvas) {
    cesiumViewer.canvas.style.cursor = '';
  }

  if (cesiumToolHandler) {
    cesiumToolHandler.destroy();
    cesiumToolHandler = null;
  }

  limpiarPrevisualizacionTemp();
  actualizarEstilosBotonesHerramientas(null);
}

function actualizarEstilosBotonesHerramientas(modoActivo) {
  const modos = ['point', 'rectangle', 'lasso', 'measure'];
  modos.forEach(m => {
    const btn = document.getElementById(`btn-draw-${m}`);
    if (btn) {
      if (m === modoActivo) {
        btn.classList.add('border-blue-500', 'bg-blue-900/60', 'ring-1', 'ring-blue-500');
        btn.classList.remove('border-slate-800/80', 'bg-slate-900/90');
      } else {
        btn.classList.remove('border-blue-500', 'bg-blue-900/60', 'ring-1', 'ring-blue-500');
        btn.classList.add('border-slate-800/80', 'bg-slate-900/90');
      }
    }
  });
}

function obtenerLatLonCesium(position) {
  if (!cesiumViewer || !position) return null;
  const ray = cesiumViewer.camera.getPickRay(position);
  const cartesian = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
  if (cartesian) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      lat: Cesium.Math.toDegrees(cartographic.latitude),
      lng: Cesium.Math.toDegrees(cartographic.longitude)
    };
  }
  return null;
}

// --- MANEJADORES DE EVENTOS EN 2D ---
function manejarEventoClic2D(e) {
  procesarClicPunto({ lat: e.latlng.lat, lng: e.latlng.lng });
}

function manejarEventoMover2D(e) {
  procesarMoverPunto({ lat: e.latlng.lat, lng: e.latlng.lng });
}

function manejarEventoDobleClic2D(e) {
  L.DomEvent.stopPropagation(e);
  finalizarDibujoHerramienta();
}

// --- MANEJADORES DE EVENTOS EN 3D ---
function manejarEventoClic3D(coord) {
  procesarClicPunto(coord);
}

function manejarEventoMover3D(coord) {
  procesarMoverPunto(coord);
}

// ============================================================
// 5. ANÁLISIS ESPACIAL Y HERRAMIENTAS DE DIBUJO
// ============================================================
function procesarClicPunto(coord) {
  if (!activeDrawTool) return;

  if (activeDrawTool === 'point') {
    const nombre = prompt('Nombre del Punto de Análisis:', `Análisis-${currentAssetsData.length + 1}`);
    if (!nombre) return;

    // Conectar la herramienta de punto al embudo central
    agregarPuntoAlSistema(nombre, coord.lat, coord.lng, 'Análisis Espacial');

    desactivarHerramientasActuales();

    const statusEl = document.getElementById('statusDibujo');
    if (statusEl) {
      statusEl.textContent = 'Punto agregado y calculado en tiempo real';
      statusEl.className = 'text-[9px] text-green-400 font-semibold px-1';
    }

  } else if (activeDrawTool === 'rectangle') {
    if (tempPoints.length === 0) {
      tempPoints.push(coord);
      const statusEl = document.getElementById('statusDibujo');
      if (statusEl) statusEl.textContent = 'Esquina 1 fijada. Haz clic en la esquina opuesta.';
    } else {
      const p1 = tempPoints[0];
      const p2 = coord;

      const minLat = Math.min(p1.lat, p2.lat);
      const maxLat = Math.max(p1.lat, p2.lat);
      const minLng = Math.min(p1.lng, p2.lng);
      const maxLng = Math.max(p1.lng, p2.lng);

      const areaM2 = calcularAreaPoligono([
        { lat: minLat, lng: minLng },
        { lat: maxLat, lng: minLng },
        { lat: maxLat, lng: maxLng },
        { lat: minLat, lng: maxLng }
      ]);
      const areaText = formatearArea(areaM2);

      // Renderizar en 2D (Leaflet)
      if (leafletMap) {
        const rect2D = L.rectangle([[minLat, minLng], [maxLat, maxLng]], {
          color: '#3b82f6',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.25
        }).addTo(leafletMap);
        rect2D.bindPopup(`<b>Rectángulo de Análisis</b><br>Área: <b>${areaText}</b>`).openPopup();
        drawnLayers2D.push(rect2D);
      }

      // Renderizar en 3D (Cesium)
      if (cesiumViewer) {
        const rect3D = cesiumViewer.entities.add({
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat),
            material: Cesium.Color.BLUE.withAlpha(0.25),
            outline: true,
            outlineColor: Cesium.Color.BLUE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          },
          description: `<div class="p-2"><b>Rectángulo de Análisis</b><br>Área: <b>${areaText}</b></div>`
        });
        drawnEntities3D.push(rect3D);
      }

      const statusEl = document.getElementById('statusDibujo');
      if (statusEl) {
        statusEl.textContent = `Rectángulo dibujado (${areaText})`;
        statusEl.className = 'text-[9px] text-green-400 font-semibold px-1';
      }

      desactivarHerramientasActuales();
    }

  } else if (activeDrawTool === 'lasso' || activeDrawTool === 'measure') {
    tempPoints.push(coord);
    const count = tempPoints.length;
    const statusEl = document.getElementById('statusDibujo');
    if (statusEl) {
      statusEl.textContent = `${activeDrawTool === 'lasso' ? 'Lazo' : 'Medición'}: ${count} punto(s). Doble clic para finalizar.`;
    }
  }
}

function procesarMoverPunto(coord) {
  if (!activeDrawTool || tempPoints.length === 0) return;

  limpiarPrevisualizacionTemp();

  if (activeDrawTool === 'rectangle') {
    const p1 = tempPoints[0];
    const p2 = coord;

    const minLat = Math.min(p1.lat, p2.lat);
    const maxLat = Math.max(p1.lat, p2.lat);
    const minLng = Math.min(p1.lng, p2.lng);
    const maxLng = Math.max(p1.lng, p2.lng);

    if (leafletMap) {
      tempGraphics2D = L.rectangle([[minLat, minLng], [maxLat, maxLng]], {
        color: '#60a5fa',
        weight: 1.5,
        dashArray: '4, 4',
        fillColor: '#60a5fa',
        fillOpacity: 0.15
      }).addTo(leafletMap);
    }

    if (cesiumViewer) {
      tempGraphic3D = cesiumViewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat),
          material: Cesium.Color.DODGERBLUE.withAlpha(0.15),
          outline: true,
          outlineColor: Cesium.Color.DODGERBLUE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
      });
    }

  } else if (activeDrawTool === 'lasso') {
    const previewPoints = [...tempPoints, coord];
    if (previewPoints.length >= 2) {
      if (leafletMap) {
        tempGraphics2D = L.polyline(previewPoints.map(p => [p.lat, p.lng]), {
          color: '#a855f7',
          weight: 2,
          dashArray: '3, 3'
        }).addTo(leafletMap);
      }

      if (cesiumViewer) {
        const degrees = [];
        previewPoints.forEach(p => degrees.push(p.lng, p.lat));
        tempGraphic3D = cesiumViewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(degrees),
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.PURPLE }),
            clampToGround: true
          }
        });
      }
    }

  } else if (activeDrawTool === 'measure') {
    const previewPoints = [...tempPoints, coord];
    let distTotal = 0;
    for (let i = 0; i < previewPoints.length - 1; i++) {
      distTotal += calcularDistanciaPuntos(previewPoints[i], previewPoints[i + 1]);
    }
    const distText = formatearDistancia(distTotal);

    if (leafletMap) {
      tempGraphics2D = L.polyline(previewPoints.map(p => [p.lat, p.lng]), {
        color: '#f59e0b',
        weight: 2,
        dashArray: '4, 4'
      }).addTo(leafletMap);
    }

    if (cesiumViewer) {
      const degrees = [];
      previewPoints.forEach(p => degrees.push(p.lng, p.lat));
      tempGraphic3D = cesiumViewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(degrees),
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.ORANGE }),
          clampToGround: true
        }
      });
    }

    const statusEl = document.getElementById('statusDibujo');
    if (statusEl) statusEl.textContent = `Distancia actual: ${distText}`;
  }
}

function finalizarDibujoHerramienta() {
  if (!activeDrawTool || tempPoints.length < 2) {
    desactivarHerramientasActuales();
    return;
  }

  if (activeDrawTool === 'lasso' && tempPoints.length >= 3) {
    const areaM2 = calcularAreaPoligono(tempPoints);
    const areaText = formatearArea(areaM2);

    // 2D
    if (leafletMap) {
      const poly2D = L.polygon(tempPoints.map(p => [p.lat, p.lng]), {
        color: '#8b5cf6',
        weight: 2,
        fillColor: '#8b5cf6',
        fillOpacity: 0.3
      }).addTo(leafletMap);
      poly2D.bindPopup(`<b>Polígono Lazo</b><br>Área: <b>${areaText}</b>`).openPopup();
      drawnLayers2D.push(poly2D);
    }

    // 3D
    if (cesiumViewer) {
      const degrees = [];
      tempPoints.forEach(p => degrees.push(p.lng, p.lat));
      const poly3D = cesiumViewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(degrees),
          material: Cesium.Color.PURPLE.withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.PURPLE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        },
        description: `<div class="p-2"><b>Polígono Lazo</b><br>Área: <b>${areaText}</b></div>`
      });
      drawnEntities3D.push(poly3D);
    }

    const statusEl = document.getElementById('statusDibujo');
    if (statusEl) {
      statusEl.textContent = `Lazo completado (${areaText})`;
      statusEl.className = 'text-[9px] text-green-400 font-semibold px-1';
    }

  } else if (activeDrawTool === 'measure' && tempPoints.length >= 2) {
    let distTotal = 0;
    for (let i = 0; i < tempPoints.length - 1; i++) {
      distTotal += calcularDistanciaPuntos(tempPoints[i], tempPoints[i + 1]);
    }
    const distText = formatearDistancia(distTotal);

    // 2D
    if (leafletMap) {
      const line2D = L.polyline(tempPoints.map(p => [p.lat, p.lng]), {
        color: '#f59e0b',
        weight: 3
      }).addTo(leafletMap);
      line2D.bindPopup(`<b>Medición de Distancia</b><br>Longitud Total: <b>${distText}</b>`).openPopup();
      drawnLayers2D.push(line2D);
    }

    // 3D
    if (cesiumViewer) {
      const degrees = [];
      tempPoints.forEach(p => degrees.push(p.lng, p.lat));
      const line3D = cesiumViewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(degrees),
          width: 3,
          material: Cesium.Color.ORANGE,
          clampToGround: true
        },
        description: `<div class="p-2"><b>Medición de Distancia</b><br>Longitud Total: <b>${distText}</b></div>`
      });
      drawnEntities3D.push(line3D);
    }

    const statusEl = document.getElementById('statusDibujo');
    if (statusEl) {
      statusEl.textContent = `Medición finalizada (${distText})`;
      statusEl.className = 'text-[9px] text-green-400 font-semibold px-1';
    }
  }

  desactivarHerramientasActuales();
}

function limpiarPrevisualizacionTemp() {
  if (tempGraphics2D && leafletMap) {
    leafletMap.removeLayer(tempGraphics2D);
    tempGraphics2D = null;
  }
  if (tempGraphic3D && cesiumViewer) {
    cesiumViewer.entities.remove(tempGraphic3D);
    tempGraphic3D = null;
  }
}

// --- BOTÓN LIMPIAR DIBUJOS Y GRÁFICOS ---
function limpiarDibujos() {
  desactivarHerramientasActuales();

  // Limpiar capas en Leaflet 2D
  drawnLayers2D.forEach(layer => {
    if (leafletMap && leafletMap.hasLayer(layer)) {
      leafletMap.removeLayer(layer);
    }
  });
  drawnLayers2D = [];

  // Limpiar entidades en Cesium 3D
  drawnEntities3D.forEach(entity => {
    if (cesiumViewer && cesiumViewer.entities) {
      cesiumViewer.entities.remove(entity);
    }
  });
  drawnEntities3D = [];

  const statusEl = document.getElementById('statusDibujo');
  if (statusEl) {
    statusEl.textContent = 'Ninguna herramienta activa';
    statusEl.className = 'text-[9px] text-slate-400 italic px-1';
  }
}

// --- LÓGICA DE AGENTES IA Y PIPELINE ---
const langGraphState = {
  currentStep: 1,
  userQueryHistory: [],
  extractedClimateData: null,
  riskEvaluation: null,
  generatedReport: null,
  isProcessing: false
};

const agentResponses = {
  1: {
    agentName: "Agente 1: Ingesta y Filtrado Climático",
    toolExecuted: "sql_cloud_query(table='extreme_wind_5days', asset='Sogamoso', database='cloud_sql_climate_explorer')",
    llmReasoning: "He consultado la base de datos PostgreSQL/Cloud SQL conectada vía FastAPI. Extraje los raster de viento extremal bajo el escenario SSP5-8.5.",
    cardHTML: `
      <div class="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5 text-[10px] font-mono">
        <div class="flex justify-between border-b border-slate-800/80 pb-1">
          <span class="text-slate-400">Tabla SQL Consultada:</span>
          <span class="text-green-400 font-bold">climate_db.extreme_wind</span>
        </div>
        <div class="flex justify-between border-b border-slate-800/80 pb-1">
          <span class="text-slate-400">Anomalía Detectada (2050):</span>
          <span class="text-amber-400 font-bold">+14.2% Velocidad Ráfaga</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Embeddings Vectoriales:</span>
          <span class="text-blue-400">Match 0.94 (pgvector)</span>
        </div>
      </div>
    `,
    suggestion: "Los datos de grilla han sido validados. Presiona el botón a continuación para transferir el contexto al <b>Agente 2 (Análisis de Riesgo)</b>."
  },
  2: {
    agentName: "Agent 2: Evaluation of Physical Vulnerability and Expected Loss",
    toolExecuted: "run_risk_model(input_query='sogamoso', asset_id='SOG-01', model='Phi-3-Climate')",
    llmReasoning: "Considering the information from Agent 1, I evaluated the physical vulnerability and expected loss in Sogamoso under the SSP5-8.5 scenario. The model indicates a significant increase in expected annual loss by 2050.",
    cardHTML: `
      <div class="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1 text-[10px]">
        <div class="flex justify-between border-b border-slate-800 pb-1">
          <span class="text-slate-400">Expected Annual Loss (2030):</span>
          <span class="font-bold text-amber-400">1.25% ($450K USD)</span>
        </div>
        <div class="flex justify-between pt-0.5">
          <span class="text-slate-400">Expected Annual Loss (2050):</span>
          <span class="font-bold text-red-400">3.74% ($1.2M USD)</span>
        </div>
      </div>
    `,
    suggestion: "Evaluación probabilística guardada en el estado. Podemos proceder a compilar la síntesis técnica con el <b>Agente 3</b>."
  },
  3: {
    agentName: "Agent 3: Report Generator (PDF)",
    toolExecuted: "build_pdf_report(template='SEI_Executive_V1', data_state=langGraphState)",
    llmReasoning: "I consolitated the climate data and risk evaluation into a structured PDF report. The report includes visualizations, tables, and recommendations for international funding opportunities.",
    cardHTML: `
      <div class="p-2.5 bg-slate-950/90 border border-slate-800 rounded-xl flex items-center justify-between gap-2 shadow-inner">
        <div class="flex items-center gap-2 overflow-hidden">
          <i class="fa-solid fa-file-pdf text-red-400 text-xl shrink-0"></i>
          <div class="truncate">
            <p class="text-[10px] font-bold text-white truncate">Reporte_Riesgo_Sogamoso_2050.pdf</p>
            <p class="text-[9px] text-slate-400">Generado vía FastAPI + LangGraph • 2.4 MB</p>
          </div>
        </div>
        <button onclick="downloadReportSimulated()" class="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-bold transition-colors shrink-0 flex items-center gap-1">
          <i class="fa-solid fa-download"></i> PDF
        </button>
      </div>
    `,
    suggestion: "Informe emitido. Transfiriendo la recomendación final al <b>Agente 4</b> para buscar líneas de financiamiento internacional."
  }
};

const pipelineConfig = {
  1: { title: "Paso 1: Agente de Datos Climáticos", placeholder: "Solicita la extracción de grillas de datos climáticos...", nextStep: 2 },
  2: { title: "Paso 2: Agente de Análisis de Riesgo", placeholder: "Solicita el cálculo de vulnerabilidad y pérdida...", nextStep: 3 },
  3: { title: "Paso 3: Agente Generador de Reportes", placeholder: "Solicita la consolidación del reporte en PDF...", nextStep: 4 },
  4: { title: "Finish Analysis", placeholder: "Finish", nextStep: null }
};

function executeCurrentStep(customInput = null) {
  if (langGraphState.isProcessing) return;

  const inputEl = document.getElementById('user-chat-input');
  const chatBody = document.getElementById('chat-conversation-body');
  const queryText = customInput || (inputEl ? inputEl.value.trim() : "");

  if (!queryText) return;

  langGraphState.isProcessing = true;
  langGraphState.userQueryHistory.push(queryText);

  chatBody.innerHTML += `
    <div class="flex justify-end">
      <div class="bg-green-600/20 border border-green-500/30 px-3 py-2 rounded-2xl rounded-tr-none max-w-[85%] text-slate-200 text-[11px]">
        ${queryText}
      </div>
    </div>
  `;

  if (inputEl) inputEl.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  const loadingId = `loading-${Date.now()}`;
  chatBody.innerHTML += `
    <div id="${loadingId}" class="flex gap-2.5">
      <div class="w-7 h-7 rounded-lg bg-green-950/40 border border-green-500/30 flex items-center justify-center shrink-0">
        <i class="fa-solid fa-spinner animate-spin text-green-400 text-xs"></i>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl rounded-tl-none text-slate-400 text-[11px] flex items-center gap-2">
        <i class="fa-solid fa-terminal text-green-400"></i>
        <span>Run 2 Agent ${langGraphState.currentStep})...</span>
      </div>
    </div>
  `;
  chatBody.scrollTop = chatBody.scrollHeight;

  setTimeout(() => {
    document.getElementById(loadingId)?.remove();

    const res = agentResponses[langGraphState.currentStep];
    const nextStep = pipelineConfig[langGraphState.currentStep].nextStep;

    let actionButtonHTML = "";
    if (nextStep) {
      actionButtonHTML = `
        <div class="pt-1">
          <button onclick="triggerNextAgentStep(${nextStep})" class="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-bold transition-all shadow-md flex items-center gap-1.5">
            <i class="fa-solid fa-arrow-right"></i>
            Ejecutar ${pipelineConfig[nextStep].title.split(':')[1]}
          </button>
        </div>
      `;
    }

    chatBody.innerHTML += `
      <div class="flex gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-green-950/60 border border-green-500/40 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-robot text-green-400 text-xs"></i>
        </div>
        <div class="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl rounded-tl-none max-w-[90%] text-slate-200 text-[11px] leading-relaxed space-y-2.5 shadow-lg">
          <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <span class="text-[10px] font-bold text-green-400 flex items-center gap-1">
              <i class="fa-solid fa-microchip"></i> ${res.agentName}
            </span>
            <span class="text-[9px] text-slate-500 font-mono">FastAPI HTTP 200 OK</span>
          </div>
          <div class="flex items-center gap-2 p-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[10px] text-slate-400 font-mono overflow-x-auto">
            <i class="fa-solid fa-terminal text-green-400 shrink-0"></i>
            <span class="truncate">ToolExecuted: <span class="text-slate-200">${res.toolExecuted}</span></span>
          </div>
          <p>${res.llmReasoning}</p>
          ${res.cardHTML}
          <p class="text-slate-400">${res.suggestion}</p>
          ${actionButtonHTML}
        </div>
      </div>
    `;

    unlockNextStepUI(langGraphState.currentStep);
    langGraphState.isProcessing = false;
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 1500);
}

function triggerNextAgentStep(targetStep) {
  selectStep(targetStep);
  const promptDefault = pipelineConfig[targetStep].placeholder;
  executeCurrentStep(promptDefault);
}

function unlockNextStepUI(completedStep) {
  const currentBtnIcon = document.getElementById(`step-icon-${completedStep}`);
  if (currentBtnIcon) {
    currentBtnIcon.innerHTML = `<i class="fa-solid fa-circle-check text-green-400"></i>`;
  }

  const next = pipelineConfig[completedStep].nextStep;
  if (next) {
    const nextBtn = document.getElementById(`step-btn-${next}`);
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-slate-900/50', 'border-slate-800', 'text-slate-600');
      nextBtn.classList.add('bg-blue-500/20', 'border-blue-500/60', 'text-blue-300', 'cursor-pointer');
      
      const nextBtnIcon = document.getElementById(`step-icon-${next}`);
      if (nextBtnIcon) {
        nextBtnIcon.innerHTML = `<i class="fa-solid fa-brain text-[10px] animate-pulse"></i>`;
      }
    }
    selectStep(next);
  }
}

function selectStep(stepNumber) {
  langGraphState.currentStep = stepNumber;
  const config = pipelineConfig[stepNumber];
  
  const titleEl = document.getElementById('pipeline-status-title');
  const inputEl = document.getElementById('user-chat-input');

  if (titleEl) titleEl.innerText = config.title;
  if (inputEl) inputEl.placeholder = config.placeholder;
}

function downloadReportSimulated() {
  alert("Iniciando descarga del Reporte Técnico de Riesgo Climático 2050 (PDF)...");
}







// ============================================================
// 1. BASE DE DATOS Y VARIABLES GLOBALES
// ============================================================
const argosAssets = [
  { id: 'argos_cartagena', name: "Cartagena", lat: 10.336597, lon: -75.504035, source: 'Argos' },
  { id: 'argos_cairo',     name: "Cairo",     lat: 5.865301,  lon: -75.533499, source: 'Argos' },
  { id: 'argos_nare',      name: "Nare",      lat: 6.218793,  lon: -74.572677, source: 'Argos' },
  { id: 'argos_rioclaro',  name: "Rioclaro",  lat: 5.867073,  lon: -74.851288, source: 'Argos' },
  { id: 'argos_sogamoso',  name: "Sogamoso",  lat: 5.762965,  lon: -72.888826, source: 'Argos' },
  { id: 'argos_tolu',      name: "Tolú",      lat: 9.471250,  lon: -75.466215, source: 'Argos' },
  { id: 'argos_yumbo',     name: "Yumbo",     lat: 3.562625,  lon: -76.488304, source: 'Argos' }
];

let currentVariable = "labour-productivity-loss";
let currentAssetsData = [];

// Caché global de grillas climáticas cargadas desde la API de CIE
let cachedGrid2030 = [];
let cachedGrid2050 = [];
let userPointMarker = null;

// ============================================================
// 2. EXTRACCIÓN ESPACIAL (Búsqueda del vecino más cercano)
// ============================================================
function findNearestGridValue(lat, lon, gridData) {
  if (!gridData || gridData.length === 0) return 0;
  
  let minDistance = Infinity;
  let nearestValue = 0;

  for (let i = 0; i < gridData.length; i++) {
    const point = gridData[i];
    const dist = Math.hypot(point.lat - lat, point.lon - lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestValue = point.value;
    }
  }
  return nearestValue;
}

// ============================================================
// 3. API CIE CLIMATE ANALYTICS
// ============================================================
async function fetchCieData(year, variable) {
  const url = `https://cie-api-v2.climateanalytics.org/api/geo-data/?iso=COL&var=${variable}&aggregation_spatial=gdp&season=annual&format=csv&scenarios=rcp45&years=${year}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Error en la consulta API CIE: ${response.statusText}`);
  
  const text = await response.text();
  const lines = text.trim().split("\n");
  
  const dataLines = lines.slice(10);
  if (dataLines.length === 0) return [];

  const headers = dataLines[0].split(",").map(h => h.trim());
  const lons = headers.slice(1).map(Number);
  
  const grid = [];
  for (let i = 1; i < dataLines.length; i++) {
    const cols = dataLines[i].split(",").map(c => c.trim());
    const lat = Number(cols[0]);
    
    for (let j = 1; j < cols.length; j++) {
      const val = Number(cols[j]);
      if (!isNaN(val) && !isNaN(lat) && !isNaN(lons[j - 1])) {
        grid.push({ lat, lon: lons[j - 1], value: val });
      }
    }
  }
  return grid;
}

// ============================================================
// 4. CARGA INICIAL Y RECALCULO GENERAL
// ============================================================
async function cargarDatosPanelRiesgo(variable = "labour-productivity-loss") {
  try {
    currentVariable = variable;

    // A. Guardar las grillas en las variables globales de Caché
    [cachedGrid2030, cachedGrid2050] = await Promise.all([
      fetchCieData(2030, variable),
      fetchCieData(2050, variable)
    ]);

    // B. Procesar puntos base de Argos
    currentAssetsData = argosAssets.map(asset => {
      const val2030 = findNearestGridValue(asset.lat, asset.lon, cachedGrid2030);
      const val2050 = findNearestGridValue(asset.lat, asset.lon, cachedGrid2050);
      return {
        ...asset,
        v2030: val2030,
        v2050: val2050,
        diffAbs: val2050 - val2030
      };
    });

    // C. Renderizar todo el panel
    actualizarTodoElPanel(currentAssetsData);

  } catch (error) {
    console.error("Error cargando datos climáticos CIE:", error);
  }
}

// ============================================================
// 5. FUNCIÓN CENTRALIZADA PARA AGREGAR Y RECALCULAR PUNTOS
// ============================================================
function agregarNuevoPuntoYRecalcular(name, lat, lon, source = 'Manual') {
  // Extraer valores de las grillas guardadas en caché
  const val2030 = findNearestGridValue(lat, lon, cachedGrid2030);
  const val2050 = findNearestGridValue(lat, lon, cachedGrid2050);

  const newAsset = {
    id: 'custom_' + Date.now(),
    name: name || `Punto-${currentAssetsData.length + 1}`,
    lat: lat,
    lon: lon,
    v2030: val2030,
    v2050: val2050,
    diffAbs: val2050 - val2030,
    source: source
  };

  // Reemplazar o agregar el punto personalizado en el portafolio activo
  currentAssetsData = [
    ...currentAssetsData.filter(a => a.name !== newAsset.name),
    newAsset
  ];

  // Dibujar/Centrar en los mapas 2D y 3D
  if (typeof plotOnMap === 'function') {
    plotOnMap({ ...newAsset, lng: lon }, true);
  }

  // Refrescar paneles
  actualizarTodoElPanel(currentAssetsData);
}

// ============================================================
// 6. RENDERIZADO DEL PANEL DERECHO (Soportando parámetros)
// ============================================================
function actualizarTodoElPanel(data = currentAssetsData) {
  currentAssetsData = data;
  renderPanelMetricas(data);
  renderPanelRiesgo(data);
  renderPanelComparacion(data);
  if (typeof renderActiveLayers === 'function') renderActiveLayers();
}

// 6.1 PORTFOLIO METRICS
function renderPanelMetricas(data = currentAssetsData) {
  if (!data || data.length === 0) return;

  const vals2030 = data.map(a => a.v2030);
  const vals2050 = data.map(a => a.v2050);

  const avg2030 = vals2030.reduce((a, b) => a + b, 0) / vals2030.length;
  const avg2050 = vals2050.reduce((a, b) => a + b, 0) / vals2050.length;
  const avgChange = avg2050 - avg2030;

  const min2030 = Math.min(...vals2030);
  const max2030 = Math.max(...vals2030);
  const min2050 = Math.min(...vals2050);
  const max2050 = Math.max(...vals2050);

  const elP2030 = document.getElementById("metric-p2030");
  if (elP2030) {
    elP2030.innerText = `${avg2030.toFixed(2)}%`;
    if (elP2030.nextElementSibling) {
      elP2030.nextElementSibling.innerText = `Ran: ${min2030.toFixed(2)}%–${max2030.toFixed(2)}%`;
    }
  }

  const elP2050 = document.getElementById("metric-p2050");
  if (elP2050) {
    elP2050.innerText = `${avg2050.toFixed(2)}%`;
    if (elP2050.nextElementSibling) {
      elP2050.nextElementSibling.innerText = `Ran: ${min2050.toFixed(2)}%–${max2050.toFixed(2)}%`;
    }
  }

  const changeEl = document.getElementById("metric-change");
  if (changeEl) {
    changeEl.innerText = `${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`;
    changeEl.className = `text-xs font-bold font-mono ${avgChange >= 0 ? 'text-rose-400' : 'text-emerald-400'}`;
  }
}

// 6.2 RISK ANALYSIS
function renderPanelRiesgo(data = currentAssetsData) {
  if (!data || data.length === 0) return;

  const sorted2050 = [...data].sort((a, b) => b.v2050 - a.v2050);
  const maxAsset = sorted2050[0];
  const minAsset = sorted2050[sorted2050.length - 1];

  const maxEl = document.getElementById("plant-max-exposure");
  if (maxEl) {
    maxEl.innerText = maxAsset.name;
    if (maxEl.parentElement && maxEl.parentElement.nextElementSibling) {
      maxEl.parentElement.nextElementSibling.innerText = `${maxAsset.v2050.toFixed(2)}%`;
    }
  }

  const minEl = document.getElementById("plant-resilient");
  if (minEl) {
    minEl.innerText = minAsset.name;
    if (minEl.parentElement && minEl.parentElement.nextElementSibling) {
      minEl.parentElement.nextElementSibling.innerText = `${minAsset.v2050.toFixed(2)}%`;
    }
  }

  const descMap = {
    "labour-productivity-loss": "Impacto significativo en productividad laboral debido a estrés térmico proyectado hacia 2050.",
    "HI-danger": "Aumento en días con índice de calor en rango de peligro agudo.",
    "prAdjust": "Variación porcentual acumulada en precipitación anual promedio.",
    "rx5day": "Riesgo incremental por eventos de precipitación extrema acumulada en 5 días.",
    "consecutive_dry_days": "Incremento proyectado en periodos prolongados de días secos consecutivos."
  };
  const descEl = document.getElementById("risk-description");
  if (descEl) {
    descEl.innerText = descMap[currentVariable] || descMap["labour-productivity-loss"];
  }
}

// 6.3 ASSET COMPARISON
function renderPanelComparacion(data = currentAssetsData) {
  if (!data || data.length === 0) return;

  const sortOption = document.getElementById("select-sort-assets")?.value || "risk-desc";
  let sorted = [...data];

  if (sortOption === "risk-desc") sorted.sort((a, b) => b.v2050 - a.v2050);
  else if (sortOption === "risk-asc") sorted.sort((a, b) => a.v2050 - b.v2050);
  else if (sortOption === "alpha") sorted.sort((a, b) => a.name.localeCompare(b.name));

  const tbody = document.getElementById("asset-productivity-list");
  if (tbody) {
    tbody.innerHTML = sorted.map(asset => {
      const diffText = `${asset.diffAbs >= 0 ? '+' : ''}${asset.diffAbs.toFixed(2)}%`;
      const diffColor = asset.diffAbs >= 0 ? "text-rose-400" : "text-emerald-400";

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-1 px-1.5 font-medium text-slate-200">${asset.name}</td>
          <td class="py-1 px-1">${asset.v2030.toFixed(2)}%</td>
          <td class="py-1 px-1 text-amber-400 font-semibold">${asset.v2050.toFixed(2)}%</td>
          <td class="py-1 px-1 text-right ${diffColor} font-mono font-bold">${diffText}</td>
        </tr>
      `;
    }).join("");
  }

  renderMiniChart(sorted);
}

function renderMiniChart(data) {
  const chartContainer = document.getElementById("chart-asset-productivity");
  if (!chartContainer) return;

  const maxVal = Math.max(...data.map(d => d.v2050), 0.1);

  chartContainer.innerHTML = `
    <div class="w-full h-full flex items-end justify-between gap-1 px-1 pt-3 pb-1">
      ${data.map(d => {
        const heightPct = Math.max((d.v2050 / maxVal) * 100, 5);
        return `
          <div class="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
            <div class="text-[8px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-3">
              ${d.v2050.toFixed(1)}%
            </div>
            <div class="w-full bg-blue-600/30 group-hover:bg-blue-500/50 rounded-t transition-all relative overflow-hidden" style="height: ${heightPct}%">
              <div class="w-full bg-amber-400/80 absolute bottom-0 left-0 right-0" style="height: ${d.v2050 ? (d.v2030 / d.v2050) * 100 : 0}%"></div>
            </div>
            <span class="text-[7px] text-slate-400 truncate w-full text-center">${d.name.substring(0, 3)}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ============================================================
// 7. CONEXIÓN CON FORMULARIO "MANUAL DATA" (+ Add Location)
// ============================================================
function addManualLocation() {
  const nameInput = document.getElementById('manual-name');
  const name = nameInput ? nameInput.value.trim() : '';

  let lat, lng;
  if (activeCoordType === 'dd') {
    lat = parseFloat(document.getElementById('manual-lat').value);
    lng = parseFloat(document.getElementById('manual-lng').value);
  } else {
    const latDeg = document.getElementById('lat-deg').value;
    const latMin = document.getElementById('lat-min').value;
    const latSec = document.getElementById('lat-sec').value;
    const latDir = document.getElementById('lat-dir').value;

    const lngDeg = document.getElementById('lng-deg').value;
    const lngMin = document.getElementById('lng-min').value;
    const lngSec = document.getElementById('lng-sec').value;
    const lngDir = document.getElementById('lng-dir').value;

    if (!latDeg || !lngDeg) {
      alert("Ingresa los grados de latitud y longitud.");
      return;
    }
    lat = dmsToDecimal(latDeg, latMin, latSec, latDir);
    lng = dmsToDecimal(lngDeg, lngMin, lngSec, lngDir);
  }

  if (isNaN(lat) || isNaN(lng)) {
    alert("Por favor ingresa coordenadas válidas.");
    return;
  }

  // Invocar la adición y cálculo
  agregarNuevoPuntoYRecalcular(name || `Punto-${currentAssetsData.length + 1}`, lat, lng, 'Manual');

  // Limpiar campos
  if (nameInput) nameInput.value = '';
  document.getElementById('manual-lat').value = '';
  document.getElementById('manual-lng').value = '';
}

// ============================================================
// 8. LISTENERS DE INICIALIZACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const selectSort = document.getElementById("select-sort-assets");
  if (selectSort) {
    selectSort.addEventListener("change", () => renderPanelComparacion());
  }

  // Carga inicial de datos climáticos
  cargarDatosPanelRiesgo("labour-productivity-loss");
});








// =========================================================================
// SINCRONIZACIÓN Y RECALCULO DEL PANEL DERECHO (QUERY PANEL)
// =========================================================================
function updateRightPanel() {
  const activeLocations = userLocations.filter(loc => loc.enabled !== false);

  // 1. Calcular Promedios del Portafolio Activo
  let avg2030 = 0;
  let avg2050 = 0;

  if (activeLocations.length > 0) {
    const sum2030 = activeLocations.reduce((acc, loc) => acc + (loc.risk2030 || 0), 0);
    const sum2050 = activeLocations.reduce((acc, loc) => acc + (loc.risk2050 || 0), 0);
    avg2030 = sum2030 / activeLocations.length;
    avg2050 = sum2050 / activeLocations.length;
  }

  // Actualizar indicadores numéricos principales si existen en la vista
  const elAvg2030 = document.getElementById('avg-risk-2030');
  const elAvg2050 = document.getElementById('avg-risk-2050');
  const elCount = document.getElementById('active-assets-count');

  if (elAvg2030) elAvg2030.textContent = `${avg2030.toFixed(2)}%`;
  if (elAvg2050) elAvg2050.textContent = `${avg2050.toFixed(2)}%`;
  if (elCount) elCount.textContent = `${activeLocations.length} activos`;

  // 2. Renderizar Lista y Barras Comparativas de Activos en el Panel Derecho
  const containerList = document.getElementById('right-panel-assets-list') || document.getElementById('portfolio-assets-container');
  if (!containerList) return;

  if (activeLocations.length === 0) {
    containerList.innerHTML = `<p class="text-[10px] text-slate-500 text-center py-4">No hay activos seleccionados para analizar.</p>`;
    return;
  }

  containerList.innerHTML = activeLocations.map(loc => {
    const width2030 = Math.min((loc.risk2030 / 10) * 100, 100);
    const width2050 = Math.min((loc.risk2050 / 10) * 100, 100);

    return `
      <div class="p-2 bg-slate-900/80 border border-slate-800/80 rounded-lg space-y-1 hover:border-slate-700 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-200 truncate">${loc.name}</span>
          <span class="text-[9px] text-slate-400 font-mono">(${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)})</span>
        </div>
        <div class="space-y-1 pt-1">
          <div class="flex items-center justify-between text-[9.5px]">
            <span class="text-slate-400">2030: <strong class="text-amber-400">${loc.risk2030.toFixed(2)}%</strong></span>
            <span class="text-slate-400">2050: <strong class="text-red-400">${loc.risk2050.toFixed(2)}%</strong></span>
          </div>
          <div class="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden flex">
            <div class="bg-amber-500 h-full rounded-l transition-all duration-500" style="width: ${width2030}%" title="2030: ${loc.risk2030}%"></div>
            <div class="bg-red-500 h-full rounded-r transition-all duration-500" style="width: ${width2050}%" title="2050: ${loc.risk2050}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}












// ============================================================
// 1. EMBUDO ÚNICO CENTRALIZADO PARA CUALQUIER PUNTO
// ============================================================
function agregarPuntoAlSistema(name, lat, lon, source = 'Sistema', silent = false) {
  // Parsing seguro de coordenadas
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (isNaN(latNum) || isNaN(lonNum)) return null;

  // Extraer riesgo climático real desde las grillas globales cargadas de la API CIE
  const val2030 = typeof findNearestGridValue === 'function' ? findNearestGridValue(latNum, lonNum, cachedGrid2030) : 0;
  const val2050 = typeof findNearestGridValue === 'function' ? findNearestGridValue(latNum, lonNum, cachedGrid2050) : 0;

  const newAsset = {
    id: 'loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: name || `Punto-${currentAssetsData.length + 1}`,
    lat: latNum,
    lng: lonNum,
    lon: lonNum,
    v2030: val2030,
    v2050: val2050,
    risk2030: val2030, // Compatibilidad con vistas anteriores
    risk2050: val2050,
    diffAbs: val2050 - val2030,
    source: source,
    enabled: true
  };

  // Mantener sincronizados los arreglos globales
  currentAssetsData.push(newAsset);
  if (typeof userLocations !== 'undefined' && userLocations !== currentAssetsData) {
    userLocations.push(newAsset);
  }

  // Graficar en visores 2D (Leaflet) / 3D (Cesium)
  if (typeof plotOnMap === 'function') {
    plotOnMap(newAsset, !silent);
  }

  // Refrescar UI (si no es carga masiva en lote)
  if (!silent) {
    if (typeof renderActiveLayers === 'function') renderActiveLayers();
    if (typeof actualizarTodoElPanel === 'function') {
      actualizarTodoElPanel(currentAssetsData);
    } else if (typeof updateRightPanel === 'function') {
      updateRightPanel();
    }
  }

  return newAsset;
}


// Refrescar masivo para batch imports
function finalizarCargaMasiva() {
  if (typeof renderActiveLayers === 'function') renderActiveLayers();
  if (typeof actualizarTodoElPanel === 'function') {
    actualizarTodoElPanel(currentAssetsData);
  } else if (typeof updateRightPanel === 'function') {
    updateRightPanel();
  }
}






