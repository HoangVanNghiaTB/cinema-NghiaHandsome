import * as THREE from 'three';
import { STEP_LENGTH } from '../audio/sounds.js';
import { AvatarHands } from './avatarHands.js';
import { createFruit, BASE_GLOW } from './fruitRig.js';

const SEATED_SQUASH = 0.8; // khớp fruitRig.js: ngồi thì thân thấp xuống
const SMOOTHING = 12; // càng lớn càng bám sát vị trí mới nhận
const MIN_WALK_SPEED = 0.4; // m/s: dưới mức này coi như đứng yên

// Miệng: số hình khi nói (tròn, vuông, dấu "-") + hình cuối là miệng khi im; khớp MOUTH_SHAPES trong fruitRig.js
const IDLE_MOUTH = 3;
const MOUTH_INTERVAL = 0.12; // s: bao lâu đổi hình miệng một lần khi đang nói

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
  return sprite;
}

// Vẽ một ngôi sao 5 cánh có quầng sáng lên canvas, dùng chung cho mọi ngôi sao choáng (tạo một lần)
let starTexture = null;
export function getStarTexture() {
  if (starTexture) return starTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255, 210, 60, 0.55)');
  glow.addColorStop(1, 'rgba(255, 210, 60, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 50 : 22;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd400';
  ctx.fill();
  ctx.strokeStyle = '#ff9a00';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  starTexture = new THREE.CanvasTexture(canvas);
  return starTexture;
}

let starMaterial = null;
function getStarMaterial() {
  if (!starMaterial) starMaterial = new THREE.SpriteMaterial({ map: getStarTexture(), depthWrite: false });
  return starMaterial;
}

const STAR_COUNT = 3;
const STAR_RADIUS = 0.32;
const STAR_SPIN = 4; // rad/giây

// Avatar trái cây (xem fruitRig.js) + hai tay lơ lửng (AvatarHands) + nhãn tên
export class Avatars {
  // onStep(x, z): gọi mỗi khi một avatar đi đủ một bước (để phát tiếng bước chân)
  constructor(scene, { onStep } = {}) {
    this.scene = scene;
    this.onStep = onStep;
    this.items = new Map(); // id -> { group, target: {x,y,z,ry} }
  }

  add({ id, name, color, look = null, x = 0, y = 0, z = 0, ry = 0, seat = null, holding = null }) {
    if (this.items.has(id)) return;
    const group = new THREE.Group();
    const sprite = makeNameSprite(name);
    group.add(sprite);
    group.position.set(x, y, z);
    group.rotation.y = ry;
    const hands = new AvatarHands(group, color);
    const item = {
      group, sprite, hands, color, target: { x, y, z, ry },
      stunned: false, dancing: holding === 'lightstick',
      speaking: false, mouthTimer: 0, mouthShape: IDLE_MOUTH,
      seated: false, lastX: x, lastZ: z, stepDist: 0, // theo dõi quãng đường để biết khi nào có một bước
      walkPhase: 0, walkAmp: 0, // pha bước chân và mức độ đang đi (0 = đứng yên, 1 = đang đi)
      // "visor": chỉ để main.js bật/tắt cả mặt và đồ trên đầu (camera nằm trong thân khi nhìn từ mắt)
      visor: {
        get visible() {
          return item.fruit.faceVisible;
        },
        set visible(v) {
          item.fruit.setFaceVisible(v);
        },
      },
    };
    this.items.set(id, item);
    this.build(item, look);
    if (holding === 'lightstick') hands.setHolding(true);
    else if (holding === 'eat') hands.setEating(true);
    this.scene.add(group);
    if (seat !== null) this.setSeated(id, true);
  }

  // Dựng (hoặc dựng lại khi đổi kiểu nhân vật) thân trái cây cho avatar: item.fruit, item.body, item.mouthMeshes
  build(item, look) {
    const faceWasVisible = item.fruit?.faceVisible ?? true;
    const prev = item.fruit;
    if (prev) {
      item.group.remove(prev.wrap);
      prev.dispose();
    }
    const fruit = createFruit(item.color, look?.kind);
    fruit.setLook(look ?? undefined); // kiểu, loại trái, phụ kiện, màu thân (xem looks.js)
    fruit.setFaceVisible(faceWasVisible);
    item.fruit = fruit;
    item.body = fruit.wrap; // main.js co/giãn nhóm này khi nhìn từ mắt
    item.mouthMeshes = fruit.mouthMeshes;
    item.mouthShape = IDLE_MOUTH;
    item.group.add(fruit.wrap);
    item.hands.setReach(fruit.hands);
    item.hands.setSkin(fruit.color);
    this.applySeated(item);
    const mat = fruit.bodyMat;
    mat.emissiveIntensity = item.speaking ? 0.9 : BASE_GLOW;
  }

  // Đổi kiểu / loại trái / phụ kiện / màu thân
  setLook(id, look) {
    const item = this.items.get(id);
    if (!item) return;
    if (item.fruit.kind !== (look?.kind ?? 'chubby_m')) {
      this.build(item, look); // đổi kiểu thân thì dựng lại
      return;
    }
    item.fruit.setLook(look);
    item.hands.setSkin(item.fruit.color);
  }

