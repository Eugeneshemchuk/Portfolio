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
    dragGain: 1.4,                // touch: ship moves this many px per px the finger drags
    laserSpeed: 260,              // px/s
    planetHits: 150,              // laser damage to break a planet
    chargeTime: 0.9,              // seconds holding fire for a power shot
    powerDamage: 30,              // power shot damage, times the laser damage
    forcePressure: 0.75,          // touch pressure that charges a power shot instantly
    magnet: 22,                   // px: loose ore drifts to the ship
    // Asteroid sizes: radius, hits to break [min, max], scroll factor, ore carried, spawn weight early -> late
    asteroids: [
      { r: 2, hits: [1, 1], drift: 1, ore: [], w: [5, 3] },
      { r: 3.5, hits: [3, 4], drift: 0.85, ore: ["mineral", "mineral"], w: [4, 3] },
      { r: 5.5, hits: [5, 7], drift: 0.7, ore: ["mineral", "mineral", "crystal"], w: [1, 3] },
      { r: 8, hits: [8, 10], drift: 0.55, ore: ["mineral", "crystal", "crystal", "crystal"], w: [0, 2] },
    ],
    ore: { mineral: 1, crystal: 3 }, // xp per piece
    // Levels: xp needed, guns as [x offset, sideways speed], damage per hit, volleys/s, speed factor, ship size tier
    levels: [
      { xp: 0, guns: [[-3, 0], [3, 0]], dmg: 1, rate: 12, speed: 1, tier: 0, perk: "" },
      { xp: 5, guns: [[-3, 0], [3, 0]], dmg: 1, rate: 15, speed: 1.06, tier: 0, perk: "Faster lasers" },
      { xp: 12, guns: [[-4, 0], [0, 0], [4, 0]], dmg: 1, rate: 15, speed: 1.1, tier: 1, perk: "Triple lasers" },
      { xp: 22, guns: [[-4, 0], [0, 0], [4, 0]], dmg: 2, rate: 15, speed: 1.14, tier: 1, perk: "Heavy lasers" },
      { xp: 35, guns: [[-5, -30], [-2, 0], [2, 0], [5, 30]], dmg: 2, rate: 16, speed: 1.18, tier: 1, perk: "Spread shot" },
      { xp: 52, guns: [[-6, -40], [-3, 0], [0, 0], [3, 0], [6, 40]], dmg: 2, rate: 16, speed: 1.22, tier: 2, perk: "Five-way spread" },
      { xp: 72, guns: [[-6, -40], [-3, 0], [0, 0], [3, 0], [6, 40]], dmg: 3, rate: 16, speed: 1.26, tier: 2, perk: "Plasma lasers" },
      { xp: 96, guns: [[-6, -40], [-3, 0], [0, 0], [3, 0], [6, 40]], dmg: 3, rate: 18, speed: 1.3, tier: 2, perk: "Max power, quick charge", charge: 0.5 },
    ],
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
      lasers: ["#ff6ac1", "#56d4dd", "#7ee787"], // by damage 1, 2, 3
      flame: ["#ffa657", "#e3b341", "#ff5f57"],
      rock: ["#3a3e48", "#6b717d", "#a0a6b2"],
      mineral: { a: "#e3b341", o: "#ffa657" },
      crystal: { c: "#56d4dd", p: "#c792ea", w: "#f4f5f7" },
      dust: { y: "#7ee787", w: "#f4f5f7" },
      xp: "#e3b341",
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
  // Ship grows a size with upgrades. Flame comes out of the bottom-centre gap.
  const SHIPS = [
    sprite(["...b...", "...b...", "..bcb..", "..bcb..", ".bwwwb.", ".bwwwb.", "bbwwwbb", "bb.b.bb", "b.....b"], C.ship),
    sprite(["....b....", "....b....", "...bcb...", "...bcb...", "..bwcwb..", ".bbwwwbb.", "bbwwwwwbb", "bcbwwwbcb", "bb.b.b.bb", "b.......b"], C.ship),
    sprite([".....b.....", ".....b.....", "....bcb....", "....bcb....", "...bwcwb...", "b..bwwwb..b", "bbbwwwwwbbb", "bcbwwwwwbcb", "bcbbwwwbbcb", "bb..b.b..bb", "b.........b"], C.ship),
  ];
  const SHIP_R = [2, 2.5, 3]; // hit radius per size
  const DUST = sprite([".w.", "wyw", ".w."], C.dust);
  const ORE = { mineral: sprite(["ao", "oa"], C.mineral), crystal: sprite([".c.", "cwp", ".p."], C.crystal) };

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const dither = (t, x, y, n) => Math.max(0, Math.min(n - 1, Math.floor(t * n + BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5)));

  // Asteroid: lumpy dithered rock lit from the top left, with its ore showing on the surface.
  function asteroid(r, ore) {
    const d = Math.ceil(r) * 2 + 1, m = d >> 1, c = document.createElement("canvas");
    c.width = c.height = d;
    const g = c.getContext("2d"), p0 = rnd(0, 6), p1 = rnd(0, 6), inside = [];
    for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
      const dx = x - m, dy = y - m, a = Math.atan2(dy, dx);
      const edge = r * (0.86 + 0.1 * Math.sin(3 * a + p0) + 0.07 * Math.sin(5 * a + p1));
      if (Math.hypot(dx, dy) > edge) continue;
      g.fillStyle = C.rock[dither(0.55 - (dx + dy) / (3 * r), x, y, 3)];
      g.fillRect(x, y, 1, 1);
      if (Math.hypot(dx, dy) < edge - 1.5) inside.push([x, y]);
    }
    for (const kind of ore) {
      const [x, y] = inside[(Math.random() * inside.length) | 0] || [m, m];
      g.drawImage(ORE[kind], x - 1, y - 1);
    }
    return c;
  }

  // Planet: dithered sphere lit from the top left, optional gas-giant bands.
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
  let lvl = 1, xp = 0, held = 0, charge = 0, toastTimer = 0;
  const ship = { x: 0, y: 0, vx: 0, vy: 0, alive: true };
  const keys = new Set();
  let target = null, pointerFire = false, buttonFire = false, best = 0;
  const drag = { x: 0, y: 0 };
  const L = () => CONFIG.levels[lvl - 1];
  const shipImg = () => SHIPS[L().tier];
  const fireBtn = $(".fire"), toastEl = $("[data-toast]"), levelEl = $("[data-level]");
  const coarse = matchMedia("(pointer: coarse)").matches;
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
      // Bigger, tougher, richer asteroids get more common as you go.
      const sizes = CONFIG.asteroids, w = sizes.map((a) => a.w[0] + (a.w[1] - a.w[0]) * k);
      let pick = rnd(0, w.reduce((s, v) => s + v, 0)), i = 0;
      while ((pick -= w[i]) > 0 && i < sizes.length - 1) i++;
      const a = sizes[i], hp = Math.round(rnd(a.hits[0], a.hits[1]));
      const ore = a.ore.filter(() => Math.random() < 0.8);
      things.push({ kind: "rock", x: rnd(a.r + 2, W - a.r - 2), y: -a.r - 2, r: a.r * 0.85, size: a.r, vx: rnd(-12, 12) / (1 + i), drift: a.drift, hp, max: hp, hit: 0, ore, img: asteroid(a.r, ore) });
    }
  }

  // Ore flies out of a broken asteroid, then drifts towards the ship once it's close.
  function dropOre(t) {
    for (const kind of t.ore) {
      const a = rnd(0, 6.28), s = rnd(20, 45);
      things.push({ kind: "ore", ore: kind, x: t.x, y: t.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2, drift: 0.5 });
    }
  }

  function damage(t, n, sx, sy) {
    t.hp -= n;
    t.hit = 0.05;
    if (t.kind === "planet") {
      burst(sx, sy, 2, [C.lasers[L().dmg - 1], t.ramp[2]], 30);
      if (t.hp > 0) return;
      t.gone = true;
      bonus += CONFIG.points.planet;
      burst(t.x, t.y, 40 + t.r * 4, [...t.ramp, C.flame[0], C.ship.w], 30 + t.r * 3);
      beep(200, 20, 0.8, "sawtooth", 0.06);
      return;
    }
    if (t.hp > 0) { burst(sx, sy, 2, C.rock, 25); beep(900, 500, 0.03, "square", 0.01); return; }
    t.gone = true;
    bonus += CONFIG.points.rock * t.max;
    burst(t.x, t.y, 8 + t.size * 3, C.rock, 30 + t.size * 4);
    dropOre(t);
    beep(400 - t.size * 25, 60, 0.12 + t.size * 0.03, "square", 0.03);
  }

  function gainXp(n) {
    xp += n;
    while (lvl < CONFIG.levels.length && xp >= CONFIG.levels[lvl].xp) {
      lvl++;
      levelEl.textContent = lvl;
      toast("LEVEL " + lvl + " · " + L().perk);
      burst(ship.x, ship.y, 24, [C.crystal.c, C.mineral.a, C.ship.w], 50);
      beep(440, 1760, 0.35, "square", 0.05);
    }
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastTimer = 1.8;
  }

  // Power shot: a fat bolt that pierces asteroids and hits planets hard.
  function powerShot() {
    shots.push({ x: Math.round(ship.x), y: ship.y - 5, vx: 0, dmg: CONFIG.powerDamage * L().dmg, power: true, hits: new Set() });
    burst(ship.x, ship.y - 5, 12, [C.ship.w, C.lasers[0], C.crystal.c], 40);
    beep(120, 1200, 0.3, "sawtooth", 0.06);
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
      lvl = 1; xp = 0; held = 0; charge = 0; levelEl.textContent = 1;
      speed = CONFIG.speedStart; nextSpawn = 60;
      Object.assign(ship, { x: W / 2, y: H * 0.8, vx: 0, vy: 0, alive: true });
      beep(220, 880, 0.25);
    }
    state = "play";
    hud.hidden = false;
    fireBtn.hidden = !coarse;
    setScreen();
    startBtn.blur();
    loop();
  }

  function pause() {
    if (state !== "play") return;
    state = "pause";
    keys.clear(); pointerFire = buttonFire = false; held = charge = 0;
    fireBtn.hidden = true;
    setScreen("PAUSED", "Take a breath. Space is patient.", "Resume");
    startBtn.focus();
  }

  function crash() {
    ship.alive = false;
    state = "over";
    fireBtn.hidden = true; pointerFire = buttonFire = false; held = charge = 0;
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

    // Steering: keyboard thrust, follow the mouse, or drag with a finger.
    const lv = L(), max = CONFIG.shipMax * lv.speed, accel = CONFIG.shipAccel * lv.speed;
    const kx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
    const ky = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
    if (target) {
      const m = max * 1.5, k = Math.min(1, 10 * dt);
      const dx = Math.max(-m, Math.min(m, (target.x - ship.x) * 8));
      const dy = Math.max(-m, Math.min(m, (target.y - ship.y) * 8));
      ship.vx += (dx - ship.vx) * k;
      ship.vy += (dy - ship.vy) * k;
    } else {
      ship.vx += kx * accel * dt - ship.vx * CONFIG.shipDrag * dt;
      ship.vy += ky * accel * dt - ship.vy * CONFIG.shipDrag * dt;
      const v = Math.hypot(ship.vx, ship.vy);
      if (v > max) { ship.vx *= max / v; ship.vy *= max / v; }
    }
    ship.x += drag.x * CONFIG.dragGain * lv.speed;
    ship.y += drag.y * CONFIG.dragGain * lv.speed;
    drag.x = drag.y = 0;

    // Lasers from every gun; holding fire also charges a power shot, released when full.
    const firing = keys.has("fire") || pointerFire || buttonFire;
    reload -= dt;
    if (firing) {
      held += dt;
      charge = Math.min(1, held / (lv.charge || CONFIG.chargeTime));
      if (reload <= 0) {
        reload = 1 / lv.rate;
        for (const [gx, gv] of lv.guns) shots.push({ x: Math.round(ship.x) + gx, y: ship.y - 1, vx: gv, dmg: lv.dmg });
        beep(1400, 700, 0.04, "square", 0.012);
      }
    } else {
      if (charge >= 1) powerShot();
      held = charge = 0;
    }
    fireBtn.classList.toggle("is-full", charge >= 1);
    fireBtn.style.setProperty("--charge", charge.toFixed(2));

    for (const s of shots) {
      s.y -= CONFIG.laserSpeed * dt;
      s.x += s.vx * dt;
      const reach = s.power ? 4 : 2;
      for (const t of things) {
        if (t.gone || t.kind === "dust" || t.kind === "ore") continue;
        const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy);
        if (t.kind === "rock" && d < t.r + reach) {
          if (s.power) { if (!s.hits.has(t)) { s.hits.add(t); damage(t, s.dmg, s.x, s.y); } continue; }
          s.gone = true;
          damage(t, s.dmg, s.x, s.y);
        } else if (t.kind === "planet" && d < t.r) {
          s.gone = true;
          damage(t, s.dmg, s.x, s.y);
        } else if (t.kind === "hole" && d < t.r + 3) {
          s.gone = true;
        }
        if (s.gone) break;
      }
    }
    shots = shots.filter((s) => !s.gone && s.y > -8 && s.x > -4 && s.x < W + 4);

    const shipR = SHIP_R[lv.tier];
    for (const t of things) {
      if (t.gone) continue;
      t.y += speed * (t.drift || (t.kind === "planet" ? CONFIG.planetDrift : 1)) * dt;
      if (t.kind === "rock") { t.x += t.vx * dt; if (t.x < 2 || t.x > W - 2) t.vx = -t.vx; }
      if (t.hit > 0) t.hit -= dt;
      const dx = t.x - ship.x, dy = t.y - ship.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      if (t.kind === "hole" && d < CONFIG.gravityRange) {
        const f = CONFIG.gravity / Math.max(d2, 16);
        ship.vx += (dx / d) * f * dt;
        ship.vy += (dy / d) * f * dt;
      }
      if (t.kind === "ore") {
        if (d < CONFIG.magnet) { t.vx = (-dx / d) * 120; t.vy = (-dy / d) * 120 - speed * t.drift; }
        else { t.vx *= 1 - 3 * dt; t.vy *= 1 - 3 * dt; }
        t.x += t.vx * dt; t.y += t.vy * dt;
        if (d < shipR + 3) { t.gone = true; gainXp(CONFIG.ore[t.ore]); beep(t.ore === "crystal" ? 1320 : 990, 1980, 0.06, "triangle", 0.04); }
      } else if (t.kind === "dust") {
        if (d < t.r + 2) { t.gone = true; bonus += CONFIG.points.dust; beep(880, 1760, 0.08); }
      } else if (d < t.r + shipR) {
        crash();
        return;
      }
    }
    things = things.filter((t) => !t.gone && t.y < H + 40);

    const half = shipImg().width >> 1;
    ship.x = Math.max(half, Math.min(W - half, ship.x + ship.vx * dt));
    ship.y = Math.max(H * 0.35, Math.min(H - (shipImg().height >> 1) - 1, ship.y + ship.vy * dt));

    if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.hidden = true;

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
      else if (t.kind === "rock") drawRock(t, x, y);
      else if (t.kind === "ore") ctx.drawImage(ORE[t.ore], x - 1, y - 1);
      else if (t.kind === "dust") { if ((clock * 6 + t.y) % 4 > 0.6) ctx.drawImage(DUST, x - 1, y - 1); }
      else drawHole(t, x, y);
    }

    for (const s of shots) {
      const x = Math.round(s.x), y = Math.round(s.y);
      if (s.power) {
        ctx.fillStyle = (clock * 30 | 0) & 1 ? C.lasers[0] : C.crystal.c;
        ctx.fillRect(x - 2, y - 6, 5, 9);
        ctx.fillStyle = C.ship.w;
        ctx.fillRect(x - 1, y - 7, 3, 10);
      } else {
        ctx.fillStyle = C.lasers[s.dmg - 1];
        ctx.fillRect(x, y - 3, s.dmg > 2 ? 2 : 1, 3);
      }
    }

    if (ship.alive) {
      const img = shipImg(), x = Math.round(ship.x) - (img.width >> 1), y = Math.round(ship.y) - (img.height >> 1);
      ctx.drawImage(img, x, y);
      if (state === "play" || state === "title") {
        const n = 1 + ((clock * 20) % 3 | 0) + L().tier;
        ctx.fillStyle = C.flame[(clock * 15 | 0) % 3];
        ctx.fillRect(x + (img.width >> 1), y + img.height - 1, 1, n);
      }
      // Charge ring: fills clockwise while fire is held, blinks when the power shot is ready.
      if (charge > 0.08 && (charge < 1 || (clock * 12 | 0) & 1)) {
        const rr = (img.width >> 1) + 3, n = Math.floor(charge * 16);
        ctx.fillStyle = charge < 1 ? C.crystal.p : C.crystal.c;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / 16) * 6.283;
          ctx.fillRect(Math.round(ship.x + Math.cos(a) * rr), Math.round(ship.y + Math.sin(a) * rr), 1, 1);
        }
      }
    }
    for (const b of bits) { ctx.fillStyle = b.c; ctx.fillRect(b.x | 0, b.y | 0, 1, 1); }

    // XP bar along the top edge: progress to the next level.
    if (state === "play" || state === "pause") {
      const next = CONFIG.levels[lvl];
      const k = next ? (xp - L().xp) / (next.xp - L().xp) : 1;
      ctx.fillStyle = C.horizon;
      ctx.fillRect(0, 0, W, 1);
      ctx.fillStyle = C.xp;
      ctx.fillRect(0, 0, Math.round(W * k), 1);
    }
  }

  function drawBar(x, y, r, hp, max) {
    const w = Math.max(4, Math.round(r * 2)), by = y - Math.ceil(r) - 3, x0 = x - (w >> 1);
    ctx.fillStyle = C.horizon;
    ctx.fillRect(x0, by, w, 1);
    ctx.fillStyle = C.hp;
    ctx.fillRect(x0, by, Math.max(0, Math.ceil((w * hp) / max)), 1);
  }

  // Asteroid: shakes when hit; tough ones show a health bar once damaged.
  function drawRock(t, x, y) {
    const j = t.hit > 0 ? (clock * 60 & 1 ? 1 : -1) : 0;
    ctx.drawImage(t.img, x - (t.img.width >> 1) + j, y - (t.img.height >> 1));
    if (t.hp < t.max) drawBar(x, y, t.size, t.hp, t.max);
  }

  // Planet: shakes a pixel when hit; a health bar appears once it's damaged.
  function drawPlanet(t, x, y) {
    const j = t.hit > 0 ? (clock * 60 & 1 ? 1 : -1) : 0;
    ctx.drawImage(t.img, x - t.r + j, y - t.r);
    if (t.hp < CONFIG.planetHits) drawBar(x, y, t.r, t.hp, CONFIG.planetHits);
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
  addEventListener("blur", () => { keys.clear(); pointerFire = buttonFire = false; });

  // Mouse: the ship follows the cursor, hold the button to fire (hold longer for a power shot).
  // Touch: one finger drags the ship from anywhere (relative, so it never hides under the thumb);
  // a second finger holds the FIRE button. Long-press or press hard on it for a power shot.
  let steerId = null, steerX = 0, steerY = 0;
  const toWorld = (e) => ({ x: e.clientX / scale, y: e.clientY / scale });
  cvs.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") { target = toWorld(e); pointerFire = true; return; }
    if (steerId !== null) return;
    steerId = e.pointerId; steerX = e.clientX; steerY = e.clientY; target = null;
  }, { passive: true });
  cvs.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") { target = toWorld(e); return; }
    if (e.pointerId !== steerId) return;
    drag.x += (e.clientX - steerX) / scale; drag.y += (e.clientY - steerY) / scale;
    steerX = e.clientX; steerY = e.clientY;
  }, { passive: true });
  const release = (e) => { if (e.pointerType === "mouse") pointerFire = false; else if (e.pointerId === steerId) steerId = null; };
  cvs.addEventListener("pointerup", release, { passive: true });
  cvs.addEventListener("pointercancel", release, { passive: true });

  // Force touch: only counts if the pressure rises after the press, since some screens report a flat 1.
  let pressStart = 0;
  const force = (e) => { if (e.pressure >= CONFIG.forcePressure && e.pressure > pressStart + 0.2) held = Math.max(held, L().charge || CONFIG.chargeTime); };
  fireBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fireBtn.setPointerCapture(e.pointerId);
    buttonFire = true; pressStart = e.pressure;
  });
  fireBtn.addEventListener("pointermove", force, { passive: true });
  const fireUp = () => { buttonFire = false; };
  fireBtn.addEventListener("pointerup", fireUp);
  fireBtn.addEventListener("pointercancel", fireUp);
  fireBtn.addEventListener("lostpointercapture", fireUp);
  fireBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  startBtn.addEventListener("click", start);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); else loop(); });

  let resizeTimer = 0;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); });

  if (coarse) $("[data-keys]").textContent = "Drag anywhere to steer · hold FIRE with your other thumb · long-press or press hard for a power shot";
  bestEl.textContent = best;
  setScreen("PIXEL VOYAGER", msg.textContent, "Launch");
  resize();
  loop();
})();
