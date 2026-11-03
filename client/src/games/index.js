import { sfx } from '../audio/sfx.js';
import caro from './caro.js';
import whack from './whack.js';
import snake from './snake.js';
import g2048 from './g2048.js';
import dice from './dice.js';
import connect4 from './connect4.js';
import vote from './vote.js';
import wallet from './wallet.js';
import sound from './sound.js';
import werewolf from './werewolf.js';

// Đăng ký game: id khớp với GAME_PANELS (scene/gamePanels.js) và server/games.js.
// Mỗi game: { title, mount(rootEl, ctx) -> { state(s), destroy() } }
//   ctx.send(data)  gửi thao tác lên server (game-act); ctx.me() -> { id, name }; ctx.isTouch
//   ctx.playVideo(videoId) chiếu video cho cả rạp; ctx.close() đóng game
//   ctx.wallet() -> { pts, owned } điểm hiện có; game có hàm onWallet() thì được gọi mỗi khi điểm đổi
//   game có `local: true` (như ví) không có phòng riêng ở server; `extra` (từ main.js) thêm các hàm riêng vào ctx
const GAMES = { caro, whack, snake, g2048, dice, connect4, vote, wallet, sound, werewolf };

// Khung chung: mở/đóng overlay, nối game với mạng
//   net()      trả về kết nối phòng hiện tại (hoặc null)
//   me()       { id, name } của người chơi này
export function createGameHost({ overlay, titleEl, bodyEl, net, me, isTouch, onClose, requestClose, wallet: getWallet, extra = {} }) {
  let current = null; // { id, inst }
  // Mọi nút bấm trong cửa sổ game đều có tiếng click (ô đập chuột có tiếng riêng)
  bodyEl.addEventListener('click', (e) => {
    if (e.target.closest('button:not(.g-hole)')) sfx.play('click');
  });

  function open(id) {
    const def = GAMES[id];
    if (current || !def || !net()) return false;
    titleEl.textContent = def.title;
    bodyEl.replaceChildren();
    overlay.style.display = 'flex';
    const ctx = { send: (data) => net()?.gameAct(id, data), me, isTouch, playVideo: (videoId) => net()?.loadVideo(videoId), close: requestClose, wallet: getWallet, ...extra };
    current = { id, def, inst: def.mount(bodyEl, ctx) };
    sfx.play('open');
    if (!def.local) net().gameOpen(id);
    return true;
  }

  function close() {
    if (!current) return;
    const { id, def, inst } = current;
    current = null;
    inst.destroy?.();
    sfx.play('close');
    if (!def.local) net()?.gameClose(id);
    overlay.style.display = 'none';
    bodyEl.replaceChildren();
    onClose?.();
  }

  return {
    open,
    close,
    get openId() {
      return current?.id ?? null;
    },
    onWallet() {
      current?.inst.onWallet?.();
    },
    onState({ game, state }) {
      if (current?.id === game) current.inst.state?.(state);
    },
    // Sự kiện một chiều từ server (giọng quản trò Ma Sói...)
    onCue(data) {
      if (current?.id === data.game) current.inst.cue?.(data);
    },
  };
}
