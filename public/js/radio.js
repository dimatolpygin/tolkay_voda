// Радио: случайный трек по кнопке, автопереход, визуализатор дорожки.
(() => {
  const audio = document.getElementById('audio');
  const playBtn = document.getElementById('playBtn');
  const nowTitle = document.getElementById('nowTitle');
  const nowArtist = document.getElementById('nowArtist');
  const nowCover = document.getElementById('nowCover');
  const canvas = document.getElementById('viz');
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  let tracks = [];
  let queue = [];
  let current = null;
  let started = false;

  // ---- Загрузка манифеста ----
  async function loadTracks() {
    try {
      const r = await fetch('/api/tracks');
      const data = await r.json();
      tracks = (data.tracks || []).filter((t) => t && t.url);
    } catch {
      tracks = [];
    }
  }

  // Перемешанная очередь без повтора подряд
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

  function renderNow(t) {
    nowTitle.textContent = t.title || 'Радио Толкай Вода';
    nowArtist.textContent = t.artist || 'Клан Толкай Вода';
    if (t.cover) nowCover.src = t.cover;
  }

  async function playNext() {
    const t = nextTrack();
    if (!t) {
      nowTitle.textContent = 'Треки не найдены';
      return;
    }
    current = t;
    renderNow(t);
    audio.src = t.url;
    playBtn.classList.add('is-loading');
    try {
      await audio.play();
    } catch (e) {
      playBtn.classList.remove('is-loading');
    }
  }

  // ---- Кнопка ----
  playBtn.addEventListener('click', async () => {
    ensureViz();
    if (!started) {
      started = true;
      await playNext();
      return;
    }
    if (audio.paused) {
      try { await audio.play(); } catch {}
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
  audio.addEventListener('ended', () => playNext());
  audio.addEventListener('error', () => {
    if (started) setTimeout(playNext, 600); // битый трек — пропускаем
  });

  // ---- Визуализатор ----
  const ctx = canvas.getContext('2d');
  let analyser = null;
  let freq = null;
  let audioCtx = null;
  let srcNode = null;
  let raf = null;

  function ensureViz() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      srcNode = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      freq = new Uint8Array(analyser.frequencyBinCount);
      srcNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch {
      analyser = null; // нет WebAudio — используем процедурную анимацию
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
      // если данные пустые (CORS-ограничение CDN) — сработает fallback ниже
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
        const idx = Math.floor((i / BARS) * data.length);
        target = data[idx] / 255;
      } else if (playing) {
        // процедурная «живая» дорожка
        const t = ts / 380;
        target = 0.18 + 0.5 * Math.abs(Math.sin(i * 0.5 + t)) * (0.6 + 0.4 * Math.sin(t * 1.7 + i));
        target = Math.min(1, Math.max(0.05, target));
      } else {
        target = 0.04;
      }
      levels[i] += (target - levels[i]) * 0.35;
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

  // ---- Старт ----
  loadTracks().then(() => {
    fitCanvas();
    raf = requestAnimationFrame(draw);
  });
})();
