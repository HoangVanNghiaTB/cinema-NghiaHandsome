import * as THREE from 'three';
import { TRASH_TIERS, TRASH_PICK_RANGE } from '../economy.js';
import { floorHeight } from './cinema.js';

// Rác trong rạp: viên nhàu nhỏ xoay nhẹ, màu theo loại (càng quý càng sáng), có quầng sáng quanh viên rác và vệt sáng trên sàn
// để dễ thấy. Tối đa vài món cùng lúc, dùng chung hình khối và vật liệu nên rất nhẹ.
const ballGeometry = new THREE.IcosahedronGeometry(0.13, 0);
const haloGeometry = new THREE.SphereGeometry(0.34, 12, 8);
const poolGeometry = new THREE.CircleGeometry(0.55, 20);
const additive = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
const materials = new Map(
  TRASH_TIERS.map((t) => [t.pts, { ball: new THREE.MeshBasicMaterial({ color: t.color }), halo: additive(t.color, 0.22), pool: additive(t.color, 0.35) }]),
);

export class Trash {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // id -> { group, ball, x, z, baseY }
  }

  add({ id, x, z, pts }) {
    if (this.items.has(id)) return;
    const m = materials.get(pts) ?? materials.get(TRASH_TIERS[0].pts);
    const group = new THREE.Group();
    const baseY = floorHeight(x, z);
    group.position.set(x, baseY, z);
    const ball = new THREE.Mesh(ballGeometry, m.ball);
    ball.position.y = 0.3;
    const halo = new THREE.Mesh(haloGeometry, m.halo);
    halo.position.y = 0.3;
    const pool = new THREE.Mesh(poolGeometry, m.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.02;
    group.add(ball, halo, pool);
    this.scene.add(group);
    this.items.set(id, { group, ball, x, z });
  }

  remove(id) {
    const t = this.items.get(id);
    if (!t) return;
    this.scene.remove(t.group);
    this.items.delete(id);
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  set(list) {
    this.clear();
    for (const t of list ?? []) this.add(t);
  }

  // Gọi mỗi khung hình: xoay / nhấp nhô
  update(time) {
    for (const [id, t] of this.items) {
      t.ball.rotation.y = time * 2;
      t.ball.position.y = 0.3 + Math.sin(time * 3 + id) * 0.06;
    }
  }

  // Id món rác gần nhất trong tầm nhặt quanh (px, pz), hoặc null
  nearest(px, pz) {
    let best = null;
    let bestD = TRASH_PICK_RANGE;
    for (const [id, t] of this.items) {
      const d = Math.hypot(px - t.x, pz - t.z);
      if (d <= bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }
}
