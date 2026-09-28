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
    colorRing: "126, 231, 135" // --color-syntax-green as rgb
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isFinePointer = window.matchMedia("(pointer: fine)").matches;

  var width = 0;
  var height = 0;
  var dpr = 1;
  var nodes = [];
  var grid = {};
  var cellSize = CONFIG.linkDistance;

  var pointer = { x: 0, y: 0, active: false, down: false, released: false, charge: 0 };
  var fun = false;
  var rings = [];
  var toggle = document.querySelector(".fun-toggle");
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

  function makeNode(x, y) {
    var angle = Math.random() * Math.PI * 2;
    return {
      x: x,
      y: y,
      vx: Math.cos(angle) * CONFIG.driftSpeed,
      vy: Math.sin(angle) * CONFIG.driftSpeed,
      bvx: Math.cos(angle) * CONFIG.driftSpeed,
      bvy: Math.sin(angle) * CONFIG.driftSpeed,
      pop: 0
    };
  }

  function initNodes(w, h) {
    var count = nodeCountForArea(w * h);
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push(makeNode(Math.random() * w, Math.random() * h));
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
      var added = makeNode(pointer.x, pointer.y);
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
      var dx = pointer.x - n.x;
      var dy = pointer.y - n.y;
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
    if (fun) funForces(dt);

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx * dt;
      n.y += n.vy * dt;

      if (n.x < 0) { n.x = 0; n.vx = -n.vx; }
      else if (n.x > width) { n.x = width; n.vx = -n.vx; }
      if (n.y < 0) { n.y = 0; n.vy = -n.vy; }
      else if (n.y > height) { n.y = height; n.vy = -n.vy; }

      if (pointer.active && !fun) {
        var dx = n.x - pointer.x;
        var dy = n.y - pointer.y;
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
    buildGrid();

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
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < CONFIG.linkDistance) {
              var opacity = (1 - dist / CONFIG.linkDistance) * 0.5;
              ctx.strokeStyle = "rgba(" + CONFIG.colorLine + ", " + opacity + ")";
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      if (pointer.active) {
        var pdx = a.x - pointer.x;
        var pdy = a.y - pointer.y;
        var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < CONFIG.cursorRadius) {
          var pOpacity = (1 - pdist / CONFIG.cursorRadius) * 0.8;
          ctx.strokeStyle = "rgba(" + CONFIG.colorCursorLine + ", " + pOpacity + ")";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = "rgba(" + CONFIG.colorNode + ", 0.9)";
      ctx.beginPath();
      ctx.arc(a.x, a.y, CONFIG.nodeRadius * (1 + 3 * a.pop), 0, Math.PI * 2);
      ctx.fill();
    }
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

  window.addEventListener("resize", onResize);
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
    },
    { passive: true }
  );
  window.addEventListener("pointerup", function () {
    if (pointer.down) pointer.released = true;
    pointer.down = false;
  });
  window.addEventListener("pointercancel", function () {
    pointer.down = false;
    pointer.charge = 0;
  });

  function setFun(on) {
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
      setFun(!fun);
    });
  } else {
    fun = false;
  }

  updateRunState();
})();
