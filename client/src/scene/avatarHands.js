import * as THREE from 'three';

// Tay của avatar: hai quả cầu nhỏ (không có cánh tay) để diễn các hành động, đơn giản nhất có thể.
// Toạ độ trong hệ của avatar: nhìn về -z, bên phải là +x, y hướng lên. H là chiều cao thân (đổi khi ngồi).

const BODY_HEIGHT = 1.6; // khớp avatars.js
const SKIN = 0xf2c9a0;

// Thời lượng từng hành động (ms), khớp với phần server cho phép (thời gian chờ của server luôn >= số này)
const DURATIONS = { clap: 3000, confetti: 700, heart: 3000 };
const CLAP_HZ = 5; // số lần vỗ mỗi giây
const SWING_MS = 400; // một cú tát

// Hình và vật liệu dùng chung cho mọi avatar
const handGeo = new THREE.SphereGeometry(0.075, 10, 8);
const handMat = new THREE.MeshLambertMaterial({ color: SKIN });
const stickGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.55, 8);

let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

let heartMaterial = null;
function getHeartMaterial() {
  if (heartMaterial) return heartMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(64, 112);
  ctx.bezierCurveTo(8, 72, 12, 22, 46, 22);
  ctx.bezierCurveTo(58, 22, 64, 32, 64, 42);
  ctx.bezierCurveTo(64, 32, 70, 22, 82, 22);
  ctx.bezierCurveTo(116, 22, 120, 72, 64, 112);
  ctx.closePath();
  ctx.fillStyle = '#ff4f8b';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffa3c4';
  ctx.stroke();
  heartMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false });
  return heartMaterial;
}

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class AvatarHands {
  // parent: nhóm của avatar; color: màu avatar (lightstick sáng theo màu này)
  constructor(parent, color) {
    this.parent = parent;
    this.root = new THREE.Group();
    this.left = new THREE.Mesh(handGeo, handMat);
    this.right = new THREE.Mesh(handGeo, handMat);
    this.root.add(this.left, this.right);
    parent.add(this.root);

    this.color = new THREE.Color(color);
    this.s = 1; // tỉ lệ chiều cao thân (ngồi thì nhỏ hơn)
    this.action = null; // { type, start, duration }
    this.swingStart = null; // lúc bắt đầu một cú tát
    this.stick = null; // { group, mats } khi đang cầm lightstick (ở tay trái)
    this.heart = null; // sprite trái tim, tạo khi cần
    this.update(performance.now());
  }

  setScale(s) {
    this.s = s;
  }

  // Cầm / cất lightstick (tay trái), sáng theo màu avatar, không dùng đèn thật nên rất nhẹ
  setHolding(on) {
    if (on && !this.stick) {
      const tint = this.color.clone().lerp(new THREE.Color(0xffffff), 0.25);
      const rodMat = new THREE.MeshBasicMaterial({ color: tint });
      const tipMat = new THREE.SpriteMaterial({
        map: getGlowTexture(), color: this.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const group = new THREE.Group();
      const rod = new THREE.Mesh(stickGeo, rodMat);
      rod.position.y = 0.3;
      const tip = new THREE.Sprite(tipMat);
      tip.scale.set(0.42, 0.42, 1);
      tip.position.y = 0.6;
      group.add(rod, tip);
      this.left.add(group);
      this.stick = { group, mats: [rodMat, tipMat] };
    } else if (!on && this.stick) {
      this.left.remove(this.stick.group);
      this.stick.mats.forEach((m) => m.dispose()); // vật liệu riêng của avatar này; hình và hạt sáng dùng chung thì giữ
      this.stick = null;
    }
  }

  // Làm một hành động bắn một lần: 'clap' | 'confetti' | 'heart'
  play(type) {
    if (!DURATIONS[type]) return;
    this.action = { type, start: performance.now(), duration: DURATIONS[type] };
    if (type === 'heart') {
      if (!this.heart) {
        this.heart = new THREE.Sprite(getHeartMaterial());
        this.root.add(this.heart);
      }
      this.heart.visible = true;
    }
  }

  // Vung tay phải một cú tát
  swing() {
    this.swingStart = performance.now();
  }

  // Dừng mọi hành động đang diễn ra (vd. bị choáng); lightstick đang cầm thì vẫn giữ
  cancel() {
    this.action = null;
    this.swingStart = null;
    if (this.heart) this.heart.visible = false;
  }

  dispose() {
    this.setHolding(false);
    this.parent.remove(this.root); // hình và vật liệu chung không bị huỷ theo avatar
  }

  update(now) {
    const H = BODY_HEIGHT * this.s;
    const L = this.left.position;
    const R = this.right.position;

    // tư thế nghỉ: hai tay buông bên hông; cầm lightstick thì tay trái giơ lên ở bên
    L.set(-0.37, 0.5 * H, 0);
    R.set(0.37, 0.5 * H, 0);
    if (this.stick) {
      L.set(-0.42, 0.8 * H, -0.12);
      const t = now * 0.001;
      this.stick.group.rotation.z = 0.25 + Math.sin(t * Math.PI * 2 * 1.6) * 0.35; // đung đưa
      this.stick.group.rotation.x = Math.sin(t * Math.PI * 2 * 0.8) * 0.15;
    }

    const a = this.action;
    if (a) {
      const t = now - a.start;
      if (t >= a.duration) {
        this.action = null; // hết hành động (không đụng tới cú tát đang diễn ra)
        if (this.heart) this.heart.visible = false;
      } else if (a.type === 'clap') {
        // hai tay chụm vào rồi tách ra trước ngực
        const open = (Math.cos((t / 1000) * CLAP_HZ * Math.PI * 2) + 1) / 2;
        const x = 0.04 + 0.2 * open;
        L.set(-x, 0.68 * H, -0.32);
        R.set(x, 0.68 * H, -0.32);
      } else if (a.type === 'confetti') {
        // hai tay hất lên trên đầu (lúc pháo bắn lên)
        const e = easeOut(Math.min(1, t / a.duration));
        const x = lerp(0.15, 0.22, e);
        const y = lerp(0.68 * H, H + 0.3, e);
        const z = lerp(-0.3, 0, e);
        L.set(-x, y, z);
        R.set(x, y, z);
      } else if (a.type === 'heart') {
        // hai tay chạm nhau ngay trên đỉnh đầu (dưới nhãn tên, để nhãn không che tay), kèm một trái tim nhỏ đập nhẹ
        // nằm phía trên nhãn tên
        L.set(-0.07, H + 0.1, 0);
        R.set(0.07, H + 0.1, 0);
        const beat = 0.34 + 0.04 * Math.sin((t / 1000) * Math.PI * 2 * 2.5);
        this.heart.scale.set(beat, beat, 1);
        this.heart.position.set(0, H + 0.8, 0);
      }
    }

    // cú tát: tay phải vung ra phía trước rồi thu về (chồng lên mọi tư thế ở trên)
    if (this.swingStart !== null) {
      const u = (now - this.swingStart) / SWING_MS;
      if (u >= 1) {
        this.swingStart = null;
      } else {
        const strike = 0.4; // tới đích ở 40% thời gian, phần còn lại thu về
        const k = u < strike ? easeOut(u / strike) : 1 - easeInOut((u - strike) / (1 - strike));
        R.set(
          lerp(0.37, -0.1, k),
          lerp(0.5 * H, 0.72 * H, k) + 0.1 * Math.sin(Math.PI * k),
          lerp(0, -0.78, k)
        );
      }
    }
  }
}
