import * as THREE from 'three';

// Pháo giấy: một đợt hạt giấy nhiều màu bắn từ người lên phía trên đầu rồi tan biến (không rơi xuống sàn).
// Tối giản để không tụt FPS: tất cả hạt nằm trong MỘT đối tượng Points (một lệnh vẽ), dùng chung cho mọi đợt.
// Hạt hết đời thì tối dần về đen (cộng sáng: đen = vô hình) nên không cần xử lý độ trong suốt.
// Không có hạt nào sống thì không vẽ và không tính gì cả.

const PALETTE = [0xff4f8b, 0xffd400, 0x4fd1ff, 0x7dff6b, 0xb06bff, 0xff8a3d];
const LIFE_MIN = 0.7; // giây
const LIFE_MAX = 1.1;
const GRAVITY = 2.5; // nhỏ, để hạt kịp bay lên và biến mất trước khi rơi xuống

export class Confetti {
  // perBurst: số hạt mỗi đợt (máy yếu dùng ít); maxParticles: trần tổng số hạt cùng lúc (các đợt chồng nhau)
  constructor(scene, { perBurst = 40, maxParticles = 400 } = {}) {
    this.perBurst = perBurst;
    this.max = maxParticles;
    this.next = 0; // vị trí hạt tiếp theo sẽ dùng (xoay vòng)
    this.alive = 0;

    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3); // màu hiện tại (đã nhân độ mờ dần)
    this.base = new Float32Array(maxParticles * 3); // màu gốc
    this.vel = new Float32Array(maxParticles * 3);
    this.age = new Float32Array(maxParticles).fill(Infinity);
    this.life = new Float32Array(maxParticles).fill(1);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({
      size: 0.1, sizeAttenuation: true, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false; // hạt di chuyển nên hộp bao quanh ban đầu không đúng
    this.points.visible = false;
    scene.add(this.points);
  }

  // Bắn một đợt từ (x, y, z): thường là ngực của người bắn. Hạt bay lên phía trên đầu, toả nhẹ sang hai bên.
  burst(x, y, z) {
    const c = new THREE.Color();
    for (let n = 0; n < this.perBurst; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const p = i * 3;
      this.positions[p] = x + (Math.random() - 0.5) * 0.2;
      this.positions[p + 1] = y + Math.random() * 0.1;
      this.positions[p + 2] = z + (Math.random() - 0.5) * 0.2;
      this.vel[p] = (Math.random() - 0.5) * 2.4;
      this.vel[p + 1] = 3 + Math.random() * 2.5; // chủ yếu bay lên
      this.vel[p + 2] = (Math.random() - 0.5) * 2.4;
      c.set(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      this.base[p] = c.r;
      this.base[p + 1] = c.g;
      this.base[p + 2] = c.b;
      this.age[i] = 0;
      this.life[i] = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
    }
    this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return; // không có hạt nào: không tốn gì
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const p = i * 3;
      if (this.age[i] >= this.life[i]) {
        this.colors[p] = this.colors[p + 1] = this.colors[p + 2] = 0; // hết đời: tắt hẳn
        continue;
      }
      alive++;
      this.vel[p + 1] -= GRAVITY * dt;
      this.positions[p] += this.vel[p] * dt;
      this.positions[p + 1] += this.vel[p + 1] * dt;
      this.positions[p + 2] += this.vel[p + 2] * dt;
      const fade = 1 - this.age[i] / this.life[i]; // tối dần về đen
      this.colors[p] = this.base[p] * fade;
      this.colors[p + 1] = this.base[p + 1] * fade;
      this.colors[p + 2] = this.base[p + 2] * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (alive === 0) this.points.visible = false;
  }
}
