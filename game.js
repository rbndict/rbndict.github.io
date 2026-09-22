/* ============================================================
   rbndict.github.io — Alien Invaders 2.1
   Vanilla canvas engine: fixed-timestep updates, hit-stop,
   diver aliens, aimed fire, combo scoring, shockwaves,
   power-up magnet, death sequence. No libraries.
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const stage = document.getElementById('gameStage');
  if (!canvas || !stage || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

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
  const overWave = document.getElementById('overWave');
  const overBest = document.getElementById('overBest');
  const waveBanner = document.getElementById('waveBanner');
  const waveBannerText = document.getElementById('waveBannerText');
  const btnStart = document.getElementById('btnStart');
  const btnRetry = document.getElementById('btnRetry');
  const btnResume = document.getElementById('btnResume');
  const btnPause = document.getElementById('btnPause');
  const btnSound = document.getElementById('btnSound');
  const btnRestart = document.getElementById('btnRestart');
  const touchLeft = document.getElementById('touchLeft');
  const touchRight = document.getElementById('touchRight');
  const touchFire = document.getElementById('touchFire');

  /* Virtual stage constants */
  const W = 640;
  const H = 480;
  const DEFENSE_Y = 408;           // invasion line
  const SHIP_Y = H - 44;           // ship row
  const SHIP_W = 44;
  const SHIP_SPEED = 380;          // px/s
  const BULLET_SPEED = 620;        // px/s
  const BULLET_COOLDOWN = 0.24;    // s between shots
  const MAX_BULLETS = 5;
  const COLS = 8;
  const ROWS = 4;
  const CELL_X = 58;
  const CELL_Y = 42;
  const STEP_DROP = 16;            // formation drop per edge turn
  const MAX_STEP = 1 / 60;         // fixed timestep (s) — frame-rate independent

  const ALIEN_TYPES = [
    { w: 40, h: 26, points: 30, color: '#ff5d8f' },
    { w: 44, h: 26, points: 20, color: '#b07cff' },
    { w: 48, h: 26, points: 10, color: '#4ade80' }
  ];
  const ROW_TYPE = [0, 1, 1, 2];

  const POWERS = [
    { kind: 'rapid', color: '#64ffda', label: 'R' },
    { kind: 'spread', color: '#ffd166', label: 'S' },
    { kind: 'shield', color: '#4a9eff', label: 'O' },
    { kind: 'life', color: '#ff7ab0', label: '+' }
  ];

  const MARCH = [110, 98, 87.3, 78];

  /* ---------- Run state ---------- */
  let state = 'idle';              // idle | playing | paused | over
  let score = 0;
  let high = 0;
  let hiAtStart = 0;
  let wave = 1;
  let lives = 3;
  let combo = 0;
  let comboTimer = 0;

  let aliens = [];
  let bullets = [];
  let lasers = [];
  let drops = [];
  let parts = [];                  // particle debris
  let floats = [];                 // floating score text
  let rings = [];                  // v2.1: expanding shockwaves
  let stars = [];

  let ufo = null;
  let ufoClock = 0;
  let nextUfoAt = 14;

  let dir = 1;
  let glide = 0;
  let glideTime = 0;
  let altFrame = 0;
  let altAcc = 0;

  let ship = { x: W / 2 };
  let left = false;
  let right = false;
  let fireKey = false;
  let touchDir = 0;
  let touchFireOn = false;
  let pointerX = null;
  let pointerDown = false;

  let cooldown = 0;
  let invuln = 0;
  let rapid = 0;
  let spread = 0;
  let shield = false;

  let shake = 0;
  let flash = 0;
  let slowmo = 0;

  /* v2.1 juice state */
  let hitStop = 0;                 // freeze frames on kills
  let deathT = 0;                  // death-sequence timer
  let dying = false;               // ship destruction in progress
  let acc = 0;                     // fixed-timestep accumulator
  let now = 0;                     // running clock (star twinkle, thruster)
  let trail = [];                  // engine trail points
  let comboBest = 0;               // best combo this run

  let rafId = null;
  let lastTs = 0;
  let bannerTimer = null;
  let waveTimer = null;

  try { high = parseInt(localStorage.getItem('rbndict-invaders-high'), 10) || 0; } catch (e) { high = 0; }
  let soundOn = true;
  try { soundOn = localStorage.getItem('rbndict-invaders-sound') !== 'off'; } catch (e) { soundOn = true; }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let dpr = 1;
  function fitCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

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
    } catch (e) { /* audio optional */ }
  }
  function sfx(name) {
    if (!soundOn || !audio) return;
    if (name === 'shoot') tone(900, 240, 0.09, 'square', 0.05);
    else if (name === 'hit') tone(320, 90, 0.14, 'sawtooth', 0.07);
    else if (name === 'power') tone(520, 980, 0.16, 'sine', 0.08);
    else if (name === 'hurt') tone(220, 50, 0.28, 'sawtooth', 0.1);
    else if (name === 'ufo') { tone(600, 900, 0.12, 'sine', 0.05); setTimeout(() => tone(900, 600, 0.12, 'sine', 0.05), 110); }
    else if (name === 'step') tone(MARCH[altFrame % 4], MARCH[altFrame % 4] * 0.8, 0.07, 'square', 0.02);
    else if (name === 'wave') [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, f, 0.1, 'square', 0.05), i * 90));
    else if (name === 'over') [392, 311, 233, 155].forEach((f, i) => setTimeout(() => tone(f, f * 0.9, 0.18, 'sawtooth', 0.06), i * 160));
  }

  function buildStars() {
    stars = [];
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.3 + 0.4,
        v: 8 + Math.random() * 26,
        tw: Math.random() * Math.PI * 2
      });
    }
  }

  function buildFormation() {
    aliens = [];
    const gridW = (COLS - 1) * CELL_X;
    const x0 = (W - gridW) / 2;
    const y0 = 62 + Math.min((wave - 1) * 8, 32);
    for (let r = 0; r < ROWS; r++) {
      const type = ALIEN_TYPES[ROW_TYPE[r]];
      for (let c = 0; c < COLS; c++) {
        aliens.push({
          type: type,
          x: x0 + c * CELL_X,
          y: y0 + r * CELL_Y,
          wobble: Math.random() * Math.PI * 2,
          alive: true,
          /* v2.1: dive behaviour */
          diving: false,
          diveT: 0,
          diveAmp: 0,
          homeX: x0 + c * CELL_X,
          homeY: y0 + r * CELL_Y
        });
      }
    }
    dir = 1;
    glide = 0;
    glideTime = 0;
  }

  /* v2.1: launch a diver from the lowest row — telegraphed by a
     quick pull-back before it swoops toward the ship's column. */
  function startDive() {
    const pool = aliens.filter((a) => a.alive && !a.diving && a.y < DEFENSE_Y - 120);
    if (!pool.length) return;
    const a = pool[(Math.random() * pool.length) | 0];
    a.diving = true;
    a.diveT = 0;
    a.diveAmp = 30 + Math.random() * 40;
    tone(740, 300, 0.22, 'triangle', 0.05);
  }

  function aliveCount() {
    let n = 0;
    for (const a of aliens) if (a.alive) n++;
    return n;
  }

  function glideSpeed() {
    const total = COLS * ROWS;
    const frac = aliveCount() / total;
    const base = 26 + (wave - 1) * 7;
    return base * (0.25 + 0.75 * frac) * (1 / Math.max(0.35, frac * 0.85 + 0.15));
  }

  function alienEdges() {
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of aliens) {
      if (!a.alive) continue;
      minX = Math.min(minX, a.x - a.type.w / 2);
      maxX = Math.max(maxX, a.x + a.type.w / 2);
      maxY = Math.max(maxY, a.y + a.type.h / 2);
    }
    return { minX: minX, maxX: maxX, maxY: maxY };
  }

  function alienFire() {
    const cap = 3 + Math.floor(wave / 2);
    if (lasers.length >= cap) return;
    const bottom = Object.create(null);
    for (const a of aliens) {
      if (!a.alive) continue;
      const key = Math.round(a.x / 40);
      if (!bottom[key] || a.y > bottom[key].y) bottom[key] = a;
    }
    const shooters = Object.keys(bottom).map((k) => bottom[k]);
    if (!shooters.length) return;
    if (Math.random() > Math.min(0.8, 0.2 + wave * 0.05)) return;
    /* v2.1: bias toward the column nearest the ship — pressure
       where the player actually is, instead of purely random. */
    let best = null;
    let bestDist = Infinity;
    for (const s of shooters) {
      const d = Math.abs(s.x - ship.x);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    const s = Math.random() < 0.55 ? best : shooters[(Math.random() * shooters.length) | 0];
    const dx = ship.x - s.x;
    const dy = SHIP_Y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 175 + wave * 22;
    lasers.push({ x: s.x, y: s.y + 16, v: speed, vx: (dx / len) * speed * 0.28 });
  }

  /* v2.1: expanding shockwave ring for kills / hits */
  function ring(x, y, color, max) {
    if (reduced) return;
    rings.push({ x: x, y: y, r: 4, max: max || 34, color: color, life: 0.42, t: 0.42 });
  }

  function spawnUfo() {
    const fromLeft = Math.random() < 0.5;
    ufo = { x: fromLeft ? -30 : W + 30, v: (fromLeft ? 1 : -1) * (85 + wave * 12) };
    sfx('ufo');
  }
  function resetUfoClock() {
    ufoClock = 0;
    nextUfoAt = 13 + Math.random() * 9;
  }
  function destroyUfo(withPoints) {
    if (withPoints && ufo) {
      const bonus = 100 + combo * 10;
      addScore(bonus);
      floats.push({ x: ufo.x, y: 34, text: '+' + bonus, color: '#ffd166', life: 0.9 });
      burst(ufo.x, 34, 18, '#ffd166');
      ring(ufo.x, 34, '#ffd166', 56);
      hitStop = Math.max(hitStop, 0.07);   // v2.1: bonus kill feels weighty
      shake = Math.max(shake, 6);
    }
    ufo = null;
    resetUfoClock();
  }

  function shoot() {
    const n = spread > 0 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const off = n === 3 ? (i - 1) * 7 : 0;
      const vx = n === 3 ? (i - 1) * 60 : 0;
      bullets.push({ x: ship.x + off, y: SHIP_Y - 26, vx: vx });
    }
    cooldown = rapid > 0 ? BULLET_COOLDOWN * 0.45 : BULLET_COOLDOWN;
    flash = Math.max(flash, 0.06);
    sfx('shoot');
  }

  function burst(x, y, n, color) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 160;
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        size: 1.5 + Math.random() * 2.5,
        color: color,
        life: 0.4 + Math.random() * 0.4,
        max: 0.8
      });
    }
  }

  function addScore(n) {
    score += n;
    if (hudScore) hudScore.textContent = score;
    if (score > high) {
      high = score;
      if (hudHigh) hudHigh.textContent = high;
    }
  }

  function bumpCombo() {
    combo++;
    comboTimer = 2.2;
  }

  function killAlien(a, withPoints) {
    a.alive = false;
    if (withPoints) {
      bumpCombo();
      comboBest = Math.max(comboBest, combo);
      const mult = 1 + Math.min(combo - 1, 8) * 0.1;
      const pts = Math.round(a.type.points * mult);
      addScore(pts);
      floats.push({ x: a.x, y: a.y, text: combo > 2 ? '+' + pts + ' x' + combo : '+' + pts, color: a.type.color, life: 0.8 });
      /* v2.1: hit-stop + shockwave make kills feel weighty */
      hitStop = combo >= 4 ? 0.055 : 0.03;
      ring(a.x, a.y, a.type.color);
    }
    burst(a.x, a.y, 10, a.type.color);
    shake = Math.max(shake, 3);
    sfx('hit');
    if (withPoints && Math.random() < 0.14) spawnDrop(a.x, a.y);
    if (aliveCount() === 0) waveClear();
  }

  function spawnDrop(x, y) {
    const p = POWERS[(Math.random() * POWERS.length) | 0];
    drops.push({ x: x, y: y, power: p, v: 70 });
  }

  function applyPower(kind) {
    sfx('power');
    if (kind === 'rapid') { rapid = 8; }
    else if (kind === 'spread') { spread = 8; }
    else if (kind === 'shield') { shield = true; }
    else if (kind === 'life') { lives = Math.min(lives + 1, 5); drawLives(); }
    floats.push({ x: ship.x, y: SHIP_Y - 34, text: kind.toUpperCase() + '!', color: '#64ffda', life: 0.9 });
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
    void waveBanner.offsetWidth;
    waveBanner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => waveBanner.classList.remove('show'), 1250);
  }

  function showOverlay(name) {
    for (const k in overlays) {
      if (overlays[k]) overlays[k].classList.toggle('show', k === name);
    }
    if (name === 'start' && startHigh) startHigh.textContent = high;
  }

  function startGame() {
    unlockAudio();
    hiAtStart = high;
    score = 0;
    wave = 1;
    lives = 3;
    combo = 0;
    comboTimer = 0;
    comboBest = 0;
    cooldown = 0;
    invuln = 0;
    rapid = 0;
    spread = 0;
    shield = false;
    dying = false;
    hitStop = 0;
    acc = 0;
    left = right = fireKey = touchFireOn = false;
    touchDir = 0;
    pointerDown = false;
    pointerX = null;
    ship.x = W / 2;
    parts = [];
    floats = [];
    rings = [];
    trail = [];
    drops = [];
    clearShots();
    clearTimeout(waveTimer);
    if (hudScore) hudScore.textContent = '0';
    drawWave();
    drawLives();
    buildFormation();
    buildStars();
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
    dying = false;
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
    if (overWave) overWave.textContent = wave;
    if (overBest) overBest.hidden = !(score > hiAtStart && score > 0);
    showOverlay('over');
    syncPauseBtn();
  }

  function shipHit() {
    if (invuln > 0) return;
    if (shield) {
      shield = false;
      invuln = 1;
      ring(ship.x, SHIP_Y, '#4a9eff', 46);
      burst(ship.x, SHIP_Y, 14, '#4a9eff');
      sfx('hit');
      return;
    }
    lives--;
    drawLives();
    burst(ship.x, SHIP_Y, 26, '#64ffda');
    ring(ship.x, SHIP_Y, '#64ffda', 60);
    shake = Math.max(shake, 12);
    sfx('hurt');
    if (lives <= 0) {
      /* v2.1: short destruction sequence instead of an instant
         overlay — the explosion reads before the card appears. */
      dying = true;
      deathT = 0.9;
      return;
    }
    invuln = 1.8;
    rapid = 0;
    spread = 0;
  }

  function waveClear() {
    clearShots();
    sfx('wave');
    showBanner('WAVE ' + (wave + 1));
    slowmo = 0.8;
    clearTimeout(waveTimer);
    waveTimer = setTimeout(() => {
      if (state !== 'playing') return;
      wave++;
      drawWave();
      buildFormation();
    }, 1300);
  }

  function clearShots() {
    bullets = [];
    lasers = [];
    destroyUfo(false);
  }

  function update(dt) {
    now += dt;

    /* v2.1: death sequence — shots keep flying and FX keep
       animating while the wreck settles, then the card appears. */
    if (dying) {
      deathT -= dt;
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.y -= BULLET_SPEED * dt;
        b.x += b.vx * dt;
        if (b.y < -20 || b.x < -10 || b.x > W + 10) bullets.splice(i, 1);
      }
      for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.y += l.v * dt;
        l.x += (l.vx || 0) * dt;
        if (l.y > H + 20) lasers.splice(i, 1);
      }
      updateFx(dt);
      if (deathT <= 0) { dying = false; gameOver('destroyed'); }
      return;
    }

    let vx = 0;
    if (left) vx -= 1;
    if (right) vx += 1;
    if (touchDir) vx = touchDir;
    if (vx === 0 && pointerX !== null) {
      const d = pointerX - ship.x;
      vx = Math.abs(d) < 6 ? 0 : (d > 0 ? 1 : -1);
    }
    ship.x = Math.max(SHIP_W / 2 + 4, Math.min(W - SHIP_W / 2 - 4, ship.x + vx * SHIP_SPEED * dt));

    /* v2.1: engine trail follows the ship */
    if (!reduced) {
      trail.push({ x: ship.x, y: SHIP_Y + 16, life: 0.28, t: 0.28 });
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].life -= dt;
        if (trail[i].life <= 0) trail.splice(i, 1);
      }
    }

    cooldown -= dt;
    if ((fireKey || touchFireOn) && cooldown <= 0 && bullets.length < MAX_BULLETS) shoot();

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }
    if (rapid > 0) rapid -= dt;
    if (spread > 0) spread -= dt;

    const marching = slowmo <= 0;
    if (marching && aliveCount() > 0) {
      const speed = glideSpeed();
      glide += dir * speed * dt;
      glideTime += dt;
      const e = alienEdges();
      if ((dir > 0 && e.maxX + dir * speed * dt > W - 10) || (dir < 0 && e.minX + dir * speed * dt < 10)) {
        dir = -dir;
        for (const a of aliens) if (a.alive) a.y += STEP_DROP;
        if (e.maxY + STEP_DROP >= DEFENSE_Y) { gameOver('invaded'); return; }
        sfx('step');
      }
      for (const a of aliens) {
        if (!a.alive) continue;
        a.x += dir * speed * dt;
        a.y += Math.sin(glideTime * 2 + a.wobble) * 4 * dt;
      }
      altAcc += dt;
      if (altAcc > Math.max(0.22, 0.6 - wave * 0.04)) {
        altAcc = 0;
        altFrame = (altFrame + 1) % 4;
        alienFire();
        /* v2.1: launch a diver every couple of beats from wave 2 on */
        if (wave >= 2 && altFrame % 2 === 0) startDive();
      }
      /* v2.1: diver movement — swoop toward the ship then reform */
      for (const a of aliens) {
        if (!a.alive || !a.diving) continue;
        a.diveT += dt;
        const targetY = SHIP_Y - 40;
        if (a.y < targetY) {
          a.y += (120 + wave * 18) * dt;
          a.x += Math.sin(a.diveT * 5) * a.diveAmp * dt * 2;
        } else {
          a.diving = false;
        }
      }
    }

    if (slowmo > 0) slowmo -= dt;

    if (ufo) {
      ufo.x += ufo.v * dt;
      if (ufo.x < -34 || ufo.x > W + 34) destroyUfo(false);
    } else {
      ufoClock += dt;
      if (ufoClock >= nextUfoAt && aliveCount() > 4) {
        resetUfoClock();
        spawnUfo();
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y -= BULLET_SPEED * dt;
      b.x += b.vx * dt;
      if (b.y < -20 || b.x < -10 || b.x > W + 10) {
        bullets.splice(i, 1);
        if (combo > 0) { combo = 0; comboTimer = 0; }
        continue;
      }
      let consumed = false;
      for (const a of aliens) {
        if (!a.alive) continue;
        if (Math.abs(b.x - a.x) < a.type.w / 2 + 3 && Math.abs(b.y - a.y) < a.type.h / 2 + 5) {
          killAlien(a, true);
          consumed = true;
          break;
        }
      }
      if (!consumed && ufo && b.y > 20 && b.y < 48 && Math.abs(b.x - ufo.x) < 26) {
        destroyUfo(true);
        consumed = true;
      }
      if (consumed) bullets.splice(i, 1);
    }

    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.y += l.v * dt;
      l.x += (l.vx || 0) * dt;   // v2.1: aimed horizontal drift
      if (l.y > H + 20 || l.x < -20 || l.x > W + 20) {
        lasers.splice(i, 1);
        continue;
      }
      if (invuln <= 0 && !dying && Math.abs(l.x - ship.x) < 22 && Math.abs(l.y - SHIP_Y) < 20) {
        lasers.splice(i, 1);
        shipHit();
        if (state !== 'playing') return;
      }
    }

    for (const a of aliens) {
      if (a.alive && !dying && Math.abs(a.x - ship.x) < a.type.w / 2 + 18 && Math.abs(a.y - SHIP_Y) < 34) {
        killAlien(a, false);
        shipHit();
        if (state !== 'playing') return;
        break;
      }
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      /* v2.1: power-up magnet — nearby drops pull toward the ship */
      const dx = ship.x - d.x;
      const dy = SHIP_Y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 90) {
        d.x += (dx / dist) * 130 * dt;
        d.y += (dy / dist) * 130 * dt;
      } else {
        d.y += d.v * dt;
      }
      if (d.y > H + 16) { drops.splice(i, 1); continue; }
      if (dist < 26) {
        applyPower(d.power.kind);
        ring(d.x, d.y, d.power.color, 30);
        drops.splice(i, 1);
      }
    }

    updateFx(dt);

    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake = Math.max(0, shake - 26 * dt);
    if (flash > 0) flash -= dt;
  }

  /* v2.1: shared FX integration (also runs during death sequence) */
  function updateFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.y -= 26 * dt;
      f.life -= dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      if (r.life <= 0) rings.splice(i, 1);
    }
    for (const s of stars) {
      s.y += s.v * dt;
      if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
    }
  }

  function drawAlien(a) {
    const t = a.type;
    const frame = altFrame % 2;
    ctx.save();
    ctx.translate(a.x, a.y + Math.sin(glideTime * 6 + a.wobble) * 1.5);
    ctx.fillStyle = t.color;
    if (a.diving) {
      /* v2.1: divers glow so the threat reads instantly */
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
    }
    const w = t.w * 0.5;
    const h = t.h * 0.5;
    const wig = frame ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(-w + 3, -h * 0.4);
    ctx.lineTo(-w * 0.4, -h);
    ctx.lineTo(w * 0.4, -h);
    ctx.lineTo(w - 3, -h * 0.4);
    ctx.lineTo(w, 0);
    ctx.lineTo(w * 0.6, h * 0.5);
    ctx.lineTo(wig * w * 0.35, h);
    ctx.lineTo(-wig * w * 0.35, h);
    ctx.lineTo(-w * 0.6, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a192f';
    const eyeY = -h * 0.35;
    ctx.fillRect(-w * 0.45, eyeY, 5, 4);
    ctx.fillRect(w * 0.45 - 5, eyeY, 5, 4);
    ctx.fillRect(-3, h * 0.1, 6, 3);
    ctx.restore();
  }

  function drawShip() {
    if (dying) return;   // v2.1: ship hidden during death sequence
    const blink = invuln > 0 && Math.floor(invuln * 10) % 2 === 0;
    /* v2.1: engine trail under the ship */
    if (trail.length) {
      for (const t of trail) {
        ctx.globalAlpha = 0.35 * (t.life / t.t);
        ctx.fillStyle = '#64ffda';
        ctx.beginPath();
        ctx.arc(t.x, t.y + (t.t - t.life) * 40, 2.4 * (t.life / t.t) + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(ship.x, SHIP_Y);
    if (shield) {
      ctx.strokeStyle = 'rgba(74, 158, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -6, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = blink ? 0.3 : 1;
    ctx.fillStyle = '#64ffda';
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(9, 4);
    ctx.lineTo(20, 14);
    ctx.lineTo(-20, 14);
    ctx.lineTo(-9, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9e8f9';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(6, 2);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();
    const flick = Math.random();
    ctx.fillStyle = 'rgba(100, 255, 218,' + (0.4 + flick * 0.5) + ')';
    ctx.beginPath();
    ctx.moveTo(-5, 14);
    ctx.lineTo(0, 22 + flick * 6);
    ctx.lineTo(5, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0 && !reduced) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    ctx.fillStyle = '#cfe3ff';
    for (const s of stars) {
      ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.tw + performance.now() / 700));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* v2.1: defense line pulses when invaders get close */
    const danger = Math.max(0, 1 - (DEFENSE_Y - alienEdges().maxY) / 140);
    ctx.strokeStyle = 'rgba(255, 93, 143,' + (0.35 + danger * 0.5 * (0.6 + 0.4 * Math.sin(now * 8))) + ')';
    ctx.lineWidth = 1.5 + danger * 1.5;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(0, DEFENSE_Y);
    ctx.lineTo(W, DEFENSE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    for (const a of aliens) if (a.alive) drawAlien(a);

    if (ufo) {
      ctx.save();
      ctx.translate(ufo.x, 34);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(-10, -6);
      ctx.quadraticCurveTo(0, -14, 10, -6);
      ctx.lineTo(-10, -6);
      ctx.fill();
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      for (let i = -15; i <= 15; i += 10) {
        ctx.beginPath();
        ctx.arc(i, 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const d of drops) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(Math.sin(performance.now() / 300) * 0.3);
      ctx.fillStyle = d.power.color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-9, -9, 18, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#062033';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.power.label, 0, 1);
      ctx.restore();
    }

    for (const l of lasers) {
      ctx.strokeStyle = '#ff7ab0';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y - 7);
      ctx.lineTo(l.x, l.y + 7);
      ctx.stroke();
    }

    for (const b of bullets) {
      ctx.fillStyle = '#64ffda';
      ctx.shadowColor = 'rgba(100, 255, 218, 0.8)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 2.4, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    drawShip();

    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    /* v2.1: expanding shockwave rings */
    for (const r of rings) {
      const k = 1 - r.life / r.t;
      ctx.globalAlpha = Math.max(0, r.life / r.t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4 + (r.max - 4) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;

    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, f.life / 0.9);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (combo > 2) {
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'left';
      ctx.fillText('COMBO x' + combo, 12, 24);
    }

    if (rapid > 0 || spread > 0) {
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#64ffda';
      ctx.textAlign = 'left';
      const labels = [];
      if (rapid > 0) labels.push('RAPID ' + Math.ceil(rapid) + 's');
      if (spread > 0) labels.push('SPREAD ' + Math.ceil(spread) + 's');
      ctx.fillText(labels.join('  ·  '), 12, 44);
    }

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(ts) {
    rafId = null;
    if (state !== 'playing') return;
    if (!lastTs) lastTs = ts;
    let dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    /* v2.1: fixed-timestep accumulator — identical physics at
       60 Hz, 120 Hz or 144 Hz monitors, no frame-rate dependence */
    if (hitStop > 0) {
      hitStop -= dt;
      draw();
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (slowmo > 0) dt *= 0.35;
    acc += dt;
    let steps = 0;
    while (acc >= MAX_STEP && steps < 5) {
      update(MAX_STEP);
      acc -= MAX_STEP;
      steps++;
      if (state !== 'playing') { acc = 0; break; }
    }
    if (steps === 0 && acc > 0) {
      // Interpolate tiny remainder frames: run a partial step
      update(acc);
      acc = 0;
    }
    if (state === 'playing') {
      draw();
      rafId = requestAnimationFrame(frame);
    }
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
    } else if ((state === 'idle' || state === 'over') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      startGame();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (KEY_LEFT.indexOf(e.key) !== -1) left = false;
    else if (KEY_RIGHT.indexOf(e.key) !== -1) right = false;
    else if (KEY_FIRE.indexOf(e.key) !== -1) fireKey = false;
  });

  function pointerToGameX(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return null;
    return Math.max(SHIP_W / 2 + 4, Math.min(W - SHIP_W / 2 - 4, (e.clientX - r.left) * (W / r.width)));
  }

  stage.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    pointerDown = true;
    pointerX = pointerToGameX(e);
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
  }

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  function bindHold(btn, on, off) {
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  }
  bindHold(touchLeft, () => { touchDir = -1; }, () => { if (touchDir < 0) touchDir = 0; });
  bindHold(touchRight, () => { touchDir = 1; }, () => { if (touchDir > 0) touchDir = 0; });
  bindHold(touchFire, () => { touchFireOn = true; }, () => { touchFireOn = false; });

  /* v2.1: reveal on-screen controls the moment a real touch is seen
     (belt-and-braces with the CSS pointer media query) */
  function firstTouch(e) {
    document.body.classList.add('has-touch');
    document.removeEventListener('touchstart', firstTouch);
  }
  document.addEventListener('touchstart', firstTouch, { passive: true });

  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', () => pauseGame());
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) pauseGame();
    }, { threshold: 0.2 }).observe(stage);
  }

  buildStars();
  buildFormation();
  if (hudHigh) hudHigh.textContent = high;
  if (startHigh) startHigh.textContent = high;
  drawLives();
  drawWave();
  syncSoundBtn();
  syncPauseBtn();
  draw();
  showOverlay('start');

  /* Debug/QA hook (harmless in production; used by automated tests) */
  window.__rbnGame = {
    get state() { return state; },
    get score() { return score; },
    get wave() { return wave; },
    get lives() { return lives; },
    start: startGame,
    pause: pauseGame,
    resume: resumeGame
  };
})();
