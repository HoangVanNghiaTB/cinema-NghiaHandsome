import * as THREE from 'three';
import { STEP_LENGTH } from '../audio/sounds.js';
import { AvatarHands } from './avatarHands.js';

const BODY_LENGTH = 1.0;
const BODY_RADIUS = 0.3;
const BODY_HEIGHT = BODY_LENGTH + BODY_RADIUS * 2; // ~1.6 m
// Thân nâng lên khỏi mặt sàn LEG_GAP để hở chỗ cho hai bàn chân; đỉnh đầu vẫn ở 1.6 m (thân thon lại một chút)
const LEG_GAP = 0.14;
const BODY_SCALE_Y = (BODY_HEIGHT - LEG_GAP) / BODY_HEIGHT;
const BODY_CENTER_Y = (BODY_HEIGHT + LEG_GAP) / 2;
const SEATED_SCALE = 0.62; // tỉ lệ chiều cao khi ngồi
const SMOOTHING = 12; // càng lớn càng bám sát vị trí mới nhận

// Hai bàn chân (nhìn thẳng về -z): đi thì luân phiên bước tới/lui và nhấc lên, đứng yên thì về chỗ cũ
const FOOT_SIZE = [0.17, 0.1, 0.34]; // rộng, cao, dài (m)
const FOOT_SPREAD = 0.2; // lệch trái/phải so với giữa thân
const FOOT_REST_Z = -0.2; // lệch ra trước để lộ ra khỏi đáy thân tròn (bán kính 0.3)
const FOOT_SWING = 0.16; // m: biên độ bước tới/lui
const FOOT_LIFT = 0.07; // m: nhấc chân lên khi bước tới
const MIN_WALK_SPEED = 0.4; // m/s: dưới mức này coi như đứng yên
const SHOE_COLOR = 0x6b7080; // xám sáng để nổi trên sàn đỏ sẫm

// Miệng: các hình khi nói [rộng, cao, tròn?] gồm tròn, vuông, dấu "-"; hình cuối là miệng khi im (một nét ngắn)
const MOUTH_SHAPES = [[0.07, 0, true], [0.13, 0.13, false], [0.21, 0.035, false], [0.11, 0.03, false]];
const IDLE_MOUTH = MOUTH_SHAPES.length - 1;
const MOUTH_COLOR = 0x15151a;
const MOUTH_DROP = -0.23; // m: thấp hơn kính (tính trong hệ toạ độ của kính)
const MOUTH_FORWARD = -0.011; // nhô ra trước mặt thân một chút để không bị chìm
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
  sprite.position.y = BODY_HEIGHT + 0.35;
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

// Avatar tối giản: viên nhộng màu + khối nhỏ chỉ hướng nhìn + nhãn tên
export class Avatars {
  // onStep(x, z): gọi mỗi khi một avatar đi đủ một bước (để phát tiếng bước chân)
  constructor(scene, { onStep } = {}) {
    this.scene = scene;
    this.onStep = onStep;
    this.items = new Map(); // id -> { group, target: {x,y,z,ry} }
  }

