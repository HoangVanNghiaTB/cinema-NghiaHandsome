import { io } from 'socket.io-client';

// Dev: server chạy riêng ở cổng 3000. Production: cùng origin với trang.
const SERVER_URL = import.meta.env.DEV ? `http://${location.hostname}:3000` : undefined;

// handlers: { onInit(id, players, video, iceServers), onJoin(player), onMove(data), onLeave(id), onFull(),
//             onStatus(connected), onVideo({ videoId, playing, position }), onSignal(from, data),
//             onChat({ id, name, text }), onSeat({ id, seat }), onSeatDenied(),
//             onStun({ id, by, duration }), onStage({ id, stage }), onStageDenied(),
//             onEmote({ id, type, on? }), onSwing({ id }) }
export function connectToRoom({ name, color }, handlers) {
  const socket = io(SERVER_URL);

  socket.on('connect', () => {
    handlers.onStatus?.(true);
    socket.emit('join', { name, color });
  });
  socket.on('disconnect', () => handlers.onStatus?.(false));
  socket.on('init', ({ id, players, video, iceServers }) => handlers.onInit?.(id, players, video, iceServers));
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
  socket.on('room-full', () => handlers.onFull?.());

  return {
    sendMove: (state) => socket.volatile.emit('move', state),
    punch: () => socket.emit('punch'),
    emote: (type) => socket.emit('emote', { type }),
    sing: (stage) => socket.emit('sing', { stage }),
    stopSing: () => socket.emit('stop-sing'),
    sit: (seat) => socket.emit('sit', { seat }),
    stand: () => socket.emit('stand'),
    sendChat: (text) => socket.emit('chat', { text }),
    close: () => socket.close(),
    sendSignal: (to, data) => socket.emit('signal', { to, data }),
    loadVideo: (videoId) => socket.emit('video-load', { videoId }),
    playVideo: (position) => socket.emit('video-play', { position }),
    pauseVideo: (position) => socket.emit('video-pause', { position }),
    seekVideo: (position) => socket.emit('video-seek', { position }),
  };
}
