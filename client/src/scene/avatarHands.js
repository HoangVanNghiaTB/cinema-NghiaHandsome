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

// Ăn cơm: tay trái cầm bát, tay phải cầm đũa; đũa gắp cơm đưa lên miệng rồi quay lại bát (chu kỳ EAT_PERIOD_MS)
const EAT_PERIOD_MS = 2400;
const CHOPSTICK_LENGTH = 0.26;
const chopstickGeo = new THREE.CylinderGeometry(0.011, 0.008, CHOPSTICK_LENGTH, 6); // to hơn thật một chút để còn thấy được từ xa
const chopstickMat = new THREE.MeshLambertMaterial({ color: 0xe0b878 });
const bowlGeo = new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); // nửa cầu dưới, hở miệng lên trên
const bowlMat = new THREE.MeshLambertMaterial({ color: 0xdfe9f5, side: THREE.DoubleSide });
const riceGeo = new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); // nắm cơm đầy lên miệng bát
const riceMat = new THREE.MeshLambertMaterial({ color: 0xfafafa });
const riceGrainGeo = new THREE.SphereGeometry(0.03, 8, 6); // miếng cơm kẹp ở đầu đũa

// Bộ vật liệu: dùng chung cho mọi avatar; tay nhìn từ mắt (viewmodel) thì có bộ riêng tắt kiểm tra độ sâu và vẽ sau cùng,
// để đứng sát tường tay vẫn không bị tường che
const SHARED_MATS = { hand: handMat, chop: chopstickMat, bowl: bowlMat, rice: riceMat };
function makeViewmodelMats() {
  const nodepth = (m) => {
    const c = m.clone();
    c.depthTest = false;
    return c;
  };
  return { hand: nodepth(handMat), chop: nodepth(chopstickMat), bowl: nodepth(bowlMat), rice: nodepth(riceMat) };
}
const VIEWMODEL_RENDER_ORDER = 1000;

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
  // viewmodel: tay nhìn từ mắt mình (parent là camera; vị trí tính trong hệ toạ độ camera), chỉ dùng để diễn ăn cơm
  constructor(parent, color, { viewmodel = false } = {}) {
    this.parent = parent;
    this.viewmodel = viewmodel;
    this.viewVisible = true;
    this.mats = viewmodel ? makeViewmodelMats() : SHARED_MATS;
    this.root = new THREE.Group();
    this.left = new THREE.Mesh(handGeo, this.mats.hand);
    this.right = new THREE.Mesh(handGeo, this.mats.hand);
    if (viewmodel) {
      this.left.renderOrder = this.right.renderOrder = VIEWMODEL_RENDER_ORDER;
      this.root.scale.setScalar(0.8); // nhìn từ mắt thì nhỏ lại một chút, khỏi che nhiều màn hình
    }
    this.root.add(this.left, this.right);
    parent.add(this.root);

    this.color = new THREE.Color(color);
    this.s = 1; // tỉ lệ chiều cao thân (ngồi thì nhỏ hơn)
    this.restX = 0.37; // tay buông cách giữa thân bao xa
    this.forward = 0; // đẩy mọi tư thế ra trước thêm (thân mập)
    this.action = null; // { type, start, duration }
    this.swingStart = null; // lúc bắt đầu một cú tát
    this.stick = null; // { group, mats } khi đang cầm lightstick (ở tay trái)
    this.heart = null; // sprite trái tim, tạo khi cần
    this.eat = null; // { bowl, chopsticks, grain } khi đang ăn cơm
    this.update(performance.now());
  }

  setScale(s) {
    this.s = s;
  }

  // Đổi màu tay của avatar này (tay dùng chung vật liệu nên tách ra một bản riêng ở lần đầu)
  setSkin(color) {
    if (this.viewmodel) return;
    if (!this.ownHandMat) {
      this.ownHandMat = new THREE.MeshLambertMaterial({ color });
      this.mats = { ...this.mats, hand: this.ownHandMat };
      this.left.material = this.right.material = this.ownHandMat;
    } else {
      this.ownHandMat.color.set(color);
    }
  }

  // Thân to tròn thì tay phải nằm ngoài thân: restX = tay buông cách giữa thân bao xa, forward = đẩy mọi tư thế ra trước thêm
  setReach({ restX, forward }) {
    this.restX = restX;
    this.forward = forward;
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

  // Bắt đầu / dừng ăn cơm: bát ở tay trái, đũa ở tay phải (hình và vật liệu dùng chung nên không cần huỷ)
  setEating(on) {
    if (on && !this.eat) {
      const bowl = new THREE.Group();
      const shell = new THREE.Mesh(bowlGeo, this.mats.bowl);
      const rice = new THREE.Mesh(riceGeo, this.mats.rice);
      rice.scale.y = 0.6;
      bowl.add(shell, rice);
      bowl.position.y = 0.1; // tay đỡ dưới đáy bát
      this.left.add(bowl);

      const chopsticks = new THREE.Group();
      for (const side of [-1, 1]) {
        const stick = new THREE.Mesh(chopstickGeo, this.mats.chop);
        stick.position.set(side * 0.01, CHOPSTICK_LENGTH / 2, 0);
        stick.rotation.z = -side * 0.05; // hai chiếc hơi chụm lại ở đầu
        chopsticks.add(stick);
      }
      const grain = new THREE.Mesh(riceGrainGeo, this.mats.rice);
      grain.position.y = CHOPSTICK_LENGTH;
      chopsticks.add(grain);
      if (this.viewmodel) {
        for (const g of [bowl, chopsticks]) g.traverse((o) => (o.renderOrder = VIEWMODEL_RENDER_ORDER));
      }
      this.right.add(chopsticks);
      this.eat = { bowl, chopsticks, grain };
    } else if (!on && this.eat) {
      this.left.remove(this.eat.bowl);
      this.right.remove(this.eat.chopsticks);
      this.eat = null;
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
    this.setEating(false);
    this.parent.remove(this.root); // hình và vật liệu chung không bị huỷ theo avatar
  }

  // Tư thế ăn cơm. Tay trái giữ bát trước ngực; tay phải đưa đũa giữa bát và miệng (miệng cao ~0.7H, nằm ở mặt thân z = -0.3).
  // Chu kỳ: 0-0.3 đưa cơm lên miệng, 0.3-0.5 nhai (hơi gật), 0.5-0.75 đưa tay về bát, 0.75-1 gắp cơm.
  poseEating(now, H, L, R) {
    const u = (now % EAT_PERIOD_MS) / EAT_PERIOD_MS;
    // k: 0 = đũa ở bát, 1 = đũa ở miệng
    let k;
    if (u < 0.3) k = easeInOut(u / 0.3);
    else if (u < 0.5) k = 1;
    else if (u < 0.75) k = 1 - easeInOut((u - 0.5) / 0.25);
    else k = 0;
    const chew = u >= 0.3 && u < 0.5 ? Math.sin(((u - 0.3) / 0.2) * Math.PI * 4) * 0.012 : 0; // gật nhẹ khi nhai
    const scoop = u >= 0.75 ? Math.sin(((u - 0.75) / 0.25) * Math.PI * 2) * 0.04 : 0; // nhúng đũa xuống bát

    L.set(-0.18, 0.5 * H, -0.42);
    // tay phải lệch sang phải, đũa nghiêng chéo vào giữa (nhìn từ phía trước mới thấy được đũa, không bị rút ngắn)
    R.set(lerp(0.04, 0.15, k), lerp(0.5 * H + 0.25, 0.66 * H, k) + chew + scoop, lerp(-0.575, -0.52, k));
    this.eat.chopsticks.rotation.z = 0.55;
    // đũa chúc xuống bát khi gắp (góc ~135°), chĩa lên vào miệng khi ăn (~72°); trục đũa là y, quay quanh x
    this.eat.chopsticks.rotation.x = lerp(2.36, 1.26, k);
    this.eat.grain.visible = u >= 0.9 || u < 0.32; // có cơm trên đũa từ lúc gắp đến khi vào miệng
  }

  // Bật/tắt hiển thị tay nhìn từ mắt (chỉ hiện ở góc nhìn thứ nhất)
  setViewVisible(visible) {
    this.viewVisible = visible;
  }

  // Tư thế ăn cơm nhìn từ mắt mình (toạ độ camera: +x phải, +y lên, -z phía trước). Bát ở dưới bên trái tầm nhìn,
  // đũa gắp từ bát rồi đưa lên gần mép dưới giữa màn hình (chính là miệng mình). Cùng chu kỳ với poseEating.
  poseEatingFP(now) {
    const L = this.left.position;
    const R = this.right.position;
    const u = (now % EAT_PERIOD_MS) / EAT_PERIOD_MS;
    let k;
    if (u < 0.3) k = easeInOut(u / 0.3);
    else if (u < 0.5) k = 1;
    else if (u < 0.75) k = 1 - easeInOut((u - 0.5) / 0.25);
    else k = 0;
    const chew = u >= 0.3 && u < 0.5 ? Math.sin(((u - 0.3) / 0.2) * Math.PI * 4) * 0.008 : 0;
    const scoop = u >= 0.75 ? Math.sin(((u - 0.75) / 0.25) * Math.PI * 2) * 0.03 : 0;
    const lift = Math.sin(k * Math.PI) * 0.05; // tay nhấc lên thành vòng cung giữa bát và miệng

    L.set(-0.12, -0.22, -0.5);
    R.set(lerp(0.06, 0.14, k), lerp(-0.1, -0.17, k) + lift + chew + scoop, lerp(-0.5, -0.42, k));
    this.eat.chopsticks.rotation.x = lerp(-2.3, 1.18, k);
    this.eat.chopsticks.rotation.z = lerp(0.9, 0.65, k);
    this.eat.grain.visible = u >= 0.9 || u < 0.32;
  }

  update(now) {
    if (this.viewmodel) {
      this.root.visible = !!this.eat && this.viewVisible;
      if (this.eat) this.poseEatingFP(now);
      return;
    }
    const H = BODY_HEIGHT * this.s;
    const L = this.left.position;
    const R = this.right.position;

    // tư thế nghỉ: hai tay buông bên hông; cầm lightstick thì tay trái giơ lên ở bên
    L.set(-this.restX, 0.5 * H, 0);
    R.set(this.restX, 0.5 * H, 0);
    if (this.stick) {
      L.set(-(this.restX + 0.05), 0.8 * H, -0.12);
      const t = now * 0.001;
      this.stick.group.rotation.z = 0.25 + Math.sin(t * Math.PI * 2 * 1.6) * 0.35; // đung đưa
      this.stick.group.rotation.x = Math.sin(t * Math.PI * 2 * 0.8) * 0.15;
    }

    if (this.eat) this.poseEating(now, H, L, R);

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
        L.set(-x, 0.56 * H, -0.36); // ngang ngực, dưới đầu và cách mặt một khoảng
        R.set(x, 0.56 * H, -0.36);
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
          lerp(this.restX, -0.1, k),
          lerp(0.5 * H, 0.72 * H, k) + 0.1 * Math.sin(Math.PI * k),
          lerp(0, -0.78, k)
        );
      }
    }
    L.z -= this.forward;
    R.z -= this.forward;
  }
}
