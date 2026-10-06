/* Pixel Voyager: a tiny 8-bit space game. Canvas 2D at low resolution, scaled up with crisp pixels. */
(() => {
  "use strict";

  // Tune the feel here.
  const CONFIG = {
    pixels: 180,                  // world pixels across the short side of the screen
    speedStart: 45,               // scroll speed, world px/s
    speedMax: 150,
    speedGain: 0.012,             // extra px/s per px travelled
    shipAccel: 700,               // keyboard thrust, px/s²
    shipDrag: 4,
    shipMax: 120,
    gravity: 30000,               // black hole pull strength
    gravityRange: 70,             // px
    gapStart: 80,                 // px travelled between spawns at the start
    gapEnd: 30,                   // ...and at full difficulty
    fullDifficultyAt: 8000,       // px travelled
    blackHolesFrom: 600,          // px travelled before black holes appear
    dustPoints: 25,
    colors: {
      bg: "#0b0c0f",
      stars: ["#2a2e36", "#5a606c", "#f4f5f7"],
      ship: { b: "#9aa0ac", w: "#f4f5f7", c: "#5eb1ff" },
      flame: ["#ffa657", "#e3b341", "#ff5f57"],
      rock: { g: "#6b717d", G: "#a0a6b2", d: "#3a3e48" },
      dust: { y: "#7ee787", w: "#f4f5f7" },
      disk: ["#ffa657", "#e3b341", "#f4f5f7", "#ff6ac1"],
      horizon: "#2d1f4a",
      halo: "#4a3a80",
      planets: [
        ["#1d3557", "#3a6ea5", "#5eb1ff"],
        ["#4a1d3f", "#a03c78", "#ff6ac1"],
        ["#3d2a12", "#a8742c", "#e3b341"],
        ["#123d2a", "#2f8f5b", "#7ee787"],
        ["#2d1f4a", "#6b4fb3", "#c792ea"],
      ],
    },
  };

  const C = CONFIG.colors;
  const cvs = document.querySelector("canvas");
  const ctx = cvs.getContext("2d");
  const $ = (s) => document.querySelector(s);
  const screen = $("[data-screen]"), msg = $("[data-msg]"), startBtn = $("[data-start]");
  const hud = $(".hud"), scoreEl = $("[data-score]"), bestEl = $("[data-best]"), soundBtn = $(".sound");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // --- Sprites: one char per pixel, '.' is transparent ---
  function sprite(rows, pal) {
    const c = document.createElement("canvas");
    c.width = rows[0].length; c.height = rows.length;
    const g = c.getContext("2d");
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }
  const SHIP = sprite(["..b......", ".bbb.....", "bbwwbb...", "bbwccbbbb", "bbwwbb...", ".bbb.....", "..b......"], C.ship);
  const ROCKS = [
    sprite([".gggg.", "gGgggg", "ggggGg", "gggggd", "gGgggd", ".gddd."], C.rock),
    sprite([".gg.", "gGgg", "gggd", ".dd."], C.rock),
  ];
  const DUST = sprite([".w.", "wyw", ".w."], C.dust);

  // Planet: dithered sphere lit from the top left, optional gas-giant bands.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function planet(r, ramp, banded) {
    const d = r * 2 + 1, c = document.createElement("canvas");
    c.width = c.height = d;
    const g = c.getContext("2d"), phase = rnd(0, 6);
    for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
      const dx = (x - r) / r, dy = (y - r) / r, q = dx * dx + dy * dy;
      if (q > 1 + 0.8 / r) continue;
      const nz = Math.sqrt(Math.max(0, 1 - q));
      let t = (-dx * 0.5 - dy * 0.5 + nz * 0.7 + 0.3) / 1.3;
      if (banded) t += 0.15 * Math.sin(dy * 7 + phase);
      const i = Math.floor(t * 3 + BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5);
      g.fillStyle = ramp[Math.max(0, Math.min(2, i))];
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  // --- State ---
  let W = 0, H = 0, scale = 1;
  let stars = [], things = [], bits = [];
  let state = "title", clock = 0, dist = 0, bonus = 0, speed = 0, nextSpawn = 0, overTimer = 0, milestone = 0;
  const ship = { x: 0, y: 0, vx: 0, vy: 0, alive: true };
  const keys = new Set();
  let target = null, best = 0;
  try { best = +localStorage.getItem("pixel-voyager-best") || 0; } catch (e) {}

  function resize() {
    scale = Math.max(1, Math.round(Math.min(innerWidth, innerHeight) / CONFIG.pixels));
    const w = Math.ceil(innerWidth / scale), h = Math.ceil(innerHeight / scale);
    cvs.style.width = w * scale + "px";
    cvs.style.height = h * scale + "px";
    if (w === W && h === H) return;
    W = cvs.width = w; H = cvs.height = h;
    stars = [];
    for (let i = 0; i < (W * H) / 90; i++) stars.push({ x: rnd(0, W), y: rnd(0, H), l: i % 3 });
    if (state !== "play") ship.y = H / 2;
    ship.x = Math.min(ship.x || W * 0.2, W * 0.6);
    ship.y = Math.min(ship.y, H - 4);
    draw();
  }

  // --- Spawning ---
  function spawn() {
    const k = Math.min(1, dist / CONFIG.fullDifficultyAt);
    nextSpawn = dist + CONFIG.gapStart + (CONFIG.gapEnd - CONFIG.gapStart) * k + rnd(0, 30);
    const roll = Math.random();
    if (roll < 0.12 && dist > CONFIG.blackHolesFrom) {
      const r = Math.round(rnd(4, 7));
      things.push({ kind: "hole", x: W + 30, y: rnd(r + 10, H - r - 10), r, a: rnd(0, 6) });
    } else if (roll < 0.4) {
      const r = Math.round(rnd(6, Math.max(8, Math.min(24, H / 5))));
      const ramp = C.planets[(Math.random() * C.planets.length) | 0];
      things.push({ kind: "planet", x: W + r + 2, y: rnd(-r / 2, H + r / 2), r, img: planet(r, ramp, Math.random() < 0.4) });
    } else if (roll < 0.58) {
      const y0 = rnd(12, H - 12), n = 3 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) things.push({ kind: "dust", x: W + 4 + i * 9, y: y0 + Math.sin(i * 0.9) * 6, r: 4 });
    } else {
      const big = Math.random() < 0.6, img = ROCKS[big ? 0 : 1];
      things.push({ kind: "rock", x: W + 6, y: rnd(4, H - 4), r: big ? 2.5 : 1.5, vy: rnd(-12, 12), img });
    }
  }

  // --- Sound: square-wave beeps, muted until the player turns it on ---
  let ac = null, soundOn = false;
  function beep(f0, f1, dur, type = "square", vol = 0.04) {
    if (!soundOn || !ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur);
  }
  soundBtn.hidden = false;
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    if (soundOn && !ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac && ac.state === "suspended") ac.resume();
    soundBtn.setAttribute("aria-pressed", soundOn);
    soundBtn.textContent = soundOn ? "Sound on" : "Sound off";
    beep(440, 880, 0.08);
    soundBtn.blur();
  });

  // --- Game flow ---
  function setScreen(title, text, button) {
    screen.hidden = !title;
    if (!title) return;
    screen.querySelector(".screen__title").textContent = title;
    msg.textContent = text;
    startBtn.textContent = button;
  }

  function start() {
    if (state === "play") return;
    if (state !== "pause") {
      things = []; bits = []; dist = 0; bonus = 0; milestone = 0;
      speed = CONFIG.speedStart; nextSpawn = 60;
      Object.assign(ship, { x: W * 0.2, y: H / 2, vx: 0, vy: 0, alive: true });
      beep(220, 880, 0.25);
    }
    state = "play";
    hud.hidden = false;
    setScreen();
    startBtn.blur();
    loop();
  }

  function pause() {
    if (state !== "play") return;
    state = "pause";
    setScreen("PAUSED", "Take a breath. Space is patient.", "Resume");
    startBtn.focus();
  }

  function crash() {
    ship.alive = false;
    state = "over";
    overTimer = 1;
    for (let i = 0; i < 30; i++) {
      const a = rnd(0, 6.28), v = rnd(10, 60);
      bits.push({ x: ship.x, y: ship.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.5, 1.2), c: i % 2 ? C.flame[i % 3] : C.ship.w });
    }
    beep(300, 30, 0.6, "sawtooth", 0.06);
  }

  const score = () => Math.floor(dist / 8) + bonus;

  // --- Update ---
  function update(dt) {
    clock += dt;
    const playing = state === "play";
    const flow = playing ? speed : state === "over" ? speed * 0.4 : 30;

    for (const s of stars) {
      s.x -= flow * (0.15 + s.l * 0.3) * dt;
      if (s.x < 0) { s.x += W; s.y = rnd(0, H); }
    }

    if (state === "title") { ship.x = W * 0.2; ship.y = H / 2 + Math.sin(clock * 2) * 4; return; }

    for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    bits = bits.filter((b) => b.life > 0);

    if (state === "over") {
      for (const t of things) t.x -= flow * dt;
      if ((overTimer -= dt) <= 0 && screen.hidden) {
        const s = score(), record = s > best;
        if (record) { best = s; try { localStorage.setItem("pixel-voyager-best", s); } catch (e) {} }
        bestEl.textContent = best;
        setScreen("GAME OVER", (record ? "New best: " : "Score: ") + s + ". Again?", "Fly again");
        startBtn.focus();
      }
      return;
    }
    if (!playing) return;

    dist += speed * dt;
    speed = Math.min(CONFIG.speedMax, CONFIG.speedStart + dist * CONFIG.speedGain);
    if (dist >= nextSpawn) spawn();

    // Steering: keyboard thrust, or follow the pointer.
    const kx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
    const ky = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
    if (target) {
      const m = CONFIG.shipMax * 1.5, k = Math.min(1, 10 * dt);
      const dx = Math.max(-m, Math.min(m, (target.x - ship.x) * 8));
      const dy = Math.max(-m, Math.min(m, (target.y - ship.y) * 8));
      ship.vx += (dx - ship.vx) * k;
      ship.vy += (dy - ship.vy) * k;
    } else {
      ship.vx += kx * CONFIG.shipAccel * dt - ship.vx * CONFIG.shipDrag * dt;
      ship.vy += ky * CONFIG.shipAccel * dt - ship.vy * CONFIG.shipDrag * dt;
      const v = Math.hypot(ship.vx, ship.vy);
      if (v > CONFIG.shipMax) { ship.vx *= CONFIG.shipMax / v; ship.vy *= CONFIG.shipMax / v; }
    }

    for (const t of things) {
      t.x -= speed * dt;
      if (t.kind === "rock") { t.y += t.vy * dt; if (t.y < 2 || t.y > H - 2) t.vy = -t.vy; }
      const dx = t.x - ship.x, dy = t.y - ship.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      if (t.kind === "hole" && d < CONFIG.gravityRange) {
        const f = CONFIG.gravity / Math.max(d2, 16);
        ship.vx += (dx / d) * f * dt;
        ship.vy += (dy / d) * f * dt;
      }
      if (t.kind === "dust") {
        if (d < t.r + 2) { t.gone = true; bonus += CONFIG.dustPoints; beep(880, 1760, 0.08); }
      } else if (d < t.r + 2) {
        crash();
        return;
      }
    }
    things = things.filter((t) => !t.gone && t.x > -40);

    ship.x = Math.max(6, Math.min(W * 0.6, ship.x + ship.vx * dt));
    ship.y = Math.max(4, Math.min(H - 4, ship.y + ship.vy * dt));

    const s = score();
    scoreEl.textContent = s;
    if (s >= milestone + 500) { milestone += 500; beep(660, 990, 0.12); }
  }

  // --- Draw ---
  function draw() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) { ctx.fillStyle = C.stars[s.l]; ctx.fillRect(s.x | 0, s.y | 0, 1, 1); }

    for (const t of things) {
      const x = Math.round(t.x), y = Math.round(t.y);
      if (t.kind === "planet") ctx.drawImage(t.img, x - t.r, y - t.r);
      else if (t.kind === "rock") ctx.drawImage(t.img, x - (t.img.width >> 1), y - (t.img.height >> 1));
      else if (t.kind === "dust") { if ((clock * 6 + t.x) % 4 > 0.6) ctx.drawImage(DUST, x - 1, y - 1); }
      else drawHole(t, x, y);
    }

    if (ship.alive) {
      const x = Math.round(ship.x) - 4, y = Math.round(ship.y) - 3;
      ctx.drawImage(SHIP, x, y);
      if (state === "play" || state === "title") {
        const n = 1 + ((clock * 20) % 3 | 0);
        ctx.fillStyle = C.flame[(clock * 15 | 0) % 3];
        ctx.fillRect(x - n, y + 3, n, 1);
      }
    }
    for (const b of bits) { ctx.fillStyle = b.c; ctx.fillRect(b.x | 0, b.y | 0, 1, 1); }
  }

  // Black hole: tilted accretion disk, back half behind the horizon, front half over it.
  function drawHole(t, x, y) {
    const disk = (front) => {
      for (let i = 0; i < 48; i++) {
        const a = t.a + i * 0.131 + clock * (1.5 + (i % 4) * 0.4), s = Math.sin(a);
        if ((s > 0) !== front) continue;
        const rr = t.r + 2 + (i % 4) * 1.5;
        ctx.fillStyle = C.disk[i % 4];
        ctx.fillRect(Math.round(x + Math.cos(a) * rr * 1.6), Math.round(y + s * rr * 0.45), 1, 1);
      }
    };
    // Faint dotted halo marks the pull zone.
    ctx.fillStyle = C.halo;
    const hr = t.r + 14;
    for (let i = 0; i < 20; i++) {
      const a = i * 0.314 - clock * 0.3;
      ctx.fillRect(Math.round(x + Math.cos(a) * hr), Math.round(y + Math.sin(a) * hr), 1, 1);
    }
    disk(false);
    ctx.fillStyle = C.horizon;
    ctx.beginPath(); ctx.arc(x, y, t.r + 1, 0, 6.29); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(x, y, t.r, 0, 6.29); ctx.fill();
    disk(true);
  }

  // --- Loop: runs only while something moves, stops when the tab is hidden ---
  let raf = 0, last = 0;
  const wants = () => !document.hidden && (state === "play" || (state === "over" && (bits.length || screen.hidden)) || (state === "title" && !reduced));
  function frame(t) {
    raf = 0;
    update(Math.min((t - last) / 1000, 1 / 30));
    last = t;
    draw();
    if (wants()) raf = requestAnimationFrame(frame);
  }
  function loop() {
    if (raf || !wants()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // --- Input ---
  const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (k) { keys.add(k); target = null; if (state === "play") e.preventDefault(); return; }
    if (e.code === "KeyP" || e.code === "Escape") { state === "play" ? pause() : state === "pause" && start(); return; }
    if ((e.code === "Space" || e.code === "Enter") && state !== "play" && !(state === "over" && screen.hidden)) {
      e.preventDefault();
      start();
    }
  });
  addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener("blur", () => keys.clear());

  // Touch: the ship follows the finger, held a little ahead of it so it stays visible.
  const toWorld = (e) => ({ x: e.clientX / scale + (e.pointerType === "mouse" ? 0 : 14), y: e.clientY / scale });
  cvs.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) target = toWorld(e); }, { passive: true });
  cvs.addEventListener("pointerdown", (e) => { target = toWorld(e); }, { passive: true });
  cvs.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") target = null; }, { passive: true });

  startBtn.addEventListener("click", start);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); else loop(); });

  let resizeTimer = 0;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); });

  if (matchMedia("(pointer: coarse)").matches) $("[data-keys]").textContent = "Drag to steer";
  bestEl.textContent = best;
  setScreen("PIXEL VOYAGER", msg.textContent, "Launch");
  resize();
  loop();
})();
