/* =========================================================
   Alien Invaders — a tiny SVG arcade for rbndict.github.io
   Vanilla JS + inline SVG sprites (they live in index.html).
   No canvas, no libraries — just DOM, rAF and WebAudio blips.
   ========================================================= */
(function () {
  'use strict';

  const svg = document.getElementById('gameSvg');
  const stage = document.getElementById('gameStage');
  if (!svg || !stage) return;

  // ---------- dom refs ----------
  const hudScore = document.getElementById('hudScore');
  const hudHigh = document.getElementById('hudHigh');
  const hudWave = document.getElementById('hudWave');
  const hudLives = document.getElementById('hudLives');
  const startHigh = document.getElementById('startHigh');
  const overlays = {
    start: document.getElementById('overlayStart'),
    pause: document.getElementById('overlayPause'),
    over: document.getElementById('overlayOver')
  };
  const overReason = document.getElementById('overReason');
  const overScore = document.getElementById('overScore');
  const overHigh = document.getElementById('overHigh');
  const overBest = document.getElementById('overBest');
  const waveBanner = document.getElementById('waveBanner');
  const waveBannerText = document.getElementById('waveBannerText');
  const btnStart = document.getElementById('btnStart');
  const btnRetry = document.getElementById('btnRetry');
  const btnResume = document.getElementById('btnResume');
  const btnPause = document.getElementById('btnPause');
  const btnSound = document.getElementById('btnSound');
  const btnRestart = document.getElementById('btnRestart');
  const layers = {
    stars: document.getElementById('stars'),
    aliens: document.getElementById('alienLayer'),
    ufo: document.getElementById('ufoLayer'),
    lasers: document.getElementById('laserLayer'),
    bullets: document.getElementById('bulletLayer'),
    ship: document.getElementById('shipLayer'),
    fx: document.getElementById('fxLayer')
  };

  // ---------- constants ----------
  const NS = 'http://www.w3.org/2000/svg';
  const XLINK = 'http://www.w3.org/1999/xlink';
  const W = 640;
  const H = 480;
  const DEFENSE_Y = 410;        // aliens past this line end the mission
  const SHIP_Y = H - 42;
  const SHIP_SPEED = 340;       // units per second
  const BULLET_SPEED = 540;
  const BULLET_COOLDOWN = 0.3;
  const MAX_BULLETS = 3;
  const STEP_X = 12;            // formation side-step per tick
  const STEP_DOWN = 16;         // formation drop when it turns around
  const COLS = 8;
  const ROWS = 4;
  const CELL_X = 58;
  const CELL_Y = 42;
  const MARCH = [110, 98, 87.3, 78]; // the classic four-note march
  const ALIEN_TYPES = [
    { f1: 'spr-alien-a', f2: 'spr-alien-a2', w: 40, points: 30, color: '#ff5d8f' },
    { f1: 'spr-alien-b', f2: 'spr-alien-b2', w: 44, points: 20, color: '#b07cff' },
    { f1: 'spr-alien-c', f2: 'spr-alien-c2', w: 48, points: 10, color: '#4ade80' }
  ];
  const ROW_TYPE = [0, 1, 1, 2];

  // ---------- state ----------
  let state = 'idle'; // idle | playing | paused | over
  let score = 0;
  let high = 0;
  let hiAtStart = 0;
  let wave = 1;
  let lives = 3;
  let aliens = [];
  let bullets = [];
  let lasers = [];
  let ufo = null;
  let ufoClock = 0;
  let nextUfoAt = 16;
  let dir = 1;
  let stepAcc = 0;
  let stepCount = 0;
  let altFrame = false;
  let ship = { x: W / 2, y: SHIP_Y };
  let shipEl = null;
  let left = false;
  let right = false;
  let fireKey = false;
  let firePointer = false;
  let pointerDown = false;
  let pointerX = null;
  let cooldown = 0;
  let invuln = 0;
  let rafId = null;
  let lastTs = 0;
  let bannerTimer = null;
  let waveTimer = null;

  try { high = parseInt(localStorage.getItem('rbndict-invaders-high'), 10) || 0; } catch (e) { high = 0; }
  let soundOn = true;
  try { soundOn = localStorage.getItem('rbndict-invaders-sound') !== 'off'; } catch (e) { soundOn = true; }

  // ---------- svg helpers ----------
  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function useEl(sprite, x, y, parent) {
    const u = el('use', { x: x, y: y }, parent);
    u.setAttribute('href', '#' + sprite);
    u.setAttributeNS(XLINK, 'xlink:href', '#' + sprite);
    return u;
  }

  // ---------- sound (tiny WebAudio blips) ----------
  let audio = null;

  function unlockAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audio = new AC();
    }
    if (audio && audio.state === 'suspended') audio.resume();
  }

  function tone(f0, f1, dur, type, vol) {
    if (!soundOn || !audio) return;
    try {
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* sound is a nice-to-have, never break the game */ }
  }

  function sfx(name) {
    if (!soundOn || !audio) return;
    if (name === 'shoot') tone(900, 240, 0.09, 'square', 0.05);
    else if (name === 'hit') tone(320, 90, 0.14, 'sawtooth', 0.07);
    else if (name === 'boom') tone(140, 32, 0.32, 'triangle', 0.12);
    else if (name === 'hurt') tone(220, 50, 0.28, 'sawtooth', 0.1);
    else if (name === 'ufo') { tone(600, 900, 0.12, 'sine', 0.05); setTimeout(() => tone(900, 600, 0.12, 'sine', 0.05), 110); }
    else if (name === 'step') tone(MARCH[stepCount % 4], MARCH[stepCount % 4] * 0.8, 0.07, 'square', 0.025);
    else if (name === 'wave') [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, f, 0.1, 'square', 0.05), i * 90));
    else if (name === 'over') [392, 311, 233, 155].forEach((f, i) => setTimeout(() => tone(f, f * 0.9, 0.18, 'sawtooth', 0.06), i * 160));
  }

  // ---------- scenery ----------
  function buildStars() {
    for (let i = 0; i < 46; i++) {
      const s = el('circle', {
        cx: (Math.random() * W).toFixed(1),
        cy: (Math.random() * H).toFixed(1),
        r: (Math.random() * 1.3 + 0.4).toFixed(2)
      }, layers.stars);
      s.setAttribute('class', 'star');
      s.style.setProperty('--dur', (2 + Math.random() * 3).toFixed(2) + 's');
      s.style.setProperty('--del', (Math.random() * 3).toFixed(2) + 's');
    }
  }

  function buildShip() {
    shipEl = el('g', { transform: 'translate(' + ship.x + ',' + ship.y + ')' }, layers.ship);
    useEl('spr-ship', -24, -22, shipEl);
  }

  // ---------- formation ----------
  function aliveCount() {
    let n = 0;
    for (const a of aliens) if (a.alive) n++;
    return n;
  }

  function buildFormation() {
    layers.aliens.textContent = '';
    aliens = [];
    const gridW = (COLS - 1) * CELL_X;
    const x0 = (W - gridW) / 2;
    const y0 = 64 + Math.min((wave - 1) * 8, 32);
    for (let r = 0; r < ROWS; r++) {
      const type = ALIEN_TYPES[ROW_TYPE[r]];
      for (let c = 0; c < COLS; c++) {
        const g = el('g', null, layers.aliens);
        const u = useEl(type.f1, -type.w / 2, -16, g);
        u.setAttribute('fill', type.color);
        aliens.push({ el: g, use: u, type: type, x: x0 + c * CELL_X, y: y0 + r * CELL_Y, alive: true });
      }
    }
    drawAliens();
  }

  function drawAliens() {
    for (const a of aliens) {
      if (a.alive) a.el.setAttribute('transform', 'translate(' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ')');
    }
  }

  function stepInterval() {
    const total = COLS * ROWS;
    return Math.max(0.08, (0.62 - (wave - 1) * 0.05) * (0.28 + 0.72 * aliveCount() / total));
  }

  function stepFormation() {
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const a of aliens) {
      if (!a.alive) continue;
      minX = Math.min(minX, a.x - a.type.w / 2);
      maxX = Math.max(maxX, a.x + a.type.w / 2);
      maxY = Math.max(maxY, a.y + 16);
    }
    if (minX === Infinity) return;
    const nx = dir * STEP_X;
    if ((nx > 0 && maxX + nx > W - 12) || (nx < 0 && minX + nx < 12)) {
      dir = -dir;
      for (const a of aliens) if (a.alive) a.y += STEP_DOWN;
      if (maxY + STEP_DOWN >= DEFENSE_Y) { gameOver('invaded'); return; }
    } else {
      for (const a of aliens) if (a.alive) a.x += nx;
    }
    altFrame = !altFrame;
    stepCount++;
    for (const a of aliens) {
      if (!a.alive) continue;
      const sprite = '#' + (altFrame ? a.type.f2 : a.type.f1);
      a.use.setAttribute('href', sprite);
      a.use.setAttributeNS(XLINK, 'xlink:href', sprite);
    }
    drawAliens();
    sfx('step');
    alienFire();
  }

  function alienFire() {
    if (lasers.length >= 3 + Math.floor(wave / 2)) return;
    const bottom = Object.create(null);
    for (const a of aliens) {
      if (!a.alive) continue;
      const key = Math.round(a.x / 40);
      if (!bottom[key] || a.y > bottom[key].y) bottom[key] = a;
    }
    const shooters = Object.keys(bottom).map((k) => bottom[k]);
    if (!shooters.length) return;
    if (Math.random() > Math.min(0.85, 0.22 + wave * 0.06)) return;
    const s = shooters[(Math.random() * shooters.length) | 0];
    const g = el('g', null, layers.lasers);
    useEl('spr-laser', -4, -8, g);
    lasers.push({ el: g, x: s.x, y: s.y + 20, v: 170 + wave * 24 });
  }

  // ---------- bonus ufo ----------
  function resetUfoClock() {
    ufoClock = 0;
    nextUfoAt = 14 + Math.random() * 10;
  }

  function spawnUfo() {
    const fromLeft = Math.random() < 0.5;
    const g = el('g', null, layers.ufo);
    useEl('spr-ufo', -24, -11, g);
    ufo = { el: g, x: fromLeft ? -30 : W + 30, v: (fromLeft ? 1 : -1) * (85 + wave * 12) };
    sfx('ufo');
  }

  function destroyUfo(withPoints) {
    if (!ufo) return;
    if (withPoints) {
      addScore(100);
      popScore(ufo.x, 34, '+100', '#ffd166');
      boom(ufo.x, 34);
      sfx('boom');
    }
    if (ufo.el.parentNode) ufo.el.parentNode.removeChild(ufo.el);
    ufo = null;
    resetUfoClock();
  }

  function updateUfo(dt) {
    if (ufo) {
      ufo.x += ufo.v * dt;
      ufo.el.setAttribute('transform', 'translate(' + ufo.x.toFixed(1) + ',34)');
      if (ufo.x < -34 || ufo.x > W + 34) destroyUfo(false);
    } else {
      ufoClock += dt;
      if (ufoClock >= nextUfoAt && aliveCount() > 4) {
        resetUfoClock();
        spawnUfo();
      }
    }
  }

  // ---------- shooting & fx ----------
  function shoot() {
    const g = el('g', { class: 'player-shot' }, layers.bullets);
    useEl('spr-bullet', -4, -8, g);
    bullets.push({ el: g, x: ship.x, y: ship.y - 28 });
    cooldown = BULLET_COOLDOWN;
    sfx('shoot');
  }

  function boom(x, y) {
    const g = el('g', { transform: 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')' }, layers.fx);
    const inner = el('g', { class: 'fx-boom' }, g);
    useEl('spr-boom', -20, -20, inner);
    setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 560);
  }

  function popScore(x, y, text, color) {
    const g = el('g', { transform: 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')' }, layers.fx);
    const t = el('text', { class: 'score-pop', 'text-anchor': 'middle', fill: color, y: -6 }, g);
    t.textContent = text;
    setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 880);
  }

  // ---------- hud ----------
  function addScore(n) {
    score += n;
    if (hudScore) hudScore.textContent = score;
    if (score > high) {
      high = score;
      if (hudHigh) hudHigh.textContent = high;
    }
  }

  function drawLives() {
    if (!hudLives) return;
    const icons = hudLives.querySelectorAll('.life-icon');
    icons.forEach((ic, i) => ic.classList.toggle('off', i >= lives));
  }

  function drawWave() {
    if (hudWave) hudWave.textContent = wave;
  }

  function showBanner(text) {
    if (!waveBanner) return;
    waveBannerText.textContent = text;
    waveBanner.classList.remove('show');
    void waveBanner.offsetWidth; // restart the animation
    waveBanner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => waveBanner.classList.remove('show'), 1250);
  }

  // ---------- game flow ----------
  function showOverlay(name) {
    for (const k in overlays) {
      if (overlays[k]) overlays[k].classList.toggle('show', k === name);
    }
    if (name === 'start' && startHigh) startHigh.textContent = high;
  }

  function clearShots() {
    bullets.forEach((b) => { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); });
    lasers.forEach((l) => { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); });
    bullets = [];
    lasers = [];
    destroyUfo(false);
  }

  function startGame() {
    unlockAudio();
    hiAtStart = high;
    score = 0;
    wave = 1;
    lives = 3;
    dir = 1;
    stepAcc = 0;
    stepCount = 0;
    altFrame = false;
    invuln = 0;
    cooldown = 0;
    left = right = fireKey = firePointer = false;
    pointerDown = false;
    pointerX = null;
    ship.x = W / 2;
    layers.fx.textContent = '';
    clearTimeout(waveTimer);
    clearShots();
    if (shipEl) {
      shipEl.classList.remove('invuln');
      shipEl.setAttribute('transform', 'translate(' + ship.x + ',' + ship.y + ')');
    }
    if (hudScore) hudScore.textContent = '0';
    drawWave();
    drawLives();
    buildFormation();
    showOverlay(null);
    state = 'playing';
    stage.classList.add('is-playing');
    try { stage.focus({ preventScroll: true }); } catch (e) { stage.focus(); }
    showBanner('WAVE 1');
    syncPauseBtn();
    startLoop();
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    stopLoop();
    showOverlay('pause');
    syncPauseBtn();
  }

  function resumeGame() {
    if (state !== 'paused') return;
    showOverlay(null);
    state = 'playing';
    syncPauseBtn();
    startLoop();
  }

  function gameOver(reason) {
    if (state === 'over') return;
    state = 'over';
    stopLoop();
    stage.classList.remove('is-playing');
    clearShots();
    sfx('over');
    try { localStorage.setItem('rbndict-invaders-high', String(high)); } catch (e) { /* private mode */ }
    if (overReason) {
      overReason.textContent = reason === 'invaded'
        ? 'The invaders broke through the defense line.'
        : 'Your ship was destroyed in battle.';
    }
    if (overScore) overScore.textContent = score;
    if (overHigh) overHigh.textContent = high;
    if (overBest) overBest.hidden = !(score > hiAtStart && score > 0);
    showOverlay('over');
    syncPauseBtn();
  }

  function shipHit() {
    if (invuln > 0) return;
    lives--;
    drawLives();
    boom(ship.x, ship.y);
    sfx('boom');
    if (lives <= 0) { gameOver('destroyed'); return; }
    sfx('hurt');
    invuln = 1.8;
    if (shipEl) shipEl.classList.add('invuln');
  }

  function killAlien(a, withPoints) {
    a.alive = false;
    if (a.el.parentNode) a.el.parentNode.removeChild(a.el);
    if (withPoints) {
      addScore(a.type.points);
      popScore(a.x, a.y, '+' + a.type.points, a.type.color);
    }
    boom(a.x, a.y);
    sfx('hit');
    if (aliveCount() === 0) waveClear();
  }

  function waveClear() {
    clearShots();
    sfx('wave');
    showBanner('WAVE ' + (wave + 1));
    clearTimeout(waveTimer);
    waveTimer = setTimeout(() => {
      if (state !== 'playing') return;
      wave++;
      drawWave();
      buildFormation();
    }, 1300);
  }

  // ---------- per-frame update ----------
  function update(dt) {
    // ship movement — keys win over pointer target
    let vx = 0;
    if (left) vx -= 1;
    if (right) vx += 1;
    if (vx === 0 && pointerX !== null) {
      const d = pointerX - ship.x;
      vx = Math.abs(d) < 4 ? 0 : (d > 0 ? 1 : -1);
    }
    ship.x = Math.max(26, Math.min(W - 26, ship.x + vx * SHIP_SPEED * dt));
    if (shipEl) shipEl.setAttribute('transform', 'translate(' + ship.x.toFixed(1) + ',' + ship.y + ')');

    // firing
    cooldown -= dt;
    if ((fireKey || firePointer) && cooldown <= 0 && bullets.length < MAX_BULLETS) shoot();

    // marching formation
    if (aliveCount() > 0) {
      stepAcc += dt;
      if (stepAcc >= stepInterval()) {
        stepAcc = 0;
        stepFormation();
        if (state !== 'playing') return; // invaded
      }
    }

    updateUfo(dt);

    // player bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y -= BULLET_SPEED * dt;
      if (b.y < -20) {
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
        bullets.splice(i, 1);
        continue;
      }
      b.el.setAttribute('transform', 'translate(' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ')');
      let consumed = false;
      for (const a of aliens) {
        if (!a.alive) continue;
        if (Math.abs(b.x - a.x) < a.type.w / 2 + 3 && Math.abs(b.y - a.y) < 19) {
          consumed = true;
          killAlien(a, true);
          break;
        }
      }
      if (!consumed && ufo && b.y > 20 && b.y < 48 && Math.abs(b.x - ufo.x) < 26) {
        consumed = true;
        destroyUfo(true);
      }
      if (consumed) {
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
        bullets.splice(i, 1);
      }
    }

    // alien lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.y += l.v * dt;
      if (l.y > H + 20) {
        if (l.el.parentNode) l.el.parentNode.removeChild(l.el);
        lasers.splice(i, 1);
        continue;
      }
      l.el.setAttribute('transform', 'translate(' + l.x.toFixed(1) + ',' + l.y.toFixed(1) + ')');
      if (invuln <= 0 && Math.abs(l.x - ship.x) < 23 && Math.abs(l.y - ship.y) < 20) {
        if (l.el.parentNode) l.el.parentNode.removeChild(l.el);
        lasers.splice(i, 1);
        shipHit();
        if (state !== 'playing') return; // destroyed
      }
    }

    // aliens ramming the ship
    for (const a of aliens) {
      if (a.alive && Math.abs(a.x - ship.x) < a.type.w / 2 + 20 && Math.abs(a.y - ship.y) < 36) {
        killAlien(a, false);
        shipHit();
        break;
      }
    }

    // invulnerability blink
    if (invuln > 0) {
      invuln -= dt;
      if (invuln <= 0 && shipEl) shipEl.classList.remove('invuln');
    }
  }

  // ---------- loop ----------
  function frame(ts) {
    rafId = null;
    if (state !== 'playing') return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    update(dt);
    if (state === 'playing') rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId === null && state === 'playing') {
      lastTs = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTs = 0;
  }

  // ---------- buttons & icons ----------
  function syncPauseBtn() {
    if (!btnPause) return;
    const paused = state === 'paused';
    btnPause.innerHTML = '<i class="bi ' + (paused ? 'bi-play-fill' : 'bi-pause-fill') + '" aria-hidden="true"></i>';
    btnPause.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  }

  function syncSoundBtn() {
    if (!btnSound) return;
    btnSound.innerHTML = '<i class="bi ' + (soundOn ? 'bi-volume-up-fill' : 'bi-volume-mute-fill') + '" aria-hidden="true"></i>';
    btnSound.setAttribute('aria-pressed', String(soundOn));
  }

  if (btnStart) btnStart.addEventListener('click', startGame);
  if (btnRetry) btnRetry.addEventListener('click', startGame);
  if (btnRestart) btnRestart.addEventListener('click', startGame);
  if (btnResume) btnResume.addEventListener('click', resumeGame);
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    });
  }
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      soundOn = !soundOn;
      try { localStorage.setItem('rbndict-invaders-sound', soundOn ? 'on' : 'off'); } catch (e) { /* private mode */ }
      syncSoundBtn();
      if (soundOn) { unlockAudio(); sfx('shoot'); }
    });
  }

  // ---------- keyboard ----------
  const KEY_LEFT = ['ArrowLeft', 'a', 'A'];
  const KEY_RIGHT = ['ArrowRight', 'd', 'D'];
  const KEY_FIRE = [' ', 'Spacebar', 'ArrowUp', 'w', 'W'];

  document.addEventListener('keydown', (e) => {
    if (state === 'playing') {
      if (KEY_LEFT.indexOf(e.key) !== -1) { left = true; e.preventDefault(); }
      else if (KEY_RIGHT.indexOf(e.key) !== -1) { right = true; e.preventDefault(); }
      else if (KEY_FIRE.indexOf(e.key) !== -1) { fireKey = true; e.preventDefault(); }
      else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') pauseGame();
    } else if (state === 'paused' && (e.key === 'p' || e.key === 'P' || e.key === 'Escape')) {
      e.preventDefault();
      resumeGame();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (KEY_LEFT.indexOf(e.key) !== -1) left = false;
    else if (KEY_RIGHT.indexOf(e.key) !== -1) right = false;
    else if (KEY_FIRE.indexOf(e.key) !== -1) fireKey = false;
  });

  // the stage is focusable — Enter/Space starts or restarts from it
  stage.addEventListener('keydown', (e) => {
    if ((state === 'idle' || state === 'over') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      startGame();
    }
  });

  // ---------- pointer / touch ----------
  function pointerToGameX(e) {
    const r = svg.getBoundingClientRect();
    if (!r.width) return null;
    return Math.max(26, Math.min(W - 26, (e.clientX - r.left) * (W / r.width)));
  }

  stage.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    pointerDown = true;
    pointerX = pointerToGameX(e);
    firePointer = true;
    if (stage.setPointerCapture) {
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    }
    e.preventDefault();
  });

  stage.addEventListener('pointermove', (e) => {
    if (pointerDown) pointerX = pointerToGameX(e);
  });

  function endPointer() {
    pointerDown = false;
    pointerX = null;
    firePointer = false;
  }

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // ---------- auto-pause when hidden or scrolled away ----------
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', () => pauseGame());
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) pauseGame();
    }, { threshold: 0.2 }).observe(stage);
  }

  // ---------- init ----------
  buildStars();
  buildShip();
  if (hudHigh) hudHigh.textContent = high;
  if (startHigh) startHigh.textContent = high;
  drawLives();
  drawWave();
  syncSoundBtn();
  syncPauseBtn();
  showOverlay('start');
})();