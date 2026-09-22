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
    colorCursorLine: "244, 245, 247" // --color-text, brighter than regular links
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isFinePointer = window.matchMedia("(pointer: fine)").matches;

  var width = 0;
  var height = 0;
  var dpr = 1;
  var nodes = [];
  var grid = {};
  var cellSize = CONFIG.linkDistance;

  var pointer = { x: 0, y: 0, active: false };
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

  function initNodes(w, h) {
    var count = nodeCountForArea(w * h);
    nodes = [];
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * CONFIG.driftSpeed,
        vy: Math.sin(angle) * CONFIG.driftSpeed
      });
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

  function step(dt) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx * dt;
      n.y += n.vy * dt;

      if (n.x < 0) { n.x = 0; n.vx = -n.vx; }
      else if (n.x > width) { n.x = width; n.vx = -n.vx; }
      if (n.y < 0) { n.y = 0; n.vy = -n.vy; }
      else if (n.y > height) { n.y = height; n.vy = -n.vy; }

      if (pointer.active) {
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
      ctx.arc(a.x, a.y, CONFIG.nodeRadius, 0, Math.PI * 2);
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

  updateRunState();
})();
