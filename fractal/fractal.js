(function () {
  var canvas = document.querySelector("canvas");
  var root = document.documentElement;
  var gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) { root.classList.add("no-gl"); return; }

  // Tune the feel here without reading the logic below.
  var CONFIG = {
    zoomRate: 0.12,      // per sec, exponential zoom speed (1 -> maxZoom in ~97s)
    maxZoom: 120000,     // deep zoom via perturbation; drops to 6000 without float textures
    fadeTime: 1.6,       // sec, fade out/in between targets
    minScale: 1,         // adaptive resolution never drops below this (x CSS px), or below Resolution if lower
    glide: 0.9,          // per sec, how fast a clicked point slides to the centre
    clickBoost: 2.5,     // extra zoom speed right after a click, decays over ~1s
    warpFadeStart: 20,   // zoom where Warp starts easing off...
    warpFadeEnd: 2000,   // ...and where it is gone, so deep views show the true set
    // Each target sits on a boundary "river" that stays detailed at every depth.
    targets: [
      { name: "Seahorse Valley", x: -0.743643887037151, y: 0.131825904205330 },
      { name: "Elephant Valley", x: 0.2869318688950451, y: 0.014286693904085 },
      { name: "Bulb junction", x: -1.25066, y: 0.02012 }
    ],
    overview: { x: -0.6, y: 0 },
    // Looks live in styles/*.json (listed in styles/index.json); the first one loads on start.
    // These values are only the fallback if the styles can't be fetched.
    stylesDir: "styles/",
    defaults: { res: 2, aa: 2, magnify: 2, smooth: 1, zoom: 1, mode: 0, bright: 0, spin: 0.015, cycle: 0, density: 1, warp: 0, warpSpeed: 0.15 },
    deviceKeys: ["res", "aa"], // per-device settings that styles leave alone
    aaOffsets: { 1: [0, 0], 2: [-0.25, -0.25, 0.25, 0.25], 4: [0.125, 0.375, -0.375, 0.125, 0.375, -0.125, -0.125, -0.375] },
    // Colour modes 1-5: cosine palettes a + b*cos(2pi(c*t + d)). Mode 0 is the site palette,
    // mode 6 the current style's own gradient.
    palettes: [
      null,
      [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0, 0.33, 0.67]],     // Rainbow
      [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0, 0.1, 0.2]],       // Sunset
      [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 0.5], [0.8, 0.9, 0.3]],   // Electric
      [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 0.7, 0.4], [0, 0.15, 0.2]],  // Mint
      [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0, 0, 0]]            // Mono
    ]
  };

  var MAX_ITER = 1400;
  var REF_W = 2048; // reference orbit texture width, > MAX_ITER

  // Float32 runs out of precision around 6000x. Past that, each pixel is iterated as a small
  // offset from one reference orbit computed in float64 here in JS (perturbation), rebasing
  // to the orbit start whenever the offset would lose accuracy.
  var deep = !!gl.getExtension("OES_texture_float");
  if (!deep) CONFIG.maxZoom = 6000;
  var derivs = !!gl.getExtension("OES_standard_derivatives");

  var vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  var frag = [
    deep ? "#define DEEP" : "",
    derivs ? "#extension GL_OES_standard_derivatives : enable\n#define DERIVS" : "",
    "precision highp float;",
    "uniform vec2 uRes;uniform vec2 uShift;uniform float uScale;uniform float uAngle;",
    "uniform float uMaxIter;uniform float uFade;uniform vec2 uFocus;",
    "uniform sampler2D uRef;uniform float uRefLen;uniform vec2 uZ0;",
    "uniform float uSmooth;uniform float uDensity;uniform float uPhase;uniform float uMode;",
    "uniform vec3 uPa;uniform vec3 uPb;uniform vec3 uPc;uniform vec3 uPd;",
    "uniform float uStops[8];uniform vec3 uCols[8];uniform float uNStops;uniform float uBright;",
    "uniform float uSamples;uniform vec2 uOffs[4];uniform float uFreq;uniform vec3 uAvg;",
    "vec3 palette(float t){",
    "  vec3 a=vec3(0.36,0.31,0.91);", // indigo (button colour)
    "  vec3 b=vec3(0.37,0.69,1.0);",  // accent blue
    "  vec3 c=vec3(0.34,0.83,0.87);", // cyan
    "  float s=0.5+0.5*sin(t);float h=0.5+0.5*sin(t*0.37+1.3);",
    "  return mix(mix(a,b,s),c,h*h);",
    "}",
    // Cyclic gradient from the style file: stops sorted, first at 0, last colour wraps to the first.
    "vec3 gradient(float t){",
    "  t=fract(t);",
    "  for(int i=0;i<7;i++){",
    "    if(float(i+1)>=uNStops)break;",
    "    if(t<uStops[i+1])return mix(uCols[i],uCols[i+1],smoothstep(uStops[i],uStops[i+1],t));",
    "  }",
    "  vec3 last=uCols[0];float p=0.;",
    "  for(int i=0;i<8;i++){if(float(i)<uNStops){last=uCols[i];p=uStops[i];}}",
    "  return mix(last,uCols[0],smoothstep(p,1.,t));",
    "}",
    "vec3 shade(vec2 frag){",
    "  vec2 d=(frag-0.5*uRes)/uRes.y-uShift;",
    "  float cs=cos(uAngle),sn=sin(uAngle);",
    "  vec2 dc=vec2(cs*d.x-sn*d.y,sn*d.x+cs*d.y)*uScale;", // this pixel's offset from the focus point
    "  vec2 z=uZ0;float n=0.;bool esc=false;",
    "#ifdef DEEP",
    "  vec2 dz=vec2(0.);vec2 Z=uZ0;float m=0.;",
    "  for(int i=0;i<" + MAX_ITER + ";i++){",
    "    if(float(i)>=uMaxIter)break;",
    "    dz=vec2(2.*(Z.x*dz.x-Z.y*dz.y)+dz.x*dz.x-dz.y*dz.y,2.*(Z.x*dz.y+Z.y*dz.x)+2.*dz.x*dz.y)+dc;",
    "    m+=1.;",
    "    Z=texture2D(uRef,vec2((m+0.5)/" + REF_W + ".,0.5)).xy;",
    "    z=Z+dz;float r2=dot(z,z);",
    "    if(r2>256.){esc=true;break;}",
    "    n+=1.;",
    "    if(r2<dot(dz,dz)||m>=uRefLen){dz=z-uZ0;m=0.;Z=uZ0;}", // rebase onto the orbit start
    "  }",
    "#else",
    "  vec2 c=uFocus+dc;",
    "  for(int i=0;i<" + MAX_ITER + ";i++){",
    "    if(float(i)>=uMaxIter)break;",
    "    z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;",
    "    if(dot(z,z)>256.){esc=true;break;}",
    "    n+=1.;",
    "  }",
    "#endif",
    "  vec3 col=vec3(0.043,0.047,0.059);",
    "  float sm=esc?n-log2(log2(dot(z,z)))+4.:1.;",
    "  float t=sqrt(sm)*1.1*uDensity+uPhase;",
    "  float blend=0.;",
    "#ifdef DERIVS",
    // Band smoothing: where a colour cycle is narrower than ~2px it can only shimmer, so fade to the palette average.
    "  blend=smoothstep(0.2,0.7,fwidth(t*uFreq));",
    "#endif",
    "  if(esc){",
    "    float sn2=mix(floor(sm),sm,uSmooth);", // 0 = hard contour bands, 1 = smooth gradient
    "    float tb=sqrt(sn2)*1.1*uDensity+uPhase;",
    "    vec3 pc=uMode>5.5?gradient(tb*0.15):uMode<0.5?palette(tb):uPa+uPb*cos(6.28318*(uPc*tb*0.16+uPd));",
    "    pc=mix(pc,uAvg,blend);",
    // Deep views never escape fast, so measure brightness from a floor that rises with depth.
    "    float lo=log(max(uMaxIter*0.12-15.,1.));",
    "    float glow=clamp((log(max(sn2,1.))-lo)/(log(uMaxIter)-lo),0.,1.);",
    "    col=uBright>0.5?pc:mix(col,pc,glow*sqrt(glow));", // full brightness skips the dark floor
    "  }",
    "  return col;",
    "}",
    // Anti-aliasing: average up to 4 offset samples per pixel.
    "void main(){",
    "  vec3 col=vec3(0.);",
    "  for(int i=0;i<4;i++){",
    "    if(float(i)>=uSamples)break;",
    "    col+=shade(gl_FragCoord.xy+uOffs[i]);",
    "  }",
    "  gl_FragColor=vec4(col/uSamples*uFade,1.);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  var prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    root.classList.add("no-gl");
    return;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ["uRes", "uShift", "uScale", "uAngle", "uMaxIter", "uFade", "uFocus", "uRef", "uRefLen",
    "uSmooth", "uDensity", "uPhase", "uMode", "uPa", "uPb", "uPc", "uPd",
    "uStops", "uCols", "uNStops", "uBright",
    "uZ0", "uSamples", "uOffs", "uFreq", "uAvg"].forEach(function (k) {
    U[k] = gl.getUniformLocation(prog, k);
  });

  var refData = new Float32Array(REF_W * 4);
  if (deep) {
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U.uRef, 0);
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var labelEl = document.querySelector("[data-target]");
  var zoomEl = document.querySelector("[data-zoom]");

  var scale = 1;       // render pixels per CSS px: Resolution, lowered if frames run slow
  var cssW = 0, cssH = 0;
  var targetIndex = 0;
  var focus = null;    // { name, x, y } point the dive is heading into
  var sx = 0, sy = 0;  // focus position on screen (height units from centre), glides to 0
  var logZoom = 0;
  var boost = 0;
  var t = 0;           // seconds into the current dive
  var angle = 0, phase = 0;
  var S = {};          // live control values
  var rafId = null, lastTime = 0, slowFrames = 0, lastReadout = 0;
  var logMax = Math.log(CONFIG.maxZoom);
  var warpAngle = 0, z0x = 0, z0y = 0;

  // Reference orbit of the focus point in float64, uploaded per new focus (and per frame while warping).
  function uploadOrbit() {
    if (!deep) return;
    var x = z0x, y = z0y, k = 0;
    refData.fill(0);
    refData[0] = x;
    refData[1] = y;
    while (k < MAX_ITER) {
      var nx = x * x - y * y + focus.x;
      y = 2 * x * y + focus.y;
      x = nx;
      k++;
      refData[k * 4] = x;
      refData[k * 4 + 1] = y;
      if (x * x + y * y > 256) break;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, REF_W, 1, 0, gl.RGBA, gl.FLOAT, refData);
    gl.uniform1f(U.uRefLen, k);
  }

  function startDive(i) {
    targetIndex = i;
    var target = CONFIG.targets[i];
    focus = { name: target.name, x: target.x, y: target.y };
    // Open on the whole set, with the target where it sits in that overview.
    sx = (target.x - CONFIG.overview.x) / 2.6 * S.magnify;
    sy = (target.y - CONFIG.overview.y) / 2.6 * S.magnify;
    logZoom = 0;
    boost = 0;
    t = 0;
    uploadOrbit();
  }

  function resize() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.round(cssW * scale);
    canvas.height = Math.round(cssH * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Warp moves the orbit's start value z0 around a small circle, bending the whole set.
  // It eases off with depth: the deep targets only stay detailed on the true set.
  function updateWarp() {
    var zoom = Math.exp(logZoom) * S.magnify;
    var f = (Math.log(zoom) - Math.log(CONFIG.warpFadeStart)) / Math.log(CONFIG.warpFadeEnd / CONFIG.warpFadeStart);
    f = Math.min(Math.max(f, 0), 1);
    var amount = S.warp * (1 - f * f * (3 - 2 * f));
    var nx = amount * Math.cos(warpAngle), ny = amount * Math.sin(warpAngle);
    if (nx === z0x && ny === z0y) return;
    z0x = nx;
    z0y = ny;
    gl.uniform2f(U.uZ0, z0x, z0y);
    uploadOrbit();
  }

  function render() {
    var zoom = Math.exp(logZoom) * S.magnify;
    updateWarp();
    var fade = Math.min(t / CONFIG.fadeTime, (logMax - logZoom) / (CONFIG.zoomRate * S.zoom * CONFIG.fadeTime), 1);

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform2f(U.uShift, sx, sy);
    gl.uniform1f(U.uScale, 2.6 / zoom);
    gl.uniform1f(U.uAngle, angle);
    gl.uniform1f(U.uMaxIter, Math.min(140 + 55 * Math.log2(zoom), MAX_ITER));
    gl.uniform1f(U.uFade, reduceMotion ? 1 : Math.max(fade, 0));
    gl.uniform2f(U.uFocus, focus.x, focus.y);
    gl.uniform1f(U.uSmooth, S.smooth);
    gl.uniform1f(U.uDensity, S.density);
    gl.uniform1f(U.uPhase, phase);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    var now = performance.now();
    if (now - lastReadout > 250) {
      lastReadout = now;
      labelEl.textContent = focus.name;
      zoomEl.textContent = zoom < 10 ? zoom.toFixed(1) + "×" : Math.round(zoom).toLocaleString("en") + "×";
    }
  }

  function frame(time) {
    var dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;

    // Adaptive resolution: if frames run long for a while, render fewer pixels.
    var floor = Math.min(CONFIG.minScale, S.res);
    if (dt > 0.026 && scale > floor) {
      if (++slowFrames > 20) {
        scale = Math.max(scale - 0.15, floor);
        slowFrames = 0;
        resize();
      }
    } else if (slowFrames > 0) {
      slowFrames--;
    }

    t += dt;
    boost *= Math.exp(-dt * 1.5);
    logZoom += dt * CONFIG.zoomRate * S.zoom * (1 + boost);
    angle += dt * S.spin;
    phase += dt * S.cycle;
    warpAngle += dt * S.warpSpeed;
    var g = Math.exp(-dt * CONFIG.glide);
    sx *= g;
    sy *= g;
    if (logZoom >= logMax) startDive((targetIndex + 1) % CONFIG.targets.length);

    render();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (rafId !== null || reduceMotion || !focus) return;
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth === cssW && window.innerHeight === cssH) return;
      resize();
      if (reduceMotion) render();
    }, 150);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  // Click retargets the dive: the clicked point keeps its place on screen this frame,
  // then glides to the centre while the zoom carries on.
  var hintEl = document.querySelector(".hint");
  if (reduceMotion) hintEl.hidden = true; // nothing moves, so clicks don't zoom

  canvas.addEventListener("pointerdown", function (e) {
    if (reduceMotion) return;
    hintEl.hidden = true; // the hint has done its job once someone has clicked
    var s = 2.6 / (Math.exp(logZoom) * S.magnify);
    var cs = Math.cos(angle), sn = Math.sin(angle);
    var ux = (e.clientX - cssW / 2) / cssH;
    var uy = (cssH / 2 - e.clientY) / cssH;
    var dx = ux - sx, dy = uy - sy;
    focus = {
      name: "Your pick",
      x: focus.x + (cs * dx - sn * dy) * s,
      y: focus.y + (sn * dx + cs * dy) * s
    };
    sx = ux;
    sy = uy;
    boost = CONFIG.clickBoost;
    uploadOrbit();
  }, { passive: true });

  // On-page controls: every input writes straight into S; colour mode also pushes its palette.
  var form = document.querySelector(".controls__body");
  var styles = [];
  var style = null;    // the selected style, or null when running on CONFIG.defaults

  function hexToRgb(hex) {
    var v = parseInt(hex.replace("#", ""), 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  }

  var stops = null;    // current style's gradient

  function smoothstep(a, b, x) {
    x = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return x * x * (3 - 2 * x);
  }

  // JS twins of the shader palettes, only used to find each palette's average colour.
  function sampleGradient(t) {
    for (var i = 0; i < stops.length - 1; i++) {
      if (t < stops[i + 1][0]) return mixRgb(hexToRgb(stops[i][1]), hexToRgb(stops[i + 1][1]), smoothstep(stops[i][0], stops[i + 1][0], t));
    }
    return mixRgb(hexToRgb(stops[stops.length - 1][1]), hexToRgb(stops[0][1]), smoothstep(stops[stops.length - 1][0], 1, t));
  }

  function sampleSite(t) {
    var s = 0.5 + 0.5 * Math.sin(t), h = 0.5 + 0.5 * Math.sin(t * 0.37 + 1.3);
    return mixRgb(mixRgb([0.36, 0.31, 0.91], [0.37, 0.69, 1], s), [0.34, 0.83, 0.87], h * h);
  }

  function mixRgb(a, b, k) {
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }

  function average(fn, from, to) {
    var sum = [0, 0, 0], n = 256;
    for (var i = 0; i < n; i++) {
      var c = fn(from + (to - from) * (i + 0.5) / n);
      sum[0] += c[0] / n; sum[1] += c[1] / n; sum[2] += c[2] / n;
    }
    return sum;
  }

  function setPalette() {
    gl.uniform1f(U.uMode, S.mode);
    gl.uniform1f(U.uBright, S.bright);
    var pal = CONFIG.palettes[S.mode];
    if (pal) {
      gl.uniform3fv(U.uPa, pal[0]);
      gl.uniform3fv(U.uPb, pal[1]);
      gl.uniform3fv(U.uPc, pal[2]);
      gl.uniform3fv(U.uPd, pal[3]);
    }
    // Colour cycles per unit of t, and the colour that fine bands are smoothed into.
    if (S.mode === 6 && stops) {
      gl.uniform1f(U.uFreq, 0.15);
      gl.uniform3fv(U.uAvg, average(sampleGradient, 0, 1));
    } else if (pal) {
      gl.uniform1f(U.uFreq, 0.16 * Math.max(pal[2][0], pal[2][1], pal[2][2]));
      gl.uniform3fv(U.uAvg, pal[0]);
    } else {
      gl.uniform1f(U.uFreq, 1 / (2 * Math.PI));
      gl.uniform3fv(U.uAvg, average(sampleSite, 0, 200));
    }
  }

  function setSamples() {
    var offs = new Float32Array(8);
    offs.set(CONFIG.aaOffsets[S.aa] || [0, 0]);
    gl.uniform1f(U.uSamples, S.aa);
    gl.uniform2fv(U.uOffs, offs);
  }

  function setGradient(list) {
    stops = list;
    var pos = new Float32Array(8), cols = new Float32Array(24);
    list.slice(0, 8).forEach(function (st, i) {
      pos[i] = st[0];
      cols.set(hexToRgb(st[1]), i * 3);
    });
    gl.uniform1fv(U.uStops, pos);
    gl.uniform3fv(U.uCols, cols);
    gl.uniform1f(U.uNStops, Math.min(list.length, 8));
  }

  // Slider readouts in units a visitor can read: 2x, 75%, 0.9°/s.
  function formatValue(el) {
    var v = +el.value;
    switch (el.dataset.unit) {
      case "x": return +v.toFixed(2) + "×";
      case "%": return Math.round(v * 100) + "%";
      case "%max": return Math.round(v / +el.max * 100) + "%";
      case "deg": return (v * 180 / Math.PI).toFixed(1) + "°/s";
      default: return el.value;
    }
  }

  function readForm() {
    var prevRes = S.res;
    Object.keys(CONFIG.defaults).forEach(function (k) {
      var el = form.elements[k];
      S[k] = el.type === "checkbox" ? (el.checked ? 1 : 0) : +el.value;
      var out = el.parentNode.querySelector("output");
      if (out) out.textContent = formatValue(el);
    });
    setPalette();
    setSamples();
    if (S.res !== prevRes) {
      scale = S.res;
      resize();
    }
    if (reduceMotion && focus) render();
  }

  function setForm(values) {
    Object.keys(values).forEach(function (k) {
      var el = form.elements[k];
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!values[k];
      else el.value = values[k];
    });
    readForm();
  }

  // A style sets everything except Resolution, which belongs to the device.
  function applyStyle(st) {
    style = st;
    var v = {};
    Object.keys(CONFIG.defaults).forEach(function (k) {
      if (CONFIG.deviceKeys.indexOf(k) < 0) v[k] = CONFIG.defaults[k];
    });
    if (st) {
      Object.keys(st.settings || {}).forEach(function (k) { v[k] = st.settings[k]; });
      var c = st.colours || {};
      if (c.gradient) setGradient(c.gradient);
      v.mode = c.gradient ? 6 : (c.mode || 0);
      v.bright = c.bright ? 1 : 0;
    }
    form.elements.mode.querySelector('[value="6"]').disabled = !(st && st.colours && st.colours.gradient);
    setForm(v);
  }

  function loadStyles() {
    var dir = CONFIG.stylesDir;
    return fetch(dir + "index.json")
      .then(function (r) { return r.json(); })
      .then(function (files) {
        return Promise.all(files.map(function (f) {
          return fetch(dir + f).then(function (r) { return r.json(); });
        }));
      })
      .then(function (list) {
        styles = list;
        var select = form.elements.style;
        list.forEach(function (st, i) {
          var o = document.createElement("option");
          o.value = i;
          o.textContent = st.name;
          select.appendChild(o);
        });
        select.parentNode.hidden = false;
      })
      .catch(function () { styles = []; });
  }

  form.addEventListener("input", function (e) {
    if (e.target.name === "style") applyStyle(styles[+e.target.value]);
    else readForm();
  });
  form.addEventListener("reset", function (e) {
    e.preventDefault(); // back to the selected style, not the HTML defaults
    applyStyle(style);
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  CONFIG.deviceKeys.forEach(function (k) { form.elements[k].value = CONFIG.defaults[k]; });
  readForm();
  resize();

  loadStyles().then(function () {
    applyStyle(styles[0] || null);
    form.parentNode.hidden = false;
    startDive(0);
    begin();
  });

  function begin() {
    if (reduceMotion) {
      logZoom = logMax * 0.6; // one still frame, partway down the first river
      sx = sy = 0;
      render();
      return;
    }
    start();
  }
})();
