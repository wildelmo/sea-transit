// Map-plane overlay: route ribbons (with glow + tunnel dashes), station
// markers and labels. The 3D guideway/trains live in layers/trains3d.js;
// these 2D layers give the network presence at every zoom level.

import { network } from './data/network.js';

function lineFeatures(line) {
  // Split the path into surface/tunnel runs so tunnels can render dashed.
  const feats = [];
  let run = [];
  let runTunnel = null;
  const flush = () => {
    if (run.length > 1) {
      feats.push({
        type: 'Feature',
        properties: { line: line.id, tunnel: runTunnel ? 1 : 0 },
        geometry: { type: 'LineString', coordinates: run.map((p) => [p[0], p[1]]) },
      });
    }
  };
  for (const p of line.path.pts) {
    const tun = p[2] < 0;
    if (runTunnel === null) runTunnel = tun;
    if (tun !== runTunnel) {
      run.push(p); // share the boundary vertex
      flush();
      run = [p];
      runTunnel = tun;
    } else {
      run.push(p);
    }
  }
  flush();
  return feats;
}

export function trackGeoJSON() {
  const features = [];
  for (const line of Object.values(network.lines)) {
    features.push(...lineFeatures(line));
  }
  return { type: 'FeatureCollection', features };
}

export function stationGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: network.stations.map((st) => ({
      type: 'Feature',
      properties: {
        id: st.id,
        name: st.name,
        lines: st.lines.join(''),
        interchange: st.lines.length > 1 ? 1 : 0,
      },
      geometry: { type: 'Point', coordinates: [st.lng, st.lat] },
    })),
  };
}

const LINE_COLOR = ['match', ['get', 'line'], '1', '#19d68f', '2', '#4fb0ff', '#ffffff'];

export function addOverlayLayers(map, theme) {
  map.addSource('tracks', { type: 'geojson', data: trackGeoJSON() });
  map.addSource('stations', { type: 'geojson', data: stationGeoJSON(), promoteId: 'id' });

  map.addLayer({
    id: 'trk-glow',
    type: 'line',
    source: 'tracks',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': LINE_COLOR,
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 5, 13, 12, 16, 26],
      'line-opacity': ['case', ['==', ['get', 'tunnel'], 1], 0.06, 0.14],
      'line-blur': 6,
    },
  });
  map.addLayer({
    id: 'trk-core',
    type: 'line',
    source: 'tracks',
    filter: ['==', ['get', 'tunnel'], 0],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': LINE_COLOR,
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 1.6, 13, 3.2, 16, 5.5],
      'line-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'trk-tunnel',
    type: 'line',
    source: 'tracks',
    filter: ['==', ['get', 'tunnel'], 1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': LINE_COLOR,
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 1.4, 13, 2.6, 16, 4.5],
      'line-opacity': 0.55,
      'line-dasharray': [1.6, 1.8],
    },
  });

  // Live train dots for low/medium zooms — the 3D models take over as you
  // zoom in (opacity crossfade), but from city scale you still see the
  // whole fleet pulsing along the lines.
  map.addSource('train-dots', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'train-dot-halo',
    type: 'circle',
    source: 'train-dots',
    maxzoom: 14.8,
    paint: {
      'circle-radius': ['interpolate', ['exponential', 1.4], ['zoom'], 9, 7, 13, 12, 14.5, 16],
      'circle-color': LINE_COLOR,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.6, 0.3, 14.8, 0],
      'circle-blur': 0.7,
    },
  });
  map.addLayer({
    id: 'train-dot',
    type: 'circle',
    source: 'train-dots',
    maxzoom: 14.8,
    paint: {
      'circle-radius': [
        'interpolate', ['exponential', 1.4], ['zoom'],
        9, ['case', ['boolean', ['get', 'selected'], false], 4.5, 3],
        13, ['case', ['boolean', ['get', 'selected'], false], 7.5, 5.5],
      ],
      'circle-color': LINE_COLOR,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.6, 1, 14.8, 0],
      'circle-stroke-width': 1.6,
      'circle-stroke-color': [
        'case', ['boolean', ['get', 'selected'], false], '#ffd76a', '#ffffff',
      ],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 13.6, 0.9, 14.8, 0],
    },
  });

  map.addLayer({
    id: 'sta-halo',
    type: 'circle',
    source: 'stations',
    minzoom: 9,
    paint: {
      'circle-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 4, 13, 7.5, 16, 13],
      'circle-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], '#ffd76a',
        ['==', ['get', 'interchange'], 1], '#e8eefb',
        ['==', ['get', 'lines'], '1'], '#19d68f',
        '#4fb0ff',
      ],
      'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.5, 0.28],
      'circle-blur': 0.4,
    },
  });
  map.addLayer({
    id: 'sta-core',
    type: 'circle',
    source: 'stations',
    minzoom: 9,
    paint: {
      'circle-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 2, 13, 3.6, 16, 6],
      'circle-color': '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 2.4],
      'circle-stroke-color': [
        'case',
        ['==', ['get', 'interchange'], 1], '#8ea4c8',
        ['==', ['get', 'lines'], '1'], '#00915f',
        '#2c7bbf',
      ],
    },
  });
  map.addLayer({
    id: 'sta-label',
    type: 'symbol',
    source: 'stations',
    minzoom: 11.2,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 10, 15, 12.5],
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-max-width': 8,
      'text-optional': true,
    },
    paint: {
      'text-color': theme === 'night' ? '#c9d6e8' : '#25344a',
      'text-halo-color': theme === 'night' ? '#0a0e14' : '#ffffff',
      'text-halo-width': 1.3,
    },
  });
}

export function applyOverlayTheme(map, theme) {
  if (!map.getLayer('sta-label')) return;
  map.setPaintProperty('sta-label', 'text-color', theme === 'night' ? '#c9d6e8' : '#25344a');
  map.setPaintProperty('sta-label', 'text-halo-color', theme === 'night' ? '#0a0e14' : '#ffffff');
}

/** Refresh track/station sources after a geometry upgrade. */
export function refreshOverlayData(map) {
  map.getSource('tracks')?.setData(trackGeoJSON());
  map.getSource('stations')?.setData(stationGeoJSON());
}

/** Push current train positions into the 2D dot source. */
export function updateTrainDots(map, engine, renderList) {
  const src = map.getSource('train-dots');
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: renderList.map((t) => {
      const line = network.lines[t.line];
      const pt = line.path.pointAt(t.s);
      return {
        type: 'Feature',
        properties: { line: t.line, selected: t.selected },
        geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
      };
    }),
  });
}
