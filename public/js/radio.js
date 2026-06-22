// Радио «Толкай Вода».
// Основной режим — ЖИВОЙ ЭФИР: один поток /stream на всех слушателей (Icecast),
// вход с текущей точки, как на радио. «Сейчас играет» — из метаданных потока.
// Если эфир недоступен — автоматический фолбэк на джукбокс (случайные треки с CDN).
(() => {
  const audio = document.getElementById('audio');
  const playBtn = document.getElementById('playBtn');
  const nowTitle = document.getElementById('nowTitle');
  const nowArtist = document.getElementById('nowArtist');
  const nowCover = document.getElementById('nowCover');
  const canvas = document.getElementById('viz');
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const STREAM_URL = '/stream';
  let mode = null; // 'live' | 'jukebox'
  let started = false;
  let nowTimer = null;

  // ---------- Джукбокс (фолбэк) ----------
  let tracks = [];
  let queue = [];
  let current = null;

  async function loadTracks() {
    try {
      const r = await fetch('/api/tracks');
      const data = await r.json();
      tracks = (data.tracks || []).filter((t) => t && t.url);
    } catch {
      tracks = [];
    }
  }

  function reshuffle() {
    queue = [...tracks];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    if (current && queue.length > 1 && queue[0].url === current.url) {
      queue.push(queue.shift());
    }
  }

  function nextTrack() {
    if (!tracks.length) return null;
    if (!queue.length) reshuffle();
    return queue.shift();
  }

  function renderNow(title, artist, cover) {
    nowTitle.textContent = title || 'Радио Толкай Вода';
    nowArtist.textContent = artist || 'Клан Толкай Вода';
    if (cover) nowCover.src = cover;
  }

  async function jukeboxPlayNext() {
    const t = nextTrack();
    if (!t) {
      nowTitle.textContent = 'Треки не найдены';
      return;
    }
    current = t;
    renderNow(t.title, t.artist, t.cover);
    audio.src = t.url;
    playBtn.classList.add('is-loading');
    try {
      await audio.play();
    } catch {
      playBtn.classList.remove('is-loading');
    }
  }

  // ---------- Живой эфир ----------
  async function streamOnline() {
    try {
      const r = await fetch('/api/stream/now', { cache: 'no-store' });
      const j = await r.json();
      return j && j.online === true ? j : null;
    } catch {
      return null;
    }
  }

  function startNowPolling() {
    stopNowPolling();
    const tick = async () => {
      const s = await streamOnline();
      if (!s) return; // не сбиваем подпись на разовой сетевой ошибке
      renderNow(s.title || 'Радио Толкай Вода', s.artist || 'Клан Толкай Вода', null);
    };
    tick();
    nowTimer = setInterval(tick, 12000);
  }
  function stopNowPolling() {
    if (nowTimer) clearInterval(nowTimer);
    nowTimer = null;
  }

  // Эфир: всегда играем с live-точки. На (пере)старте перезапрашиваем поток.
  async function playLive() {
    mode = 'live';
    audio.src = STREAM_URL + '?_=' + Date.now();
    playBtn.classList.add('is-loading');
    try {
      await audio.play();
      startNowPolling();
    } catch {
      playBtn.classList.remove('is-loading');
    }
  }

  async function startPlayback() {
    await initAudioGraph();
    const s = await streamOnline();
    if (s) {
      await playLive();
    } else {
      // Эфир недоступен — джукбокс.
      mode = 'jukebox';
      if (!tracks.length) await loadTracks();
      await jukeboxPlayNext();
    }
  }

  function fallbackToJukebox() {
    stopNowPolling();
    mode = 'jukebox';
    const go = async () => {
      if (!tracks.length) await loadTracks();
      await jukeboxPlayNext();
    };
    go();
  }

  // ---------- Подтверждение возраста (18+) ----------
  // Гейт перед ПЕРВЫМ запуском. Выбор «Мне есть 18 лет» запоминается в localStorage,
  // больше окно не всплывает. Без подтверждения воспроизведение не стартует, но
  // остальной сайт (блог, прогноз) остаётся доступен.
  const AGE_KEY = 'tv_age_confirmed';
  const ageModal = document.getElementById('ageModal');

  function ageConfirmed() {
    try { return localStorage.getItem(AGE_KEY) === '1'; } catch { return false; }
  }

  function ensureAdult() {
    if (ageConfirmed() || !ageModal) return Promise.resolve(true);
    return new Promise((resolve) => {
      const yes = document.getElementById('ageYes');
      const no = document.getElementById('ageNo');
      const deny = document.getElementById('ageDeny');
      const actions = document.getElementById('ageActions');
      const backdrop = ageModal.querySelector('[data-age-close]');

      const close = (val) => {
        ageModal.classList.remove('is-open');
        document.body.style.overflow = '';
        if (deny) deny.hidden = true;
        if (actions) actions.hidden = false;
        yes.removeEventListener('click', onYes);
        no.removeEventListener('click', onNo);
        if (backdrop) backdrop.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onYes = () => { try { localStorage.setItem(AGE_KEY, '1'); } catch {} close(true); };
      const onNo = () => { if (actions) actions.hidden = true; if (deny) deny.hidden = false; };
      const onCancel = () => close(false);
      const onKey = (e) => { if (e.key === 'Escape') close(false); };

      yes.addEventListener('click', onYes);
      no.addEventListener('click', onNo);
      if (backdrop) backdrop.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);

      ageModal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  }

  // ---------- Кнопка ----------
  playBtn.addEventListener('click', async () => {
    if (!started) {
      const ok = await ensureAdult();
      if (!ok) return;
      started = true;
      await startPlayback();
      return;
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (audio.paused) {
      if (mode === 'live') {
        await playLive(); // вернуться в live-точку, а не доигрывать буфер
      } else {
        try { await audio.play(); } catch {}
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener('playing', () => {
    playBtn.classList.remove('is-loading');
    playBtn.classList.add('is-playing');
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.querySelector('.play-btn__label').textContent = 'Пауза';
  });
  audio.addEventListener('pause', () => {
    playBtn.classList.remove('is-playing');
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.querySelector('.play-btn__label').textContent = 'Слушать радио';
  });
  // В джукбоксе по окончании трека — следующий. В эфире поток не кончается.
  audio.addEventListener('ended', () => {
    if (mode === 'jukebox') jukeboxPlayNext();
  });
  audio.addEventListener('error', () => {
    if (!started) return;
    if (mode === 'live') {
      // Эфир отвалился — переходим на джукбокс, чтобы сайт не «онемел».
      fallbackToJukebox();
    } else {
      setTimeout(jukeboxPlayNext, 600); // битый трек — пропускаем
    }
  });

  // ---------- Визуализатор ----------
  // Поток /stream и треки джукбокса (CDN) — для частотного анализа нужен CORS.
  // /stream same-origin (через Caddy) → анализатор работает. Для CDN — если ACAO
  // открыт. Иначе оставляем процедурную дорожку и не трогаем звук.
  const ctx = canvas.getContext('2d');
  let raf = null;
  let audioCtx = null;
  let analyser = null;
  let freq = null;

  async function initAudioGraph() {
    if (audioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      audio.crossOrigin = 'anonymous'; // ДО первого src; для same-origin /stream безвредно
      const srcNode = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      freq = new Uint8Array(analyser.frequencyBinCount);
      srcNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch {
      analyser = null;
    }
  }

  const BARS = 48;
  const levels = new Array(BARS).fill(0);

  function draw(ts) {
    raf = requestAnimationFrame(draw);
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);

    const playing = !audio.paused && started;

    let data = null;
    if (analyser) {
      analyser.getByteFrequencyData(freq);
      if (freq.some((v) => v > 0)) data = freq;
    }

    const gap = 2;
    const bw = (w - gap * (BARS - 1)) / BARS;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#d6a868');
    grad.addColorStop(1, '#a9732f');
    ctx.fillStyle = grad;

    for (let i = 0; i < BARS; i++) {
      let target;
      if (data) {
        const idx = Math.floor((i / BARS) * data.length * 0.75);
        target = (data[idx] / 255) ** 0.9;
      } else if (playing) {
        const t = ts / 360;
        const a = Math.sin(i * 0.45 + t);
        const b = Math.sin(i * 0.17 - t * 1.6);
        const c = Math.sin(i * 0.9 + t * 0.7);
        target = 0.16 + 0.42 * Math.abs(a) + 0.22 * Math.abs(b) * Math.abs(c);
        target = Math.min(1, Math.max(0.06, target));
      } else {
        target = 0.04;
      }
      levels[i] += (target - levels[i]) * 0.3;
      const bh = Math.max(2, levels[i] * h);
      const x = i * (bw + gap);
      const y = (h - bh) / 2;
      const r = Math.min(bw / 2, 2.5);
      roundRect(x, y, bw, bh, r);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  window.addEventListener('resize', fitCanvas);

  // ---------- Старт ----------
  fitCanvas();
  raf = requestAnimationFrame(draw);
})();
