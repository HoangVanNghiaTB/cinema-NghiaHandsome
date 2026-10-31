import * as THREE from 'three';

// Kích thước phòng (đơn vị: mét)
export const ROOM = { minX: -10, maxX: 10, minZ: -11, maxZ: 7, height: 9 };
export const SCREEN = { width: 12.8, height: 7.2, y: 4.8, z: ROOM.minZ + 0.1 }; // 16:9, sát tường trước

// Độ sáng mỗi đèn trần (tăng/giảm ở đây nếu thấy tối/sáng quá)
const CEILING_LIGHT_INTENSITY = 60;

// Ánh sáng nền chiếu đều cả phòng, kể cả gần màn hình nơi đèn trần không với tới.
// 0.2 cũ + thêm ~1/10 độ sáng một đèn trần ở khoảng cách ghế (~60 / 8² ≈ 0.94, 1/10 ≈ 0.09)
const AMBIENT_INTENSITY = 0.3;

// Ảnh treo tường sau (file nằm ở client/public)
const WALL_PHOTO_URL = '/wall-photo.jpg';
const WALL_PHOTO_HEIGHT = 1.96; // m; chiều rộng tính theo tỉ lệ ảnh. Bằng nửa kích cỡ lúc treo trên trần (~3.9 m)

// Đèn sân khấu: mỗi sân khấu có một đèn treo ngay trên đầu người hát, chỉ sáng khi có người hát (setStageLight).
// Gồm chùm sáng hình nón + vòng sáng tròn trên sàn sân khấu (giả bằng hình trong suốt cộng sáng, rất nhẹ);
// chế độ chất lượng cao có thêm một SpotLight thật để rọi sáng cả người hát.
const STAGE_LAMP_HEIGHT = 6.2; // m, từ mặt sàn phòng tới đèn
const STAGE_BEAM_RADIUS = 1.0; // m, bán kính chùm sáng chạm sàn sân khấu
const STAGE_POOL_RADIUS = 1.2; // m, bán kính vòng sáng trên sàn
const STAGE_LIGHT_COLOR = 0xfff1d6; // trắng ấm
const STAGE_BEAM_OPACITY = 0.3;
const STAGE_POOL_OPACITY = 0.75;
const STAGE_SPOT_INTENSITY = 50; // cường độ SpotLight thật (chỉ chế độ chất lượng cao)

// Chế độ chất lượng thấp (máy không có tăng tốc đồ hoạ): bỏ đèn trần, bù bằng ánh sáng nền mạnh hơn
const LOW_QUALITY_AMBIENT_INTENSITY = 1.2;

// 18 ghế: 3 hàng, mỗi hàng chia 2 cột (trái/phải) cách nhau lối đi giữa, mỗi cột 3 ghế
const ROWS = 3;
const SEAT_XS = [-3, -2, -1, 1, 2, 3];
const ROW_DEPTH = 2;
const ROW_RISE = 0.4;
const ROWS_START_Z = -1; // hàng đầu bắt đầu từ đây

// Hai sân khấu nhỏ ở hai góc phòng, hai bên màn hình (x âm = bên trái, x dương = bên phải).
// Mỗi sân khấu có 1 mic đứng; người hát đứng sau mic, quay mặt về phía khán giả (ry = π: nhìn về +z).
// Server cũng dùng số lượng này (STAGE_COUNT trong server/index.js).
const STAGE_WIDTH = 3.3;
const STAGE_DEPTH = 3;
const STAGE_HEIGHT = 0.5;

// Màn hình karaoke (nhắc lời) ở mỗi sân khấu: đặt trước mặt người hát, cao ~65% chiều cao người (1.6 m) tính cả chân,
// quay mặt về phía người hát và ngả ra sau cho mặt hướng thẳng vào mắt họ (không phải ngẩng/cúi quá).
// Cỡ ~32 inch (0.71 x 0.40 m): đứng cách ~1.1 m thì chiếm khoảng 1/3 chiều ngang tầm nhìn, đủ to để đọc lời.
const PLAYER_EYE_HEIGHT = 1.6; // khớp EYE_HEIGHT trong main.js
const MONITOR_WIDTH = 0.71;
const MONITOR_HEIGHT = 0.4;
const MONITOR_CENTER_Y = 0.85; // tâm màn hình cao hơn mặt sân khấu; mép trên ~1.05 m = 65% chiều cao người
const MONITOR_DISTANCE = 0.95; // m, từ chỗ người hát ra phía khán giả
// Màn hình đặt lệch sang bên (về phía giữa phòng) để cột mic, nằm thẳng giữa mắt người hát và màn hình, không che.
// Lệch 0.55 m thì cột mic cách mép trong màn hình gần 5 cm theo đường nhìn (kiểm tra bằng tính toán hình học).
const MONITOR_SIDE_OFFSET = 0.55;

