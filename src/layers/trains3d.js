// Three.js custom MapLibre layer: articulated 3D trains, elevated guideway
// with piers (none over water — the I-90 bridge floats, like the real one),
// station platforms with canopies, headlight beams, blob shadows and the
// selection ring. Trains are drawn with four InstancedMesh pools (cab/mid ×
// solid/ghost) so an entire fleet costs a handful of draw calls.
//
// Local frame: meters, x = east, y = north, z = up, origin near Westlake.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import maplibregl from 'maplibre-gl';
import { network } from '../data/network.js';
import {
  LRV,
  buildCabSection,
  buildMidSection,
  makeMaterials,
  makeGhostMaterials,
  setMaterialTheme,
} from '../model/lrv.js';

const ORIGIN = [-122.32, 47.6];
const MAX_TRAINS = 48;
const MAX_CARS = 4;

const GUIDEWAY_COLORS = {
  night: { deck: 0x232c3b, pier: 0x1d2532, platform: 0x2c3648, canopy: 0x151b26 },
  day: { deck: 0xc0c4cb, pier: 0xa8adb5, platform: 0xd4d8de, canopy: 0x7e8894 },
};

export class TrainLayer {
  constructor({ getTrains, theme = 'night' }) {
    this.id = 'trains-3d';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.getTrains = getTrains;
    this.theme = theme;
    this.timeSec = 0;
    // per-train sample points for screen-space picking: id -> [{lng,lat,alt}]
    this.pickSamples = new Map();
  }

  // ---------- setup ----------

