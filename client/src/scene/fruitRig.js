import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildAccessories } from './accessories.js';
import { DEFAULT_LOOK, FRUITS, KINDS } from './looks.js';

// Nhân vật kiểu hoạt hình robot trái cây, có 4 kiểu (xem KINDS trong looks.js):
//   - "mập": thân tròn mập mặc áo màu trái cây, mặt hồng nhô ra như cửa sổ;
//   - "gầy đầu tròn": đầu tròn to đặt trên thân nhỏ gầy có chân;
// mỗi kiểu có mặt nam (lông mày cau, mắt nhỏ) và mặt nữ (mắt to có mi, má hồng đậm, môi hồng, nơ / tóc).
// Không có xương hay file mô hình: toàn hình học đơn giản; động tác là co giãn/lắc/vung chân theo thời gian (rất nhẹ).
// Khung toạ độ avatar: mặt nhìn về -z, lưng +z, y lên; chân chạm sàn ở y = 0.

export const BASE_GLOW = 0.3; // thân tự sáng nhẹ để phía quay lưng đèn không bị tối sầm (nói thì sáng hơn, xem avatars.js)
const SEATED_SQUASH = 0.8; // ngồi thì thân thấp xuống một chút
const SKIN = 0xffd9c4;

// Số đo từng kiểu thân (mét). Mọi toạ độ mặt đều tính theo kiểu, riêng phụ kiện (accessories.js) được dựng theo
// thân mập rồi co/dịch cho vừa kiểu gầy (mục acc: s = tỉ lệ, y/z = dịch).
const SHAPES = {
  chubby: {
    lift: 0.1, // thân nâng lên khỏi mặt sàn để lộ chân
    body: { cy: 0.53, rx: 0.47, ry: 0.56, rz: 0.45 },
    head: null,
    plate: { cy: 0.62, cz: -0.33, rx: 0.3, ry: 0.27, rz: 0.17 }, // nhô ra nhiều hơn để mắt, má, miệng nằm trên da chứ không chìm vào thân
    fs: 1, eyeX: 0.125, eyeY: 0.665, browY: 0.745, cheekX: 0.2, cheekY: 0.56, mouthY: 0.5,
    hip: { x: 0.21, y: 0.2, z: -0.12, len: 0.155 },
    top: 1.19, // đỉnh đầu khi đứng (nhãn tên, sao choáng đặt theo đây)
    acc: { hat: { s: 1, y: 0, z: 0 }, ears: { s: 1, y: 0, z: 0 }, glasses: { s: 1, y: 0, z: 0 }, back: { s: 1, y: 0, z: 0 } },
    topper: { s: 1, y: 0 },
    hands: { scale: 0.66, restX: 0.55, forward: 0.14 },
    seatForward: -0.17, // ngồi thì dịch thân ra trước để lưng không lòi ra sau lưng ghế
    seeds: true,
  },
  slim: {
    lift: 0,
    body: { cy: 0.4, rx: 0.17, ry: 0.24, rz: 0.15 },
    head: { cy: 0.84, r: 0.31 },
    plate: { cy: 0.85, cz: -0.24, rx: 0.2, ry: 0.18, rz: 0.09 },
    fs: 0.7, eyeX: 0.088, eyeY: 0.875, browY: 0.945, cheekX: 0.14, cheekY: 0.8, mouthY: 0.765,
    hip: { x: 0.09, y: 0.19, z: -0.04, len: 0.145 },
    top: 1.15,
    acc: { hat: { s: 0.85, y: 0.25, z: 0 }, ears: { s: 0.7, y: 0.378, z: 0 }, glasses: { s: 0.7, y: 0.41, z: 0.015 }, back: { s: 0.6, y: 0.07, z: -0.09 } },
    topper: { s: 0.8, y: 0.28 },
    hands: { scale: 0.6, restX: 0.3, forward: 0.06 },
    seatForward: -0.1,
    seeds: false,
  },
};