export const STAGES = [-1, 1].map((side) => {
  const x = side * 8.25; // nằm ngoài mép màn hình (màn hình rộng ±6.4)
  const z = ROOM.minZ + 0.1 + STAGE_DEPTH / 2; // sát tường trước
  const spotZ = z + 0.1;

  // Màn hình quay thẳng vào mắt người hát: pháp tuyến mặt màn hình hướng từ tâm màn hình tới mắt
  const mx = x - side * MONITOR_SIDE_OFFSET; // sân khấu trái (side -1) lệch sang phải, sân khấu phải lệch sang trái
  const my = STAGE_HEIGHT + MONITOR_CENTER_Y;
  const mz = spotZ + MONITOR_DISTANCE;
  const toEye = new THREE.Vector3(x - mx, STAGE_HEIGHT + PLAYER_EYE_HEIGHT - my, spotZ - mz).normalize();

  return {
    x, z, w: STAGE_WIDTH, d: STAGE_DEPTH, height: STAGE_HEIGHT,
    micX: x, micZ: z + 0.55, // mic ở phía khán giả một chút
    spotX: x, spotZ, // chỗ người hát đứng, ngay sau mic
    ry: Math.PI,
    monitor: {
      x: mx, y: my, z: mz,
      width: MONITOR_WIDTH, height: MONITOR_HEIGHT,
      yaw: Math.atan2(toEye.x, toEye.z), // quay ngang cho mặt màn hình hướng vào người hát
      tilt: Math.asin(toEye.y), // ngả ra sau cho mặt hướng lên đúng tầm mắt (~38°)
    },
  };
});

// Độ cao sàn tại vị trí (x, z) — dùng để camera/avatar bước lên bậc thang và sân khấu
export function floorHeight(x, z) {
  for (const s of STAGES) {
    if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) return s.height;
  }
  if (z < ROWS_START_Z) return 0;
  const i = Math.min(ROWS - 1, Math.floor((z - ROWS_START_Z) / ROW_DEPTH));
  return (i + 1) * ROW_RISE;
}

// Vị trí từng ghế (theo thứ tự hàng rồi cột): x, z là tâm ghế; y là mặt nệm; floorY là mặt bậc bên dưới.
// Server cũng dùng số lượng ghế này (SEAT_COUNT trong server/index.js), nhớ sửa cả hai nếu đổi bố cục.
const CUSHION_HEIGHT = 0.4; // mặt nệm cao hơn mặt bậc
export const SEATS = [];
for (let i = 0; i < ROWS; i++) {
  const floorY = (i + 1) * ROW_RISE;
  const z = ROWS_START_Z + i * ROW_DEPTH + ROW_DEPTH / 2;
  for (const x of SEAT_XS) SEATS.push({ x, y: floorY + CUSHION_HEIGHT, z: z - 0.02, floorY });
}

