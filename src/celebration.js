import * as THREE from 'three';

// Kutlama yapıları ve efektleri. Hepsi GPU'da (vertex shader) animasyonlanır:
// kare başına CPU maliyeti yok, draw call sayısı sabit (balon kemeri, bayraklar, top, konfeti, havai fişek).

const PALETTE = [0xe4002b, 0x0a5fd8, 0xffd400, 0x1e9b4b, 0xff7a00, 0x8a3ffc, 0xff5fa2, 0xffffff];

const CONFETTI_COUNT = 900;
const CONFETTI_LIFE = 6.5;
const VOLLEYS = 3;
const VOLLEY_GAP = 1.6;
const CONFETTI_END = (VOLLEYS - 1) * VOLLEY_GAP + CONFETTI_LIFE + 0.5;

const FIREWORK_SLOTS = 10;
const FIREWORK_PARTS = 64;
const FIREWORK_LIFE = 2.4;
const FIREWORK_WINDOW = 9; // sn boyunca yeni patlama atılır

const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------ konfeti
function createConfetti(gx) {
  const quad = new THREE.PlaneGeometry(0.2, 0.13);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.instanceCount = CONFETTI_COUNT;
  const seed = new Float32Array(CONFETTI_COUNT * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));

  const uTime = { value: 0 };
  const uStart = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime, uStart, uGx: { value: gx + 0.7 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uStart, uGx;
      varying vec3 vCol;
      float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        float volley = floor(aSeed.w * ${VOLLEYS}.0);
        float t = uTime - uStart - volley * ${VOLLEY_GAP.toFixed(2)} - aSeed.z * 0.3;
        if (t < 0.0 || t > ${CONFETTI_LIFE.toFixed(2)}) { vCol = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

        float side = aSeed.x < 0.5 ? -1.0 : 1.0;
        float drag = 1.6, fall = 1.8;                       // sürtünme ve düşüş hızı
        vec3 v0 = vec3(-side * (5.0 + h(aSeed.y * 31.0) * 6.0),
                       12.0 + h(aSeed.z * 17.0) * 8.0,
                       (h(aSeed.x * 53.0) - 0.4) * 12.0);
        float u = (1.0 - exp(-drag * t)) / drag;
        vec3 origin = vec3(side * uGx, 1.5, 0.0);
        vec3 p = origin + v0 * u;
        p.y = origin.y + (v0.y + fall) * u - fall * t;
        p.x += sin(t * 3.0 + aSeed.y * 40.0) * 0.35 * u;    // savrularak düşer
        p.y = max(p.y, 0.16);

        float a = t * (4.0 + aSeed.y * 8.0) + aSeed.x * 6.283;
        float b = t * (3.0 + aSeed.z * 7.0) + aSeed.w * 6.283;
        vec3 q = position;
        q = vec3(q.x, q.y * cos(a) - q.z * sin(a), q.y * sin(a) + q.z * cos(a));
        q = vec3(q.x * cos(b) - q.y * sin(b), q.x * sin(b) + q.y * cos(b), q.z);
        q *= 1.0 - smoothstep(${(CONFETTI_LIFE - 0.8).toFixed(2)}, ${CONFETTI_LIFE.toFixed(2)}, t);

        vec3 pal[8] = vec3[8](
          vec3(0.89, 0.0, 0.17), vec3(0.04, 0.37, 0.85), vec3(1.0, 0.83, 0.0), vec3(0.12, 0.61, 0.29),
          vec3(1.0, 0.48, 0.0), vec3(0.54, 0.25, 0.99), vec3(1.0, 0.37, 0.64), vec3(1.0));
        vCol = pal[int(h(aSeed.x * 7.0 + aSeed.y) * 8.0) % 8] * (0.65 + 0.35 * abs(cos(a)));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p + q, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() { gl_FragColor = vec4(vCol, 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; // konum shader'da hesaplanıyor
  mesh.visible = false;
  return { mesh, uTime, uStart };
}

// ------------------------------------------------------- havai fişek
function createFireworks() {
  const n = FIREWORK_SLOTS * FIREWORK_PARTS;
  const pos = new Float32Array(n * 3); // kullanılmıyor ama Points için gerekli
  const dir = new Float32Array(n * 3);
  const slot = new Float32Array(n);
  for (let s = 0; s < FIREWORK_SLOTS; s++) {
    for (let i = 0; i < FIREWORK_PARTS; i++) {
      // Fibonacci küresi + hız çeşitliliği: dolgun, küresel patlama
      const k = s * FIREWORK_PARTS + i;
      const y = 1 - (i + 0.5) / FIREWORK_PARTS * 2;
      const rr = Math.sqrt(1 - y * y);
      const th = i * 2.399963 + s;
      const sp = rand(0.8, 1.0);
      dir[k * 3] = Math.cos(th) * rr * sp;
      dir[k * 3 + 1] = y * sp;
      dir[k * 3 + 2] = Math.sin(th) * rr * sp;
      slot[k] = s;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));

  const bursts = Array.from({ length: FIREWORK_SLOTS }, () => new THREE.Vector4(0, 0, 0, -100)); // xyz merkez, w başlangıç
  const colors = Array.from({ length: FIREWORK_SLOTS }, () => new THREE.Vector4(1, 1, 1, 10)); // rgb + yarıçap
  const uTime = { value: 0 };
  const uScale = { value: 800 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false, // tribün/çatı arkasında kalmasın
    // Gündüz gökyüzünde toplamalı karışım görünmez; normal alfa ile parlak renkli kıvılcımlar
    uniforms: { uTime, uScale, uBurst: { value: bursts }, uBurstCol: { value: colors } },
    vertexShader: /* glsl */ `
      attribute vec3 aDir;
      attribute float aSlot;
      uniform float uTime, uScale;
      uniform vec4 uBurst[${FIREWORK_SLOTS}];
      uniform vec4 uBurstCol[${FIREWORK_SLOTS}];
      varying vec3 vCol;
      varying float vA;
      void main() {
        int s = int(aSlot);
        vec4 b = uBurst[s];
        vec4 c = uBurstCol[s];
        float t = uTime - b.w;
        if (t < 0.0 || t > ${FIREWORK_LIFE.toFixed(2)}) { vA = 0.0; vCol = vec3(0.0); gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float life = t / ${FIREWORK_LIFE.toFixed(2)};
        vec3 p = b.xyz + aDir * c.w * (1.0 - exp(-3.2 * t)) - vec3(0.0, 2.2 * t * t, 0.0);
        float tw = 0.65 + 0.35 * sin(t * 28.0 + aDir.x * 40.0);
        vA = (1.0 - life) * (1.0 - life) * tw * smoothstep(0.0, 0.06, t);
        vCol = c.rgb;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(2.0, 1.1 * uScale / -mv.z * (1.0 - 0.5 * life));
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA;
        gl_FragColor = vec4(mix(vCol, vec3(1.0), 0.35 * a), min(1.0, a * 1.8));
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  return { points, bursts, colors, uTime, uScale };
}

// ----------------------------------------------------- yapılar (kapı)
function createStructures(finish, gx, gantryH, uTime) {
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();

  // Balon kemeri: kapının üstünde yarım daire, renkli balonlar (hafifçe sallanır)
  const balloonMat = lambert(0xffffff);
  balloonMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 2.1 + instanceMatrix[3].y;
          transformed.y += sin(uTime * 1.6 + ph) * 0.09;
          transformed.x += sin(uTime * 1.1 + ph * 1.7) * 0.05;
        #endif`);
  };
  const BALLOONS = 40;
  const balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), balloonMat, BALLOONS);
  for (let i = 0; i < BALLOONS; i++) {
    const a = (i / (BALLOONS - 1)) * Math.PI;
    const layer = i % 2;
    const r = gx * (0.96 + layer * 0.1) + rand(-0.2, 0.2);
    const size = rand(0.75, 1.15);
    p.set(Math.cos(a) * r, gantryH + 1.0 + Math.sin(a) * r * 0.72 + layer * 0.25, rand(-0.35, 0.35));
    balloons.setMatrixAt(i, m4.compose(p, q.identity(), sc.set(size, size * 1.18, size)));
    balloons.setColorAt(i, col.set(PALETTE[i % PALETTE.length]));
  }
  balloons.matrixAutoUpdate = false;
  finish.add(balloons);

  // Direk tepesinde dalgalanan bayraklar
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.4, 12, 1).translate(1.2, 0, 0);
  const flagMat = lambert(0xffffff, { side: THREE.DoubleSide });
  flagMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += sin(position.x * 2.6 - uTime * 7.0) * 0.2 * position.x;
        transformed.y += sin(position.x * 1.8 - uTime * 5.0) * 0.06 * position.x;`);
  };
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, 4);
  const poleMat = lambert(0xdfe4ea);
  const poleGeo = new THREE.BoxGeometry(0.14, 5.4, 0.14);
  let fi = 0;
  for (const sg of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(sg * gx, gantryH + 2.7, 0);
    pole.matrixAutoUpdate = false; pole.updateMatrix();
    finish.add(pole);
    for (const [y, cc] of [[gantryH + 4.5, 0xe4002b], [gantryH + 3.0, 0xffffff]]) {
      p.set(sg * gx, y, 0);
      flags.setMatrixAt(fi, m4.compose(p, q.identity(), sc.set(sg, 1, 1)));
      flags.setColorAt(fi++, col.set(cc));
    }
  }
  flags.frustumCulled = false;
  finish.add(flags);

  // Konfeti topları: direklerin dışında, kapının ortasına doğru eğik
  const cannonMat = lambert(0xd01012);
  const trimMat = lambert(0xffc933);
  const tubeGeo = new THREE.CylinderGeometry(0.34, 0.5, 1.7, 12).translate(0, 0.85, 0);
  const ringGeo = new THREE.TorusGeometry(0.36, 0.07, 6, 14).rotateX(Math.PI / 2).translate(0, 1.7, 0);
  const baseGeo = new THREE.BoxGeometry(1.5, 0.35, 1.5);
  for (const sg of [-1, 1]) {
    const cannon = new THREE.Group();
    cannon.position.set(sg * (gx + 0.7), 0.17, 0);
    const tilt = new THREE.Group();
    tilt.position.y = 0.2;
    tilt.rotation.z = sg * 0.45; // ortaya doğru eğik
    tilt.add(new THREE.Mesh(tubeGeo, cannonMat), new THREE.Mesh(ringGeo, trimMat));
    cannon.add(new THREE.Mesh(baseGeo, trimMat), tilt);
    cannon.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    finish.add(cannon);
  }
}

/**
 * Kutlama sistemi. `finish`: bitiş kapısı grubu (yapılar buna eklenir, onunla birlikte görünür/gizlenir).
 */
export function createCelebration({ scene, finish, gx, gantryH }) {
  const confetti = createConfetti(gx);
  const fire = createFireworks();
  finish.add(confetti.mesh);
  scene.add(fire.points);
  createStructures(finish, gx, gantryH, confetti.uTime);

  const ray = new THREE.Vector3();
  const origin = new THREE.Vector3();
  let t0 = -1;
  let nextFire = 0;
  let slotIdx = 0;

  function launch(time, camera) {
    // Ekranın üst yarısında rastgele bir noktadan kameradan uzağa: her zaman kadrajda görünür
    camera.updateMatrixWorld();
    ray.set(rand(-0.85, 0.85), rand(0.25, 0.8), 0.5).unproject(camera);
    origin.setFromMatrixPosition(camera.matrixWorld);
    ray.sub(origin).normalize();
    const dist = rand(32, 55); // stadyumun içinde, sahanın üstünde patlar (tribün/çatı önünde kalır)
    const i = slotIdx++ % FIREWORK_SLOTS;
    fire.bursts[i].set(origin.x + ray.x * dist, origin.y + ray.y * dist, origin.z + ray.z * dist, time);
    const c = new THREE.Color(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    fire.colors[i].set(c.r, c.g, c.b, rand(7, 12));
  }

  return {
    get active() { return t0 >= 0; },
    /** Kutlamayı başlatır (zaten başladıysa yok sayar). */
    start(time) {
      if (t0 >= 0) return;
      t0 = time;
      nextFire = time + 0.3;
      confetti.uStart.value = time;
      confetti.mesh.visible = true;
      fire.points.visible = true;
      for (const b of fire.bursts) b.w = -100;
    },
    /** Yeni yarış: her şeyi kapat. */
    stop() {
      if (t0 < 0) return;
      t0 = -1;
      confetti.mesh.visible = false;
      fire.points.visible = false;
    },
    /** Kutlama başlayalı geçen süre (sn); aktif değilse -1. */
    elapsed(time) { return t0 < 0 ? -1 : time - t0; },
    update(time, camera) {
      confetti.uTime.value = time;
      if (t0 < 0) return;
      const el = time - t0;
      fire.uTime.value = time;
      if (el < FIREWORK_WINDOW && time >= nextFire) {
        launch(time, camera);
        nextFire = time + rand(0.22, 0.6);
      }
      if (el > CONFETTI_END) confetti.mesh.visible = false;
      if (el > FIREWORK_WINDOW + FIREWORK_LIFE) fire.points.visible = false;
    },
    /** Nokta boyutları için piksel ölçeği: çizim tamponu yüksekliği ve dikey FOV (derece). */
    resize(heightPx, fovDeg) {
      fire.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)));
    },
  };
}