const unitSphere = new THREE.SphereGeometry(1, 24, 18);
const g = {
  eye: new THREE.SphereGeometry(1, 10, 8),
  cheek: new THREE.CircleGeometry(1, 12),
  brow: new THREE.BoxGeometry(1, 1, 0.02),
  lash: new THREE.BoxGeometry(1, 1, 0.012),
  leg: new THREE.CylinderGeometry(0.028, 0.034, 1, 8),
  foot: new THREE.SphereGeometry(1, 10, 8),
  stem: new THREE.CylinderGeometry(0.018, 0.024, 0.14, 6),
  leaf: new THREE.SphereGeometry(1, 10, 6),
  cone: new THREE.ConeGeometry(0.05, 0.2, 5),
  bowWing: new THREE.ConeGeometry(0.06, 0.12, 6),
  bun: new THREE.SphereGeometry(1, 10, 8),
  hair: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.38),
};
const m = {
  skin: new THREE.MeshLambertMaterial({ color: SKIN, emissive: SKIN, emissiveIntensity: 0.55 }), // tự sáng thêm: mặt quay về phía tối vẫn rõ
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  dark: new THREE.MeshBasicMaterial({ color: 0x15151a }),
  cheekF: new THREE.MeshBasicMaterial({ color: 0xff5f88, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  foot: new THREE.MeshLambertMaterial({ color: 0x5a4636 }),
  leg: new THREE.MeshLambertMaterial({ color: SKIN, emissive: SKIN, emissiveIntensity: 0.4 }),
  stem: new THREE.MeshLambertMaterial({ color: 0x6b4a2b }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x3fae3f, side: THREE.DoubleSide }),
  seed: new THREE.MeshLambertMaterial({ color: 0xffe36b }),
  bow: new THREE.MeshLambertMaterial({ color: 0xff5f9c, emissive: 0xff5f9c, emissiveIntensity: 0.3 }),
  hairM: new THREE.MeshLambertMaterial({ color: 0x3a2a1f, side: THREE.DoubleSide }),
  hairF: new THREE.MeshLambertMaterial({ color: 0x7a3b6e, side: THREE.DoubleSide }),
  mouthM: new THREE.MeshBasicMaterial({ color: 0x8c2f3a, side: THREE.DoubleSide }),
  mouthF: new THREE.MeshBasicMaterial({ color: 0xe0446a, side: THREE.DoubleSide }),
};

// Miệng (tính cho cỡ mặt của thân mập, nhân fs cho thân gầy). Khi nói đổi hình: tròn, vuông, dấu "-"; hình cuối (khi im)
// là nụ cười cong nhỏ.
const MOUTH_SPEAK = [
  { round: true, r: 0.05 },
  { w: 0.1, h: 0.085 },
  { w: 0.15, h: 0.03 },
];
// Mỗi hình kèm nửa rộng / nửa cao (hw, hh) để đặt cho khỏi chìm vào mặt
function makeMouthGeos(fs) {
  const geos = MOUTH_SPEAK.map((s) =>
    s.round
      ? { geom: new THREE.CircleGeometry(s.r * fs, 16), hw: s.r * fs, hh: s.r * fs }
      : { geom: new THREE.PlaneGeometry(s.w * fs, s.h * fs), hw: (s.w * fs) / 2, hh: (s.h * fs) / 2 }
  );
  geos.push({ geom: new THREE.TorusGeometry(0.065 * fs, 0.012 * fs, 6, 16, Math.PI), hw: 0.065 * fs, hh: 0.03 * fs }); // nụ cười
  return geos;
}

// Gộp các mảnh CÙNG chất liệu của một nhóm thành một mesh mỗi chất liệu (vị trí/xoay/tỉ lệ từng mảnh được áp sẵn vào hình,
// chất liệu giữ nguyên nên hình y hệt, chỉ ít lệnh vẽ hơn). Hình gộp lưu lại dùng chung cho mọi nhân vật cùng khoá.
const mergedCache = new Map();
function mergedParts(key, build) {
  let parts = mergedCache.get(key);
  if (!parts) {
    const root = build();
    root.updateMatrixWorld(true);
    const byMaterial = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const part = o.geometry.clone();
      part.applyMatrix4(o.matrixWorld);
      if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
      byMaterial.get(o.material).push(part);
    });
    parts = [...byMaterial].map(([material, list]) => {
      const geometry = list.length > 1 ? mergeGeometries(list) : list[0];
      if (list.length > 1) list.forEach((p) => p.dispose());
      return [material, geometry];
    });
    mergedCache.set(key, parts);
  }
  const group = new THREE.Group();
  for (const [material, geometry] of parts) group.add(new THREE.Mesh(geometry, material));
  return group;
}