  onAdd(map, gl) {
    this.map = map;
    const anchor = maplibregl.MercatorCoordinate.fromLngLat(
      { lng: ORIGIN[0], lat: ORIGIN[1] },
      0
    );
    this.ox = anchor.x;
    this.oy = anchor.y;
    this.oz = anchor.z;
    this.sc = anchor.meterInMercatorCoordinateUnits();

    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x223044, 1.0);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-0.4, -0.7, 1).normalize();
    this.scene.add(this.hemi, this.sun);

    // train pools
    const cabGeom = buildCabSection();
    const midGeom = buildMidSection();
    this.solidMats = makeMaterials(this.theme);
    this.ghostMats = makeGhostMaterials(this.theme);
    const mk = (geom, mats, count) => {
      const m = new THREE.InstancedMesh(geom, mats, count);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
      return m;
    };
    const nCab = MAX_TRAINS * MAX_CARS * 2;
    const nMid = MAX_TRAINS * MAX_CARS;
    this.cabSolid = mk(cabGeom, this.solidMats, nCab);
    this.midSolid = mk(midGeom, this.solidMats, nMid);
    this.cabGhost = mk(cabGeom, this.ghostMats, nCab);
    this.midGhost = mk(midGeom, this.ghostMats, nMid);

    // blob shadows (one ellipse per car)
    const blobGeom = new THREE.CircleGeometry(1, 20);
    this.blobMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.blobs = mk(blobGeom, this.blobMat, MAX_TRAINS * MAX_CARS);
    this.blobs.renderOrder = -1;

    // headlight beams
    let coneGeom = new THREE.ConeGeometry(3.1, 26, 14, 1, true);
    coneGeom.rotateX(Math.PI);
    coneGeom.translate(0, 13, 0);
    coneGeom.rotateX(-0.055); // aim slightly down
    this.coneMat = new THREE.MeshBasicMaterial({
      color: 0xffe9b0,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.cones = mk(coneGeom, this.coneMat, MAX_TRAINS);

    // selection ring
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 6.4, 48), this.ringMat);
    this.ring.visible = false;
    this.scene.add(this.ring);

    // static world geometry
    this.staticGroup = new THREE.Group();
    this.scene.add(this.staticGroup);
    this.rebuildStatic();

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._zAxis = new THREE.Vector3(0, 0, 1);
    this._v3 = new THREE.Vector3(1, 1, 1);
  }

  onRemove() {
    this.renderer?.dispose();
  }

  lngLatToLocal(lng, lat, alt) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, 0);
    return [(mc.x - this.ox) / this.sc, -(mc.y - this.oy) / this.sc, alt];
  }

  terrainAt(lng, lat) {
    const e = this.map.queryTerrainElevation?.({ lng, lat });
    return Number.isFinite(e) ? e : 0;
  }

  // ---------- static geometry: guideway, piers, platforms ----------

  rebuildStatic() {
    if (!this.scene) return; // not added to the map yet
    for (const child of [...this.staticGroup.children]) {
      this.staticGroup.remove(child);
      child.geometry?.dispose();
    }
    const colors = GUIDEWAY_COLORS[this.theme];
    this.deckMat = new THREE.MeshStandardMaterial({ color: colors.deck, roughness: 0.9 });
    this.pierMat = new THREE.MeshStandardMaterial({ color: colors.pier, roughness: 0.95 });
    this.platformMat = new THREE.MeshStandardMaterial({ color: colors.platform, roughness: 0.85 });
    this.canopyMat = new THREE.MeshStandardMaterial({
      color: colors.canopy,
      roughness: 0.6,
      metalness: 0.3,
    });

    const deckGeoms = [];
    const pierGeoms = [];

    for (const line of Object.values(network.lines)) {
      this.buildGuidewayForPath(line.path, deckGeoms, pierGeoms);
    }
    if (deckGeoms.length) {
      const deck = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(deckGeoms), this.deckMat);
      deck.frustumCulled = false;
      this.staticGroup.add(deck);
    }
    if (pierGeoms.length) {
      const piers = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(pierGeoms), this.pierMat);
      piers.frustumCulled = false;
      this.staticGroup.add(piers);
    }

    // station platforms + canopies (skip underground stations)
    const platGeoms = [];
    const canopyGeoms = [];
    for (const st of network.stations) {
      if (st.alt < -1) continue;
      const line = network.lines[st.lines[0]];
      const s = st.sByLine[st.lines[0]];
      const bearing = (line.path.bearingAt(s, 60) * Math.PI) / 180;
      const [x, y] = this.lngLatToLocal(st.lng, st.lat, 0);
      const zBase = this.terrainAt(st.lng, st.lat);
      const top = zBase + Math.max(st.alt, 0.4) + 0.85;
      for (const side of [-1, 1]) {
        const p = new THREE.BoxGeometry(3.1, 56, 1.15);
        p.translate(side * 3.45, 0, -0.575);
        const c = new THREE.BoxGeometry(3.5, 46, 0.25);
        c.translate(side * 3.3, 0, 4.6 - 0.575);
        for (const [g, arr] of [
          [p, platGeoms],
          [c, canopyGeoms],
        ]) {
          g.rotateZ(-bearing);
          g.translate(x, y, top);
          arr.push(g);
        }
        // canopy columns
        for (const ys of [-19, 0, 19]) {
          const col = new THREE.BoxGeometry(0.28, 0.28, 4.35);
          col.translate(side * 3.3, ys, 2.18 - 0.575);
          col.rotateZ(-bearing);
          col.translate(x, y, top);
          canopyGeoms.push(col);
        }
      }
    }
    if (platGeoms.length) {
      const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(platGeoms), this.platformMat);
      m.frustumCulled = false;
      this.staticGroup.add(m);
    }
    if (canopyGeoms.length) {
      const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(canopyGeoms), this.canopyMat);
      m.frustumCulled = false;
      this.staticGroup.add(m);
    }
  }

  buildGuidewayForPath(path, deckGeoms, pierGeoms) {
    const step = 22;
    const n = Math.floor(path.length / step);
    let run = []; // consecutive elevated samples
    const flushRun = () => {
      if (run.length > 1) deckGeoms.push(this.ribbonGeometry(run));
      run = [];
    };
    let sincePier = 0;
    for (let i = 0; i <= n; i++) {
      const s = Math.min(i * step, path.length);
      const pt = path.pointAt(s);
      if (pt.alt >= 2.5) {
        const [x, y] = this.lngLatToLocal(pt.lng, pt.lat, 0);
        const zg = this.terrainAt(pt.lng, pt.lat);
        const brg = (path.bearingAt(s, 30) * Math.PI) / 180;
        run.push({ x, y, z: zg + pt.alt, brg });
        // piers only for true elevated guideway (bridges float / span water)
        sincePier += step;
        if (pt.alt >= 6 && sincePier >= 34) {
          sincePier = 0;
          const h = pt.alt - 1.1;
          const pier = new THREE.BoxGeometry(1.8, 1.8, h);
          pier.translate(x, y, zg + h / 2);
          pierGeoms.push(pier);
        }
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  /** Concrete deck ribbon through elevated samples: top + two sides. */
  ribbonGeometry(samples) {
    const W = 4.6; // half-width of dual-track deck
    const DEPTH = 1.3;
    const nS = samples.length;
    const positions = new Float32Array(nS * 4 * 3);
    for (let i = 0; i < nS; i++) {
      const { x, y, z, brg } = samples[i];
      const px = Math.cos(brg);
      const py = -Math.sin(brg);
      const topZ = z - 0.35;
      const o = i * 12;
      positions[o] = x - px * W; positions[o + 1] = y - py * W; positions[o + 2] = topZ;
      positions[o + 3] = x + px * W; positions[o + 4] = y + py * W; positions[o + 5] = topZ;
      positions[o + 6] = x - px * W; positions[o + 7] = y - py * W; positions[o + 8] = topZ - DEPTH;
      positions[o + 9] = x + px * W; positions[o + 10] = y + py * W; positions[o + 11] = topZ - DEPTH;
    }
    const idx = [];
    for (let i = 0; i < nS - 1; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1); // top
      idx.push(a + 2, b + 2, a, a, b + 2, b); // left side
      idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); // right side
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---------- theming ----------

  setTheme(theme) {
    this.theme = theme;
    if (!this.scene) return;
    setMaterialTheme(this.solidMats, theme);
    setMaterialTheme(this.ghostMats, theme);
    if (theme === 'night') {
      this.hemi.color.set(0x9db2d8);
      this.hemi.groundColor.set(0x2a3550);
      this.hemi.intensity = 2.1;
      this.sun.color.set(0xbfd2f8);
      this.sun.intensity = 1.15;
      this.coneMat.opacity = 0.08;
      this.blobMat.opacity = 0.34;
    } else {
      this.hemi.color.set(0xffffff);
      this.hemi.groundColor.set(0x8b97a8);
      this.hemi.intensity = 0.85;
      this.sun.color.set(0xfff2dc);
      this.sun.intensity = 1.7;
      this.coneMat.opacity = 0.0;
      this.blobMat.opacity = 0.26;
    }
    const c = GUIDEWAY_COLORS[theme];
    this.deckMat?.color.set(c.deck);
    this.pierMat?.color.set(c.pier);
    this.platformMat?.color.set(c.platform);
    this.canopyMat?.color.set(c.canopy);
  }

  // ---------- per-frame ----------

  placeSection(pool, x, y, z, bearingDeg) {
    const i = pool.count++;
    this._q.setFromAxisAngle(this._zAxis, (-bearingDeg * Math.PI) / 180);
    this._m4.compose(new THREE.Vector3(x, y, z), this._q, this._v3);
    pool.setMatrixAt(i, this._m4);
  }

  render(gl, args) {
    const matrix = args?.defaultProjectionData?.mainMatrix ?? args;
    const proj = new THREE.Matrix4().fromArray(matrix);
    const l = new THREE.Matrix4()
      .makeTranslation(this.ox, this.oy, this.oz)
      .scale(new THREE.Vector3(this.sc, -this.sc, this.sc));
    this.camera.projectionMatrix = proj.multiply(l);

    const trains = this.getTrains?.() ?? [];
    this.cabSolid.count = 0;
    this.midSolid.count = 0;
    this.cabGhost.count = 0;
    this.midGhost.count = 0;
    this.blobs.count = 0;
    this.cones.count = 0;
    this.ring.visible = false;
    this.pickSamples.clear();

    const t = performance.now() / 1000;
    const nightBeams = this.theme === 'night';

    for (const train of trains.slice(0, MAX_TRAINS)) {
      const line = network.lines[train.line];
      if (!line) continue;
      const path = line.path;
      const cars = Math.min(train.cars ?? 3, MAX_CARS);
      const headS = train.s;
      const dir = train.dir; // +1 = increasing path distance
      const headPt = path.pointAt(headS);
      const terr = this.terrainAt(headPt.lng, headPt.lat);
      const samples = [];

      for (let c = 0; c < cars; c++) {
        const carBase = c * (LRV.CAR_LEN + LRV.CAR_GAP);
        const sections = [
          { off: carBase + LRV.CAB_LEN / 2, cab: true, flip: false },
          { off: carBase + LRV.CAB_LEN + LRV.GAP + LRV.MID_LEN / 2, cab: false, flip: false },
          {
            off: carBase + LRV.CAB_LEN + LRV.MID_LEN + 2 * LRV.GAP + LRV.CAB_LEN / 2,
            cab: true,
            flip: true,
          },
        ];
        let carGhost = false;
        let carPt = null;
        for (const sec of sections) {
          const s = Math.min(Math.max(headS - dir * sec.off, 0), path.length);
          const pt = path.pointAt(s);
          const secLen = sec.cab ? LRV.CAB_LEN : LRV.MID_LEN;
          let brg = path.bearingAt(s, secLen);
          if (dir < 0) brg += 180;
          if (sec.flip) brg += 180;
          const ghost = pt.alt < -1;
          carGhost = carGhost || ghost;
          const [x, y] = this.lngLatToLocal(pt.lng, pt.lat, 0);
          const z = terr + Math.max(pt.alt, 0.35);
          const pool = sec.cab
            ? ghost
              ? this.cabGhost
              : this.cabSolid
            : ghost
              ? this.midGhost
              : this.midSolid;
          this.placeSection(pool, x, y, z, brg);
          if (!sec.cab) carPt = { pt, x, y, z, brg };
        }
        // blob shadow under car
        if (carPt && !carGhost) {
          const i = this.blobs.count++;
          this._q.setFromAxisAngle(this._zAxis, (-carPt.brg * Math.PI) / 180);
          this._m4.compose(
            new THREE.Vector3(carPt.x, carPt.y, terr + Math.max(carPt.pt.alt, 0.35) + 0.07),
            this._q,
            new THREE.Vector3(2.6, LRV.CAR_LEN * 0.58, 1)
          );
          this.blobs.setMatrixAt(i, this._m4);
        }
        if (carPt) samples.push({ lng: carPt.pt.lng, lat: carPt.pt.lat, alt: carPt.pt.alt });
      }

      // headlight beam from lead cab
      if (nightBeams && headPt.alt > -1) {
        const [hx, hy] = this.lngLatToLocal(headPt.lng, headPt.lat, 0);
        let brg = path.bearingAt(headS, 8);
        if (dir < 0) brg += 180;
        const i = this.cones.count++;
        this._q.setFromAxisAngle(this._zAxis, (-brg * Math.PI) / 180);
        this._m4.compose(
          new THREE.Vector3(hx, hy, terr + Math.max(headPt.alt, 0.35) + 1.05),
          this._q,
          this._v3
        );
        this.cones.setMatrixAt(i, this._m4);
      }

      // selection ring under the head of the followed/selected train
      if (train.selected) {
        const midOff = (cars * (LRV.CAR_LEN + LRV.CAR_GAP)) / 2;
        const s = Math.min(Math.max(headS - dir * midOff, 0), path.length);
        const pt = path.pointAt(s);
        const [x, y] = this.lngLatToLocal(pt.lng, pt.lat, 0);
        this.ring.position.set(x, y, terr + Math.max(pt.alt, 0.35) + 0.12);
        const pulse = 1 + 0.14 * Math.sin(t * 3.2);
        this.ring.scale.set(pulse, pulse, 1);
        this.ringMat.opacity = 0.55 + 0.3 * Math.sin(t * 3.2);
        this.ring.visible = true;
      }

      this.pickSamples.set(train.id, samples);
    }

    for (const pool of [
      this.cabSolid,
      this.midSolid,
      this.cabGhost,
      this.midGhost,
      this.blobs,
      this.cones,
    ]) {
      pool.instanceMatrix.needsUpdate = true;
    }

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen-space pick: nearest train within threshold px. */
  pick(pointX, pointY, thresholdPx = 28) {
    let best = null;
    for (const [id, samples] of this.pickSamples) {
      for (const s of samples) {
        const p = this.map.project([s.lng, s.lat]);
        const d = Math.hypot(p.x - pointX, p.y - pointY);
        if (d < thresholdPx && (!best || d < best.d)) best = { id, d };
      }
    }
    return best?.id ?? null;
  }
}
