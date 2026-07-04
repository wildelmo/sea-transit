// Programmatic MapLibre basemap style over OpenFreeMap vector tiles
// (OpenMapTiles schema) + AWS terrain tiles. Both palettes emit the exact same
// layer stack, so switching theme is a paint-property diff, not a style reload.

const TILES_URL = 'https://tiles.openfreemap.org/planet';
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

export const PALETTES = {
  night: {
    bg: '#0a0e14',
    water: '#0e1826',
    waterway: '#12202f',
    wood: '#0e1613',
    grass: '#0f1815',
    park: '#101c17',
    sand: '#141a20',
    residential: '#0c1119',
    aeroway: '#161e2b',
    aerowayLine: '#232f42',
    roadMotorway: '#2c3a50',
    roadMotorwayCase: '#0c1118',
    roadMain: '#222c3c',
    roadMainCase: '#0c1118',
    roadMinor: '#171f2b',
    roadService: '#131a24',
    roadTunnel: '#141a24',
    rail: '#1d2735',
    boundary: '#31405a',
    buildingBase: '#141b28',
    buildingTop: '#243350',
    buildingOpacity: 0.94,
    labelRoad: '#67768c',
    labelPlace: '#93a3ba',
    labelCity: '#cbd6e6',
    labelWater: '#3e5a78',
    halo: '#0a0e14',
    skyColor: '#0b1526',
    horizonColor: '#12233d',
    fogColor: '#0a0e14',
    light: { anchor: 'viewport', color: '#b8cfff', intensity: 0.25, position: [1.3, 210, 30] },
  },
  day: {
    bg: '#eef1f4',
    water: '#aac9e0',
    waterway: '#a4c4dc',
    wood: '#c8dcc2',
    grass: '#d3e3cd',
    park: '#c9e2c6',
    sand: '#eae4d4',
    residential: '#e7eaed',
    aeroway: '#e3e7ec',
    aerowayLine: '#d0d6dd',
    roadMotorway: '#fcc963',
    roadMotorwayCase: '#e0a94a',
    roadMain: '#ffffff',
    roadMainCase: '#d3d9e0',
    roadMinor: '#ffffff',
    roadService: '#f4f6f8',
    roadTunnel: '#e5e8ec',
    rail: '#c9cfd8',
    boundary: '#98a4b8',
    buildingBase: '#d9dee5',
    buildingTop: '#c3cbd6',
    buildingOpacity: 0.88,
    labelRoad: '#7a8698',
    labelPlace: '#4d5a6c',
    labelCity: '#2a3444',
    labelWater: '#5a86ab',
    halo: '#ffffff',
    skyColor: '#a8cdf0',
    horizonColor: '#dcebf8',
    fogColor: '#e8eef4',
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.4, position: [1.3, 200, 40] },
  },
};

function roadWidth(base, mult = 1) {
  return [
    'interpolate', ['exponential', 1.55], ['zoom'],
    6, 0.4 * mult,
    10, base * 0.35 * mult,
    13, base * mult,
    16, base * 3.6 * mult,
    19, base * 13 * mult,
  ];
}