// Một hình (geometry gốc) đặt sẵn vào vị trí / xoay z / tỉ lệ như một Mesh con, để gộp với các hình khác
const partMatrix = new THREE.Matrix4();
const partQuat = new THREE.Quaternion();
const partEuler = new THREE.Euler();
function placedGeometry(base, scale, position, rotZ = 0) {
  const geometry = base.clone();
  partQuat.setFromEuler(partEuler.set(0, 0, rotZ));
  geometry.applyMatrix4(partMatrix.compose(new THREE.Vector3(...position), partQuat, new THREE.Vector3(...scale)));
  return geometry;
}
const mergeList = (list) => {
  const merged = list.length > 1 ? mergeGeometries(list) : list[0];
  if (list.length > 1) list.forEach((p) => p.dispose());
  return merged;
};

// Hạt dâu: gộp thành một hình duy nhất rải trên thân (trừ vùng mặt)
let seedGeo = null;
function getSeedGeo(body) {
  if (seedGeo) return seedGeo;
  const parts = [];
  for (let i = 0; i < 22; i++) {
    const theta = i * 2.399963; // góc vàng: rải đều
    const dy = -0.75 + (i / 21) * 1.5; // -0.75 .. 0.75
    const r = Math.sqrt(1 - dy * dy);
    const dx = r * Math.cos(theta);
    const dz = r * Math.sin(theta);
    if (dz < -0.35 && dy > -0.2) continue; // vùng mặt
    const s = new THREE.SphereGeometry(1, 6, 4);
    s.scale(0.018, 0.03, 0.018);
    s.translate(body.rx * dx * 1.005, body.cy + body.ry * dy * 1.005, body.rz * dz * 1.005);
    parts.push(s);
  }
  seedGeo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return seedGeo;
}

// Phần trang trí trên đỉnh thân theo loại trái cây (toạ độ theo thân mập, đỉnh ở 1.09)
function buildTopper(fruit) {
  const grp = new THREE.Group();
  const leaf = (sx, sy, sz, x, y, z, rz = 0, ry = 0) => {
    const l = new THREE.Mesh(g.leaf, m.leaf);
    l.scale.set(sx, sy, sz);
    l.position.set(x, y, z);
    l.rotation.set(0, ry, rz);
    grp.add(l);
  };
  const stem = (x, y, z, tilt = 0) => {
    const s = new THREE.Mesh(g.stem, m.stem);
    s.position.set(x, y, z);
    s.rotation.z = tilt;
    grp.add(s);
  };
  switch (fruit) {
    case 'apple':
      stem(0, 1.14, 0, 0.15);
      leaf(0.11, 0.018, 0.06, 0.1, 1.18, 0, -0.45);
      break;
    case 'orange':
      leaf(0.2, 0.03, 0.12, 0.04, 1.1, -0.03, 0.22, 0.25); // lá to nằm nghiêng trên đỉnh như trong phim
      stem(0, 1.1, 0.02, 0);
      break;
    case 'banana':
      stem(0, 1.13, 0, 0.1);
      break;
    case 'strawberry':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = new THREE.Mesh(g.cone, m.leaf);
        c.position.set(Math.cos(a) * 0.1, 1.08, Math.sin(a) * 0.1);
        c.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15);
        grp.add(c);
      }
      stem(0, 1.13, 0, 0);
      break;
    case 'grape':
      stem(0, 1.14, 0, -0.12);
      leaf(0.1, 0.016, 0.06, -0.09, 1.17, 0, 0.4);
      leaf(0.1, 0.016, 0.06, 0.09, 1.17, 0, -0.4);
      break;
    case 'peach':
      leaf(0.1, 0.018, 0.055, -0.07, 1.12, 0, 0.5, 0.2);
      leaf(0.1, 0.018, 0.055, 0.07, 1.12, 0, -0.5, -0.2);
      break;
    case 'lime':
      stem(0, 1.12, 0, 0);
      leaf(0.09, 0.016, 0.05, 0.08, 1.15, 0, -0.35);
      break;
    default: // none: mầm nhỏ
      leaf(0.07, 0.014, 0.04, -0.05, 1.11, 0, 0.5);
      leaf(0.07, 0.014, 0.04, 0.05, 1.11, 0, -0.5);
  }
  return grp;
}