  add({ id, name, color, x = 0, y = 0, z = 0, ry = 0, seat = null, holding = null }) {
    if (this.items.has(id)) return;
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_RADIUS, BODY_LENGTH, 4, 12),
      new THREE.MeshLambertMaterial({ color })
    );
    body.scale.y = BODY_SCALE_Y;
    body.position.y = BODY_CENTER_Y;
    group.add(body);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.1, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    visor.position.set(0, BODY_HEIGHT - 0.25, -BODY_RADIUS);
    group.add(visor);

    // Miệng dán trên mặt thân, dưới kính (là con của kính nên ẩn kính thì miệng ẩn theo). Nói thì đổi hình tròn / vuông / dấu "-".
    const mouthMat = new THREE.MeshBasicMaterial({ color: MOUTH_COLOR, side: THREE.DoubleSide });
    const mouthMeshes = MOUTH_SHAPES.map(([w, h, round]) => {
      const mesh = new THREE.Mesh(round ? new THREE.CircleGeometry(w, 16) : new THREE.PlaneGeometry(w, h), mouthMat);
      mesh.position.set(0, MOUTH_DROP, MOUTH_FORWARD);
      mesh.visible = false;
      visor.add(mesh);
      return mesh;
    });
    mouthMeshes[IDLE_MOUTH].visible = true;

    const shoeMat = new THREE.MeshLambertMaterial({ color: SHOE_COLOR });
    const feet = [-1, 1].map((side) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(...FOOT_SIZE), shoeMat);
      foot.position.set(side * FOOT_SPREAD, FOOT_SIZE[1] / 2, FOOT_REST_Z);
      group.add(foot);
      return foot;
    });

    const sprite = makeNameSprite(name);
    group.add(sprite);
    group.position.set(x, y, z);
    group.rotation.y = ry;
    const hands = new AvatarHands(group, color);
    if (holding === 'lightstick') hands.setHolding(true);
    this.scene.add(group);
    this.items.set(id, {
      group, body, visor, sprite, hands, feet, mouthMeshes, target: { x, y, z, ry },
      speaking: false, mouthTimer: 0, mouthShape: IDLE_MOUTH,
      seated: false, lastX: x, lastZ: z, stepDist: 0, // theo dõi quãng đường để biết khi nào có một bước
      walkPhase: 0, walkAmp: 0, // pha bước chân và mức độ đang đi (0 = đứng yên, 1 = đang đi)
    });
    if (seat !== null) this.setSeated(id, true);
  }

  // Choáng thì có mấy ngôi sao quay vòng trên đầu
  setStunned(id, stunned) {
    const item = this.items.get(id);
    if (!item) return;
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
    stars.position.y = BODY_HEIGHT + 0.1;
    item.group.add(stars);
    item.stars = stars;
  }

  // Ngồi thì thân avatar thấp xuống (nén theo chiều cao), nhãn tên hạ theo
  setSeated(id, seated) {
    const item = this.items.get(id);
    if (!item) return;
    item.seated = seated;
    const s = seated ? SEATED_SCALE : 1;
    item.hands.setScale(s);
    item.body.scale.y = BODY_SCALE_Y * s;
    item.body.position.y = BODY_CENTER_Y * s;
    item.visor.position.y = (BODY_HEIGHT - 0.25) * s;
    item.mouthMeshes.forEach((m) => (m.position.y = MOUTH_DROP * s)); // thân thấp đi thì miệng gần kính hơn
    item.sprite.position.y = BODY_HEIGHT * s + 0.35;
  }

  // Hành động của avatar: 'clap' | 'confetti' | 'heart' (bắn một lần), cầm/cất lightstick, vung tay tát, dừng hết
  playAction(id, type) {
    this.items.get(id)?.hands.play(type);
  }

  setHolding(id, on) {
    this.items.get(id)?.hands.setHolding(on);
  }

  swing(id) {
    this.items.get(id)?.hands.swing();
  }

  cancelActions(id) {
    this.items.get(id)?.hands.cancel();
  }

  // Đang nói thì thân avatar phát sáng nhẹ
  setSpeaking(id, speaking) {
    const item = this.items.get(id);
    if (!item) return;
    item.speaking = speaking;
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
    if (item.stars) item.group.remove(item.stars); // vật liệu sao dùng chung, không được huỷ theo avatar
    item.hands.dispose(); // tay dùng hình/vật liệu chung, tách ra trước khi dọn dẹp bên dưới
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
      item.feet.forEach((foot, i) => {
        const phase = item.walkPhase + i * Math.PI; // hai chân lệch pha nhau
        foot.position.z = FOOT_REST_Z - Math.sin(phase) * FOOT_SWING * item.walkAmp;
        foot.position.y = FOOT_SIZE[1] / 2 + Math.max(0, Math.cos(phase)) * FOOT_LIFT * item.walkAmp;
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
