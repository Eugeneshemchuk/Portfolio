(function () {
  // Pixel dissolve: snapshot something onto an overlay canvas, then crumble it
  // into drifting pixels. Used by the terminal-dot easter egg, the fun toggle
  // (network.js), the "Let's talk" button and the copied-email bubble (nav.js).
  var CONFIG = {
    dotMessages: [
      "Did you really think I'm a real button?",
      "Yes, the other one was fake and this one is real.",
      "Do you have a job for Eugene or what are you doing here?"
    ],
    showFor: 1600,      // ms a speech bubble stays before dissolving
    dissolveFor: 1000,  // ms for a whole snapshot to crumble away
    pixel: 3,           // px, size of each particle
    margin: 48,         // px of room around a snapshot for particles to drift into
    fontSize: 13,
    maxDPR: 2
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var bubbleNow = null;
  var dotMessageIndex = 0; // shared across all three dots, always advances 1 -> 2 -> 3 -> 1

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Canvas sized w x h (CSS px) plus a drift margin, placed over a page rect
  function overlay(w, h, left, top) {
    var M = CONFIG.margin;
    var dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);
    var c = document.createElement("canvas");
    var o = { canvas: c, ctx: c.getContext("2d"), dpr: dpr, cw: w + M * 2, ch: h + M * 2 };
    c.width = Math.round(o.cw * dpr);
    c.height = Math.round(o.ch * dpr);
    c.style.width = o.cw + "px";
    c.style.height = o.ch + "px";
    c.style.left = left - M + "px";
    c.style.top = top - M + "px";
    c.className = "pixel-overlay";
    c.setAttribute("aria-hidden", "true");
    o.ctx.scale(dpr, dpr);
    o.ctx.translate(M, M);
    return o;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function crumble(o) {
    var c = o.canvas;
    if (reduceMotion) return c.remove();

    var data = o.ctx.getImageData(0, 0, c.width, c.height).data;
    var step = Math.max(1, Math.round(CONFIG.pixel * o.dpr));
    var half = CONFIG.dissolveFor / 2;
    var parts = [];

    for (var y = 0; y < c.height; y += step) {
      for (var x = 0; x < c.width; x += step) {
        var i = (y * c.width + x) * 4;
        if (data[i + 3] < 40) continue;
        parts.push({
          x: x / o.dpr - CONFIG.margin,
          y: y / o.dpr - CONFIG.margin,
          vx: (Math.random() - 0.3) * 40,
          vy: -(Math.random() * 50 + 10),
          delay: (x / c.width) * half + Math.random() * 150, // left to right, with jitter
          a: data[i + 3] / 255,
          color: "rgb(" + data[i] + "," + data[i + 1] + "," + data[i + 2] + ")"
        });
      }
    }

    var start = null;
    function frame(now) {
      if (!c.isConnected) return;
      if (start === null) start = now;
      var t = now - start;
      var alive = false;

      o.ctx.clearRect(-CONFIG.margin, -CONFIG.margin, o.cw, o.ch);
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        var local = Math.max(t - p.delay, 0);
        var progress = local / half;
        if (progress >= 1) continue;
        alive = true;
        o.ctx.globalAlpha = p.a * (1 - progress);
        o.ctx.fillStyle = p.color;
        o.ctx.fillRect(p.x + p.vx * local / 1000, p.y + p.vy * local / 1000, CONFIG.pixel, CONFIG.pixel);
      }
      o.ctx.globalAlpha = 1;

      if (alive) requestAnimationFrame(frame);
      else c.remove();
    }
    requestAnimationFrame(frame);
  }

  // Crumble whatever a canvas currently shows (e.g. the hero network)
  function dissolveCanvas(src) {
    var r = src.getBoundingClientRect();
    var o = overlay(r.width, r.height, r.left + window.scrollX, r.top + window.scrollY);
    o.ctx.drawImage(src, 0, 0, r.width, r.height);
    document.body.appendChild(o.canvas);
    crumble(o);
  }

  // Crumble a button-like element: redraw its box and label, then dissolve
  function dissolveElement(el) {
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var o = overlay(r.width, r.height, r.left + window.scrollX, r.top + window.scrollY);
    roundRect(o.ctx, 0, 0, r.width, r.height, parseFloat(cs.borderTopLeftRadius) || 0);
    o.ctx.fillStyle = cs.backgroundColor;
    o.ctx.fill();
    o.ctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    o.ctx.fillStyle = cs.color;
    o.ctx.textAlign = "center";
    o.ctx.textBaseline = "middle";
    o.ctx.fillText(el.textContent.trim(), r.width / 2, r.height / 2);
    document.body.appendChild(o.canvas);
    crumble(o);
  }

  // Speech bubble whose tail points at an element; pops in, then dissolves
  function bubble(anchor, text) {
    if (bubbleNow) bubbleNow.canvas.remove(), clearTimeout(bubbleNow.timer);

    var padX = 14, padY = 10, tail = 8, tailX = 18;
    var font = CONFIG.fontSize + "px " + token("--font-code");
    var measure = document.createElement("canvas").getContext("2d");
    measure.font = font;
    var w = Math.ceil(measure.measureText(text).width) + padX * 2;
    var h = CONFIG.fontSize + padY * 2;

    var r = anchor.getBoundingClientRect();
    var pointX = r.left + Math.min(r.width / 2, 24);
    var maxLeft = document.documentElement.clientWidth - w - 8;
    var left = Math.max(8, Math.min(pointX - tailX, maxLeft)) + window.scrollX;
    var top = r.top - 4 - tail - h + window.scrollY;
    var o = overlay(w, h + tail, left, top);
    var tx = pointX + window.scrollX - left;

    var ctx = o.ctx;
    ctx.beginPath();
    ctx.moveTo(9, 1);
    ctx.arcTo(w - 1, 1, w - 1, h - 1, 8);
    ctx.arcTo(w - 1, h - 1, 1, h - 1, 8);
    ctx.lineTo(tx + 6, h - 1);
    ctx.lineTo(tx, h + tail - 1);
    ctx.lineTo(tx - 6, h - 1);
    ctx.arcTo(1, h - 1, 1, 1, 8);
    ctx.arcTo(1, 1, w - 1, 1, 8);
    ctx.closePath();
    ctx.fillStyle = token("--color-surface");
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = token("--color-syntax-pink");
    ctx.stroke();
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = token("--color-text");
    ctx.fillText(text, padX, h / 2);

    o.canvas.classList.add("egg");
    o.canvas.style.setProperty("--egg-origin", CONFIG.margin + tx + "px " + (CONFIG.margin + h + tail) + "px");
    document.body.appendChild(o.canvas);
    o.timer = setTimeout(function () {
      crumble(o);
    }, CONFIG.showFor);
    bubbleNow = o;
  }

  window.pixelDissolve = { canvas: dissolveCanvas, element: dissolveElement, bubble: bubble };

  // Easter egg: the fake terminal buttons hop and talk back when clicked
  document.addEventListener("click", function (e) {
    var dot = e.target.closest ? e.target.closest(".terminal__dot") : null;
    if (!dot) return;
    if (!reduceMotion) {
      dot.classList.remove("is-hopping");
      void dot.offsetWidth; // restart the hop on repeat clicks
      dot.classList.add("is-hopping");
    }
    bubble(dot, CONFIG.dotMessages[dotMessageIndex]);
    dotMessageIndex = (dotMessageIndex + 1) % CONFIG.dotMessages.length;
  });

  document.addEventListener("animationend", function (e) {
    if (e.target.classList && e.target.classList.contains("is-hopping")) {
      e.target.classList.remove("is-hopping");
    }
  });
})();