// Nơ cho nhân vật nữ kiểu mập (nằm lệch bên phải trên đỉnh, thế chỗ cho lá/cuống nhỏ)
function buildBow() {
  const grp = new THREE.Group();
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(g.bowWing, m.bow);
    w.position.set(0.2 + side * 0.06, 1.1, -0.05);
    w.rotation.z = (side * -Math.PI) / 2;
    grp.add(w);
  }
  const knot = new THREE.Mesh(g.leaf, m.bow);
  knot.scale.setScalar(0.035);
  knot.position.set(0.2, 1.1, -0.05);
  grp.add(knot);
  return grp;
}

// Mặt: cửa sổ da, mắt, lông mày, má, miệng. Các mảnh tĩnh cùng chất liệu được gộp (xem placedGeometry) cho ít lệnh vẽ:
// tròng trắng gộp một mesh (chớp mắt co y quanh tâm hàng mắt, hai mắt cùng y nên chung một mesh vẫn chớp y như từng mắt riêng),
// đồng tử một mesh, lấp lánh một mesh, lông mày + mi một mesh, má một mesh. Hình gộp lưu theo kiểu nhân vật, dùng chung.
const faceTemplates = new Map();
function faceTemplate(kind, cfg, female) {
  if (faceTemplates.has(kind)) return faceTemplates.get(kind);
  const { plate, fs, eyeX, eyeY, browY, cheekX, cheekY } = cfg;
  const plateZ = (x, y) =>
    plate.cz - plate.rz * Math.sqrt(Math.max(0, 1 - (x / plate.rx) ** 2 - ((y - plate.cy) / plate.ry) ** 2));
  const ew = (female ? 0.082 : 0.075) * fs;
  const eh = (female ? 0.078 : 0.062) * fs;
  const pr = female ? 0.038 : 0.028; // đồng tử to hơn ở mặt nữ
  const pupilY = eyeY - 0.004 * fs;
  const whites = [];
  const pupils = [];
  const shines = [];
  const dark = []; // lông mày + mi
  const cheeks = [];
  for (const side of [-1, 1]) {
    const x = side * eyeX;
    const zEye = plateZ(x, eyeY);
    whites.push(placedGeometry(g.eye, [ew, eh, 0.03 * fs], [x, eyeY, zEye - 0.004]));
    // đồng tử nằm ngay trên mặt trước tròng trắng (tròng trắng dày 0.03 * fs); đặt thấp hơn thì bị chìm mất
    pupils.push(placedGeometry(g.eye, [pr * fs, pr * 1.15 * fs, 0.012 * fs], [x - side * 0.012 * fs, pupilY, zEye - 0.004 - 0.028 * fs]));
    if (female) {
      shines.push(placedGeometry(g.eye, [0.012 * fs, 0.012 * fs, 0.012 * fs], [x + side * 0.01 * fs, eyeY + 0.016 * fs, zEye - 0.004 - 0.036 * fs]));
      // mi: ba nét nhỏ ở đuôi mắt phía ngoài
      for (let i = 0; i < 3; i++) {
        const a = 0.35 + i * 0.35;
        dark.push(placedGeometry(g.lash, [0.03 * fs, 0.008 * fs, 1], [x + side * (ew * 0.8 + 0.012 * fs + i * 0.004 * fs), eyeY + eh * (0.45 + i * 0.28), zEye - 0.012 * fs], side * a));
      }
    }
    if (female) {
      // mày dịu: đầu trong hơi cao
      dark.push(placedGeometry(g.brow, [0.08 * fs, 0.014 * fs, 1], [x, browY + 0.02 * fs, plateZ(x, browY) - 0.006], -side * 0.12));
      const cx = side * cheekX;
      cheeks.push(placedGeometry(g.cheek, [0.06 * fs, 0.06 * fs, 0.06 * fs], [cx, cheekY, plateZ(cx, cheekY) - 0.004]));
    } else {
      // đầu trong thấp hơn: hơi cau mày
      dark.push(placedGeometry(g.brow, [0.11 * fs, 0.022 * fs, 1], [x, browY, plateZ(x, browY) - 0.006], side * 0.3));
    }
  }
  // dịch hình về tâm y của hàng mắt, để co y (chớp mắt) quanh đúng tâm
  const whitesGeo = mergeList(whites).translate(0, -eyeY, 0);
  const pupilsGeo = mergeList(pupils).translate(0, -pupilY, 0);
  const template = {
    plateZ,
    pupilY,
    whitesGeo,
    pupilsGeo,
    shineGeo: shines.length ? mergeList(shines) : null,
    darkGeo: mergeList(dark),
    cheekGeo: cheeks.length ? mergeList(cheeks) : null,
  };
  faceTemplates.set(kind, template);
  return template;
}

