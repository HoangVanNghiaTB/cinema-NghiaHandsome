import { el } from './util.js';
import { ROLES, FACTION_NAMES } from './werewolf/roles.js';
import { clipUrl } from './werewolf/narration.js';
import { FRUITS } from '../scene/looks.js';

// Ma Sói: cửa sổ 2D. Bàn tròn có ghế, mỗi người một hình đại diện (trái cây giống nhân vật trong rạp), vai của bạn là một thẻ bài lật được.
// Luật chạy ở server/werewolf.js; ở đây chỉ hiển thị và gửi lựa chọn.
// Giọng quản trò: server gửi sự kiện 'game-cue' (tên file), máy này phát file trong client/public/gm/ (thiếu file thì im lặng).
const PHASE_TITLE = {
  lobby: 'Bàn chờ', countdown: 'Sắp bắt đầu', night: 'Ban đêm', day: 'Ban ngày: thảo luận', vote: 'Bỏ phiếu treo cổ', hunter: 'Thợ Săn chọn người', ended: 'Kết thúc',
};
const PHASE_ICON = { lobby: '🪑', countdown: '⏳', night: '🌙', day: '☀️', vote: '⚖️', hunter: '🏹', ended: '🏆' };
const FRUIT_ICON = { apple: '🍎', orange: '🍊', banana: '🍌', strawberry: '🍓', grape: '🍇', peach: '🍑', lime: '🍋', none: '😀' };
// Hình và màu thẻ bài của từng vai / phe
const ROLE_ICON = {
  dan_lang: '🧑‍🌾', tien_tri: '🔮', bao_ve: '🛡️', tho_san: '🏹', phu_thuy: '🧪', thi_truong: '🎩', hoang_tu: '🤴', ngoai_cam: '👻', tinh_yeu: '💘',
  ma_soi: '🐺', soi_con: '🐾', soi_dau_dan: '🌕', phan_boi: '🎭', chan_doi: '🤡', soi_trang: '🤍',
};
const FACTION_COLOR = { dan: '#3d9b6a', soi: '#c4413a', chan_doi: '#8e5bc4', soi_trang: '#b9c2d0' };

