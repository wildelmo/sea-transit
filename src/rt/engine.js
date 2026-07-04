// Unified realtime engine. Prefers live OneBusAway vehicle positions
// (snapped to the track and smoothly interpolated); falls back to a
// realistic schedule simulation when live data is unreachable or when no
// trains are in service (e.g. overnight). Emits:
//   'mode'      — {mode, reason}
//   'trains'    — after every data refresh
//   'geometry'  — track geometry upgraded to official shapes
import { network, upgradeLineGeometry } from '../data/network.js';
import { clamp, distMeters } from '../geo.js';
import * as oba from './oba.js';

const POLL_MS = 10000;
const RETRY_LIVE_MS = 90000; // while simulating, probe live data this often
const HEADWAYS = { 1: 480, 2: 600 }; // seconds
const CARS = { 1: 4, 2: 3 };
const TURNBACK = 300; // terminal layover, seconds
const ACCEL = 1.0;
const DECEL = 1.1;
const DWELL = 26;

export class Engine extends EventTarget {
  constructor() {
    super();
    this.mode = 'connecting';
    this.simReason = '';
    this.trains = new Map();
    this.selectedId = null;
    this.routes = null;
    this.stationStops = new Map(); // station id -> [oba stop ids]
    this.lastLiveAt = 0;
    this.simSpeed = 1;
    this.simClock = 7200 + Math.random() * 3600; // arbitrary phase
    this.simProfiles = null;
    this._liveFails = 0;
    this._missCounts = new Map();
    this._destroyed = false;
    this.geometryUpgraded = false;
  }

  // ---------------- lifecycle ----------------

  async start() {
    this._setMode('connecting');
    this._buildSimProfiles();
    try {
      this.routes = await oba.discoverRoutes();
      await this._pollOnce(true);
      this._pollTimer = setInterval(() => this._pollOnce(), POLL_MS);
      // fetch official geometry + stop mapping in the background
      this._upgradeGeometry();
    } catch (err) {
      console.warn('[engine] live connect failed:', err?.message ?? err);
      this._startSim('offline');
      this._retryTimer = setInterval(() => this._probeLive(), RETRY_LIVE_MS);
    }
  }

  destroy() {
    this._destroyed = true;
    clearInterval(this._pollTimer);
    clearInterval(this._retryTimer);
  }

  _setMode(mode, reason = '') {
    if (this.mode === mode && this.simReason === reason) return;
    this.mode = mode;
    this.simReason = reason;
    this.dispatchEvent(new CustomEvent('mode', { detail: { mode, reason } }));
  }

  // ---------------- live path ----------------

  async _pollOnce(isFirst = false) {
    if (this._destroyed) return;
    try {
      const results = await Promise.all(
        Object.entries(this.routes).map(async ([lineId, routeId]) => {
          try {
            const r = await oba.fetchVehicles(routeId);
            return { lineId, ...r };
          } catch (e) {
            return { lineId, vehicles: null };
          }
        })
      );
      const anySuccess = results.some((r) => r.vehicles !== null);
      if (!anySuccess) throw new Error('all vehicle fetches failed');
      this._liveFails = 0;
      this.lastLiveAt = Date.now();

      let total = 0;
      const seen = new Set();
      for (const { lineId, vehicles } of results) {
        if (!vehicles) continue;
        total += vehicles.length;
        for (const v of vehicles) {
          seen.add(v.id);
          this._mergeVehicle(lineId, v);
        }
      }
      // expire vehicles that vanished twice in a row
      for (const [id, tr] of this.trains) {
        if (tr.source !== 'live') continue;
        if (seen.has(id)) {
          this._missCounts.delete(id);
        } else {
          const miss = (this._missCounts.get(id) ?? 0) + 1;
          this._missCounts.set(id, miss);
          if (miss >= 2) {
            this.trains.delete(id);
            this._missCounts.delete(id);
          }
        }
      }

      if (total === 0) {
        // Live feed healthy but nothing running (overnight) — simulate,
        // keep polling so we flip back when service resumes.
        if (this.mode !== 'sim') this._startSim('no-service', /*keepPolling*/ true);
      } else {
        if (this.mode !== 'live') {
          // returning from sim: drop sim trains
          for (const [id, tr] of this.trains) if (tr.source === 'sim') this.trains.delete(id);
        }
        this._setMode('live');
      }
      this.dispatchEvent(new CustomEvent('trains'));
    } catch (err) {
      this._liveFails += 1;
      if (isFirst || this._liveFails >= 2) {
        clearInterval(this._pollTimer);
        this._startSim('offline');
        this._retryTimer ??= setInterval(() => this._probeLive(), RETRY_LIVE_MS);
      }
      if (isFirst) throw err;
    }
  }