/** Build the full style. Same layers for both themes. */
export function buildMapStyle(theme = 'night') {
  const p = PALETTES[theme];

  const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];
  const isTunnel = ['==', ['get', 'brunnel'], 'tunnel'];

  const layers = [
    { id: 'bg', type: 'background', paint: { 'background-color': p.bg } },

    {
      id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': p.wood, 'fill-opacity': 0.85, 'fill-antialias': false },
    },
    {
      id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]],
      paint: { 'fill-color': p.grass, 'fill-opacity': 0.7, 'fill-antialias': false },
    },
    {
      id: 'landuse-residential', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
      paint: { 'fill-color': p.residential, 'fill-opacity': 0.55, 'fill-antialias': false },
    },
    {
      id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
      paint: { 'fill-color': p.park, 'fill-opacity': 0.85, 'fill-antialias': false },
    },
    {
      id: 'landuse-sand', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'sand'],
      paint: { 'fill-color': p.sand, 'fill-opacity': 0.7, 'fill-antialias': false },
    },

    {
      id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
      paint: {
        'line-color': p.waterway,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 8, 0.5, 13, 1.6, 18, 7],
      },
    },
    {
      id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
      paint: { 'fill-color': p.water, 'fill-antialias': false },
    },

    {
      id: 'aeroway-fill', type: 'fill', source: 'omt', 'source-layer': 'aeroway',
      filter: ['==', ['geometry-type'], 'Polygon'],
      minzoom: 10,
      paint: { 'fill-color': p.aeroway, 'fill-opacity': 0.8 },
    },
    {
      id: 'aeroway-line', type: 'line', source: 'omt', 'source-layer': 'aeroway',
      filter: ['==', ['geometry-type'], 'LineString'],
      minzoom: 10,
      paint: {
        'line-color': p.aerowayLine,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1, 14, 5, 18, 26],
      },
    },

    // ---- roads (tunnels faded, then service/minor/main/motorway) ----
    {
      id: 'road-tunnel', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', isTunnel,
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]]],
      minzoom: 11,
      paint: { 'line-color': p.roadTunnel, 'line-width': roadWidth(2.2), 'line-opacity': 0.5, 'line-dasharray': [2, 1.5] },
    },
    {
      id: 'road-service', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', notTunnel, ['in', ['get', 'class'], ['literal', ['service', 'track']]]],
      minzoom: 14,
      paint: { 'line-color': p.roadService, 'line-width': roadWidth(0.8) },
    },
    {
      id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', notTunnel, ['==', ['get', 'class'], 'minor']],
      minzoom: 12,
      paint: { 'line-color': p.roadMinor, 'line-width': roadWidth(1.3) },
    },
    {
      id: 'road-main-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', notTunnel, ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary']]]],
      minzoom: 9,
      paint: { 'line-color': p.roadMainCase, 'line-width': roadWidth(2.3, 1.35), 'line-gap-width': 0 },
    },
    {
      id: 'road-main', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', notTunnel, ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary']]]],
      minzoom: 9,
      paint: { 'line-color': p.roadMain, 'line-width': roadWidth(2.3) },
    },
    {
      id: 'road-motorway-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', notTunnel, ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]]],
      paint: { 'line-color': p.roadMotorwayCase, 'line-width': roadWidth(3.2, 1.3) },
    },
    {
      id: 'road-motorway', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', notTunnel, ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]]],
      paint: { 'line-color': p.roadMotorway, 'line-width': roadWidth(3.2) },
    },
    {
      id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', notTunnel, ['==', ['get', 'class'], 'rail']],
      minzoom: 12,
      paint: {
        'line-color': p.rail,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, 0.5, 16, 1.8, 19, 4],
        'line-dasharray': [4, 3],
        'line-opacity': 0.7,
      },
    },

    {
      id: 'boundary-admin', type: 'line', source: 'omt', 'source-layer': 'boundary',
      filter: ['all', ['<=', ['get', 'admin_level'], 6], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': p.boundary, 'line-width': 1, 'line-dasharray': [3, 2.5], 'line-opacity': 0.5 },
    },

    // ---- 3D buildings ----
    {
      id: 'building-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building',
      minzoom: 13.2,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 5],
          0, p.buildingBase,
          160, p.buildingTop,
        ],
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          13.2, 0,
          14.2, ['coalesce', ['get', 'render_height'], 5],
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          13.2, 0,
          14.2, ['coalesce', ['get', 'render_min_height'], 0],
        ],
        'fill-extrusion-opacity': p.buildingOpacity,
      },
    },

    // ---- labels ----
    {
      id: 'label-water', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': FONT_ITALIC,
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 14],
        'symbol-placement': 'point',
        'text-letter-spacing': 0.15,
      },
      paint: { 'text-color': p.labelWater, 'text-halo-color': p.halo, 'text-halo-width': 1 },
    },
    {
      id: 'label-road', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name',
      minzoom: 13.5,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': FONT,
        'text-size': 10.5,
        'symbol-placement': 'line',
        'text-letter-spacing': 0.03,
      },
      paint: { 'text-color': p.labelRoad, 'text-halo-color': p.halo, 'text-halo-width': 1.1 },
    },
    {
      id: 'label-place', type: 'symbol', source: 'omt', 'source-layer': 'place',
      minzoom: 10.5,
      maxzoom: 15.5,
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'town', 'village']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 12.5],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.18,
        'text-max-width': 7,
      },
      paint: { 'text-color': p.labelPlace, 'text-halo-color': p.halo, 'text-halo-width': 1.2, 'text-opacity': 0.85 },
    },
    {
      id: 'label-city', type: 'symbol', source: 'omt', 'source-layer': 'place',
      maxzoom: 13,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 12, 11, 17],
        'text-letter-spacing': 0.06,
      },
      paint: { 'text-color': p.labelCity, 'text-halo-color': p.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'label-airport', type: 'symbol', source: 'omt', 'source-layer': 'aerodrome_label',
      minzoom: 9.5,
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': FONT,
        'text-size': 11,
        'text-letter-spacing': 0.08,
      },
      paint: { 'text-color': p.labelPlace, 'text-halo-color': p.halo, 'text-halo-width': 1.2 },
    },
  ];

  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sky: {
      'sky-color': p.skyColor,
      'horizon-color': p.horizonColor,
      'fog-color': p.fogColor,
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0.35],
    },
    light: p.light,
    sources: {
      omt: { type: 'vector', url: TILES_URL },
      dem: {
        type: 'raster-dem',
        tiles: [DEM_TILES],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 13,
        attribution: 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
      },
    },
    layers,
  };
}

/** Re-paint an existing map for the other theme, without reloading the style. */
export function applyTheme(map, theme) {
  const target = buildMapStyle(theme);
  for (const layer of target.layers) {
    if (!map.getLayer(layer.id)) continue;
    for (const [k, v] of Object.entries(layer.paint ?? {})) {
      map.setPaintProperty(layer.id, k, v, { validate: false });
    }
  }
  if (map.setSky) map.setSky(target.sky);
  // setLight is a no-op warning-free call in MapLibre 5
  map.setLight(target.light);
}
