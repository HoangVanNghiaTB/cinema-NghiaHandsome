import * as THREE from 'three';

// Phụ kiện dựng bằng hình khối đơn giản (ít đa giác) cho nhân vật trái cây (xem fruitRig.js).
// Toạ độ mét trong khung của avatar: mặt nhìn về -z, lưng là +z, y lên. Thân là hình trứng tâm (0, 0.53, 0),
// bán kính (0.47, 0.56, 0.45) nên đỉnh thân ở 1.09; mắt ở (±0.125, 0.665) trên mặt trước z ≈ -0.43.
// Hình và vật liệu dùng chung giữa mọi avatar (cache theo khoá) nên không cần huỷ.

const geos = new Map();
const mats = new Map();
const geo = (key, make) => {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
};
const mat = (color) => {
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  return mats.get(color);
};
function mesh(g, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(g, mat(color));
  m.position.set(x, y, z);
  return m;
}

// ----- Mũ (đặt trên đỉnh thân, y = 1.0) -----
function buildHat(type) {
  const g = new THREE.Group();
  g.position.set(0, 1.0, -0.02);
  if (type === 'cap') {
    const dome = mesh(geo('capDome', () => new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), 0xd33a3a, 0, 0.02, 0);
    dome.scale.y = 0.8;
    const brim = mesh(geo('capBrim', () => new THREE.CylinderGeometry(0.24, 0.24, 0.025, 16, 1, false, Math.PI / 2, Math.PI)), 0xa82a2a, 0, 0.04, -0.2);
    brim.rotation.x = -0.12;
    g.add(dome, brim);
  } else if (type === 'party') {
    g.add(mesh(geo('partyCone', () => new THREE.ConeGeometry(0.16, 0.4, 14)), 0xff7eb6, 0, 0.2, 0));
    g.add(mesh(geo('partyPom', () => new THREE.SphereGeometry(0.045, 8, 6)), 0xffe14d, 0, 0.42, 0));
    g.add(mesh(geo('partyStripe', () => new THREE.CylinderGeometry(0.115, 0.13, 0.045, 14, 1, true)), 0x58d6ff, 0, 0.12, 0));
  } else if (type === 'crown') {
    g.add(mesh(geo('crownBase', () => new THREE.CylinderGeometry(0.2, 0.22, 0.11, 16, 1, true)), 0xf5c542, 0, 0.05, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(geo('crownSpike', () => new THREE.ConeGeometry(0.05, 0.15, 6)), 0xf5c542, Math.cos(a) * 0.21, 0.18, Math.sin(a) * 0.21));
    }
    g.add(mesh(geo('crownGem', () => new THREE.SphereGeometry(0.028, 8, 6)), 0xe74c3c, 0, 0.05, -0.215));
  } else if (type === 'tophat') {
    g.add(mesh(geo('topBrim', () => new THREE.CylinderGeometry(0.3, 0.3, 0.035, 20)), 0x20222a, 0, -0.01, 0));
    g.add(mesh(geo('topBody', () => new THREE.CylinderGeometry(0.18, 0.2, 0.34, 18)), 0x20222a, 0, 0.18, 0));
    g.add(mesh(geo('topBand', () => new THREE.CylinderGeometry(0.205, 0.205, 0.06, 18, 1, true)), 0xd33a3a, 0, 0.06, 0));
  }
  return g;
}

// ----- Kính (trước hai mắt) -----
function buildGlasses(type) {
  const g = new THREE.Group();
  g.add(mesh(geo('glassBridge', () => new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6).rotateZ(Math.PI / 2)), 0x15161c, 0, 0.67, -0.445));
  for (const side of [-1, 1]) {
    if (type === 'round') {
      g.add(mesh(geo('glassRing', () => new THREE.TorusGeometry(0.085, 0.017, 8, 22)), 0x15161c, side * 0.125, 0.665, -0.445));
    } else {
      const lens = mesh(geo('sunLens', () => new THREE.CylinderGeometry(0.09, 0.09, 0.025, 20).rotateX(Math.PI / 2)), 0x0c0d12, side * 0.125, 0.665, -0.445);
      lens.scale.y = 0.8;
      g.add(lens);
    }
  }
  return g;
}