// CSS riêng của game (nhúng một lần)
function ensureStyle() {
  if (document.getElementById('ww-style')) return;
  const st = document.createElement('style');
  st.id = 'ww-style';
  st.textContent = `
    .ww-table { position:relative; flex:1.7; min-width:0; min-height:260px; }
    .ww-felt { position:absolute; left:19%; right:19%; top:19%; bottom:19%; border-radius:50%; background:radial-gradient(ellipse at 40% 35%, #3c7a52, #214a33 70%); border:6px solid #6b4423; box-shadow:inset 0 0 30px rgba(0,0,0,.5), 0 6px 20px rgba(0,0,0,.5); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:8%; box-sizing:border-box; transition:background .6s; }
    .ww-night .ww-felt { background:radial-gradient(ellipse at 40% 35%, #26335a, #0d1226 70%); }
    .ww-seat { position:absolute; width:0; height:0; }
    .ww-chair { position:absolute; width:64px; height:46px; left:-32px; top:-36px; border-radius:18px 18px 6px 6px; background:#6b4423; border:2px solid #4a2d14; box-sizing:border-box; }
    .ww-seat.empty .ww-chair { opacity:.45; }
    .ww-avatar { position:absolute; width:48px; height:48px; left:-24px; top:-24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:26px; border:3px solid rgba(255,255,255,.35); box-shadow:0 2px 6px rgba(0,0,0,.5); background:#555; }
    .ww-avatar.me { border-color:#ffd36b; }
    .ww-avatar.pick { border-color:#6bd1ff; cursor:pointer; animation:wwpulse 1.1s ease-in-out infinite; }
    .ww-avatar.chosen { border-color:#ffd36b; box-shadow:0 0 12px #ffd36b; animation:none; }
    .ww-avatar.dead { filter:grayscale(1) brightness(.6); }
    .ww-avatar.empty { background:rgba(255,255,255,.08); border-style:dashed; font-size:18px; color:#aaa; }
    .ww-avatar.sitme { cursor:pointer; }
    .ww-votes { position:absolute; left:-40px; width:80px; top:-52px; text-align:center; font-size:20px; line-height:1; letter-spacing:2px; color:#ff5d5d; text-shadow:0 1px 3px #000; pointer-events:none; }
    .ww-votes.wolf { color:#c58bff; }
    .ww-badge { position:absolute; right:-8px; top:-10px; font-size:15px; }
    .ww-dead { position:absolute; left:0; right:0; top:0; bottom:0; display:flex; align-items:center; justify-content:center; font-size:24px; }
    .ww-name { position:absolute; left:-46px; width:92px; top:26px; text-align:center; font-size:11px; line-height:1.15; text-shadow:0 1px 2px #000; pointer-events:none; }
    .ww-name b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ww-pill { display:inline-block; background:rgba(0,0,0,.55); border-radius:8px; padding:0 5px; font-size:10px; margin-top:1px; }
    .ww-center-icon { font-size:34px; line-height:1; }
    .ww-timer { font-size:30px; font-weight:bold; color:#ffd36b; line-height:1.1; }
    .ww-center-text { font-size:12px; opacity:.85; }
    @keyframes wwpulse { 0%,100% { box-shadow:0 0 0 0 rgba(107,209,255,.7); } 50% { box-shadow:0 0 0 8px rgba(107,209,255,0); } }
    .ww-cardwrap { perspective:700px; width:150px; height:208px; align-self:center; flex:none; cursor:pointer; }
    .ww-card { position:relative; width:100%; height:100%; transition:transform .6s; transform-style:preserve-3d; transform:rotateY(180deg); }
    .ww-card.face { transform:rotateY(0deg); }
    .ww-face, .ww-back { position:absolute; inset:0; backface-visibility:hidden; border-radius:12px; box-sizing:border-box; }
    .ww-back { transform:rotateY(180deg); background:repeating-linear-gradient(45deg,#2a2f55,#2a2f55 8px,#343a6e 8px,#343a6e 16px); border:4px solid #8f97d6; display:flex; align-items:center; justify-content:center; font-size:46px; }
    .ww-face { background:linear-gradient(160deg,#fdf6e3,#e9dcb9); color:#2b2b2b; border:5px solid var(--fc); display:flex; flex-direction:column; align-items:center; padding:8px 8px 6px; text-align:center; }
    .ww-card-rank { align-self:stretch; display:flex; justify-content:space-between; font-size:11px; font-weight:bold; color:var(--fc); }
    .ww-card-icon { font-size:48px; margin:4px 0 0; line-height:1.1; }
    .ww-card-name { font-weight:bold; font-size:16px; margin-top:2px; }
    .ww-card-ribbon { background:var(--fc); color:#fff; border-radius:8px; padding:0 8px; font-size:11px; margin:3px 0; }
    .ww-card-desc { font-size:10.5px; line-height:1.25; flex:1; overflow:hidden; }
    .ww-card.dead .ww-face { filter:grayscale(.9); }
    .ww-stamp { position:absolute; inset:0; display:none; align-items:center; justify-content:center; font-size:26px; font-weight:bold; color:#c4413a; transform:rotate(-18deg); border-radius:12px; background:rgba(255,255,255,.35); }
    .ww-card.dead .ww-stamp { display:flex; }
    .ww-panel { background:rgba(255,255,255,.08); border-radius:6px; padding:6px 8px; font-size:13px; }
  `;
  document.head.appendChild(st);
}

