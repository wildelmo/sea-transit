// Procedural Siemens S700-style Link light rail vehicle, modeled from the
// real train's proportions and livery: gloss-white body, black window mask
// that sweeps into the windshield, dark skirt, teal/green Sound Transit wave
// along the sill, gray roof with equipment pods, and a raked rounded nose.
//
// Each LRV is three articulated body sections (cab / short center / cab) so
// consists visibly bend through curves. Geometry is built in a z-up frame:
// +y = forward, +x = right, z = up from railhead. Two merged geometries are
// produced (cab section, center section), each with two material groups:
// group 0 = lit body (MeshStandardMaterial), group 1 = self-illuminated
// details (headlights, marker lights, destination sign, window glow).

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const LRV = {
  CAB_LEN: 11.0,
  MID_LEN: 6.6,
  GAP: 0.28, // articulation gap
  CAR_GAP: 0.9, // coupler gap between cars
  WIDTH: 2.65,
  get CAR_LEN() {
    return this.CAB_LEN * 2 + this.MID_LEN + this.GAP * 2;
  },
};

const C = {
  white: 0xeef1f3,
  skirt: 0x33383f,
  windowBand: 0x101318,
  windshield: 0x0b0e12,
  waveTeal: 0x0099b5,
  waveGreen: 0x44b34d,
  waveBlue: 0x1f5fae,
  roof: 0x878e96,
  pod: 0x4d545c,
  panto: 0x24282d,
  bogie: 0x17191d,
  door: 0x848c96,
  diaphragm: 0x1b1e23,
  headlight: 0xffffff,
  taillight: 0xff2f2f,
  headsign: 0xffb340,
  windowGlow: 0xb8cfe8,
};

/**
 * Box with each of its 8 logical corners remapped by fn(sx, sy, sz) where
 * s* are -1/+1. Lets us make tapered/raked hulls from a unit box.
 */