// ----- Tai nghe / tai mèo -----
function buildEars(type, bodyColor) {
  const g = new THREE.Group();
  if (type === 'phones') {
    for (const side of [-1, 1]) {
      g.add(mesh(geo('cup', () => new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16).rotateZ(Math.PI / 2)), 0x2d2f3a, side * 0.47, 0.66, 0));
      g.add(mesh(geo('cupPad', () => new THREE.CylinderGeometry(0.1, 0.1, 0.035, 16).rotateZ(Math.PI / 2)), 0xe85d75, side * 0.51, 0.66, 0));
    }
    g.add(mesh(geo('band', () => new THREE.TorusGeometry(0.5, 0.022, 8, 28, Math.PI)), 0x2d2f3a, 0, 0.66, 0));
  } else if (type === 'cat') {
    for (const side of [-1, 1]) {
      const ear = mesh(geo('catEar', () => new THREE.ConeGeometry(0.11, 0.24, 4)), bodyColor, side * 0.24, 1.08, 0);
      ear.rotation.z = -side * 0.4;
      const inner = mesh(geo('catInner', () => new THREE.ConeGeometry(0.06, 0.14, 4)), 0xffb3c6, side * 0.24, 1.065, -0.04);
      inner.rotation.z = -side * 0.4;
      g.add(ear, inner);
    }
  }
  return g;
}

// ----- Đồ đeo sau lưng (lưng là +z; mặt sau thân ở z ≈ 0.45) -----
function buildBack(type) {
  const g = new THREE.Group();
  if (type === 'backpack') {
    g.add(mesh(geo('pack', () => new THREE.BoxGeometry(0.4, 0.46, 0.2)), 0x3b6ea5, 0, 0.55, 0.5));
    g.add(mesh(geo('packPocket', () => new THREE.BoxGeometry(0.26, 0.16, 0.06)), 0x2f5887, 0, 0.47, 0.62));
    g.add(mesh(geo('packTop', () => new THREE.BoxGeometry(0.42, 0.05, 0.22)), 0xf5c542, 0, 0.8, 0.5));
  } else if (type === 'wings') {
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const h = 0.5 - i * 0.08;
        const feather = mesh(geo(`feather${i}`, () => new THREE.BoxGeometry(0.12, h, 0.03).translate(0, h / 2, 0)), 0xf5f7fa);
        feather.rotation.z = side * (-0.25 - i * 0.38);
        wing.add(feather);
      }
      wing.position.set(side * 0.3, 0.62, 0.38);
      wing.rotation.y = -side * 0.45;
      g.add(wing);
    }
  } else if (type === 'tail') {
    const parts = [[0, 0.22, 0.44, 0.075], [0, 0.3, 0.55, 0.07], [0, 0.42, 0.61, 0.065], [0, 0.55, 0.61, 0.06], [0, 0.66, 0.56, 0.075]];
    parts.forEach(([x, y, z, r], i) => {
      g.add(mesh(geo(`tail${i}`, () => new THREE.SphereGeometry(r, 8, 6)), i === parts.length - 1 ? 0xff7eb6 : 0xf39c12, x, y, z));
    });
  }
  return g;
}

// Dựng bộ phụ kiện theo `look` (xem looks.js). Trả về bốn nhóm riêng (mũ, tai nghe/tai mèo, kính, đồ sau lưng) để
// fruitRig.js đặt từng nhóm theo kiểu thân (co/dịch cho vừa thân gầy); các nhóm có thể rỗng.
export function buildAccessories(look, bodyColor) {
  const hat = new THREE.Group();
  if (look.hat !== 'none') hat.add(buildHat(look.hat));
  const ears = new THREE.Group();
  if (look.ears !== 'none') ears.add(buildEars(look.ears, bodyColor));
  const glasses = new THREE.Group();
  if (look.glasses !== 'none') glasses.add(buildGlasses(look.glasses));
  const back = new THREE.Group();
  if (look.back !== 'none') back.add(buildBack(look.back));
  return { hat, ears, glasses, back };
}
