// Điều khiển cảm ứng cho điện thoại: cần gạt bên trái để đi, kéo phía bên phải để nhìn, vài nút chức năng.
// DOM nằm sẵn trong index.html (#touch-ui); module này chỉ gắn sự kiện.

import { mapDelta } from './viewport.js';

const JOY_RADIUS = 55; // px: quãng kéo cần gạt tối đa

// onLook(dx, dy): độ dịch ngón tay (px) khi kéo nhìn quanh
export function createTouchControls({ onLook, onMenu, onMic, onChat, onSit, onPunch, onAction, onView, onEye }) {
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
    const d = mapDelta(touch.clientX - joyCenter.x, touch.clientY - joyCenter.y);
    let dx = d.x;
    let dy = d.y;
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
      const d = mapDelta(t.clientX - lastLook.x, t.clientY - lastLook.y);
      onLook(d.x, d.y);
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
  $('btn-punch').addEventListener('click', onPunch);
  $('btn-view').addEventListener('click', onView);
  const btnEye = $('btn-eye');
  btnEye.addEventListener('click', onEye);

  // Nút nhỏ ẩn/hiện toàn bộ phím ảo (cần gạt, cụm nút, nút góc nhìn); menu và nút này luôn còn
  const btnHide = $('btn-hide');
  btnHide.addEventListener('click', () => {
    const hidden = root.classList.toggle('ui-hidden');
    btnHide.classList.toggle('on', hidden);
    if (hidden) resetJoy();
  });

  // Nút "Hành động" mở một hàng biểu tượng nhỏ; chọn xong thì đóng lại. Chạm ra ngoài cũng đóng.
  const panel = $('action-panel');
  $('btn-actions').addEventListener('click', () => {
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
  });
  panel.querySelectorAll('[data-action]').forEach((b) =>
    b.addEventListener('click', () => {
      onAction(b.dataset.action);
      panel.style.display = 'none';
    })
  );
  lookZone.addEventListener('touchstart', () => (panel.style.display = 'none'));

  return {
    move,
    setVisible(visible) {
      root.style.display = visible ? 'block' : 'none';
      if (!visible) {
        resetJoy();
        panel.style.display = 'none';
      }
    },
    setJoyVisible(visible) {
      joy.style.display = visible ? 'block' : 'none';
      if (!visible) resetJoy();
    },
    // label = chữ trên nút; null thì ẩn nút (không có ghế gần / không đang ngồi)
    setSitButton(label) {
      btnSit.style.display = label ? 'flex' : 'none';
      if (label) btnSit.textContent = label;
    },
    // Nút con mắt (xoay camera quanh nhân vật): chỉ hiện ở góc nhìn thứ 3; sáng lên khi đang xoay mắt
    setEyeVisible(visible) {
      btnEye.style.display = visible ? 'flex' : 'none';
    },
    setEyeActive(on) {
      btnEye.classList.toggle('on', on);
    },
    setMicOn(on) {
      btnMic.classList.toggle('on', on);
      btnMic.textContent = on ? '\u{1F3A4}' : '\u{1F507}'; // mic đang bật / mic đang tắt
    },
  };
}