  async _probeLive() {
    if (this._destroyed || this.mode === 'live') return;
    try {
      this.routes ??= await oba.discoverRoutes();
      const r = await oba.fetchVehicles(this.routes['1']);
      if (r.vehicles.length > 0) {
        clearInterval(this._retryTimer);
        this._retryTimer = null;
        for (const [id, tr] of this.trains) if (tr.source === 'sim') this.trains.delete(id);
        this._liveFails = 0;
        this._pollTimer = setInterval(() => this._pollOnce(), POLL_MS);
        await this._pollOnce();
        if (!this.geometryUpgraded) this._upgradeGeometry();
      }
    } catch {
      /* stay in sim */
    }
  }

  _mergeVehicle(lineId, v) {
    const line = network.lines[lineId];
    const snapped = line.path.snap(v.lon, v.lat);
    if (snapped.dist > 900) return; // way off our alignment — ignore
    const nowSec = performance.now() / 1000;
    let tr = this.trains.get(v.id);
    if (!tr) {
      tr = {
        id: v.id,
        source: 'live',
        line: lineId,
        s: snapped.s,
        targetS: snapped.s,
        dir: this._dirFromOrientation(line, snapped.s, v.orientation) ?? 1,
        estSpeed: 0,
        dispSpeed: 0,
        cars: CARS[lineId],
      };
      this.trains.set(v.id, tr);
    } else {
      const dtUpd = Math.max((v.lastUpdate - (tr.lastUpdate ?? v.lastUpdate)) / 1000, 0.001);
      const ds = snapped.s - tr.targetS;
      if (Math.abs(ds) > 4 && dtUpd > 1) {
        tr.estSpeed = clamp(ds / dtUpd, -30, 30);
        if (Math.abs(tr.estSpeed) > 1.5) tr.dir = Math.sign(tr.estSpeed);
      } else if (Math.abs(ds) <= 4) {
        tr.estSpeed *= 0.5; // probably dwelling
      }
      tr.targetS = snapped.s;
      tr.line = lineId;
    }
    tr.lat = v.lat;
    tr.lon = v.lon;
    tr.headsign = v.headsign ?? tr.headsign ?? this._terminusName(lineId, tr.dir);
    tr.deviation = v.deviation;
    tr.predicted = v.predicted;
    tr.nextStopId = v.nextStopId;
    tr.phase = v.phase;
    tr.lastUpdate = v.lastUpdate;
    tr.updatedSec = nowSec;
  }

  _dirFromOrientation(line, s, orientation) {
    if (!Number.isFinite(orientation)) return null;
    const bearing = 90 - orientation; // OBA: deg CCW from east -> compass
    const pathBrg = line.path.bearingAt(s, 30);
    const diff = Math.abs(((bearing - pathBrg + 540) % 360) - 180);
    return diff < 90 ? 1 : -1; // heading aligned with path -> increasing s
  }

  _terminusName(lineId, dir) {
    const sts = network.lines[lineId].stations;
    return (dir > 0 ? sts[sts.length - 1] : sts[0]).name;
  }