export function buildCinema(scene, { lowQuality = false } = {}) {
  // Lambert rẻ hơn PBR nhiều khi có nhiều đèn, mà nhìn gần như nhau với bề mặt nhám
  const darkWall = new THREE.MeshLambertMaterial({ color: 0x15151a }); // trần
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2b3a5c }); // tường: xanh navy xám, tương phản với sàn đỏ
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x770000 });
  const stepMat = new THREE.MeshLambertMaterial({ color: 0x24242c });
  const stepEdgeMat = new THREE.MeshBasicMaterial({ color: 0xc9a66b }); // vạch sáng ở mép bậc, không phụ thuộc ánh sáng
  const seatMat = new THREE.MeshLambertMaterial({ color: 0xd9b98a }); // nệm và lưng tựa: màu cát sáng, nổi trên sàn đỏ
  const seatTrimMat = new THREE.MeshLambertMaterial({ color: 0x9aa0ab }); // chân đế, tay vịn: xám sáng, tách khỏi bậc thang tối và sàn đỏ

  const w = ROOM.maxX - ROOM.minX;
  const d = ROOM.maxZ - ROOM.minZ;
  const cx = (ROOM.minX + ROOM.maxX) / 2;
  const cz = (ROOM.minZ + ROOM.maxZ) / 2;

  // Sàn, trần
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), darkWall);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, ROOM.height, cz);
  scene.add(ceiling);

  // Ảnh treo giữa bức tường sau (đối diện màn hình), giữ nguyên tỉ lệ ảnh
  new THREE.TextureLoader().load(WALL_PHOTO_URL, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const aspect = texture.image.width / texture.image.height;
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(WALL_PHOTO_HEIGHT * aspect, WALL_PHOTO_HEIGHT),
      new THREE.MeshBasicMaterial({ map: texture, color: 0xdddddd }) // không phụ thuộc đèn, hơi dịu đi cho khỏi chói
    );
    photo.rotation.y = Math.PI; // quay mặt ảnh về phía màn hình/khán giả
    photo.position.set(cx, ROOM.height / 2, ROOM.maxZ - 0.02); // sát tường, thụt ra chút để không bị chập mặt
    scene.add(photo);
  });

  // 4 bức tường (mặt trong hướng vào phòng)
  const wall = (width, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, ROOM.height), wallMat);
    m.position.set(x, ROOM.height / 2, z);
    m.rotation.y = rotY;
    scene.add(m);
  };
  wall(w, cx, ROOM.minZ, 0); // tường màn hình
  wall(w, cx, ROOM.maxZ, Math.PI); // tường sau
  wall(d, ROOM.minX, cz, Math.PI / 2); // tường trái
  wall(d, ROOM.maxX, cz, -Math.PI / 2); // tường phải

  // Màn hình: "lỗ" trong WebGL (alpha = 0) để lớp CSS3D chứa video hiện xuyên qua
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.width, SCREEN.height),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0,
      blending: THREE.NoBlending,
    })
  );
  screen.position.set(0, SCREEN.y, SCREEN.z);
  scene.add(screen);

  // Bậc thang + ghế
  const seatXs = SEAT_XS;
  const rowZMax = ROOM.maxZ;

  // Mỗi ghế gồm chân đế, nệm ngồi, lưng tựa (hơi ngả) và 2 tay vịn. Dùng InstancedMesh:
  // mỗi bộ phận của toàn bộ ghế chỉ tốn 1 lệnh vẽ
  const seatCount = ROWS * seatXs.length;
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), seatTrimMat, seatCount);
  const cushions = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.15, 0.65), seatMat, seatCount);
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.65, 0.12), seatMat, seatCount);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.2, 0.55), seatTrimMat, seatCount * 2);
  const m = new THREE.Matrix4();
  const backTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0)); // ngả ra sau
  const noRotation = new THREE.Quaternion();
  const oneScale = new THREE.Vector3(1, 1, 1);
  const place = (mesh, index, x, y, z, rotation = noRotation) =>
    mesh.setMatrixAt(index, m.compose(new THREE.Vector3(x, y, z), rotation, oneScale));
  let n = 0;

  for (let i = 0; i < ROWS; i++) {
    const z0 = ROWS_START_Z + i * ROW_DEPTH;
    const z1 = i === ROWS - 1 ? rowZMax : z0 + ROW_DEPTH;
    const top = (i + 1) * ROW_RISE;

    const step = new THREE.Mesh(new THREE.BoxGeometry(w, top, z1 - z0), stepMat);
    step.position.set(cx, top / 2, (z0 + z1) / 2);
    scene.add(step);

    // Vạch sáng dọc mép trước của bậc để nhìn rõ độ cao từng bậc trong phòng tối
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.1), stepEdgeMat);
    edge.position.set(cx, top, z0 + 0.05);
    scene.add(edge);

    const seatZ = z0 + ROW_DEPTH / 2;
    for (const x of seatXs) {
      place(bases, n, x, top + 0.125, seatZ);
      place(cushions, n, x, top + 0.325, seatZ - 0.02);
      place(backs, n, x, top + 0.75, seatZ + 0.28, backTilt);
      place(arms, n * 2, x - 0.39, top + 0.5, seatZ);
      place(arms, n * 2 + 1, x + 0.39, top + 0.5, seatZ);
      n++;
    }
  }
  scene.add(bases, cushions, backs, arms);

  // Sân khấu: bục gỗ có vạch sáng ở mép trước, 1 mic đứng và 2 loa ở 2 góc phía khán giả
  const stageMat = new THREE.MeshLambertMaterial({ color: 0x4a3426 });
  const speakerMat = new THREE.MeshLambertMaterial({ color: 0x17171c });
  const coneMat = new THREE.MeshLambertMaterial({ color: 0x55555e });
  const micMat = new THREE.MeshLambertMaterial({ color: 0x222228 });
  const micHeadMat = new THREE.MeshLambertMaterial({ color: 0xb0b4bc });
  const monitorHoleMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending });
  const speakerGeo = new THREE.BoxGeometry(0.6, 1.1, 0.5);
  const wooferGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20).rotateX(Math.PI / 2); // trục hướng về +z (phía khán giả)
  const tweeterGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16).rotateX(Math.PI / 2);
  const micBaseGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.03, 20);
  const micPoleGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.4, 8);
  const micHeadGeo = new THREE.SphereGeometry(0.045, 12, 8);
  const addMesh = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };

  // Hình dùng chung cho đèn sân khấu: chùm sáng đậm ở đèn rồi nhạt dần xuống sàn; vòng sáng tròn mờ dần ra mép
  const beamTexture = makeVerticalGlowTexture();
  const poolTexture = makeRadialGlowTexture();
  const rodGeo = new THREE.CylinderGeometry(0.015, 0.015, ROOM.height - STAGE_LAMP_HEIGHT, 6);
  const lampBodyGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.35, 16);
  const lensGeo = new THREE.CircleGeometry(0.2, 20).rotateX(Math.PI / 2); // mặt kính hướng xuống
  const LENS_OFF = new THREE.Color(0x2a2a30);
  const LENS_ON = new THREE.Color(STAGE_LIGHT_COLOR);
  const stageLights = []; // theo thứ tự STAGES: { target, level, beam, pool, beamMat, poolMat, lensMat, spot }

  for (const s of STAGES) {
    const top = s.height;
    addMesh(new THREE.BoxGeometry(s.w, top, s.d), stageMat, s.x, top / 2, s.z);
    addMesh(new THREE.BoxGeometry(s.w, 0.04, 0.08), stepEdgeMat, s.x, top, s.z + s.d / 2 - 0.04); // mép trước

    // mic đứng: đế, cột, đầu mic
    addMesh(micBaseGeo, micMat, s.micX, top + 0.015, s.micZ);
    addMesh(micPoleGeo, micMat, s.micX, top + 0.03 + 0.7, s.micZ);
    addMesh(micHeadGeo, micHeadMat, s.micX, top + 1.46, s.micZ);

    // 2 loa ở 2 góc phía khán giả: thùng loa, loa trầm (to) và loa treble (nhỏ) hướng ra phòng
    for (const side of [-1, 1]) {
      const sx = s.x + side * (s.w / 2 - 0.3); // sát mép hơn một chút để chừa chỗ cho màn hình karaoke
      const sz = s.z + s.d / 2 - 0.35;
      addMesh(speakerGeo, speakerMat, sx, top + 0.55, sz);
      addMesh(wooferGeo, coneMat, sx, top + 0.38, sz + 0.265);
      addMesh(tweeterGeo, coneMat, sx, top + 0.85, sz + 0.265);
    }

    // Màn hình karaoke: khung đen + mặt "lỗ" (alpha 0) để hình ở lớp CSS3D hiện xuyên qua, như màn hình to.
    // Không ai hát thì mặt lỗ chỉ thấy nền đen; chỉ người đang hát mới có hình (xem main.js).
    // Nhìn từ phía khán giả chỉ thấy mặt lưng đen của khung.
    const m = s.monitor;
    const tiltGroup = new THREE.Group();
    tiltGroup.position.set(m.x, m.y, m.z);
    tiltGroup.rotation.order = 'YXZ';
    tiltGroup.rotation.set(-m.tilt, m.yaw, 0); // ngả mặt lên trên về phía người hát
    const casing = new THREE.Mesh(new THREE.BoxGeometry(m.width + 0.04, m.height + 0.04, 0.04), micMat);
    casing.position.z = -0.021;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(m.width, m.height), monitorHoleMat);
    tiltGroup.add(casing, face);
    scene.add(tiltGroup);

    // chân đứng: cột và đế tròn, đặt sau lưng màn hình (phía khán giả)
    const poleLength = MONITOR_CENTER_Y - 0.1;
    addMesh(new THREE.CylinderGeometry(0.02, 0.02, poleLength, 10), micMat, m.x, top + poleLength / 2, m.z + 0.06);
    addMesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), micMat, m.x, top + 0.015, m.z + 0.06);

    // Đèn sân khấu: đèn treo bằng 2 thanh từ trần, ngay trên đầu người hát; mặt kính sáng lên khi bật
    const lampY = STAGE_LAMP_HEIGHT;
    for (const dx of [-0.15, 0.15]) addMesh(rodGeo, micMat, s.spotX + dx, (lampY + ROOM.height) / 2 + 0.17, s.spotZ);
    addMesh(lampBodyGeo, micMat, s.spotX, lampY + 0.175, s.spotZ);
    const lensMat = new THREE.MeshBasicMaterial({ color: LENS_OFF });
    addMesh(lensGeo, lensMat, s.spotX, lampY - 0.002, s.spotZ);

    // chùm sáng: hình nón (đỉnh ở đèn, đáy chạm sàn sân khấu). Chỉ vẽ mặt ngoài, nên đứng trong chùm sáng
    // (người hát) không bị phủ một lớp sương mờ lên màn hình
    const beamHeight = lampY - top;
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture, color: STAGE_LIGHT_COLOR, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(STAGE_BEAM_RADIUS, beamHeight, 40, 1, true), beamMat);
    beam.position.set(s.spotX, top + beamHeight / 2, s.spotZ);
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTexture, color: STAGE_LIGHT_COLOR, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(STAGE_POOL_RADIUS, 48).rotateX(-Math.PI / 2), poolMat);
    pool.position.set(s.spotX, top + 0.015, s.spotZ);
    beam.visible = false;
    pool.visible = false;
    scene.add(beam, pool);

    // SpotLight thật rọi xuống người hát (chỉ chế độ chất lượng cao). Luôn có mặt, chỉ đổi cường độ (từ 0),
    // vì thêm/bớt đèn giữa chừng làm trình duyệt phải biên dịch lại cảnh và bị giật.
    let spot = null;
    if (!lowQuality) {
      spot = new THREE.SpotLight(STAGE_LIGHT_COLOR, 0, 0, Math.atan(STAGE_BEAM_RADIUS / beamHeight), 0.45, 2);
      spot.position.set(s.spotX, lampY - 0.1, s.spotZ);
      spot.target.position.set(s.spotX, top + 0.9, s.spotZ);
      scene.add(spot, spot.target);
    }
    stageLights.push({ target: 0, level: 0, beam, pool, beamMat, poolMat, lensMat, spot });
  }

  // Ánh sáng: ít đèn cho nhẹ. Chỉ 2 đèn trần ở cuối phòng (xa màn hình nhất), ánh sáng ấm nhẹ
  scene.add(new THREE.AmbientLight(0xffffff, lowQuality ? LOW_QUALITY_AMBIENT_INTENSITY : AMBIENT_INTENSITY));

  if (lowQuality) {
    // Một đèn hướng rẻ hơn đèn điểm nhiều, đủ để các mặt của ghế/tường có chỗ sáng chỗ tối, nhìn ra khối
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(2, 6, 4);
    scene.add(sun);
  }

  const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  for (const x of [-5, 5]) {
    const z = ROOM.maxZ - 2; // gần tường sau, xa màn hình nhất
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), fixtureMat);
    fixture.position.set(x, ROOM.height - 0.04, z);
    scene.add(fixture);
    if (lowQuality) continue; // chế độ nhẹ: không dùng đèn điểm (tốn tính toán từng điểm ảnh)
    const light = new THREE.PointLight(0xffe2b0, CEILING_LIGHT_INTENSITY, 18, 2);
    light.position.set(x, ROOM.height - 0.6, z);
    scene.add(light);
  }

  return {
    screen,

    // Bật/tắt đèn sân khấu số `index` (sáng/tắt dần êm, xem updateEffects)
    setStageLight(index, on) {
      if (stageLights[index]) stageLights[index].target = on ? 1 : 0;
    },

    // Gọi mỗi khung hình: làm đèn sân khấu sáng lên / tắt đi từ từ
    updateEffects(dt) {
      for (const l of stageLights) {
        if (l.level === l.target) continue;
        l.level += (l.target - l.level) * Math.min(1, dt * 6);
        if (Math.abs(l.target - l.level) < 0.005) l.level = l.target;
        const visible = l.level > 0;
        l.beam.visible = visible;
        l.pool.visible = visible;
        l.beamMat.opacity = STAGE_BEAM_OPACITY * l.level;
        l.poolMat.opacity = STAGE_POOL_OPACITY * l.level;
        l.lensMat.color.copy(LENS_OFF).lerp(LENS_ON, l.level);
        if (l.spot) l.spot.intensity = STAGE_SPOT_INTENSITY * l.level;
      }
    },
  };
}

// Hình chùm sáng: đậm ở trên (gần đèn), nhạt dần xuống dưới. Ghép vào hình nón: phía trên ảnh ứng với đỉnh nón.
function makeVerticalGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255, 244, 214, 1)');
  g.addColorStop(1, 'rgba(255, 244, 214, 0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return new THREE.CanvasTexture(canvas);
}

// Hình vòng sáng tròn: sáng ở tâm, mờ dần ra mép
function makeRadialGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
  g.addColorStop(0.6, 'rgba(255, 244, 214, 0.65)');
  g.addColorStop(1, 'rgba(255, 244, 214, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