export default {
  id: 'werewolf',
  title: 'Ma Sói',
  mount(root, ctx) {
    ensureStyle();
    const wrap = el('div', 'g-ww');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;height:100%;padding:6px;box-sizing:border-box;border-radius:8px;transition:background .6s;color:#eee';
    const top = el('div');
    top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:bold;color:#ffd36b';
    const title = el('span');
    const micInfo = el('span');
    micInfo.style.cssText = 'font-size:12px;font-weight:normal;color:#ccc';
    top.append(title, micInfo);
    const main = el('div');
    main.style.cssText = 'display:flex;gap:10px;flex:1;min-height:0';
    const table = el('div', 'ww-table');
    const right = el('div');
    right.style.cssText = 'flex:1;min-width:170px;max-width:240px;display:flex;flex-direction:column;gap:6px;overflow:auto';
    main.append(table, right);
    wrap.append(top, main);
    root.appendChild(wrap);

    let s = null;
    let offset = 0; // giờ máy mình - giờ server
    let picked = []; // lựa chọn đang chọn dở cho khung việc hiện tại
    let pickKey = '';
    let chatDraft = '';
    let logEl = null; // khung chat đang hiện (để cập nhật tin mới mà không dựng lại cả cửa sổ lúc đang gõ)
    let timerEl = null;
    let cardFace = true; // thẻ bài đang ngửa hay úp (bấm vào thẻ để úp lại, tránh người bên cạnh nhìn trộm)
    let dealtKey = '';

    const btn = (text, onClick, cls = 'g-btn') => {
      const b = el('button', cls, text);
      b.addEventListener('click', onClick);
      return b;
    };
    const send = (data) => ctx.send(data);
    const panel = (...kids) => {
      const d = el('div', 'ww-panel');
      d.append(...kids);
      return d;
    };

    // ----- giọng quản trò -----
    const audios = new Set();
    function playCue(clip) {
      if (!clip) return;
      const a = new Audio(clipUrl(clip));
      audios.add(a);
      a.addEventListener('ended', () => audios.delete(a));
      a.addEventListener('error', () => audios.delete(a)); // chưa thu file thì bỏ qua
      a.play().catch(() => audios.delete(a));
    }

    // ----- mic: đêm và người chết bị tắt, ban ngày tự do -----
    let lastMicOff = null;
    function applyMic(state) {
      const off = !!state.micOff;
      if (off === lastMicOff) return;
      lastMicOff = off;
      if (off) ctx.mic?.lock(true);
      else ctx.mic?.lock(false); // ban ngày mic bật tắt tự do (trả về như trước đêm); không có mic thì nhắn bằng khung chat
    }

    const secLeft = (deadline) => Math.max(0, Math.ceil((deadline - (Date.now() - offset)) / 1000));
    function tick() {
      if (!s || !timerEl) return;
      const d = s.me?.prompt?.deadline ?? (['countdown', 'day', 'vote', 'hunter', 'ended'].includes(s.phase) ? s.deadline : 0);
      timerEl.textContent = d ? `${secLeft(d)}s` : '';
    }
    const timerId = setInterval(tick, 250);

    // ----- bàn tròn -----
    const seatPos = (i, n) => {
      const deg = -90 + (360 * i) / n;
      const a = (deg * Math.PI) / 180;
      return { x: 50 + 42 * Math.cos(a), y: 50 + 40 * Math.sin(a), deg };
    };
    function avatarOf(p) {
      const fruit = FRUITS[p.fruit] ? p.fruit : 'none';
      const a = el('div', 'ww-avatar', FRUIT_ICON[fruit]);
      a.style.background = `radial-gradient(circle at 35% 30%, #fff8, ${FRUITS[fruit].color ?? p.color ?? '#888'} 70%)`;
      return a;
    }
    function seatEl(i, n, build) {
      const pos = seatPos(i, n);
      const seat = el('div', 'ww-seat');
      seat.style.left = `${pos.x}%`;
      seat.style.top = `${pos.y}%`;
      const chair = el('div', 'ww-chair');
      chair.style.transform = `rotate(${pos.deg + 90}deg)`;
      chair.style.transformOrigin = '32px 36px';
      seat.appendChild(chair);
      build(seat);
      return seat;
    }
    function nameTag(text, pill) {
      const n = el('div', 'ww-name');
      n.appendChild(el('b', '', text));
      if (pill) n.appendChild(el('span', 'ww-pill', pill));
      return n;
    }

    function drawCenter() {
      const felt = el('div', 'ww-felt');
      felt.append(el('div', 'ww-center-icon', PHASE_ICON[s.phase]));
      timerEl = el('div', 'ww-timer');
      felt.appendChild(timerEl);
      const sub = s.phase === 'night' ? `Đêm ${s.nightNo}` : s.dayNo && ['day', 'vote', 'hunter'].includes(s.phase) ? `Ngày ${s.dayNo}` : PHASE_TITLE[s.phase];
      felt.appendChild(el('div', 'ww-center-text', sub));
      if (s.phase === 'lobby') felt.appendChild(el('div', 'ww-center-text', `${s.seats.filter(Boolean).length}/${s.max} người`));
      return felt;
    }

    function drawLobby() {
      table.classList.remove('ww-night');
      table.appendChild(drawCenter());
      const canSit = s.mySeat < 0 && s.phase === 'lobby' && (ctx.wallet?.().pts ?? 0) >= s.fee;
      s.seats.forEach((seatInfo, i) => {
        table.appendChild(seatEl(i, s.max, (seat) => {
          if (seatInfo) {
            const a = avatarOf(seatInfo);
            if (i === s.mySeat) a.classList.add('me');
            seat.append(a, nameTag(seatInfo.name + (i === s.mySeat ? ' (bạn)' : '')));
          } else {
            const a = el('div', 'ww-avatar empty', canSit ? '+' : '');
            seat.classList.add('empty');
            if (canSit) {
              a.classList.add('sitme');
              a.title = 'Ngồi vào ghế này';
              a.addEventListener('click', () => send({ op: 'sit', seat: i }));
            }
            seat.appendChild(a);
          }
        }));
      });
    }

    function drawMatchTable(prompt) {
      table.classList.toggle('ww-night', s.phase === 'night');
      table.appendChild(drawCenter());
      const n = s.players.length;
      s.players.forEach((p, i) => {
        table.appendChild(seatEl(i, n, (seat) => {
          const a = avatarOf(p);
          const selectable = prompt && !prompt.done && prompt.kind !== 'info' && prompt.kind !== 'yesno' && prompt.targets?.includes(p.idx);
          if (p.isMe) a.classList.add('me');
          if (!p.alive) a.classList.add('dead');
          if (selectable) {
            a.classList.add('pick');
            a.addEventListener('click', () => {
              if (prompt.kind === 'pick1') {
                picked = [p.idx];
                send({ op: 'act', value: p.idx });
              } else {
                picked = picked.includes(p.idx) ? picked.filter((k) => k !== p.idx) : [...picked, p.idx].slice(-2);
                if (picked.length === 2) send({ op: 'act', value: picked });
              }
              render();
            });
          }
          const chosen = prompt?.done ? [].concat(prompt.chosen ?? []) : picked;
          if (chosen.includes(p.idx)) a.classList.add('chosen');
          const nv = p.votes ?? p.wolfVotes;
          if (nv) {
            const v = el('div', `ww-votes${p.votes ? '' : ' wolf'}`, nv <= 6 ? '●'.repeat(nv) : `● ×${nv}`);
            v.title = `${nv} phiếu`;
            seat.appendChild(v);
          }
          if (!p.alive) a.appendChild(el('div', 'ww-dead', '💀'));
          if (p.mayor && p.alive) a.appendChild(el('div', 'ww-badge', '👑'));
          if (p.left) a.appendChild(el('div', 'ww-badge', '🚪'));
          const bits = [];
          if (p.role) bits.push(`${ROLE_ICON[p.role]} ${ROLES[p.role].name}`);
          if (p.votedFor !== undefined) bits.push(p.votedFor === -1 ? 'phiếu trắng' : `bầu ${s.players[p.votedFor]?.name ?? '?'}`);
          seat.append(a, nameTag(p.name + (p.isMe ? ' (bạn)' : ''), bits.join(' · ')));
        }));
      });
    }

    // ----- thẻ bài của bạn -----
    function roleCard(me) {
      const r = ROLES[me.role];
      const wrapEl = el('div', 'ww-cardwrap');
      wrapEl.title = 'Bấm để úp / ngửa thẻ bài';
      const card = el('div', `ww-card${cardFace ? ' face' : ''}${me.alive ? '' : ' dead'}`);
      const face = el('div', 'ww-face');
      face.style.setProperty('--fc', FACTION_COLOR[r.faction]);
      const rank = el('div', 'ww-card-rank');
      rank.append(el('span', '', 'MA SÓI'), el('span', '', `${r.score > 0 ? '+' : ''}${r.score}`));
      face.append(rank, el('div', 'ww-card-icon', ROLE_ICON[me.role]), el('div', 'ww-card-name', r.name), el('div', 'ww-card-ribbon', FACTION_NAMES[r.faction]), el('div', 'ww-card-desc', r.desc));
      face.appendChild(el('div', 'ww-stamp', 'ĐÃ CHẾT'));
      card.append(face, el('div', 'ww-back', '🐺'));
      wrapEl.appendChild(card);
      wrapEl.addEventListener('click', () => {
        cardFace = !cardFace;
        card.classList.toggle('face', cardFace);
      });
      return wrapEl;
    }

    // ----- khung bên phải -----
    // Mô tả điều bạn đã chọn (mỗi khung chỉ chọn được một lần)
    function chosenText(prompt) {
      const c = prompt.chosen;
      if (prompt.kind === 'yesno') return `Bạn đã chọn: ${c ? 'Có' : 'Không'}.`;
      if (c == null) return 'Bạn đã bỏ qua.';
      const names = [].concat(c).map((i) => s.players[i]?.name ?? '?');
      return `Bạn đã chọn: ${names.join(' và ')}.`;
    }

    // Cảnh báo: mỗi lựa chọn chỉ có một lần, bấm nhầm là mất
    function warning(prompt) {
      const w = el('div', '', prompt.key === 'vote' ? '⚠️ Vote cho chuẩn: bấm nhầm là mất phiếu, không đổi được!' : '⚠️ Chọn cho chuẩn: bấm nhầm là mất lượt, không đổi được!');
      w.style.cssText = 'color:#ffb74d;font-weight:bold;font-size:12px;margin-top:4px';
      return w;
    }

    function promptBox(prompt) {
      const parts = [el('div', '', prompt.text)];
      if (prompt.info?.length) parts.push(el('div', 'g-dim', prompt.info.join(' · ')));
      const row = el('div');
      row.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap';
      if (prompt.done) {
        const done = el('div', '', `✔ ${chosenText(prompt)}`);
        done.style.cssText = 'color:#7be08a;font-weight:bold;margin-top:4px';
        parts.push(done, el('div', 'g-dim', 'Không đổi được nữa, chờ người khác.'));
      } else if (prompt.kind === 'yesno') {
        row.append(btn('Có', () => send({ op: 'act', value: true })), btn('Không', () => send({ op: 'act', value: false })));
        parts.push(warning(prompt));
      } else if (prompt.kind !== 'info') {
        parts.push(el('div', 'g-dim', prompt.kind === 'pick2' ? `Bấm hai người trên bàn (${picked.length}/2)` : 'Bấm vào một người trên bàn'), warning(prompt));
        if (prompt.allowSkip) row.append(btn('Bỏ qua', () => send({ op: 'act', value: null })));
      }
      parts.push(row);
      const b = panel(...parts);
      b.style.border = '1px solid #ffd36b';
      return b;
    }

    function fillLog() {
      if (!logEl) return;
      logEl.replaceChildren();
      for (const m of s.log) {
        const line = el('div', '', `${m.ch === 'wolf' ? '🐺 ' : ''}${m.name}: ${m.text}`);
        if (m.ch === 'wolf') line.style.color = '#ff9a9a';
        logEl.appendChild(line);
      }
      logEl.scrollTop = logEl.scrollHeight;
    }

    function chatBox() {
      const canChat = s.me?.alive && ((s.phase === 'night' && ROLES[s.me.role].pack) || s.phase === 'day' || s.phase === 'vote');
      const log = el('div');
      log.style.cssText = 'flex:1;min-height:60px;max-height:130px;overflow:auto;font-size:12px;background:rgba(0,0,0,.25);border-radius:6px;padding:4px 6px';
      logEl = log;
      fillLog();
      const form = el('div');
      form.style.cssText = 'display:flex;gap:4px';
      const input = el('input');
      input.type = 'text';
      input.maxLength = 120;
      input.value = chatDraft;
      input.placeholder = canChat ? (s.phase === 'night' ? 'Chat riêng của Sói' : 'Chat của ván') : s.me?.alive ? 'Chưa chat được lúc này' : 'Người chết không chat được';
      input.disabled = !canChat;
      input.style.cssText = 'flex:1;min-width:0;padding:4px;border-radius:4px;border:1px solid #444;background:#111;color:#fff';
      input.addEventListener('input', () => (chatDraft = input.value));
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        chatDraft = '';
        input.value = '';
        send({ op: 'chat', text });
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation(); // gõ chữ không kích hoạt phím tắt của rạp
        if (e.key === 'Enter') submit();
      });
      form.append(input, btn('Gửi', submit));
      const box = el('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:4px';
      box.append(log, form);
      return box;
    }

    function drawLobbyRight() {
      const n = s.seats.filter(Boolean).length;
      const poor = (ctx.wallet?.().pts ?? 0) < s.fee;
      right.append(
        panel(el('b', '', `Mỗi ván mất ${s.fee} điểm/người`), el('div', 'g-dim', `Cần ${s.min} đến ${s.max} người ngồi. Thắng được lãi: Dân +${s.profit.dan}, Sói +${s.profit.soi}, Chán Đời +${s.profit.chan_doi}, Sói Trắng +${s.profit.soi_trang}. Ngồi rồi đứng dậy trước khi ván bắt đầu thì không mất điểm.`)),
      );
      if (s.mySeat < 0) {
        right.appendChild(el('div', 'g-dim', poor ? `Cần ít nhất ${s.fee} điểm.` : 'Bấm vào một ghế trống để ngồi.'));
      } else {
        const start = btn(s.phase === 'countdown' ? `Bắt đầu sau ${secLeft(s.deadline)}s` : `Bắt đầu (cần ${s.min}, đang ${n})`, () => send({ op: 'start' }));
        start.disabled = s.phase !== 'lobby' || n < s.min;
        right.append(start, btn('Rời bàn', () => send({ op: 'stand' })));
      }
    }

    function drawResult() {
      const r = s.result;
      if (!r) return;
      const lines = [el('b', '', r.label)];
      for (const p of r.payouts) {
        const info = s.players.find((x) => x.name === p.name);
        lines.push(el('div', '', `${info?.role ? ROLE_ICON[info.role] : ''} ${p.name}${info?.role ? ` (${ROLES[info.role].name})` : ''}: ${p.delta >= 0 ? '+' : ''}${p.delta} điểm${p.left ? ' (bỏ cuộc)' : ''}`));
      }
      right.appendChild(panel(...lines));
      right.appendChild(el('div', 'g-dim', 'Sắp về bàn chờ...'));
    }

    function drawMatchRight() {
      const me = s.me;
      const prompt = me?.prompt;
      const key = prompt ? `${prompt.key ?? prompt.kind}:${s.nightNo}:${s.dayNo}:${s.phase}:${prompt.text}` : '';
      if (key !== pickKey) {
        pickKey = key;
        picked = [];
      }
      if (me) {
        right.appendChild(roleCard(me));
        if (!me.alive) right.appendChild(panel('💀 Bạn đã chết. Mic và chat bị tắt tới hết ván, bạn vẫn xem được.'));
        else if (me.left) right.appendChild(panel('Bạn đã rời ván.'));
      } else {
        right.appendChild(panel('Bạn đang xem. Ván này đã bắt đầu, chờ ván sau để ngồi chơi.'));
      }
      if (prompt) right.appendChild(promptBox(prompt));
      else if (s.phase === 'night') right.appendChild(panel(me?.alive ? '😴 Bạn đang ngủ... Chờ quản trò gọi.' : 'Trời tối.'));
      else if (s.phase === 'hunter') right.appendChild(panel('Thợ Săn đang chọn người bắn...'));
      if (s.announce.length) right.appendChild(panel(...s.announce.map((t) => el('div', '', t))));
      if (me?.notes.length) right.appendChild(panel(el('b', '', 'Ghi chú của bạn'), ...me.notes.map((t) => el('div', 'g-dim', t))));
      if (s.phase !== 'ended') right.appendChild(chatBox());
      if (s.phase === 'ended') drawResult();
      if (me && !me.left && s.phase !== 'ended') {
        right.appendChild(btn('Bỏ cuộc', () => {
          if (confirm(`Bỏ giữa ván là thua và mất ${s.fee} điểm phí. Chắc chưa?`)) send({ op: 'stand' });
        }));
      }
    }

    function render() {
      if (!s) return;
      table.replaceChildren();
      const keepScroll = right.scrollTop;
      right.replaceChildren();
      timerEl = null;
      micInfo.textContent = '';
      if (s.phase === 'lobby' || s.phase === 'countdown') {
        title.textContent = s.phase === 'countdown' ? 'Sắp bắt đầu...' : 'Bàn chờ Ma Sói';
        wrap.style.background = '#2a2f3d';
        drawLobby();
        drawLobbyRight();
      } else {
        const me = s.me;
        title.textContent = PHASE_TITLE[s.phase];
        wrap.style.background = s.phase === 'night' ? '#0b1020' : s.phase === 'ended' ? '#1a1a22' : '#2a2f3d';
        // thẻ bài ngửa lại mỗi khi bắt đầu ván mới
        const dk = me ? `${s.players.length}:${me.role}` : '';
        if (dk !== dealtKey) {
          dealtKey = dk;
          cardFace = true;
        }
        drawMatchTable(me?.prompt);
        drawMatchRight();
      }
      right.scrollTop = keepScroll;
      tick();
    }

    return {
      state(next) {
        // Đang gõ chat thì không dựng lại cả khung (mất chữ / mất con trỏ): chỉ cập nhật tin nhắn và đồng hồ
        const typing = document.activeElement?.tagName === 'INPUT' && root.contains(document.activeElement);
        const samePrompt = s?.me?.prompt?.text === next.me?.prompt?.text;
        const prevPhase = s?.phase;
        s = next;
        offset = Date.now() - next.now;
        applyMic(next);
        if (typing && prevPhase === next.phase && samePrompt) {
          fillLog();
          tick();
          return;
        }
        render();
      },
      cue(d) {
        playCue(d.clip);
      },
      destroy() {
        clearInterval(timerId);
        for (const a of audios) a.pause();
        audios.clear();
        ctx.mic?.lock(false); // đóng cửa sổ thì trả mic về như cũ
      },
    };
  },
};
