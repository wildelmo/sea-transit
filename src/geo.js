// Geometry helpers for working with polyline paths in geographic coordinates.
// All distances are meters. Local equirectangular projection around Puget Sound
// is accurate to well under 0.1% at this scale.

const M_PER_DEG_LAT = 111320;
const REF_LAT = 47.55;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((REF_LAT * Math.PI) / 180);

export function toLocal(lng, lat) {
  return [lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT];
}

export function metersToDeg(dxMeters, dyMeters) {
  return [dxMeters / M_PER_DEG_LNG, dyMeters / M_PER_DEG_LAT];
}

export function distMeters(lng1, lat1, lng2, lat2) {
  const dx = (lng2 - lng1) * M_PER_DEG_LNG;
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/**
 * A polyline path with altitude, supporting distance parameterization:
 * point/bearing lookup at any distance s, and snapping a coordinate to the path.
 * Points are [lng, lat, altMeters]; alt < 0 means tunnel.
 */
export class Path {
  constructor(points) {
    this.pts = points;
    this.xy = points.map((p) => toLocal(p[0], p[1]));
    this.cum = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = this.xy[i - 1];
      const [x1, y1] = this.xy[i];
      this.cum[i] = this.cum[i - 1] + Math.hypot(x1 - x0, y1 - y0);
    }
    this.length = this.cum[this.cum.length - 1];
  }

  segIndexAt(s) {
    const { cum } = this;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Point at distance s along path: { lng, lat, alt, bearing (deg cw from N) } */
  pointAt(s) {
    const n = this.pts.length;
    if (s <= 0) s = 0;
    if (s >= this.length) s = this.length;
    const i = Math.min(this.segIndexAt(s), n - 2);
    const segLen = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / segLen;
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const lng = a[0] + (b[0] - a[0]) * t;
    const lat = a[1] + (b[1] - a[1]) * t;
    const alt = a[2] + (b[2] - a[2]) * t;
    const dx = (b[0] - a[0]) * M_PER_DEG_LNG;
    const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    return { lng, lat, alt, bearing, seg: i };
  }

  /**
   * Smoothed bearing at s: averages heading over a window so long vehicles
   * rotate gracefully through corners instead of snapping segment-to-segment.
   */
  bearingAt(s, window = 18) {
    const a = this.pointAt(Math.max(0, s - window / 2));
    const b = this.pointAt(Math.min(this.length, s + window / 2));
    const dx = (b.lng - a.lng) * M_PER_DEG_LNG;
    const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
    if (dx === 0 && dy === 0) return this.pointAt(s).bearing;
    return (Math.atan2(dx, dy) * 180) / Math.PI;
  }

  /** Snap a lng/lat to the path. Returns { s, dist } (meters). */
  snap(lng, lat) {
    const [px, py] = toLocal(lng, lat);
    let best = { s: 0, dist: Infinity };
    for (let i = 0; i < this.xy.length - 1; i++) {
      const [ax, ay] = this.xy[i];
      const [bx, by] = this.xy[i + 1];
      const abx = bx - ax;
      const aby = by - ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      const d = Math.hypot(px - cx, py - cy);
      if (d < best.dist) {
        best = { s: this.cum[i] + Math.sqrt(len2) * t, dist: d };
      }
    }
    return best;
  }

  /** GeoJSON coordinates array, optionally filtered by altitude class. */
  coords() {
    return this.pts.map((p) => [p[0], p[1]]);
  }
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Shortest-arc interpolation between two bearings, degrees. */
export function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/** Exponential smoothing factor that is frame-rate independent. */
export function damp(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}
