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

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initLeaflet();
  initOpacitySlider();
  switchView('3d');
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

  const newLocation = { 
    id: 'loc_' + Date.now(), 
    name: name, 
    lat: lat, 
    lng: lng, 
    source: 'manual' 
  };

  userLocations.push(newLocation);

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
}

function plotOnMap(location, centerMap = false) {
  const popupContent = `
    <div class="p-2 text-slate-900 font-sans">
      <div class="flex items-center gap-1.5 mb-1">
        <i class="fa-solid fa-location-dot text-blue-600 text-xs"></i>
        <h4 class="font-bold text-xs text-slate-800 m-0">${location.name}</h4>
      </div>
      <div class="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-200 pt-1 mt-1">
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

  content.innerHTML = `
    <div class="font-sans pr-4">
      <div class="flex items-center gap-1.5 mb-1">
        <i class="fa-solid fa-location-dot text-blue-600 text-xs"></i>
        <h4 class="font-bold text-xs text-slate-800 m-0">${location.name}</h4>
      </div>
      <div class="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-200 pt-1 mt-1">
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
  const marker = mapMarkers[id];
  if (marker && leafletMap) {
    if (visible) leafletMap.addLayer(marker);
    else leafletMap.removeLayer(marker);
  }

  const entity = cesiumEntities[id];
  if (entity) {
    entity.show = visible;
  }
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
}

// --- IMPORTACIÓN DE ARCHIVOS ---
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name;
  const ext = fileName.split('.').pop().toLowerCase();

  if (ext === 'csv' || ext === 'txt') {
    const reader = new FileReader();
    reader.onload = (e) => parseCSVData(e.target.result, fileName);
    reader.readAsText(file);
  } else if (ext === 'geojson' || ext === 'json') {
    const reader = new FileReader();
    reader.onload = (e) => parseGeoJSONData(JSON.parse(e.target.result), fileName);
    reader.readAsText(file);
  } else {
    alert(`Archivo "${fileName}" subido. Asegúrate de procesar datos vectoriales compatibles (CSV o GeoJSON).`);
  }
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
      const loc = { id: 'loc_' + Date.now() + '_' + i, name, lat, lng, source: fileName };
      userLocations.push(loc);
      plotOnMap(loc, false);
      addedCount++;
    }
  });

  renderActiveLayers();
  alert(`Se importaron exitosamente ${addedCount} ubicaciones desde ${fileName}.`);
}

function parseGeoJSONData(geoJson, fileName) {
  if (!geoJson.features) return;

  let addedCount = 0;
  geoJson.features.forEach((feat, i) => {
    if (feat.geometry && feat.geometry.type === 'Point') {
      const [lng, lat] = feat.geometry.coordinates;
      const name = feat.properties?.name || feat.properties?.nombre || `Punto-${i + 1}`;

      const loc = { id: 'loc_' + Date.now() + '_' + i, name, lat, lng, source: fileName };
      userLocations.push(loc);
      plotOnMap(loc, false);
      addedCount++;
    }
  });

  renderActiveLayers();
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

// --- LÓGICA DE DIBUJO MULTI-HERRAMIENTA ---
function procesarClicPunto(coord) {
  if (!activeDrawTool) return;

  if (activeDrawTool === 'point') {
    const nombre = prompt('Nombre del Punto de Análisis:', `Análisis-${userLocations.length + 1}`);
    if (!nombre) return;

    const loc = {
      id: 'loc_' + Date.now(),
      name: nombre,
      lat: coord.lat,
      lng: coord.lng,
      source: 'Análisis Espacial'
    };

    userLocations.push(loc);
    plotOnMap(loc, true);
    renderActiveLayers();
    desactivarHerramientasActuales();

    const statusEl = document.getElementById('statusDibujo');
    if (statusEl) {
      statusEl.textContent = 'Punto agregado correctamente';
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
    agentName: "Agente 2: Modelado de Riesgo y Exposición",
    toolExecuted: "run_risk_model(input_raster='extreme_wind_5days', asset_id='SOG-01', model='Phi-3-Climate')",
    llmReasoning: "Tomando los datos de viento procesados por el Agente 1, calculé la matriz de vulnerabilidad física y pérdida esperada en la infraestructura hidroeléctrica.",
    cardHTML: `
      <div class="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1 text-[10px]">
        <div class="flex justify-between border-b border-slate-800 pb-1">
          <span class="text-slate-400">Pérdida Esperada Anual (2030):</span>
          <span class="font-bold text-amber-400">1.25% ($450K USD)</span>
        </div>
        <div class="flex justify-between pt-0.5">
          <span class="text-slate-400">Pérdida Esperada Anual (2050):</span>
          <span class="font-bold text-red-400">3.74% ($1.2M USD)</span>
        </div>
      </div>
    `,
    suggestion: "Evaluación probabilística guardada en el estado. Podemos proceder a compilar la síntesis técnica con el <b>Agente 3</b>."
  },
  3: {
    agentName: "Agente 3: Generador de Reportes y Síntesis",
    toolExecuted: "build_pdf_report(template='SEI_Executive_V1', data_state=langGraphState)",
    llmReasoning: "He consolidado la información climática de Cloud SQL y las métricas de riesgo en un informe técnico estructurado para tomadores de decisiones.",
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
  },
  4: {
    agentName: "Agente 4: Búsqueda de Convocatorias (SEI)",
    toolExecuted: "sei_grant_matcher(region='LATAM', risk_type='Wind_Infrastructure', framework='SEI')",
    llmReasoning: "Consulté el repositorio de convocatorias del Stockholm Environment Institute (SEI). Se identificaron 2 oportunidades de financiamiento para la resiliencia del activo.",
    cardHTML: `
      <div class="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5 text-[10px]">
        <div class="flex items-center justify-between font-bold text-green-400 border-b border-slate-800 pb-1">
          <span>Fondo Verde para el Clima (GCF)</span>
          <span class="bg-green-950 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded text-[8px]">Abierta</span>
        </div>
        <p class="text-slate-300 text-[9.5px]">Línea de adaptación para infraestructura crítica energética vulnerable a ráfagas extremas.</p>
      </div>
    `,
    suggestion: "<b>Workflow End-to-End completado con éxito.</b> Todos los agentes procesaron la solicitud correctamente."
  }
};

const pipelineConfig = {
  1: { title: "Paso 1: Agente de Datos Climáticos", placeholder: "Solicita la extracción de grillas de datos climáticos...", nextStep: 2 },
  2: { title: "Paso 2: Agente de Análisis de Riesgo", placeholder: "Solicita el cálculo de vulnerabilidad y pérdida...", nextStep: 3 },
  3: { title: "Paso 3: Agente Generador de Reportes", placeholder: "Solicita la consolidación del reporte en PDF...", nextStep: 4 },
  4: { title: "Paso 4: Agente Búsqueda de Convocatorias (SEI)", placeholder: "Solicita el mapeo de fondos internacionales...", nextStep: null }
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
        <span>Ejecutando API FastAPI / LangGraph (Paso ${langGraphState.currentStep})...</span>
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