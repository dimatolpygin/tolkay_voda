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
    if (!started) {
      started = true;
      await initAudioGraph(); // включит анализатор, если CORS на CDN открыт
      await playNext();
      return;
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
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
  // Адаптивный: если CDN отдаёт CORS-заголовки для нашего origin — подключаем
  // реальный анализатор частот (дорожка бежит по музыке). Если нет — играем
  // звук без WebAudio (чтобы cross-origin не заглушил) и рисуем процедурную
  // дорожку. Проверка CORS делается до назначения src и crossOrigin.
  const ctx = canvas.getContext('2d');
  let raf = null;
  let audioCtx = null;
  let analyser = null;
  let freq = null;

  async function initAudioGraph() {
    if (audioCtx || !tracks.length) return;
    let corsOk = false;
    try {
      // строгий cors-запрос: если CDN не вернёт ACAO — fetch отклонится
      const r = await fetch(tracks[0].url, { headers: { Range: 'bytes=0-1' } });
      corsOk = r.ok || r.status === 206;
    } catch {
      corsOk = false;
    }
    if (!corsOk) return; // оставляем процедурный режим, звук не трогаем

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      audio.crossOrigin = 'anonymous'; // ДО первого src
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

    // реальные частоты, если анализатор подключён и отдаёт данные
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
        // реальный спектр (берём нижние 3/4 диапазона — там основная энергия)
        const idx = Math.floor((i / BARS) * data.length * 0.75);
        target = (data[idx] / 255) ** 0.9;
      } else if (playing) {
        // процедурная «живая» дорожка: несколько синусоид разной частоты
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

  // ---- Старт ----
  loadTracks().then(() => {
    fitCanvas();
    raf = requestAnimationFrame(draw);
  });
})();
