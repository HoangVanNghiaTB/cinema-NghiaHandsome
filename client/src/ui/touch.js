// Điều khiển cảm ứng cho điện thoại: cần gạt bên trái để đi, kéo phía bên phải để nhìn, vài nút chức năng.
// DOM nằm sẵn trong index.html (#touch-ui); module này chỉ gắn sự kiện.

const JOY_RADIUS = 55; // px: quãng kéo cần gạt tối đa

// onLook(dx, dy): độ dịch ngón tay (px) khi kéo nhìn quanh
export function createTouchControls({ onLook, onMenu, onMic, onChat, onSit }) {
  const $ = (id) => document.getElementById(id);
  const root = $('touch-ui');
  const joy = $('joy');
  const knob = $('joy-knob');
  const lookZone = $('look-zone');
  const btnSit = $('btn-sit');
  const btnMic = $('btn-mic');

  // move.x: sang phải (+), move.y: tiến lên (+), cả hai trong [-1, 1]
  const move = { x: 0, y: 0 };

  let joyId = null;
  let joyCenter = null;

  function updateJoy(touch) {
    let dx = touch.clientX - joyCenter.x;
    let dy = touch.clientY - joyCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) {
      dx = (dx / dist) * JOY_RADIUS;
      dy = (dy / dist) * JOY_RADIUS;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    move.x = dx / JOY_RADIUS;
    move.y = -dy / JOY_RADIUS;
  }

  function resetJoy() {
    joyId = null;
    knob.style.transform = '';
    move.x = 0;
    move.y = 0;
  }

  const findTouch = (e, id) => [...e.changedTouches].find((t) => t.identifier === id);

  joy.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      const r = joy.getBoundingClientRect();
      joyId = t.identifier;
      joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      updateJoy(t);
    },
    { passive: false }
  );
  joy.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const t = findTouch(e, joyId);
      if (t) updateJoy(t);
    },
    { passive: false }
  );
  const endJoy = (e) => {
    if (findTouch(e, joyId)) resetJoy();
  };
  joy.addEventListener('touchend', endJoy);
  joy.addEventListener('touchcancel', endJoy);

  let lookId = null;
  let lastLook = null;
  lookZone.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastLook = { x: t.clientX, y: t.clientY };
    },
    { passive: false }
  );
  lookZone.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const t = findTouch(e, lookId);
      if (!t) return;
      onLook(t.clientX - lastLook.x, t.clientY - lastLook.y);
      lastLook = { x: t.clientX, y: t.clientY };
    },
    { passive: false }
  );
  const endLook = (e) => {
    if (findTouch(e, lookId)) lookId = null;
  };
  lookZone.addEventListener('touchend', endLook);
  lookZone.addEventListener('touchcancel', endLook);

  $('btn-menu').addEventListener('click', onMenu);
  btnMic.addEventListener('click', onMic);
  $('btn-chat').addEventListener('click', onChat);
  btnSit.addEventListener('click', onSit);

  return {
    move,
    setVisible(visible) {
      root.style.display = visible ? 'block' : 'none';
      if (!visible) resetJoy();
    },
    setJoyVisible(visible) {
      joy.style.display = visible ? 'block' : 'none';
      if (!visible) resetJoy();
    },
    // label = chữ trên nút; null thì ẩn nút (không có ghế gần / không đang ngồi)
    setSitButton(label) {
      btnSit.style.display = label ? 'block' : 'none';
      if (label) btnSit.textContent = label;
    },
    setMicOn(on) {
      btnMic.classList.toggle('on', on);
      btnMic.textContent = on ? 'Mic BẬT' : 'Mic tắt';
    },
  };
}