  // Choáng thì có mấy ngôi sao quay vòng trên đầu
  setStunned(id, stunned) {
    const item = this.items.get(id);
    if (!item) return;
    item.stunned = stunned;
    if (!stunned) {
      if (item.stars) {
        item.group.remove(item.stars);
        item.stars = null;
      }
      return;
    }
    if (item.stars) return;
    const stars = new THREE.Group();
    for (let i = 0; i < STAR_COUNT; i++) {
      const a = (i * Math.PI * 2) / STAR_COUNT;
      const star = new THREE.Sprite(getStarMaterial()); // dùng chung vật liệu, không tạo mới mỗi lần
      star.scale.set(0.22, 0.22, 1);
      star.position.set(Math.cos(a) * STAR_RADIUS, 0, Math.sin(a) * STAR_RADIUS);
      stars.add(star);
    }
    stars.position.y = (item.seated ? item.fruit.top * SEATED_SQUASH : item.fruit.top) + 0.1;
    item.group.add(stars);
    item.stars = stars;
  }

  // Ngồi thì thân thấp xuống một chút (fruitRig.pose lo phần co thân), tay và nhãn tên hạ theo
  setSeated(id, seated) {
    const item = this.items.get(id);
    if (!item) return;
    item.seated = seated;
    this.applySeated(item);
  }

  applySeated(item) {
    const s = item.seated ? SEATED_SQUASH : 1;
    item.hands.setScale(item.fruit.hands.scale * s);
    item.sprite.position.y = item.fruit.top * s + 0.3;
    if (item.stars) item.stars.position.y = item.fruit.top * s + 0.1;
  }

  // Hành động của avatar: 'clap' | 'confetti' | 'heart' (bắn một lần), cầm/cất lightstick, vung tay tát, dừng hết
  playAction(id, type) {
    this.items.get(id)?.hands.play(type);
  }

  // Cầm / cất một thứ: type 'lightstick' hoặc 'eat' (bát và đũa)
  setHolding(id, type, on) {
    const item = this.items.get(id);
    if (!item) return;
    if (type === 'lightstick') {
      item.dancing = on; // cầm lightstick thì nhún nhảy theo nhịp
      item.hands.setHolding(on);
    } else if (type === 'eat') {
      item.hands.setEating(on);
    }
  }

  swing(id) {
    this.items.get(id)?.hands.swing();
  }

  cancelActions(id) {
    this.items.get(id)?.hands.cancel();
  }

  // Đang nói thì thân avatar phát sáng hơn
  setSpeaking(id, speaking) {
    const item = this.items.get(id);
    if (!item) return;
    item.speaking = speaking;
    const mat = item.fruit.bodyMat;
    mat.emissiveIntensity = speaking ? 0.9 : BASE_GLOW;
  }

  setTarget(id, { x, y, z, ry }) {
    const item = this.items.get(id);
    if (item) item.target = { x, y, z, ry };
  }

  remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    if (item.stars) item.group.remove(item.stars); // vật liệu sao dùng chung, không được huỷ theo avatar
    item.hands.dispose(); // tay dùng hình/vật liệu chung, tách ra trước khi dọn dẹp bên dưới
    this.scene.remove(item.group);
    item.fruit.dispose();
    // hình khối của thân dùng chung giữa các avatar; chỉ huỷ phần riêng (nhãn tên)
    item.sprite.material.map?.dispose();
    item.sprite.material.dispose();
    this.items.delete(id);
  }

  // Nội suy vị trí/hướng để chuyển động mượt dù chỉ nhận ~15 lần/giây
  update(dt) {
    const k = Math.min(1, dt * SMOOTHING);
    const now = performance.now();
    for (const item of this.items.values()) {
      const { group, target, stars } = item;
      if (stars) stars.rotation.y += dt * STAR_SPIN;
      item.hands.update(now);
      group.position.x += (target.x - group.position.x) * k;
      group.position.y += (target.y - group.position.y) * k;
      group.position.z += (target.z - group.position.z) * k;
      let dr = target.ry - group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr)); // đi đường ngắn nhất
      group.rotation.y += dr * k;

      // Đi đủ một bước (đo theo quãng đường thực tế trên mặt sàn) thì báo để phát tiếng bước chân.
      // Ngồi thì không có tiếng; nhảy cóc xa (đứng dậy, kết nối lại) thì không tính.
      const moved = Math.hypot(group.position.x - item.lastX, group.position.z - item.lastZ);
      item.lastX = group.position.x;
      item.lastZ = group.position.z;
      // Miệng: đang nói thì đổi hình tròn/vuông/dấu "-" liên tục (không lặp lại hình vừa rồi), im thì về nét ngắn
      let shape = item.mouthShape;
      if (item.speaking) {
        item.mouthTimer -= dt;
        if (item.mouthTimer <= 0) {
          item.mouthTimer = MOUTH_INTERVAL;
          shape = (shape === IDLE_MOUTH ? 0 : shape + 1 + Math.floor(Math.random() * 2)) % IDLE_MOUTH;
        }
      } else {
        shape = IDLE_MOUTH;
      }
      if (shape !== item.mouthShape) {
        item.mouthMeshes[item.mouthShape].visible = false;
        item.mouthMeshes[shape].visible = true;
        item.mouthShape = shape;
      }

      const walking = !item.seated && moved < 1.5 && moved / Math.max(dt, 1e-3) > MIN_WALK_SPEED;
      item.walkAmp += ((walking ? 1 : 0) - item.walkAmp) * Math.min(1, dt * 12);
      if (walking) item.walkPhase += (moved / (2 * STEP_LENGTH)) * Math.PI * 2; // hai bước (mỗi chân một bước) = một vòng
      item.fruit.pose({
        dt, time: now / 1000, walkPhase: item.walkPhase, walkAmp: item.walkAmp,
        seated: item.seated, stunned: item.stunned, dancing: item.dancing,
      });

      if (item.seated || moved > 1.5) {
        item.stepDist = 0;
      } else {
        item.stepDist += moved;
        if (item.stepDist >= STEP_LENGTH) {
          item.stepDist -= STEP_LENGTH;
          this.onStep?.(group.position.x, group.position.z);
        }
      }
    }
  }
}
