import { io } from 'socket.io-client';

// Dev: server chạy riêng ở cổng 3000. Production: cùng origin với trang.
const SERVER_URL = import.meta.env.DEV ? `http://${location.hostname}:3000` : undefined;

// handlers: { onInit(id, players, video, iceServers, mix), onJoin(player), onMove(data), onLeave(id), onFull(),
//             onStatus(connected), onVideo({ videoId, playing, position }), onSignal(from, data),
//             onChat({ id, name, text }), onSeat({ id, seat }), onSeatDenied(),
//             onStun({ id, by, duration }), onStage({ id, stage }), onStageDenied(),
//             onEmote({ id, type, on? }), onSwing({ id }), onMix(params), onLook({ id, look }),
//             onGameState({ game, state }), onGameBrief({ game, text }), onWallet({ pts, owned, delta, reason }), onNotice({ text }) };
//             onDenied(reason) khi phòng từ chối (sai mật khẩu...); onInit còn nhận thêm briefs của các game và self = { look, wallet } (nhân vật đã lọc phụ kiện chưa mua, điểm hiện có)
// Mã nhận dạng trình duyệt này (để tải lại trang vẫn giữ điểm và phụ kiện đã mua trong phòng)
const CLIENT_ID_KEY = 'cinema-client-id';
function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!/^[\w-]{8,64}$/.test(id ?? '')) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`).replace(/[^\w-]/g, '');
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return null; // không lưu được thì server dùng id kết nối (mỗi lần vào là một tài khoản mới)
  }
}

// room: id phòng (xem rooms.js), mỗi phòng là một namespace socket.io riêng; password: chỉ phòng khoá mới cần.
// Server từ chối thì gọi handlers.onDenied('bad-password' | 'no-password-configured' | 'too-many').
export function connectToRoom({ name, color, look, room, password }, handlers) {
  const clientId = getClientId();
  const socket = io(`${SERVER_URL ?? ''}/${room}`, { auth: { password: password ?? '' } });
  socket.on('connect_error', (err) => {
    if (['bad-password', 'no-password-configured', 'too-many', 'banned'].includes(err.message)) {
      socket.disconnect(); // bị từ chối thì không tự thử lại
      handlers.onDenied?.(err.message);
    }
  });

  socket.on('connect', () => {
    handlers.onStatus?.(true);
    socket.emit('join', { name, color, look, clientId });
  });
  socket.on('disconnect', () => handlers.onStatus?.(false));
  socket.on('init', ({ id, players, video, iceServers, mix, games, self }) => handlers.onInit?.(id, players, video, iceServers, mix, games, self));
  socket.on('trash-add', (t) => handlers.onTrashAdd?.(t));
  socket.on('trash-gone', (id) => handlers.onTrashGone?.(id));
  socket.on('wallet', (w) => handlers.onWallet?.(w));
  socket.on('notice', (n) => handlers.onNotice?.(n));
  socket.on('game-state', (d) => handlers.onGameState?.(d));
  socket.on('game-denied', () => handlers.onGameDenied?.());
  socket.on('game-cue', (d) => handlers.onGameCue?.(d));
  socket.on('game-brief', (d) => handlers.onGameBrief?.(d));
  socket.on('mix-state', (m) => handlers.onMix?.(m));
  socket.on('look-update', (d) => handlers.onLook?.(d));
  socket.on('video-state', (v) => handlers.onVideo?.(v));
  socket.on('signal', ({ from, data }) => handlers.onSignal?.(from, data));
  socket.on('chat', (m) => handlers.onChat?.(m));
  socket.on('stun', (d) => handlers.onStun?.(d));
  socket.on('emote', (d) => handlers.onEmote?.(d));
  socket.on('swing', (d) => handlers.onSwing?.(d));
  socket.on('stage-update', (d) => handlers.onStage?.(d));
  socket.on('stage-denied', () => handlers.onStageDenied?.());
  socket.on('seat-update', (d) => handlers.onSeat?.(d));
  socket.on('seat-denied', () => handlers.onSeatDenied?.());
  socket.on('player-joined', (p) => handlers.onJoin?.(p));
  socket.on('player-moved', (d) => handlers.onMove?.(d));
  socket.on('player-left', (id) => handlers.onLeave?.(id));
  socket.on('banned', () => {
    socket.disconnect();
    handlers.onDenied?.('banned');
  });
  socket.on('room-full', () => handlers.onFull?.());

  return {
    sendMove: (state) => socket.volatile.emit('move', state),
    punch: () => socket.emit('punch'),
    emote: (type) => socket.emit('emote', { type }),
    sing: (stage) => socket.emit('sing', { stage }),
    stopSing: () => socket.emit('stop-sing'),
    singPay: () => socket.emit('sing-pay'),
    pickTrash: (id) => socket.emit('trash-pick', { id }),
    tip: (to, amt) => socket.emit('tip', { to, amt }),
    buy: (slot, item) => socket.emit('shop-buy', { slot, item }),
    sit: (seat) => socket.emit('sit', { seat }),
    stand: () => socket.emit('stand'),
    sendChat: (text) => socket.emit('chat', { text }),
    setLook: (look) => socket.emit('look', { look }),
    setMix: (key, value) => socket.emit('mix-set', { key, value }),
    resetMix: () => socket.emit('mix-reset'),
    gameOpen: (game) => socket.emit('game-open', { game }),
    gameClose: (game) => socket.emit('game-close', { game }),
    gameAct: (game, data) => socket.emit('game-act', { ...data, game }),
    close: () => socket.close(),
    sendSignal: (to, data) => socket.emit('signal', { to, data }),
    loadVideo: (videoId) => socket.emit('video-load', { videoId }),
    playVideo: (position) => socket.emit('video-play', { position }),
    pauseVideo: (position) => socket.emit('video-pause', { position }),
    seekVideo: (position) => socket.emit('video-seek', { position }),
  };
}
