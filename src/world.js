import * as THREE from 'three';
import { LANE_W, MAX_RUNNERS } from './config.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rc, S, LAP, path } from './track.js';

const ROAD_W = MAX_RUNNERS * LANE_W;
const CURB_W = 0.5;
const TOTAL_W = ROAD_W + CURB_W * 2;
const HALF = TOTAL_W / 2;
export const GANTRY_H = 8.8; // kamera (en fazla 8 m yükseklik) kapının altından geçsin
const SKY = 0x8fd3ff;

// Tribün ölçüleri
const TIERS = 7;
const D0 = HALF + 1.4; // ilk basamağın pistten uzaklığı
const DEPTH = 1.7;
const H0 = 1.4;
const RISE = 0.9;
const D_OUT = D0 + TIERS * DEPTH;
const H_TOP = H0 + (TIERS - 1) * RISE;

// Saha
const PITCH_W = 36;
const PITCH_L = 64;
const INFIELD_R = Rc - HALF - 1.0;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- dokular
function roadTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const px = c.width / TOTAL_W;
  const py = c.height / 4; // döşeme 4 m
  g.fillStyle = '#b5472f'; // tartan pist
  g.fillRect(0, 0, c.width, c.height);
  for (const x of [0, c.width - CURB_W * px]) {
    g.fillStyle = '#f2f2f2';
    g.fillRect(x, 0, CURB_W * px, c.height);
  }
  g.fillStyle = '#f7f7f7';
  for (let k = 1; k < MAX_RUNNERS; k++) {
    const x = (CURB_W + k * LANE_W) * px;
    g.fillRect(x - 2, 0, 4, c.height); // şerit çizgisi
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function pitchTexture() {
  const W = 288, H = 512, k = 8; // 8 px / m
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#34a64f' : '#2c9a46';
    g.fillRect(0, i * 64, W, 64);
  }
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.strokeRect(6, 6, W - 12, H - 12);
  g.beginPath(); g.moveTo(6, H / 2); g.lineTo(W - 6, H / 2); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 6 * k * 0.75, 0, Math.PI * 2); g.stroke();
  for (const top of [true, false]) {
    const y = top ? 6 : H - 6;
    const dir = top ? 1 : -1;
    g.strokeRect(W / 2 - 9 * k, top ? y : y - 16 * k, 18 * k, 16 * k);
    g.strokeRect(W / 2 - 4 * k, top ? y : y - 5 * k, 8 * k, 5 * k);
    g.beginPath(); g.arc(W / 2, y + dir * 11 * k, 2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function finishBannerTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  const cell = 20;
  g.fillStyle = '#111';
  for (let y = 0; y < c.height; y += cell) {
    for (let x = 0; x < c.width; x += cell) {
      if (((x / cell) + (y / cell)) % 2 && (y < cell * 1.5 || y >= c.height - cell * 1.5)) g.fillRect(x, y, cell, cell);
    }
  }
  g.fillStyle = '#e4002b';
  g.fillRect(0, cell * 1.5, c.width, c.height - cell * 3);
  g.fillStyle = '#fff';
  g.font = '900 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FINISH', c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 16; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------- halka (şerit) geometrisi
const SAMPLES = Math.ceil(LAP / 1.5);
const ringPts = (() => {
  const pts = [];
  const o = { x: 0, z: 0, psi: 0 };
  for (let i = 0; i <= SAMPLES; i++) {
    path((i / SAMPLES) * LAP, 0, o);
    pts.push({ x: o.x, z: o.z, cx: Math.cos(o.psi), cz: -Math.sin(o.psi), s: (i / SAMPLES) * LAP });
  }
  return pts;
})();

/** Pist boyunca uzanan şeritleri tek geometride birleştirir. */
class RingBuilder {
  constructor() { this.pos = []; this.col = []; this.uv = []; this.idx = []; }
  /** a/b: { off, y } — pist kenarına göre iki kenar; color: sabit renk; uvTile: doku uzunluğu (m) */
  strip(a, b, color, uvTile) {
    const base = this.pos.length / 3;
    const c = color == null ? null : new THREE.Color(color);
    for (const p of ringPts) {
      this.pos.push(p.x + a.off * p.cx, a.y, p.z + a.off * p.cz, p.x + b.off * p.cx, b.y, p.z + b.off * p.cz);
      if (c) this.col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (uvTile) this.uv.push(0, p.s / uvTile, 1, p.s / uvTile);
    }
    for (let i = 0; i < SAMPLES; i++) {
      const a0 = base + i * 2;
      this.idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// ------------------------------------------------------------------ dünya
export function createWorld(scene, renderer) {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 90, 280);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb27a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-30, 60, 40);
  scene.add(sun);

  const rnd = mulberry32(4242);
  const r = (a, b) => a + rnd() * (b - a);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const put = (mesh, i, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => {
    q.setFromEuler(e.set(0, ry, 0));
    mesh.setMatrixAt(i, m4.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz)));
  };
  const pt = { x: 0, z: 0, psi: 0 };

  const lambert = (color) => new THREE.MeshLambertMaterial({ color });

  // Zemin (Lego yeşil taban plakası)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), lambert(0x2f9e49));
  scene.add(ground);

  // Pist
  const tile = LAP / Math.round(LAP / 4);
  const roadB = new RingBuilder();
  roadB.strip({ off: -HALF, y: 0.1 }, { off: HALF, y: 0.1 }, null, tile);
  const road = new THREE.Mesh(roadB.build(), new THREE.MeshLambertMaterial({ map: roadTexture(renderer), side: THREE.DoubleSide }));
  scene.add(road);

  // Saha + çıtçıtlar (studs)
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_L).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: pitchTexture() }));
  pitch.position.y = 0.12;
  scene.add(pitch);

  const studPts = [];
  for (let x = -22; x <= 22; x += 2) {
    for (let z = -48; z <= 48; z += 2) {
      const dz = Math.max(Math.abs(z) - S / 2, 0);
      if (Math.hypot(x, dz) > INFIELD_R - 0.8) continue;
      studPts.push([x, z]);
    }
  }
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 8), lambert(0xffffff), studPts.length);
  studPts.forEach(([x, z], i) => {
    const inPitch = Math.abs(x) < PITCH_W / 2 && Math.abs(z) < PITCH_L / 2;
    const stripe = Math.floor((z + PITCH_L / 2) / 8) % 2;
    put(studs, i, x, 0.12 + 0.11, z);
    studs.setColorAt(i, col.set(inPitch ? (stripe ? 0x45c261 : 0x3bb457) : 0x3dbb5a));
  });
  scene.add(studs);

  // Kaleler
  const goalMat = lambert(0xffffff);
  const postGeo = new THREE.BoxGeometry(0.25, 2.6, 0.25);
  const barGeo = new THREE.BoxGeometry(7.5, 0.25, 0.25);
  const backGeo = new THREE.BoxGeometry(7.5, 0.15, 2);
  for (const sg of [-1, 1]) {
    const gz = sg * PITCH_L / 2;
    for (const gx of [-3.6, 3.6]) {
      const p = new THREE.Mesh(postGeo, goalMat); p.position.set(gx, 1.3, gz); scene.add(p);
    }
    const bar = new THREE.Mesh(barGeo, goalMat); bar.position.set(0, 2.6, gz); scene.add(bar);
    const top = new THREE.Mesh(backGeo, goalMat); top.position.set(0, 2.6, gz + sg * 1); scene.add(top);
  }

  // Bariyerler (pistin iki yanı)
  const barrierGeo = new THREE.BoxGeometry(0.3, 0.8, 2.3);
  const barrierPts = [];
  for (const side of [-1, 1]) {
    const off = side * (HALF + 0.25);
    const L = 2 * S + 2 * Math.PI * (Rc + off);
    const n = Math.round(L / 2.4);
    for (let i = 0; i < n; i++) {
      path((i / n) * L, off, pt);
      barrierPts.push([pt.x, pt.z, pt.psi, i % 2]);
    }
  }
  const barriers = new THREE.InstancedMesh(barrierGeo, lambert(0xffffff), barrierPts.length);
  barrierPts.forEach(([x, z, psi, alt], i) => {
    put(barriers, i, x, 0.4, z, psi);
    barriers.setColorAt(i, col.set(alt ? 0xd01012 : 0xf4f4f4));
  });
  scene.add(barriers);

  // Tribünler (basamaklı, tek geometri)
  const stands = new RingBuilder();
  for (let t = 0; t < TIERS; t++) {
    const d = D0 + t * DEPTH;
    const h = H0 + t * RISE;
    const hPrev = t === 0 ? 0 : H0 + (t - 1) * RISE;
    stands.strip({ off: d, y: hPrev }, { off: d, y: h }, t % 2 ? 0xe8ebef : 0x2a62c9); // basamak yüzü
    stands.strip({ off: d, y: h }, { off: d + DEPTH, y: h }, 0xb8bec8); // oturma yüzeyi
  }
  stands.strip({ off: D_OUT, y: H_TOP }, { off: D_OUT, y: H_TOP + 4 }, 0x5d6677); // arka duvar
  stands.strip({ off: D0 + 4.5, y: 11 }, { off: D_OUT + 3.5, y: 13 }, 0xdfe4ea); // çatı
  stands.strip({ off: D0 + 4.5, y: 10.4 }, { off: D0 + 4.5, y: 11 }, 0xe4002b); // çatı şeridi
  const standMesh = new THREE.Mesh(stands.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  scene.add(standMesh);

  // Seyirciler (zıplayan kalabalık: GPU'da, instance konumundan türeyen faz ile).
  // uExcite: genel coşku (0..1); uFin: bitiş kapısı çevresinde ek coşku (x, z, güç).
  const uTime = { value: 0 };
  const uExcite = { value: 0.2 };
  const uFin = { value: new THREE.Vector3(0, 0, 0) };
  const CROWD_COMMON = `
    uniform float uTime; uniform float uExcite; uniform vec3 uFin;
    attribute float aSide;
    void crowdState(out float ph, out float k, out float e) {
      ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
      k = 0.5 + 0.5 * sin(ph * 3.1);
      vec2 d = instanceMatrix[3].xz - uFin.xy;
      e = clamp(uExcite + uFin.z * exp(-dot(d, d) / 1250.0), 0.0, 1.0);
    }`;
  const crowdMat = (mat, extra = '') => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uExcite = uExcite;
      shader.uniforms.uFin = uFin;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>' + CROWD_COMMON)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph, k, e;
            crowdState(ph, k, e);
            float hop = max(0.0, sin(uTime * (5.0 + k * 3.0 + e * 3.0) + ph));
            transformed.y += hop * k * (0.08 + 0.45 * e);
            ${extra}
          #endif`);
    };
    return mat;
  };
  const bounce = (mat) => crowdMat(mat);
  // Kollar: omuz ekseninde, coşku arttıkça havaya kalkıp sallanır
  const armMat = (mat) => crowdMat(mat, `
    float up = e * (0.6 + 0.4 * sin(uTime * (7.0 + k * 3.0) + ph * 2.0));
    float ang = aSide * (0.12 + up * 2.6);
    vec2 pv = vec2(aSide * 0.31, 0.62);
    vec2 pr = transformed.xy - pv;
    float cs = cos(ang), sn = sin(ang);
    transformed.xy = pv + vec2(pr.x * cs - pr.y * sn, pr.x * sn + pr.y * cs);`);

  const palette = [0xe4002b, 0xe4002b, 0x0a5fd8, 0x0a5fd8, 0xffd400, 0xffffff, 0xffffff, 0x1e9b4b, 0xff7a00, 0x8a3ffc, 0xff5fa2];
  const crowd = [];
  for (let t = 0; t < TIERS; t++) {
    for (let row = 0; row < 2; row++) {
      const off = D0 + t * DEPTH + 0.5 + row * 0.75;
      const y = H0 + t * RISE;
      const L = 2 * S + 2 * Math.PI * (Rc + off);
      const n = Math.floor(L / 1.0);
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.07) continue; // boş koltuk
        path(((i + r(-0.15, 0.15)) / n) * L, off, pt);
        crowd.push([pt.x, y, pt.z, pt.psi, palette[Math.floor(rnd() * palette.length)]]);
      }
    }
  }
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.75, 0.32), bounce(lambert(0xffffff)), crowd.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.3, 0.3), bounce(lambert(0xffd21f)), crowd.length);
  crowd.forEach(([x, y, z, psi, c], i) => {
    put(bodies, i, x, y + 0.375, z, psi);
    bodies.setColorAt(i, col.set(c));
    put(heads, i, x, y + 0.9, z, psi);
  });
  // Kollar: her seyirci için iki kol tek geometride (aSide: -1 sol, +1 sağ)
  const armGeo = mergeGeometries([-1, 1].map((sd) => {
    const g = new THREE.BoxGeometry(0.14, 0.45, 0.14).translate(sd * 0.31, 0.62 - 0.225, 0);
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(sd), 1));
    return g;
  }));
  const arms = new THREE.InstancedMesh(armGeo, armMat(lambert(0xffffff)), crowd.length);
  crowd.forEach(([x, y, z, psi, c], i) => {
    put(arms, i, x, y, z, psi);
    arms.setColorAt(i, col.set(c));
  });
  // Kaydırma geometriyi oynattığı için sınır küresi güvenilmez; kalabalık zaten hep görünür
  for (const m of [bodies, heads, arms]) m.frustumCulled = false;
  scene.add(bodies, heads, arms);

  // Projektör kuleleri
  const poleMat = lambert(0x8a93a3);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false });
  const lampGeo = new THREE.BoxGeometry(9, 3.2, 0.5);
  const poleGeo = new THREE.BoxGeometry(1, 26, 1);
  const rt = Rc + D_OUT + 3;
  for (const psi of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const cz = psi < Math.PI ? -S / 2 : S / 2;
    const x = rt * Math.cos(psi), z = cz - rt * Math.sin(psi);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 13, z);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 26.5, z);
    lamp.lookAt(0, 20, 0);
    scene.add(pole, lamp);
  }

  // Bulutlar
  const clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert(0xffffff), 16 * 3);
  let n = 0;
  for (let i = 0; i < 16; i++) {
    const a = r(0, Math.PI * 2), d = r(90, 220);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = r(55, 80);
    for (let j = 0; j < 3; j++) put(clouds, n++, cx + (j - 1) * 7, cy + (j === 1 ? 1.5 : 0), cz, 0, r(9, 13), 3, r(6, 8));
  }
  scene.add(clouds);

  // Başlangıç çizgisi (s = 0, ana düzlüğün ortası)
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 0.8).rotateX(-Math.PI / 2), lambert(0xffffff));
  startLine.position.set(Rc, 0.14, 0.7);
  scene.add(startLine);

  // Bitiş kapısı + çizgisi
  const finish = new THREE.Group();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1.6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: checkerTexture() }));
  line.position.y = 0.14;
  finish.add(line);
  const postMat = lambert(0xd01012);
  const gx = HALF + 0.6;
  for (const sg of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, GANTRY_H, 0.8), postMat);
    post.position.set(sg * gx, GANTRY_H / 2, 0);
    finish.add(post);
  }
  const face = new THREE.MeshLambertMaterial({ map: finishBannerTexture() });
  const side = lambert(0xffffff);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(gx * 2 + 0.8, 1.8, 0.8), [side, side, side, side, face, side]);
  beam.position.set(0, GANTRY_H + 0.1, 0);
  finish.add(beam);
  finish.visible = false;
  scene.add(finish);

  // Statik nesnelerin matrislerini bir kez hesapla
  for (const o of [ground, road, pitch, studs, barriers, standMesh, bodies, heads, arms, clouds, startLine]) {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  }

  let finishS = undefined;
  return {
    /** Seyirci animasyonu için zaman (sn). */
    update(time) { uTime.value = time; },
    /** Genel seyirci coşkusu 0..1 (hafif → bayram). */
    setExcite(v) { uExcite.value = v; },
    /** Bitiş kapısı çevresindeki ek coşku gücü 0..1. */
    setFinishHype(v) { uFin.value.z = v; },
    /** Bitiş kapısı grubu (kutlama yapıları buna eklenir). */
    finish,
    gantryHalfWidth: gx,
    /** Bitiş kapısını ilerleme s (m) konumuna koyar; null → gizle. */
    setFinish(s) {
      if (s === finishS) return;
      finishS = s;
      if (s == null) { finish.visible = false; return; }
      path(s, 0, pt);
      uFin.value.x = pt.x; uFin.value.y = pt.z;
      finish.position.set(pt.x, 0, pt.z);
      finish.rotation.y = pt.psi;
      finish.visible = true;
    },
  };
}
