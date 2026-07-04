// OneBusAway Puget Sound API client. Sound Transit publishes Link real-time
// data through this API. The public demo key "TEST" works out of the box;
// users can store a personal key (Settings) for higher rate limits.

const BASE = 'https://api.pugetsound.onebusaway.org/api/where';
const AGENCY = '40'; // Sound Transit

export function getApiKey() {
  try {
    return localStorage.getItem('slr3d-oba-key') || 'TEST';
  } catch {
    return 'TEST';
  }
}

export function setApiKey(key) {
  try {
    if (key && key !== 'TEST') localStorage.setItem('slr3d-oba-key', key.trim());
    else localStorage.removeItem('slr3d-oba-key');
  } catch {
    /* private mode */
  }
}

async function api(path, params = {}) {
  const url = new URL(`${BASE}/${path}.json`);
  url.searchParams.set('key', getApiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code && json.code !== 200) throw new Error(`OBA code ${json.code}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Find the light-rail route ids for the 1 Line / 2 Line. */
export async function discoverRoutes() {
  const json = await api(`routes-for-agency/${AGENCY}`);
  const routes = json?.data?.list ?? [];
  const found = {};
  for (const r of routes) {
    const name = `${r.shortName ?? ''} ${r.longName ?? ''} ${r.description ?? ''}`.toLowerCase();
    // type 0 = tram/light rail in GTFS; OBA mirrors it
    const isRail = r.type === 0 || /line|link/.test(name);
    if (!isRail) continue;
    if (/^\s*1|1[\s-]?line/.test((r.shortName ?? '').toLowerCase()) || /1[\s-]?line/.test(name)) {
      found['1'] = r.id;
    } else if (/^\s*2|2[\s-]?line/.test((r.shortName ?? '').toLowerCase()) || /2[\s-]?line/.test(name)) {
      found['2'] = r.id;
    }
  }
  // Well-known fallbacks (Sound Transit GTFS ids) if discovery finds nothing.
  if (!found['1']) found['1'] = '40_100479';
  if (!found['2']) found['2'] = '40_2LINE';
  return found;
}

/** Active vehicles for a route, with trip headsigns resolved. */
export async function fetchVehicles(routeId) {
  const json = await api(`trips-for-route/${encodeURIComponent(routeId)}`, {
    includeStatus: 'true',
    includeSchedule: 'false',
  });
  const list = json?.data?.list ?? [];
  const tripRefs = new Map((json?.data?.references?.trips ?? []).map((t) => [t.id, t]));
  const serverTime = json?.currentTime ?? Date.now();
  const vehicles = [];
  for (const item of list) {
    const st = item.status;
    if (!st?.position) continue;
    const trip = tripRefs.get(st.activeTripId ?? item.tripId);
    vehicles.push({
      id: st.vehicleId || `${routeId}-${item.tripId}`,
      lat: st.position.lat,
      lon: st.position.lon,
      orientation: st.orientation, // deg, 0=E ccw per OBA docs
      headsign: trip?.tripHeadsign ?? null,
      directionId: trip?.directionId ?? null,
      predicted: !!st.predicted,
      deviation: st.scheduleDeviation ?? 0, // seconds, +late
      nextStopId: st.nextStop ?? st.closestStop ?? null,
      phase: st.phase ?? '',
      lastUpdate: st.lastUpdateTime || st.lastLocationUpdateTime || serverTime,
    });
  }
  return { vehicles, serverTime };
}

/** Upcoming arrivals for an OBA stop id. */
export async function fetchArrivals(stopId) {
  const json = await api(`arrivals-and-departures-for-stop/${encodeURIComponent(stopId)}`, {
    minutesAfter: '70',
    minutesBefore: '2',
  });
  const now = json?.currentTime ?? Date.now();
  return (json?.data?.entry?.arrivalsAndDepartures ?? []).map((a) => ({
    route: a.routeShortName ?? '',
    headsign: a.tripHeadsign ?? '',
    predicted: !!a.predicted,
    etaMs: (a.predictedArrivalTime > 0 ? a.predictedArrivalTime : a.scheduledArrivalTime) - now,
    vehicleId: a.vehicleId ?? null,
  }));
}

/**
 * Stops + shape polylines for a route. Returns { stops, shape } where shape
 * is the longest decoded polyline ([lng,lat] pairs) — used to upgrade the
 * baked-in track geometry to Sound Transit's official alignment.
 */
export async function fetchRouteGeometry(routeId) {
  const json = await api(`stops-for-route/${encodeURIComponent(routeId)}`, {
    includePolylines: 'true',
  });
  const stops = json?.data?.references?.stops ?? [];
  const polys = json?.data?.entry?.polylines ?? [];
  let shape = null;
  for (const p of polys) {
    const pts = decodePolyline(p.points);
    if (!shape || pts.length > shape.length) shape = pts;
  }
  return { stops, shape };
}

/** Google encoded polyline → [[lng, lat], ...] */
export function decodePolyline(str) {
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}
