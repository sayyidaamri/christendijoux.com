/* chat.js — local assistant: normalisation + weighted-keyword intents. Nothing leaves the browser. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const panel = $("[data-chat]"); if (!panel) return;
  const body = $("[data-chat-body]"), form = $("[data-chat-form]"), sugg = $("[data-chat-sugg]"), input = form.q;
  const P = location.pathname.includes("/project/") ? "../" : "";
  const KB = [
    { id: "hello", k: { hi: 3, hello: 3, hey: 3, hei: 3, hola: 3, bonjour: 3, salut: 2 }, a: () => "Hi! I'm Kaspian's assistant. Ask me about his projects, his stack, his background or how to reach him." },
    { id: "who", k: { who: 2, kaspian: 2, about: 2, yourself: 2, background: 3, story: 2, bio: 3 }, a: () => "Kaspian Rowe is a systems & AI engineer based in Bergen, Norway, originally from Valparaíso, Chile. He builds internal software, AI copilots and automations at Halvorsen Marine, and web projects through Northloop Studio." },
    { id: "projects", k: { project: 3, projects: 3, work: 2, portfolio: 2, built: 2, case: 2, showcase: 2 }, a: () => `Highlights: <b>Halvorsen Marine</b> (internal platform + ERP copilot), <b>Tidewatch</b> (harbour sensor kit), <b>Ledgerly</b> (productivity SaaS) and <b>Fjordline Institute</b> (headless Next.js). See them all on the <a href="${P}projects.html">projects index</a>.` },
    { id: "ai", k: { ai: 3, llm: 3, rag: 3, agent: 3, agents: 3, openai: 2, gpt: 2, copilot: 2, machine: 1, learning: 1 }, a: () => "AI-wise: production RAG pipelines, conversational agents and an ERP copilot that answers plain-language questions — built with the OpenAI API, LangChain and vector databases, with sensitive data kept in-house." },
    { id: "stack", k: { stack: 3, tech: 3, technologies: 3, language: 2, languages: 2, react: 2, python: 2, typescript: 2, skills: 3, tools: 2 }, a: () => "Daily stack: React, Next.js, TypeScript, Python and Node.js. Cloud on Azure, Hetzner and Cloudflare. Automation with n8n and Power Automate. Observability with Grafana. 58 skills in total in the About section." },
    { id: "cloud", k: { cloud: 3, azure: 3, devops: 3, docker: 2, deploy: 2, monitoring: 2, grafana: 2, observability: 3 }, a: () => "He handles cloud architecture and DevOps: Azure App Services & Functions, Docker, GitHub Actions CI/CD, Cloudflare in front, and Grafana dashboards with alerting so systems are always watched." },
    { id: "hire", k: { hire: 3, available: 3, availability: 3, freelance: 3, job: 2, rate: 2, price: 2, cost: 2, work: 1, collaborate: 2, opportunity: 2 }, a: () => `He's open to new projects and collaborations, freelance via Northloop Studio. The fastest way: <a href="mailto:hello@kaspianrowe.dev">hello@kaspianrowe.dev</a> or the form in the <a href="${P}index.html#contact">contact section</a>.` },
    { id: "contact", k: { contact: 3, email: 3, mail: 3, phone: 3, call: 2, reach: 3, linkedin: 2, github: 2 }, a: () => `Email: <a href="mailto:hello@kaspianrowe.dev">hello@kaspianrowe.dev</a> · Phone: +47 552 01 884 · Based in Bergen (CET).` },
    { id: "where", k: { where: 3, location: 3, based: 3, bergen: 3, norway: 3, chile: 2, live: 2, city: 2 }, a: () => "Based in Bergen, Norway (60.39°N · 5.32°E). He grew up in Valparaíso, Chile — 12 495 km away as the crow flies." },
    { id: "cv", k: { cv: 3, resume: 3, experience: 4, education: 2, degree: 2, studies: 2 }, a: () => `Resume here: <a href="${P}cv.html">online CV</a> (printable as PDF). Current role: Systems & AI Engineer at Halvorsen Marine since Jan. 2026.` },
    { id: "lab", k: { lab: 3, effect: 2, effects: 2, shader: 3, webgl: 3, how: 1, animation: 2, site: 1 }, a: () => `This site is dissected in the <a href="${P}lab.html">Lab</a>: dither shader, split text, pixel images, the star hunt and four experiments.` },
    { id: "stars", k: { star: 3, stars: 3, secret: 3, easter: 3, egg: 2, game: 2, konami: 3 }, a: () => "Three stars are hidden around the site — find them to unlock a mini-game. And try ↑ ↑ ↓ ↓ ← → ← → B A somewhere… 😉" },
    { id: "thanks", k: { thanks: 3, thank: 3, cool: 2, great: 2, nice: 2, takk: 3, gracias: 3 }, a: () => "My pleasure! Anything else you'd like to know?" },
  ];
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  function answer(q) {
    const t = norm(q); let best = null, score = 0;
    KB.forEach((it) => { let s = 0; t.forEach((w) => { if (it.k[w]) s += it.k[w]; else if (w.length > 4) Object.keys(it.k).forEach((k) => { if (k.length > 4 && (w.startsWith(k) || k.startsWith(w))) s += it.k[k] * 0.5; }); }); if (s > score) { score = s; best = it; } });
    return score >= 2 ? best.a() : `I'm not sure about that one. Try asking about his <b>projects</b>, <b>stack</b>, <b>AI work</b> or <b>availability</b> — or write to <a href="mailto:hello@kaspianrowe.dev">hello@kaspianrowe.dev</a>.`;
  }
  function add(who, htmlText, reveal) {
    const m = document.createElement("div"); m.className = "msg " + who;
    const tm = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    m.innerHTML = `<span class="who">${who === "me" ? "You" : "KR-Bot"} — ${tm}</span><span class="tx">${htmlText}</span>`;
    if (reveal) m.classList.add("chat-reveal");
    body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function ask(q) {
    if (!q.trim()) return;
    add("me", esc(q));
    const typing = add("bot", `<span class="typing"><i></i><i></i><i></i></span>`);
    setTimeout(() => { typing.remove(); add("bot", answer(q), true); save(); }, 500 + Math.random() * 500);
  }
  const SUG = ["His projects", "His tech stack", "His experience", "AI work", "Availability", "Where is he based?"];
  sugg.innerHTML = SUG.map((s) => `<button type="button" class="chip">${s}</button>`).join("");
  sugg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.textContent); });
  form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value; input.value = ""; ask(q); });
  function save() { try { sessionStorage.setItem("kr-chat", body.innerHTML); } catch (e) {} }
  let greeted = false;
  try { const h = sessionStorage.getItem("kr-chat"); if (h) { body.innerHTML = h.replace(/chat-reveal/g, ""); greeted = true; } } catch (e) {}
  const openBtn = $("[data-chat-open]"), assist = $("[data-assist]");
  const Chat = (window.Chat = {
    open() { panel.classList.add("open"); panel.classList.remove("min"); assist.style.opacity = "0"; assist.style.pointerEvents = "none"; if (window.__scroll) window.__scroll.stopped = false; if (!greeted) { greeted = true; add("bot", "Hi! I'm Kaspian's assistant. Ask me about his projects, stack or availability.", true); save(); } setTimeout(() => input.focus(), 300); },
    close() { if (!panel.classList.contains("open")) return; panel.classList.remove("open"); assist.style.opacity = ""; assist.style.pointerEvents = ""; openBtn.focus({ preventScroll: true }); },
  });
  openBtn.addEventListener("click", Chat.open);
  $("[data-chat-close]").addEventListener("click", Chat.close);
  $("[data-chat-min]").addEventListener("click", () => panel.classList.toggle("min"));
  $("[data-chat-reset]").addEventListener("click", () => { body.innerHTML = ""; greeted = false; try { sessionStorage.removeItem("kr-chat"); } catch (e) {} Chat.open(); });
})();