  async _upgradeGeometry() {
    if (!this.routes) return;
    let upgraded = false;
    for (const [lineId, routeId] of Object.entries(this.routes)) {
      try {
        const { stops, shape } = await oba.fetchRouteGeometry(routeId);
        // map OBA stops to our stations by proximity
        for (const st of network.stations) {
          if (!st.lines.includes(lineId)) continue;
          const ids = stops
            .filter((s) => distMeters(s.lon, s.lat, st.lng, st.lat) < 450)
            .map((s) => s.id);
          if (ids.length) {
            const cur = this.stationStops.get(st.id) ?? [];
            this.stationStops.set(st.id, [...new Set([...cur, ...ids])]);
          }
        }
        if (shape && upgradeLineGeometry(lineId, shape)) {
          upgraded = true;
          // re-snap live trains of this line onto the new path
          for (const tr of this.trains.values()) {
            if (tr.line === lineId && tr.source === 'live' && tr.lat != null) {
              const sn = network.lines[lineId].path.snap(tr.lon, tr.lat);
              tr.s = sn.s;
              tr.targetS = sn.s;
            }
          }
        }
      } catch (e) {
        console.warn(`[engine] geometry upgrade failed for line ${lineId}:`, e?.message);
      }
    }
    if (upgraded) {
      this.geometryUpgraded = true;
      this._buildSimProfiles();
      this.dispatchEvent(new CustomEvent('geometry'));
    }
  }

  // ---------------- simulation path ----------------

  _startSim(reason, keepPolling = false) {
    if (!keepPolling) clearInterval(this._pollTimer);
    for (const [id, tr] of this.trains) if (tr.source === 'live') this.trains.delete(id);
    this._setMode('sim', reason);
    this.dispatchEvent(new CustomEvent('trains'));
  }

  _buildSimProfiles() {
    this.simProfiles = {};
    for (const line of Object.values(network.lines)) {
      const stops = line.stations.map((st) => st.s).sort((a, b) => a - b);
      const events = []; // {t0, t1, kind, s0, s1, v, ta, td, T}
      let t = 0;
      for (let i = 0; i < stops.length; i++) {
        events.push({ t0: t, t1: t + DWELL, kind: 'dwell', s0: stops[i], s1: stops[i] });
        t += DWELL;
        if (i < stops.length - 1) {
          const d = stops[i + 1] - stops[i];
          // segment speed limit by grade class: sample the midpoint altitude
          const mid = line.path.pointAt(stops[i] + d / 2);
          const vmax = Math.abs(mid.alt) > 2 ? 22 : 16.5;
          const run = runProfile(d, vmax, ACCEL, DECEL);
          events.push({ t0: t, t1: t + run.T, kind: 'run', s0: stops[i], s1: stops[i + 1], ...run });
          t += run.T;
        }
      }
      this.simProfiles[line.id] = {
        events,
        tripTime: t,
        cycle: 2 * (t + TURNBACK),
        sMin: stops[0],
        sMax: stops[stops.length - 1],
      };
    }
  }

