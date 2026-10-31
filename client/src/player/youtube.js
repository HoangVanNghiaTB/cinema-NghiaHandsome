let apiPromise;

function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

// Nhận link YouTube (watch, youtu.be, embed, shorts) hoặc ID 11 ký tự; trả về videoId hoặc null
export function parseVideoId(input) {
  const text = (input || '').trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
      if (m) id = m[2];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

const ERROR_MESSAGES = {
  2: 'Link video không hợp lệ.',
  5: 'Trình phát gặp lỗi, thử lại sau.',
  100: 'Không tìm thấy video (đã xoá hoặc riêng tư).',
  101: 'Video này cấm chiếu bên ngoài YouTube.',
  150: 'Video này cấm chiếu bên ngoài YouTube.',
};

// Tạo player trong phần tử `el`. Trả về điều khiển sau khi player sẵn sàng.
export async function createYouTubePlayer(el, { width = 1280, height = 720, onStateChange, onError } = {}) {
  await loadApi();
  return new Promise((resolve) => {
    const player = new window.YT.Player(el, {
      width,
      height,
      playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, modestbranding: 1 },
      events: {
        onReady: () =>
          resolve({
            load: (videoId, startSeconds = 0) => player.loadVideoById(videoId, startSeconds),
            cue: (videoId, startSeconds = 0) => player.cueVideoById(videoId, startSeconds), // nạp nhưng không phát
            setVolume: (percent) => player.setVolume(percent), // 0..100, chỉ đổi âm lượng của riêng máy này
            mute: () => player.mute(),
            destroy: () => player.destroy(),
            play: () => player.playVideo(),
            pause: () => player.pauseVideo(),
            seek: (seconds) => player.seekTo(seconds, true),
            getTime: () => player.getCurrentTime(),
            getState: () => player.getPlayerState(), // 1 = đang phát, 2 = tạm dừng
          }),
        onStateChange: (e) => onStateChange && onStateChange(e.data),
        onError: (e) => onError && onError(ERROR_MESSAGES[e.data] || 'Không phát được video.'),
      },
    });
  });
}
