(function () {
  var canvas = document.querySelector(".hero__hash");
  if (!canvas) return;

  var parent = canvas.parentElement;
  var toggle = document.querySelector(".theme-toggle");

  // Tune the feel here without reading the logic below.
  var CONFIG = {
    chars: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    fontCssPx: 11,      // glyph size in CSS px
    lineHeight: 1.45,   // cell height = font * lineHeight
    cloudScale: 1.6,    // bigger = smaller cloud features
    windSpeed: 1.0,     // cloud drift speed
    smokeSpeed: 1.0,    // speed of the smoke wisps passing over
    hoverRadius: 0.09,  // spotlight size, fraction of hero height
    trailLife: 2.2,     // sec the hover afterglow takes to fade
    waveSpeed: 0.38,    // click-wave growth, hero heights per sec
    waveWidth: 0.11,    // thickness of the wave band, fraction of hero height
    waveLife: 3.2,      // sec before a wave is gone
    fadeIn: 1.5,        // sec, cloud fading in when the theme is shown
    maxDPR: 2
  };
  var MAX_TAPS = 8, MAX_TRAIL = 48;

  // Theme switch: hash cloud (default) <-> node network (network.js)
  var LABELS = { hash: "Switch to network", network: "Switch to hash cloud" };
  var net = window.heroNetwork;
  function setTheme(theme, byUser) {
    if (byUser && window.pixelDissolve) {
      if (theme === "hash" && net) window.pixelDissolve.canvas(document.querySelector(".hero__canvas"));
      else if (theme === "network" && gl) { render(); window.pixelDissolve.canvas(canvas); }
    }
    parent.setAttribute("data-hero-theme", theme);
    if (toggle) toggle.textContent = LABELS[theme];
    if (net) net.setActive(theme === "network");
    active = theme === "hash";
    if (active) shownAt = now();
    updateRunState();
  }

  var gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
  if (!gl) {
    // No WebGL2: stay on the network, nothing to switch to
    parent.setAttribute("data-hero-theme", "network");
    if (net) net.setActive(true);
    return;
  }

  // ---------- shaders ----------
  var VS = "#version 300 es\n" +
    "const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));\n" +
    "void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }";

  var FS = `#version 300 es
  precision highp float;
  uniform vec2  uRes, uCell, uAtlasGrid, uMouse;
  uniform float uTime, uSeed, uFade, uCloudScale, uWind, uSmokeSpeed, uCount;
  uniform float uHoverAmt, uHoverRadius, uTrailLife;
  uniform float uWaveSpeed, uWaveWidth, uWaveLife;
  uniform vec3  uInk, uHi, uGlow;
  uniform sampler2D uAtlas;
  uniform vec4  uTaps[${MAX_TAPS}];    // xy = click position (device px), z = start time
  uniform int   uTapCount;
  uniform vec4  uTrail[${MAX_TRAIL}];  // xy = cursor sample (device px), z = time
  uniform int   uTrailCount;
  out vec4 outColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21) + uSeed);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return s;
  }
  float fbm3(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return s / 0.875;
  }

  // signed distance to a heart, tip at origin, top near y = 1.1
  float dot2(vec2 v) { return dot(v, v); }
  float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
    return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
  }

  void main() {
    vec2 frag   = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    vec2 cell   = floor(frag / uCell);
    vec2 local  = fract(frag / uCell);
    vec2 center = (cell + 0.5) * uCell;
    vec2 uv     = center / uRes.y;
    float t     = uTime;

    // base cloud: drifting, domain-warped noise shapes the brightness
    vec2 q    = uv * uCloudScale;
    vec2 wind = vec2(0.035, -0.015) * t * uWind;
    vec2 w    = vec2(fbm(q + wind), fbm(q + vec2(5.2, 1.3) - wind * 0.7));
    float n   = fbm(q * 1.3 + w * 1.4 + wind * 1.5);
    vec2 c0   = uv - vec2(0.5 * uRes.x / uRes.y, 0.5);
    float vig = 1.0 - smoothstep(0.35, 1.0, length(c0 * vec2(0.75, 1.1)));
    float base = smoothstep(0.30, 0.78, n) * mix(0.35, 1.0, vig);

    // smoke: bigger, faster wisps that light up the glyphs they pass
    vec2 sq     = uv * 0.9 + vec2(0.06, 0.02) * t * uSmokeSpeed;
    float smoke = smoothstep(0.55, 0.85, fbm3(sq * 1.7 + vec2(fbm3(sq + 3.1), fbm3(sq + 7.7)) * 1.2));

    // hover: live spotlight plus fading afterglow along the cursor path
    float r2 = uHoverRadius * uHoverRadius;
    vec2 dm  = (center - uMouse) / uRes.y;
    float hover = uHoverAmt * exp(-dot(dm, dm) / r2);
    for (int i = 0; i < ${MAX_TRAIL}; i++) {
      if (i >= uTrailCount) break;
      vec4 s = uTrail[i];
      float age = t - s.z;
      if (age < 0.0 || age > uTrailLife) continue;
      vec2 d = (center - s.xy) / uRes.y;
      float life = 1.0 - age / uTrailLife;
      hover = max(hover, exp(-dot(d, d) / (r2 * (1.0 + age * 0.6))) * life * life * 0.85);
    }

    // click waves: thick heart-shaped band that rounds out as it grows
    float wave = 0.0, edge = 0.0;
    for (int i = 0; i < ${MAX_TAPS}; i++) {
      if (i >= uTapCount) break;
      vec4 tp = uTaps[i];
      float age = t - tp.z;
      if (age < 0.0 || age > uWaveLife) continue;
      float R = age * uWaveSpeed + 0.02;
      vec2 p  = (center - tp.xy) / uRes.y;
      p.y = -p.y;
      float dH = sdHeart(p / R + vec2(0.0, 0.55)) * R;
      float dC = length(p) - R * 0.62;
      float d  = mix(dH, dC, smoothstep(0.15, 0.7, R));
      float band  = smoothstep(-uWaveWidth, -uWaveWidth * 0.25, d) * (1.0 - smoothstep(-0.004, 0.006, d));
      float front = exp(-pow(d / (uWaveWidth * 0.18), 2.0));
      float fade  = 1.0 - smoothstep(uWaveLife * 0.45, uWaveLife, age);
      wave = max(wave, band * fade);
      edge = max(edge, front * fade);
    }

    float vis = clamp(base * 0.55 + smoke * 0.45 + hover + wave + edge * 0.5, 0.0, 1.0);

    // the glyph grid is fixed: each cell owns a character that changes only now and then
    float hc   = hash(cell);
    float rate = mix(0.05, 1.2, pow(hash(cell + 3.7), 4.0));
    float g    = floor(hash(cell + floor(t * rate + hc * 13.0) * 1.618) * uCount);
    vec2 ag    = vec2(mod(g, uAtlasGrid.x), floor(g / uAtlasGrid.x));
    float ink  = texture(uAtlas, (ag + local) / uAtlasGrid).a;

    vec3 col = mix(uInk, uHi, smoothstep(0.35, 1.0, vis));
    col = mix(col, uGlow, clamp(wave * 0.75 + edge, 0.0, 1.0));
    float alpha = ink * vis * uFade;
    outColor = vec4(col * alpha, alpha);
  }`;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());

  var U = {};
  ["uRes", "uCell", "uAtlasGrid", "uMouse", "uTime", "uSeed", "uFade", "uCloudScale", "uWind",
   "uSmokeSpeed", "uCount", "uHoverAmt", "uHoverRadius", "uTrailLife", "uWaveSpeed", "uWaveWidth",
   "uWaveLife", "uInk", "uHi", "uGlow", "uAtlas", "uTaps", "uTapCount", "uTrail", "uTrailCount"
  ].forEach(function (name) { U[name] = gl.getUniformLocation(prog, name); });

  // ---------- glyph atlas ----------
  var tex = gl.createTexture();
  var cellW = 0, cellH = 0, atlasCols = 16, atlasRows = 1, builtForDpr = 0;

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function buildAtlas(dpr) {
    var fontPx = Math.round(CONFIG.fontCssPx * dpr);
    var font = fontPx + "px " + token("--font-mono");
    var c = document.createElement("canvas");
    var x = c.getContext("2d");
    x.font = font;
    cellW = Math.ceil(x.measureText("M").width);
    cellH = Math.ceil(fontPx * CONFIG.lineHeight);
    atlasRows = Math.ceil(CONFIG.chars.length / atlasCols);
    c.width = cellW * atlasCols;
    c.height = cellH * atlasRows;
    x.font = font;
    x.fillStyle = "#fff";
    x.textAlign = "center";
    x.textBaseline = "middle";
    CONFIG.chars.split("").forEach(function (ch, i) {
      x.fillText(ch, (i % atlasCols + 0.5) * cellW, (Math.floor(i / atlasCols) + 0.5) * cellH);
    });
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    builtForDpr = dpr;
  }

  // Colours come from tokens.css (--color-hash-*), parsed to 0..1 rgb
  function rgb(name) {
    var h = token(name).replace("#", "");
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; });
  }
  var ink = rgb("--color-hash-ink"), hi = rgb("--color-hash-hi"), glow = rgb("--color-hash-glow");

  // ---------- sizing ----------
  var width = 0, height = 0, dpr = 1;
  function resize() {
    var rect = parent.getBoundingClientRect();
    if (rect.width === width && rect.height === height) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (dpr !== builtForDpr) buildAtlas(dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // ---------- time ----------
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var startTime = performance.now();
  var seed = Math.random();
  function now() { return (performance.now() - startTime) / 1000; }

  // ---------- interaction ----------
  var target = [0, 0], mouse = [0, 0];
  var inside = false, hoverAmt = 0;

  // afterglow trail: ring buffer of recent cursor positions
  var trail = new Float32Array(MAX_TRAIL * 4);
  var trailIndex = 0, trailCount = 0, lastSample = [-1e9, -1e9, -1e9];
  function addTrail(x, y, t) {
    var k = trailIndex * 4;
    trail[k] = x; trail[k + 1] = y; trail[k + 2] = t;
    trailIndex = (trailIndex + 1) % MAX_TRAIL;
    trailCount = Math.min(trailCount + 1, MAX_TRAIL);
    lastSample = [x, y, t];
  }

  var taps = new Float32Array(MAX_TAPS * 4);
  var tapIndex = 0, tapCount = 0;

  if (window.matchMedia("(pointer: fine)").matches) {
    parent.addEventListener("pointermove", function (e) {
      var rect = parent.getBoundingClientRect();
      target[0] = (e.clientX - rect.left) * dpr;
      target[1] = (e.clientY - rect.top) * dpr;
      if (!inside && hoverAmt < 0.02) { mouse[0] = target[0]; mouse[1] = target[1]; }
      inside = true;
    }, { passive: true });
    parent.addEventListener("pointerleave", function () { inside = false; });
  }
  parent.addEventListener("pointerdown", function (e) {
    if (!active || e.button > 0 || e.target.closest("a, button")) return;
    var rect = parent.getBoundingClientRect();
    var k = tapIndex * 4;
    taps[k] = (e.clientX - rect.left) * dpr;
    taps[k + 1] = (e.clientY - rect.top) * dpr;
    taps[k + 2] = now();
    tapIndex = (tapIndex + 1) % MAX_TAPS;
    tapCount = Math.min(tapCount + 1, MAX_TAPS);
  }, { passive: true });

  // ---------- render ----------
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  var active = false, shownAt = 0;
  function render() {
    var t = now();

    mouse[0] += (target[0] - mouse[0]) * 0.2;
    mouse[1] += (target[1] - mouse[1]) * 0.2;
    hoverAmt += ((inside ? 1 : 0) - hoverAmt) * 0.06;

    // drop a trail sample when the cursor has moved far enough
    if (inside) {
      var spacing = CONFIG.hoverRadius * canvas.height * 0.25;
      var dx = mouse[0] - lastSample[0], dy = mouse[1] - lastSample[1];
      if (dx * dx + dy * dy > spacing * spacing || t - lastSample[2] > 0.25) addTrail(mouse[0], mouse[1], t);
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform2f(U.uCell, cellW, cellH);
    gl.uniform2f(U.uAtlasGrid, atlasCols, atlasRows);
    gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uSeed, seed);
    gl.uniform1f(U.uFade, reduceMotion ? 1 : Math.min(1, (t - shownAt) / CONFIG.fadeIn));
    gl.uniform1f(U.uCloudScale, CONFIG.cloudScale);
    gl.uniform1f(U.uWind, CONFIG.windSpeed);
    gl.uniform1f(U.uSmokeSpeed, CONFIG.smokeSpeed);
    gl.uniform1f(U.uCount, CONFIG.chars.length);
    gl.uniform1f(U.uHoverAmt, hoverAmt);
    gl.uniform1f(U.uHoverRadius, CONFIG.hoverRadius);
    gl.uniform1f(U.uTrailLife, CONFIG.trailLife);
    gl.uniform1f(U.uWaveSpeed, CONFIG.waveSpeed);
    gl.uniform1f(U.uWaveWidth, CONFIG.waveWidth);
    gl.uniform1f(U.uWaveLife, CONFIG.waveLife);
    gl.uniform3fv(U.uInk, ink);
    gl.uniform3fv(U.uHi, hi);
    gl.uniform3fv(U.uGlow, glow);
    gl.uniform4fv(U.uTaps, taps);
    gl.uniform1i(U.uTapCount, tapCount);
    gl.uniform4fv(U.uTrail, trail);
    gl.uniform1i(U.uTrailCount, trailCount);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(U.uAtlas, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------- run state: only while shown, on screen and the tab is visible ----------
  var rafId = null, heroVisible = true, tabVisible = !document.hidden;
  function frame() {
    render();
    rafId = requestAnimationFrame(frame);
  }
  function updateRunState() {
    if (active && reduceMotion) { render(); return; }
    if (active && heroVisible && tabVisible) {
      if (rafId === null) rafId = requestAnimationFrame(frame);
    } else if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (active && reduceMotion) render();
    }, 150);
  }
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(parent);
  else window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", function () {
    tabVisible = !document.hidden;
    updateRunState();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      updateRunState();
    }, { threshold: 0 }).observe(canvas.closest("#hero"));
  }

  resize();

  setTheme("hash");

  if (toggle && net) {
    toggle.hidden = false;
    toggle.addEventListener("click", function () {
      setTheme(active ? "network" : "hash", true);
    });
  }
})();