  _simDistAt(lineId, tt) {
    const prof = this.simProfiles[lineId];
    const evs = prof.events;
    // binary search event containing tt
    let lo = 0;
    let hi = evs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (evs[mid].t1 < tt) lo = mid + 1;
      else hi = mid;
    }
    const e = evs[lo];
    if (e.kind === 'dwell') return e.s0;
    const t = clamp(tt - e.t0, 0, e.T);
    return e.s0 + runDist(e, t);
  }

  /** Sim state for train k of a line at sim-clock time. */
  _simTrainState(lineId, k) {
    const prof = this.simProfiles[lineId];
    const headway = HEADWAYS[lineId];
    const tt = ((this.simClock + k * headway) % prof.cycle + prof.cycle) % prof.cycle;
    const leg = prof.tripTime + TURNBACK;
    if (tt < prof.tripTime) {
      return { s: this._simDistAt(lineId, tt), dir: 1, tt };
    }
    if (tt < leg) return { s: prof.sMax, dir: -1, tt };
    if (tt < leg + prof.tripTime) {
      const back = tt - leg;
      return { s: prof.sMax + prof.sMin - this._simDistAt(lineId, back), dir: -1, tt };
    }
    return { s: prof.sMin, dir: 1, tt };
  }

  _tickSim(dt) {
    this.simClock += dt * this.simSpeed;
    for (const line of Object.values(network.lines)) {
      const prof = this.simProfiles[line.id];
      const fleet = Math.ceil(prof.cycle / HEADWAYS[line.id]);
      for (let k = 0; k < fleet; k++) {
        const id = `SIM-${line.id}-${String(k + 1).padStart(2, '0')}`;
        const st = this._simTrainState(line.id, k);
        let tr = this.trains.get(id);
        if (!tr) {
          tr = { id, source: 'sim', line: line.id, cars: CARS[line.id], dispSpeed: 0 };
          this.trains.set(id, tr);
        }
        const prevS = tr.s ?? st.s;
        tr.s = st.s;
        tr.targetS = st.s;
        tr.dir = st.dir;
        tr.dispSpeed = tr.dispSpeed * 0.92 + (Math.abs(st.s - prevS) / Math.max(dt * this.simSpeed, 1e-6)) * 0.08;
        tr.headsign = this._terminusName(line.id, st.dir);
        tr.deviation = 0;
        tr.predicted = false;
        tr.updatedSec = performance.now() / 1000;
      }
    }
  }

  /** Sim arrivals at a station: scan each train's future path. */
  _simArrivals(station) {
    const out = [];
    for (const lineId of station.lines) {
      const prof = this.simProfiles[lineId];
      const targetS = station.sByLine[lineId];
      const fleet = Math.ceil(prof.cycle / HEADWAYS[lineId]);
      for (let k = 0; k < fleet; k++) {
        const st = this._simTrainState(lineId, k);
        // walk forward in 4s steps until the train crosses targetS (≤35 min)
        let prev = st;
        for (let dt = 4; dt <= 2100; dt += 4) {
          const tt = st.tt + dt;
          const cur = this._simTrainStateAt(lineId, tt);
          const crossed =
            (prev.s - targetS) * (cur.s - targetS) <= 0 && Math.abs(cur.s - prev.s) > 0.01;
          if (crossed) {
            out.push({
              route: `${lineId} Line`,
              line: lineId,
              headsign: this._terminusName(lineId, cur.dir),
              predicted: false,
              etaMs: (dt / this.simSpeed) * 1000,
              vehicleId: `SIM-${lineId}-${String(k + 1).padStart(2, '0')}`,
            });
            break;
          }
          prev = cur;
        }
      }
    }
    out.sort((a, b) => a.etaMs - b.etaMs);
    return out.slice(0, 8);
  }

  _simTrainStateAt(lineId, tt) {
    const prof = this.simProfiles[lineId];
    const m = ((tt % prof.cycle) + prof.cycle) % prof.cycle;
    const leg = prof.tripTime + TURNBACK;
    if (m < prof.tripTime) return { s: this._simDistAt(lineId, m), dir: 1 };
    if (m < leg) return { s: prof.sMax, dir: -1 };
    if (m < leg + prof.tripTime) {
      return { s: prof.sMax + prof.sMin - this._simDistAt(lineId, m - leg), dir: -1 };
    }
    return { s: prof.sMin, dir: 1 };
  }

  // ---------------- shared per-frame tick ----------------

  tick(dt) {
    if (this.mode === 'sim') {
      this._tickSim(dt);
      return;
    }
    const nowSec = performance.now() / 1000;
    for (const tr of this.trains.values()) {
      if (tr.source !== 'live') continue;
      // gentle dead-reckoning toward (extrapolated) reported position
      const age = clamp(nowSec - (tr.updatedSec ?? nowSec), 0, 14);
      const desired = tr.targetS + tr.estSpeed * age * 0.65;
      const err = desired - tr.s;
      if (Math.abs(err) > 700) {
        tr.s = desired;
      } else {
        const maxStep = 40 * dt;
        tr.s += clamp(err * Math.min(1, 2.0 * dt), -maxStep, maxStep);
      }
      tr.s = clamp(tr.s, 0, network.lines[tr.line].path.length);
      const inst = Math.abs(err) > 0.5 ? Math.abs(tr.estSpeed) : 0;
      tr.dispSpeed = tr.dispSpeed * 0.95 + inst * 0.05;
    }
  }

  // ---------------- queries for UI / renderer ----------------

  getRenderList() {
    const list = [];
    for (const tr of this.trains.values()) {
      list.push({
        id: tr.id,
        line: tr.line,
        s: tr.s,
        dir: tr.dir ?? 1,
        cars: tr.cars,
        selected: tr.id === this.selectedId,
      });
    }
    return list;
  }

  getTrain(id) {
    return this.trains.get(id);
  }

  /** Previous/next station along travel direction + progress fraction. */
  trainContext(tr) {
    const line = network.lines[tr.line];
    const sts = line.stations;
    let prev = null;
    let next = null;
    if (tr.dir >= 0) {
      for (const st of sts) {
        if (st.s <= tr.s + 40) prev = st;
        if (st.s > tr.s + 40) {
          next = st;
          break;
        }
      }
    } else {
      for (let i = sts.length - 1; i >= 0; i--) {
        const st = sts[i];
        if (st.s >= tr.s - 40) prev = st;
        if (st.s < tr.s - 40) {
          next = st;
          break;
        }
      }
    }
    let progress = 0;
    if (prev && next) {
      progress = clamp(Math.abs(tr.s - prev.s) / Math.abs(next.s - prev.s), 0, 1);
    }
    const pt = line.path.pointAt(tr.s);
    return { prev, next, progress, pt, line };
  }

  async getArrivals(station) {
    if (this.mode === 'live') {
      const stopIds = this.stationStops.get(station.id) ?? [];
      if (stopIds.length) {
        try {
          const all = await Promise.all(stopIds.map((id) => oba.fetchArrivals(id)));
          const merged = all
            .flat()
            .filter((a) => a.etaMs > -90000)
            .sort((a, b) => a.etaMs - b.etaMs);
          // de-dup same vehicle appearing at both platforms
          const seen = new Set();
          return merged
            .filter((a) => {
              const key = a.vehicleId ?? `${a.headsign}${Math.round(a.etaMs / 30000)}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, 8);
        } catch {
          /* fall through to sim estimate */
        }
      }
      return null; // caller shows "no data yet"
    }
    return this._simArrivals(station);
  }

  setSimSpeed(x) {
    this.simSpeed = x;
  }

  dataAgeSec() {
    if (this.mode !== 'live') return null;
    return (Date.now() - this.lastLiveAt) / 1000;
  }
}

// trapezoidal / triangular run profile over distance d
function runProfile(d, vmax, a, b) {
  const dAccel = (vmax * vmax) / (2 * a);
  const dBrake = (vmax * vmax) / (2 * b);
  if (dAccel + dBrake <= d) {
    const ta = vmax / a;
    const td = vmax / b;
    const tc = (d - dAccel - dBrake) / vmax;
    return { v: vmax, ta, tc, td, T: ta + tc + td, dA: dAccel, a, b };
  }
  const vp = Math.sqrt((2 * d * a * b) / (a + b));
  const ta = vp / a;
  const td = vp / b;
  return { v: vp, ta, tc: 0, td, T: ta + td, dA: (vp * vp) / (2 * a), a, b };
}

function runDist(e, t) {
  if (t <= e.ta) return 0.5 * e.a * t * t;
  if (t <= e.ta + e.tc) return e.dA + e.v * (t - e.ta);
  const tb = e.T - t;
  const total = e.s1 - e.s0;
  return total - 0.5 * e.b * tb * tb;
}
