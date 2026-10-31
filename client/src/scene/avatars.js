import * as THREE from 'three';

const BODY_LENGTH = 1.0;
const BODY_RADIUS = 0.3;
const BODY_HEIGHT = BODY_LENGTH + BODY_RADIUS * 2; // ~1.6 m
const SEATED_SCALE = 0.62; // tỉ lệ chiều cao khi ngồi
const SMOOTHING = 12; // càng lớn càng bám sát vị trí mới nhận

function makeNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 128, 34, 240);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
  sprite.scale.set(1.2, 0.3, 1);
  sprite.position.y = BODY_HEIGHT + 0.35;
  return sprite;
}

// Avatar tối giản: viên nhộng màu + khối nhỏ chỉ hướng nhìn + nhãn tên
export class Avatars {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // id -> { group, target: {x,y,z,ry} }
  }

  add({ id, name, color, x = 0, y = 0, z = 0, ry = 0, seat = null }) {
    if (this.items.has(id)) return;
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_RADIUS, BODY_LENGTH, 4, 12),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = BODY_HEIGHT / 2;
    group.add(body);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.1, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    visor.position.set(0, BODY_HEIGHT - 0.25, -BODY_RADIUS);
    group.add(visor);

    const sprite = makeNameSprite(name);
    group.add(sprite);
    group.position.set(x, y, z);
    group.rotation.y = ry;
    this.scene.add(group);
    this.items.set(id, { group, body, visor, sprite, target: { x, y, z, ry } });
    if (seat !== null) this.setSeated(id, true);
  }

  // Ngồi thì thân avatar thấp xuống (nén theo chiều cao), nhãn tên hạ theo
  setSeated(id, seated) {
    const item = this.items.get(id);
    if (!item) return;
    const s = seated ? SEATED_SCALE : 1;
    item.body.scale.y = s;
    item.body.position.y = (BODY_HEIGHT * s) / 2;
    item.visor.position.y = (BODY_HEIGHT - 0.25) * s;
    item.sprite.position.y = BODY_HEIGHT * s + 0.35;
  }

  // Đang nói thì thân avatar phát sáng nhẹ
  setSpeaking(id, speaking) {
    const item = this.items.get(id);
    if (!item) return;
    item.body.material.emissive.set(speaking ? item.body.material.color : 0x000000);
    item.body.material.emissiveIntensity = speaking ? 0.9 : 0;
  }

  setTarget(id, { x, y, z, ry }) {
    const item = this.items.get(id);
    if (item) item.target = { x, y, z, ry };
  }

  remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    this.scene.remove(item.group);
    item.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.items.delete(id);
  }

  // Nội suy vị trí/hướng để chuyển động mượt dù chỉ nhận ~15 lần/giây
  update(dt) {
    const k = Math.min(1, dt * SMOOTHING);
    for (const { group, target } of this.items.values()) {
      group.position.x += (target.x - group.position.x) * k;
      group.position.y += (target.y - group.position.y) * k;
      group.position.z += (target.z - group.position.z) * k;
      let dr = target.ry - group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr)); // đi đường ngắn nhất
      group.rotation.y += dr * k;
    }
  }
}
