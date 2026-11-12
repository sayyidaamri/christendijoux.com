/* =========================================================================
   app.js — site chrome & interactions (vanilla, no dependencies)
   ========================================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const page = html.dataset.page;
  const pointer = (window.__pointer = window.__pointer || { x: -9999, y: -9999 });
  addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- i18n (UI strings) ---------------- */
  const FR = {
    "nav.about": "À propos", "nav.projects": "Projets", "nav.lab": "Lab", "nav.contact": "Contact",
    "ui.menu": "Menu", "ui.assistant": "Assistant", "ui.seeProjects": "Voir les projets", "ui.getInTouch": "Me contacter", "foot.projects": "Projets",
  };
  const lang = store.get("kr-lang", "en");
  function applyLang(l) {
    html.lang = l;
    $$("[data-i18n]").forEach((el) => { const k = el.dataset.i18n; if (!el.dataset.en) el.dataset.en = el.textContent; el.textContent = l === "fr" && FR[k] ? FR[k] : el.dataset.en; });
    $$("[data-lang-toggle] span").forEach((s) => s.classList.toggle("on", s.dataset.l === l));
  }
  applyLang(lang);
  $$("[data-lang-toggle]").forEach((b) => b.addEventListener("click", () => {
    const n = html.lang === "fr" ? "en" : "fr"; store.set("kr-lang", n); applyLang(n);
    toast(n === "fr" ? "Interface en français (contenu en anglais)" : "Interface in English");
  }));

  /* ---------------- smooth scroll (lerped wheel) ---------------- */
  const S = (window.__scroll = { y: scrollY, target: scrollY, v: 0, active: false, stopped: false });
  const smooth = fine && !reduce;
  function maxY() { return document.documentElement.scrollHeight - innerHeight; }
  if (smooth) {
    addEventListener("wheel", (e) => {
      if (e.ctrlKey || S.stopped) return;
      if (e.target.closest && e.target.closest(".chat-body, .no-lenis, textarea")) return;
      e.preventDefault();
      if (!S.active) { S.y = scrollY; S.target = scrollY; }
      const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
      S.target = clamp(S.target + dy, 0, maxY()); S.active = true;
    }, { passive: false });
  }
  S.scrollTo = function (y, immediate) {
    y = clamp(y, 0, maxY());
    if (!smooth || immediate || reduce) { S.active = false; scrollTo(0, y); return; }
    if (!S.active) S.y = scrollY;
    S.target = y; S.active = true; S.duration = true;
  };
  let lastY = scrollY;
  function frame() {
    if (S.active) {
      const k = S.duration ? 0.085 : 0.1;
      S.y += (S.target - S.y) * k;
      if (Math.abs(S.target - S.y) < 0.5) { S.y = S.target; S.active = false; S.duration = false; }
      scrollTo(0, S.y);
    }
    const y = scrollY; S.v = S.v * 0.8 + (y - lastY) * 0.2; lastY = y;
    tickers.forEach((f) => f(y));
    requestAnimationFrame(frame);
  }
  const tickers = [];
  requestAnimationFrame(frame);
  addEventListener("keydown", () => { S.active = false; });
  addEventListener("pointerdown", () => { if (S.active && !S.duration) S.active = false; });

  /* anchor links */
  function headerH() { return $(".site-header")?.offsetHeight || 64; }
  function goHash(hash, immediate) {
    const el = hash && hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (!el) return false;
    let y = el.getBoundingClientRect().top + scrollY - (el.id === "projects" || el.closest("[data-hpin]") ? 0 : headerH() - 1);
    if (el.id === "about") y = el.getBoundingClientRect().top + scrollY - headerH();
    S.scrollTo(y, immediate);
    return true;
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]"); if (!a) return;
    const href = a.getAttribute("href");
    if (href.startsWith("#") && href.length > 1) {
      if (goHash(href)) { e.preventDefault(); history.replaceState(null, "", href); closeMenu(); }
    }
  });

  /* ---------------- preloader / boot ---------------- */
  const shell = $("#shell");
  let booted = false;
  const onBoot = [];
  function boot() {
    if (booted) return; booted = true;
    html.classList.add("booted");
    try { sessionStorage.setItem("kr-booted", "1"); } catch (e) {}
    onBoot.forEach((f) => f());
    if (location.hash) setTimeout(() => goHash(location.hash, true), 60);
  }
  const returning = html.classList.contains("returning");
  if (!returning && shell && !reduce) {
    const log = $("#shell-log"), count = $("#shell-count"), bar = $("#shell-bar");
    const steps = ["init renderer", "load typefaces", "compile dither shader", "sync scroll engine", "ready"];
    let n = 0; const t0 = performance.now(); const dur = 1700;
    const tick = () => {
      const p = clamp((performance.now() - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 2.2);
      n = Math.round(e * 100);
      count.textContent = String(n).padStart(3, "0"); bar.style.transform = `scaleX(${e})`;
      const want = Math.min(steps.length, Math.floor(p * 5.2) + (p > 0.15 ? 1 : 0));
      while (log.children.length < want) {
        const i = log.children.length;
        const li = document.createElement("li"); li.innerHTML = `<span>${steps[i]}</span><b>_</b>`; log.appendChild(li);
        if (i > 0) log.children[i - 1].querySelector("b").textContent = "ok";
      }
      if (p < 1) requestAnimationFrame(tick);
      else {
        log.lastChild && (log.lastChild.querySelector("b").textContent = "ok");
        setTimeout(() => { shell.classList.add("dim"); }, 250);
        setTimeout(() => { shell.classList.add("out"); boot(); }, 650);
        setTimeout(() => shell.remove(), 1400);
      }
    };
    document.fonts && document.fonts.ready.then(() => requestAnimationFrame(tick)).catch(() => requestAnimationFrame(tick));
    setTimeout(() => { if (!booted && n === 0) requestAnimationFrame(tick); }, 800);
  } else {
    if (shell) shell.remove();
    const cb = $(".curtain-b");
    if (cb && !reduce) {
      $("[data-curtain-label]").textContent = ({ home: "Index", projects: "Projects", project: "Case study", lab: "Lab", cv: "Resume", privacy: "Privacy", legal: "Legal", "404": "404" })[page] || "Index";
      cb.classList.add("on");
      requestAnimationFrame(() => requestAnimationFrame(() => { cb.classList.add("anim"); cb.classList.remove("on"); }));
      setTimeout(boot, 250);
    } else boot();
  }

  /* ---------------- page transitions ---------------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]"); if (!a || e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target === "_blank" || a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || /^https?:/.test(href)) return;
    const url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.hash) return;
    if (reduce) return;
    e.preventDefault();
    const ca = $(".curtain-a");
    ca.classList.add("anim"); requestAnimationFrame(() => ca.classList.add("on"));
    setTimeout(() => (location.href = a.href), 650);
  });
  addEventListener("pageshow", (e) => { if (e.persisted) { const ca = $(".curtain-a"); ca && ca.classList.remove("on", "anim"); } });

  /* ---------------- split text, reveals ---------------- */
  $$("[data-split]").forEach((el) => (el.dataset.splitState = "ready"));
  const inIO = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); inIO.unobserve(en.target); } }), { threshold: 0.15, rootMargin: "0px 0px -5% 0px" });
  onBoot.push(() => {
    $$("[data-split], .reveal").forEach((el) => {
      if (el.closest(".hero")) { setTimeout(() => el.classList.add("is-in"), 250); return; }
      inIO.observe(el);
    });
  });

  /* proximity weight (variable font) */
  if (fine && !reduce) {
    $$(".prox").forEach((el) => {
      const [mn, mx] = (el.dataset.prox || "300,700").split(",").map(Number);
      const chars = $$(".char", el); let raf = 0, cur = chars.map(() => mn), idle = 0;
      const R = Math.max(160, innerWidth * 0.14);
      const step = () => {
        let moving = false;
        const rects = chars.map((c) => c.getBoundingClientRect());
        chars.forEach((c, i) => {
          const r = rects[i]; const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
          const f = clamp(1 - Math.hypot(dx, dy) / R, 0, 1);
          const target = mn + (mx - mn) * f * f;
          const nv = cur[i] + (target - cur[i]) * 0.18;
          if (Math.abs(nv - cur[i]) > 0.3) moving = true;
          cur[i] = nv; c.style.setProperty("--w", nv.toFixed(1));
        });
        if (moving || idle++ < 10) raf = requestAnimationFrame(step); else raf = 0;
      };
      addEventListener("pointermove", () => { idle = 0; if (!raf) raf = requestAnimationFrame(step); }, { passive: true });
      chars.forEach((c) => c.style.setProperty("--w", mn));
    });
  }

  /* scroll words */
  const sw = $$("[data-scrollwords]").map((el) => ({ el, w: $$(".word", el) }));
  if (sw.length) tickers.push(() => sw.forEach(({ el, w }) => {
    const r = el.getBoundingClientRect();
    const p = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35), 0, 1);
    const n = Math.round(p * w.length);
    w.forEach((x, i) => x.classList.toggle("on", i < n));
  }));

  /* ---------------- marquee ---------------- */
  $$("[data-marquee]").forEach((m) => {
    let x = 0, dir = -1, skew = 0;
    const setW = () => m.firstElementChild.offsetWidth;
    let W = setW(); addEventListener("resize", () => (W = setW()));
    let vis = false; new IntersectionObserver(([e]) => (vis = e.isIntersecting)).observe(m);
    const run = () => {
      if (vis) {
        const v = S.v;
        if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
        x += dir * (0.6 + Math.min(18, Math.abs(v) * 0.6));
        if (x <= -W) x += W; if (x > 0) x -= W;
        skew += (clamp(-v * 0.25, -12, 12) - skew) * 0.12;
        m.style.transform = `translate3d(${x}px,0,0) skewX(${reduce ? 0 : skew}deg)`;
      }
      requestAnimationFrame(run);
    };
    if (!reduce) requestAnimationFrame(run);
  });

  /* ---------------- header: active section ---------------- */
  if (page === "home") {
    const secs = ["about", "projects", "lab", "contact"].map((id) => document.getElementById(id)).filter(Boolean);
    const links = $$(".nav-list a[data-nav]");
    tickers.push(() => {
      let cur = null; const mid = innerHeight * 0.4;
      secs.forEach((s) => { const host = s.closest("[data-hpin]") || s; const r = host.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) cur = s.id; });
      links.forEach((a) => a.classList.toggle("active", a.dataset.nav === cur));
    });
  }

  /* ---------------- clock ---------------- */
  const clock = $("[data-clock]");
  if (clock) {
    const upd = () => {
      let hh = "00", mm = "00";
      try { const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Oslo" }).formatToParts(new Date()); hh = parts.find((p) => p.type === "hour").value; mm = parts.find((p) => p.type === "minute").value; } catch (e) { const d = new Date(); hh = String(d.getHours()).padStart(2, "0"); mm = String(d.getMinutes()).padStart(2, "0"); }
      clock.children[0].textContent = hh; clock.children[2].textContent = mm;
    };
    upd(); setInterval(upd, 15000);
  }

  /* ---------------- custom cursor ---------------- */
  if (fine && !reduce) {
    html.classList.add("has-cursor");
    const ring = $(".cursor-ring"), dot = $(".cursor-dot"), label = $(".cursor-label");
    let rx = innerWidth / 2, ry = innerHeight / 2, dx = rx, dy = ry, shown = false;
    const run = () => {
      if (pointer.x > -999) {
        if (!shown) { rx = dx = pointer.x; ry = dy = pointer.y; shown = true; }
        dx += (pointer.x - dx) * 0.6; dy += (pointer.y - dy) * 0.6;
        rx += (pointer.x - rx) * 0.16; ry += (pointer.y - ry) * 0.16;
        dot.style.transform = `translate3d(${dx}px,${dy}px,0)`; ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      }
      requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-cursor], a, button, input, textarea, label, [role=button]");
      if (!t) { ring.dataset.state = ""; return; }
      if (t.dataset.cursor) { ring.dataset.state = "label"; label.textContent = t.dataset.cursor; }
      else if (t.matches("input, textarea")) ring.dataset.state = "";
      else ring.dataset.state = "hover";
    });
    document.addEventListener("pointerleave", () => { dot.style.opacity = ring.style.opacity = 0; });
    document.addEventListener("pointerenter", () => { dot.style.opacity = ring.style.opacity = 1; });
    // magnetic
    $$("[data-magnetic]").forEach((el) => {
      el.addEventListener("pointermove", (e) => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px,${(e.clientY - r.top - r.height / 2) * 0.35}px)`; });
      el.addEventListener("pointerleave", () => { el.style.transition = "transform .5s cubic-bezier(.16,1,.3,1), background-color .2s, color .2s"; el.style.transform = ""; setTimeout(() => (el.style.transition = ""), 500); });
    });
  }

  /* ---------------- mobile menu ---------------- */
  const menuBtn = $("[data-menu]"), mnav = $("#mobile-nav");
  function closeMenu() { if (!mnav || !mnav.classList.contains("open")) return; mnav.classList.remove("open"); mnav.setAttribute("aria-hidden", "true"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.textContent = "Menu"; menuBtn.removeAttribute("aria-label"); document.body.classList.remove("menu-open"); }
  menuBtn && menuBtn.addEventListener("click", () => {
    const open = !mnav.classList.contains("open");
    if (!open) return closeMenu();
    mnav.classList.add("open"); mnav.setAttribute("aria-hidden", "false"); menuBtn.setAttribute("aria-expanded", "true"); menuBtn.textContent = "×"; menuBtn.setAttribute("aria-label", "Close menu"); document.body.classList.add("menu-open");
  });
  mnav && mnav.addEventListener("click", (e) => { if (e.target.closest("a")) setTimeout(closeMenu, 50); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); closeChat(); closeGame(); } });

  /* ---------------- toast ---------------- */
  const toastEl = $("[data-toast]"); let toastT;
  function toast(msg) { if (!toastEl) return; $("[data-toast-text]").textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 3200); }
  window.toast = toast;

  /* ---------------- cookie banner ---------------- */
  const cookie = $("[data-cookie]");
  if (cookie) {
    const choice = store.get("kr-cookies", null);
    onBoot.push(() => { if (choice === null) setTimeout(() => cookie.classList.add("show"), 900); });
    const set = (v) => { store.set("kr-cookies", v); cookie.classList.remove("show"); toast(v ? "Cookies accepted — thanks" : "Only necessary storage is used"); };
    $("[data-cookie-yes]").addEventListener("click", () => set(true));
    $("[data-cookie-no]").addEventListener("click", () => set(false));
    $$("[data-cookie-open]").forEach((b) => b.addEventListener("click", () => cookie.classList.add("show")));
  }

  /* ---------------- stars + game ---------------- */
  const STAR_IDS = ["hero", "form", "footer"];
  let found = store.get("kr-stars", []);
  function renderStars() {
    $$("[data-star]").forEach((b) => b.setAttribute("aria-pressed", String(found.includes(b.dataset.star))));
    $$("[data-star-count]").forEach((s) => (s.textContent = `${found.length} / 3 stars found`));
  }
  renderStars();
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-star]"); if (!b) return;
    const id = b.dataset.star;
    if (found.includes(id)) { if (found.length === 3) openGame(); else toast(`Already found · ${found.length} / 3`); return; }
    found.push(id); store.set("kr-stars", found); renderStars(); sfx(880);
    b.animate([{ transform: "scale(1)" }, { transform: "scale(1.6) rotate(72deg)" }, { transform: "scale(1)" }], { duration: 600, easing: "cubic-bezier(.34,1.56,.64,1)" });
    if (found.length === 3) { toast("✦ All 3 stars found — StarGame unlocked!"); setTimeout(openGame, 1200); }
    else toast(`Star found · ${found.length} / 3 — ${["", "one near the contact form?", "the footer hides one too…"][found.length] || "keep looking"}`);
  });
  function sfx(freq) {
    try { const A = window.__ac || (window.__ac = new (window.AudioContext || window.webkitAudioContext)()); const o = A.createOscillator(), g = A.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(freq, A.currentTime); o.frequency.exponentialRampToValueAtTime(freq * 2, A.currentTime + 0.12); g.gain.setValueAtTime(0.08, A.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + 0.35); o.connect(g).connect(A.destination); o.start(); o.stop(A.currentTime + 0.4); } catch (e) {}
  }
  const game = $("[data-game]"); let gameStop = null;
  function openGame() { if (!game) return; game.classList.add("open"); S.stopped = true; gameStop = runGame($("[data-game-canvas]")); }
  function closeGame() { if (!game || !game.classList.contains("open")) return; game.classList.remove("open"); S.stopped = false; gameStop && gameStop(); }
  game && $("[data-game-close]").addEventListener("click", closeGame);
  game && game.addEventListener("click", (e) => { if (e.target === game) closeGame(); });
  function runGame(cv) {
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    let px = W / 2, score = 0, lives = 3, items = [], t = 0, raf, keys = {}, over = false;
    const kd = (e) => (keys[e.key] = true), ku = (e) => (keys[e.key] = false);
    addEventListener("keydown", kd); addEventListener("keyup", ku);
    const pm = (e) => { const r = cv.getBoundingClientRect(); px = ((e.clientX - r.left) / r.width) * W; };
    cv.addEventListener("pointermove", pm);
    const scoreEl = $("[data-game-score]");
    const star = (x, y, r) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); };
    const loop = () => {
      t++;
      if (!over) {
        if (keys.ArrowLeft) px -= 12; if (keys.ArrowRight) px += 12; px = clamp(px, 40, W - 40);
        if (t % Math.max(14, 40 - (score >> 2)) === 0) items.push({ x: 30 + Math.random() * (W - 60), y: -20, v: 3 + Math.random() * 3 + score * 0.04, bad: Math.random() < 0.22 });
        items.forEach((it) => (it.y += it.v));
        items = items.filter((it) => {
          if (it.y > H - 60 && it.y < H - 20 && Math.abs(it.x - px) < 52) { if (it.bad) { lives--; sfx(160); } else { score++; sfx(660 + score * 4); } return false; }
          if (it.y > H + 20) { if (!it.bad) lives -= 0; return false; }
          return true;
        });
        if (lives <= 0) over = true;
      }
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(242,242,238,.12)"; for (let y = 24; y < H; y += 32) for (let x = 24; x < W; x += 32) ctx.fillRect(x, y, 2, 2);
      items.forEach((it) => { if (it.bad) { ctx.strokeStyle = "#f2f2ee"; ctx.lineWidth = 2; ctx.strokeRect(it.x - 10, it.y - 10, 20, 20); ctx.beginPath(); ctx.moveTo(it.x - 10, it.y - 10); ctx.lineTo(it.x + 10, it.y + 10); ctx.stroke(); } else { ctx.fillStyle = "#f2f2ee"; star(it.x, it.y, 14); ctx.fill(); } });
      ctx.fillStyle = "#f2f2ee"; ctx.fillRect(px - 50, H - 40, 100, 8); ctx.fillRect(px - 50, H - 52, 4, 12); ctx.fillRect(px + 46, H - 52, 4, 12);
      ctx.font = '20px "Geist Mono", monospace'; ctx.fillText("♥".repeat(Math.max(0, lives)), 24, 40);
      if (over) { ctx.textAlign = "center"; ctx.font = '300 96px "Big Shoulders Display"'; ctx.fillText("GAME OVER", W / 2, H / 2); ctx.font = '14px "Geist Mono", monospace'; ctx.fillText("CLICK TO PLAY AGAIN", W / 2, H / 2 + 40); ctx.textAlign = "left"; }
      scoreEl.textContent = "Score " + String(score).padStart(3, "0");
      raf = requestAnimationFrame(loop);
    };
    const restart = () => { if (over) { over = false; score = 0; lives = 3; items = []; } };
    cv.addEventListener("click", restart);
    loop();
    return () => { cancelAnimationFrame(raf); removeEventListener("keydown", kd); removeEventListener("keyup", ku); cv.removeEventListener("pointermove", pm); cv.removeEventListener("click", restart); };
  }

  /* ---------------- negative mode ---------------- */
  function flipNegative(x, y) {
    const go = () => html.classList.toggle("negative");
    if (!document.startViewTransition || reduce) return go();
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(go);
    vt.ready.then(() => html.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 900, easing: "cubic-bezier(.76,0,.24,1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
  }
  window.flipNegative = flipNegative;
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]; let kpos = 0;
  addEventListener("keydown", (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; kpos = k === KONAMI[kpos] ? kpos + 1 : k === KONAMI[0] ? 1 : 0; if (kpos === KONAMI.length) { kpos = 0; flipNegative(innerWidth / 2, innerHeight / 2); toast("◐ Negative mode"); } });
  let taps = [];
  $$("[data-mono]").forEach((m) => m.addEventListener("click", (e) => {
    if (fine) return;
    const now = Date.now(); taps = taps.filter((t) => now - t < 1500); taps.push(now);
    if (taps.length >= 5) { e.preventDefault(); taps = []; const r = m.getBoundingClientRect(); flipNegative(r.left + r.width / 2, r.top + r.height / 2); }
    else if (page === "home") e.preventDefault();
  }));
  $$("[data-negative-toggle]").forEach((b) => b.addEventListener("click", (e) => flipNegative(e.clientX, e.clientY)));

  /* ---------------- expandable (pixel type) ---------------- */
  const mobileQ = matchMedia("(max-width: 767px)");
  $$(".xp-btn").forEach((btn) => {
    const box = document.getElementById(btn.getAttribute("aria-controls")); if (!box) return;
    const inner = $(".inner", box), cv = $(".xp-canvas", box), txt = $(".xp-txt", btn), ico = $$(".xp-ico i", btn);
    const force = box.classList.contains("xp-force");
    const folded = () => (force ? 96 : 150);
    const plus = [[6, 0], [6, 6], [6, 12], [0, 6], [12, 6]], minus = [[0, 6], [3, 6], [6, 6], [9, 6], [12, 6]];
    const setIco = (pts) => ico.forEach((i, k) => (i.style.transform = `translate(${pts[k][0]}px,${pts[k][1]}px)`));
    setIco(plus);
    if (force) { box.style.overflow = "hidden"; box.style.position = "relative"; box.style.height = folded() + "px"; box.style.webkitMaskImage = box.style.maskImage = "linear-gradient(to bottom,#000 55%,transparent)"; box.style.transition = "height .9s cubic-bezier(.16,1,.3,1)"; }
    function decode(to) {
      const chars = "▖▘▝▗▚▞█"; let f = 0;
      const it = setInterval(() => { f++; txt.textContent = to.split("").map((c, i) => (i < f / 2 ? c : c === " " ? " " : chars[(Math.random() * chars.length) | 0])).join(""); if (f / 2 >= to.length) { clearInterval(it); txt.textContent = to; } }, 28);
    }
    function pixels(open) {
      if (reduce) return Promise.resolve();
      const br = box.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      cv.style.display = "block"; cv.width = br.width * d; cv.height = inner.scrollHeight * d; cv.style.width = br.width + "px"; cv.style.height = inner.scrollHeight + "px";
      const ctx = cv.getContext("2d");
      // draw text lines into an offscreen canvas at their laid-out positions
      const off = document.createElement("canvas"); off.width = cv.width; off.height = cv.height; const o = off.getContext("2d");
      const tw = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT); const range = document.createRange(); let node;
      o.fillStyle = "#fff";
      while ((node = tw.nextNode())) {
        if (!node.textContent.trim()) continue;
        const cs = getComputedStyle(node.parentElement); o.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * d}px ${cs.fontFamily}`; o.textBaseline = "top";
        const words = node.textContent.split(/(\s+)/); let idx = 0;
        words.forEach((wd) => { if (wd.trim()) { range.setStart(node, idx); range.setEnd(node, idx + wd.length); const rr = range.getBoundingClientRect(); o.fillText(wd, (rr.left - br.left) * d, (rr.top - br.top + (rr.height - parseFloat(cs.fontSize)) / 2) * d); } idx += wd.length; });
      }
      const data = o.getImageData(0, 0, off.width, off.height).data;
      const P = [], st = 2 * d, fold = folded() * d;
      for (let y = 0; y < off.height; y += st) for (let x = 0; x < off.width; x += st) if (data[(y * off.width + x) * 4 + 3] > 120 && (open ? y > fold * 0.5 : true)) P.push([x, y]);
      while (P.length > 7000) P.splice((Math.random() * P.length) | 0, 1);
      const t0 = performance.now(), dur = 1100, H = off.height;
      const col = getComputedStyle(inner).color;
      return new Promise((res) => {
        const step = (now) => {
          const tt = (now - t0) / dur; ctx.clearRect(0, 0, cv.width, cv.height); ctx.fillStyle = col;
          P.forEach(([x, y]) => {
            const delay = (y / H) * 0.55; let k = clamp((tt - (open ? delay : 0.55 - delay)) / 0.45, 0, 1); k = 1 - Math.pow(1 - k, 3);
            const sx = x, sy = open ? fold : y;
            const ex = x, ey = open ? y : -40 * d;
            const px = open ? sx + (ex - sx) * k + Math.sin(y + x) * (1 - k) * 20 : x + Math.sin(x * 0.3) * k * 30;
            const py = open ? sy + (ey - sy) * k : y + (ey - y) * k;
            if (!open || k > 0) { ctx.globalAlpha = open ? 1 : 1 - k; ctx.fillRect(px, py, st, st); }
          });
          if (open) box.style.setProperty("--m", clamp(tt * 100 - 30, 0, 100) + "%");
          if (tt < 1.1) requestAnimationFrame(step); else { cv.style.display = "none"; ctx.clearRect(0, 0, cv.width, cv.height); res(); }
        };
        requestAnimationFrame(step);
      });
    }
    btn.addEventListener("click", async () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      decode(open ? "Read less" : "Read more"); setIco(open ? minus : plus);
      if (!force && !mobileQ.matches) return;
      if (open) {
        box.style.height = folded() + "px"; box.classList.add("open", "anim"); box.style.maskImage = box.style.webkitMaskImage = "none";
        requestAnimationFrame(() => (box.style.height = inner.scrollHeight + "px"));
        await pixels(true); box.classList.remove("anim"); box.style.height = "auto";
      } else {
        box.style.height = box.offsetHeight + "px"; inner.style.opacity = "0";
        await pixels(false); inner.style.opacity = "";
        box.classList.remove("open"); box.style.height = folded() + "px";
        if (force) box.style.maskImage = box.style.webkitMaskImage = "linear-gradient(to bottom,#000 55%,transparent)"; else box.style.maskImage = box.style.webkitMaskImage = "";
        if (!force) setTimeout(() => (box.style.height = ""), 900);
      }
    });
  });

  /* ---------------- counters ---------------- */
  function countUp(el) {
    const to = +el.dataset.counter, w = Math.max(2, String(to).length), t0 = performance.now(), dur = 1400;
    const st = (n) => { const p = clamp((n - t0) / dur, 0, 1); el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3)))).padStart(w, "0"); if (p < 1) requestAnimationFrame(st); };
    reduce ? (el.textContent = String(to).padStart(w, "0")) : requestAnimationFrame(st);
  }
  const cIO = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { countUp(en.target); cIO.unobserve(en.target); } }));
  onBoot.push(() => $$("[data-counter]").forEach((el) => cIO.observe(el)));
  $$("[data-replay-counter]").forEach((b) => b.addEventListener("click", () => $$("[data-counter]", b.parentElement).forEach(countUp)));
  $$("[data-replay]").forEach((b) => b.addEventListener("click", () => {
    const host = b.parentElement;
    const pix = $("[data-pix]", host); if (pix && pix.replay) pix.replay();
    $$("[data-split]", host).forEach((s) => { s.classList.remove("is-in"); void s.offsetWidth; setTimeout(() => s.classList.add("is-in"), 50); });
  }));

  /* ---------------- contact form ---------------- */
  const form = $("[data-contact-form]");
  if (form) {
    const ta = form.message, cnt = $("[data-count]", form);
    ta.addEventListener("input", () => (cnt.textContent = `${ta.value.length} / 1000 characters`));
    const check = (f) => { const el = form[f]; let ok = el.value.trim().length > 0; if (f === "email") ok = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(el.value.trim()); if (f === "message") ok = el.value.trim().length >= 10; el.closest(".field").classList.toggle("err", !ok); return ok; };
    ["name", "email", "message"].forEach((f) => form[f].addEventListener("blur", () => form[f].value && check(f)));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const ok = ["name", "email", "message"].map(check).every(Boolean);
      if (!ok) { form.querySelector(".err input, .err textarea").focus(); return; }
      const b = form.querySelector("[type=submit]"); const lbl = b.innerHTML; b.disabled = true; b.setAttribute("aria-busy", "true"); b.textContent = "Sending…";
      setTimeout(() => { b.disabled = false; b.removeAttribute("aria-busy"); b.innerHTML = lbl; form.classList.add("sent"); form.reset(); cnt.textContent = "0 / 1000 characters"; toast("Message queued — thank you!"); }, 1200);
    });
  }

  /* ---------------- back to top ---------------- */
  $$("[data-top]").forEach((b) => b.addEventListener("click", () => S.scrollTo(0)));

  /* ---------------- assistant tip ---------------- */
  const tip = $("[data-assist-tip]");
  if (tip) { if (store.get("kr-tip-hidden", false)) tip.classList.add("gone"); $("[data-assist-hide]").addEventListener("click", () => { tip.classList.add("gone"); store.set("kr-tip-hidden", true); }); }
  function closeChat() { window.Chat && window.Chat.close(); }

  /* ---------------- horizontal pinned projects ---------------- */
  const hpin = $("[data-hpin]"), track = $("[data-htrack]"), hbar = $("[data-hbar]");
  if (hpin && track) {
    const lg = matchMedia("(min-width: 1024px)");
    let dist = 0;
    const measure = () => {
      if (!lg.matches) { hpin.style.removeProperty("--pin-h"); track.style.transform = ""; dist = 0; return; }
      dist = track.scrollWidth - innerWidth; hpin.style.setProperty("--pin-h", dist + innerHeight + "px");
    };
    measure(); addEventListener("resize", measure); addEventListener("load", measure); document.fonts && document.fonts.ready.then(measure);
    const pars = $$("[data-par]", track);
    tickers.push(() => {
      if (!dist) return;
      const r = hpin.getBoundingClientRect(); const p = clamp(-r.top / dist, 0, 1);
      track.style.transform = `translate3d(${-p * dist}px,0,0)`;
      hbar && (hbar.style.transform = `scaleX(${p})`);
      pars.forEach((el) => { const b = el.parentElement.getBoundingClientRect(); const c = (b.left + b.width / 2 - innerWidth / 2) / innerWidth; el.style.transform = `translate3d(${-c * 6}%,0,0)`; });
    });
  }

  /* ---------------- journey ---------------- */
  const jr = $("[data-journey]");
  if (jr) {
    const km = $("[data-km]"), bar = $("[data-journey-bar]"); const total = 12495;
    tickers.push(() => {
      const r = jr.getBoundingClientRect();
      let p;
      if (innerWidth >= 1024) p = clamp(-r.top / (r.height - innerHeight), 0, 1);
      else p = clamp((innerHeight * 0.9 - r.top) / (r.height * 0.9), 0, 1);
      p = Math.pow(p, 0.9);
      if (window.FX) window.FX.journey.p = p;
      km.textContent = Math.round(total * p).toLocaleString("en").replace(/,/g, " ");
      bar.style.transform = `scaleX(${p})`;
    });
  }

  /* ---------------- projects index ---------------- */
  const list = $("[data-pi-list]");
  if (list) {
    const rows = $$(".pi-row[data-kw]", list), search = $("[data-pi-search]"), empty = $("[data-pi-empty]");
    let lang = "All";
    const apply = () => {
      const q = search.value.trim().toLowerCase(); let n = 0;
      rows.forEach((r) => { const ok = (lang === "All" || r.dataset.lang === lang) && (!q || r.dataset.kw.includes(q)); r.hidden = !ok; if (ok) n++; });
      empty.hidden = n > 0;
    };
    search.addEventListener("input", apply);
    $$("[data-pi-filters] button").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; $$("[data-pi-filters] button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); apply(); }));
    const pv = $("[data-pi-preview]"), pimg = $("img", pv);
    if (fine) {
      let x = 0, y = 0, tx = 0, ty = 0;
      rows.forEach((r) => {
        r.addEventListener("pointerenter", () => { if (r.dataset.preview) { pimg.src = r.dataset.preview; pv.classList.add("on"); } });
        r.addEventListener("pointerleave", () => pv.classList.remove("on"));
      });
      const mv = () => { tx = pointer.x + 24; ty = pointer.y - 120; x += (tx - x) * 0.15; y += (ty - y) * 0.15; pv.style.left = x + "px"; pv.style.top = y + "px"; requestAnimationFrame(mv); };
      requestAnimationFrame(mv);
    }
  }

  /* ---------------- legal TOC ---------------- */
  const toc = $$("[data-toc]");
  if (toc.length) tickers.push(() => { let cur = toc[0]; toc.forEach((a) => { const t = document.querySelector(a.getAttribute("href")); if (t && t.getBoundingClientRect().top < innerHeight * 0.35) cur = a; }); toc.forEach((a) => a.classList.toggle("on", a === cur)); });

  /* ---------------- CV print ---------------- */
  $$("[data-print]").forEach((b) => b.addEventListener("click", () => print()));
  if (page === "cv" && /print=1/.test(location.search)) onBoot.push(() => setTimeout(() => print(), 900));

  /* ---------------- effects ---------------- */
  window.FX && window.FX.init();
})();
