import * as THREE from 'three';

// Kích thước phòng (đơn vị: mét)
export const ROOM = { minX: -10, maxX: 10, minZ: -15, maxZ: 12, height: 9 };
export const SCREEN = { width: 12.8, height: 7.2, y: 4.8, z: -14.9 }; // 16:9

// Độ sáng mỗi đèn trần (tăng/giảm ở đây nếu thấy tối/sáng quá)
const CEILING_LIGHT_INTENSITY = 60;

const ROWS = 6;
const ROW_DEPTH = 2;
const ROW_RISE = 0.4;
const ROWS_START_Z = -1; // hàng đầu bắt đầu từ đây

// Độ cao sàn tại vị trí (x, z) — dùng để camera/avatar bước lên bậc
export function floorHeight(z) {
  if (z < ROWS_START_Z) return 0;
  const i = Math.min(ROWS - 1, Math.floor((z - ROWS_START_Z) / ROW_DEPTH));
  return (i + 1) * ROW_RISE;
}

export function buildCinema(scene) {
  const darkWall = new THREE.MeshStandardMaterial({ color: 0x15151a });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22 });
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x24242c });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x7a1f2b });

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

  // 4 bức tường (mặt trong hướng vào phòng)
  const wall = (width, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, ROOM.height), darkWall);
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
  const seatXs = [];
  for (let x = -7; x <= 7; x++) if (x !== 0) seatXs.push(x); // chừa lối đi giữa
  const rowZMax = ROOM.maxZ;

  for (let i = 0; i < ROWS; i++) {
    const z0 = ROWS_START_Z + i * ROW_DEPTH;
    const z1 = i === ROWS - 1 ? rowZMax : z0 + ROW_DEPTH;
    const top = (i + 1) * ROW_RISE;

    const step = new THREE.Mesh(new THREE.BoxGeometry(w, top, z1 - z0), stepMat);
    step.position.set(cx, top / 2, (z0 + z1) / 2);
    scene.add(step);

    const seatZ = z0 + ROW_DEPTH / 2;
    for (const x of seatXs) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), seatMat);
      seat.position.set(x, top + 0.2, seatZ);
      scene.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.12), seatMat);
      back.position.set(x, top + 0.7, seatZ + 0.32);
      scene.add(back);
    }
  }

  // Ánh sáng: mờ tối + hắt từ màn hình
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

  // Đèn trần: 2 cột x 3 hàng, ánh sáng ấm nhẹ
  const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  for (const x of [-5, 5]) {
    for (const z of [-6, 1, 8]) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), fixtureMat);
      fixture.position.set(x, ROOM.height - 0.04, z);
      scene.add(fixture);
      const light = new THREE.PointLight(0xffe2b0, CEILING_LIGHT_INTENSITY, 18, 2);
      light.position.set(x, ROOM.height - 0.6, z);
      scene.add(light);
    }
  }
  const glow = new THREE.PointLight(0xaabbff, 60, 30, 1.5);
  glow.position.set(0, SCREEN.y, SCREEN.z + 2);
  scene.add(glow);

  return { screen };
}
