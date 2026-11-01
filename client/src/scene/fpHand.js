import * as THREE from 'three';

// Bàn tay nhìn từ mắt mình khi mình tát: hiện ra ở góc dưới bên phải màn hình, vung sang giữa rồi thu về.
// Đơn giản nhất có thể: một quả cầu (bàn tay) và một cánh tay ngắn kéo dài về phía góc dưới bên phải.
// Gắn vào camera nên đi theo hướng nhìn; camera phải nằm trong scene (scene.add(camera)) thì mới được vẽ.

const SWING_MS = 400;
const SKIN = 0xf2c9a0;

// Vị trí bàn tay trong hệ toạ độ camera (nhìn về -z): lúc vung ra xa nhất và lúc nghỉ (ngoài mép màn hình)
const REST = new THREE.Vector3(0.55, -0.4, -0.7);
const STRIKE = new THREE.Vector3(-0.08, -0.05, -1.05); // xa hơn một chút cho bàn tay nhỏ lại, khỏi che hết màn hình

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class FirstPersonHand {
  constructor(camera) {
    // depthTest tắt + renderOrder cao: luôn vẽ đè lên mọi thứ, kể cả khi đứng sát tường
    const mat = new THREE.MeshBasicMaterial({ color: SKIN, depthTest: false });
    this.hand = new THREE.Group();

    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), mat);
    palm.renderOrder = 1000;

    // cánh tay: hình trụ mảnh đi từ bàn tay về phía góc dưới bên phải, phía sau camera một chút
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.3, 10), mat); // đủ dài để chạy ra ngoài mép màn hình
    const back = new THREE.Vector3(0.5, -0.45, 0.45).normalize();
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), back);
    arm.position.copy(back).multiplyScalar(0.65);
    arm.renderOrder = 1000;

    this.hand.add(palm, arm);
    this.hand.visible = false;
    camera.add(this.hand);
    this.start = null;
  }

  swing() {
    this.start = performance.now();
    this.hand.visible = true;
  }

  cancel() {
    this.start = null;
    this.hand.visible = false;
  }

  update(now) {
    if (this.start === null) return;
    const u = (now - this.start) / SWING_MS;
    if (u >= 1) {
      this.cancel();
      return;
    }
    const strike = 0.4;
    const k = u < strike ? easeOut(u / strike) : 1 - easeInOut((u - strike) / (1 - strike));
    this.hand.position.set(lerp(REST.x, STRIKE.x, k), lerp(REST.y, STRIKE.y, k), lerp(REST.z, STRIKE.z, k));
    this.hand.rotation.z = lerp(0, 0.5, k); // hơi nghiêng khi vung
  }
}
