import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

import { buildMapStyle, applyTheme } from './basemap.js';
import {
  addOverlayLayers,
  applyOverlayTheme,
  refreshOverlayData,
  updateTrainDots,
} from './overlay.js';
import { TrainLayer } from './layers/trains3d.js';
import { Engine } from './rt/engine.js';
import { network } from './data/network.js';
import { initUI } from './ui.js';
import * as oba from './rt/oba.js';

const params = new URLSearchParams(location.search);
if (params.get('key')) {
  oba.setApiKey(params.get('key'));
  params.delete('key');
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
}
const SCREENSHOT_MODE = params.has('screenshot');

function autoThemeNow() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  );
  return hour >= 7 && hour < 18 ? 'day' : 'night';
}

const app = {
  theme: localStorage.getItem('slr3d-theme') ?? autoThemeNow(),
  toggles: {
    buildings: true,
    labels: true,
    terrain: localStorage.getItem('slr3d-terrain') === '1',
    sky: true,
    autoTheme: !localStorage.getItem('slr3d-theme'),
  },
  lineVisible: { 1: true, 2: true },
  selectedStationId: null,
};
window.__app = app; // debugging / test hook

document.body.classList.toggle('theme-day', app.theme === 'day');

const map = new maplibregl.Map({
  container: 'map',
  style: buildMapStyle(app.theme),
  center: SCREENSHOT_MODE ? network.home.center : [-122.51, 47.35],
  zoom: SCREENSHOT_MODE ? network.home.zoom : 8.4,
  pitch: SCREENSHOT_MODE ? network.home.pitch : 20,
  bearing: SCREENSHOT_MODE ? network.home.bearing : 0,
  maxPitch: 72,
  minZoom: 7,
  maxZoom: 18.6,
  antialias: true,
  attributionControl: { compact: true },
  canvasContextAttributes: { antialias: true },
});
map.getCanvas().setAttribute('aria-label', 'Seattle Link light rail 3D map');
app.map = map;

// Missing tiles / fonts must never take the app down (e.g. offline demo),
// but style/validation problems should still be visible in the console.
map.on('error', (e) => {
  const msg = e?.error?.message ?? String(e);
  if (/Failed to fetch|AJAXError|abort/i.test(msg)) console.debug('[map]', msg);
  else console.warn('[map]', msg);
});

const engine = new Engine();
app.engine = engine;

const trainLayer = new TrainLayer({
  getTrains: () =>
    engine.getRenderList().filter((t) => app.lineVisible[t.line]),
  theme: app.theme,
});
app.layer = trainLayer;

app.setTheme = (theme, { manual = false } = {}) => {
  if (theme === app.theme) return;
  app.theme = theme;
  if (manual) {
    app.toggles.autoTheme = false;
    localStorage.setItem('slr3d-theme', theme);
  }
  document.body.classList.toggle('theme-day', theme === 'day');
  applyTheme(map, theme);
  applyOverlayTheme(map, theme);
  trainLayer.setTheme(theme);
  trainLayer.rebuildStatic();
  const icon = document.querySelector('#btn-daynight .icon');
  if (icon) icon.textContent = theme === 'night' ? '☾' : '☀';
};

app.setTerrain = (on) => {
  app.toggles.terrain = on;
  localStorage.setItem('slr3d-terrain', on ? '1' : '0');
  if (on) {
    map.setTerrain({ source: 'dem', exaggeration: 1.15 });
  } else {
    map.setTerrain(null);
  }
  // static world geometry samples terrain heights -> rebuild
  setTimeout(() => trainLayer.rebuildStatic(), 400);
};

app.setLineVisible = (lineId, visible) => {
  app.lineVisible[lineId] = visible;
  const filterVisible = ['in', ['get', 'line'], ['literal', Object.keys(app.lineVisible).filter((l) => app.lineVisible[l])]];
  for (const layerId of ['trk-glow', 'trk-core', 'trk-tunnel']) {
    const base = layerId === 'trk-core' ? ['==', ['get', 'tunnel'], 0] : layerId === 'trk-tunnel' ? ['==', ['get', 'tunnel'], 1] : null;
    map.setFilter(layerId, base ? ['all', base, filterVisible] : filterVisible);
  }
  // stations that serve only hidden lines fade out
  const visibleLines = Object.keys(app.lineVisible).filter((l) => app.lineVisible[l]);
  const staFilter = [
    'any',
    ...visibleLines.map((l) => ['in', l, ['get', 'lines']]),
  ];
  for (const layerId of ['sta-halo', 'sta-core', 'sta-label']) {
    map.setFilter(layerId, visibleLines.length === 2 ? null : staFilter);
  }
};

// Start pulling data immediately — the engine is independent of map/tile
// readiness, so a slow basemap never delays live trains.
engine.start();
engine.addEventListener('geometry', () => {
  refreshOverlayData(map);
  trainLayer.rebuildStatic();
  console.info('[app] track geometry upgraded to official Sound Transit shapes');
});

map.on('load', () => {
  addOverlayLayers(map, app.theme);
  map.addLayer(trainLayer);
  trainLayer.setTheme(app.theme);
  if (app.toggles.terrain) map.setTerrain({ source: 'dem', exaggeration: 1.15 });

  initUI(app);

  // main animation loop
  let last = performance.now();
  let lastDots = 0;
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    engine.tick(dt);
    app.followCam?.update(dt);
    if (now - lastDots > 250 && map.getZoom() < 15.2) {
      lastDots = now;
      updateTrainDots(map, engine, engine.getRenderList().filter((t) => app.lineVisible[t.line]));
    }
    map.triggerRepaint();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // auto day/night check every 5 min
  setInterval(() => {
    if (app.toggles.autoTheme) {
      const t = autoThemeNow();
      if (t !== app.theme) app.setTheme(t);
    }
  }, 300000);
});

// ---------- intro ----------

const intro = document.getElementById('intro');
const startBtn = document.getElementById('intro-start');

function dismissIntro(fly) {
  intro.classList.add('fading');
  setTimeout(() => intro.remove(), 1200);
  if (fly) {
    map.flyTo({
      ...network.home,
      duration: 6000,
      curve: 1.6,
      essential: true,
    });
  }
}
startBtn.addEventListener('click', () => dismissIntro(true));
if (SCREENSHOT_MODE) {
  dismissIntro(false);
} else {
  // allow Enter to launch
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && document.body.contains(intro)) dismissIntro(true);
    },
    { once: true }
  );
}
