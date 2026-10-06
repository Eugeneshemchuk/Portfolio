/* Pixel Voyager: a tiny 8-bit space shooter. Canvas 2D at low resolution, scaled up with crisp pixels. */
(() => {
  "use strict";

  // Tune the feel here.
  const CONFIG = {
    pixels: 180,                  // world pixels across the short side of the screen
    speedStart: 45,               // scroll speed, world px/s
    speedMax: 150,
    speedGain: 0.012,             // extra px/s per px travelled
    planetDrift: 0.45,            // planets scroll slower than the rest, so there's time to break them
    shipAccel: 700,               // keyboard thrust, px/s²
    shipDrag: 4,
    shipMax: 120,
    fireRate: 12,                 // twin-laser volleys per second
    laserSpeed: 260,              // px/s
    planetHits: 150,              // laser hits to break a planet
    gravity: 30000,               // black hole pull strength
    gravityRange: 70,             // px
    gapStart: 80,                 // px travelled between spawns at the start
    gapEnd: 30,                   // ...and at full difficulty
    fullDifficultyAt: 8000,       // px travelled
    blackHolesFrom: 600,          // px travelled before black holes appear
    points: { dust: 25, rock: 10, planet: 500 },
    colors: {
      bg: "#0b0c0f",
      stars: ["#2a2e36", "#5a606c", "#f4f5f7"],
      ship: { b: "#9aa0ac", w: "#f4f5f7", c: "#5eb1ff" },
      laser: "#ff6ac1",
      flame: ["#ffa657", "#e3b341", "#ff5f57"],
      rock: { g: "#6b717d", G: "#a0a6b2", d: "#3a3e48" },
      dust: { y: "#7ee787", w: "#f4f5f7" },
      disk: ["#ffa657", "#e3b341", "#f4f5f7", "#ff6ac1"],
      horizon: "#2d1f4a",
      halo: "#4a3a80",
      hp: "#7ee787",
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
  const SHIP = sprite(["...b...", "...b...", "..bcb..", "..bcb..", ".bwwwb.", ".bwwwb.", "bbwwwbb", "bb.b.bb", "b.....b"], C.ship);
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
  let stars = [], things = [], bits = [], shots = [];
  let state = "title", clock = 0, dist = 0, bonus = 0, speed = 0, nextSpawn = 0, overTimer = 0, milestone = 0, reload = 0;
  const ship = { x: 0, y: 0, vx: 0, vy: 0, alive: true };
  const keys = new Set();
  let target = null, pointerFire = false, best = 0;
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
    if (state !== "play") { ship.x = W / 2; ship.y = H * 0.8; }
    ship.x = Math.min(ship.x, W - 4);
    ship.y = Math.min(ship.y, H - 6);
    draw();
  }

  // --- Spawning: everything enters from the top ---
  function spawn() {
    const k = Math.min(1, dist / CONFIG.fullDifficultyAt);
    nextSpawn = dist + CONFIG.gapStart + (CONFIG.gapEnd - CONFIG.gapStart) * k + rnd(0, 30);
    const roll = Math.random();
    if (roll < 0.12 && dist > CONFIG.blackHolesFrom) {
      const r = Math.round(rnd(4, 7));
      things.push({ kind: "hole", x: rnd(r + 10, W - r - 10), y: -30, r, a: rnd(0, 6) });
    } else if (roll < 0.4) {
      const r = Math.round(rnd(6, Math.max(8, Math.min(24, W / 5))));
      const ramp = C.planets[(Math.random() * C.planets.length) | 0];
      things.push({ kind: "planet", x: rnd(-r / 2, W + r / 2), y: -r - 2, r, ramp, hp: CONFIG.planetHits, hit: 0, img: planet(r, ramp, Math.random() < 0.4) });
    } else if (roll < 0.58) {
      const x0 = rnd(12, W - 12), n = 3 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) things.push({ kind: "dust", x: x0 + Math.sin(i * 0.9) * 6, y: -4 - i * 9, r: 4 });
    } else {
      const big = Math.random() < 0.6, img = ROCKS[big ? 0 : 1];
      things.push({ kind: "rock", x: rnd(4, W - 4), y: -6, r: big ? 2.5 : 1.5, vx: rnd(-12, 12), img });
    }
  }

  function burst(x, y, n, colors, v) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.28), s = rnd(v * 0.2, v);
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 1.1), c: colors[i % colors.length] });
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
      things = []; bits = []; shots = []; dist = 0; bonus = 0; milestone = 0; reload = 0;
      speed = CONFIG.speedStart; nextSpawn = 60;
      Object.assign(ship, { x: W / 2, y: H * 0.8, vx: 0, vy: 0, alive: true });
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
    keys.clear(); pointerFire = false;
    setScreen("PAUSED", "Take a breath. Space is patient.", "Resume");
    startBtn.focus();
  }

  function crash() {
    ship.alive = false;
    state = "over";
    overTimer = 1;
    burst(ship.x, ship.y, 30, [C.ship.w, ...C.flame], 60);
    beep(300, 30, 0.6, "sawtooth", 0.06);
  }

  const score = () => Math.floor(dist / 8) + bonus;

  // --- Update ---
  function update(dt) {
    clock += dt;
    const playing = state === "play";
    const flow = playing ? speed : state === "over" ? speed * 0.4 : 30;

    for (const s of stars) {
      s.y += flow * (0.15 + s.l * 0.3) * dt;
      if (s.y > H) { s.y -= H; s.x = rnd(0, W); }
    }

    if (state === "title") { ship.x = W / 2; ship.y = H * 0.8 + Math.sin(clock * 2) * 3; return; }

    for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    bits = bits.filter((b) => b.life > 0);

    if (state === "over") {
      for (const t of things) t.y += flow * (t.kind === "planet" ? CONFIG.planetDrift : 1) * dt;
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

    // Twin lasers from the wing tips.
    reload -= dt;
    if ((keys.has("fire") || pointerFire) && reload <= 0) {
      reload = 1 / CONFIG.fireRate;
      shots.push({ x: Math.round(ship.x) - 3, y: ship.y - 1 }, { x: Math.round(ship.x) + 3, y: ship.y - 1 });
      beep(1400, 700, 0.04, "square", 0.012);
    }
    for (const s of shots) {
      s.y -= CONFIG.laserSpeed * dt;
      for (const t of things) {
        if (t.gone || t.kind === "dust") continue;
        const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy);
        if (t.kind === "rock" && d < t.r + 2) {
          t.gone = s.gone = true;
          bonus += CONFIG.points.rock;
          burst(t.x, t.y, 10, [C.rock.g, C.rock.G, C.rock.d], 40);
          beep(400, 80, 0.12, "square", 0.03);
        } else if (t.kind === "planet" && d < t.r) {
          s.gone = true;
          t.hit = 0.05;
          burst(s.x, s.y, 2, [C.laser, t.ramp[2]], 30);
          if (--t.hp <= 0) {
            t.gone = true;
            bonus += CONFIG.points.planet;
            burst(t.x, t.y, 40 + t.r * 4, [...t.ramp, C.flame[0], C.ship.w], 30 + t.r * 3);
            beep(200, 20, 0.8, "sawtooth", 0.06);
          }
        } else if (t.kind === "hole" && d < t.r + 3) {
          s.gone = true;
        }
        if (s.gone) break;
      }
    }
    shots = shots.filter((s) => !s.gone && s.y > -4);

    for (const t of things) {
      if (t.gone) continue;
      t.y += speed * (t.kind === "planet" ? CONFIG.planetDrift : 1) * dt;
      if (t.kind === "rock") { t.x += t.vx * dt; if (t.x < 2 || t.x > W - 2) t.vx = -t.vx; }
      if (t.hit > 0) t.hit -= dt;
      const dx = t.x - ship.x, dy = t.y - ship.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      if (t.kind === "hole" && d < CONFIG.gravityRange) {
        const f = CONFIG.gravity / Math.max(d2, 16);
        ship.vx += (dx / d) * f * dt;
        ship.vy += (dy / d) * f * dt;
      }
      if (t.kind === "dust") {
        if (d < t.r + 2) { t.gone = true; bonus += CONFIG.points.dust; beep(880, 1760, 0.08); }
      } else if (d < t.r + 2) {
        crash();
        return;
      }
    }
    things = things.filter((t) => !t.gone && t.y < H + 40);

    ship.x = Math.max(4, Math.min(W - 4, ship.x + ship.vx * dt));
    ship.y = Math.max(H * 0.35, Math.min(H - 6, ship.y + ship.vy * dt));

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
      if (t.kind === "planet") drawPlanet(t, x, y);
      else if (t.kind === "rock") ctx.drawImage(t.img, x - (t.img.width >> 1), y - (t.img.height >> 1));
      else if (t.kind === "dust") { if ((clock * 6 + t.y) % 4 > 0.6) ctx.drawImage(DUST, x - 1, y - 1); }
      else drawHole(t, x, y);
    }

    ctx.fillStyle = C.laser;
    for (const s of shots) ctx.fillRect(s.x, Math.round(s.y) - 3, 1, 3);

    if (ship.alive) {
      const x = Math.round(ship.x) - 3, y = Math.round(ship.y) - 4;
      ctx.drawImage(SHIP, x, y);
      if (state === "play" || state === "title") {
        const n = 1 + ((clock * 20) % 3 | 0);
        ctx.fillStyle = C.flame[(clock * 15 | 0) % 3];
        ctx.fillRect(x + 3, y + 8, 1, n);
      }
    }
    for (const b of bits) { ctx.fillStyle = b.c; ctx.fillRect(b.x | 0, b.y | 0, 1, 1); }
  }

  // Planet: shakes a pixel when hit; a health bar appears once it's damaged.
  function drawPlanet(t, x, y) {
    const j = t.hit > 0 ? (clock * 60 & 1 ? 1 : -1) : 0;
    ctx.drawImage(t.img, x - t.r + j, y - t.r);
    if (t.hp < CONFIG.planetHits) {
      const w = t.r * 2, by = y - t.r - 3;
      ctx.fillStyle = C.horizon;
      ctx.fillRect(x - t.r, by, w, 1);
      ctx.fillStyle = C.hp;
      ctx.fillRect(x - t.r, by, Math.ceil((w * t.hp) / CONFIG.planetHits), 1);
    }
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
  const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "fire" };
  addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (k && state === "play") { keys.add(k); if (k !== "fire") target = null; e.preventDefault(); return; }
    if (e.code === "KeyP" || e.code === "Escape") { state === "play" ? pause() : state === "pause" && start(); return; }
    if ((e.code === "Space" || e.code === "Enter") && state !== "play" && !(state === "over" && screen.hidden)) {
      e.preventDefault();
      start();
    }
  });
  addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener("blur", () => { keys.clear(); pointerFire = false; });

  // Mouse: the ship follows the cursor, hold the button to fire.
  // Touch: the ship follows the finger, held a little above it so it stays visible, and fires while touching.
  const toWorld = (e) => ({ x: e.clientX / scale, y: e.clientY / scale - (e.pointerType === "mouse" ? 0 : 14) });
  cvs.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) target = toWorld(e); }, { passive: true });
  cvs.addEventListener("pointerdown", (e) => { target = toWorld(e); pointerFire = true; }, { passive: true });
  const release = (e) => { pointerFire = false; if (e.pointerType !== "mouse") target = null; };
  cvs.addEventListener("pointerup", release, { passive: true });
  cvs.addEventListener("pointercancel", release, { passive: true });

  startBtn.addEventListener("click", start);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); else loop(); });

  let resizeTimer = 0;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); });

  if (matchMedia("(pointer: coarse)").matches) $("[data-keys]").textContent = "Drag to steer, lasers fire while you touch";
  bestEl.textContent = best;
  setScreen("PIXEL VOYAGER", msg.textContent, "Launch");
  resize();
  loop();
})();
