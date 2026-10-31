import * as THREE from 'three';
import { getStarTexture } from './avatars.js';

const STAR_COUNT = 5;
const STAR_SIZE = 0.26;
const RING_RADIUS = 0.42;
const RING_CENTER = new THREE.Vector3(0, 0.3, -1.1); // trong hệ toạ độ camera: hơi cao hơn tầm nhìn, cách mắt ~1 m
const RING_TILT = 0.6; // rad: nghiêng vòng để nửa gần camera thấp xuống, nửa xa cao lên (như nhìn từ trên xuống)
const ORBIT_PERIOD = 1.1; // giây mỗi vòng

// Vòng sao 3D gắn vào camera của người bị choáng. Sao là vật thể thật trong không gian, nên có phối cảnh
// (sao gần to, sao xa nhỏ) và che nhau đúng thứ tự, thay vì giả bằng hình 2D phủ lên màn hình.
// Camera phải nằm trong scene (scene.add(camera)) thì các con của nó mới được vẽ.
export class StunRing {
  constructor(camera) {
    this.tilt = new THREE.Group();
    this.tilt.position.copy(RING_CENTER);
    this.tilt.rotation.x = RING_TILT;
    this.ring = new THREE.Group();
    this.tilt.add(this.ring);

    // Luôn vẽ đè lên mọi thứ (kể cả khi đứng sát tường); thứ tự giữa các sao do độ sâu quyết định
    const material = new THREE.SpriteMaterial({ map: getStarTexture(), depthTest: false, depthWrite: false });
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const a = (i * Math.PI * 2) / STAR_COUNT;
      const star = new THREE.Sprite(material);
      star.scale.set(STAR_SIZE, STAR_SIZE, 1);
      star.position.set(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS);
      star.renderOrder = 999;
      this.ring.add(star);
      this.stars.push(star);
    }

    this.tilt.visible = false;
    camera.add(this.tilt);
  }

  show() {
    this.tilt.visible = true;
  }

  hide() {
    this.tilt.visible = false;
  }

  update(nowMs) {
    const t = nowMs / 1000;
    this.ring.rotation.y = (t * Math.PI * 2) / ORBIT_PERIOD;
    // mỗi sao nhấp nhô lên xuống nhẹ cho sinh động
    this.stars.forEach((star, i) => {
      star.position.y = Math.sin(t * 6 + i * 1.3) * 0.04;
    });
  }
}
