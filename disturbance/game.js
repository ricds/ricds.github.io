/* Forest Disturbance Game - plain JS, no build step.
   Data: CONTENT (texts, content.js), SITES (generated, sites_data.js via content.js), GAME_CONFIG (config.js). */
(function () {
  "use strict";
  const C = window.CONTENT;
  const SITES = C.sites;
  const CFG = window.GAME_CONFIG || {};
  // class sessions: the fixed ones from config.js plus the groups created on the page
  // ("Add group"), which live in the results service and are loaded at start-up
  let CLASSES = (CFG.classes || []).slice();
  const QS = new URLSearchParams(location.search);
  // ?review=1: instructor mode - arrow keys move between images without answering, the
  // answer can be shown at any time, nothing is sent; kept apart from a real game's storage
  const REVIEW = QS.get("review") === "1";
  const KEY = REVIEW ? "disturbanceGame.v2.review" : "disturbanceGame.v2";
  // a group's own link (?class=<id>) preselects that group on the start page
  const LINK_GROUP = QS.get("view") === "class" ? "" : (QS.get("class") || "");
  let PENDING_CV = null;  // class asked for on the class page before the groups have loaded
  const CLASS_IDS = C.classes.map((c) => c.id);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------- state ----------
  const fresh = () => ({ lang: "en", name: "", email: "", org: "", group: "", idx: 0, answers: [], sent: false, startedAt: null });
  const who = () => ({ lang: state.lang, name: state.name, email: state.email, org: state.org, group: state.group });
  let state = load() || fresh();
  let view = { mode: "swipe", band: "tc", after: "after", choice: null, x: 50, z: { s: 1, tx: 0, ty: 0 } };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      return s && Array.isArray(s.answers) ? s : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: play on */ }
  }

  // ---------- i18n ----------
  const tx = (o) => (o == null ? "" : typeof o === "string" ? o : o[state.lang] || o.en || "");
  const ui = (k) => tx(C.ui[k]) || k;
  const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
  const cls = (id) => C.classes.find((c) => c.id === id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const site = (id) => SITES.find((s) => s.id === id);
  const groupLabel = (id) => { const g = CLASSES.find((c) => c.id === id); return g ? tx(g.label) : id; };

  function applyLang() {
    document.documentElement.lang = state.lang === "pt" ? "pt-BR" : "en";
    $$(".lang button").forEach((b) => b.classList.toggle("on", b.dataset.lang === state.lang));
    $$("[data-i18n]").forEach((el) => { el.textContent = ui(el.dataset.i18n); });
    $("#btn-zoom-reset").title = $("#btn-zoom-reset").ariaLabel = ui("zoomReset");
    $("#review-link").href = "?review=1" + (state.lang === "pt" ? "&lang=pt" : "");
    $("#btn-resume").textContent = ui(state.answers.length >= SITES.length ? "seeResults" : "resume");
    document.title = ui("title");
    fillClassSelects();
    if (!$("#screen-quiz").classList.contains("hidden")) renderQuestion();
    if (!$("#modal").classList.contains("hidden") && answered()) renderFeedback(answered());
    if (!$("#screen-end").classList.contains("hidden")) renderEnd();
    if (!$("#screen-class").classList.contains("hidden") && classData) renderClass(classData);
  }

  function fillClassSelects() {
    const opts = (sel, withNone) => {
      const keep = sel.value;
      sel.innerHTML = (withNone ? `<option value="">${esc(ui("noClass"))}</option>` : "") +
        CLASSES.map((c) => `<option value="${esc(c.id)}">${esc(tx(c.label))}</option>`).join("");
      if (keep && Array.from(sel.options).some((o) => o.value === keep)) sel.value = keep;
    };
    opts($("#in-class"), true);
    opts($("#cv-class"), true);
    // default to "no class (just practising)"; a group link (?class=<id>) preselects its group
    const want = LINK_GROUP || state.group || "";
    $("#in-class").value = CLASSES.some((c) => c.id === want) ? want : "";
  }

  async function loadGroups() {
    if (!CFG.submitUrl) return;
    try {
      const r = await fetch(`${CFG.submitUrl}?action=groups`);
      const js = await r.json();
      if (!js.ok || !Array.isArray(js.groups)) return;
      const known = new Set(CLASSES.map((c) => c.id));
      // newest groups first, above the fixed ones
      const added = js.groups.filter((g) => g.id && !known.has(g.id)).map((g) => ({ id: g.id, label: g.label || g.id }));
      CLASSES = added.reverse().concat(CLASSES);
      fillClassSelects();
      if (!$("#screen-class").classList.contains("hidden") && PENDING_CV && $("#cv-class").value !== PENDING_CV) {
        $("#cv-class").value = PENDING_CV;
        loadClass();
      }
    } catch (e) { /* the fixed classes still work */ }
  }

  // ---------- screens ----------
  const SCREENS = ["#screen-start", "#screen-quiz", "#screen-end", "#screen-class"];
  function show(id) {
    SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
    window.scrollTo(0, 0);
  }

  function initStart() {
    $("#in-name").value = state.name || "";
    $("#in-email").value = state.email || "";
    $("#in-org").value = state.org || "";
    const inProgress = state.answers.length > 0 && state.answers.length < SITES.length;
    const done = state.answers.length >= SITES.length;
    $("#resume").classList.toggle("hidden", !(inProgress || done));
    $("#start-form").classList.toggle("hidden", inProgress || done);
    $("#btn-resume").textContent = ui(done ? "seeResults" : "resume");
    show("#screen-start");
  }

  $("#start-form").addEventListener("submit", () => {
    state = Object.assign(fresh(), {
      lang: state.lang, name: $("#in-name").value.trim(), email: $("#in-email").value.trim(),
      org: $("#in-org").value.trim(), group: $("#in-class").value, startedAt: new Date().toISOString(),
    });
    save();
    startQuiz();
  });
  $("#btn-resume").addEventListener("click", () => (state.answers.length >= SITES.length ? finish() : startQuiz()));
  $("#btn-restart").addEventListener("click", () => {
    state = Object.assign(fresh(), who());
    save();
    initStart();
  });

  // ---------- quiz ----------
  function startQuiz() {
    if (!REVIEW) state.idx = Math.min(state.answers.length, SITES.length - 1);
    resetQuestionView();
    show("#screen-quiz");
    renderQuestion();
  }

  function resetQuestionView() {
    view.choice = null; view.after = "after"; view.x = 50; view.z = { s: 1, tx: 0, ty: 0 };
    $$("#seg-after button").forEach((b) => b.classList.toggle("on", b.dataset.after === "after"));
  }

  function current() { return SITES[state.idx]; }
  function answered() { return state.answers.find((a) => a.id === current().id); }

  function renderQuestion() {
    const s = current();
    $("#q-count").textContent = fmt(ui("qCount"), { n: state.idx + 1, total: SITES.length });
    $("#q-bar").style.width = ((state.answers.length / SITES.length) * 100).toFixed(1) + "%";
    $("#q-score").textContent = fmt(ui("scoreSoFar"), { s: score(), n: state.answers.length });
    renderImages();
    renderLocation(s);
    renderChoices();
    const a = answered();
    $("#btn-sure").disabled = $("#btn-guess").disabled = !view.choice;
    $("#answer-btns").classList.toggle("hidden", !!a);
    $("#answer-hint").classList.toggle("hidden", !!a);
    $("#answered-row").classList.toggle("hidden", !a);
    $("#btn-next2").textContent = state.idx + 1 < SITES.length ? ui("next") : ui("finish");
    $("#hl-note").classList.toggle("hidden", !s.box);
    preload(SITES[state.idx + 1]);
  }

  function coordText(lat, lon) {
    const ns = lat >= 0 ? "N" : "S", ew = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
  }
  const coordCopy = (s) => `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`;

  function renderLocation(s) {
    $("#loc-coord").textContent = coordCopy(s);
    $("#loc-coord").title = coordText(s.lat, s.lon);
    $("#loc-country").textContent = tx(s.country) || "-";
    $("#loc-state").textContent = tx(s.state) || "-";
    $("#loc-muni").textContent = tx(s.municipality) || "-";
    $("#loc-forest").textContent = tx(s.forest_type) || "-";
    $("#btn-copy").textContent = ui("copy");
  }

  $("#btn-copy").addEventListener("click", async () => {
    const text = $("#loc-coord").textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const r = document.createRange();
      r.selectNodeContents($("#loc-coord"));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { document.execCommand("copy"); } catch (e2) { /* selected; user can copy */ }
    }
    $("#btn-copy").textContent = ui("copied");
    setTimeout(() => { $("#btn-copy").textContent = ui("copy"); }, 1500);
  });

  const imgPath = (s, which, band) => `img/${s.id}/${which}_${band}.jpg`;

  function renderImages() {
    const s = current();
    const after = view.after === "later" && s.dates.later ? "later" : "after";
    $("#img-a").src = imgPath(s, "before", view.band);
    $("#img-b").src = imgPath(s, after, view.band);
    $("#img-a").alt = ui("before") + " " + s.dates.before;
    $("#img-b").alt = ui(after === "later" ? "laterLbl" : "after") + " " + s.dates[after];
    $("#date-a").textContent = s.dates.before;
    $("#date-b").textContent = s.dates[after];
    $("#lbl-b").textContent = ui(after === "later" ? "laterLbl" : "after");
    $("#seg-after").classList.toggle("hidden", !s.dates.later);
    $$(".hl").forEach((h) => {
      h.classList.toggle("hidden", !s.box);
      if (s.box) {
        const [x0, y0, x1, y1] = s.box;
        Object.assign(h.style, { left: x0 * 100 + "%", top: y0 * 100 + "%", width: (x1 - x0) * 100 + "%", height: (y1 - y0) * 100 + "%" });
      }
    });
    const v = $("#viewer");
    v.className = "viewer mode-" + view.mode;
    v.style.setProperty("--x", view.x + "%");
    $("#viewer-hint").textContent = ui("hint_" + view.mode);
    applyZoom();
  }

  // ---------- zoom and pan (shared by both panes) ----------
  const ZMAX = 6;
  function paneSize() {
    const p = $(".pane-a").getBoundingClientRect();
    return { w: p.width, h: p.height, left: p.left, top: p.top };
  }
  function clampZoom() {
    const z = view.z;
    z.s = Math.max(1, Math.min(ZMAX, z.s));
    z.tx = Math.min(0, Math.max(1 - z.s, z.tx));
    z.ty = Math.min(0, Math.max(1 - z.s, z.ty));
  }
  function applyZoom() {
    clampZoom();
    const { w, h } = paneSize();
    const z = view.z;
    $$(".zoomwrap").forEach((el) => {
      el.style.transform = `translate(${z.tx * w}px, ${z.ty * h}px) scale(${z.s})`;
    });
    $("#viewer").style.setProperty("--hlw", (2 / z.s).toFixed(3) + "px");
    $("#viewer").classList.toggle("zoomed", z.s > 1.01);
    scaleBar();
  }
  // zoom by factor f keeping the image point under pane-relative (fx, fy) fixed
  function zoomAt(f, fx, fy) {
    const z = view.z;
    const s2 = Math.max(1, Math.min(ZMAX, z.s * f));
    const u = (fx - z.tx) / z.s, v = (fy - z.ty) / z.s;
    z.tx = fx - u * s2; z.ty = fy - v * s2; z.s = s2;
    applyZoom();
  }
  // pane-relative position of a client point (side mode: whichever pane it is over)
  function paneFrac(clientX, clientY) {
    const panes = $$(".pane").map((p) => p.getBoundingClientRect());
    const r = panes.find((b) => clientX >= b.left && clientX <= b.right) || panes[0];
    return [(clientX - r.left) / r.width, (clientY - r.top) / r.height];
  }

  $$("#seg-zoom button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.zoom === "reset") { view.z = { s: 1, tx: 0, ty: 0 }; applyZoom(); return; }
    zoomAt(b.dataset.zoom === "in" ? 1.5 : 1 / 1.5, 0.5, 0.5);
  }));

  function scaleBar() {
    const s = current();
    if (!s) return;
    const { w } = paneSize();
    if (!w) return;
    const pxPerKm = (w / s.size_km) * view.z.s;
    const km = [0.1, 0.2, 0.5, 1, 2].find((k) => k * pxPerKm >= 60) || 2;
    $("#scalebar span").style.width = Math.round(km * pxPerKm) + "px";
    $("#scalebar em").textContent = km >= 1 ? km + " km" : km * 1000 + " m";
  }

  function preload(s) {
    if (!s) return;
    ["before", "after"].forEach((w) => ["tc", "fc"].forEach((b) => { const i = new Image(); i.src = imgPath(s, w, b); }));
  }

  (function pointer() {
    const v = $("#viewer");
    const pts = new Map();
    let mode = null, last = null, pinch = null;
    const setX = (e) => {
      const r = v.getBoundingClientRect();
      view.x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      v.style.setProperty("--x", view.x + "%");
    };
    v.addEventListener("pointerdown", (e) => {
      v.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, e);
      if (pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: view.z.s };
        mode = "pinch";
        return;
      }
      const onHandle = e.target.closest("#handle");
      // swipe: the handle always moves the divider; elsewhere it pans once zoomed in
      if (view.mode === "swipe" && (onHandle || view.z.s <= 1.01)) { mode = "divider"; setX(e); }
      else if (view.z.s > 1.01) { mode = "pan"; last = paneFrac(e.clientX, e.clientY); }
      else mode = null;
    });
    v.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (mode === "divider") setX(e);
      else if (mode === "pan") {
        const p = paneFrac(e.clientX, e.clientY);
        view.z.tx += p[0] - last[0]; view.z.ty += p[1] - last[1];
        last = p; applyZoom();
      } else if (mode === "pinch" && pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const c = paneFrac((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        zoomAt((pinch.s * d / pinch.d) / view.z.s, c[0], c[1]);
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) mode = null;
    };
    ["pointerup", "pointercancel"].forEach((t) => v.addEventListener(t, end));
    v.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = paneFrac(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.25 : 1 / 1.25, p[0], p[1]);
    }, { passive: false });
    window.addEventListener("resize", applyZoom);
  })();

  function bindSeg(sel, key) {
    $$(sel + " button").forEach((b) => b.addEventListener("click", () => {
      view[key] = b.dataset[key];
      $$(sel + " button").forEach((x) => x.classList.toggle("on", x === b));
      renderImages();
    }));
  }
  bindSeg("#seg-mode", "mode");
  bindSeg("#seg-band", "band");
  bindSeg("#seg-after", "after");

  function renderChoices() {
    const a = answered();
    const box = $("#choices");
    box.innerHTML = "";
    C.classes.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.dataset.id = c.id;
      b.innerHTML = `<span class="key">${i + 1}</span><span>${esc(tx(c.name))}<small>${esc(tx(c.def))}</small></span>`;
      if (a) {
        b.disabled = true;
        if (c.id === a.answer) b.classList.add("right");
        if (c.id === a.choice && !a.correct) b.classList.add("wrong");
      } else if (c.id === view.choice) b.classList.add("sel");
      b.addEventListener("click", () => pick(c.id));
      box.appendChild(b);
    });
  }

  function pick(id) {
    if (answered()) return;
    view.choice = id;
    $$(".choice").forEach((b) => b.classList.toggle("sel", b.dataset.id === id));
    $("#btn-sure").disabled = $("#btn-guess").disabled = false;
  }

  // ---------- answer with confidence (two buttons, no default), then the feedback popup ----------
  function openModal() {
    $("#modal").classList.remove("hidden");
    document.body.classList.add("noscroll");
    $("#btn-next").focus();
  }
  function closeModal() {
    $("#modal").classList.add("hidden");
    document.body.classList.remove("noscroll");
  }

  $("#btn-sure").addEventListener("click", () => record(1));
  $("#btn-guess").addEventListener("click", () => record(0));

  function record(sure) {
    if (!view.choice || answered()) return;
    const s = current();
    const a = { id: s.id, answer: s.answer, choice: view.choice, correct: view.choice === s.answer, sure, at: new Date().toISOString() };
    state.answers.push(a);
    save();
    renderQuestion();
    renderFeedback(a);
    openModal();
  }

  function renderFeedback(a) {
    const s = site(a.id);
    const ans = cls(a.answer), ch = cls(a.choice);
    const v = $("#fb-verdict");
    v.className = "verdict " + (a.correct ? "ok" : "no");
    v.textContent = a.correct ? fmt(ui("right"), { cls: tx(ans.name) }) : fmt(ui("wrong"), { cls: tx(ans.name), choice: tx(ch.name) });
    const parts = [];
    if (!a.correct) {
      const pair = C.pairs[a.choice + ">" + a.answer];
      parts.push(`<p><span class="lbl">${esc(fmt(ui("whyNot"), { choice: tx(ch.name) }))}</span> ${esc(tx(pair || ch.trap))}</p>`);
    }
    parts.push(`<p><span class="lbl">${esc(fmt(ui("looksLike"), { cls: tx(ans.name) }))}</span> ${esc(tx(ans.clues))}</p>`);
    const st = C.siteText[s.id] || {};
    if (st.note) parts.push(`<p><span class="lbl">${esc(ui("thisSite"))}</span> ${esc(tx(st.note))}</p>`);
    $("#fb-body").innerHTML = parts.join("");
    $("#fb-place").textContent = tx(st.place) + " · " + coordText(s.lat, s.lon);
    $("#fb-gmaps").href = `https://www.google.com/maps/@?api=1&map_action=map&center=${s.lat},${s.lon}&zoom=14&basemap=satellite`;
    $("#btn-next").textContent = state.idx + 1 < SITES.length ? ui("next") : ui("finish");
    miniMap(s);
  }

  let map = null, marker = null;
  function miniMap(s) {
    if (!window.L) return;
    setTimeout(() => {
      if (!map) {
        map = L.map("minimap", { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 8 }).addTo(map);
        marker = L.circleMarker([s.lat, s.lon], { radius: 6, color: "#b85c2a", weight: 2, fillOpacity: 0.9 }).addTo(map);
      }
      map.invalidateSize();
      map.setView([s.lat, s.lon], 2);
      marker.setLatLng([s.lat, s.lon]);
    }, 60);
  }

  $("#btn-close").addEventListener("click", closeModal);
  $("#btn-show-fb").addEventListener("click", () => { if (answered()) { renderFeedback(answered()); openModal(); } });

  // review mode: jump to any image, answered or not
  function go(i) {
    if (i < 0 || i >= SITES.length) return;
    closeModal();
    state.idx = i;
    save();
    resetQuestionView();
    renderQuestion();
  }
  function showAnswer() {
    const s = current();
    renderFeedback(answered() || { id: s.id, answer: s.answer, choice: s.answer, correct: true });
    openModal();
  }
  if (REVIEW) {
    $("#review-bar").classList.remove("hidden");
    $("#rv-prev").addEventListener("click", () => go(state.idx - 1));
    $("#rv-next").addEventListener("click", () => go(state.idx + 1));
    $("#rv-answer").addEventListener("click", showAnswer);
  }

  function next() {
    if (REVIEW && !answered()) return go(state.idx + 1);
    if (!answered()) return;
    closeModal();
    if (state.idx + 1 >= SITES.length) return finish();
    state.idx += 1;
    save();
    resetQuestionView();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("#btn-next").addEventListener("click", next);
  $("#btn-next2").addEventListener("click", next);

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT"].includes(e.target.tagName)) return;
    if (!$("#modal-group").classList.contains("hidden")) { if (e.key === "Escape") closeAddGroup(); return; }
    const modalOpen = !$("#modal").classList.contains("hidden");
    if (e.key === "Escape" && modalOpen) return closeModal();
    if ($("#screen-quiz").classList.contains("hidden")) return;
    if (REVIEW && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      return go(state.idx + (e.key === "ArrowRight" ? 1 : -1));
    }
    if (REVIEW && (e.key === "a" || e.key === "A") && !modalOpen) return showAnswer();
    if (modalOpen) {
      if (e.key === "Enter") { e.preventDefault(); next(); }
      return;
    }
    const k = parseInt(e.key, 10);
    if (k >= 1 && k <= CLASS_IDS.length) pick(CLASS_IDS[k - 1]);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (!answered()) { if (view.choice) record(1); } else next();  // Enter = I'm sure
    } else if ((e.key === "g" || e.key === "G") && !answered() && view.choice) record(0);  // G = I'm guessing
  });

  // ---------- end ----------
  const score = () => state.answers.filter((a) => a.correct).length;

  function finish() {
    closeModal();
    show("#screen-end");
    renderEnd();
    if (REVIEW) $("#send-status").textContent = ui("reviewNoSend");
    else if (!state.sent) submit();
    else $("#send-status").textContent = ui("sentAlready");
  }

  function meter(label, ok, n) {
    return `<div class="meter"><span>${esc(label)}</span><div class="track"><div class="fill" style="width:${n ? (ok / n) * 100 : 0}%"></div></div><span>${ok}/${n}</span></div>`;
  }

  // rows = right answer, columns = what was picked; answers: [{answer, choice}]
  function matrixHtml(answers) {
    const used = C.classes.filter((c) => answers.some((a) => a.answer === c.id || a.choice === c.id));
    let h = `<tr><th>${esc(ui("rowsCols"))}</th>` + used.map((c) => `<th>${esc(tx(c.name))}</th>`).join("") + "</tr>";
    used.forEach((r) => {
      if (!answers.some((a) => a.answer === r.id)) return;
      h += `<tr><th>${esc(tx(r.name))}</th>` + used.map((c) => {
        const k = answers.filter((a) => a.answer === r.id && a.choice === c.id).length;
        return `<td class="${k ? (r.id === c.id ? "diag" : "off") : ""}">${k || ""}</td>`;
      }).join("") + "</tr>";
    });
    return h;
  }

  function renderEnd() {
    const sc = score(), n = state.answers.length;
    $("#end-score").textContent = fmt(ui("endScore"), { s: sc, n });
    const pct = n ? sc / n : 0;
    $("#end-msg").textContent = ui(pct >= 0.85 ? "msgHigh" : pct >= 0.6 ? "msgMid" : "msgLow");
    $("#by-class").innerHTML = C.classes.map((c) => {
      const rows = state.answers.filter((a) => a.answer === c.id);
      return rows.length ? meter(tx(c.name), rows.filter((a) => a.correct).length, rows.length) : "";
    }).join("");
    const grp = (v) => state.answers.filter((a) => a.sure === v);
    const line = (label, rows) => (rows.length ? meter(label, rows.filter((a) => a.correct).length, rows.length) : "");
    $("#calib").innerHTML = line(ui("sure"), grp(1)) + line(ui("guess"), grp(0)) + `<p class="small">${esc(ui("calibHelp"))}</p>`;
    $("#matrix").innerHTML = matrixHtml(state.answers);
    $("#review-list").innerHTML = state.answers.map((a) => {
      const st = C.siteText[a.id] || {};
      const res = a.correct ? `<span class="ok">✓</span>` : `<span class="no">✗</span>`;
      const pickTxt = a.correct ? esc(tx(cls(a.answer).name)) : `${esc(tx(cls(a.choice).name))} → ${esc(tx(cls(a.answer).name))}`;
      return `<li>${res} ${esc(tx(st.place))}: ${pickTxt}</li>`;
    }).join("");
  }

  function payload() {
    return {
      name: state.name, email: state.email, org: state.org || "", group: state.group,
      groupLabel: state.group ? groupLabel(state.group) : "",
      lang: state.lang, score: score(), total: state.answers.length,
      startedAt: state.startedAt, finishedAt: new Date().toISOString(),
      answers: state.answers.map((a, i) => {
        const s = site(a.id);
        return {
          n: i + 1, id: a.id, place: tx((C.siteText[a.id] || {}).place), lat: s.lat, lon: s.lon,
          answerId: a.answer, choiceId: a.choice,
          answer: tx(cls(a.answer).name), choice: tx(cls(a.choice).name), correct: a.correct, sure: !!a.sure,
        };
      }),
    };
  }

  async function submit() {
    const st = $("#send-status");
    if (!CFG.submitUrl) { st.textContent = ui("sendOff"); return; }
    st.textContent = ui("sending");
    try {
      // text/plain keeps this a "simple" request: no CORS preflight, which Apps Script cannot answer
      const r = await fetch(CFG.submitUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload()) });
      const js = await r.json().catch(() => ({}));
      if (!r.ok || js.ok === false) throw new Error(js.error || r.status);
      state.sent = true;
      save();
      st.textContent = js.note || fmt(ui("sentOk"), { email: state.email });
    } catch (e) {
      st.textContent = ui("sendFail");
    }
  }

  $("#btn-download").addEventListener("click", () => {
    const p = payload();
    const lines = [ui("title"), `${p.name} <${p.email}>`];
    if (p.org) lines.push(`${ui("org")}: ${p.org}`);
    if (p.group) lines.push(`${ui("classLbl")}: ${groupLabel(p.group)}`);
    lines.push(fmt(ui("endScore"), { s: p.score, n: p.total }), "");
    p.answers.forEach((a) => lines.push(
      `${a.n}. ${a.place} (${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}): ${a.correct ? "OK" : "X"}  ` +
      `${ui("yourAnswer")}: ${a.choice}  |  ${ui("rightAnswer")}: ${a.answer}  |  ${a.sure ? ui("sure") : ui("guess")}`));
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "disturbance_game_results.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $("#btn-again").addEventListener("click", () => {
    if (!confirm(ui("againConfirm"))) return;
    state = Object.assign(fresh(), who(), { startedAt: new Date().toISOString() });
    save();
    startQuiz();
  });

  // ---------- class results ----------
  let classData = null;
  let returnTo = "#screen-start";

  function openClassView(group) {
    returnTo = SCREENS.find((s) => !$(s).classList.contains("hidden")) || "#screen-start";
    if (returnTo === "#screen-class") returnTo = "#screen-start";
    show("#screen-class");
    $("#cv-class").value = group != null ? group : (CLASSES[0] ? CLASSES[0].id : "");
    PENDING_CV = group || null;
    loadClass();
  }

  // ---------- add a group (class session) from the page ----------
  // Low-key link under the start form; the popup warns that this creates a group for an
  // activity, and gives back the group's own link to share with its students.
  function openAddGroup() {
    $("#ag-step-form").classList.remove("hidden");
    $("#ag-step-done").classList.add("hidden");
    $("#ag-status").textContent = "";
    $("#ag-name").value = "";
    $("#ag-create").disabled = false;
    $("#modal-group").classList.remove("hidden");
    document.body.classList.add("noscroll");
    $("#ag-name").focus();
  }
  function closeAddGroup() {
    $("#modal-group").classList.add("hidden");
    document.body.classList.remove("noscroll");
  }
  const groupLink = (id) => `${location.origin}${location.pathname}?class=${encodeURIComponent(id)}${state.lang === "pt" ? "&lang=pt" : ""}`;

  $("#btn-add-group").addEventListener("click", openAddGroup);
  $("#ag-cancel").addEventListener("click", closeAddGroup);
  $("#ag-close").addEventListener("click", closeAddGroup);
  $("#ag-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#ag-link").textContent); } catch (e) { /* the link stays selectable */ }
    $("#ag-copy").textContent = ui("copied");
  });
  $("#ag-form").addEventListener("submit", async () => {
    const label = $("#ag-name").value.trim();
    if (label.length < 3) { $("#ag-status").textContent = ui("addGroupShort"); return; }
    if (!CFG.submitUrl) { $("#ag-status").textContent = ui("sendOff"); return; }
    $("#ag-create").disabled = true;
    $("#ag-status").textContent = ui("loading");
    try {
      const r = await fetch(CFG.submitUrl, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "addGroup", label }),
      });
      const js = await r.json();
      if (!js.ok || !js.group) throw new Error(js.error || "failed");
      const g = js.group;
      if (!CLASSES.some((c) => c.id === g.id)) CLASSES.unshift({ id: g.id, label: g.label });
      fillClassSelects();
      $("#in-class").value = g.id;
      $("#ag-done-msg").textContent = fmt(ui("addGroupDone"), { name: g.label });
      $("#ag-link").textContent = groupLink(g.id);
      $("#ag-copy").textContent = ui("copy");
      $("#ag-step-form").classList.add("hidden");
      $("#ag-step-done").classList.remove("hidden");
    } catch (e) {
      $("#ag-status").textContent = ui("addGroupFail");
      $("#ag-create").disabled = false;
    }
  });
  $("#btn-class-view").addEventListener("click", () => openClassView($("#in-class").value));
  $("#btn-start-class").addEventListener("click", () => openClassView($("#in-class").value));
  $("#btn-end-class").addEventListener("click", () => openClassView(state.group));
  // the address bar follows the class page, so it can be copied and shared as is
  function syncUrl() {
    const q = new URLSearchParams();
    if (!$("#screen-class").classList.contains("hidden")) {
      q.set("view", "class");
      q.set("class", $("#cv-class").value);
    }
    if (REVIEW) q.set("review", "1");
    if (QS.get("local") === "1") q.set("local", "1");
    if (state.lang === "pt") q.set("lang", "pt");
    const s = q.toString();
    try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "")); } catch (e) { /* file:// etc. */ }
  }

  $("#btn-cv-back").addEventListener("click", () => {
    setTimeout(syncUrl, 0);
    if (returnTo === "#screen-quiz") { show(returnTo); renderQuestion(); }
    else if (returnTo === "#screen-end") finish();
    else initStart();
  });
  $("#btn-cv-refresh").addEventListener("click", loadClass);
  $("#cv-class").addEventListener("change", loadClass);

  // while the class page is open and visible, re-read the results every 30 s (one small
  // request to the Sheet); a hidden tab or another screen stops it
  const REFRESH_MS = 30000;
  let refreshTimer = null;
  function autoRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if ($("#screen-class").classList.contains("hidden")) return clearInterval(refreshTimer);
      if (!document.hidden) loadClass(true);
    }, REFRESH_MS);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !$("#screen-class").classList.contains("hidden")) loadClass(true);
  });

  async function loadClass(quiet) {
    const group = $("#cv-class").value;
    const st = $("#cv-status");
    autoRefresh();
    syncUrl();
    if (quiet === true && classData && classData.group === group) {
      // background refresh: keep the current tables on screen until the new ones arrive
      try {
        const r = await fetch(`${CFG.submitUrl}?action=class&group=${encodeURIComponent(group)}`);
        const js = await r.json();
        if (js.ok && $("#cv-class").value === group) { classData = js; renderClass(js); }
      } catch (e) { /* keep showing the last good result */ }
      return;
    }
    $("#cv-body").classList.add("hidden");
    if (!CFG.submitUrl) { st.textContent = ui("sendOff"); return; }
    st.textContent = ui("loading");
    try {
      const r = await fetch(`${CFG.submitUrl}?action=class&group=${encodeURIComponent(group)}`);
      const js = await r.json();
      if (!js.ok) throw new Error(js.error);
      classData = js;
      renderClass(js);
    } catch (e) {
      st.textContent = ui("loadFail");
    }
  }

  // data: {group, rows: [{name, score, total, seconds, finishedAt, answers: [{id, answerId, choiceId, correct}]}]}
  function renderClass(data) {
    const rows = data.rows || [];
    const st = $("#cv-status");
    if (!rows.length) { st.textContent = ui("noResultsYet"); $("#cv-body").classList.add("hidden"); return; }
    st.textContent = fmt(ui("classUpdated"), { t: new Date().toLocaleTimeString() });
    $("#cv-body").classList.remove("hidden");
    const all = rows.flatMap((r) => (r.answers || []).map((a) => ({ id: a.id, answer: a.answerId, choice: a.choiceId, correct: a.correct })));
    const mean = rows.reduce((t, r) => t + r.score, 0) / rows.length;
    const best = Math.max(...rows.map((r) => r.score));
    const total = rows[0].total || SITES.length;
    $("#cv-stats").innerHTML = [
      [ui("statPlayers"), rows.length], [ui("statMean"), `${mean.toFixed(1)} / ${total}`], [ui("statBest"), `${best} / ${total}`],
    ].map(([k, v]) => `<div class="stat card"><span class="small">${esc(k)}</span><b>${esc(v)}</b></div>`).join("");

    const ranked = rows.slice().sort((a, b) => b.score - a.score || (a.seconds || 1e9) - (b.seconds || 1e9));
    const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "-");
    let rank = 0, prev = null;
    $("#cv-rank").innerHTML = `<tr><th>#</th><th>${esc(ui("nameCol"))}</th><th>${esc(ui("scoreCol"))}</th><th>${esc(ui("timeCol"))}</th></tr>` +
      ranked.map((r, i) => {
        if (prev === null || r.score !== prev) rank = i + 1;
        prev = r.score;
        const me = state.name && r.name === state.name ? ' class="me"' : "";
        return `<tr${me}><td>${rank}</td><td class="name">${esc(r.name)}</td><td>${r.score}/${r.total}</td><td>${mmss(r.seconds)}</td></tr>`;
      }).join("");

    $("#cv-byclass").innerHTML = C.classes.map((c) => {
      const xs = all.filter((a) => a.answer === c.id);
      return xs.length ? meter(tx(c.name), xs.filter((a) => a.correct).length, xs.length) : "";
    }).join("");

    const per = SITES.map((s, i) => {
      const xs = all.filter((a) => a.id === s.id);
      return { i, s, n: xs.length, ok: xs.filter((a) => a.correct).length, xs };
    }).filter((p) => p.n).sort((a, b) => a.ok / a.n - b.ok / b.n).slice(0, 8);
    $("#cv-hard").innerHTML = per.map((p) => {
      const wrong = {};
      p.xs.filter((a) => !a.correct).forEach((a) => { wrong[a.choice] = (wrong[a.choice] || 0) + 1; });
      const top = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
      const st2 = C.siteText[p.s.id] || {};
      return `<li><b>${esc(fmt(ui("imageN"), { n: p.i + 1 }))}</b> ${esc(tx(st2.place))} - ${esc(tx(cls(p.s.answer).name))}: ` +
        `${Math.round((p.ok / p.n) * 100)}% ${esc(ui("correctWord"))}` +
        (top ? ` (${esc(fmt(ui("mostPicked"), { cls: tx(cls(top[0]).name) }))})` : "") + "</li>";
    }).join("");
    $("#cv-matrix").innerHTML = matrixHtml(all);
  }

  $$(".lang button").forEach((b) => b.addEventListener("click", () => {
    state.lang = b.dataset.lang;
    save();
    applyLang();
    syncUrl();
  }));

  // ---------- boot ----------
  const qs = QS;
  if (qs.get("lang") === "pt" || qs.get("lang") === "en") state.lang = qs.get("lang");
  applyLang();
  if (qs.get("view") === "class") openClassView(qs.get("class") || qs.get("group") || state.group);
  else if (REVIEW) {
    state.name = state.name || "review";
    if (qs.get("img")) state.idx = Math.max(0, Math.min(SITES.length - 1, parseInt(qs.get("img"), 10) - 1 || 0));
    resetQuestionView();
    show("#screen-quiz");
    renderQuestion();
  } else initStart();
  loadGroups();
})();