// Trả về { group, eyes, mouthMeshes }
function buildFace(cfg, female, kind) {
  const { plate, fs, eyeY, mouthY } = cfg;
  const t = faceTemplate(kind, cfg, female);
  const group = new THREE.Group();
  const p = new THREE.Mesh(unitSphere, m.skin);
  p.scale.set(plate.rx, plate.ry, plate.rz);
  p.position.set(0, plate.cy, plate.cz);
  group.add(p);

  const whites = new THREE.Mesh(t.whitesGeo, m.white);
  whites.position.y = eyeY;
  const pupils = new THREE.Mesh(t.pupilsGeo, m.dark);
  pupils.position.y = t.pupilY;
  group.add(whites, pupils, new THREE.Mesh(t.darkGeo, m.dark));
  if (t.shineGeo) group.add(new THREE.Mesh(t.shineGeo, m.white));
  if (t.cheekGeo) group.add(new THREE.Mesh(t.cheekGeo, m.cheekF));
  const eyes = [[whites, 1], [pupils, 1]];

  const mouthMat = female ? m.mouthF : m.mouthM;
  const mouthMeshes = makeMouthGeos(fs).map(({ geom, hw, hh }, i, all) => {
    const mesh = new THREE.Mesh(geom, mouthMat);
    const isSmile = i === all.length - 1;
    const my = mouthY + (isSmile ? 0.03 * fs : 0);
    // chỗ nhô ra nhiều nhất của mặt trong phạm vi hình (mép trên và hai đầu) quyết định độ nhô của miệng
    const zFront = Math.min(t.plateZ(0, my + hh), t.plateZ(0, my - hh), t.plateZ(hw, my), t.plateZ(-hw, my), t.plateZ(0, my));
    mesh.position.set(0, my, zFront - 0.006);
    if (isSmile) mesh.rotation.z = Math.PI; // nửa vòng dưới = nụ cười
    mesh.visible = isSmile;
    group.add(mesh);
    return mesh;
  });
  return { group, eyes, mouthMeshes };
}

