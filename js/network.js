(function () {
  var canvas = document.querySelector(".hero__canvas");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var parent = canvas.parentElement;

  // Tune the feel here without reading the logic below.
  var CONFIG = {
    nodeCountMin: 50,
    nodeCountMax: 110,
    areaMin: 200000,   // px^2, node count floors around/below this
    areaMax: 1300000,  // px^2, node count caps around/above this
    maxDPR: 2,
    driftSpeed: 12,       // px/sec
    linkDistance: 130,    // px, max distance to draw a node-node line
    cursorRadius: 150,    // px, influence radius around the pointer
    cursorForce: 0.5,     // px nudge per frame at closest approach
    nodeRadius: 1.6,
    colorNode: "94, 177, 255",       // --color-accent as rgb
    colorLine: "94, 177, 255",
    colorCursorLine: "244, 245, 247", // --color-text, brighter than regular links

    // Fun mode: hover attracts, press-and-hold gathers nodes, release bursts them out.
    funRadius: 300,       // px, reach of the pull and the burst
    funAttract: 80,       // px/sec^2, gentle pull toward the hovering cursor
    funHoldPull: 1400,    // px/sec^2, strong pull while the pointer is held down
    funBurst: 700,        // px/sec, outward kick on release after a full charge
    funChargeTime: 1,     // sec of holding for a full-strength burst
    funRecovery: 1.2,     // per sec, how fast nodes settle back to drift speed
    funTapTime: 0.2,      // sec, a press shorter than this adds a node instead of bursting
    maxNodes: 120,        // hard cap; adding past it recycles the oldest node
    calmFadeIn: 900,      // ms, fresh calm network fading in after fun is switched off
    colorRing: "126, 231, 135", // --color-syntax-green as rgb

    // Foreground depth layer: soft, larger particles in front of the network.
    // Each gets a depth z (0..1); nearer ones are bigger, brighter, faster and shift more with the cursor.
    fgCountMin: 10,
    fgCountMax: 24,
    fgRadiusMin: 1.5,     // px, farthest particle
    fgRadiusMax: 6,       // px, nearest particle
    fgAlphaMin: 0.1,
    fgAlphaMax: 0.32,
    fgSpeed: 7,           // px/sec drift at z = 1
    colorParticle: "120, 190, 255",

    // Camera: every node and particle sits at a depth. Moving the camera shifts each one by
    // its depth's amount (px at full cursor offset), so near and far slide apart like a real POV move.
    // Positive follows the cursor, negative goes against it; the gradient between them is the depth.
    camShiftNetNear: 45,  // px, nearest network nodes
    camShiftNetFar: -35,  // px, farthest network nodes
    camShiftFgMin: 70,    // px, farthest foreground particle
    camShiftFgMax: 170,   // px, nearest foreground particle
    camEase: 2.5,         // per sec, how smoothly the camera follows the cursor
    camSway: 0.22,        // 0..1, slow automatic camera drift (also on touch); 0 turns it off
    camSwayPeriod: 26,    // sec per sway cycle
    linkDepth: 140,       // px, depth gap counted into link distance, so links stay within nearby depths
    farDim: 0.4,          // brightness of the farthest nodes and links, relative to the nearest
    farSize: 0.55,        // size of the farthest nodes, relative to the nearest
    farSpeed: 0.5         // drift speed of the farthest nodes, relative to the nearest
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isFinePointer = window.matchMedia("(pointer: fine)").matches;

  var width = 0;
  var height = 0;
  var dpr = 1;
  var nodes = [];
  var particles = [];
  var cam = { x: 0, y: 0, t: 0 }; // eased camera offset, -1..1 on each axis
  var sprite = null;
  var grid = {};
  var cellSize = CONFIG.linkDistance;

  var pointer = { x: 0, y: 0, active: false, down: false, released: false, charge: 0 };
  var fun = false;
  var rings = [];
  var toggle = document.querySelector(".fun-toggle");
  var fadeInFrom = 0;
  var lastTime = 0;
  var rafId = null;
  var heroVisible = true;
  var tabVisible = !document.hidden;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function nodeCountForArea(area) {
    var t = clamp((area - CONFIG.areaMin) / (CONFIG.areaMax - CONFIG.areaMin), 0, 1);
    return Math.round(lerp(CONFIG.nodeCountMin, CONFIG.nodeCountMax, t));
  }

  // t: depth, 0 nearest .. 1 farthest. x/y are the rest position; the camera shift is added on draw.
  function makeNode(x, y, t) {
    if (t === undefined) t = Math.random();
    var angle = Math.random() * Math.PI * 2;
    var speed = CONFIG.driftSpeed * lerp(1, CONFIG.farSpeed, t);
    var shift = lerp(CONFIG.camShiftNetNear, CONFIG.camShiftNetFar, t);
    return {
      x: x,
      y: y,
      t: t,
      shift: shift,
      margin: Math.abs(shift) + 10, // roams this far past the edges so a camera move never shows a bare strip
      px: x,
      py: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      bvx: Math.cos(angle) * speed,
      bvy: Math.sin(angle) * speed,
      pop: 0
    };
  }

  function initNodes(w, h) {
    var count = nodeCountForArea(w * h);
    nodes = [];
    for (var i = 0; i < count; i++) {
      var t = Math.random();
      var m = Math.abs(lerp(CONFIG.camShiftNetNear, CONFIG.camShiftNetFar, t)) + 10;
      nodes.push(makeNode(lerp(-m, w + m, Math.random()), lerp(-m, h + m, Math.random()), t));
    }
  }

  function initParticles(w, h) {
    var t = clamp((w * h - CONFIG.areaMin) / (CONFIG.areaMax - CONFIG.areaMin), 0, 1);
    var count = Math.round(lerp(CONFIG.fgCountMin, CONFIG.fgCountMax, t));
    particles = [];
    for (var i = 0; i < count; i++) {
      var z = Math.random();
      var angle = Math.random() * Math.PI * 2;
      var speed = CONFIG.fgSpeed * (0.4 + 0.6 * z);
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        z: z,
        shift: lerp(CONFIG.camShiftFgMin, CONFIG.camShiftFgMax, z),
        r: lerp(CONFIG.fgRadiusMin, CONFIG.fgRadiusMax, z),
        a: lerp(CONFIG.fgAlphaMin, CONFIG.fgAlphaMax, z)
      });
    }
  }

  // One pre-rendered soft blob, drawn scaled per particle: cheaper than a gradient per frame
  function makeSprite() {
    var size = 64;
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(" + CONFIG.colorParticle + ", 1)");
    grad.addColorStop(0.35, "rgba(" + CONFIG.colorParticle + ", 0.55)");
    grad.addColorStop(1, "rgba(" + CONFIG.colorParticle + ", 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  // Camera target = cursor offset from centre (-1..1) plus a slow sway, eased
  function stepCamera(dt) {
    cam.t += dt;
    var w = cam.t * Math.PI * 2 / CONFIG.camSwayPeriod;
    var tx = Math.sin(w) * CONFIG.camSway;
    var ty = Math.sin(w * 0.7 + 1) * CONFIG.camSway * 0.6;
    if (pointer.active) {
      tx += clamp((pointer.x - width / 2) / (width / 2), -1, 1);
      ty += clamp((pointer.y - height / 2) / (height / 2), -1, 1);
    }
    var e = Math.min(CONFIG.camEase * dt, 1);
    cam.x += (tx - cam.x) * e;
    cam.y += (ty - cam.y) * e;
  }

  function stepParticles(dt) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Wrap with a margin so particles slide in and out of frame instead of popping
      var m = p.r * 3 + 40;
      if (p.x < -m) p.x += width + 2 * m;
      else if (p.x > width + m) p.x -= width + 2 * m;
      if (p.y < -m) p.y += height + 2 * m;
      else if (p.y > height + m) p.y -= height + 2 * m;
    }
  }

  function drawParticles(fade) {
    if (!sprite) sprite = makeSprite();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var d = p.r * 3; // sprite fades to nothing at its edge, so draw it wider than the core
      var x = p.x + cam.x * p.shift;
      var y = p.y + cam.y * p.shift;
      ctx.globalAlpha = p.a * fade;
      ctx.drawImage(sprite, x - d, y - d, d * 2, d * 2);
    }
  }

  function resize() {
    var rect = parent.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;

    if (w === width && h === height) return;

    width = w;
    height = h;
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    initNodes(w, h);
    initParticles(w, h);
  }

  function cellKey(cx, cy) {
    return cx + "_" + cy;
  }

  function buildGrid() {
    grid = {};
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var cx = Math.floor(n.x / cellSize);
      var cy = Math.floor(n.y / cellSize);
      var key = cellKey(cx, cy);
      if (!grid[key]) grid[key] = [];
      grid[key].push(i);
    }
  }

  function funForces(dt) {
    if (pointer.down) pointer.charge = Math.min(pointer.charge + dt, CONFIG.funChargeTime);

    var burst = 0;
    if (pointer.released && pointer.charge < CONFIG.funTapTime) {
      var added = makeNode(0, 0);
      added.x = pointer.x - cam.x * added.shift;
      added.y = pointer.y - cam.y * added.shift;
      added.pop = 1;
      if (nodes.length >= CONFIG.maxNodes) nodes.shift();
      nodes.push(added);
      pointer.released = false;
      pointer.charge = 0;
    } else if (pointer.released) {
      burst = CONFIG.funBurst * pointer.charge / CONFIG.funChargeTime;
      rings.push({ x: pointer.x, y: pointer.y, r: 0, a: 1 });
      pointer.released = false;
      pointer.charge = 0;
    }

    var pull = pointer.down ? CONFIG.funHoldPull : pointer.active ? CONFIG.funAttract : 0;
    var settle = Math.min(CONFIG.funRecovery * dt, 1);

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.pop > 0) n.pop = Math.max(n.pop - 2.5 * dt, 0);
      n.vx += (n.bvx - n.vx) * settle;
      n.vy += (n.bvy - n.vy) * settle;

      if (!pull && !burst) continue;
      var dx = pointer.x - (n.x + cam.x * n.shift);
      var dy = pointer.y - (n.y + cam.y * n.shift);
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1 || dist > CONFIG.funRadius) continue;

      var f = 1 - dist / CONFIG.funRadius;
      var k = pull * f * dt - burst * f;
      n.vx += (dx / dist) * k;
      n.vy += (dy / dist) * k;
    }

    for (var r = rings.length - 1; r >= 0; r--) {
      rings[r].r += 500 * dt;
      rings[r].a -= 1.6 * dt;
      if (rings[r].a <= 0) rings.splice(r, 1);
    }
  }

  function step(dt) {
    stepCamera(dt);
    stepParticles(dt);
    if (fun) funForces(dt);

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx * dt;
      n.y += n.vy * dt;

      var m = n.margin;
      if (n.x < -m) { n.x = -m; n.vx = -n.vx; }
      else if (n.x > width + m) { n.x = width + m; n.vx = -n.vx; }
      if (n.y < -m) { n.y = -m; n.vy = -n.vy; }
      else if (n.y > height + m) { n.y = height + m; n.vy = -n.vy; }

      if (pointer.active && !fun) {
        var dx = n.x + cam.x * n.shift - pointer.x;
        var dy = n.y + cam.y * n.shift - pointer.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < CONFIG.cursorRadius) {
          var force = (1 - dist / CONFIG.cursorRadius) * CONFIG.cursorForce;
          n.x += (dx / dist) * force;
          n.y += (dy / dist) * force;
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    var fade = 1;
    if (fadeInFrom) {
      fade = Math.min((performance.now() - fadeInFrom) / CONFIG.calmFadeIn, 1);
      ctx.globalAlpha = fade;
      if (fade === 1) fadeInFrom = 0;
    }
    buildGrid();
    for (var q = 0; q < nodes.length; q++) {
      nodes[q].px = nodes[q].x + cam.x * nodes[q].shift;
      nodes[q].py = nodes[q].y + cam.y * nodes[q].shift;
    }

    ctx.lineWidth = 1;

    for (var r = 0; r < rings.length; r++) {
      ctx.strokeStyle = "rgba(" + CONFIG.colorRing + ", " + rings[r].a * 0.6 + ")";
      ctx.beginPath();
      ctx.arc(rings[r].x, rings[r].y, rings[r].r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      var cx = Math.floor(a.x / cellSize);
      var cy = Math.floor(a.y / cellSize);

      for (var gx = cx - 1; gx <= cx + 1; gx++) {
        for (var gy = cy - 1; gy <= cy + 1; gy++) {
          var bucket = grid[cellKey(gx, gy)];
          if (!bucket) continue;

          for (var k = 0; k < bucket.length; k++) {
            var j = bucket[k];
            if (j <= i) continue;

            var b = nodes[j];
            var dx = a.x - b.x;
            var dy = a.y - b.y;
            var dz = (a.t - b.t) * CONFIG.linkDepth;
            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < CONFIG.linkDistance) {
              var opacity = (1 - dist / CONFIG.linkDistance) * 0.5 * lerp(1, CONFIG.farDim, (a.t + b.t) / 2);
              ctx.strokeStyle = "rgba(" + CONFIG.colorLine + ", " + opacity + ")";
              ctx.beginPath();
              ctx.moveTo(a.px, a.py);
              ctx.lineTo(b.px, b.py);
              ctx.stroke();
            }
          }
        }
      }

      if (pointer.active) {
        var pdx = a.px - pointer.x;
        var pdy = a.py - pointer.y;
        var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < CONFIG.cursorRadius) {
          var pOpacity = (1 - pdist / CONFIG.cursorRadius) * 0.8 * lerp(1, CONFIG.farDim, a.t);
          ctx.strokeStyle = "rgba(" + CONFIG.colorCursorLine + ", " + pOpacity + ")";
          ctx.beginPath();
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = "rgba(" + CONFIG.colorNode + ", " + 0.95 * lerp(1, CONFIG.farDim, a.t) + ")";
      ctx.beginPath();
      ctx.arc(a.px, a.py, CONFIG.nodeRadius * lerp(1.3, CONFIG.farSize, a.t) * (1 + 3 * a.pop), 0, Math.PI * 2);
      ctx.fill();
    }

    drawParticles(fade);
    ctx.globalAlpha = 1;
  }

  function frame(time) {
    var dt = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;

    step(dt);
    draw();

    rafId = requestAnimationFrame(frame);
  }

  function isRunning() {
    return rafId !== null;
  }

  function start() {
    if (isRunning() || reduceMotion) return;
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function updateRunState() {
    if (heroVisible && tabVisible) start();
    else stop();
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (reduceMotion) draw();
    }, 150);
  }

  // Watch the hero itself, not just the window: its height also changes when the
  // fun toggle is revealed below, and a stale size stretches the canvas.
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(parent);
  else window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", function () {
    tabVisible = !document.hidden;
    updateRunState();
  });

  if (isFinePointer) {
    parent.addEventListener(
      "pointermove",
      function (e) {
        var rect = parent.getBoundingClientRect();
        pointer.x = e.clientX - rect.left;
        pointer.y = e.clientY - rect.top;
        pointer.active = true;
      },
      { passive: true }
    );
    parent.addEventListener("pointerleave", function () {
      pointer.active = false;
    });
  }

  // Press-and-hold works for every pointer type; on touch it only fires in fun mode.
  parent.addEventListener(
    "pointerdown",
    function (e) {
      if (!fun || e.button > 0 || e.target.closest("a, button")) return;
      var rect = parent.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.down = true;
      parent.classList.add("is-playing");
    },
    { passive: true }
  );
  window.addEventListener("pointerup", function () {
    if (pointer.down) pointer.released = true;
    pointer.down = false;
    parent.classList.remove("is-playing");
  });
  window.addEventListener("pointercancel", function () {
    pointer.down = false;
    pointer.charge = 0;
    parent.classList.remove("is-playing");
  });

  function setFun(on, byUser) {
    // Switching fun off crumbles the current network; a fresh calm one fades in
    if (byUser && !on && window.pixelDissolve) {
      window.pixelDissolve.canvas(canvas);
      initNodes(width, height);
      fadeInFrom = performance.now();
    }

    fun = on;
    toggle.textContent = on ? "Turn off fun" : "Turn on fun";
    rings = [];
    pointer.down = pointer.released = false;
    pointer.charge = 0;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].vx = nodes[i].bvx;
      nodes[i].vy = nodes[i].bvy;
      nodes[i].pop = 0;
    }
    try { localStorage.setItem("fun", on ? "on" : "off"); } catch (e) {}
  }

  resize();

  if (reduceMotion) {
    draw();
    return;
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        heroVisible = entries[0].isIntersecting;
        updateRunState();
      },
      { threshold: 0 }
    );
    observer.observe(canvas.closest("#hero"));
  }

  if (toggle) {
    try { fun = localStorage.getItem("fun") !== "off"; } catch (e) {}
    setFun(fun);
    toggle.hidden = false;
    toggle.addEventListener("click", function () {
      setFun(!fun, true);
    });
  } else {
    fun = false;
  }

  updateRunState();
})();
