/* =============================================================
   PUMPKIN INVASION - Level 1
   Drop-in game.js for an HTML5 Canvas shmup.
   Controls: ← → move | SPACE shoot (hold) | ENTER start/continue/restart
   Expects a <canvas id="gameCanvas"> (falls back to the first <canvas>).
   Designed for an 800x600 canvas; everything scales from canvas size.
   ============================================================= */
(() => {
  'use strict';

  // ---------------------------------------------------------------
  // 1. SETUP & CONFIG
  // ---------------------------------------------------------------
  const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const FONT = '"Press Start 2P", "Courier New", monospace';

  const CONFIG = {
    startLives: 3,
    hudHeight: 44,
    player: { w: 44, h: 38, speed: 320, fireDelay: 0.28, bulletSpeed: 520, respawnTime: 1.0, invulnTime: 2.0 },
    alien: { w: 38, h: 26, spacingX: 52, spacingY: 36, drop: 14, points: 10 },
    // Diamond formation: number of aliens per row (top to bottom)
    diamondRows: [1, 3, 5, 7, 5, 3, 1],
    alienBullet: { speed: 230, maxOnScreen: 6, minDelay: 0.5, maxDelay: 1.3 },
  };

  const LEVELS = [
    { name: 'THE FIRST HARVEST' },
    { name: 'SPECTRAL SPORES', rows: [4, 6, 8, 8, 6, 4] },
    { name: 'THE PATCH PATROL' },
    { name: 'PHANTOM FLEET' },
    { name: 'THE GOURD GUARDIAN', boss: 'guardian' },
    { name: 'MIDNIGHT MIST' },
    { name: 'ZIG-ZAG ZONE' },
    { name: 'WRAITH SQUADRON' },
    { name: 'METEOR SHOWER' },
    { name: 'THE SPECTRAL SCARECROW', boss: 'scarecrow' },
    { name: 'SWARM SECTOR' },
    { name: 'LASER GRID' },
    { name: 'BLOOD MOON RISING' },
    { name: 'MIRROR FLEET' },
    { name: "LORD JACK'S VANGUARD", boss: 'vanguard' },
    { name: 'VOID SECTOR' },
    { name: 'RAPID FIRE ARMADA' },
    { name: 'CLONE MATRIX' },
    { name: 'THE FINAL GATE' },
    { name: 'THE ETERNAL JACK-O-LANTERN', boss: 'mothership' },
  ];

  // ---------------------------------------------------------------
  // 2. GAME STATE
  // ---------------------------------------------------------------
  let state = 'menu';           // 'menu' | 'levelIntro' | 'playing' | 'levelClear' | 'gameOver' | 'victory'
  let level = 1;
  let score = 0;
  let lives = CONFIG.startLives;
  let time = 0;                 // global clock (seconds) for animations

  let player, aliens, formation, mirrorFormation, boss, meteors, laserBeams, playerBullets, alienBullets, particles;
  let alienFireTimer = 1;
  let totalAliens = 0;
  let clearBonus = 0;
  let meteorTimer = 0;
  let webPulse = 0;
  let gauntletWave = 0;
  let levelIntroTimer = 0;
  let shakeTimer = 0;
  let shakePower = 0;
  let engineTrailTimer = 0;

  const STORE = { unlocked: 'pumpkinInvasion.unlocked', scores: 'pumpkinInvasion.scores', paint: 'pumpkinInvasion.paint', sound: 'pumpkinInvasion.sound' };
  const PAINTS = {
    comet: { wing: '#4aa3ff', trim: '#2d78c8', name: 'Comet blue' },
    pumpkin: { wing: '#ff8a32', trim: '#bf4818', name: 'Pumpkin orange' },
    specter: { wing: '#86f2c2', trim: '#309b81', name: 'Specter mint' },
    bloodmoon: { wing: '#ff4d68', trim: '#ae2846', name: 'Blood moon red' },
  };
  const ACTS = ['THE HARVEST BEGINS', 'THE HAUNTING SKIES', 'THE NEBULA CRYPT', 'THE COSMIC ECLIPSE'];
  const menuLayer = document.getElementById('menuLayer');
  const gameContainer = document.getElementById('gameContainer');
  const levelSelect = document.getElementById('levelSelect');
  const rankingList = document.getElementById('rankingList');
  const menuStatus = document.getElementById('menuStatus');
  const soundToggle = document.getElementById('soundToggle');
  const soundLabel = document.getElementById('soundLabel');
  let unlockedLevel = Math.max(1, Math.min(LEVELS.length, Number(localStorage.getItem(STORE.unlocked)) || 1));
  let highScores = readJson(STORE.scores, []);
  let selectedPaint = PAINTS[localStorage.getItem(STORE.paint)] ? localStorage.getItem(STORE.paint) : 'comet';
  let audioEnabled = localStorage.getItem(STORE.sound) !== 'false';
  let audioContext, masterGain, droneGain;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function storeValue(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Storage can be disabled in private browsing. */ }
  }

  function ensureAudio() {
    if (!audioEnabled) return;
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return;
    if (!audioContext) {
      audioContext = new AudioContextType();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(audioContext.destination);
      droneGain = audioContext.createGain();
      droneGain.gain.value = 0;
      droneGain.connect(masterGain);
      for (const [frequency, type, amount] of [[48, 'sine', 1], [73, 'triangle', 0.28]]) {
        const oscillator = audioContext.createOscillator();
        const voiceGain = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        voiceGain.gain.value = amount;
        oscillator.connect(voiceGain);
        voiceGain.connect(droneGain);
        oscillator.start();
      }
      const heartbeat = audioContext.createOscillator();
      const heartbeatDepth = audioContext.createGain();
      heartbeat.frequency.value = 1.1;
      heartbeatDepth.gain.value = 0.035;
      heartbeat.connect(heartbeatDepth);
      heartbeatDepth.connect(droneGain.gain);
      heartbeat.start();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        menuStatus.textContent = 'AUDIO UNAVAILABLE';
      });
    }
    updateAudioMix();
  }

  function updateAudioMix() {
    if (!audioContext || !masterGain) return;
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(audioEnabled ? 0.6 : 0, now, 0.04);
  }

  function setAmbient(active) {
    if (!audioContext && active && audioEnabled) ensureAudio();
    if (!droneGain) return;
    droneGain.gain.setTargetAtTime(active && audioEnabled ? 0.16 : 0, audioContext.currentTime, 0.5);
  }

  function triggerShake(power, duration = 0.24) {
    shakePower = shakeTimer > 0 ? Math.max(shakePower, power) : power;
    shakeTimer = Math.max(shakeTimer, duration);
  }

  function playTone(startHz, endHz, duration, wave = 'square', volume = 0.08) {
    if (!audioEnabled) return;
    ensureAudio();
    if (!audioContext || !masterGain) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), now + duration);
    envelope.gain.setValueAtTime(volume, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  function playExplosionSound() {
    if (!audioEnabled) return;
    ensureAudio();
    if (!audioContext || !masterGain) return;
    const now = audioContext.currentTime;
    const length = Math.floor(audioContext.sampleRate * 0.32);
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    envelope.gain.setValueAtTime(0.16, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);
    source.start(now);
  }

  function refreshMenu() {
    levelSelect.replaceChildren();
    for (let i = 1; i <= unlockedLevel; i++) {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = `LEVEL ${String(i).padStart(2, '0')} — ${LEVELS[i - 1].name}`;
      levelSelect.append(option);
    }
    document.getElementById('unlockNote').textContent = `LEVELS 1–${unlockedLevel} UNLOCKED`;
    soundToggle.setAttribute('aria-pressed', String(audioEnabled));
    soundLabel.textContent = audioEnabled ? 'SOUND ON' : 'SOUND OFF';
    document.querySelectorAll('.paint-swatch').forEach((button) => button.classList.toggle('selected', button.dataset.paint === selectedPaint));
    document.getElementById('paintNote').textContent = `${PAINTS[selectedPaint].name} selected.`;
    renderRankings();
  }

  function renderRankings() {
    rankingList.replaceChildren();
    if (!highScores.length) {
      const empty = document.createElement('li');
      empty.className = 'ranking-empty';
      empty.textContent = 'No flight records yet. Finish a sortie and your score will be recorded here.';
      rankingList.append(empty);
      return;
    }
    highScores.slice(0, 5).forEach((record) => {
      const item = document.createElement('li');
      const stage = document.createElement('span');
      const points = document.createElement('strong');
      stage.textContent = `LEVEL ${String(record.level).padStart(2, '0')}`;
      points.textContent = Number(record.score).toLocaleString();
      item.append(stage, points);
      rankingList.append(item);
    });
  }

  function recordScore() {
    highScores.push({ score, level, date: Date.now() });
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 10);
    storeValue(STORE.scores, JSON.stringify(highScores));
  }

  function unlockNextLevel() {
    unlockedLevel = Math.max(unlockedLevel, Math.min(LEVELS.length, level + 1));
    storeValue(STORE.unlocked, String(unlockedLevel));
  }

  function showMenuView(name) {
    document.querySelectorAll('.menu-view').forEach((view) => {
      const active = view.id === `view-${name}`;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    document.querySelectorAll('.menu-nav-button').forEach((button) => button.classList.toggle('selected', button.dataset.view === name));
  }

  function launchCampaign() {
    const startAt = Math.max(1, Math.min(unlockedLevel, Number(levelSelect.value) || 1));
    ensureAudio();
    setAmbient(true);
    gameContainer.classList.add('transitioning');
    window.setTimeout(() => {
      menuLayer.hidden = true;
      startGame(startAt);
    }, 270);
    window.setTimeout(() => gameContainer.classList.remove('transitioning'), 560);
  }

  document.querySelectorAll('.menu-nav-button').forEach((button) => {
    button.addEventListener('click', () => showMenuView(button.dataset.view));
  });
  document.getElementById('launchButton').addEventListener('click', launchCampaign);
  document.querySelectorAll('.paint-swatch').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPaint = button.dataset.paint;
      storeValue(STORE.paint, selectedPaint);
      refreshMenu();
    });
  });
  soundToggle.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    storeValue(STORE.sound, String(audioEnabled));
    if (audioEnabled) ensureAudio();
    updateAudioMix();
    setAmbient(audioEnabled);
    refreshMenu();
  });
  document.querySelectorAll('.menu-nav-button').forEach((button, index, buttons) => {
    button.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.code)) return;
      event.preventDefault();
      const offset = event.code === 'ArrowDown' ? 1 : -1;
      buttons[(index + offset + buttons.length) % buttons.length].focus();
    });
  });
  refreshMenu();

  // Twinkling stars (generated once)
  const stars = Array.from({ length: 70 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.5 + 0.3, p: Math.random() * Math.PI * 2,
  }));

  // ---------------------------------------------------------------
  // 3. INPUT
  // ---------------------------------------------------------------
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (state !== 'menu' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (state === 'menu' && ['ArrowUp', 'ArrowDown'].includes(e.code) && !e.repeat) {
      const buttons = [...document.querySelectorAll('.menu-nav-button')];
      const current = buttons.indexOf(document.activeElement);
      const next = current < 0 ? 0 : (current + (e.code === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      e.preventDefault();
    } else if (e.code === 'Enter' && !e.repeat) {
      ensureAudio();
      if (state === 'menu' && document.activeElement === document.body) {
        e.preventDefault();
        launchCampaign();
      } else if (state !== 'menu') handleEnter();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function handleEnter() {
    if (state === 'levelClear' && level < LEVELS.length) {
      level++;
      if (level === 19) gauntletWave = 0;
      startLevel();
    } else if (state === 'gameOver' || state === 'victory') {
      menuLayer.hidden = false;
      state = 'menu';
      refreshMenu();
      setAmbient(false);
    }
  }

  // ---------------------------------------------------------------
  // 4. INITIALISATION
  // ---------------------------------------------------------------
  function startGame(startAtLevel = 1) {
    score = 0;
    lives = CONFIG.startLives;
    level = startAtLevel;
    gauntletWave = 0;
    startLevel();
  }

  function startLevel() {
    player = {
      x: W / 2, y: H - 60,
      w: CONFIG.player.w, h: CONFIG.player.h,
      cooldown: 0, alive: true, respawnTimer: 0, invuln: 0,
    };
    playerBullets = [];
    alienBullets = [];
    particles = [];
    meteors = [];
    laserBeams = [];
    boss = null;
    if (level === 19 && gauntletWave === 0) gauntletWave = 1;
    meteorTimer = 0.5;
    webPulse = 0;
    buildFormation();
    alienFireTimer = 1;
    levelIntroTimer = 1.8;
    state = 'levelIntro';
    setAmbient(true);
  }

  /** Builds the diamond-shaped alien formation. */
  function buildFormation() {
    const { spacingX, spacingY, w, h } = CONFIG.alien;
    formation = { x: W / 2, y: CONFIG.hudHeight + 40, dir: 1 };
    mirrorFormation = { x: W * 0.75, y: CONFIG.hudHeight + 55, dir: -1 };
    aliens = [];
    const stage = LEVELS[level - 1];
    if (stage.boss) {
      const health = { guardian: 18, scarecrow: 32, vanguard: 42, mothership: 90 }[stage.boss];
      boss = { type: stage.boss, x: W / 2, y: 130, dir: 1, hp: health, maxHp: health, fireTimer: 1.1, t: 0, phase: 1 };
      totalAliens = 0;
      return;
    }
    let rows = stage.rows || CONFIG.diamondRows;
    if (level === 19) rows = [[1, 3, 5], [2, 4, 6, 4, 2], [4, 6, 8, 6, 4], [1, 3, 5, 7, 5, 3, 1]][gauntletWave - 1];
    const addAlien = (count, row, group = 0) => {
      for (let c = 0; c < count; c++) {
        aliens.push({
          lx: (c - (count - 1) / 2) * spacingX,
          ly: row * spacingY,
          w: level === 17 ? w + 10 : w, h, row, alive: true, group,
          hp: level === 17 ? 3 : 1,
          splitReady: level === 8,
          phase: Math.random() * Math.PI * 2,
        });
      }
    };
    if (level === 14) {
      [1, 2, 3, 2, 1].forEach((count, row) => {
        addAlien(count, row, 0);
        addAlien(count, row, 1);
      });
      formation.x = W * 0.25;
    } else rows.forEach(addAlien);
    totalAliens = aliens.length;
  }

  // World position helpers (alien coords = formation origin + local offset)
  const ax = (a) => a.dive ? a.dive.x : (a.group === 1 ? mirrorFormation.x : formation.x) + a.lx + (level === 7 ? Math.sin(time * 2.2 + a.phase) * 62 : 0);
  const ay = (a) => a.dive ? a.dive.y : (a.group === 1 ? mirrorFormation.y : formation.y) + a.ly + (level === 7 ? Math.sin(time * 2.2 + a.phase + Math.PI / 2) * 16 : 0);
  const isCloaked = (a) => level === 4 && Math.sin(time * 5 + a.phase) > 0.87;

  // ---------------------------------------------------------------
  // 5. UPDATE LOGIC
  // ---------------------------------------------------------------
  function update(dt) {
    time += dt;
    updateParticles(dt);
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
    if (state === 'levelIntro') {
      levelIntroTimer -= dt;
      if (levelIntroTimer <= 0) state = 'playing';
      return;
    }
    if (state !== 'playing') return;

    updatePlayer(dt);
    updateAliens(dt);
    updateMeteors(dt);
    updateBullets(dt);
    updateLaserBeams(dt);
    checkCollisions();
    checkEndConditions();
  }

  function updatePlayer(dt) {
    const p = player;

    // Respawn countdown
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        p.alive = true;
        p.x = W / 2;
        p.invuln = CONFIG.player.invulnTime;
      }
      return;
    }

    if (p.invuln > 0) p.invuln -= dt;

    engineTrailTimer -= dt;
    if (engineTrailTimer <= 0) {
      particles.push({ x: p.x + Math.random() * 8 - 4, y: p.y + 15, vx: Math.random() * 22 - 11, vy: 55 + Math.random() * 30, life: 0.2, max: 0.2, color: Math.random() > 0.45 ? '#ff8a32' : '#ffd166', size: 2 + Math.random() * 2 });
      engineTrailTimer = 0.035;
    }

    // Movement
    if (keys.ArrowLeft || keys.KeyA) p.x -= CONFIG.player.speed * dt;
    if (keys.ArrowRight || keys.KeyD) p.x += CONFIG.player.speed * dt;
    p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, p.x));

    // Shooting (hold space)
    p.cooldown -= dt;
    if (keys.Space && p.cooldown <= 0) {
      playerBullets.push({ x: p.x, y: p.y - p.h / 2, w: 4, h: 16 });
      playTone(880, 190, 0.11, 'sawtooth', 0.09);
      p.cooldown = CONFIG.player.fireDelay;
    }
  }

  function updateAliens(dt) {
    if (boss) { updateBoss(dt); return; }
    const alive = aliens.filter((a) => a.alive);
    if (!alive.length) return;

    // Speed ramps up as the wave thins out, and with level
    const ratio = 1 - alive.length / totalAliens;
    const speed = (50 + (level - 1) * 12 + (level >= 3 ? ratio * 130 : 0)) * (level === 2 ? 1.3 : 1);
    if (level === 14) updateMirrorFormations(alive, speed, dt);
    else formation.x += formation.dir * speed * dt;

    // Bounce off screen edges and step down
    if (level !== 14) {
      let minX = Infinity, maxX = -Infinity;
      for (const a of alive) {
        minX = Math.min(minX, ax(a) - a.w / 2);
        maxX = Math.max(maxX, ax(a) + a.w / 2);
      }
      const margin = 8;
      if (formation.dir > 0 && maxX >= W - margin) {
        formation.dir = -1; formation.x -= maxX - (W - margin); formation.y += CONFIG.alien.drop;
      } else if (formation.dir < 0 && minX <= margin) {
        formation.dir = 1; formation.x += margin - minX; formation.y += CONFIG.alien.drop;
      }
    }

    updateDivers(alive, dt);

    // Enemy fire: a random "bottom-of-column" alien shoots
    alienFireTimer -= dt;
    if (alienFireTimer <= 0 && alienBullets.length < CONFIG.alienBullet.maxOnScreen + level) {
      const shooters = bottomAliens(alive);
      const s = shooters[Math.floor(Math.random() * shooters.length)];
      const origin = { x: ax(s), y: ay(s) + s.h / 2 };
      if (level === 17) {
        for (const vx of [-110, 0, 110]) alienBullets.push({ ...origin, vx, w: 7, h: 18 });
      } else alienBullets.push({ ...origin, w: 6, h: 18 });
      const { minDelay, maxDelay } = CONFIG.alienBullet;
      const rate = (minDelay + Math.random() * (maxDelay - minDelay)) / (1 + (level - 1) * 0.15);
      alienFireTimer = level === 13 ? rate * 0.75 : rate;
    }
  }

  function updateMirrorFormations(alive, speed, dt) {
    for (const [group, formationGroup] of [[0, formation], [1, mirrorFormation]]) {
      const members = alive.filter((a) => a.group === group && !a.dive);
      if (!members.length) continue;
      formationGroup.x += formationGroup.dir * speed * dt;
      const min = Math.min(...members.map((a) => formationGroup.x + a.lx - a.w / 2));
      const max = Math.max(...members.map((a) => formationGroup.x + a.lx + a.w / 2));
      if (max >= (group === 0 ? W * 0.48 : W - 8)) { formationGroup.dir = -1; formationGroup.y += CONFIG.alien.drop; }
      else if (min <= (group === 0 ? 8 : W * 0.52)) { formationGroup.dir = 1; formationGroup.y += CONFIG.alien.drop; }
    }
  }

  function updateDivers(alive, dt) {
    if (level !== 11) return;
    if (!aliens.some((a) => a.dive) && Math.random() < dt * 0.22) {
      const candidates = alive.filter((a) => !a.dive);
      const diver = candidates[Math.floor(Math.random() * candidates.length)];
      diver.dive = { x: ax(diver), y: ay(diver), startX: ax(diver), startY: ay(diver), t: 0 };
    }
    for (const a of alive) {
      if (!a.dive) continue;
      a.dive.t += dt;
      const progress = Math.min(1, a.dive.t / 2.2);
      a.dive.x = a.dive.startX + (player.x - a.dive.startX) * progress;
      a.dive.y = a.dive.startY + Math.sin(progress * Math.PI) * 205;
      if (progress >= 1) a.dive = null;
    }
  }

  function updateBoss(dt) {
    boss.t += dt;
    boss.x += boss.dir * (boss.type === 'mothership' ? 75 : 95) * dt;
    if (boss.x < 130 || boss.x > W - 130) boss.dir *= -1;
    if (boss.type === 'mothership') {
      const ratio = boss.hp / boss.maxHp;
      boss.phase = ratio > 0.65 ? 1 : ratio > 0.3 ? 2 : 3;
      boss.weakpointOpen = Math.sin(time * (boss.phase === 3 ? 3 : 1.8)) > (boss.phase === 3 ? -0.1 : 0.25);
    }
    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      const speed = CONFIG.alienBullet.speed + level * 6;
      const spread = boss.type === 'guardian' ? [-150, 0, 150] : boss.type === 'scarecrow' ? [-190, -95, 0, 95, 190] : boss.phase === 3 ? [-240, -120, 0, 120, 240] : [-120, 0, 120];
      for (const vx of spread) alienBullets.push({ x: boss.x, y: boss.y + 34, vx, speed, w: 10, h: boss.type === 'scarecrow' ? 22 : 18, kind: boss.type === 'scarecrow' ? 'scythe' : 'laser', spin: Math.random() * 6 });
      if (boss.type === 'mothership' && boss.phase >= 2) {
        for (const offset of [-85, 85]) laserBeams.push({ x: Math.max(28, Math.min(W - 28, boss.x + offset)), warning: 0.85, duration: 1.15, axis: 'vertical' });
        if (boss.phase === 3) laserBeams.push({ y: 360 + Math.sin(time) * 70, warning: 0.85, duration: 0.85, axis: 'horizontal' });
      }
      boss.fireTimer = boss.type === 'mothership' ? (boss.phase === 3 ? 0.72 : 1.15) : boss.type === 'scarecrow' ? 1.05 : 1.35;
    }
  }

  function updateMeteors(dt) {
    if (level === 9 && !boss) {
      meteorTimer -= dt;
      if (meteorTimer <= 0) {
        meteors.push({ x: 20 + Math.random() * (W - 40), y: -24, r: 12 + Math.random() * 14, vx: Math.random() * 70 - 35, vy: 100 + Math.random() * 100, spin: Math.random() * 6 });
        meteorTimer = 0.55 + Math.random() * 0.8;
      }
    }
    for (const meteor of meteors) { meteor.x += meteor.vx * dt; meteor.y += meteor.vy * dt; meteor.spin += dt * 2; }
    meteors = meteors.filter((meteor) => meteor.y < H + meteor.r);
  }

  function updateLaserBeams(dt) {
    for (const beam of laserBeams) { beam.warning -= dt; beam.duration -= dt; }
    laserBeams = laserBeams.filter((beam) => beam.duration > 0);
  }

  /** Returns the lowest alien in every column (so shots don't originate behind other ships). */
  function bottomAliens(alive) {
    const cols = new Map();
    for (const a of alive) {
      const key = Math.round(a.lx);
      if (!cols.has(key) || a.ly > cols.get(key).ly) cols.set(key, a);
    }
    return [...cols.values()];
  }

  function updateBullets(dt) {
    for (const b of playerBullets) b.y -= CONFIG.player.bulletSpeed * dt;
    playerBullets = playerBullets.filter((b) => b.y + b.h > 0);

    const speed = CONFIG.alienBullet.speed + (level - 1) * 20;
    for (const b of alienBullets) {
      b.y += (b.speed || speed) * dt;
      b.x += (b.vx || 0) * dt;
      b.spin = (b.spin || 0) + dt * 7;
    }
    alienBullets = alienBullets.filter((b) => b.y < H);
  }

  // Axis-aligned box overlap; both boxes use centre x/y with w/h
  const overlap = (ax_, ay_, aw, ah, bx, by, bw, bh) =>
    Math.abs(ax_ - bx) * 2 < aw + bw && Math.abs(ay_ - by) * 2 < ah + bh;

  function checkCollisions() {
    // Player bullets vs aliens
    for (const b of playerBullets) {
      for (const a of aliens) {
        if (!a.alive || b.dead || isCloaked(a)) continue;
        if (overlap(b.x, b.y, b.w, b.h, ax(a), ay(a), a.w, a.h)) {
          b.dead = true;
          if (a.splitReady) {
            a.alive = false;
            for (const side of [-1, 1]) aliens.push({ lx: a.lx + side * 17, ly: a.ly + 14, w: 20, h: 17, row: a.row, alive: true, group: a.group, hp: 1, phase: Math.random() * 6 });
            totalAliens = aliens.length;
            explode(ax(a), ay(a), '#69d9ff', 14);
          } else if (a.hp > 1) {
            a.hp--;
            explode(ax(a), ay(a), '#ffcb58', 5);
          } else {
            a.alive = false;
            score += CONFIG.alien.points * (1 + Math.floor((CONFIG.diamondRows.length - 1 - Math.abs(a.row - 3)) / 3));
            explode(ax(a), ay(a), level === 8 ? '#69d9ff' : '#9dff4a', 14);
          }
        }
      }
    }
    playerBullets = playerBullets.filter((b) => !b.dead);

    if (boss) {
      for (const b of playerBullets) {
        if (b.dead) continue;
        if (boss.type === 'vanguard' && bossShieldBlocks(b)) { b.dead = true; continue; }
        const point = boss.type === 'mothership' ? bossWeakPoint() : { x: boss.x, y: boss.y };
        const target = boss.type === 'mothership' ? point : boss;
        if (boss.type === 'mothership' && !boss.weakpointOpen) continue;
        if (overlap(b.x, b.y, b.w, b.h, target.x, target.y, boss.type === 'mothership' ? 42 : 140, boss.type === 'mothership' ? 34 : 72)) {
          boss.hp--;
          b.dead = true;
          explode(target.x, target.y, boss.type === 'mothership' ? '#ffec70' : '#ff9a1f', 4);
          if (boss.hp <= 0) { defeatBoss(); break; }
        }
      }
      playerBullets = playerBullets.filter((b) => !b.dead);
    }

    // Alien bullets vs player (ignored while respawning / invulnerable)
    if (player.alive && player.invuln <= 0) {
      for (const b of alienBullets) {
        if (overlap(b.x, b.y, b.w, b.h, player.x, player.y, player.w * 0.6, player.h * 0.8)) {
          hitPlayer();
          break;
        }
      }
      if (player.alive && meteors.some((m) => Math.hypot(m.x - player.x, m.y - player.y) < m.r + 14)) hitPlayer();
      if (player.alive && laserBeams.some((beam) => beam.warning <= 0 && (beam.axis === 'vertical' ? Math.abs(player.x - beam.x) < 16 : Math.abs(player.y - beam.y) < 13))) hitPlayer();
      if (player.alive && level === 12 && webTouchesPlayer()) hitPlayer();
    }
  }

  function bossWeakPoint() {
    return { x: boss.x + Math.sin(time * 1.4) * 72, y: boss.y + 28 + Math.cos(time * 1.8) * 8 };
  }

  function bossShieldBlocks(bullet) {
    for (let i = 0; i < 3; i++) {
      const angle = time * 1.8 + i * Math.PI * 2 / 3;
      const x = boss.x + Math.cos(angle) * 86;
      const y = boss.y + Math.sin(angle) * 48;
      if (Math.hypot(bullet.x - x, bullet.y - y) < 18) return true;
    }
    return false;
  }

  function defeatBoss() {
    playExplosionSound();
    triggerShake(11, 0.52);
    explode(boss.x, boss.y, '#ffb020', 70);
    boss = null;
    alienBullets = [];
    if (level === 20) { state = 'victory'; recordScore(); setAmbient(false); }
    else {
      clearBonus = lives * 100;
      score += clearBonus;
      unlockNextLevel();
      state = 'levelClear';
    }
  }

  function distanceToSegment(px, py, ax_, ay_, bx, by) {
    const dx = bx - ax_, dy = by - ay_;
    const t = Math.max(0, Math.min(1, ((px - ax_) * dx + (py - ay_) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - (ax_ + t * dx), py - (ay_ + t * dy));
  }

  function webTouchesPlayer() {
    const linked = aliens.filter((a) => a.alive && a.row % 2 === 0);
    for (let i = 0; i + 1 < linked.length; i += 2) {
      if (distanceToSegment(player.x, player.y, ax(linked[i]), ay(linked[i]), ax(linked[i + 1]), ay(linked[i + 1])) < 12) return true;
    }
    return false;
  }

  function hitPlayer() {
    lives--;
    playTone(540, 180, 0.34, 'square', 0.12);
    playTone(740, 250, 0.28, 'triangle', 0.07);
    playExplosionSound();
    triggerShake(5, 0.24);
    explode(player.x, player.y, '#ff9a1f', 30);
    player.alive = false;
    player.respawnTimer = CONFIG.player.respawnTime;
    alienBullets = [];        // clear the screen so respawn is fair
    if (lives <= 0) { state = 'gameOver'; recordScore(); setAmbient(false); }
  }

  function checkEndConditions() {
    if (state !== 'playing') return;
    if (boss) return;

    const alive = aliens.filter((a) => a.alive);

    // WIN: every alien destroyed
    if (alive.length === 0) {
      if (level === 19 && gauntletWave < 4) {
        gauntletWave++;
        alienBullets = [];
        playerBullets = [];
        buildFormation();
        return;
      }
      clearBonus = lives * 100;
      score += clearBonus;
      unlockNextLevel();
      state = 'levelClear';
      return;
    }

    // LOSE: aliens reached the player's row
    const lowest = Math.max(...alive.map((a) => ay(a) + a.h / 2));
    if (lowest >= player.y - player.h / 2) {
      lives = 0;
      state = 'gameOver';
      recordScore();
      setAmbient(false);
    }
  }

  // ---------------------------------------------------------------
  // 6. PARTICLES
  // ---------------------------------------------------------------
  function explode(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 180;
      particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 0.5 + Math.random() * 0.4, max: 0.9, color,
      });
    }
  }

  function updateParticles(dt) {
    if (!particles) return;
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
  }

  // ---------------------------------------------------------------
  // 7. RENDERING - BACKGROUND
  // ---------------------------------------------------------------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (level === 13) {
      g.addColorStop(0, '#15030b');
      g.addColorStop(1, '#581326');
    } else if (level === 6) {
      g.addColorStop(0, '#090412');
      g.addColorStop(1, '#21133b');
    } else if (level === 16) {
      g.addColorStop(0, '#000');
      g.addColorStop(1, '#03070b');
    } else {
      g.addColorStop(0, '#0a0414');
      g.addColorStop(1, '#1a0828');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Twinkling stars drift at different speeds on the title screen.
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + s.p));
      ctx.fillStyle = level === 16 ? '#75f7ff' : '#fff';
      const drift = state === 'menu' ? 4 + s.r * 7 : 1;
      ctx.fillRect((s.x + Math.sin(time * 0.08 + s.p) * 12 + W) % W, (s.y + time * drift) % H, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    if (level === 1 || state === 'menu') drawJackOLantern();
    if (level === 6 || state === 'menu') {
      for (let i = 0; i < 5; i++) {
        const y = 90 + i * 30 + Math.sin(time * 0.7 + i) * 14;
        const fog = ctx.createLinearGradient(0, y - 35, 0, y + 35);
        fog.addColorStop(0, 'rgba(165, 145, 205, 0)');
        fog.addColorStop(0.5, 'rgba(165, 145, 205, 0.22)');
        fog.addColorStop(1, 'rgba(165, 145, 205, 0)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, y - 35, W, 70);
      }
    }
  }

  /** Large, dim, pulsing Jack-o'-lantern face behind the action. */
  function drawJackOLantern() {
    const cx = W / 2, cy = H / 2 + 30;
    const R = Math.min(W, H) * 0.42;
    const heartbeat = Math.pow(Math.max(0, Math.sin(time * 2.2)), 8);
    const pulse = 0.42 + heartbeat * 0.58;
    const flicker = 0.9 + 0.1 * Math.sin(time * 17) * Math.sin(time * 5.3);

    ctx.save();

    // Pumpkin body
    ctx.fillStyle = `rgba(200, 80, 0, ${0.16 + 0.05 * pulse})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 1.2, R * 0.97, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ribs
    ctx.strokeStyle = 'rgba(90, 30, 0, 0.35)';
    ctx.lineWidth = 3;
    for (const off of [-0.8, -0.4, 0, 0.4, 0.8]) {
      ctx.beginPath();
      ctx.ellipse(cx + off * R * 0.6, cy, R * 0.32, R * 0.95, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Stem
    ctx.fillStyle = 'rgba(70, 110, 30, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy - R * 0.93);
    ctx.lineTo(cx + 18, cy - R * 0.93);
    ctx.lineTo(cx + 10, cy - R * 1.15);
    ctx.lineTo(cx - 8, cy - R * 1.12);
    ctx.closePath();
    ctx.fill();

    // Glowing face features
    const glowAlpha = (0.35 + 0.35 * pulse) * flicker;
    ctx.shadowColor = '#ffb020';
    ctx.shadowBlur = 25 + 25 * pulse;
    ctx.fillStyle = `rgba(255, 190, 40, ${glowAlpha})`;

    // Eyes (triangles)
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * R * 0.75, cy - R * 0.1);
      ctx.lineTo(cx + side * R * 0.25, cy - R * 0.1);
      ctx.lineTo(cx + side * R * 0.5, cy - R * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    // Nose
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * 0.02);
    ctx.lineTo(cx - R * 0.1, cy + R * 0.2);
    ctx.lineTo(cx + R * 0.1, cy + R * 0.2);
    ctx.closePath();
    ctx.fill();

    // Jagged grin: zig-zag top and bottom edges
    const n = 10, left = cx - R * 0.8, span = R * 1.6;
    const baseY = (i) => cy + R * 0.32 + R * 0.15 * Math.sin((Math.PI * i) / n);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = left + (span * i) / n;
      const y = baseY(i) - (i % 2 ? 0 : R * 0.08);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const x = left + (span * i) / n;
      const y = baseY(i) + R * 0.26 + (i % 2 ? R * 0.08 : 0);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // 8. RENDERING - SPRITES (all drawn procedurally, no assets needed)
  // ---------------------------------------------------------------
  /** Draws the player's airplane, nose pointing up, centred on (x, y). */
  function drawPlane(x, y, s = 1, flame = true, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);

    // Engine flame
    if (flame) {
      const f = 6 + Math.random() * 6;
      ctx.fillStyle = '#ff8a00';
      ctx.beginPath();
      ctx.moveTo(-4, 14); ctx.lineTo(0, 14 + f); ctx.lineTo(4, 14);
      ctx.fill();
    }
    // Wings
    ctx.fillStyle = PAINTS[selectedPaint].wing;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(22, 12); ctx.lineTo(22, 16);
    ctx.lineTo(0, 8); ctx.lineTo(-22, 16); ctx.lineTo(-22, 12);
    ctx.closePath();
    ctx.fill();
    // Tail fins
    ctx.fillStyle = PAINTS[selectedPaint].trim;
    ctx.fillRect(-10, 12, 6, 6);
    ctx.fillRect(4, 12, 6, 6);
    // Fuselage
    ctx.fillStyle = '#e8f1ff';
    ctx.beginPath();
    ctx.moveTo(0, -19); ctx.lineTo(5, -4); ctx.lineTo(4, 16);
    ctx.lineTo(-4, 16); ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.fill();
    // Cockpit
    ctx.fillStyle = '#ffb020';
    ctx.beginPath();
    ctx.ellipse(0, -5, 2.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Draws a flying-saucer alien ship. Colour varies by row. */
  function drawAlien(a) {
    const x = ax(a), y = ay(a);
    const hues = [120, 95, 150, 280, 150, 95, 120];
    const hue = level === 8 ? 195 : level === 17 ? 35 : hues[a.row % hues.length];
    const bob = Math.sin(time * 6 + a.lx * 0.05) * 1.5;

    if (level === 18) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#91eaff';
      ctx.beginPath();
      ctx.ellipse(x - Math.sin(time * 3 + a.phase) * 12, y + 5, a.w * 0.55, a.h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    if (isCloaked(a)) ctx.globalAlpha = 0.12;
    ctx.translate(x, y + bob);

    // Dome
    ctx.fillStyle = `hsl(${hue}, 80%, 65%)`;
    ctx.beginPath();
    ctx.arc(0, -3, 9, Math.PI, 0);
    ctx.fill();
    // Hull
    ctx.fillStyle = `hsl(${hue}, 45%, 35%)`;
    ctx.beginPath();
    ctx.ellipse(0, 3, a.w / 2, a.h * 0.31, 0, 0, Math.PI * 2);
    ctx.fill();
    // Blinking lights
    for (let i = -1; i <= 1; i++) {
      const on = Math.floor(time * 4 + i) % 2 === 0;
      ctx.fillStyle = on ? '#fff176' : '#7a5a00';
      ctx.fillRect(i * 10 - 2, 3, 4, 3);
    }
    // Eye
    ctx.fillStyle = '#1a0828';
    ctx.fillRect(-2, -6, 4, 4);
    if (a.hp > 1) {
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 2, a.w * 0.55, Math.PI, Math.PI * 2 * (1 - a.hp / 3));
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBullets() {
    // Player bullets: bright cyan bolts
    ctx.save();
    ctx.shadowColor = '#7ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#aff';
    for (const b of playerBullets) ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);

    // Alien lasers: hot orange/magenta
    ctx.shadowColor = '#f4a';
    ctx.fillStyle = '#ff6a3d';
    for (const b of alienBullets) {
      if (b.kind === 'scythe') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.fillStyle = '#c9e5ff';
        ctx.beginPath();
        ctx.moveTo(-3, -12); ctx.lineTo(10, -6); ctx.lineTo(4, 1); ctx.lineTo(13, 8); ctx.lineTo(-7, 5); ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        ctx.fillStyle = '#ffe3a0';
        ctx.fillRect(b.x - 1, b.y - b.h / 2, 2, b.h);
        ctx.fillStyle = '#ff6a3d';
      }
    }
    ctx.restore();
  }

  function drawBoss() {
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (boss.type === 'scarecrow') {
      ctx.strokeStyle = '#b98748';
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(-82, 0); ctx.lineTo(82, 0); ctx.stroke();
      ctx.fillStyle = '#63472d';
      ctx.fillRect(-28, -34, 56, 98);
      ctx.fillStyle = '#e4bd76';
      ctx.beginPath(); ctx.arc(0, -48, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#22151a';
      ctx.fillRect(-36, -82, 72, 12);
      ctx.fillRect(-20, -109, 40, 29);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(-11, -52, 7, 7); ctx.fillRect(8, -52, 7, 7);
    } else {
      const radius = boss.type === 'mothership' ? 120 : boss.type === 'vanguard' ? 82 : 66;
      ctx.fillStyle = boss.type === 'vanguard' ? '#456074' : '#bd531c';
      ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * 0.68, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = boss.type === 'mothership' ? '#ff9a1f' : '#f07b27';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.ellipse(i * radius * 0.27, 2, radius * 0.18, radius * 0.64, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#27202b';
      ctx.fillRect(-radius * 0.52, -12, 16, 10); ctx.fillRect(radius * 0.34, -12, 16, 10);
      if (boss.type === 'mothership') {
        ctx.strokeStyle = '#72f6ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, radius + 22, radius * 0.78, Math.sin(time) * 0.18, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();

    if (boss.type === 'vanguard') {
      for (let i = 0; i < 3; i++) {
        const angle = time * 1.8 + i * Math.PI * 2 / 3;
        ctx.fillStyle = '#a8e9ff';
        ctx.beginPath(); ctx.arc(boss.x + Math.cos(angle) * 86, boss.y + Math.sin(angle) * 48, 12, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (boss.type === 'mothership') {
      const point = bossWeakPoint();
      ctx.fillStyle = boss.weakpointOpen ? '#fff18a' : '#607880';
      ctx.shadowColor = boss.weakpointOpen ? '#fff18a' : '#000';
      ctx.shadowBlur = boss.weakpointOpen ? 22 : 0;
      ctx.beginPath(); ctx.arc(point.x, point.y, boss.weakpointOpen ? 15 : 10, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawStageHazards() {
    for (const meteor of meteors) {
      ctx.save(); ctx.translate(meteor.x, meteor.y); ctx.rotate(meteor.spin);
      ctx.fillStyle = '#8c8478'; ctx.strokeStyle = '#d1b99b'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const radius = meteor.r * (i % 2 ? 0.78 : 1);
        if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    for (const beam of laserBeams) {
      ctx.save();
      ctx.globalAlpha = beam.warning > 0 ? 0.35 : 0.85;
      ctx.fillStyle = beam.warning > 0 ? '#ff486a' : '#ff174f';
      if (beam.axis === 'vertical') ctx.fillRect(beam.x - 7, CONFIG.hudHeight, 14, H - CONFIG.hudHeight);
      else ctx.fillRect(0, beam.y - 7, W, 14);
      ctx.restore();
    }
    if (level === 12) {
      const linked = aliens.filter((a) => a.alive && a.row % 2 === 0);
      ctx.save(); ctx.strokeStyle = `rgba(75, 235, 255, ${0.4 + Math.sin(time * 5) * 0.2})`; ctx.lineWidth = 2;
      for (let i = 0; i + 1 < linked.length; i += 2) {
        ctx.beginPath(); ctx.moveTo(ax(linked[i]), ay(linked[i])); ctx.lineTo(ax(linked[i + 1]), ay(linked[i + 1])); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const size = p.size || 3;
      ctx.fillRect(p.x, p.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------
  // 9. RENDERING - HUD & SCREENS
  // ---------------------------------------------------------------
  function text(str, x, y, size, color = '#fff', align = 'left', glow) {
    ctx.save();
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, W, CONFIG.hudHeight);
    ctx.fillStyle = '#ff9a1f';
    ctx.fillRect(0, CONFIG.hudHeight - 2, W, 2);

    text('SCORE ' + String(score).padStart(6, '0'), 14, 22, 14, '#ffd166', 'left', '#ff9a1f');
    text('LEVEL ' + level + '/20', W / 2, 14, 11, '#9dff4a', 'center');
    text(LEVELS[level - 1].name, W / 2, 33, 7, '#fff', 'center');

    // Lives as little planes
    text('LIVES', W - 130, 22, 12, '#fff', 'right');
    for (let i = 0; i < lives; i++) drawPlane(W - 110 + i * 32, 22, 0.5, false);
    if (boss) {
      const barW = 280, left = (W - barW) / 2;
      ctx.fillStyle = '#30151b'; ctx.fillRect(left, 49, barW, 9);
      ctx.fillStyle = boss.type === 'mothership' ? '#ffb32c' : '#ff5968';
      ctx.fillRect(left, 49, barW * Math.max(0, boss.hp / boss.maxHp), 9);
      ctx.strokeStyle = '#fff'; ctx.strokeRect(left, 49, barW, 9);
    }
  }

  function overlay(title, titleColor, lines, prompt) {
    ctx.fillStyle = 'rgba(5, 0, 12, 0.72)';
    ctx.fillRect(0, 0, W, H);
    text(title, W / 2, H * 0.34, 36, titleColor, 'center', titleColor);
    lines.forEach((l, i) => text(l, W / 2, H * 0.5 + i * 32, 16, '#fff', 'center'));
    if (Math.floor(time * 2) % 2 === 0) text(prompt, W / 2, H * 0.78, 14, '#ffd166', 'center');
  }

  // ---------------------------------------------------------------
  // 10. MAIN RENDER + LOOP
  // ---------------------------------------------------------------
  function render() {
    ctx.save();
    if (shakeTimer > 0) ctx.translate((Math.random() - 0.5) * shakePower, (Math.random() - 0.5) * shakePower);
    drawBackground();

    if (state === 'menu') {
      ctx.restore();
      return;
    }

    for (const a of aliens) if (a.alive) drawAlien(a);
    drawStageHazards();
    drawBoss();
    drawBullets();
    if (player && player.alive) {
      const alpha = player.invuln > 0 ? 0.34 + 0.5 * (0.5 + 0.5 * Math.sin(time * 18)) : 1;
      drawPlane(player.x, player.y, 1, true, alpha);
    }
    drawParticles();
    drawHUD();

    if (state === 'levelIntro') {
      const act = Math.ceil(level / 5);
      overlay(`ACT ${['I', 'II', 'III', 'IV'][act - 1]}: ${ACTS[act - 1]}`, '#ffb34d',
        [`LEVEL ${String(level).padStart(2, '0')} — ${LEVELS[level - 1].name}`], 'PREPARE FOR ARRIVAL');
    } else if (state === 'levelClear') {
      overlay('LEVEL CLEAR!', '#9dff4a',
        [LEVELS[level - 1].name, 'SCORE ' + score, 'LIFE BONUS +' + clearBonus], 'PRESS ENTER FOR NEXT LEVEL');
    } else if (state === 'gameOver') {
      overlay('GAME OVER', '#ff4d4d',
        ['FINAL SCORE ' + score], 'PRESS ENTER TO RESTART');
    } else if (state === 'victory') {
      overlay('HARVEST SAVED!', '#ffcf48',
        ['THE MOTHERSHIP IS DESTROYED', 'FINAL SCORE ' + score], 'PRESS ENTER TO PLAY AGAIN');
    }
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);   // clamp to avoid big jumps on tab switch
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // Initialise placeholders so render() is safe before the first game starts
  aliens = []; particles = []; meteors = []; laserBeams = []; playerBullets = []; alienBullets = [];
  requestAnimationFrame(loop);
})();