// Tạo một nhân vật. baseColor: màu người chơi chọn lúc đăng nhập (dùng khi không chọn trái cây hay màu thân).
// kind: một khoá của KINDS (looks.js); đổi kiểu thì phải tạo lại.
export function createFruit(baseColor, kind = 'chubby_m') {
  const { shape, gender } = KINDS[kind] ?? KINDS.chubby_m;
  const kindKey = KINDS[kind] ? kind : 'chubby_m';
  const cfg = SHAPES[shape];
  const female = gender === 'f';
  const wrap = new THREE.Group(); // main.js co giãn x/z nhóm này; y do pose() lo
  const upper = new THREE.Group(); // thân + đầu + mặt + phụ kiện, nâng lên khỏi sàn cho lộ chân
  upper.position.y = cfg.lift;
  wrap.add(upper);

  const bodyMat = new THREE.MeshLambertMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: BASE_GLOW });
  const body = new THREE.Mesh(unitSphere, bodyMat);
  body.scale.set(cfg.body.rx, cfg.body.ry, cfg.body.rz);
  body.position.y = cfg.body.cy;
  upper.add(body);
  let headMesh = null;
  if (cfg.head) {
    headMesh = new THREE.Mesh(unitSphere, bodyMat); // đầu tròn cùng màu "mũ trùm" với thân
    headMesh.scale.setScalar(cfg.head.r);
    headMesh.position.y = cfg.head.cy;
    upper.add(headMesh);
  }

  const { group: face, eyes, mouthMeshes } = buildFace(cfg, female, kindKey);
  upper.add(face);

  // Chân: mỗi chân là một nhóm xoay quanh hông, bàn chân bé xíu ở cuối; đi thì vung luân phiên
  const hips = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * cfg.hip.x, cfg.hip.y, cfg.hip.z);
    const leg = new THREE.Mesh(g.leg, m.leg);
    leg.scale.y = cfg.hip.len;
    leg.position.y = -cfg.hip.len / 2;
    const foot = new THREE.Mesh(g.foot, m.foot);
    foot.scale.set(0.1, 0.06, 0.15);
    foot.position.set(0, -cfg.hip.len, -0.07);
    hip.add(leg, foot);
    wrap.add(hip);
    return hip;
  });

  // Phần đổi theo look: trang trí trên đầu, tóc, hạt dâu, phụ kiện
  let topper = null;
  let hair = null;
  let seeds = null;
  let acc = null;
  let faceVisible = true;
  let hatOn = false;
  let currentColor = baseColor;

  const placed = (obj, t) => {
    const holder = new THREE.Group();
    holder.scale.setScalar(t.s);
    holder.position.set(0, t.y, t.z ?? 0);
    holder.add(obj);
    return holder;
  };

  // Tóc cho kiểu gầy: mũ tóc phủ đỉnh và sau đầu (chừa cửa sổ mặt), nữ thêm hai búi hai bên
  function buildHair() {
    const grp = new THREE.Group();
    const mat = female ? m.hairF : m.hairM;
    const cap = new THREE.Mesh(g.hair, mat);
    cap.scale.setScalar(cfg.head.r * 1.07);
    cap.position.set(0, cfg.head.cy, 0.02);
    cap.rotation.x = 0.35; // nghiêng ra sau: phía trước chỉ phủ trán
    grp.add(cap);
    if (female) {
      for (const side of [-1, 1]) {
        const bun = new THREE.Mesh(g.bun, mat);
        bun.scale.setScalar(0.085);
        bun.position.set(side * 0.27, cfg.head.cy + 0.13, 0.04);
        grp.add(bun);
      }
    }
    return grp;
  }

  function bodyColorFor(look) {
    if (look.shirt !== 'same') return look.shirt;
    return FRUITS[look.fruit]?.color ?? baseColor;
  }

  function setLook(look = DEFAULT_LOOK) {
    for (const o of [topper, hair, seeds, acc?.hat, acc?.ears, acc?.glasses, acc?.back]) o?.parent?.remove(o);
    currentColor = bodyColorFor(look);
    bodyMat.color.set(currentColor);
    bodyMat.emissive.copy(bodyMat.color);
    hatOn = look.hat !== 'none';
    // chỗ trang trí trên đầu: nơ (nữ, thân mập) hoặc lá/cuống; có mũ thì mũ thay cho các thứ này
    topper = placed(female && shape === 'chubby' ? mergedParts('bow', buildBow) : mergedParts(`topper:${look.fruit}`, () => buildTopper(look.fruit)), cfg.topper);
    topper.visible = faceVisible && !hatOn;
    upper.add(topper);
    hair = null;
    if (shape === 'slim') {
      hair = mergedParts(`hair:${kindKey}`, buildHair);
      hair.visible = faceVisible;
      upper.add(hair);
    }
    seeds = null;
    if (look.fruit === 'strawberry' && cfg.seeds) {
      seeds = new THREE.Mesh(getSeedGeo(cfg.body), m.seed);
      upper.add(seeds);
    }
    const a = buildAccessories(look, bodyMat.color.getHex());
    acc = {
      hat: placed(a.hat, cfg.acc.hat),
      ears: placed(a.ears, cfg.acc.ears),
      glasses: placed(a.glasses, cfg.acc.glasses),
      back: placed(a.back, cfg.acc.back),
    };
    acc.hat.visible = acc.ears.visible = acc.glasses.visible = faceVisible;
    upper.add(acc.hat, acc.ears, acc.glasses, acc.back);
  }
  setLook(DEFAULT_LOOK);

  let blink = 0; // > 0: đang chớp mắt
  let nextBlink = 1 + Math.random() * 3;

  return {
    wrap,
    bodyMat,
    mouthMeshes,
    kind,
    top: cfg.top,
    hands: cfg.hands,
    get color() {
      return currentColor;
    },
    setLook,
    // Hiện/ẩn mặt, đầu và mọi thứ trên đầu (góc nhìn thứ nhất: camera nằm trong thân/đầu nên phải ẩn)
    get faceVisible() {
      return faceVisible;
    },
    setFaceVisible(v) {
      faceVisible = v;
      face.visible = v;
      if (headMesh) headMesh.visible = v;
      if (topper) topper.visible = v && !hatOn;
      if (hair) hair.visible = v;
      if (acc) acc.hat.visible = acc.ears.visible = acc.glasses.visible = v;
    },
    // Mỗi khung hình: nhún khi đi, vung chân, lắc khi nhảy/choáng, thở nhẹ, chớp mắt
    pose({ dt, time, walkPhase, walkAmp, seated, stunned, dancing }) {
      let lift = Math.abs(Math.sin(walkPhase)) * 0.05 * walkAmp;
      let roll = Math.sin(walkPhase) * 0.07 * walkAmp;
      if (dancing && !seated) {
        lift += Math.abs(Math.sin(time * 6)) * 0.08;
        roll += Math.sin(time * 6) * 0.1;
      }
      if (stunned) roll += Math.sin(time * 18) * 0.18;
      const breathe = 1 + Math.sin(time * 2.2) * 0.02;
      const squash = 1 - Math.abs(Math.cos(walkPhase)) * 0.03 * walkAmp;
      wrap.position.y = seated ? 0 : lift;
      wrap.position.z = seated ? cfg.seatForward : 0;
      wrap.rotation.z = roll;
      wrap.scale.y = (seated ? SEATED_SQUASH : 1) * breathe * squash;
      upper.position.y = seated ? 0 : cfg.lift; // ngồi thì hạ thân xuống sát nệm
      hips.forEach((hip, i) => {
        const phase = walkPhase + i * Math.PI;
        hip.rotation.x = Math.sin(phase) * 0.55 * walkAmp; // chân vung tới/lui
      });
      blink -= dt;
      if (blink <= -nextBlink) {
        blink = 0.12;
        nextBlink = 2 + Math.random() * 4;
      }
      const open = blink > 0 ? 0.12 : 1;
      for (const [e, sy] of eyes) e.scale.y = sy * open;
    },
    dispose() {
      bodyMat.dispose();
    },
  };
}