function hull(fn) {
  const g = new THREE.BoxGeometry(2, 2, 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const sx = Math.sign(pos.getX(i));
    const sy = Math.sign(pos.getY(i));
    const sz = Math.sign(pos.getZ(i));
    const [x, y, z] = fn(sx, sy, sz);
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function box(w, l, h, cx, cy, cz) {
  const g = new THREE.BoxGeometry(w, l, h);
  g.translate(cx, cy, cz);
  return g;
}

function paint(geom, hex) {
  const color = new THREE.Color(hex);
  const n = geom.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

function mergePainted(parts) {
  const geoms = parts.map(([g, c]) => paint(g, c));
  const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
  geoms.forEach((g) => g.dispose());
  return merged;
}

/** Shared side details: doors, window band, wave stripes. cy = body center y. */
function sideDetails(len, cy, out, { doors = 2, windowInset = 1.6 } = {}) {
  const W = LRV.WIDTH;
  const half = W / 2;
  const winLen = len - windowInset * 2;
  // window band (glow group) both sides
  out.glow.push(
    [box(0.04, winLen, 0.95, half + 0.01, cy, 2.35), C.windowGlow],
    [box(0.04, winLen, 0.95, -half - 0.01, cy, 2.35), C.windowGlow]
  );
  // black mask behind/around windows (slightly larger, body group)
  out.body.push(
    [box(0.03, winLen + 0.5, 1.15, half + 0.005, cy, 2.35), C.windowBand],
    [box(0.03, winLen + 0.5, 1.15, -half - 0.005, cy, 2.35), C.windowBand]
  );
  // wave stripes along the sill
  out.body.push(
    [box(0.03, len - 0.7, 0.16, half + 0.012, cy, 1.06), C.waveTeal],
    [box(0.03, len - 0.7, 0.16, -half - 0.012, cy, 1.06), C.waveTeal],
    [box(0.03, len - 0.7, 0.13, half + 0.012, cy, 0.9), C.waveGreen],
    [box(0.03, len - 0.7, 0.13, -half - 0.012, cy, 0.9), C.waveGreen]
  );
  // doors
  const usable = len - 2.6;
  for (let d = 0; d < doors; d++) {
    const y =
      cy + (doors === 1 ? 0 : -usable / 2 + 1.0 + (d * (usable - 2.0)) / Math.max(1, doors - 1));
    out.body.push(
      [box(0.04, 1.35, 2.1, half + 0.008, y, 1.85), C.door],
      [box(0.04, 1.35, 2.1, -half - 0.008, y, 1.85), C.door],
      [box(0.05, 0.08, 2.1, half + 0.01, y, 1.85), C.windowBand],
      [box(0.05, 0.08, 2.1, -half - 0.01, y, 1.85), C.windowBand]
    );
  }
}

/**
 * Cab (end) section. Nose faces +y. ~11 m long.
 */
export function buildCabSection() {
  const W = LRV.WIDTH;
  const L = LRV.CAB_LEN;
  const half = W / 2;
  const bodyLen = L - 2.6; // straight part; nose takes the rest
  const bodyBack = -L / 2;
  const bodyFront = bodyBack + bodyLen;
  const noseLen = L - bodyLen;

  const out = { body: [], glow: [] };

  // underframe + skirt
  out.body.push(
    [box(W - 0.35, bodyLen, 0.5, 0, bodyBack + bodyLen / 2, 0.62), C.skirt],
    [box(1.9, 2.2, 0.55, 0, bodyBack + 1.6, 0.35), C.bogie] // bogie under rear
  );

  // main body shell
  out.body.push([box(W, bodyLen, 2.3, 0, bodyBack + bodyLen / 2, 1.95), C.white]);

  // nose: tapered, raked hull from body front
  const noseGeom = hull((sx, sy, sz) => {
    const z = sz > 0 ? 3.05 : 0.5;
    if (sy < 0) {
      // back face mates with body
      return [sx * half, bodyFront, z];
    }
    // front face: narrower, lower, raked back at the top
    const taper = sz > 0 ? 0.62 : 0.78;
    const yFront = bodyFront + noseLen - (sz > 0 ? 1.15 : 0.0);
    return [sx * half * taper, yFront, sz > 0 ? 2.62 : 0.62];
  });
  out.body.push([noseGeom, C.white]);

  // windshield mask (dark raked plate slightly proud of nose)
  const shield = hull((sx, sy, sz) => {
    const t = sz > 0 ? 0.6 : 0.74;
    const y0 = bodyFront + noseLen - (sz > 0 ? 1.08 : 0.06) + 0.03;
    if (sy < 0) return [sx * half * 0.8, y0 - 0.72, sz > 0 ? 2.68 : 1.55];
    return [sx * half * (t - 0.02), y0 + 0.02, sz > 0 ? 2.56 : 1.52];
  });
  out.body.push([shield, C.windshield]);

  // nose skirt / anticlimber
  out.body.push([
    hull((sx, sy, sz) => {
      if (sy < 0) return [sx * (half - 0.15), bodyFront, sz > 0 ? 0.62 : 0.18];
      return [sx * half * 0.7, bodyFront + noseLen - 0.12, sz > 0 ? 0.62 : 0.3];
    }),
    C.skirt,
  ]);

  // blue wave swoosh on the nose sides
  out.body.push(
    [box(0.03, 1.7, 0.5, half - 0.28, bodyFront + 0.55, 1.15), C.waveBlue],
    [box(0.03, 1.7, 0.5, -half + 0.28, bodyFront + 0.55, 1.15), C.waveBlue]
  );

  // roof + pods
  out.body.push(
    [box(W - 0.5, bodyLen - 0.3, 0.32, 0, bodyBack + bodyLen / 2, 3.26), C.roof],
    [box(W - 1.0, 2.6, 0.3, 0, bodyBack + 2.2, 3.5), C.pod],
    [box(W - 1.2, 1.8, 0.26, 0, bodyBack + 5.4, 3.48), C.pod]
  );

  // rear diaphragm (articulation bellows)
  out.body.push([box(W - 0.7, 0.5, 2.4, 0, bodyBack + 0.2, 1.9), C.diaphragm]);

  sideDetails(bodyLen - 0.6, bodyBack + bodyLen / 2, out, { doors: 2 });

  // ---- glow group: lights & signage ----
  const noseTip = bodyFront + noseLen;
  out.glow.push(
    // headlights (white) — visible from the front
    [box(0.34, 0.1, 0.22, half * 0.48, noseTip - 0.28, 1.06), C.headlight],
    [box(0.34, 0.1, 0.22, -half * 0.48, noseTip - 0.28, 1.06), C.headlight],
    // tail/marker lights (red), slightly outboard
    [box(0.16, 0.08, 0.14, half * 0.62, noseTip - 0.36, 1.38), C.taillight],
    [box(0.16, 0.08, 0.14, -half * 0.62, noseTip - 0.36, 1.38), C.taillight],
    // destination sign above windshield
    [box(1.05, 0.07, 0.24, 0, noseTip - 1.2, 2.72), C.headsign]
  );

  const geom = mergeWithGroups(out);
  return geom;
}

/**
 * Short suspended center section with pantograph. ~6.6 m.
 */
export function buildMidSection() {
  const W = LRV.WIDTH;
  const L = LRV.MID_LEN;

  const out = { body: [], glow: [] };

  out.body.push(
    [box(W - 0.35, L - 0.5, 0.5, 0, 0, 0.62), C.skirt],
    [box(1.9, 2.4, 0.55, 0, 0, 0.35), C.bogie],
    [box(W, L - 0.4, 2.3, 0, 0, 1.95), C.white],
    [box(W - 0.5, L - 0.9, 0.32, 0, 0, 3.26), C.roof],
    // diaphragms both ends
    [box(W - 0.7, 0.5, 2.4, 0, L / 2 - 0.15, 1.9), C.diaphragm],
    [box(W - 0.7, 0.5, 2.4, 0, -L / 2 + 0.15, 1.9), C.diaphragm],
    // pantograph: base, two angled arms, contact bar
    [box(1.4, 2.0, 0.14, 0, 0, 3.44), C.panto],
    [angled(0.09, 2.1, 0.09, 0, -0.55, 3.95, -0.5), C.panto],
    [angled(0.09, 2.1, 0.09, 0, 0.55, 3.95, 0.5), C.panto],
    [box(1.7, 0.12, 0.07, 0, 0, 4.42), C.panto]
  );

  sideDetails(L - 0.6, 0, out, { doors: 1, windowInset: 1.1 });

  return mergeWithGroups(out);
}

function angled(w, l, h, cx, cy, cz, rotX) {
  const g = new THREE.BoxGeometry(w, l, h);
  g.rotateX(rotX);
  g.translate(cx, cy, cz);
  return g;
}

function mergeWithGroups(out) {
  const bodyGeom = mergePainted(out.body);
  const glowGeom = mergePainted(out.glow);
  const merged = BufferGeometryUtils.mergeGeometries([bodyGeom, glowGeom], true);
  bodyGeom.dispose();
  glowGeom.dispose();
  return merged; // group 0 = body, group 1 = glow
}

export function makeMaterials(theme) {
  const body = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.25,
    roughness: 0.45,
  });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const mats = [body, glow];
  setMaterialTheme(mats, theme);
  return mats;
}

export function makeGhostMaterials(theme) {
  const body = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.0,
    roughness: 0.9,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const glow = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const mats = [body, glow];
  setMaterialTheme(mats, theme);
  return mats;
}

export function setMaterialTheme(mats, theme) {
  const [body, glow] = mats;
  if (theme === 'night') {
    glow.color.set(0xffffff);
    body.envMapIntensity = 0.6;
  } else {
    // in daylight the "glow" parts read as tinted glass / dark fixtures
    glow.color.set(0x5a6470);
    body.envMapIntensity = 1.0;
  }
  glow.needsUpdate = true;
}
