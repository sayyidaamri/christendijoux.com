/* lab.js — the four experiments on lab.html. Each runs only while visible. */
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DPR = () => Math.min(devicePixelRatio || 1, 2);
  function fit(c, s = 1) { const r = c.getBoundingClientRect(), d = DPR() * s; const w = Math.round(r.width * d), h = Math.round(r.height * d); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return { w, h, d, r }; }
  function live(el, fn) { let raf = 0, on = false; const t = (n) => { fn(n / 1000); if (on) raf = requestAnimationFrame(t); }; new IntersectionObserver(([e]) => { on = e.isIntersecting && !reduce; cancelAnimationFrame(raf); if (on) raf = requestAnimationFrame(t); else fn(performance.now() / 1000); }).observe(el); }
  function local(stage, e) { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }

  /* ---- E-01 Gray-Scott reaction–diffusion (CPU, typed arrays) ---- */
  function rd(stage) {
    const cv = stage.querySelector("canvas"), ctx = cv.getContext("2d");
    const N = 180, M = 135; let A = new Float32Array(N * M), B = new Float32Array(N * M), A2 = new Float32Array(N * M), B2 = new Float32Array(N * M);
    const presets = [[0.0545, 0.062], [0.0367, 0.0649], [0.029, 0.057]]; let [F, K] = presets[0];
    const img = ctx.createImageData(N, M); const off = document.createElement("canvas"); off.width = N; off.height = M; const octx = off.getContext("2d");
    const seed = (x, y, r = 4) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const X = (x + i + N) % N, Y = (y + j + M) % M; if (i * i + j * j <= r * r) B[Y * N + X] = 1; } };
    const reset = () => { A.fill(1); B.fill(0); for (let k = 0; k < 14; k++) seed((Math.random() * N) | 0, (Math.random() * M) | 0, 3 + ((Math.random() * 4) | 0)); };
    reset();
    const step = () => {
      for (let y = 0; y < M; y++) {
        const yu = ((y - 1 + M) % M) * N, yd = ((y + 1) % M) * N, yc = y * N;
        for (let x = 0; x < N; x++) {
          const xl = (x - 1 + N) % N, xr = (x + 1) % N, i = yc + x;
          const a = A[i], b = B[i];
          const la = (A[yc + xl] + A[yc + xr] + A[yu + x] + A[yd + x]) * 0.2 + (A[yu + xl] + A[yu + xr] + A[yd + xl] + A[yd + xr]) * 0.05 - a;
          const lb = (B[yc + xl] + B[yc + xr] + B[yu + x] + B[yd + x]) * 0.2 + (B[yu + xl] + B[yu + xr] + B[yd + xl] + B[yd + xr]) * 0.05 - b;
          const abb = a * b * b;
          A2[i] = a + (1.0 * la - abb + F * (1 - a)); B2[i] = b + (0.5 * lb + abb - (K + F) * b);
        }
      }
      [A, A2] = [A2, A]; [B, B2] = [B2, B];
    };
    let down = false;
    stage.addEventListener("pointerdown", (e) => { down = true; stage.setPointerCapture(e.pointerId); const [u, v] = local(stage, e); seed((u * N) | 0, (v * M) | 0, 5); });
    stage.addEventListener("pointermove", (e) => { if (!down) return; const [u, v] = local(stage, e); seed((u * N) | 0, (v * M) | 0, 3); });
    stage.addEventListener("pointerup", () => (down = false));
    stage.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); [F, K] = presets[+b.dataset.preset]; stage.querySelectorAll("[data-preset]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); reset(); }));
    stage.querySelector("[data-reset]").addEventListener("click", (e) => { e.stopPropagation(); reset(); });
    stage.querySelectorAll(".ctrl").forEach((c) => c.addEventListener("pointerdown", (e) => e.stopPropagation()));
    live(stage, () => {
      for (let k = 0; k < 10; k++) step();
      const d = img.data;
      for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) { const i = y * N + x; const v = Math.min(1, Math.max(0, (A[i] - B[i]) * 1.2)); const on = 1 - v > window.FX.bayer(x, y) * 0.9 + 0.08; const o = i * 4; const c = on ? 242 : 5; d[o] = c; d[o + 1] = c; d[o + 2] = on ? 238 : 5; d[o + 3] = 255; }
      octx.putImageData(img, 0, 0);
      const { w, h } = fit(cv); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, w, h);
    });
  }

  /* ---- E-02 Type as matter ---- */
  function typeMatter(stage) {
    const cv = stage.querySelector("canvas"), ctx = cv.getContext("2d"), input = document.querySelector("[data-tam-word]");
    let P = [], mx = -1e4, my = -1e4, W = 0, H = 0;
    const build = () => {
      const { w, h, d } = fit(cv); W = w; H = h;
      const off = document.createElement("canvas"); off.width = w; off.height = h; const o = off.getContext("2d");
      const word = (input.value || "LAB").toUpperCase().slice(0, 10);
      let fs = h * 0.62; o.font = `800 ${fs}px "Big Shoulders Display", sans-serif`;
      while (o.measureText(word).width > w * 0.84) { fs *= 0.92; o.font = `800 ${fs}px "Big Shoulders Display", sans-serif`; }
      o.textAlign = "center"; o.textBaseline = "middle"; o.fillStyle = "#fff"; o.fillText(word, w / 2, h / 2 + fs * 0.04);
      const data = o.getImageData(0, 0, w, h).data, st = Math.round(5 * d), np = [];
      for (let y = 0; y < h; y += st) for (let x = 0; x < w; x += st) if (data[(y * w + x) * 4 + 3] > 128) np.push(x, y);
      const old = P; P = [];
      for (let i = 0; i < np.length; i += 2) { const q = old[(i / 2) | 0]; P.push({ hx: np[i], hy: np[i + 1], x: q ? q.x : Math.random() * w, y: q ? q.y : Math.random() * h, vx: 0, vy: 0 }); }
    };
    document.fonts.ready.then(build); addEventListener("resize", build); input.addEventListener("input", build);
    stage.addEventListener("pointermove", (e) => { const r = stage.getBoundingClientRect(), d = DPR(); mx = (e.clientX - r.left) * d; my = (e.clientY - r.top) * d; });
    stage.addEventListener("pointerleave", () => { mx = my = -1e4; });
    stage.addEventListener("click", (e) => { if (e.target.closest(".ctrl")) return; P.forEach((p) => { const a = Math.random() * 6.28, s = 10 + Math.random() * 30; p.vx += Math.cos(a) * s; p.vy += Math.sin(a) * s; }); });
    live(stage, () => {
      if (!P.length) return; const d = DPR(), R = 90 * d;
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#f2f2ee";
      for (const p of P) {
        const dx = p.x - mx, dy = p.y - my, dd = Math.hypot(dx, dy);
        if (dd < R) { const f = (1 - dd / R) * 6; p.vx += (dx / (dd || 1)) * f; p.vy += (dy / (dd || 1)) * f; }
        p.vx += (p.hx - p.x) * 0.045; p.vy += (p.hy - p.y) * 0.045; p.vx *= 0.86; p.vy *= 0.86; p.x += p.vx; p.y += p.vy;
        const s = 2.6 * d; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    });
  }

  /* ---- E-03 Flow field ---- */
  function flow(stage) {
    const cv = stage.querySelector("canvas"), ctx = cv.getContext("2d"), noise = window.FX.noise;
    let P = [], mx = -1e4, my = -1e4, W = 0, H = 0;
    const init = () => { const { w, h } = fit(cv); W = w; H = h; ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h); P = Array.from({ length: Math.round((w * h) / 260) }, () => ({ x: Math.random() * w, y: Math.random() * h, l: Math.random() * 200 })); };
    init(); addEventListener("resize", init);
    stage.addEventListener("pointermove", (e) => { const r = stage.getBoundingClientRect(), d = DPR(); mx = (e.clientX - r.left) * d; my = (e.clientY - r.top) * d; });
    stage.addEventListener("pointerleave", () => { mx = my = -1e4; });
    live(stage, (t) => {
      const d = DPR();
      ctx.fillStyle = "rgba(5,5,5,0.06)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(242,242,238,0.55)";
      for (const p of P) {
        let a = noise(p.x / (160 * d), p.y / (160 * d), t * 0.12) * Math.PI * 4;
        const dx = p.x - mx, dy = p.y - my, dd = Math.hypot(dx, dy);
        let vx = Math.cos(a), vy = Math.sin(a);
        if (dd < 140 * d) { const f = 1 - dd / (140 * d); vx += (-dy / dd) * f * 3; vy += (dx / dd) * f * 3; }
        p.x += vx * 1.4 * d; p.y += vy * 1.4 * d; p.l--;
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H || p.l < 0) { p.x = Math.random() * W; p.y = Math.random() * H; p.l = 100 + Math.random() * 200; }
        ctx.fillRect(p.x, p.y, d, d);
      }
    });
  }

  /* ---- E-04 ASCII globe ---- */
  function ascii(stage) {
    const cv = stage.querySelector("canvas"), ctx = cv.getContext("2d"); const RAMP = " .:-=+*#%@"; const RAD = Math.PI / 180;
    live(stage, (t) => {
      const { w, h, d } = fit(cv); ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
      const cs = Math.round(9 * d), R = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2;
      ctx.font = `${cs * 1.1}px "Geist Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let y = 0; y < h; y += cs * 1.25) for (let x = 0; x < w; x += cs) {
        const px = (x - cx) / R, py = (cy - y) / R, r2 = px * px + py * py; if (r2 > 1) continue;
        const pz = Math.sqrt(1 - r2), tilt = 0.3; const y2 = py * Math.cos(tilt) + pz * Math.sin(tilt), z2 = -py * Math.sin(tilt) + pz * Math.cos(tilt);
        const lat = Math.asin(y2) / RAD, lon = Math.atan2(px, z2) / RAD + t * 14;
        const l = window.FX.land(lat, lon); const dif = Math.max(0, -px * 0.5 + py * 0.4 + pz * 0.75);
        const v = (l ? 0.55 + 0.45 * dif : 0.12 + 0.2 * dif);
        const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
        ctx.fillStyle = `rgba(242,242,238,${l ? 0.95 : 0.45})`; ctx.fillText(ch, x, y);
      }
    });
  }

  const MAP = { rd, type: typeMatter, flow, ascii };
  document.querySelectorAll("[data-exp]").forEach((s) => MAP[s.dataset.exp] && MAP[s.dataset.exp](s));
})();
