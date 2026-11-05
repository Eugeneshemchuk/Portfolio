// Hero theme "infinity": three nested infinity loops of particles flowing along them, a glowing
// knot where they cross and a dust halo. Vanilla WebGL2 port of WAO's ch4 sculpture (no three.js:
// bloom is faked with soft sprites and a CSS glow behind the knot). hash.js switches it on/off.
(function () {
  var canvas = document.querySelector(".hero__gl");
  if (!canvas) return;
  var parent = canvas.parentElement;
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var PHI = 1.6180339887, CAM = 14.5, TAN = Math.tan(25 * Math.PI / 180);

  var SNOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

  var VS = `#version 300 es
uniform float uTime, uScale, uAspect, uF, uVert;
uniform vec3 uPos, uScl, uMouse; uniform mat3 uRot; uniform vec4 uWave[4]; uniform float uFlare;
uniform mat3 uTilt[3]; uniform float uWidth[3]; uniform float uSpeed[3]; uniform float uSpin[3];
in float aKind; in float aStrand; in float aU; in float aSize; in float aPhase; in vec3 aJit; in vec3 aColor;
out vec3 vColor; out float vAlpha;
${SNOISE}
vec3 bernoulli(float t, float a){ float s=sin(t), c=cos(t), d=1.0+s*s; return vec3(a*c/d, a*s*c/d, 0.0); }
void main(){
  vec3 p; int k = int(aStrand);
  if (aKind < 0.5) {
    p = uTilt[k] * (bernoulli(aU + uTime * uSpeed[k], uWidth[k] * 0.5) + aJit);
    float sa = uTime * uSpin[k] + aStrand * 1.0472, cs = cos(sa), sn = sin(sa);
    p.xz = vec2(cs * p.x + sn * p.z, -sn * p.x + cs * p.z);
  } else {
    p = aJit;
    if (aKind > 1.5) { float ha = uTime * 0.012, hc = cos(ha), hs = sin(ha); p.xy = vec2(hc * p.x - hs * p.y, hs * p.x + hc * p.y); }
  }
  p += 0.13 * vec3(snoise(p * 0.35 + vec3(0.0, 0.0, uTime * 0.08)), snoise(p * 0.35 + vec3(7.1, 0.0, uTime * 0.08)), snoise(p * 0.35 + vec3(0.0, 3.7, uTime * 0.08)));
  p += 0.025 * vec3(sin(uTime * 1.3 + aPhase), cos(uTime * 1.1 + aPhase * 1.7), sin(uTime * 0.9 + aPhase * 2.3));
  float centre = smoothstep(2.6, 0.0, length(p.xy));
  vColor = mix(aColor, vec3(1.0, 0.965, 0.902), aKind < 0.5 ? centre * 0.85 : (aKind < 1.5 ? smoothstep(1.2, 0.0, length(p)) : 0.0));
  vAlpha = (0.74 + 0.26 * sin(uTime * (1.2 + fract(aPhase) * 2.0) + aPhase * 6.0)) * (aKind > 1.5 ? 0.35 : 1.0);
  if (aKind < 0.5) { float w = 0.5 + 0.5 * sin(aU * (2.0 + aStrand) + aStrand * 2.1); vAlpha *= mix(0.42, 1.18, w * w); }
  if (uVert > 0.5) p.xy = vec2(-p.y, p.x); // phones: the loop stands upright
  p = uRot * p * uScl + uPos;              // drag + cursor tilt, then onto the hero
  // cursor pushes particles aside (uMouse.z eases in/out); click ripples shove and light them
  float S = uScl.x;
  vec2 dm = p.xy - uMouse.xy; float lm = length(dm) + 1e-4, R = 1.3 * S;
  p.xy += dm / lm * uMouse.z * 0.7 * R * exp(-lm * lm / (R * R));
  for (int i = 0; i < 4; i++) {
    vec4 w = uWave[i]; if (w.w < 0.5) continue;
    vec2 dw = p.xy - w.xy; float lw = length(dw) + 1e-4, life = 1.0 - w.z / 2.4;
    float band = exp(-pow((lw - w.z * 6.0 * S) / (0.9 * S), 2.0)) * life * life;
    p.xy += dw / lw * band * 0.8 * S; p.z += band * 0.8 * S;
    vAlpha *= 1.0 + band * 3.0;
  }
  if (aKind > 0.5 && aKind < 1.5) vAlpha *= 1.0 + uFlare * 2.5;
  float z = ${CAM.toFixed(1)} - p.z;     // distance to the camera
  vAlpha *= smoothstep(3.0, 7.5, z);
  gl_PointSize = min(aSize * uScale * (15.0 / z), 28.0 * uScale);
  gl_Position = vec4(p.x * uF / uAspect, p.y * uF, 0.0, z);
}`;

  var FS = `#version 300 es
precision mediump float;
in vec3 vColor; in float vAlpha; out vec4 o;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = (smoothstep(0.5, 0.0, d) * 0.75 + smoothstep(0.16, 0.0, d) * 0.9) * vAlpha * 1.5; // brighter to make up for no bloom
  o = vec4(vColor * a, min(a, 1.0));
}`;

  var gl = null, U = {}, N = 0, raf = 0, active = false, heroVisible = true, time = 0, lastT = 0;

  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  // Euler XYZ (three.js order) -> column-major mat3
  function tilt(k) {
    var x = 0.05 * Math.pow(PHI, k) * (k % 2 ? -1 : 1), y = x * PHI * 0.5, z = (k - 1) * 0.04;
    var a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
    return [c * e, a * f + b * e * d, b * f - a * e * d, -c * f, a * e - b * f * d, b * e + a * f * d, d, -b * c, a * c];
  }

  function init() {
    gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) return false;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    ["uTime", "uScale", "uAspect", "uF", "uVert", "uPos", "uScl", "uTilt", "uWidth", "uSpeed", "uSpin", "uMouse", "uRot", "uWave", "uFlare"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    // ── particles (same recipe and seed as the WAO original) ──
    N = window.innerWidth < 768 ? 4000 : 12000;
    var nStrand = Math.round(N * 0.76), nKnot = Math.round(N * 0.12);
    var wts = [1, 1 / PHI, 1 / (PHI * PHI)], wsum = wts[0] + wts[1] + wts[2];
    var cols = ["#FFC9A8", "#FFE6D4", "#FFD8BF"].map(hex);           // warm peach strands (site palette)
    var knotCol = hex("#FFE7B8"), haloCol = hex("#E8D6C8"), accCol = hex("#FF5B2E"), white = [1, 1, 1];
    var seed = 1618;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function gauss() { var u = rnd() || 1e-6, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    var beads = [0, 1, 2].map(function (k) { var b = []; for (var i = 0; i < 5 + k; i++) b.push(rnd() * Math.PI * 2); return b; });
    var kind = new Float32Array(N), strand = new Float32Array(N), u = new Float32Array(N), jit = new Float32Array(N * 3);
    var size = new Float32Array(N), phase = new Float32Array(N), color = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var c, r, th, ph;
      if (i < nStrand) {
        r = rnd() * wsum; var k = r < wts[0] ? 0 : r < wts[0] + wts[1] ? 1 : 2;
        strand[i] = k;
        u[i] = rnd() < 0.5 ? rnd() * Math.PI * 2 : beads[k][Math.floor(rnd() * beads[k].length)] + gauss() * 0.16;
        jit[i * 3] = gauss() * 0.07; jit[i * 3 + 1] = gauss() * 0.07; jit[i * 3 + 2] = gauss() * 0.07;
        c = cols[k]; size[i] = 1 + rnd() * 1.2;
      } else if (i < nStrand + nKnot) {
        kind[i] = 1; r = Math.abs(gauss()) * 0.38; th = rnd() * Math.PI * 2; ph = Math.acos(2 * rnd() - 1);
        jit[i * 3] = r * Math.sin(ph) * Math.cos(th) * 1.6; jit[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.8; jit[i * 3 + 2] = r * Math.cos(ph);
        c = knotCol; size[i] = 1.2 + rnd() * 1.4;
      } else {
        kind[i] = 2; r = 7.5 + rnd() * 5.5; th = rnd() * Math.PI * 2; ph = Math.acos(2 * rnd() - 1);
        jit[i * 3] = r * Math.sin(ph) * Math.cos(th); jit[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); jit[i * 3 + 2] = r * Math.cos(ph);
        c = rnd() < 0.08 ? accCol : haloCol; size[i] = 0.8 + rnd() * 0.8;
      }
      if (rnd() < 0.015) { size[i] = 4 + rnd() * 2; c = white; }
      phase[i] = rnd() * 100;
      color[i * 3] = c[0]; color[i * 3 + 1] = c[1]; color[i * 3 + 2] = c[2];
    }
    var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    [["aKind", kind, 1], ["aStrand", strand, 1], ["aU", u, 1], ["aJit", jit, 3], ["aSize", size, 1], ["aPhase", phase, 1], ["aColor", color, 3]].forEach(function (a) {
      var loc = gl.getAttribLocation(prog, a[0]); if (loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, a[1], gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, a[2], gl.FLOAT, false, 0, 0);
    });

    gl.uniformMatrix3fv(U.uTilt, false, new Float32Array(tilt(0).concat(tilt(1), tilt(2))));
    gl.uniform1fv(U.uWidth, [12, 12 / Math.pow(PHI, 0.6), 12 / Math.pow(PHI, 1.25)]); // nested: 100%, ≈75%, ≈55%
    gl.uniform1fv(U.uSpeed, [0.084, -0.084 / PHI, 0.084 / (PHI * PHI)]);              // one lap ≈ 75 s, second reversed
    gl.uniform1fv(U.uSpin, [0.09, -0.06, 0.042]);                                     // clock hands seen from above
    gl.uniform1f(U.uF, 1 / TAN);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    fit();
    return true;
  }

  // Desktop: loop on the right, clear of the hero text. Phones: upright and centred, behind the text.
  function fit() {
    if (!gl) return;
    var W = parent.clientWidth, H = parent.clientHeight;
    if (!W || !H) return;
    var mobile = W < 768, dpr = Math.min(mobile ? 1.5 : 2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    var ppu = H / (2 * CAM * TAN), halfH = 6 / (2 * Math.SQRT2), s, cx, cy = H / 2;
    if (mobile) { cx = W / 2; s = Math.min(H * 0.8 / 12, W * 0.85 / (4 * halfH)) / ppu; }
    else { cx = W * 0.7; s = Math.min(W * 0.44, H * 1.4) / 12 / ppu; }
    gl.uniform1f(U.uScale, 2 * dpr);
    gl.uniform1f(U.uAspect, W / H);
    gl.uniform1f(U.uVert, mobile ? 1 : 0);
    gl.uniform3f(U.uPos, (cx - W / 2) / ppu, -(cy - H / 2) / ppu, 0);
    gl.uniform3f(U.uScl, s, s, s);
    geo.W = W; geo.H = H; geo.ppu = ppu;
    var r = 1.4 * s * ppu; // soft glow behind the knot stands in for bloom
    canvas.style.background = "radial-gradient(circle at " + cx + "px " + cy + "px, rgba(255,214,170,.16), rgba(255,120,60,.05) " + r + "px, transparent " + (r * 2.6) + "px)";
    if (!raf) render();
  }

  function render() {
    if (!gl) return;
    var now = performance.now() / 1000;
    var dt = reduced || !lastT ? 0 : Math.min(0.05, Math.max(0, now - lastT)); lastT = now;
    time += dt;
    gl.uniform1f(U.uTime, time);
    interact(dt, now);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  // ── interaction: cursor pushes particles + tilts the loop (mouse), click/tap sends a ripple and
  // flares the knot, drag turns it trackball-style (inertia, then eases back). Text and buttons
  // keep their own clicks; on touch a vertical swipe stays a scroll, a sideways one turns the loop.
  var geo = { W: 1, H: 1, ppu: 1 };
  var mouse = { x: 0, y: 0, on: false, amt: 0, tx: 0, ty: 0 }, waves = [], flare = 0, q = [0, 0, 0, 1];
  var drag = { on: false, x: 0, y: 0, sx: 0, sy: 0, wx: 0, wy: 0, id: -1, touch: false, lock: 0, moved: 0, t0: 0 };
  var waveArr = new Float32Array(16);
  function qmul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }
  function qnorm(a) { var l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; }
  function qaxis(x, y, z, t) { var s = Math.sin(t / 2); return [x * s, y * s, z * s, Math.cos(t / 2)]; }
  function qmat(a) { var x = a[0], y = a[1], z = a[2], w = a[3]; return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]; }
  function turn(wx, wy) { var a = Math.hypot(wx, wy); if (a > 1e-6) q = qnorm(qmul(qaxis(wx / a, wy / a, 0, a), q)); }
  function local(e) { var r = parent.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  function interact(dt, now) {
    mouse.amt += ((mouse.on && !drag.on ? 1 : 0) - mouse.amt) * Math.min(1, dt * 4);
    var nx = mouse.on ? mouse.x / geo.W * 2 - 1 : 0, ny = mouse.on ? mouse.y / geo.H * 2 - 1 : 0;
    mouse.tx += (nx - mouse.tx) * Math.min(1, dt * 2); mouse.ty += (ny - mouse.ty) * Math.min(1, dt * 2);
    if (!drag.on) {
      turn(drag.wx, drag.wy); drag.wx *= 0.92; drag.wy *= 0.92;
      if (Math.abs(drag.wx) + Math.abs(drag.wy) < 0.002) {
        var t = Math.min(1, dt * 0.7), g = q[3] < 0 ? -1 : 1;
        q = qnorm([q[0] * g * (1 - t), q[1] * g * (1 - t), q[2] * g * (1 - t), q[3] * g * (1 - t) + t]);
      }
    }
    var tilt = qmul(qaxis(1, 0, 0, mouse.ty * 0.14), qaxis(0, 1, 0, mouse.tx * 0.2)); // loop faces the cursor a little
    gl.uniformMatrix3fv(U.uRot, false, qmat(qmul(q, tilt)));
    gl.uniform3f(U.uMouse, (mouse.x - geo.W / 2) / geo.ppu, -(mouse.y - geo.H / 2) / geo.ppu, mouse.amt);
    waves = waves.filter(function (w) { return now - w.t < 2.4; });
    for (var i = 0; i < 4; i++) {
      var w = waves[i];
      waveArr[i * 4] = w ? (w.x - geo.W / 2) / geo.ppu : 0; waveArr[i * 4 + 1] = w ? -(w.y - geo.H / 2) / geo.ppu : 0;
      waveArr[i * 4 + 2] = w ? now - w.t : 0; waveArr[i * 4 + 3] = w ? 1 : 0;
    }
    gl.uniform4fv(U.uWave, waveArr);
    flare *= Math.exp(-dt * 2.5);
    gl.uniform1f(U.uFlare, flare);
  }

  if (!reduced) {
    var ui = function (t) { return t.closest && t.closest("a,button,input,h1,p,.eyebrow"); };
    parent.addEventListener("pointermove", function (e) {
      if (!active) return;
      var l = local(e);
      if (e.pointerType === "mouse") { mouse.x = l[0]; mouse.y = l[1]; mouse.on = true; }
      if (!drag.on || e.pointerId !== drag.id) return;
      if (drag.lock === 0) { // touch: undecided until it proves sideways
        var ax = Math.abs(e.clientX - drag.sx), ay = Math.abs(e.clientY - drag.sy);
        if (ay > 8 && ay >= ax) { drag.lock = -1; return; }
        if (ax <= 8) return;
        drag.lock = 1; drag.x = e.clientX; drag.y = e.clientY;
        try { parent.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        parent.classList.add("is-grabbing");
        return;
      }
      if (drag.lock < 0) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = drag.touch ? 0.008 : 0.005;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.wx = dy * k; drag.wy = dx * k; turn(drag.wx, drag.wy);
    });
    parent.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") mouse.on = false; });
    parent.addEventListener("pointerdown", function (e) {
      if (!active || (e.pointerType === "mouse" && e.button !== 0) || ui(e.target)) return;
      drag.on = true; drag.x = drag.sx = e.clientX; drag.y = drag.sy = e.clientY; drag.moved = 0; drag.t0 = performance.now(); drag.id = e.pointerId;
      drag.touch = e.pointerType !== "mouse"; drag.lock = drag.touch ? 0 : 1; drag.wx = drag.wy = 0;
      if (!drag.touch) { try { parent.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } parent.classList.add("is-grabbing"); e.preventDefault(); }
    });
    var up = function (e) {
      if (!drag.on || e.pointerId !== drag.id) return;
      var tap = drag.lock !== -1 && e.type === "pointerup" && drag.moved < 6 && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8 && performance.now() - drag.t0 < 400;
      if (drag.lock === -1) drag.wx = drag.wy = 0;
      drag.on = false; drag.lock = 0; parent.classList.remove("is-grabbing");
      if (tap) { var l = local(e); waves.push({ x: l[0], y: l[1], t: performance.now() / 1000 }); if (waves.length > 4) waves.shift(); flare = 1; }
    };
    parent.addEventListener("pointerup", up);
    parent.addEventListener("pointercancel", up);
  }

  function loop() { raf = requestAnimationFrame(loop); render(); }
  function sync() {
    var run = active && heroVisible && !document.hidden && !reduced;
    if (run && !raf) { lastT = 0; raf = requestAnimationFrame(loop); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function setActive(on) {
    if (on && !gl && !init()) return;
    active = on;
    if (on) { lastT = 0; render(); }
    sync();
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; sync(); }, { threshold: 0 }).observe(canvas.closest("#hero"));
  }
  document.addEventListener("visibilitychange", sync);
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(parent);
  else window.addEventListener("resize", fit);

  window.heroSculpture = { setActive: setActive, render: render };
})();
