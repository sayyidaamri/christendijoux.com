/* =========================================================================
   fx.js — canvas & WebGL effects. Each effect is started by data-fx="name"
   and only animates while on screen. Written from scratch for this site.
   ========================================================================= */
(function () {
  "use strict";
  const FX = (window.FX = window.FX || {});
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const PAPER = "242,242,238";
  const pointer = (window.__pointer = window.__pointer || { x: -9999, y: -9999 });
  addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  /* ---------- shared helpers ---------- */
  FX.scroll = { y: 0, v: 0 };
  function fit(canvas, scale = 1) {
    const r = canvas.getBoundingClientRect();
    const d = DPR() * scale;
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h, d, rw: r.width, rh: r.height, rect: r };
  }
  /** run(fn) only while the element is visible. fn(t, dt) */
  function loop(el, fn, { always = false } = {}) {
    let raf = 0, vis = false, last = 0;
    const tick = (t) => { const dt = Math.min(64, t - (last || t)); last = t; fn(t / 1000, dt / 1000); if (vis && !reduce) raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(([en]) => {
      vis = en.isIntersecting;
      cancelAnimationFrame(raf); last = 0;
      if (vis) raf = requestAnimationFrame(tick);
    }, { rootMargin: "100px" });
    io.observe(el);
    if (reduce || always) requestAnimationFrame((t) => fn(t / 1000, 0));
    return { redraw: () => fn(performance.now() / 1000, 0) };
  }
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => (v + 0.5) / 64);
  FX.bayer = (x, y) => BAYER[(y & 7) * 8 + (x & 7)];
  // cheap 3D value noise (own)
  function hash3(x, y, z) { let h = x * 374761393 + y * 668265263 + z * 2147483647; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  const sm = (t) => t * t * (3 - 2 * t);
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
    return l(l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf), l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
  }
  FX.noise = vnoise;

  /* ---------- land mask ---------- */
  let LAND = null;
  function land(lat, lon) {
    if (!LAND) {
      LAND = new Uint8Array(360 * 180);
      const raw = atob(window.LANDMASK || "");
      for (let i = 0; i < raw.length; i++) { const b = raw.charCodeAt(i); for (let k = 0; k < 8; k++) LAND[i * 8 + k] = (b >> k) & 1; }
    }
    let x = Math.floor(((lon + 180) % 360 + 360) % 360), y = Math.floor(90 - lat);
    y = Math.max(0, Math.min(179, y));
    return LAND[y * 360 + x];
  }
  FX.land = land;
  const RAD = Math.PI / 180;

  /* =====================================================================
     1. DitherHero — WebGL raymarched noisy sphere + 8×8 Bayer dithering
     ===================================================================== */
  const DITHER_FS = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uFade; uniform float uCell;
uniform vec2 uCenter; uniform float uRadius; uniform float uLoupe;
float h(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
float sdf(vec3 p){ float t=uTime*0.12; float br=1.0+0.035*sin(uTime*0.8);
  return length(p)-br + 0.34*(fbm(p*1.35+vec3(0.0,t,t*0.6))-0.5) + 0.08*(n3(p*4.2-vec3(t*2.0))-0.5); }
float b2(vec2 a){ a=floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }
float b4(vec2 a){ return b2(0.5*a)*0.25 + b2(a); }
float b8(vec2 a){ return b4(0.5*a)*0.25 + b2(a); }
void main(){
  vec2 frag = gl_FragCoord.xy;
  float dm = length(frag - uMouse);
  float cell = uCell;
  if (uLoupe > 0.5 && dm < 150.0*uCell/6.0) cell = floor(uCell*0.5);
  vec2 ci = floor(frag / cell);
  vec2 c = (ci + 0.5) * cell;
  vec2 local = frag - ci*cell;
  vec2 q = (c - uCenter) / uRadius;
  // tilt toward the mouse a little
  vec2 m = (uMouse - uCenter) / uRadius; m = clamp(m, -2.0, 2.0) * 0.08;
  vec3 ro = vec3(q - m, 2.6), rd = vec3(0.0, 0.0, -1.0);
  float d = 0.0, hit = 0.0; vec3 p;
  if (length(q) < 1.75) {
    for (int i = 0; i < 36; i++) { p = ro + rd*d; float s = sdf(p); if (s < 0.004) { hit = 1.0; break; } d += s*0.8; if (d > 5.0) break; }
  }
  float lum = 0.0;
  if (hit > 0.5) {
    vec2 e = vec2(0.01, 0.0);
    vec3 n = normalize(vec3(sdf(p+e.xyy)-sdf(p-e.xyy), sdf(p+e.yxy)-sdf(p-e.yxy), sdf(p+e.yyx)-sdf(p-e.yyx)));
    vec3 l = normalize(vec3(-0.55 + m.x*3.0, 0.55 + m.y*3.0, 0.75));
    float dif = max(dot(n, l), 0.0);
    float rim = pow(1.0 - max(n.z, 0.0), 3.0);
    lum = 0.08 + 0.95*dif + 0.25*rim;
    lum *= 0.85 + 0.3*fbm(p*3.0 + uTime*0.05);
  }
  lum *= (1.0 - uFade);
  float th = b8(ci);
  float a = 0.0;
  if (lum > th + 0.02) {
    float g = cell > 3.5 ? 1.0 : 0.0;
    if (local.x >= g*0.5 && local.x <= cell - g*0.5 && local.y >= g*0.5 && local.y <= cell - g*0.5) a = 1.0;
  } else {
    // sparse background dot grid
    vec2 gi = mod(ci, 4.0);
    if (gi.x < 0.5 && gi.y < 0.5) {
      float dd = length(local - vec2(cell*0.5));
      float tw = 0.22 + 0.25*n3(vec3(ci*0.15, uTime*0.3));
      a = step(dd, cell*0.32) * tw * (1.0 - uFade*0.6);
    }
  }
  gl_FragColor = vec4(vec3(0.949, 0.949, 0.933)*a, 1.0);
}`;
  const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
  function glProgram(gl, fs) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return pr;
  }
  FX.glProgram = glProgram; FX.VS = VS;
  function dither(canvas) {
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) return;
    const pr = glProgram(gl, DITHER_FS);
    const U = {}; ["uRes", "uTime", "uMouse", "uFade", "uCell", "uCenter", "uRadius", "uLoupe"].forEach((n) => (U[n] = gl.getUniformLocation(pr, n)));
    const isHero = !canvas.hasAttribute("data-dither-scale");
    let mx = -9999, my = -9999, fade = 0;
    const hover = matchMedia("(hover:hover)").matches;
    loop(canvas, (t) => {
      const mobile = innerWidth < 1024;
      const scale = 1;
      const { w, h, d, rect } = fit(canvas, scale);
      gl.viewport(0, 0, w, h);
      const cell = Math.max(3, Math.round((mobile ? 6 : 6) * d));
      // target mouse in canvas pixel space (gl y up)
      let tx = (pointer.x - rect.left) * d, ty = h - (pointer.y - rect.top) * d;
      if (!hover || pointer.x < -999) { tx = w * 0.62 + Math.cos(t * 0.3) * w * 0.1; ty = h * 0.55 + Math.sin(t * 0.4) * h * 0.1; }
      mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
      if (mx < -999) { mx = tx; my = ty; }
      if (isHero) { const target = Math.min(1, Math.max(0, scrollY / (rect.height * 0.9))); fade += (target - fade) * 0.15; } else fade = 0;
      let cx, cy, r;
      if (!isHero) { cx = w * 0.5; cy = h * 0.5; r = Math.min(w, h) * 0.36; }
      else if (mobile) { cx = w * 0.5; cy = h - 170 * d; r = Math.min(w * 0.31, 118 * d); }
      else { cx = w * 0.64; cy = h * 0.59; r = h * 0.37; }
      gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uTime, t); gl.uniform2f(U.uMouse, mx, my); gl.uniform1f(U.uFade, fade);
      gl.uniform1f(U.uCell, cell); gl.uniform2f(U.uCenter, cx, cy); gl.uniform1f(U.uRadius, r); gl.uniform1f(U.uLoupe, hover ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }

  /* =====================================================================
     2. Dot globe (journey + reusable)
     ===================================================================== */
  function fibSphere(n) {
    const pts = [], g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y) / RAD, lon = Math.atan2(x, z) / RAD;
      pts.push({ lat, lon, l: land(lat, lon) });
    }
    return pts;
  }
  const toVec = (lat, lon) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
  function project(v, rotLon, rotLat) {
    // rotate around y by -rotLon, then around x by rotLat
    const cy = Math.cos(-rotLon * RAD), sy = Math.sin(-rotLon * RAD);
    let x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1];
    const cx = Math.cos(rotLat * RAD), sx = Math.sin(rotLat * RAD);
    const y2 = y * cx - z * sx, z2 = y * sx + z * cx;
    return [x, y2, z2];
  }
  function slerp(a, b, t) {
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const om = Math.acos(dot), so = Math.sin(om);
    const k1 = Math.sin((1 - t) * om) / so, k2 = Math.sin(t * om) / so;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  }
  FX.journey = { p: 0 };
  function journey(canvas) {
    const ctx = canvas.getContext("2d");
    const pts = fibSphere(innerWidth < 768 ? 4200 : 7000);
    const A = { lat: -33.05, lon: -71.62, tag: "VAP · 33.05°S" }, B = { lat: 60.39, lon: 5.32, tag: "BGO · 60.39°N" };
    const va = toVec(A.lat, A.lon), vb = toVec(B.lat, B.lon);
    let shown = 0;
    loop(canvas, (t) => {
      const { w, h, d } = fit(canvas);
      const p = FX.journey.p; shown += (p - shown) * 0.12;
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.44, cx = w / 2, cy = h / 2;
      // view: start over origin, end over destination
      const rotLon = A.lon + (B.lon - A.lon) * shown + Math.sin(t * 0.2) * 3;
      const rotLat = -(A.lat + (B.lat - A.lat) * shown) * 0.75;
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
      g.addColorStop(0, "rgba(242,242,238,0.05)"); g.addColorStop(1, "rgba(242,242,238,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const q of pts) {
        const v = project(toVec(q.lat, q.lon), rotLon, rotLat);
        if (v[2] < -0.05) continue;
        const sx = cx + v[0] * R, sy = cy - v[1] * R;
        const shade = 0.25 + 0.75 * Math.max(0, v[2]);
        const s = (q.l ? 2.4 : 1.4) * d * (0.6 + 0.4 * v[2]);
        ctx.fillStyle = `rgba(${PAPER},${(q.l ? 1 : 0.34) * shade})`;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
      // arc
      const N = 90, lift = 0.22;
      ctx.beginPath(); ctx.setLineDash([3 * d, 4 * d]); ctx.lineWidth = 1.2 * d; ctx.strokeStyle = `rgba(${PAPER},0.85)`;
      let started = false, head = null;
      for (let i = 0; i <= N * shown; i++) {
        const tt = i / N; const v0 = slerp(va, vb, tt); const k = 1 + lift * Math.sin(Math.PI * tt);
        const v = project([v0[0] * k, v0[1] * k, v0[2] * k], rotLon, rotLat);
        const sx = cx + v[0] * R, sy = cy - v[1] * R;
        if (v[2] < -0.1) { started = false; continue; }
        started ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); started = true; head = [sx, sy];
      }
      ctx.stroke(); ctx.setLineDash([]);
      if (head && shown > 0.01 && shown < 0.99) { ctx.fillStyle = "#f2f2ee"; ctx.fillRect(head[0] - 3 * d, head[1] - 3 * d, 6 * d, 6 * d); }
      // markers
      [[A, va], [B, vb]].forEach(([m, v0], i) => {
        const v = project(v0, rotLon, rotLat);
        if (v[2] < 0) return;
        const sx = cx + v[0] * R, sy = cy - v[1] * R, s = 9 * d;
        ctx.strokeStyle = "#f2f2ee"; ctx.lineWidth = d; ctx.strokeRect(sx - s / 2, sy - s / 2, s, s);
        ctx.fillStyle = "#f2f2ee"; ctx.fillRect(sx - 1.5 * d, sy - 1.5 * d, 3 * d, 3 * d);
        ctx.font = `${10 * d}px "Geist Mono", monospace`; ctx.fillStyle = `rgba(${PAPER},0.85)`;
        ctx.textAlign = i ? "left" : "right";
        ctx.fillText(m.tag, sx + (i ? 1 : -1) * 12 * d, sy + 4 * d);
      });
    }, { always: true });
  }

  /* =====================================================================
     3. Service canvases
     ===================================================================== */
  function hovering(el) { const r = el.getBoundingClientRect(); return pointer.x > r.left && pointer.x < r.right && pointer.y > r.top && pointer.y < r.bottom; }
  function burst(canvas) {
    const ctx = canvas.getContext("2d");
    const rays = Array.from({ length: 420 }, () => ({ a: Math.random() * Math.PI * 2, l: 0.3 + Math.random() * 0.9, s: Math.random() * 0.5 + 0.2, o: Math.random() }));
    let k = 0;
    loop(canvas, (t) => {
      const { w, h, d } = fit(canvas);
      k += ((hovering(canvas) ? 1 : 0) - k) * 0.06;
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
      const pad = Math.min(w, h) * 0.06;
      ctx.save(); ctx.beginPath(); ctx.rect(pad, pad, w - pad * 2, h - pad * 2); ctx.clip();
      const cx = w / 2 + Math.sin(t * 0.4) * 6 * d, cy = h / 2;
      const r0 = Math.min(w, h) * (0.07 + 0.01 * Math.sin(t * 2));
      ctx.lineWidth = d * 0.9;
      for (const r of rays) {
        const L = Math.max(w, h) * r.l * (0.75 + 0.25 * Math.sin(t * r.s * 3 + r.o * 9)) * (1 + k * 0.25);
        const a = r.a + Math.sin(t * 0.2 + r.o * 6) * 0.01;
        ctx.strokeStyle = `rgba(${PAPER},${0.25 + 0.6 * r.o})`;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0 * 1.3, cy + Math.sin(a) * r0 * 1.3); ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.stroke();
      }
      ctx.fillStyle = "#050505"; ctx.beginPath(); ctx.arc(cx, cy, r0 * 1.25, 0, 7); ctx.fill();
      ctx.strokeStyle = "#f2f2ee"; ctx.lineWidth = r0 * 0.38; ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.8, 0, 7); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = `rgba(${PAPER},0.25)`; ctx.lineWidth = d; ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    });
  }
  function waves(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    loop(canvas, (t) => {
      const { w, h, d } = fit(canvas);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
      const lines = opts.lines || 46, top = h * 0.14, gap = (h * 0.95 - top) / lines;
      const hov = hovering(canvas) ? 1.35 : 1;
      ctx.lineWidth = d * 0.9;
      for (let i = 0; i < lines; i++) {
        const y0 = top + i * gap;
        ctx.beginPath();
        const pts = [];
        for (let x = 0; x <= w; x += 4 * d) {
          const u = x / w;
          const env = Math.exp(-Math.pow((u - 0.55) / 0.22, 2)) + 0.4 * Math.exp(-Math.pow((u - 0.25) / 0.1, 2));
          const n = vnoise(u * 7, i * 0.33, t * 0.35) * 0.8 + vnoise(u * 22, i * 0.5, t * 0.6) * 0.25;
          const amp = env * n * gap * 9 * hov * Math.sin(Math.PI * (i + 3) / (lines + 6));
          pts.push([x, y0 - amp]);
        }
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const q of pts) ctx.lineTo(q[0], q[1]);
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        ctx.fillStyle = "#050505"; ctx.fill();
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]);
        ctx.strokeStyle = `rgba(${PAPER},0.85)`; ctx.stroke();
      }
    });
  }
  function pixGlobe(canvas) {
    const ctx = canvas.getContext("2d");
    loop(canvas, (t) => {
      const { w, h, d } = fit(canvas, 1);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
      const cell = Math.round(7 * d), R = h * 0.62, cx = w * 0.36, cy = h * 0.62;
      const rot = t * 10 + (hovering(canvas) ? 30 : 0);
      const lx = -0.5, ly = 0.55, lz = 0.67;
      for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
        const px = (x + cell / 2 - cx) / R, py = (cy - y - cell / 2) / R, r2 = px * px + py * py;
        let lum = 0;
        if (r2 < 1) {
          const pz = Math.sqrt(1 - r2);
          const tilt = 0.35, y2 = py * Math.cos(tilt) + pz * Math.sin(tilt), z2 = -py * Math.sin(tilt) + pz * Math.cos(tilt);
          const lat = Math.asin(y2) / RAD, lon = Math.atan2(px, z2) / RAD + rot;
          const l = land(lat, lon);
          const dif = Math.max(0, px * lx + py * ly + pz * lz);
          lum = (l ? 0.95 : 0.18) * (0.25 + 0.85 * dif);
        } else if (r2 < 1.06) lum = 0.08;
        const ix = (x / cell) | 0, iy = (y / cell) | 0;
        if (lum > FX.bayer(ix, iy)) { ctx.fillStyle = "#f2f2ee"; ctx.fillRect(x + d * 0.5, y + d * 0.5, cell - d, cell - d); }
        else if (ix % 4 === 0 && iy % 4 === 0) { ctx.fillStyle = "rgba(242,242,238,.25)"; ctx.fillRect(x + cell / 2 - d, y + cell / 2 - d, 2 * d, 2 * d); }
      }
    });
  }
  function spiral(canvas) {
    const ctx = canvas.getContext("2d");
    const PHI = 1.6180339887;
    let k = 0;
    loop(canvas, (t) => {
      const { w, h, d, rect } = fit(canvas);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
      const pad = Math.min(w, h) * 0.08;
      ctx.strokeStyle = `rgba(${PAPER},0.25)`; ctx.lineWidth = d;
      // corner ticks
      const tk = 10 * d;
      [[pad, pad, 1, 1], [w - pad, pad, -1, 1], [pad, h - pad, 1, -1], [w - pad, h - pad, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + sy * tk); ctx.lineTo(x, y); ctx.lineTo(x + sx * tk, y); ctx.stroke(); });
      ctx.font = `${9 * d}px "Geist Mono", monospace`; ctx.fillStyle = `rgba(${PAPER},0.45)`;
      ctx.fillText("φ 1.618", pad + 14 * d, pad + 14 * d); ctx.fillText("GRID 8/13", w - pad - 70 * d, h - pad - 8 * d);
      // golden rectangle
      let rw = Math.min((w - pad * 4), (h - pad * 4) * PHI), rh = rw / PHI;
      let x = (w - rw) / 2, y = (h - rh) / 2;
      ctx.strokeStyle = `rgba(${PAPER},0.55)`; ctx.strokeRect(x, y, rw, rh);
      const prog = reduce ? 1 : Math.min(1, (t % 14) / 6);
      let sq = rh, dir = 0, X = x, Y = y, W = rw, H = rh;
      ctx.beginPath();
      const arcs = [];
      for (let i = 0; i < 9; i++) {
        sq = Math.min(W, H);
        let ax, ay, a0;
        if (dir === 0) { ctx.moveTo(X + sq, Y); ctx.lineTo(X + sq, Y + sq); ax = X + sq; ay = Y + sq; a0 = Math.PI; X += sq; W -= sq; }
        else if (dir === 1) { ctx.moveTo(X, Y + sq); ctx.lineTo(X + W, Y + sq); ax = X; ay = Y + sq; a0 = -Math.PI / 2; Y += sq; H -= sq; }
        else if (dir === 2) { ctx.moveTo(X + W - sq, Y); ctx.lineTo(X + W - sq, Y + H); ax = X + W - sq; ay = Y; a0 = 0; W -= sq; }
        else { ctx.moveTo(X, Y + H - sq); ctx.lineTo(X + W, Y + H - sq); ax = X + W; ay = Y + H - sq; a0 = Math.PI / 2; H -= sq; }
        arcs.push([ax, ay, sq, a0]); dir = (dir + 1) % 4;
      }
      ctx.strokeStyle = `rgba(${PAPER},0.3)`; ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = "#f2f2ee"; ctx.lineWidth = 1.4 * d;
      const total = arcs.length;
      arcs.forEach(([ax, ay, r, a0], i) => {
        const f = Math.max(0, Math.min(1, prog * total - i)); if (f <= 0) return;
        ctx.moveTo(ax + Math.cos(a0) * r, ay + Math.sin(a0) * r);
        ctx.arc(ax, ay, r, a0, a0 + (Math.PI / 2) * f);
      });
      ctx.stroke();
      // bezier with control points following the pointer
      k += ((hovering(canvas) ? 1 : 0) - k) * 0.08;
      const mx = (pointer.x - rect.left) * d, my = (pointer.y - rect.top) * d;
      const p0 = [x - pad * 0.2, y + rh + pad * 0.1], p3 = [x + rw + pad * 0.1, y - pad * 0.1];
      let c1 = [x + rw * 0.2, y - rh * 0.1], c2 = [x + rw * 0.55, y + rh * 1.1];
      if (k > 0.01) { c1 = [c1[0] + (mx - c1[0]) * k * 0.6, c1[1] + (my - c1[1]) * k * 0.6]; }
      ctx.strokeStyle = `rgba(${PAPER},0.35)`; ctx.lineWidth = d; ctx.setLineDash([3 * d, 3 * d]);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...c1); ctx.moveTo(...p3); ctx.lineTo(...c2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = "#f2f2ee"; ctx.lineWidth = 1.2 * d; ctx.beginPath(); ctx.moveTo(...p0); ctx.bezierCurveTo(...c1, ...c2, ...p3); ctx.stroke();
      [p0, p3].forEach((q) => { ctx.fillStyle = "#f2f2ee"; ctx.fillRect(q[0] - 3 * d, q[1] - 3 * d, 6 * d, 6 * d); });
      [c1, c2].forEach((q) => { ctx.strokeStyle = "#f2f2ee"; ctx.strokeRect(q[0] - 3 * d, q[1] - 3 * d, 6 * d, 6 * d); });
    });
  }

  /* =====================================================================
     4. PixelImage — 64→1 px resolve, then ordered-dither B/W
     ===================================================================== */
  function pixelImage(wrap) {
    const canvas = wrap.querySelector("canvas"), img = new Image();
    const reveal = wrap.querySelector("img.reveal-img");
    const ctx = canvas.getContext("2d");
    const base = wrap.dataset.pix.split("/").pop();
    img.src = (window.THUMBS && window.THUMBS[base]) || wrap.dataset.pix;
    let done = false, started = false;
    const off = document.createElement("canvas"), octx = off.getContext("2d", { willReadFrequently: true });
    function cover(cw, ch) { const s = Math.max(cw / img.width, ch / img.height); const iw = img.width * s, ih = img.height * s; return [(cw - iw) / 2, 0, iw, ih]; }
    function draw(step) {
      const { w, h } = fit(canvas);
      if (step > 1) {
        const sw = Math.max(1, Math.ceil(w / step)), sh = Math.max(1, Math.ceil(h / step));
        off.width = sw; off.height = sh; octx.filter = "grayscale(1) contrast(1.15)";
        octx.drawImage(img, ...cover(sw, sh));
        ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, w, h); ctx.drawImage(off, 0, 0, w, h);
      } else {
        const cell = Math.max(2, Math.round(3 * DPR()));
        const sw = Math.ceil(w / cell), sh = Math.ceil(h / cell);
        off.width = sw; off.height = sh; octx.filter = "grayscale(1) contrast(1.2) brightness(1.05)";
        octx.drawImage(img, ...cover(sw, sh));
        let data; try { data = octx.getImageData(0, 0, sw, sh).data; } catch (e) { ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, w, h); return; }
        ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#f2f2ee";
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
          const v = data[(y * sw + x) * 4] / 255;
          if (v > FX.bayer(x, y)) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
      }
    }
    function run() {
      if (started) return; started = true;
      const steps = [64, 32, 16, 8, 4, 2, 1]; let i = 0;
      const next = () => { draw(steps[i]); i++; if (i < steps.length) setTimeout(next, reduce ? 0 : 90); else { done = true; if (!matchMedia("(hover:hover)").matches) wrap.dataset.revealed = "true"; } };
      next();
    }
    wrap.replay = () => { started = false; done = false; wrap.dataset.revealed = "false"; run(); };
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting && img.complete && img.naturalWidth) run(); }, { threshold: 0.15 });
    img.onload = () => io.observe(wrap);
    if (img.complete && img.naturalWidth) io.observe(wrap);
    addEventListener("resize", () => { if (done) draw(1); });
    wrap.addEventListener("pointermove", (e) => {
      const r = wrap.getBoundingClientRect();
      if (reveal) { reveal.style.setProperty("--rx", ((e.clientX - r.left) / r.width) * 100 + "%"); reveal.style.setProperty("--ry", ((e.clientY - r.top) / r.height) * 100 + "%"); }
    });
  }

  /* =====================================================================
     5. Case-study diagrams
     ===================================================================== */
  function dotGrid(ctx, w, h, d, step = 18) {
    ctx.fillStyle = "rgba(242,242,238,.16)";
    for (let y = step * d; y < h; y += step * d) for (let x = step * d; x < w; x += step * d) ctx.fillRect(x, y, d, d);
  }
  function box(ctx, x, y, bw, bh, d, label, sub, fill) {
    ctx.fillStyle = fill ? "#f2f2ee" : "#050505"; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
    ctx.strokeStyle = fill ? "#f2f2ee" : "rgba(242,242,238,.6)"; ctx.lineWidth = d; ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
    ctx.textAlign = "center"; ctx.fillStyle = fill ? "#050505" : "#f2f2ee";
    ctx.font = `${11 * d}px "Geist Mono", monospace`; ctx.fillText(label.toUpperCase().split("").join(String.fromCharCode(8202)), x, y + (sub ? -2 * d : 4 * d));
    if (sub) { ctx.font = `${8 * d}px "Geist Mono", monospace`; ctx.fillStyle = fill ? "rgba(5,5,5,.6)" : "rgba(242,242,238,.55)"; ctx.fillText(sub.toUpperCase(), x, y + 11 * d); }
  }
  function diagram(el) {
    const canvas = el.querySelector("canvas"), ctx = canvas.getContext("2d");
    const nodes = JSON.parse(el.dataset.nodes || "[]").map((s) => s.split("|"));
    loop(canvas, (t) => {
      const { w, h, d } = fit(canvas);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h); dotGrid(ctx, w, h, d);
      const cx = w / 2, cy = h * 0.42;
      const main = [[cx, h * 0.14, nodes[0]], [cx - w * 0.3, cy, nodes[1]], [cx + w * 0.3, cy, nodes[3]]];
      const deps = nodes.slice(4).map((n, i, a) => [cx + (i - (a.length - 1) / 2) * w * 0.2, h * 0.82, n]);
      const links = main.map((m) => m).concat(deps);
      ctx.setLineDash([3 * d, 4 * d]); ctx.strokeStyle = "rgba(242,242,238,.45)"; ctx.lineWidth = d;
      links.forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); });
      ctx.setLineDash([]);
      links.forEach(([x, y], i) => { const f = (t * 0.35 + i * 0.17) % 1; ctx.fillStyle = "#f2f2ee"; ctx.fillRect(cx + (x - cx) * f - 2 * d, cy + (y - cy) * f - 2 * d, 4 * d, 4 * d); });
      main.forEach(([x, y, n]) => box(ctx, x, y, 150 * d, 44 * d, d, n[0], n[1]));
      deps.forEach(([x, y, n]) => box(ctx, x, y, 96 * d, 30 * d, d, n[0]));
      box(ctx, cx, cy, 170 * d, 52 * d, d, nodes[2][0], nodes[2][1], true);
    });
  }
  function pipeline(el) {
    const canvas = el.querySelector("canvas"), ctx = canvas.getContext("2d");
    const steps = [["Branch", "feature/…"], ["Pull request", "review"], ["CI", "tests · scan"], ["Main", "protected"], ["Azure", "deploy"]];
    const subs = ["Rules", "Roles", "Secrets", "Copilot"];
    loop(canvas, (t) => {
      const { w, h, d } = fit(canvas);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h); dotGrid(ctx, w, h, d);
      const n = steps.length, gap = w / (n + 0.2), y = h * 0.35;
      const active = Math.floor(t * 0.8) % n;
      steps.forEach(([a, b], i) => {
        const x = gap * (i + 0.6);
        if (i < n - 1) { ctx.strokeStyle = "rgba(242,242,238,.6)"; ctx.lineWidth = d; ctx.beginPath(); ctx.moveTo(x + 62 * d, y); ctx.lineTo(x + gap - 66 * d, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + gap - 70 * d, y - 4 * d); ctx.lineTo(x + gap - 64 * d, y); ctx.lineTo(x + gap - 70 * d, y + 4 * d); ctx.stroke(); }
        if (i < subs.length) { ctx.setLineDash([3 * d, 3 * d]); ctx.beginPath(); ctx.moveTo(x, y + 26 * d); ctx.lineTo(x, h * 0.74); ctx.stroke(); ctx.setLineDash([]); box(ctx, x, h * 0.8, 74 * d, 24 * d, d, subs[i]); }
        box(ctx, x, y, 124 * d, 48 * d, d, a, b, i === active || i === n - 1);
      });
    });
  }
  function noise404(canvas) {
    const ctx = canvas.getContext("2d");
    loop(canvas, (t) => {
      const { w, h, d } = fit(canvas, 1);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
      const cell = Math.round(8 * d); ctx.fillStyle = "#f2f2ee";
      const mx = pointer.x * d, my = pointer.y * d;
      for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
        let v = vnoise(x / w * 4, y / h * 3, t * 0.25) * 0.55 - 0.18;
        const dd = Math.hypot(x - mx, y - my); v += Math.max(0, 0.4 - dd / (300 * d));
        if (v > FX.bayer((x / cell) | 0, (y / cell) | 0)) ctx.fillRect(x, y, cell - d, cell - d);
      }
    });
  }

  /* ---------- boot ---------- */
  const MAP = { dither, journey, burst, waves, globe: pixGlobe, spiral, noise404 };
  FX.init = function (root = document) {
    root.querySelectorAll("[data-fx]").forEach((el) => {
      if (el.__fx) return; el.__fx = 1;
      const name = el.dataset.fx;
      const canvas = el.tagName === "CANVAS" ? el : el.querySelector("canvas");
      if (name === "diagram") return diagram(el);
      if (name === "pipeline") return pipeline(el);
      if (MAP[name] && canvas) MAP[name](canvas);
    });
    root.querySelectorAll("[data-pix]").forEach((el) => { if (!el.__fx) { el.__fx = 1; pixelImage(el); } });
  };
})();
